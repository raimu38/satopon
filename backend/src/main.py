from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from src.notify import send_ntfy_notification

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # 開発中のみ許可、必要に応じて絞る
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

connections = set()

@app.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    connections.add(websocket)
    try:
        while True:
            data = await websocket.receive_text()
            await websocket.send_text(f"Echo: {data}")
    except WebSocketDisconnect:
        connections.remove(websocket)

@app.post("/notify")
async def notify_all():
    for conn in connections:
        await conn.send_text("🔔 新しい通知があります")
    return {"status": "ok"}


@app.post("/notify1")
async def trigger_notification():
    await send_ntfy_notification("🔔 新しいイベントが発生しました！")
    return {"status": "sent"}

