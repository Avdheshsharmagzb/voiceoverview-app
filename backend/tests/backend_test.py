"""Backend tests for Samvad Editorial API - news CRUD + AI rewrite + publish flow."""
import os
import re
import time
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    # fallback to frontend/.env
    with open("/app/frontend/.env") as f:
        for line in f:
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip().rstrip("/")
API = f"{BASE_URL}/api"

DEVANAGARI_RE = re.compile(r"[\u0900-\u097F]")


@pytest.fixture(scope="module")
def session():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ---------- Basic health & seed ----------
def test_root(session):
    r = session.get(f"{API}/")
    assert r.status_code == 200
    assert "message" in r.json()


def test_list_news_has_seeded_statuses(session):
    r = session.get(f"{API}/news")
    assert r.status_code == 200
    data = r.json()
    assert isinstance(data, list) and len(data) >= 5
    statuses = {i["status"] for i in data}
    assert {"Pending_Review", "Rewritten_Pending_Publish", "Published"}.issubset(statuses)
    # ensure no mongo _id leaks
    assert all("_id" not in i for i in data)


def test_list_news_status_filter(session):
    r = session.get(f"{API}/news", params={"status": "Published"})
    assert r.status_code == 200
    for i in r.json():
        assert i["status"] == "Published"


# ---------- CRUD ----------
def test_create_news_and_persist(session):
    payload = {
        "title": "TEST_ Item to create",
        "source": "TEST_Wire",
        "original_content": "This is a test article about testing content persistence in the news system."
    }
    r = session.post(f"{API}/news", json=payload)
    assert r.status_code == 200
    created = r.json()
    assert created["title"] == payload["title"]
    assert created["status"] == "Pending_Review"
    assert created["source"] == "TEST_Wire"
    assert "id" in created

    # verify via list
    r2 = session.get(f"{API}/news")
    ids = [i["id"] for i in r2.json()]
    assert created["id"] in ids
    # cleanup
    session.delete(f"{API}/news/{created['id']}")


def test_delete_news(session):
    payload = {"title": "TEST_delete", "original_content": "content to delete"}
    r = session.post(f"{API}/news", json=payload)
    item_id = r.json()["id"]
    d = session.delete(f"{API}/news/{item_id}")
    assert d.status_code == 200
    # deleting again -> 404
    d2 = session.delete(f"{API}/news/{item_id}")
    assert d2.status_code == 404


# ---------- Approve rewrite (AI) ----------
def test_approve_rewrite_pending_item(session):
    payload = {
        "title": "TEST_ Local park inauguration draws crowds",
        "source": "TEST_Wire",
        "original_content": (
            "The new city park was inaugurated on Sunday morning by the mayor. "
            "Over 2,000 residents attended the event, which featured tree plantation drives, "
            "cultural performances, and free food stalls for visiting families."
        ),
    }
    created = session.post(f"{API}/news", json=payload).json()
    item_id = created["id"]
    try:
        r = session.post(f"{API}/news/{item_id}/approve-rewrite", timeout=90)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data["status"] == "Rewritten_Pending_Publish"
        assert data["rewritten_content"] and len(data["rewritten_content"]) > 20
        # must contain devanagari characters
        assert DEVANAGARI_RE.search(data["rewritten_content"]), "rewritten_content is not in Hindi (Devanagari)"

        # rejecting second approve
        r2 = session.post(f"{API}/news/{item_id}/approve-rewrite")
        assert r2.status_code == 400
    finally:
        session.delete(f"{API}/news/{item_id}")


def test_approve_rewrite_not_found(session):
    r = session.post(f"{API}/news/does-not-exist-id/approve-rewrite")
    assert r.status_code == 404


# ---------- Publish flow ----------
def test_publish_flow(session):
    # find an existing rewritten item from seed
    lst = session.get(f"{API}/news").json()
    rewritten = [i for i in lst if i["status"] == "Rewritten_Pending_Publish"]
    if not rewritten:
        pytest.skip("No rewritten item to publish")
    item_id = rewritten[0]["id"]
    r = session.post(f"{API}/news/{item_id}/publish")
    assert r.status_code == 200
    assert r.json()["status"] == "Published"
    # publishing again should fail with 400
    r2 = session.post(f"{API}/news/{item_id}/publish")
    assert r2.status_code == 400


def test_publish_rejects_pending(session):
    payload = {"title": "TEST_publish_reject", "original_content": "content should not be publishable directly"}
    created = session.post(f"{API}/news", json=payload).json()
    try:
        r = session.post(f"{API}/news/{created['id']}/publish")
        assert r.status_code == 400
    finally:
        session.delete(f"{API}/news/{created['id']}")
