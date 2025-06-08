from fastapi import APIRouter, Depends, HTTPException
from src.schemas import SettlementCreate, PointRegisterRequest, PointInput
from src.utils import get_current_uid
from src.db import get_db, get_redis
from src.repositories.misc_repo import (
    PointRecordRepository,
    SettlementRepository,
    SettlementCacheRepository,
)
from src.repositories.room_repo import RoomRepository
from src.repositories.round_cache_repo import RoundCacheRepository
from src.services.misc_service import PointService, SettlementService
from src.ws import send_event, broadcast_event_to_room
from datetime import datetime
from functools import lru_cache
router = APIRouter()


@lru_cache()
def get_point_service():
    mongo = get_db()
    cache = get_redis()
    return PointService(
        PointRecordRepository(mongo),
        RoomRepository(mongo),
        RoundCacheRepository(cache),
    )

def get_settlement_service(db=Depends(get_db)):
    return SettlementService(SettlementRepository(db))

@router.post("/rooms/{room_id}/points")
async def add_points(
    room_id: str,
    data: PointRegisterRequest,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.add_points(room_id, data.points, data.approved_by)
    return {"ok": True}

@router.get("/rooms/{room_id}/points/history")
async def point_history(room_id: str, service: PointService = Depends(get_point_service)):
    return await service.history(room_id)

@router.delete("/rooms/{room_id}/points/{round_id}")
async def delete_point_record(
    room_id: str,
    round_id: str,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.logical_delete(room_id, round_id, current_uid)
    return {"ok": True}

@router.post("/rooms/{room_id}/settle")
async def settle(
    room_id: str,
    data: SettlementCreate,
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service),
):
    await service.create({
        "room_id": room_id,
        "from_uid": current_uid,
        "to_uid": data.to_uid,
        "amount": data.amount,
    })
    return {"ok": True}

@router.post("/rooms/{room_id}/settle/{settlement_id}/approve")
async def approve_settlement(
    room_id: str,
    settlement_id: str,
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service),
):
    await service.approve(settlement_id)
    return {"ok": True}

@router.get("/rooms/{room_id}/settle/history")
async def settlement_history(room_id: str, service: SettlementService = Depends(get_settlement_service)):
    return await service.history(room_id)

@router.post("/rooms/{room_id}/points/{round_id}/approve")
async def approve_point_record(
    room_id: str,
    round_id: str,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.approve(room_id, round_id, current_uid)
    return {"ok": True}

@router.get("/rooms/{room_id}/points/{round_id}/status")
async def point_approval_status(
    room_id: str,
    round_id: str,
    service: PointService = Depends(get_point_service),
):
    return await service.get_approval_status(room_id, round_id)

# ユーザーごとの全ポイント記録
@router.get("/users/me/points/history")
async def user_point_history(
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service)
):
    return await service.history_by_uid(current_uid)

# ユーザーごとの全精算記録
@router.get("/users/me/settle/history")
async def user_settle_history(
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service)
):
    return await service.history_by_uid(current_uid)

# ——— 以下を追加 ———

