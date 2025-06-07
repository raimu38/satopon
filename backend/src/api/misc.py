from fastapi import APIRouter, Depends, HTTPException
from src.services.misc_service import PointService, SettlementService
from src.repositories.misc_repo import PointRecordRepository, SettlementRepository
from src.db import get_db
from src.schemas import PointRegisterRequest, SettlementCreate
from typing import List
from src.utils import get_current_uid

router = APIRouter()

def get_point_service(db=Depends(get_db)):
    return PointService(PointRecordRepository(db))

def get_settlement_service(db=Depends(get_db)):
    return SettlementService(SettlementRepository(db))

@router.post("/rooms/{room_id}/points")
async def add_points(
    room_id: str,
    data: PointRegisterRequest,
    current_uid: str = Depends(get_current_uid),
    service: PointService = Depends(get_point_service),
):
    # data.points, data.approved_byはクライアント側で「uid」送信前提
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
    await service.logical_delete(room_id, round_id)
    return {"ok": True}

@router.post("/rooms/{room_id}/settle")
async def settle(
    room_id: str,
    data: SettlementCreate,
    current_uid: str = Depends(get_current_uid),
    service: SettlementService = Depends(get_settlement_service),
):
    # data.to_uidもクライアントで「uid」送信前提
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
