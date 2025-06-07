from fastapi import APIRouter, Depends, HTTPException
from src.services.room_service import RoomService
from src.repositories.room_repo import RoomRepository
from src.repositories.misc_repo import PointRecordRepository
from src.db import get_db
from src.schemas import RoomCreate, RoomResponse, RoomUpdate
from typing import List
from src.utils import get_current_uid

router = APIRouter()

def get_room_service(db=Depends(get_db)):
    return RoomService(RoomRepository(db), PointRecordRepository(db))

@router.post("/rooms", response_model=dict)
async def create_room(
    data: RoomCreate,
    current_uid: str = Depends(get_current_uid),
    service: RoomService = Depends(get_room_service),
):
    room_id = await service.create_room(current_uid, data.dict())
    return {"room_id": room_id}

@router.get("/rooms", response_model=List[RoomResponse])
async def list_rooms(
    current_uid: str = Depends(get_current_uid),
    service: RoomService = Depends(get_room_service),
):
    return await service.list_user_rooms(current_uid)

@router.get("/rooms/{room_id}", response_model=RoomResponse)
async def get_room(room_id: str, service: RoomService = Depends(get_room_service)):
    return await service.get_room(room_id)

@router.put("/rooms/{room_id}")
async def update_room(
    room_id: str,
    updates: RoomUpdate,
    current_uid: str = Depends(get_current_uid),
    service: RoomService = Depends(get_room_service),
):
    await service.update_room(room_id, updates.dict(exclude_unset=True), current_uid)
    return {"ok": True}

@router.delete("/rooms/{room_id}")
async def delete_room(
    room_id: str,
    current_uid: str = Depends(get_current_uid),
    service: RoomService = Depends(get_room_service),
):
    await service.delete_room(room_id, current_uid)
    return {"ok": True}
