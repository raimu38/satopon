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

# repositories/misc_repo.py

# src/repositories/misc_repo.py か settlement_repo.py あたり

# src/repositories/misc_repo.py か settlement_repo.py 内

    async def history(self, room_id: str) -> List[dict]:
        cursor = self.collection.find({"room_id": room_id, "is_deleted": False})
        items = await cursor.to_list(length=100)
        for item in items:
            # _id を文字列化して settlement_id に乗せ替え
            if "_id" in item:
                item["settlement_id"] = str(item["_id"])
                del item["_id"]
        return items
    
    async def logical_delete(self, room_id: str, round_id: str) -> bool:
        result = await self.collection.update_one(
            {"room_id": room_id, "round_id": round_id}, {"$set": {"is_deleted": True}}
        )
        return result.modified_count == 1

    async def find_one(self, room_id: str, round_id: str) -> Optional[dict]:
        return await self.collection.find_one({
            "room_id": room_id,
            "round_id": round_id,
            "is_deleted": False
        })

    async def add_approval(self, room_id: str, round_id: str, uid: str):
        result = await self.collection.update_one(
            {"room_id": room_id, "round_id": round_id},
            {"$addToSet": {"approved_by": uid}}
        )
        return result.modified_count == 1

    async def history_by_uid(self, uid: str) -> List[dict]:
        cursor = self.collection.find({"points.uid": uid, "is_deleted": False})
        return await cursor.to_list(length=100)

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
        items = await cursor.to_list(length=100)
        for item in items:
            item["settlement_id"] = str(item["_id"])
            del item["_id"]
        return items

    async def history_by_uid(self, uid: str) -> List[dict]:
        cursor = self.collection.find(
            {"$or": [{"from_uid": uid}, {"to_uid": uid}], "is_deleted": False}
        )
        return await cursor.to_list(length=100)
