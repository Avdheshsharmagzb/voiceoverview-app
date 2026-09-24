from fastapi import FastAPI, APIRouter, HTTPException
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
from pathlib import Path
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional, Annotated
import uuid
from datetime import datetime, timezone

from emergentintegrations.llm.chat import LlmChat, UserMessage


ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

EMERGENT_LLM_KEY = os.environ['EMERGENT_LLM_KEY']

app = FastAPI()
api_router = APIRouter(prefix="/api")

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

VALID_STATUSES = {"Pending_Review", "Rewritten_Pending_Publish", "Published"}


# ---------- Models ----------
def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


class NewsItem(BaseModel):
    model_config = ConfigDict(extra="ignore")

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    source: str = "Manual Entry"
    original_content: str
    rewritten_content: Optional[str] = None
    status: str = "Pending_Review"
    created_at: str = Field(default_factory=now_iso)
    updated_at: str = Field(default_factory=now_iso)


class NewsItemCreate(BaseModel):
    title: str
    source: Optional[str] = "Manual Entry"
    original_content: str


# ---------- AI Rewrite ----------
REWRITE_SYSTEM_PROMPT = (
    "आप एक अनुभवी वरिष्ठ हिंदी समाचार संपादक हैं। आपका काम किसी भी भाषा में दिए गए कच्चे "
    "समाचार मसौदे को त्रुटिरहित, पेशेवर और प्रवाहपूर्ण पत्रकारीय हिंदी (शुद्ध समाचार शैली) में "
    "पुनर्लेखित करना है।\n\n"
    "नियम:\n"
    "1. पूरा आउटपुट केवल हिंदी (देवनागरी) में हो।\n"
    "2. व्याकरण, वर्तनी और विराम चिह्न बिल्कुल सही हों।\n"
    "3. वस्तुनिष्ठ, तटस्थ और औपचारिक समाचार शैली अपनाएं — कोई राय या अतिरिक्त टिप्पणी नहीं।\n"
    "4. तथ्य, नाम, संख्याएं और स्थान मूल सामग्री के अनुसार ही रखें, कुछ भी मनगढ़ंत न जोड़ें।\n"
    "5. एक स्पष्ट, आकर्षक शीर्षक से शुरुआत करें, फिर सुव्यवस्थित पैराग्राफ में समाचार लिखें।\n"
    "6. केवल पुनर्लेखित समाचार लौटाएं — कोई भूमिका, स्पष्टीकरण या मार्कडाउन बाड़ (```) नहीं।"
)


async def rewrite_to_journalistic_hindi(title: str, content: str) -> str:
    chat = LlmChat(
        api_key=EMERGENT_LLM_KEY,
        session_id=f"rewrite-{uuid.uuid4()}",
        system_message=REWRITE_SYSTEM_PROMPT,
    ).with_model("gemini", "gemini-3-flash-preview")

    user_message = UserMessage(
        text=f"शीर्षक: {title}\n\nसमाचार सामग्री:\n{content}\n\n"
             f"उपरोक्त समाचार को त्रुटिरहित पत्रकारीय हिंदी में पुनर्लेखित करें।"
    )
    response = await chat.send_message(user_message)
    return response.strip() if isinstance(response, str) else str(response)


# ---------- Routes ----------
@api_router.get("/")
async def root():
    return {"message": "Samvad Editorial API"}


@api_router.get("/news", response_model=List[NewsItem])
async def list_news(status: Optional[str] = None):
    query = {}
    if status and status != "ALL":
        query["status"] = status
    docs = await db.news_items.find(query, {"_id": 0}).sort("created_at", -1).to_list(1000)
    return [NewsItem(**d) for d in docs]


@api_router.post("/news", response_model=NewsItem)
async def create_news(payload: NewsItemCreate):
    item = NewsItem(**payload.model_dump())
    await db.news_items.insert_one(item.model_dump())
    return item


@api_router.post("/news/{item_id}/approve-rewrite", response_model=NewsItem)
async def approve_rewrite(item_id: str):
    doc = await db.news_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="News item not found")

    item = NewsItem(**doc)
    if item.status != "Pending_Review":
        raise HTTPException(status_code=400, detail="Only Pending_Review items can be approved for rewrite")

    try:
        hindi = await rewrite_to_journalistic_hindi(item.title, item.original_content)
    except Exception as e:
        logger.exception("AI rewrite failed")
        raise HTTPException(status_code=502, detail=f"AI rewrite failed: {e}")

    item.rewritten_content = hindi
    item.status = "Rewritten_Pending_Publish"
    item.updated_at = now_iso()
    await db.news_items.update_one(
        {"id": item_id},
        {"$set": {
            "rewritten_content": item.rewritten_content,
            "status": item.status,
            "updated_at": item.updated_at,
        }},
    )
    return item


