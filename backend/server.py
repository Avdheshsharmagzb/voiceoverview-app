from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

import os
import re
import html
import json
import uuid
import hmac
import asyncio
import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import jwt
import bcrypt
import feedparser
import trafilatura
from googlenewsdecoder import gnewsdecoder
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Request, Header
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict, EmailStr

from emergentintegrations.llm.chat import LlmChat, UserMessage

# ---------- Config ----------
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']
JWT_SECRET = os.environ['JWT_SECRET']
JWT_ALGORITHM = "HS256"
WEBHOOK_CRON_SECRET = os.environ['WEBHOOK_CRON_SECRET']

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ---------- Auth helpers ----------
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def create_access_token(user_id: str, email: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(days=7),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Not authenticated")
    token = auth_header[7:]
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        if payload.get("type") != "access":
            raise HTTPException(status_code=401, detail="Invalid token type")
        user = await db.users.find_one({"id": payload["sub"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")


# ---------- Models ----------
class RegisterInput(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    name: Optional[str] = "Admin"


class LoginInput(BaseModel):
    email: EmailStr
    password: str


class NewsItem(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    category: str = "सामान्य"
    source: str = "Manual Entry"
    source_url: Optional[str] = None
    image_url: Optional[str] = None
    original_title: str
    original_content: str = ""
    full_content: Optional[str] = None
    rewritten_title: Optional[str] = None
    rewritten_content: Optional[str] = None
    status: str = "Pending_Review"
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)
    published_at: Optional[str] = None


class NewsCreate(BaseModel):
    original_title: str
    original_content: str = ""
    category: Optional[str] = "सामान्य"
    source: Optional[str] = "Manual Entry"
    image_url: Optional[str] = None


class NewsEdit(BaseModel):
    rewritten_title: Optional[str] = None
    rewritten_content: Optional[str] = None
    category: Optional[str] = None
    image_url: Optional[str] = None


class RewriteInput(BaseModel):
    instructions: Optional[str] = None


# ---------- AI Rewrite ----------
REWRITE_SYSTEM_PROMPT = (
    "आप एक अनुभवी वरिष्ठ हिंदी समाचार संपादक हैं। आपका काम किसी भी भाषा में दिए गए कच्चे समाचार को "
    "आकर्षक, प्रभावशाली और सशक्त पत्रकारीय हिंदी (धारदार समाचार शैली) में पुनर्लेखित करना है।\n\n"
    "नियम:\n"
    "1. पूरा आउटपुट केवल शुद्ध हिंदी (देवनागरी) में हो।\n"
    "2. व्याकरण, वर्तनी और विराम चिह्न बिल्कुल त्रुटिरहित हों।\n"
    "3. शीर्षक आकर्षक, सशक्त और पाठक को बाँधने वाला हो, पर तथ्यपरक रहे।\n"
    "4. समाचार तटस्थ, वस्तुनिष्ठ और प्रवाहपूर्ण हो; कोई मनगढ़ंत तथ्य न जोड़ें।\n"
    "5. नाम, संख्याएं, स्थान और तथ्य मूल सामग्री के अनुसार रखें।\n"
    "6. आउटपुट केवल इस JSON प्रारूप में दें, कोई अतिरिक्त पाठ या मार्कडाउन नहीं:\n"
    '{"headline": "<आकर्षक शीर्षक>", "body": "<सुव्यवस्थित समाचार, पैराग्राफ में>"}'
)


def _parse_rewrite(raw: str) -> dict:
    text = raw.strip()
    text = re.sub(r"^```(?:json)?", "", text).strip()
    text = re.sub(r"```$", "", text).strip()
    try:
        data = json.loads(text)
        if isinstance(data, dict) and data.get("headline") and data.get("body"):
            return {"headline": str(data["headline"]).strip(), "body": str(data["body"]).strip()}
    except Exception:
        pass
    # fallback: first line as headline, rest body
    lines = [l for l in text.splitlines() if l.strip()]
    if lines:
        return {"headline": lines[0].strip(), "body": "\n\n".join(lines[1:]).strip() or lines[0].strip()}
    return {"headline": "समाचार", "body": text}


def _extract_full_article(source_url: str) -> Optional[str]:
    """Resolve a Google News link to the real publisher and extract the full article text."""
    if not source_url:
        return None
    real_url = source_url
    try:
        if "news.google.com" in source_url:
            res = gnewsdecoder(source_url, interval=1)
            if isinstance(res, dict) and res.get("decoded_url"):
                real_url = res["decoded_url"]
    except Exception as e:
        logger.warning("gnews decode failed: %s", e)
    try:
        html = trafilatura.fetch_url(real_url)
        if not html:
            return None
        text = trafilatura.extract(html, include_comments=False, include_tables=False)
        if text and len(text.strip()) >= 200:
            return text.strip()
    except Exception as e:
        logger.warning("article extract failed: %s", e)
    return None


async def fetch_full_article(source_url: str) -> Optional[str]:
    try:
        return await asyncio.wait_for(asyncio.to_thread(_extract_full_article, source_url), timeout=25)
    except Exception as e:
        logger.warning("full article fetch timeout/err: %s", e)
        return None


async def rewrite_to_hindi(title: str, content: str, instructions: Optional[str] = None) -> dict:
    extra = f"\n\nसंपादक के विशेष सुझाव (इनका अनिवार्य रूप से पालन करें): {instructions}" if instructions else ""
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"rewrite-{uuid.uuid4()}",
        system_message=REWRITE_SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-3-flash-preview")
    msg = UserMessage(
        text=f"मूल शीर्षक: {title}\n\nमूल सामग्री:\n{content or title}{extra}\n\n"
             f"उपरोक्त समाचार को आकर्षक पत्रकारीय हिंदी में पुनर्लेखित करें और केवल निर्दिष्ट JSON लौटाएं।"
    )
    response = await chat.send_message(msg)
    raw = response if isinstance(response, str) else str(response)
    return _parse_rewrite(raw)


# ---------- Auth routes ----------
@api_router.post("/auth/register")
async def register(payload: RegisterInput):
    email = payload.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="This email is already registered")
    user = {
        "id": str(uuid.uuid4()),
        "email": email,
        "password_hash": hash_password(payload.password),
        "name": payload.name or "Admin",
        "role": "admin",
        "created_at": now_iso(),
    }
    await db.users.insert_one(user)
    token = create_access_token(user["id"], email)
    return {"access_token": token, "user": {"id": user["id"], "email": email, "name": user["name"], "role": "admin"}}


@api_router.post("/auth/login")
async def login(payload: LoginInput):
    email = payload.email.lower()
    user = await db.users.find_one({"email": email})
    if not user or not verify_password(payload.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(user["id"], email)
    return {"access_token": token, "user": {"id": user["id"], "email": email, "name": user.get("name", "Admin"), "role": user.get("role", "admin")}}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user


# ---------- Public ----------
@api_router.get("/")
async def root():
    return {"message": "Samvad Editorial API"}


@api_router.get("/public/news", response_model=List[NewsItem])
async def public_news(category: Optional[str] = None):
    query = {"status": "Published"}
    if category and category != "ALL":
        query["category"] = category
    docs = await db.news_items.find(query, {"_id": 0}).sort("published_at", -1).to_list(500)
    return [NewsItem(**d) for d in docs]


# ---------- Admin news routes (protected) ----------
@api_router.get("/news", response_model=List[NewsItem])
async def list_news(status: Optional[str] = None, category: Optional[str] = None, user: dict = Depends(get_current_user)):
    query = {}
    if status and status != "ALL":
        query["status"] = status
    if category and category != "ALL":
        query["category"] = category
    docs = await db.news_items.find(query, {"_id": 0}).sort("created_at", -1).to_list(2000)
    return [NewsItem(**d) for d in docs]


@api_router.post("/news", response_model=NewsItem)
async def create_news(payload: NewsCreate, user: dict = Depends(get_current_user)):
    item = NewsItem(**payload.model_dump())
    await db.news_items.insert_one(item.model_dump())
    return item


@api_router.post("/news/{item_id}/approve-rewrite", response_model=NewsItem)
async def approve_rewrite(item_id: str, payload: RewriteInput = RewriteInput(), user: dict = Depends(get_current_user)):
    doc = await db.news_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="News item not found")
    item = NewsItem(**doc)
    if item.status not in ("Pending_Review", "Rewritten_Pending_Publish"):
        raise HTTPException(status_code=400, detail="Cannot rewrite a published item")
    # Pull the full article body from the source link (once) so the AI rewrites the whole story.
    if not item.full_content and item.source_url:
        full = await fetch_full_article(item.source_url)
        if full:
            item.full_content = full
            await db.news_items.update_one({"id": item_id}, {"$set": {"full_content": full}})
    source_text = item.full_content or item.original_content
    try:
        result = await rewrite_to_hindi(item.original_title, source_text, payload.instructions)
    except Exception as e:
        logger.exception("AI rewrite failed")
        raise HTTPException(status_code=502, detail=f"AI rewrite failed: {e}")
    item.rewritten_title = result["headline"]
    item.rewritten_content = result["body"]
    item.status = "Rewritten_Pending_Publish"
    item.updated_at = now_iso()
    await db.news_items.update_one({"id": item_id}, {"$set": {
        "rewritten_title": item.rewritten_title,
        "rewritten_content": item.rewritten_content,
        "status": item.status,
        "updated_at": item.updated_at,
    }})
    return item


@api_router.patch("/news/{item_id}", response_model=NewsItem)
async def edit_news(item_id: str, payload: NewsEdit, user: dict = Depends(get_current_user)):
    doc = await db.news_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="News item not found")
    updates = {k: v for k, v in payload.model_dump().items() if v is not None}
    if updates:
        updates["updated_at"] = now_iso()
        await db.news_items.update_one({"id": item_id}, {"$set": updates})
    doc.update(updates)
    return NewsItem(**doc)


@api_router.post("/news/{item_id}/publish", response_model=NewsItem)
async def publish_news(item_id: str, user: dict = Depends(get_current_user)):
    doc = await db.news_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="News item not found")
    item = NewsItem(**doc)
    if item.status != "Rewritten_Pending_Publish":
        raise HTTPException(status_code=400, detail="Only rewritten items can be published")
    item.status = "Published"
    item.published_at = now_iso()
    item.updated_at = item.published_at
    await db.news_items.update_one({"id": item_id}, {"$set": {
        "status": item.status, "published_at": item.published_at, "updated_at": item.updated_at,
    }})
    return item


@api_router.delete("/news/{item_id}")
async def delete_news(item_id: str, user: dict = Depends(get_current_user)):
    res = await db.news_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="News item not found")
    return {"deleted": True}


# ---------- RSS Fetch ----------
def gnews_url(query: str) -> str:
    from urllib.parse import quote
    return f"https://news.google.com/rss/search?q={quote(query)}&hl=hi&gl=IN&ceid=IN:hi"


CATEGORY_FEEDS = [
    ("राष्ट्रीय", "भारत समाचार", 8),
    ("दिल्ली", "दिल्ली समाचार", 6),
    ("दिल्ली हाई कोर्ट", "दिल्ली हाई कोर्ट फैसला निर्णय", 5),
    ("सुप्रीम कोर्ट", "सुप्रीम कोर्ट फैसला निर्णय", 5),
    ("गाजियाबाद", "गाजियाबाद समाचार प्रशासन", 18),
    ("नोएडा/ग्रेटर नोएडा", "नोएडा ग्रेटर नोएडा समाचार", 12),
    ("हापुड़/बुलंदशहर", "हापुड़ बुलंदशहर समाचार", 6),
    ("बागपत", "बागपत समाचार", 8),
    ("मेरठ", "मेरठ समाचार", 8),
    ("मुजफ्फरनगर", "मुजफ्फरनगर समाचार", 8),
    ("अर्थव्यवस्था", "अर्थव्यवस्था बिजनेस समाचार", 4),
    ("विदेश", "विदेश अंतरराष्ट्रीय समाचार", 4),
    ("खेल", "खेल समाचार", 4),
    ("सिनेमा", "बॉलीवुड सिनेमा समाचार", 4),
    ("टीवी", "टीवी मनोरंजन समाचार", 4),
    ("धर्म", "धर्म अध्यात्म समाचार", 4),
    ("महापुरुष", "महापुरुष प्रेरक जीवनी", 4),
    ("आयुर्वेद", "आयुर्वेद स्वास्थ्य", 4),
    ("योग", "योग समाचार", 4),
]

CATEGORIES = [c[0] for c in CATEGORY_FEEDS]


def _strip_html(raw: str) -> str:
    if not raw:
        return ""
    text = re.sub(r"<[^>]+>", " ", raw)
    text = html.unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def _fetch_one_feed(category: str, query: str, limit: int) -> list:
    out = []
    try:
        parsed = feedparser.parse(gnews_url(query))
        for entry in parsed.entries[:limit]:
            title = _strip_html(getattr(entry, "title", "")).strip()
            if not title:
                continue
            source = ""
            if getattr(entry, "source", None) and getattr(entry.source, "title", None):
                source = entry.source.title
            summary = _strip_html(getattr(entry, "summary", "")) or title
            out.append({
                "category": category,
                "source": source or "Google News",
                "source_url": getattr(entry, "link", None),
                "original_title": title,
                "original_content": summary,
            })
    except Exception as e:
        logger.warning("Feed fetch failed for %s: %s", category, e)
    return out


async def run_fetch() -> int:
    results = await asyncio.gather(*[
        asyncio.to_thread(_fetch_one_feed, cat, q, n) for cat, q, n in CATEGORY_FEEDS
    ])
    inserted = 0
    for group in results:
        for cand in group:
            if cand.get("source_url"):
                exists = await db.news_items.find_one({"source_url": cand["source_url"]}, {"_id": 1})
                if exists:
                    continue
            item = NewsItem(**cand)
            await db.news_items.insert_one(item.model_dump())
            inserted += 1
    logger.info("RSS fetch inserted %d new drafts", inserted)
    return inserted


@api_router.get("/categories")
async def get_categories():
    return {"categories": CATEGORIES}


@api_router.post("/news/fetch")
async def fetch_news(user: dict = Depends(get_current_user)):
    count = await run_fetch()
    return {"inserted": count}


# ---------- Cron ----------
# Cron endpoints must ack 2xx immediately; enqueue/background the actual work.
@api_router.post("/cron/fetch-news")
async def cron_fetch_news(request: Request, authorization: str = Header(default="")):
    if not authorization.startswith("Bearer ") or not hmac.compare_digest(authorization[7:], WEBHOOK_CRON_SECRET):
        raise HTTPException(status_code=401, detail="Unauthorized")
    run_id = request.headers.get("X-Webhook-Id")
    if run_id:
        if await db.cron_runs.find_one({"run_id": run_id}):
            return {"status": "duplicate"}
        await db.cron_runs.insert_one({"run_id": run_id, "at": now_iso()})
    asyncio.create_task(run_fetch())
    return {"status": "accepted"}


# ---------- Seed & startup ----------
SEED_ITEMS = [
    {
        "category": "राष्ट्रीय",
        "source": "Metro Times",
        "original_title": "City council approves new metro line to ease traffic congestion",
        "original_content": (
            "The city council on Tuesday approved a proposal to build a new 24-kilometre metro line connecting "
            "the eastern suburbs to the central business district. Officials said the 4,200 crore rupee project "
            "is expected to serve nearly 600,000 commuters daily and cut average commute times by up to 40 minutes."
        ),
        "status": "Pending_Review",
    },
    {
        "category": "गाजियाबाद",
        "source": "AgriWire",
        "original_title": "Monsoon arrives early, farmers welcome timely rains",
        "original_content": (
            "The southwest monsoon reached the region nearly a week ahead of schedule, bringing widespread "
            "rainfall ideal for the sowing season. Reservoirs have reached 65 percent capacity, easing "
            "irrigation concerns as farmers begin planting rice and pulses earlier than usual."
        ),
        "status": "Pending_Review",
    },
    {
        "category": "धर्म",
        "source": "Culture Beat",
        "original_title": "State museum unveils rare collection of ancient manuscripts",
        "original_content": (
            "The state museum unveiled a restored collection of more than 200 ancient manuscripts, some over 800 "
            "years old, covering astronomy to medicine. The exhibition will be open to the public for three months."
        ),
        "status": "Rewritten_Pending_Publish",
        "rewritten_title": "राज्य संग्रहालय में सजा 800 साल पुरानी दुर्लभ पांडुलिपियों का अनमोल खजाना",
        "rewritten_content": (
            "राज्य संग्रहालय ने सोमवार को 200 से अधिक संरक्षित प्राचीन पांडुलिपियों का दुर्लभ संग्रह जनता के सामने "
            "प्रस्तुत किया, जिनमें से कुछ 800 वर्ष से भी अधिक पुरानी हैं। ताड़पत्र और हस्तनिर्मित कागज़ पर लिखी ये "
            "पांडुलिपियाँ खगोल विज्ञान से लेकर चिकित्सा तक के विषयों को समेटे हुए हैं। यह प्रदर्शनी आगामी तीन महीनों "
            "तक आम जनता के लिए खुली रहेगी।"
        ),
    },
    {
        "category": "अर्थव्यवस्था",
        "source": "Aviation Now",
        "original_title": "Regional airport records highest passenger footfall in a decade",
        "original_content": (
            "The regional airport handled over 1.2 million travellers last month, its highest footfall in a decade, "
            "driven by new domestic routes and tourism. A second terminal is under construction to handle growing demand."
        ),
        "status": "Published",
        "rewritten_title": "एक दशक का रिकॉर्ड: क्षेत्रीय हवाई अड्डे पर उमड़ा यात्रियों का सैलाब",
        "rewritten_content": (
            "क्षेत्रीय हवाई अड्डे ने पिछले महीने एक दशक में सबसे अधिक यात्री आवाजाही दर्ज की, जहाँ 12 लाख से अधिक "
            "यात्रियों की आवाजाही हुई। प्रशासन ने इस उछाल का श्रेय नई घरेलू उड़ान सेवाओं और बढ़ते पर्यटन को दिया। "
            "बढ़ती माँग को देखते हुए दूसरे टर्मिनल का विस्तार कार्य तेज़ी से जारी है।"
        ),
        "published_at": now_iso(),
    },
]


async def seed_admin():
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@samvad.news").lower()
    admin_password = os.environ.get("ADMIN_PASSWORD", "admin123")
    existing = await db.users.find_one({"email": admin_email})
    if existing is None:
        await db.users.insert_one({
            "id": str(uuid.uuid4()), "email": admin_email,
            "password_hash": hash_password(admin_password), "name": "Admin",
            "role": "admin", "created_at": now_iso(),
        })
        logger.info("Seeded admin user %s", admin_email)
    elif not verify_password(admin_password, existing["password_hash"]):
        await db.users.update_one({"email": admin_email}, {"$set": {"password_hash": hash_password(admin_password)}})


@app.on_event("startup")
async def startup():
    await db.users.create_index("email", unique=True)
    await db.news_items.create_index("source_url")
    await seed_admin()
    if await db.news_items.count_documents({}) == 0:
        for s in SEED_ITEMS:
            await db.news_items.insert_one(NewsItem(**s).model_dump())
        logger.info("Seeded %d sample news items", len(SEED_ITEMS))


app.include_router(api_router)
app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
