from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from datetime import datetime

class RoomRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.rooms

    async def exists(self, room_id: str) -> bool:
        doc = await self.collection.find_one({"room_id": room_id, "is_archived": False})
        return doc is not None

    async def create(self, data: dict) -> str:
        data["created_at"] = datetime.utcnow()
        data["is_archived"] = False
        await self.collection.insert_one(data)
        return data["room_id"]

    async def get_by_id(self, room_id: str) -> Optional[dict]:
        doc = await self.collection.find_one({"room_id": room_id, "is_archived": False})
        if doc is not None and "pending_members" not in doc:
            doc["pending_members"] = []
        return doc

    async def list_all(self) -> List[dict]:
        cursor = self.collection.find({"is_archived": False})
        return await cursor.to_list(length=1000)

    async def update(self, room_id: str, updates: dict) -> bool:
        result = await self.collection.update_one(
            {"room_id": room_id, "is_archived": False}, {"$set": updates}
        )
        return result.modified_count == 1

    async def list_rooms_for_user(self, uid: str) -> List[dict]:
        cursor = self.collection.find({"members.uid": uid, "is_archived": False})
        return await cursor.to_list(length=100)

    async def add_member(self, room_id: str, uid: str):
        await self.collection.update_one(
            {"room_id": room_id, "is_archived": False, "members.uid": {"$ne": uid}},
            {"$push": {"members": {"uid": uid, "joined_at": datetime.utcnow()}}}
        )
    async def add_pending_member(self, room_id: str, uid: str):
        await self.collection.update_one(
            {"room_id": room_id, "is_archived": False},
            {"$push": {"pending_members": {"uid": uid, "requested_at": datetime.utcnow()}}}
        )

    async def approve_pending_member(self, room_id: str, uid: str):
        await self.collection.update_one(
            {"room_id": room_id, "is_archived": False},
            {
                "$pull": {"pending_members": {"uid": uid}},
                "$push": {"members": {"uid": uid, "joined_at": datetime.utcnow()}}
            }
        )

    async def remove_pending_member(self, room_id: str, uid: str):
        await self.collection.update_one(
            {"room_id": room_id, "is_archived": False},
            {"$pull": {"pending_members": {"uid": uid}}}
        )

    async def remove_member(self, room_id: str, uid: str):
        await self.collection.update_one(
            {"room_id": room_id, "is_archived": False},
            {"$pull": {"members": {"uid": uid}}}
        )
