from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from src.api import user, room, misc
from .config import MONGODB_URI, MONGO_DB_NAME
from src.db import get_db


# FastAPI app設定など
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 必要に応じて制限
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

import os
print("AUTH_PROVIDER:", os.getenv("AUTH_PROVIDER"))
app.include_router(user.router, prefix="/api", tags=["user"])
app.include_router(room.router, prefix="/api", tags=["room"])
app.include_router(misc.router, prefix="/api", tags=["misc"])

# WebSocketやイベントも後述