@router.post("/rooms/{room_id}/points/start")
async def start_point_round(
    room_id: str,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.start_round(room_id)
    return {"ok": True}

@router.post("/rooms/{room_id}/points/submit")
async def submit_point(
    room_id: str,
    data: PointInput,        # {uid, value}
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.submit_score(room_id, current_uid, data.value)
    return {"ok": True}

@router.post("/rooms/{room_id}/points/finalize")
async def finalize_point_round(
    room_id: str,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    return await service.finalize_round(room_id)

@router.post("/rooms/{room_id}/points/cancel")
async def cancel_point_round(
    room_id: str,
    reason: str,
    service: PointService = Depends(get_point_service),
):
    await service.cancel_round(room_id, reason)
    return {"ok": True}


# --- ① 精算リクエストをキャッシュに保存し、相手に通知 ---
@router.post("/rooms/{room_id}/settle/request")
async def request_settlement(
    room_id: str,
    data: SettlementCreate,
    current_uid: str = Depends(get_current_uid),
    redis_client=Depends(get_redis),
):
    cache = SettlementCacheRepository(redis_client)

    # 既に保留中か？
    exists = await cache.get_request(room_id, current_uid, data.to_uid)
    if exists:
        raise HTTPException(400, detail="既にリクエスト中です")

    # 自分の残高バリデーションはフロント or 別エンドポイントで行えます
    # とりあえずキャッシュ登録
    await cache.cache_request(room_id, current_uid, data.to_uid, data.amount)

    # WebSocket で相手に届く通知
    await send_event(data.to_uid, {
        "type": "settle_requested",
        "room_id": room_id,
        "from_uid": current_uid,
        "to_uid": data.to_uid,
        "amount": data.amount,
    })
    return {"ok": True}

# --- ② 承認: キャッシュ→永続化→通知 ---
@router.post("/rooms/{room_id}/settle/request/{from_uid}/approve")
async def approve_settlement(
    room_id: str,
    from_uid: str,
    current_uid: str = Depends(get_current_uid),
    redis_client=Depends(get_redis),
    point_svc: PointService = Depends(get_point_service),
    persist_svc: SettlementService = Depends(get_settlement_service),
):
    cache = SettlementCacheRepository(redis_client)

    # キャッシュからリクエスト取得
    req = await cache.get_request(room_id, from_uid, current_uid)
    if not req:
        raise HTTPException(404, detail="リクエストが見つからないか期限切れです")

    amount = req["amount"]

    # (A) 送信元(from_uid)の残高チェック
    hist_from = await point_svc.history_by_uid(from_uid)
    bal_from = sum(
        p["value"]
        for rec in hist_from
        for p in rec["points"]
        if p["uid"] == from_uid
    )
    if bal_from + amount > 0:
        raise HTTPException(400, detail="送信元の残高不足です")
    
    # (B) 受信側(current_uid)の残高制限チェック
    hist_to = await point_svc.history_by_uid(current_uid)
    bal_to = sum(
        p["value"]
        for rec in hist_to
        for p in rec["points"]
        if p["uid"] == current_uid
    )
    if bal_to - amount < 0:
        raise HTTPException(400, detail="受信側の残高制限を超えます")

    # 永続化: MongoDB に２つのポイントエントリを作成
    round_id = f"SETTLE_{from_uid}_{current_uid}_{int(datetime.utcnow().timestamp())}"
    await point_svc.point_repo.create({
        "room_id": room_id,
        "round_id": round_id,
        "points": [
            {"uid": from_uid,   "value": amount},
            {"uid": current_uid, "value": -amount},
        ],
        "approved_by": [from_uid, current_uid],
        "created_at": datetime.utcnow(),
        "is_deleted": False,
    })

    # キャッシュ削除
    await cache.clear_request(room_id, from_uid, current_uid)

    # ルーム全員へ完了通知
    await broadcast_event_to_room(room_id, {
        "type": "settle_completed",
        "room_id": room_id,
        "from_uid": from_uid,
        "to_uid": current_uid,
        "amount": amount,
    })
    return {"ok": True}

# --- ③ 拒否: キャッシュ削除＋通知 ---
@router.post("/rooms/{room_id}/settle/request/{from_uid}/reject")
async def reject_settlement(
    room_id: str,
    from_uid: str,
    current_uid: str = Depends(get_current_uid),
    redis_client=Depends(get_redis),
):
    cache = SettlementCacheRepository(redis_client)
    # キャッシュを消すだけ
    await cache.clear_request(room_id, from_uid, current_uid)
    # 送信元へ拒否通知
    await send_event(from_uid, {
        "type": "settle_rejected",
        "room_id": room_id,
        "by_uid": current_uid,
    })
    return {"ok": True}
