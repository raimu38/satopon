from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
import asyncio

router = APIRouter()
active_connections = {}

@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    uid = "..."  # JWTやクエリで認証
    active_connections[uid] = websocket
    try:
        while True:
            data = await websocket.receive_text()
            # 受信メッセージを処理
            # 例: {"type": "join_request", ...}
            # →各種イベントをブロードキャスト
    except WebSocketDisconnect:
        del active_connections[uid]
        # RedisやDBでオンライン状態も更新

# 個別イベント配信例
async def send_event(uid: str, event: dict):
    ws = active_connections.get(uid)
    if ws:
        await ws.send_json(event)

