# src/db.py

import os
from motor.motor_asyncio import AsyncIOMotorClient
import redis.asyncio as redis  # redis-py公式の非同期クライアント

from .config import MONGODB_URI, MONGO_DB_NAME, REDIS_URI

# MongoDB
_mongo_client = AsyncIOMotorClient(MONGODB_URI)
db = _mongo_client[MONGO_DB_NAME]

# Redis
redis_client = redis.from_url(REDIS_URI, decode_responses=True)

def get_db():
    return db

def get_redis():
    return redis_client
