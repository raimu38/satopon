from src.models import RoomModel, MemberObj
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from datetime import datetime

class RoomRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.rooms

    async def create(self, data: dict) -> str:
        data["created_at"] = datetime.utcnow()
        data["is_archived"] = False
        await self.collection.insert_one(data)
        return data["room_id"]

    async def get_by_id(self, room_id: str) -> Optional[dict]:
        return await self.collection.find_one({"room_id": room_id, "is_archived": False})

    async def update(self, room_id: str, updates: dict) -> bool:
        result = await self.collection.update_one(
            {"room_id": room_id, "is_archived": False}, {"$set": updates}
        )
        return result.modified_count == 1

    async def list_rooms_for_user(self, uid: str) -> List[dict]:
        cursor = self.collection.find({"members.uid": uid, "is_archived": False})
        return await cursor.to_list(length=100)

