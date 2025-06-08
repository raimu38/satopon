from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from src.api import user, room, misc
from .config import MONGODB_URI, MONGO_DB_NAME
from src.db import get_db
import os
from src import ws


# FastAPI app設定など
app = FastAPI()

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://localhost"        # ※必要なら追加
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(user.router, prefix="/api", tags=["user"])
app.include_router(room.router, prefix="/api", tags=["room"])
app.include_router(misc.router, prefix="/api", tags=["misc"])
app.include_router(ws.router)

# WebSocketやイベントも後述

