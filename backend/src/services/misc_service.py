# src/services/misc_service.py

from src.repositories.misc_repo import PointRecordRepository, SettlementRepository
from src.repositories.room_repo import RoomRepository
import uuid
from datetime import datetime
from fastapi import HTTPException
from src.ws import broadcast_event_to_room, send_event
from typing import Dict

class PointService:
    def __init__(self, point_repo: PointRecordRepository, room_repo: RoomRepository):
        self.point_repo = point_repo
        self.room_repo = room_repo
        # key: room_id, value: dict with submissions and active flag
        self._rounds: Dict[str, dict] = {}

    async def add_points(self, room_id: str, points: list, approved_by: list):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")

        member_uids = {m["uid"] for m in room.get("members", [])}
        approved_by_set = set(approved_by)
        if member_uids != approved_by_set:
            raise HTTPException(status_code=400, detail="All members must approve the record.")

        round_id = str(uuid.uuid4())
        points_dict = [p.dict() if hasattr(p, "dict") else p for p in points]
        payload = {
            "room_id": room_id,
            "round_id": round_id,
            "points": points_dict,
            "approved_by": approved_by,
            "created_at": datetime.utcnow(),
            "is_deleted": False
        }
        return await self.point_repo.create(payload)

    async def history(self, room_id: str):
        return await self.point_repo.history(room_id)

    async def logical_delete(self, room_id: str, round_id: str, current_uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if room["created_by"] != current_uid:
            raise HTTPException(status_code=403, detail="Only room owner can delete point record")
        return await self.point_repo.logical_delete(room_id, round_id)

    async def approve(self, room_id: str, round_id: str, current_uid: str):
        record = await self.point_repo.find_one(room_id, round_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        if current_uid in record.get("approved_by", []):
            return

        await self.point_repo.add_approval(room_id, round_id, current_uid)

        # 全員承認済みチェックして通知
        room = await self.room_repo.get_by_id(room_id)
        if room:
            member_uids = {m["uid"] for m in room.get("members", [])}
            approved_set = set(record.get("approved_by", []) + [current_uid])
            if member_uids == approved_set:
                for uid in member_uids:
                    await send_event(uid, {
                        "type": "point_approved",
                        "room_id": room_id,
                        "round_id": round_id
                    })

    async def get_approval_status(self, room_id: str, round_id: str):
        record = await self.point_repo.find_one(room_id, round_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"approved_by": record.get("approved_by", [])}

    async def history_by_uid(self, uid: str):
        return await self.point_repo.history_by_uid(uid)

    async def start_round(self, room_id: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if self._rounds.get(room_id, {}).get("is_active"):
            raise HTTPException(status_code=400, detail="Round already in progress")

        # ラウンド初期化
        self._rounds[room_id] = {
            "submissions": {},
            "is_active": True,
        }

        # WSで参加者全員に「ラウンド開始」通知
        await broadcast_event_to_room(room_id, {
            "type": "point_round_started",
            "room_id": room_id,
        })

    async def submit_score(self, room_id: str, uid: str, value: int):
        rnd = self._rounds.get(room_id)
        if not rnd or not rnd["is_active"]:
            raise HTTPException(status_code=400, detail="No active round")

        # スコアを記録
        rnd["submissions"][uid] = value

        # WSで「提出完了」通知
        await broadcast_event_to_room(room_id, {
            "type": "point_submitted",
            "room_id": room_id,
            "uid": uid,
        })

    async def finalize_round(self, room_id: str):
        rnd = self._rounds.get(room_id)
        if not rnd or not rnd["is_active"]:
            raise HTTPException(status_code=400, detail="No active round")

        total = sum(rnd["submissions"].values())
        # 合計が0でなければ中止
        if total != 0:
            rnd["is_active"] = False
            raise HTTPException(status_code=400, detail="Sum is not zero")

        # WSで「テーブル送信」
        await broadcast_event_to_room(room_id, {
            "type": "point_final_table",
            "room_id": room_id,
            "table": rnd["submissions"],
        })

        return rnd["submissions"]

    async def cancel_round(self, room_id: str, reason: str):
        # ラウンド情報を破棄
        rnd = self._rounds.pop(room_id, None)

        # WSで「ラウンド中止」通知
        await broadcast_event_to_room(room_id, {
            "type": "point_round_cancelled",
            "room_id": room_id,
            "reason": reason,
        })


class SettlementService:
    def __init__(self, repo: SettlementRepository):
        self.repo = repo

    async def create(self, data: dict):
        return await self.repo.create(data)

    async def approve(self, settlement_id: str):
        return await self.repo.approve(settlement_id)

    async def history(self, room_id: str):
        return await self.repo.history(room_id)

    async def history_by_uid(self, uid: str):
        return await self.repo.history_by_uid(uid)
