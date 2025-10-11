from src.models import UserModel
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from datetime import datetime

class UserRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.users

    async def get_by_uid(self, uid: str) -> Optional[dict]:
        return await self.collection.find_one({"uid": uid, "is_deleted": False})

    async def get_by_external_id(self, external_id: str) -> Optional[dict]:
        return await self.collection.find_one({"external_id": external_id, "is_deleted": False})

    async def create(self, data: dict) -> str:
        data["registered_at"] = datetime.now()
        data["is_deleted"] = False
        await self.collection.insert_one(data)
        return data["uid"]

    async def update_display_name(self, uid: str, display_name: str) -> bool:
        result = await self.collection.update_one(
            {"uid": uid, "is_deleted": False},
            {"$set": {"display_name": display_name}}
        )
        return result.modified_count == 1

    async def list_all(self) -> List[dict]:
        cursor = self.collection.find({"is_deleted": False})
        return await cursor.to_list(length=1000)


