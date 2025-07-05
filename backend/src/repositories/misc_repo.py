# src/repositories/misc_repo.py

from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import List, Optional
from datetime import datetime
from bson import ObjectId
import redis.asyncio as redis


class PointRecordRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.point_records

    async def create(self, data: dict) -> str:
        data.setdefault("created_at", datetime.now())
        data.setdefault("is_deleted", False)
        await self.collection.insert_one(data)
        return data["round_id"]

    async def history(self, room_id: str) -> List[dict]:
        cursor = self.collection.find(
            {"room_id": room_id, "is_deleted": False}
        )
        items = await cursor.to_list(length=100)
        for item in items:
            # ObjectId を取り除く
            item.pop("_id", None)
        return items


class SettlementRepository:
    def __init__(self, db: AsyncIOMotorDatabase):
        self.collection = db.settlements



    async def history(self, room_id: str) -> List[dict]:
        cursor = self.collection.find(
            {"room_id": room_id, "is_deleted": False}
        )
        items = await cursor.to_list(length=100)
        for item in items:
            item["settlement_id"] = str(item.pop("_id"))
        return items

    async def history_by_uid(self, uid: str) -> List[dict]:
        cursor = self.collection.find({
            "$or": [{"from_uid": uid}, {"to_uid": uid}],
            "is_deleted": False
        })
        items = await cursor.to_list(length=100)
        for item in items:
            item["settlement_id"] = str(item.pop("_id"))
        return items


class SettlementCacheRepository:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    def _key(self, room_id: str, from_uid: str, to_uid: str) -> str:
        return f"settle:{room_id}:{from_uid}->{to_uid}"

    async def cache_request(self, room_id: str, from_uid: str, to_uid: str, amount: int) -> None:
        k = self._key(room_id, from_uid, to_uid)
        await self.redis.hset(k, mapping={
            "room_id": room_id,
            "from_uid": from_uid,
            "to_uid": to_uid,
            "amount": amount,
        })
        await self.redis.expire(k, 180)

    async def get_request(self, room_id: str, from_uid: str, to_uid: str):
        k = self._key(room_id, from_uid, to_uid)
        data = await self.redis.hgetall(k)
        # decode_responses=True の場合は str キー／値なので 'amount' でチェック
        if not data or "amount" not in data:
            return None
        return {
            "room_id": data["room_id"],
            "from_uid": data["from_uid"],
            "to_uid": data["to_uid"],
            "amount": int(data["amount"]),
        }
    async def clear_request(self, room_id: str, from_uid: str, to_uid: str) -> None:
        k = self._key(room_id, from_uid, to_uid)
        await self.redis.delete(k)


class RoundCacheRepository:
    def __init__(self, redis_client: redis.Redis):
        self.redis = redis_client

    def _prefix(self, room_id: str) -> str:
        return f"points:{room_id}"

    async def start(self, room_id: str, round_id: str) -> None:
        p = self._prefix(room_id)
        await self.redis.hset(p, mapping={"round_id": round_id})
        await self.redis.delete(f"{p}:submissions", f"{p}:approvals")

    async def get_round_id(self, room_id: str) -> Optional[str]:
        val = await self.redis.hget(self._prefix(room_id), "round_id")
        return val.decode() if val else None

    async def add_submission(self, room_id: str, uid: str, value: int) -> Optional[str]:
        p = self._prefix(room_id)
        round_id = await self.get_round_id(room_id)
        if not round_id:
            return None
        await self.redis.hset(f"{p}:submissions", uid, value)
        return round_id

    async def get_submissions(self, room_id: str) -> dict[str, int]:
        data = await self.redis.hgetall(f"{self._prefix(room_id)}:submissions")
        return {k.decode(): int(v) for k, v in data.items()}

    async def add_approval(self, room_id: str, uid: str) -> None:
        await self.redis.sadd(f"{self._prefix(room_id)}:approvals", uid)

    async def get_approvals(self, room_id: str) -> List[str]:
        members = await self.redis.smembers(f"{self._prefix(room_id)}:approvals")
        return [m.decode() for m in members]

    async def clear(self, room_id: str) -> None:
        p = self._prefix(room_id)
        await self.redis.delete(p, f"{p}:submissions", f"{p}:approvals")
