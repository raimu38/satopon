import random
import string
from src.repositories.user_repo import UserRepository
from src.repositories.room_repo import RoomRepository
from fastapi import HTTPException

def generate_uid(length=8):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

class UserService:
    def __init__(self, repo: UserRepository, room_repo: RoomRepository):
        self.repo = repo
        self.room_repo = room_repo

    # JWTのsub or uid = external_id として渡される
    async def create_user(self, user_data: dict, external_id: str):
        user_data = user_data.copy()
        user_data["external_id"] = external_id

    # まずactiveなユーザーを探す
        exists = await self.repo.get_by_external_id(external_id)
        if exists:
            return exists

    # 論理削除ユーザーを復活させる
        deleted_user = await self.repo.collection.find_one({"external_id": external_id, "is_deleted": True})
        if deleted_user:
            await self.repo.collection.update_one(
                {"external_id": external_id},
                {"$set": {**user_data, "is_deleted": False}}
            )
            return await self.repo.get_by_external_id(external_id)

    # どちらもいなければ新規
        uid = generate_uid()
        while await self.repo.get_by_uid(uid):
            uid = generate_uid()
        user_data["uid"] = uid

        await self.repo.create(user_data)
        return await self.repo.get_by_uid(uid)

    # DB主キーuidで取得
    async def get_user(self, uid: str):
        user = await self.repo.get_by_uid(uid)
        if not user:
            raise Exception("User not found")
        return user


    async def update_display_name(self, uid: str, display_name: str):
        ok = await self.repo.update_display_name(uid, display_name)
        if not ok:
            raise HTTPException(status_code=404, detail="User not found or already deleted")
        return ok

    async def list_users(self):
        users = await self.repo.list_all()
        # email以外を抽出して新しいdictを作る
        result = [
            {k: v for k, v in user.items() if k != "email"}
            for user in users
        ]
        return result
 
    async def delete_user(self, uid: str):
        # ルーム所属チェック
        rooms = await self.room_repo.list_rooms_for_user(uid)
        if rooms:
            raise Exception("ユーザーはまだいずれかのルームに所属しているため削除できません")
        # 論理削除
        ok = await self.repo.logical_delete(uid)
        if not ok:
            raise Exception("ユーザー削除に失敗しました")
        return True



