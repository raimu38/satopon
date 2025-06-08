from fastapi import APIRouter, Depends, HTTPException
from src.services.misc_service import PointService, SettlementService
from src.repositories.misc_repo import PointRecordRepository, SettlementRepository
from src.repositories.room_repo import RoomRepository
from src.db import get_db, get_redis
from src.schemas import PointRegisterRequest, SettlementCreate, PointInput
from src.utils import get_current_uid
from src.repositories.round_cache_repo import RoundCacheRepository

router = APIRouter()

from functools import lru_cache

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
