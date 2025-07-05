from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status, HTTPException
from jose import jwt
from src.config import SUPABASE_JWT_SECRET, AUTH_PROVIDER, FIREBASE_PROJECT_ID
from src.db import db, redis_client
import asyncio

# Firebase 用
from google.oauth2 import id_token as firebase_id_token
from google.auth.transport.requests import Request as GoogleRequest

router = APIRouter()
active_connections: dict[str, WebSocket] = {}


async def get_uid_from_token(token: str) -> str:
    if not token:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token")

    external_id: str | None = None

    if AUTH_PROVIDER == "supabase":
        try:
            payload = jwt.decode(
                token,
                SUPABASE_JWT_SECRET,
                algorithms=["HS256"],
                audience="authenticated"
            )
            external_id = payload.get("sub")
        except Exception as e:
            # JWT エラーはそのまま伝播させる
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail=f"Supabase JWT decode error: {e}")

    elif AUTH_PROVIDER == "firebase":
        try:
            id_info = firebase_id_token.verify_firebase_token(
                token,
                GoogleRequest(),
                audience=FIREBASE_PROJECT_ID
            )
            # Firebase トークンのペイロードには user_id or sub が入っている
            external_id = id_info.get("user_id") or id_info.get("sub")
        except Exception as e:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                                detail=f"Invalid Firebase token: {e}")
    else:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                            detail=f"Unknown AUTH_PROVIDER: {AUTH_PROVIDER}")

    if not external_id:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="Could not retrieve external_id from token")

    user = await db.users.find_one({"external_id": external_id, "is_deleted": False})
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                            detail="User not registered")

    return user["uid"]


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    # 初回接続時にトークン検証
    try:
        uid = await get_uid_from_token(token)
    except HTTPException:
        await websocket.close(code=status.WS_1008_POLICY_VIOLATION)
        return

    await websocket.accept()
    active_connections[uid] = websocket

    # SettlementCacheRepository を使ってキャッシュを探せるように準備
    from src.repositories.misc_repo import SettlementCacheRepository
    settle_cache = SettlementCacheRepository(redis_client)

    async def cancel_round(room_id: str, reason: str):
        from src.repositories.misc_repo import RoundCacheRepository
        cache = RoundCacheRepository(redis_client)
        await cache.clear(room_id)
        await broadcast_event_to_room(room_id, {
            "type":    "point_round_cancelled",
            "room_id": room_id,
            "reason":  reason,
        })

    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue

            event_type = data.get("type")
            room_id    = data.get("room_id")

            # ping/pong
            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            # 入室／退室
            if event_type in ("enter_room", "leave_room") and room_id:
                # presence 更新
                if event_type == "enter_room":
                    await redis_client.sadd(f"presence:{room_id}", uid)
                else:
                    await redis_client.srem(f"presence:{room_id}", uid)

                # user_entered / user_left をブロードキャスト
                await broadcast_event_to_room(room_id, {
                    "type":    f"user_{'entered' if event_type=='enter_room' else 'left'}",
                    "room_id": room_id,
                    "uid":     uid,
                })

                # --- 追加処理: 未承認の SATO リクエストをキャッシュから探して即プッシュ ---
                if event_type == "enter_room":
                    # キーのパターン: settle:<room_id>:<from_uid>-><to_uid>
                    async for key in redis_client.scan_iter(f"settle:{room_id}:*->{uid}"):
                        data = await redis_client.hgetall(key)
                        if data and data.get("amount"):
                            await websocket.send_json({
                                "type":     "settle_requested",
                                "room_id":  data["room_id"],
                                "from_uid": data["from_uid"],
                                "to_uid":   data["to_uid"],
                                "amount":   int(data["amount"]),
                            })
                # ------------------------------------------------------------------

                # アクティブルラウンドがあればキャンセル
                meta = await redis_client.hgetall(f"points:{room_id}")
                if meta.get("round_id"):
                    await cancel_round(room_id, "User entered/left during active round")

                continue

            # クライアントからの明示的キャンセル
            if event_type == "cancel_point_round" and room_id:
                await cancel_round(room_id, "User cancelled the round")
                continue

            # （他のイベント処理があればここに…）

    except WebSocketDisconnect:
        # 切断時はすべての presence:* から削除
        keys = await redis_client.keys("presence:*")
        for key in keys:
            await redis_client.srem(key, uid)

    finally:
        if active_connections.get(uid) is websocket:
            del active_connections[uid]
async def send_event(uid: str, event: dict):
    ws = active_connections.get(uid)
    if not ws:
        return
    try:
        await ws.send_json(event)
    except Exception:
        if active_connections.get(uid) is ws:
            del active_connections[uid]


async def broadcast_event_to_room(room_id: str, event: dict):
    """room_id の全メンバーに対して send_event を実行"""
    room = await db.rooms.find_one({"room_id": room_id, "is_archived": False})
    if not room:
        return

    for member in room.get("members", []):
        await send_event(member["uid"], event)

