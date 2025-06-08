from fastapi import APIRouter, Depends, HTTPException
from src.services.user_service import UserService
from src.repositories.user_repo import UserRepository
from src.repositories.room_repo import RoomRepository
from src.db import get_db
from src.schemas import UserCreate, UserUpdate, UserResponse
from typing import List
from src.utils import get_current_uid, get_current_external_id
from src.ws import active_connections

router = APIRouter()



def get_user_service(db=Depends(get_db)):
    return UserService(UserRepository(db), RoomRepository(db))

@router.get("/users", response_model=List[UserResponse])
async def list_users(
    with_online: int = 0,
    service: UserService = Depends(get_user_service)
):
    users = await service.list_users()
    if with_online:
        # uidで比較し、is_onlineを動的付与
        for u in users:
            u["is_online"] = u["uid"] in active_connections
    return users

@router.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate,
    external_id: str = Depends(get_current_external_id),
    service: UserService = Depends(get_user_service)
):
    return await service.create_user(user.dict(), external_id)

@router.get("/users/me", response_model=UserResponse)
async def get_me(
    current_uid: str = Depends(get_current_uid),   # ← ここ
    service: UserService = Depends(get_user_service)
):
    return await service.get_user(current_uid)

@router.put("/users/me", response_model=dict)
async def update_me(
    data: UserUpdate,
    current_uid: str = Depends(get_current_uid),   # ← ここ
    service: UserService = Depends(get_user_service)
):
    await service.update_display_name(current_uid, data.display_name)
    return {"ok": True}


@router.delete("/users/me", response_model=dict)
async def delete_me(
    current_uid: str = Depends(get_current_uid),
    service: UserService = Depends(get_user_service)
):
    await service.delete_user(current_uid)
    return {"ok": True}
