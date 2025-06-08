# src/services/misc_service.py

from src.repositories.misc_repo import PointRecordRepository, SettlementRepository
from src.repositories.room_repo import RoomRepository
from fastapi import HTTPException
from src.ws import broadcast_event_to_room, send_event
from typing import Dict, List
from datetime import datetime
import asyncio
import random
import string

def _make_round_id(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))

class PointService:
    def __init__(
        self,
        point_repo: PointRecordRepository,
        room_repo: RoomRepository,
        cache_repo  # RoundCacheRepository
    ):
        self.point_repo = point_repo
        self.room_repo = room_repo
        self.cache = cache_repo
        self._timeout_tasks: Dict[str, asyncio.Task] = {}

    async def add_points(self, room_id: str, round_id: str, points: List, approved_by: List[str]):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        members = {m["uid"] for m in room.get("members", [])}
        if members != set(approved_by):
            raise HTTPException(status_code=400, detail="All members must approve the record.")
        return await self.point_repo.create({
            "room_id": room_id,
            "round_id": round_id,
            "points": [p.dict() for p in points],
            "approved_by": approved_by,
            "created_at": datetime.utcnow(),
            "is_deleted": False,
        })

    async def history(self, room_id: str):
        return await self.point_repo.history(room_id)

    async def history_by_uid(self, uid: str):
        return await self.point_repo.history_by_uid(uid)

    async def logical_delete(self, room_id: str, round_id: str, current_uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if room["created_by"] != current_uid:
            raise HTTPException(status_code=403, detail="Only room owner can delete point record")
        return await self.point_repo.logical_delete(room_id, round_id)

    async def start_round(self, room_id: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        # 既存ラウンドをクリア
        await self.cache.clear(room_id)
        # 新ラウンド ID 発行・保存
        round_id = _make_round_id()
        await self.cache.start(room_id, round_id)
        # タイムアウト監視タスク
        if room_id in self._timeout_tasks:
            self._timeout_tasks[room_id].cancel()
        self._timeout_tasks[room_id] = asyncio.create_task(self._watch_timeout(room_id))
        # 開始通知
        await broadcast_event_to_room(room_id, {
            "type": "point_round_started",
            "room_id": room_id,
            "round_id": round_id,
        })

    async def _watch_timeout(self, room_id: str):
        try:
            await asyncio.sleep(180)
            await self.cancel_round(room_id, reason="Timeout after 3 minutes")
        except asyncio.CancelledError:
            pass
        finally:
            self._timeout_tasks.pop(room_id, None)

    async def submit_score(self, room_id: str, uid: str, value: int):
        # Redis にスコアを一時保存
        round_id = await self.cache.add_submission(room_id, uid, value)
        if not round_id:
            raise HTTPException(status_code=400, detail="No active round")

        # 提出通知
        await broadcast_event_to_room(room_id, {
            "type": "point_submitted",
            "room_id": room_id,
            "round_id": round_id,
            "uid": uid,
        })

        # 全員提出時の最終表通知
        room = await self.room_repo.get_by_id(room_id)
        subs = await self.cache.get_submissions(room_id)
        if len(subs) == len(room.get("members", [])):
            # タイマー取消
            if task := self._timeout_tasks.pop(room_id, None):
                task.cancel()
            total = sum(subs.values())
            if total != 0:
                # 合計がゼロでないならキャンセル
                await broadcast_event_to_room(room_id, {
                    "type": "point_round_cancelled",
                    "room_id": room_id,
                    "round_id": round_id,
                    "reason": "Sum is not zero",
                })
                await self.cache.clear(room_id)
            else:
                # 合計ゼロなら最終表のみ通知（DB登録は承認後にまとめて）
                await broadcast_event_to_room(room_id, {
                    "type": "point_final_table",
                    "room_id": room_id,
                    "round_id": round_id,
                    "table": subs,
                })

    async def finalize_round(self, room_id: str):
        # 合計チェックと最終表通知のみ
        subs = await self.cache.get_submissions(room_id)
        if not subs:
            raise HTTPException(status_code=400, detail="No active round")
        total = sum(subs.values())
        round_id = await self.cache.get_round_id(room_id)
        if total != 0:
            await self.cancel_round(room_id, reason="Sum is not zero")
            raise HTTPException(status_code=400, detail="Sum is not zero")

        await broadcast_event_to_room(room_id, {
            "type": "point_final_table",
            "room_id": room_id,
            "round_id": round_id,
            "table": subs,
        })
        return {"round_id": round_id, "table": subs}

    async def approve(self, room_id: str, round_id: str, current_uid: str):
        # Redis の approvals セットに追加
        await self.cache.add_approval(room_id, current_uid)

        # 全承認状況を取得
        approvals = await self.cache.get_approvals(room_id)
        approvals = set(approvals)
        room = await self.room_repo.get_by_id(room_id)
        members = {m["uid"] for m in room.get("members", [])}

        # 各自の承認通知
        await broadcast_event_to_room(room_id, {
            "type": "point_approved",
            "room_id": room_id,
            "round_id": round_id,
            "uid": current_uid,
        })

        # 全員承認が揃ったらまとめて永続化
        if approvals | {current_uid} == members:
            subs = await self.cache.get_submissions(room_id)
            # MongoDB に一度だけ書き込む
            await self.point_repo.create({
                "room_id": room_id,
                "round_id": round_id,
                "points": [{"uid": k, "value": v} for k, v in subs.items()],
                "approved_by": list(members),
                "created_at": datetime.utcnow(),
                "is_deleted": False,
            })
            # キャッシュクリア
            await self.cache.clear(room_id)
            # 完全承認完了通知
            await broadcast_event_to_room(room_id, {
                "type": "point_fully_approved",
                "room_id": room_id,
                "round_id": round_id,
                "approved_by": list(members),
            })

    async def get_approval_status(self, room_id: str, round_id: str):
        # Redis に残っていればそれ、なければ最終的に DB を参照
        approvals = await self.cache.get_approvals(room_id)
        if approvals:
            return {"approved_by": list(approvals)}
        # キャッシュに何もなければ既存レコードから
        record = await self.point_repo.find_one(room_id, round_id)
        if not record:
            raise HTTPException(status_code=404, detail="Record not found")
        return {"approved_by": record.get("approved_by", [])}

    async def cancel_round(self, room_id: str, reason: str):
        round_id = await self.cache.get_round_id(room_id)
        if task := self._timeout_tasks.pop(room_id, None):
            task.cancel()
        await broadcast_event_to_room(room_id, {
            "type": "point_round_cancelled",
            "room_id": room_id,
            "round_id": round_id,
            "reason": reason,
        })
        await self.cache.clear(room_id)


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
