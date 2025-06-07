# src/db.py
from motor.motor_asyncio import AsyncIOMotorClient
from .config import MONGODB_URI, MONGO_DB_NAME

client = AsyncIOMotorClient(MONGODB_URI)
db = client[MONGO_DB_NAME]
def get_db():
    return db

