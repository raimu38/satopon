# src/repositories/round_cache_repo.py

class RoundCacheRepository:
    def __init__(self, redis):
        self.redis = redis

    def _round_key(self, room_id: str) -> str:
        return f"round:{room_id}"

    def _subs_key(self, room_id: str) -> str:
        return f"{self._round_key(room_id)}:subs"

    def _approvals_key(self, room_id: str) -> str:
        return f"{self._round_key(room_id)}:apprs"

    async def start(self, room_id: str, round_id: str, ttl: int = 180) -> None:
        # ラウンド開始情報を保存し、TTLをセット
        await self.redis.hset(self._round_key(room_id), mapping={"round_id": round_id})
        await self.redis.expire(self._round_key(room_id), ttl)
        await self.redis.expire(self._subs_key(room_id), ttl)
        await self.redis.expire(self._approvals_key(room_id), ttl)

    async def get_round_id(self, room_id: str) -> str | None:
        # 現在のラウンドIDを取得
        return await self.redis.hget(self._round_key(room_id), "round_id")

    async def add_submission(self, room_id: str, uid: str, value: int, ttl: int = 180) -> str | None:
        # スコアを記録し、TTLをリフレッシュ
        await self.redis.hset(self._subs_key(room_id), uid, value)
        await self.redis.expire(self._subs_key(room_id), ttl)
        # ラウンドIDもTTLリフレッシュ
        await self.redis.expire(self._round_key(room_id), ttl)
        return await self.get_round_id(room_id)

    async def get_submissions(self, room_id: str) -> dict[str, int]:
        raw = await self.redis.hgetall(self._subs_key(room_id))
        return {k: int(v) for k, v in raw.items()}

    async def add_approval(self, room_id: str, uid: str, ttl: int = 180) -> None:
        await self.redis.sadd(self._approvals_key(room_id), uid)
        await self.redis.expire(self._approvals_key(room_id), ttl)
        await self.redis.expire(self._round_key(room_id), ttl)

    async def get_approvals(self, room_id: str) -> set[str]:
        return await self.redis.smembers(self._approvals_key(room_id))

    async def clear(self, room_id: str) -> None:
        # ラウンド関連キーをすべて削除
        await self.redis.delete(
            self._round_key(room_id),
            self._subs_key(room_id),
            self._approvals_key(room_id),
        )
