# src/api/misc_api.py

from fastapi import APIRouter, Depends, HTTPException
from functools import lru_cache
from datetime import datetime

from src.schemas import (
    SettlementCreate,
    PointRegisterRequest,
    PointInput,
)
from src.utils import get_current_uid
from src.db import get_db, get_redis

from src.repositories.misc_repo import (
    PointRecordRepository,
    SettlementRepository,
    SettlementCacheRepository,
)
from src.repositories.room_repo import RoomRepository
from src.repositories.round_cache_repo import RoundCacheRepository

from src.services.misc_service import (
    PointService,
    SettlementService,
)

from src.ws import send_event, broadcast_event_to_room


router = APIRouter()


# ---- Dependency factories ----

@lru_cache()
def get_point_service() -> PointService:
    mongo = get_db()
    cache = get_redis()
    return PointService(
        point_repo=PointRecordRepository(mongo),
        room_repo=RoomRepository(mongo),
        cache_repo=RoundCacheRepository(cache),
    )

@lru_cache()
def get_settlement_service() -> SettlementService:
    mongo = get_db()
    cache = get_redis()
    return SettlementService(
        settle_repo=SettlementRepository(mongo),
        cache_repo=SettlementCacheRepository(cache),
        point_repo=PointRecordRepository(mongo),
    )


# ---- Point endpoints ----



@router.get("/rooms/{room_id}/points/history")
async def point_history(
    room_id: str,
    service: PointService = Depends(get_point_service),
):
    return await service.history(room_id)




@router.post("/rooms/{room_id}/points/start")
async def start_point_round(
    room_id: str,
    service: PointService = Depends(get_point_service),
):
    await service.start_round(room_id)
    return {"ok": True}


@router.post("/rooms/{room_id}/points/submit")
async def submit_point(
    room_id: str,
    data: PointInput,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.submit_score(room_id, current_uid, data.value)
    return {"ok": True}


@router.post("/rooms/{room_id}/points/finalize")
async def finalize_point_round(
    room_id: str,
    service: PointService = Depends(get_point_service),
):
    return await service.finalize_round(room_id)




@router.post("/rooms/{room_id}/points/{round_id}/approve")
async def approve_point_record(
    room_id: str,
    round_id: str,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    await service.approve(room_id, round_id, current_uid)
    return {"ok": True}





@router.get("/users/me/points/history")
async def user_point_history(
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service), # ここを修正
):
    return await service.point_repo.history_by_uid(current_uid) # ここを修正


# ---- Settlement endpoints ----


@router.post("/rooms/{room_id}/settle/request")
async def request_settlement(
    room_id: str,
    data: SettlementCreate,
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service),
):
    await service.request(room_id, current_uid, data.to_uid, data.amount)
    return {"ok": True}


@router.post("/rooms/{room_id}/settle/request/{from_uid}/approve")
async def approve_settlement_request(
    room_id: str,
    from_uid: str,
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service),
):
    await service.approve_request(room_id, from_uid, current_uid)
    return {"ok": True}


@router.post("/rooms/{room_id}/settle/request/{from_uid}/reject")
async def reject_settlement_request(
    room_id: str,
    from_uid: str,
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service),
):
    await service.reject_request(room_id, from_uid, current_uid)
    return {"ok": True}


@router.get("/rooms/{room_id}/settle/history")
async def settlement_history(
    room_id: str,
    service: SettlementService = Depends(get_settlement_service),
):
    return await service.history(room_id)



