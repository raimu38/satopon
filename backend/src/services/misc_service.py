# src/services/misc_service.py

import asyncio
from datetime import datetime
from fastapi import HTTPException

from src.repositories.misc_repo import (
    PointRecordRepository,
    SettlementRepository,
    SettlementCacheRepository,
    RoundCacheRepository,
)
from src.repositories.room_repo import RoomRepository
from src.ws import broadcast_event_to_room, send_event

def _make_round_id(prefix: str, length: int = 6) -> str:
    import random, string
    chars = string.ascii_uppercase + string.digits
    rnd = ''.join(random.choices(chars, k=length))
    return f"{prefix}-{rnd}"


class PointService:
    def __init__(
        self,
        point_repo: PointRecordRepository,
        room_repo: RoomRepository,
        cache_repo,  # RoundCacheRepository
    ):
        self.point_repo = point_repo
        self.room_repo = room_repo
        self.cache = cache_repo
        self._timeout_tasks: dict[str, asyncio.Task] = {}

    # ─── ユースケースメソッド ───

    async def history(self, room_id: str):
        return await self.point_repo.history(room_id)



    async def start_round(self, room_id: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
             raise HTTPException(404, "Room not found")
 
        # ——— 在室ユーザー一覧を Redis から取得 ———
        presence_key = f"presence:{room_id}"
        participants = await self.cache.redis.smembers(presence_key)
        participants = list(participants)
        if len(participants) < 2:
            raise HTTPException(400, "Need 2+ users to start round")

        # キャッシュ初期化・新ラウンドID生成
        await self.cache.clear(room_id)
        round_id = _make_round_id("PON")
        await self.cache.start(room_id, round_id, participants)
        if task := self._timeout_tasks.get(room_id):
            task.cancel()
        self._timeout_tasks[room_id] = asyncio.create_task(self._watch_timeout(room_id))

        await broadcast_event_to_room(room_id, {
            "type": "point_round_started",
            "room_id": room_id,
            "round_id": round_id,
        })

    async def submit_score(self, room_id: str, uid: str, value: int):
        round_id = await self.cache.add_submission(room_id, uid, value)
        if not round_id:
            raise HTTPException(400, "No active round")

        await broadcast_event_to_room(room_id, {
            "type": "point_submitted",
            "room_id": room_id,
            "round_id": round_id,
            "uid": uid,
        })

        subs = await self.cache.get_submissions(room_id)
        round_meta_key = self.cache._round_key(room_id)
        meta = await self.cache.redis.hgetall(round_meta_key)
        start_participants = meta.get("participants", "").split(",")
        if len(subs) == len(start_participants):# タイマー取消
            if task := self._timeout_tasks.pop(room_id, None):
                task.cancel()

            total = sum(subs.values())
            if total != 0:
                await broadcast_event_to_room(room_id, {
                    "type": "point_round_cancelled",
                    "room_id": room_id,
                    "round_id": round_id,
                    "reason": "Sum is not zero",
                })
                await self.cache.clear(room_id)
            else:
                # 最終表通知のみ（DB登録は approve 時にまとめて）
                await broadcast_event_to_room(room_id, {
                    "type": "point_final_table",
                    "room_id": room_id,
                    "round_id": round_id,
                    "table": subs,
                })

    async def finalize_round(self, room_id: str):
        subs = await self.cache.get_submissions(room_id)
        if not subs:
            raise HTTPException(400, "No active round")

        total = sum(subs.values())
        round_id = await self.cache.get_round_id(room_id)
        if total != 0:
            await self.cancel_round(room_id, reason="Sum is not zero")
            raise HTTPException(400, "Sum is not zero")

        await broadcast_event_to_room(room_id, {
            "type": "point_final_table",
            "room_id": room_id,
            "round_id": round_id,
            "table": subs,
        })
        return {"round_id": round_id, "table": subs}

    async def approve(self, room_id: str, round_id: str, current_uid: str):
        await self.cache.add_approval(room_id, current_uid)
        approvals = set(await self.cache.get_approvals(room_id))

        participants = await self.cache.get_participants(room_id)
        members = set(participants)

        await broadcast_event_to_room(room_id, {
            "type": "point_approved",
            "room_id": room_id,
            "round_id": round_id,
            "uid": current_uid,
        })

        # 全員承認なら DB 永続化
        if approvals | {current_uid} == members:
            subs = await self.cache.get_submissions(room_id)
            await self.point_repo.create({
                "room_id": room_id,
                "round_id": round_id,
                "points": [{"uid": k, "value": v} for k, v in subs.items()],
                "approved_by": list(members),
                "created_at": datetime.now(),
                "is_deleted": False,
            })
            await self.cache.clear(room_id)
            await broadcast_event_to_room(room_id, {
                "type": "point_fully_approved",
                "room_id": room_id,
                "round_id": round_id,
                "approved_by": list(members),
            })


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

    # ─── 内部ユーティリティ ───

    async def _watch_timeout(self, room_id: str):
        try:
            await asyncio.sleep(180)
            await self.cancel_round(room_id, reason="Timeout after 3 minutes")
        except asyncio.CancelledError:
            pass


class SettlementService:
    def __init__(
        self,
        settle_repo: SettlementRepository,
        cache_repo: SettlementCacheRepository,
        point_repo: PointRecordRepository,
    ):
        self.settle_repo = settle_repo
        self.cache = cache_repo
        self.point_repo = point_repo


    async def request(self, room_id: str, from_uid: str, to_uid: str, amount: int):
        # 1) 既存リクエストの存在チェック
        exists = await self.cache.get_request(room_id, from_uid, to_uid)
        if exists:
            raise HTTPException(400, "既にリクエスト中です")

        # 2) キャッシュ登録 + TTL
        await self.cache.cache_request(room_id, from_uid, to_uid, amount)

        # 3) 通知
        await send_event(to_uid, {
            "type": "settle_requested",
            "room_id": room_id,
            "from_uid": from_uid,
            "to_uid": to_uid,
            "amount": amount,
        })

    async def approve_request(self, room_id: str, from_uid: str, to_uid: str):
        # キャッシュ取得
        req = await self.cache.get_request(room_id, from_uid, to_uid)
        if not req:
            raise HTTPException(404, "リクエストが見つからないか期限切れです")
        amount = req["amount"]

        # 残高検証
        await self._validate_balances(from_uid, to_uid, amount)

        # 永続化（PointRecord に２エントリ）
        round_id = _make_round_id("SATO")
        await self.point_repo.create({
            "room_id": room_id,
            "round_id": round_id,
            "points": [
                {"uid": from_uid,   "value": amount},
                {"uid": to_uid,     "value": -amount},
            ],
            "approved_by": [from_uid, to_uid],
            "created_at": datetime.now(),
            "is_deleted": False,
        })

        await self.cache.clear_request(room_id, from_uid, to_uid)
        await broadcast_event_to_room(room_id, {
            "type": "settle_completed",
            "room_id": room_id,
            "from_uid": from_uid,
            "to_uid": to_uid,
            "amount": amount,
        })

        return round_id

    async def reject_request(self, room_id: str, from_uid: str, to_uid: str):
        await self.cache.clear_request(room_id, from_uid, to_uid)
        payload = {
            "type": "settle_rejected",
            "room_id": room_id,
            "from_uid": from_uid,
            "to_uid": to_uid,
        }
        await send_event(from_uid, payload)
        await broadcast_event_to_room(room_id, payload)

    async def history(self, room_id: str):
        return await self.settle_repo.history(room_id)

    async def history_by_uid(self, uid: str):
        return await self.settle_repo.history_by_uid(uid)

    # ─── 内部ユーティリティ ───

    async def _validate_balances(self, from_uid: str, to_uid: str, amount: int):
        bal_from = await self._get_balance(from_uid)
        if bal_from + amount > 0:
            raise HTTPException(400, "送信元の残高不足です")

        bal_to = await self._get_balance(to_uid)
        if bal_to - amount < 0:
            raise HTTPException(400, "受信側の残高制限を超えます")

    async def _get_balance(self, uid: str) -> int:
        hist = await self.point_repo.history_by_uid(uid)
        return sum(
            p["value"]
            for rec in hist
            for p in rec["points"]
            if p["uid"] == uid
        )