@api_router.post("/news/{item_id}/publish", response_model=NewsItem)
async def publish_news(item_id: str):
    doc = await db.news_items.find_one({"id": item_id}, {"_id": 0})
    if not doc:
        raise HTTPException(status_code=404, detail="News item not found")
    item = NewsItem(**doc)
    if item.status != "Rewritten_Pending_Publish":
        raise HTTPException(status_code=400, detail="Only rewritten items can be published")
    item.status = "Published"
    item.updated_at = now_iso()
    await db.news_items.update_one(
        {"id": item_id},
        {"$set": {"status": item.status, "updated_at": item.updated_at}},
    )
    return item


@api_router.delete("/news/{item_id}")
async def delete_news(item_id: str):
    res = await db.news_items.delete_one({"id": item_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="News item not found")
    return {"deleted": True}


# ---------- Seed ----------
SEED_ITEMS = [
    {
        "title": "City council approves new metro line to ease traffic congestion",
        "source": "Metro Times",
        "original_content": (
            "The city council on Tuesday approved a proposal to build a new 24-kilometre metro line "
            "connecting the eastern suburbs to the central business district. Officials said the project, "
            "estimated at 4,200 crore rupees, is expected to be completed within five years and will serve "
            "nearly 600,000 commuters daily. The mayor said the line would significantly reduce road traffic "
            "and cut average commute times by up to 40 minutes."
        ),
        "status": "Pending_Review",
    },
    {
        "title": "Monsoon arrives early, farmers welcome timely rains across the region",
        "source": "AgriWire",
        "original_content": (
            "The southwest monsoon reached the region nearly a week ahead of schedule this year, bringing "
            "widespread rainfall that farmers say is ideal for the sowing season. Agricultural experts noted "
            "that reservoirs have already reached 65 percent of capacity, easing concerns about irrigation. "
            "Farmers in several districts have begun planting rice and pulses earlier than usual."
        ),
        "status": "Pending_Review",
    },
    {
        "title": "Local startup develops low-cost water purifier for rural households",
        "source": "TechDaily",
        "original_content": (
            "A startup founded by three engineering graduates has developed an affordable water purifier that "
            "runs without electricity, aimed at rural households. The device, priced at under 1,500 rupees, "
            "uses a multi-stage ceramic and carbon filter and can purify up to 20 litres of water per hour. "
            "The founders say they have already received orders from several non-profit organisations."
        ),
        "status": "Pending_Review",
    },
    {
        "title": "State museum unveils rare collection of ancient manuscripts",
        "source": "Culture Beat",
        "original_content": (
            "The state museum on Monday unveiled a newly restored collection of more than 200 ancient "
            "manuscripts, some dating back over 800 years. Curators said the manuscripts, written on palm "
            "leaves and handmade paper, cover subjects ranging from astronomy to medicine. The exhibition will "
            "be open to the public for three months."
        ),
        "status": "Rewritten_Pending_Publish",
        "rewritten_content": (
            "राज्य संग्रहालय ने दुर्लभ प्राचीन पांडुलिपियों का संग्रह प्रदर्शित किया\n\n"
            "राज्य संग्रहालय ने सोमवार को हाल ही में संरक्षित की गई 200 से अधिक प्राचीन पांडुलिपियों का "
            "संग्रह जनता के सामने प्रस्तुत किया, जिनमें से कुछ 800 वर्ष से भी अधिक पुरानी हैं। संग्रहालय के "
            "क्यूरेटरों के अनुसार, ताड़पत्र और हस्तनिर्मित कागज़ पर लिखी गई ये पांडुलिपियाँ खगोल विज्ञान से "
            "लेकर चिकित्सा तक विविध विषयों को समेटे हुए हैं। यह प्रदर्शनी आगामी तीन महीनों तक आम जनता के "
            "लिए खुली रहेगी।"
        ),
    },
    {
        "title": "Regional airport records highest passenger footfall in a decade",
        "source": "Aviation Now",
        "original_content": (
            "The regional airport recorded its highest passenger footfall in a decade last month, handling "
            "over 1.2 million travellers. Airport authorities attributed the surge to new domestic routes and "
            "increased tourism. Officials said expansion work on a second terminal is underway to handle the "
            "growing demand."
        ),
        "status": "Published",
        "rewritten_content": (
            "क्षेत्रीय हवाई अड्डे पर एक दशक में सर्वाधिक यात्री आवाजाही दर्ज\n\n"
            "क्षेत्रीय हवाई अड्डे ने पिछले महीने एक दशक में सबसे अधिक यात्री आवाजाही दर्ज की, जहाँ 12 लाख से "
            "अधिक यात्रियों की आवाजाही हुई। हवाई अड्डा प्रशासन ने इस वृद्धि का श्रेय नई घरेलू उड़ान सेवाओं और "
            "बढ़ते पर्यटन को दिया। अधिकारियों ने बताया कि बढ़ती माँग को देखते हुए दूसरे टर्मिनल के विस्तार का "
            "कार्य प्रगति पर है।"
        ),
    },
]


@app.on_event("startup")
async def seed_data():
    count = await db.news_items.count_documents({})
    if count == 0:
        for s in SEED_ITEMS:
            item = NewsItem(**s)
            await db.news_items.insert_one(item.model_dump())
        logger.info("Seeded %d sample news items", len(SEED_ITEMS))


app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
