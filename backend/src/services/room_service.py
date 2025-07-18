from src.repositories.room_repo import RoomRepository
from src.repositories.misc_repo import PointRecordRepository
from fastapi import HTTPException
from datetime import datetime
import uuid
from src.ws import send_event, broadcast_event_to_room 
import random
import string
import asyncio

def generate_room_id(length=5):
    chars = string.ascii_uppercase + string.digits  # 例：A-Z, 0-9
    return ''.join(random.choices(chars, k=length))



class RoomService:
    def __init__(self, room_repo: RoomRepository, point_repo: PointRecordRepository):
        self.room_repo = room_repo
        self.point_repo = point_repo
        self.pending_timers = {}

    async def create_room(self, uid: str, data: dict):
        name = data.get("name", "")
        if not (1 <= len(name) <= 20):
            raise HTTPException(status_code=400, detail="ルーム名は1〜20文字で指定してください")

        while True:
            room_id = generate_room_id(5)
            if not await self.room_repo.exists(room_id):
                break

        payload = {
            "room_id": room_id,
            "name": data["name"],
            "description": data.get("description"),
            "color_id": data["color_id"],
            "created_by": uid,
            "created_at": datetime.now(),
            "is_archived": False,
            "members": [{"uid": uid, "joined_at": datetime.now()}],
            "pending_members": []
        }
        await self.room_repo.create(payload)
        return room_id

    async def get_room(self, room_id: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        return room
    async def list_all_rooms(self):
        return await self.room_repo.list_all()

    async def list_user_rooms(self, uid: str):
        return await self.room_repo.list_rooms_for_user(uid)

    async def update_room(self, room_id: str, updates: dict, current_uid: str):

        if "name" in updates:
            name = updates["name"] or ""
            if not (1 <= len(name) <= 20):
                raise HTTPException(status_code=400, detail="ルーム名は1〜20文字で指定してください")
        room = await self.room_repo.get_by_id(room_id)

        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if room["created_by"] != current_uid:
            raise HTTPException(status_code=403, detail="Not allowed to update this room")
        return await self.room_repo.update(room_id, updates)

    async def delete_room(self, room_id: str, current_uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if room["created_by"] != current_uid:
            raise HTTPException(status_code=403, detail="Not allowed to delete this room")

        # --- 全員ポイント残高チェック ---
        point_histories = await self.point_repo.history(room_id)
        balances = {}
        for record in point_histories:
            if record.get("is_deleted"):
                continue
            for pt in record.get("points", []):
                uid = pt["uid"]
                balances[uid] = balances.get(uid, 0) + pt["value"]
        for member in room.get("members", []):
            if balances.get(member["uid"], 0) != 0:
                raise HTTPException(status_code=400, detail="ルームメンバーにポイント残高があるため削除不可")
        # 論理削除
        return await self.room_repo.update(room_id, {"is_archived": True})

    async def join_room(self, room_id: str, uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if any(m["uid"] == uid for m in room.get("members", [])):
            return True
        await self.room_repo.add_member(room_id, uid)
        return True

    async def request_join(self, room_id: str, applicant_uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if any(m["uid"] == applicant_uid for m in room.get("members", [])):
            raise HTTPException(status_code=400, detail="Already a member")
        if any(m["uid"] == applicant_uid for m in room.get("pending_members", [])):
            raise HTTPException(status_code=400, detail="Already requested")
        await self.room_repo.add_pending_member(room_id, applicant_uid)
        for member in room["members"]:
            await send_event(member["uid"], {"type": "join_request", "room_id": room_id, "applicant_uid": applicant_uid})
        key = f"{room_id}:{applicant_uid}"
        if key in self.pending_timers:
            self.pending_timers[key].cancel()
        self.pending_timers[key] = asyncio.create_task(
            self._auto_cancel_join_request(room_id, applicant_uid, key)
        )
    
    async def _auto_cancel_join_request(self, room_id, applicant_uid, key):
        try:
            await asyncio.sleep(30)
            room = await self.room_repo.get_by_id(room_id)
            if any(m["uid"] == applicant_uid for m in room.get("pending_members", [])):
                await self.cancel_join_request(room_id, applicant_uid)
        except asyncio.CancelledError:
            pass
        finally:
            self.pending_timers.pop(key, None)

    def _cancel_pending_timer(self, room_id, applicant_uid):
        key = f"{room_id}:{applicant_uid}"
        task = self.pending_timers.pop(key, None)
        if task:
            task.cancel()

    # approve_member
    async def approve_member(self, room_id: str, applicant_uid: str, approver_uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not any(m["uid"] == approver_uid for m in room["members"]):
            raise HTTPException(status_code=403, detail="No permission")
        ok = await self.room_repo.approve_pending_member(room_id, applicant_uid)
        if not ok:
            raise HTTPException(status_code=400, detail="Already processed or not pending")
        await send_event(applicant_uid, {"type": "join_approved", "room_id": room_id})
        await broadcast_event_to_room(room_id, {
            "type": "join_approved",
            "room_id": room_id,
            "applicant_uid": applicant_uid,
        })
        self._cancel_pending_timer(room_id, applicant_uid)


    # cancel_join_request
    async def cancel_join_request(self, room_id: str, user_id: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        ok = await self.room_repo.remove_pending_member(room_id, user_id)
        if not ok:
            raise HTTPException(status_code=400, detail="Not in pending list or already processed")
        for m in room["members"]:
            await send_event(m["uid"], {"type": "join_request_cancelled", "room_id": room_id, "user_id": user_id})
        await send_event(user_id, {"type": "join_request_cancelled", "room_id": room_id, "user_id": user_id})
        self._cancel_pending_timer(room_id, user_id)
    
    # reject_member
    async def reject_member(self, room_id: str, applicant_uid: str, approver_uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not any(m["uid"] == approver_uid for m in room["members"]):
            raise HTTPException(status_code=403, detail="No permission")
        ok = await self.room_repo.remove_pending_member(room_id, applicant_uid)
        if not ok:
            raise HTTPException(status_code=400, detail="Already processed or not pending")
        event_payload = {
            "type": "join_rejected",
            "room_id": room_id,
            "applicant_uid": applicant_uid
        }
        await broadcast_event_to_room(room_id, event_payload)
        await send_event(applicant_uid, event_payload)
        self._cancel_pending_timer(room_id, applicant_uid)
    
    async def leave_room(self, room_id: str, uid: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        if room["created_by"] == uid:
            # 自分以外にメンバーがいるなら退会不可
            members = [m for m in room.get("members", []) if m["uid"] != uid]
            if members:
                raise HTTPException(status_code=400, detail="ルーム作成者は他のメンバーがいる間は退会できません")
            # 作成者1人だけなら→退会＝削除で良い（バリデーションはdelete_roomのロジックでOK）
            await self.delete_room(room_id, uid)
            return True
        balance = 0
        from collections import defaultdict
        point_histories = await self.point_repo.history(room_id)
        for record in point_histories:
            if record.get("is_deleted"): continue
            for pt in record.get("points", []):
                if pt["uid"] == uid:
                    balance += pt["value"]
        if balance != 0:
            raise HTTPException(status_code=400, detail="ポイント残高が0でないため退会不可")
        await self.room_repo.remove_member(room_id, uid)
        return True
