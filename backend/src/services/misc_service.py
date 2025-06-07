from src.repositories.misc_repo import PointRecordRepository, SettlementRepository
import uuid
from datetime import datetime

class PointService:
    def __init__(self, repo: PointRecordRepository):
        self.repo = repo

    async def add_points(self, room_id: str, points: list, approved_by: list):
        round_id = str(uuid.uuid4())
        payload = {
            "room_id": room_id,
            "round_id": round_id,
            "points": points,
            "approved_by": approved_by,
            "created_at": datetime.utcnow(),
            "is_deleted": False
        }
        return await self.repo.create(payload)

    async def history(self, room_id: str):
        return await self.repo.history(room_id)

    async def logical_delete(self, room_id: str, round_id: str):
        return await self.repo.logical_delete(room_id, round_id)

class SettlementService:
    def __init__(self, repo: SettlementRepository):
        self.repo = repo

    async def create(self, data: dict):
        return await self.repo.create(data)

    async def approve(self, settlement_id: str):
        return await self.repo.approve(settlement_id)

    async def history(self, room_id: str):
        return await self.repo.history(room_id)

