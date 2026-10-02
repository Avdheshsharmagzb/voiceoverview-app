"""Backend tests for Samvad Editorial API - auth, public feed, protected routes, cron."""
import os
import re
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")

API = f"{BASE_URL}/api"
WEBHOOK_CRON_SECRET = None
with open("/app/backend/.env") as f:
    for line in f:
        if line.startswith("WEBHOOK_CRON_SECRET="):
            WEBHOOK_CRON_SECRET = line.split("=", 1)[1].strip().strip('"')

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")
ADMIN_EMAIL = "admin@samvad.news"
ADMIN_PASSWORD = "admin123"


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


@pytest.fixture(scope="module")
def token(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200, r.text
    data = r.json()
    assert "access_token" in data
    assert data["user"]["email"] == ADMIN_EMAIL
    return data["access_token"]


@pytest.fixture(scope="module")
def auth_headers(token):
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}


# ---------- Auth ----------
def test_login_success(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["user"]["role"] == "admin"


def test_login_invalid(session):
    r = session.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
    assert r.status_code == 401


def test_me_requires_token(session):
    r = session.get(f"{API}/auth/me")
    assert r.status_code == 401


def test_me_with_token(session, auth_headers):
    r = session.get(f"{API}/auth/me", headers=auth_headers)
    assert r.status_code == 200
    assert r.json()["email"] == ADMIN_EMAIL


def test_register_new_admin(session):
    import uuid
    email = f"test_{uuid.uuid4().hex[:8]}@samvad.news"
    r = session.post(f"{API}/auth/register", json={"email": email, "password": "secret123", "name": "T"})
    assert r.status_code == 200
    body = r.json()
    assert body["access_token"]
    assert body["user"]["email"] == email
    # duplicate
    r2 = session.post(f"{API}/auth/register", json={"email": email, "password": "secret123"})
    assert r2.status_code == 400


# ---------- 401 protection ----------
@pytest.mark.parametrize("method,path", [
    ("GET", "/news"),
    ("POST", "/news"),
    ("PATCH", "/news/fake-id"),
    ("DELETE", "/news/fake-id"),
    ("POST", "/news/fake-id/approve-rewrite"),
    ("POST", "/news/fake-id/publish"),
    ("POST", "/news/fetch"),
])
def test_protected_requires_auth(session, method, path):
    r = session.request(method, f"{API}{path}", json={})
    assert r.status_code == 401, f"{method} {path} returned {r.status_code}"


# ---------- Public ----------
def test_public_news_open(session):
    r = session.get(f"{API}/public/news")
    assert r.status_code == 200
    items = r.json()
    assert isinstance(items, list)
    for i in items:
        assert i["status"] == "Published"
        assert "_id" not in i


def test_categories_open(session):
    r = session.get(f"{API}/categories")
    assert r.status_code == 200
    assert isinstance(r.json()["categories"], list)
    assert len(r.json()["categories"]) > 0


# ---------- CRUD authenticated ----------
def test_list_news_authenticated(session, auth_headers):
    r = session.get(f"{API}/news", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list)
    assert all("_id" not in i for i in data)


def test_create_edit_delete(session, auth_headers):
    payload = {"original_title": "TEST_ create edit delete", "original_content": "some content here",
               "category": "राष्ट्रीय", "source": "TEST_Wire"}
    r = session.post(f"{API}/news", json=payload, headers=auth_headers)
    assert r.status_code == 200
    created = r.json()
    item_id = created["id"]
    assert created["original_title"] == payload["original_title"]
    assert created["status"] == "Pending_Review"

    # edit
    edit = {"rewritten_title": "संपादित शीर्षक", "rewritten_content": "संपादित मूल पाठ"}
    r2 = session.patch(f"{API}/news/{item_id}", json=edit, headers=auth_headers)
    assert r2.status_code == 200
    assert r2.json()["rewritten_title"] == "संपादित शीर्षक"

    # delete
    r3 = session.delete(f"{API}/news/{item_id}", headers=auth_headers)
    assert r3.status_code == 200
    r4 = session.delete(f"{API}/news/{item_id}", headers=auth_headers)
    assert r4.status_code == 404


def test_publish_rejects_pending(session, auth_headers):
    payload = {"original_title": "TEST_publish_reject", "original_content": "x"}
    created = session.post(f"{API}/news", json=payload, headers=auth_headers).json()
    try:
        r = session.post(f"{API}/news/{created['id']}/publish", headers=auth_headers)
        assert r.status_code == 400
    finally:
        session.delete(f"{API}/news/{created['id']}", headers=auth_headers)


# ---------- Cron ----------
def test_cron_requires_secret(session):
    r = session.post(f"{API}/cron/fetch-news")
    assert r.status_code == 401
    r2 = session.post(f"{API}/cron/fetch-news", headers={"Authorization": "Bearer wrong"})
    assert r2.status_code == 401


def test_cron_with_secret(session):
    assert WEBHOOK_CRON_SECRET
    r = session.post(f"{API}/cron/fetch-news", headers={"Authorization": f"Bearer {WEBHOOK_CRON_SECRET}"})
    assert r.status_code == 200
    assert r.json()["status"] in ("accepted", "duplicate")


# ---------- Approve rewrite with instructions ----------
def test_approve_rewrite_with_instructions(session, auth_headers):
    payload = {"original_title": "TEST_ Local park inauguration draws crowds",
               "original_content": "The new city park was inaugurated on Sunday morning. Over 2,000 residents attended.",
               "category": "राष्ट्रीय"}
    created = session.post(f"{API}/news", json=payload, headers=auth_headers).json()
    try:
        r = session.post(f"{API}/news/{created['id']}/approve-rewrite",
                         json={"instructions": "छोटे वाक्यों में लिखें"},
                         headers=auth_headers, timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "Rewritten_Pending_Publish"
        assert data["rewritten_title"] and DEVANAGARI_RE.search(data["rewritten_title"])
        assert data["rewritten_content"] and DEVANAGARI_RE.search(data["rewritten_content"])

        # publish
        pr = session.post(f"{API}/news/{created['id']}/publish", headers=auth_headers)
        assert pr.status_code == 200
        assert pr.json()["status"] == "Published"
        assert pr.json()["published_at"]

        # appears on public feed
        pub = session.get(f"{API}/public/news").json()
        assert created['id'] in [i['id'] for i in pub]
    finally:
        session.delete(f"{API}/news/{created['id']}", headers=auth_headers)



# ---------- Fetch Config (Scheduler) ----------
def test_fetch_config_get(session, auth_headers):
    r = session.get(f"{API}/fetch-config", headers=auth_headers)
    assert r.status_code == 200
    cfg = r.json()["config"]
    assert isinstance(cfg, list)
    assert len(cfg) == 19, f"expected 19 categories, got {len(cfg)}"
    for row in cfg:
        assert set(row.keys()) >= {"category", "query", "count", "enabled"}
        assert isinstance(row["enabled"], bool)
        assert isinstance(row["count"], int)


def test_fetch_config_requires_auth(session):
    assert session.get(f"{API}/fetch-config").status_code == 401
    assert session.put(f"{API}/fetch-config", json={"config": []}).status_code == 401


def test_fetch_config_put_persists_and_clamps(session, auth_headers):
    original = session.get(f"{API}/fetch-config", headers=auth_headers).json()["config"]
    try:
        modified = [dict(c) for c in original]
        modified[0]["enabled"] = False
        modified[0]["count"] = 100  # clamp to 50
        modified[1]["count"] = -5   # clamp to 0
        modified[2]["query"] = "TEST_scheduler_query"

        put = session.put(f"{API}/fetch-config", json={"config": modified}, headers=auth_headers)
        assert put.status_code == 200
        saved = put.json()["config"]
        assert saved[0]["enabled"] is False
        assert saved[0]["count"] == 50
        assert saved[1]["count"] == 0
        assert saved[2]["query"] == "TEST_scheduler_query"

        got = session.get(f"{API}/fetch-config", headers=auth_headers).json()["config"]
        assert got[0]["enabled"] is False
        assert got[0]["count"] == 50
        assert got[1]["count"] == 0
        assert got[2]["query"] == "TEST_scheduler_query"
    finally:
        session.put(f"{API}/fetch-config", json={"config": original}, headers=auth_headers)


# ---------- Image / resolved url on approve-rewrite ----------
def test_approve_rewrite_enriches_pending_with_source_url(session, auth_headers):
    items = session.get(f"{API}/news", headers=auth_headers).json()
    candidate = next(
        (i for i in items if i.get("status") == "Pending_Review" and i.get("source_url")
         and not i.get("full_content")),
        None,
    )
    if not candidate:
        pytest.skip("No eligible Pending_Review item with source_url available")
    rid = candidate["id"]
    r = session.post(f"{API}/news/{rid}/approve-rewrite", headers=auth_headers, timeout=120)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "Rewritten_Pending_Publish"
    assert data["rewritten_title"] and DEVANAGARI_RE.search(data["rewritten_title"])
    enriched_any = bool(data.get("full_content")) or bool(data.get("image_url")) or bool(data.get("resolved_url"))
    assert enriched_any, "Expected enrichment (full_content/image_url/resolved_url) to populate"



# ---------- Image hosting / Backfill / Dedupe (Phase 4) ----------
def test_backfill_requires_auth(session):
    r = session.post(f"{API}/news/backfill")
    assert r.status_code == 401


def test_dedupe_requires_auth(session):
    r = session.post(f"{API}/news/dedupe")
    assert r.status_code == 401


def test_backfill_returns_queued(session, auth_headers):
    r = session.post(f"{API}/news/backfill", headers=auth_headers, timeout=30)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "queued" in data
    assert isinstance(data["queued"], int)
    assert data["queued"] >= 0


def test_dedupe_removes_near_duplicates_and_preserves_published(session, auth_headers):
    # Snapshot published ids before
    before = session.get(f"{API}/news", headers=auth_headers).json()
    pub_ids_before = {i["id"] for i in before if i.get("status") == "Published"}
    r = session.post(f"{API}/news/dedupe", headers=auth_headers, timeout=60)
    assert r.status_code == 200, r.text
    data = r.json()
    assert "removed" in data
    assert isinstance(data["removed"], int)
    assert data["removed"] >= 0
    # verify no published rows were deleted
    after = session.get(f"{API}/news", headers=auth_headers).json()
    pub_ids_after = {i["id"] for i in after if i.get("status") == "Published"}
    assert pub_ids_before.issubset(pub_ids_after), "Published items were deleted by dedupe"


def test_hosted_image_served_publicly(session, auth_headers):
    """Find any item whose image_url is a hosted /api/images/ path and fetch it publicly."""
    items = session.get(f"{API}/news", headers=auth_headers).json()
    hosted = [i for i in items if (i.get("image_url") or "").startswith("/api/images/")]
    if not hosted:
        # try a public feed as well
        pub = session.get(f"{API}/public/news").json()
        hosted = [i for i in pub if (i.get("image_url") or "").startswith("/api/images/")]
    if not hosted:
        pytest.skip("No hosted /api/images/ URL available yet")
    url = BASE_URL + hosted[0]["image_url"]
    # no auth
    fresh = requests.Session()
    r = fresh.get(url, timeout=30)
    assert r.status_code == 200, f"{url} -> {r.status_code}"
    assert r.headers.get("content-type", "").startswith("image/"), r.headers.get("content-type")
    assert len(r.content) > 100


def test_images_404_for_missing(session):
    r = session.get(f"{API}/images/does-not-exist/foo.webp", timeout=30)
    assert r.status_code == 404


def test_approve_rewrite_hosts_image_internally(session, auth_headers):
    """Approve-rewrite on a Pending_Review with source_url should populate image_url starting with /api/images/."""
    items = session.get(f"{API}/news", headers=auth_headers).json()
    candidate = next(
        (i for i in items if i.get("status") == "Pending_Review" and i.get("source_url")),
        None,
    )
    if not candidate:
        pytest.skip("No eligible Pending_Review with source_url")
    rid = candidate["id"]
    r = session.post(f"{API}/news/{rid}/approve-rewrite", headers=auth_headers, timeout=180)
    assert r.status_code == 200, r.text
    data = r.json()
    assert data["status"] == "Rewritten_Pending_Publish"
    # Image may be absent if og:image fetch failed; but when present must be hosted
    if data.get("image_url"):
        assert data["image_url"].startswith("/api/images/"), f"non-hosted image_url: {data['image_url']}"
        # verify fetchable
        img = requests.get(BASE_URL + data["image_url"], timeout=30)
        assert img.status_code == 200
        assert img.headers.get("content-type", "").startswith("image/")
    # resolved_url and/or full_content should also typically be set
    assert data.get("full_content") or data.get("resolved_url"), "Expected enrichment to set full_content or resolved_url"
