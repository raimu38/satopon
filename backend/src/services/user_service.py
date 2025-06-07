import random
import string
from src.repositories.user_repo import UserRepository

def generate_uid(length=8):
    return ''.join(random.choices(string.ascii_letters + string.digits, k=length))

class UserService:
    def __init__(self, repo: UserRepository):
        self.repo = repo

    # JWTのsub or uid = external_id として渡される
    async def create_user(self, user_data: dict, external_id: str):
        user_data = user_data.copy()
        user_data["external_id"] = external_id

        # すでに同じexternal_idのユーザーが存在すればそれを返す
        exists = await self.repo.get_by_external_id(external_id)
        if exists:
            return exists

        # 新規ならDB上の主キーuidをランダムで作成（重複も排除）
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
            raise Exception("Update failed")
        return ok

    async def list_users(self):
        return await self.repo.list_all()
