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

    try:
        while True:
            data = await websocket.receive_json()
            if not isinstance(data, dict):
                continue

            event_type = data.get("type")
            if event_type == "ping":
                await websocket.send_json({"type": "pong"})
                continue

            if event_type == "enter_room":
                room_id = data.get("room_id")
                if room_id:
                    await redis_client.sadd(f"presence:{room_id}", uid)
                    await broadcast_event_to_room(room_id, {
                        "type": "user_entered",
                        "room_id": room_id,
                        "uid": uid,
                    })
                continue

            if event_type == "leave_room":
                room_id = data.get("room_id")
                if room_id:
                    await redis_client.srem(f"presence:{room_id}", uid)
                    await broadcast_event_to_room(room_id, {
                        "type": "user_left",
                        "room_id": room_id,
                        "uid": uid,
                    })
                continue

    except WebSocketDisconnect:
        # 切断時は全ルームから presence を削除
        keys = await redis_client.keys("presence:*")
        for key in keys:
            await redis_client.srem(key, uid)

    finally:
        # 接続リストから除去
        if active_connections.get(uid) is websocket:
            del active_connections[uid]


async def send_event(uid: str, event: dict):
    ws = active_connections.get(uid)
    if not ws:
        return
    try:
        await ws.send_json(event)
    except Exception:
        # 送信失敗したら接続削除
        if active_connections.get(uid) is ws:
            del active_connections[uid]


async def broadcast_event_to_room(room_id: str, event: dict):
    """room_id の全メンバーに対して send_event を実行"""
    room = await db.rooms.find_one({"room_id": room_id, "is_archived": False})
    if not room:
        return

    for member in room.get("members", []):
        await send_event(member["uid"], event)

