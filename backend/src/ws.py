from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query, status, HTTPException
from jose import jwt
from src.config import SUPABASE_JWT_SECRET, AUTH_PROVIDER, FIREBASE_PROJECT_ID
from src.db import db  # ここで直接 import
import asyncio

router = APIRouter()
active_connections = {}

# トークンから「アプリuid」抽出
async def get_uid_from_token(token: str):
    print(f"[WS] get_uid_from_token called. token={token[:16]}...")
    if not token:
        print("[WS] No token provided.")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED)
    # --- sub or uid 抜き出し ---
    if AUTH_PROVIDER == "supabase":
        try:
            payload = jwt.decode(token, SUPABASE_JWT_SECRET, algorithms=["HS256"], audience="authenticated")
            external_id = payload["sub"]
            print(f"[WS] Supabase JWT decode OK. sub={external_id}")
        except Exception as e:
            print(f"[WS] Supabase JWT decode ERROR: {e}")
            raise
    elif AUTH_PROVIDER == "firebase":
        try:
            from google.auth.transport import requests
            from google.oauth2 import id_token
            id_info = id_token.verify_oauth2_token(token, requests.Request(), FIREBASE_PROJECT_ID)
            external_id = id_info["uid"]
            print(f"[WS] Firebase JWT decode OK. uid={external_id}")
        except Exception as e:
            print(f"[WS] Firebase JWT decode ERROR: {e}")
            raise
    else:
        print("[WS] Invalid auth provider")
        raise HTTPException(status_code=400, detail="Invalid auth provider")

    # --- external_idからuidをDB検索 ---
    user = await db.users.find_one({"external_id": external_id, "is_deleted": False})
    if not user:
        print(f"[WS] User not found for external_id={external_id}")
        raise HTTPException(status_code=401, detail="User not registered")
    print(f"[WS] JWT認証成功 external_id={external_id} → uid={user['uid']}")
    return user["uid"]

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket, token: str = Query(...)):
    print(f"[WS] New connection requested. token={token[:16]}...")
    try:
        uid = await get_uid_from_token(token)
        print(f"[WS] JWT認証成功 uid={uid}")
    except Exception as e:
        print(f"[WS] JWT認証失敗: {e}")
        await websocket.close()
        return

    await websocket.accept()
    active_connections[uid] = websocket
    print(f"[WS] ACCEPT: WebSocket accepted for uid={uid}. Active connections={list(active_connections.keys())}")
    try:
        while True:
            data = await websocket.receive_json()
            print(f"[WS] Received message from uid={uid}: {data}")
            if isinstance(data, dict) and data.get("type") == "ping":
                await websocket.send_json({"type": "pong"})
                print(f"[WS] Pong sent to uid={uid}")
    except WebSocketDisconnect:
        print(f"[WS] Disconnect: uid={uid}")
        if uid in active_connections and active_connections[uid] is websocket:
            del active_connections[uid]
        print(f"[WS] Now active connections: {list(active_connections.keys())}")
    except Exception as e:
        print(f"[WS] ERROR: {e} (uid={uid})")
        if uid in active_connections and active_connections[uid] is websocket:
            del active_connections[uid]
        await websocket.close()
        print(f"[WS] Closed connection for uid={uid}")

async def send_event(uid: str, event: dict):
    print(f"[WS] send_event called. uid={uid}, event={event}")
    ws = active_connections.get(uid)
    if ws:
        print(f"[WS] send_event: Sending event to active uid={uid}")
        try:
            await ws.send_json(event)
            print(f"[WS] send_event: Successfully sent event to uid={uid}")
        except Exception as e:
            print(f"[WS] send_event: FAILED to send event to uid={uid}, error={e}")
            if uid in active_connections and active_connections[uid] is ws:
                del active_connections[uid]
    else:
        print(f"[WS] send_event: No active connection for uid={uid}")

# 追加場所: src/ws.py の末尾（send_event の下あたり）
# src/ws.py の末尾に追加

async def broadcast_event_to_room(room_id: str, event: dict):
    """ room_id の全 member.uid に send_event を投げる """
    from src.db import db
    room = await db.rooms.find_one({"room_id": room_id, "is_archived": False})
    if not room:
        return
    for m in room.get("members", []):
        await send_event(m["uid"], event)
