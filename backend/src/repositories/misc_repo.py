from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional, List
from datetime import datetime

class PointRecordRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.point_records

    async def create(self, data: dict):
        data["created_at"] = datetime.utcnow()
        data["is_deleted"] = False
        await self.collection.insert_one(data)
        return data["round_id"]

    async def history(self, room_id: str) -> List[dict]:
        cursor = self.collection.find({"room_id": room_id, "is_deleted": False})
        return await cursor.to_list(length=100)

    async def logical_delete(self, room_id: str, round_id: str) -> bool:
        result = await self.collection.update_one(
            {"room_id": room_id, "round_id": round_id}, {"$set": {"is_deleted": True}}
        )
        return result.modified_count == 1

class SettlementRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.settlements

    async def create(self, data: dict):
        data["created_at"] = datetime.utcnow()
        data["is_deleted"] = False
        data["approved"] = False
        await self.collection.insert_one(data)
        return str(data["_id"])

    async def approve(self, settlement_id: str):
        from bson import ObjectId
        result = await self.collection.update_one(
            {"_id": ObjectId(settlement_id), "is_deleted": False},
            {"$set": {"approved": True, "approved_at": datetime.utcnow()}}
        )
        return result.modified_count == 1

    async def history(self, room_id: str) -> List[dict]:
        cursor = self.collection.find({"room_id": room_id, "is_deleted": False})
        return await cursor.to_list(length=100)

