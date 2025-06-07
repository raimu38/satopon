from src.repositories.room_repo import RoomRepository
from src.repositories.misc_repo import PointRecordRepository
from fastapi import HTTPException
from datetime import datetime
import uuid

class RoomService:
    def __init__(self, room_repo: RoomRepository, point_repo: PointRecordRepository):
        self.room_repo = room_repo
        self.point_repo = point_repo

    async def create_room(self, uid: str, data: dict):
        room_id = str(uuid.uuid4())
        payload = {
            "room_id": room_id,
            "name": data["name"],
            "description": data.get("description"),
            "color_id": data["color_id"],
            "created_by": uid,
            "created_at": datetime.utcnow(),
            "is_archived": False,
            "members": [{"uid": uid, "joined_at": datetime.utcnow()}]
        }
        await self.room_repo.create(payload)
        return room_id

    async def get_room(self, room_id: str):
        room = await self.room_repo.get_by_id(room_id)
        if not room:
            raise HTTPException(status_code=404, detail="Room not found")
        return room

    async def list_user_rooms(self, uid: str):
        return await self.room_repo.list_rooms_for_user(uid)

    async def update_room(self, room_id: str, updates: dict, current_uid: str):
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
