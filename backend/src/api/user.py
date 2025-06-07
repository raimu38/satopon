from fastapi import APIRouter, Depends, HTTPException
from src.services.user_service import UserService
from src.repositories.user_repo import UserRepository
from src.db import get_db
from src.schemas import UserCreate, UserUpdate, UserResponse
from typing import List
from src.utils import get_current_uid   # ←ここに修正

router = APIRouter()

def get_user_service(db=Depends(get_db)):
    return UserService(UserRepository(db))

@router.post("/users", response_model=UserResponse)
async def create_user(
    user: UserCreate,
    current_uid: str = Depends(get_current_uid),   # ← ここ
    service: UserService = Depends(get_user_service)
):
    user_obj = await service.create_user(user.dict(), current_uid)
    return user_obj

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

@router.get("/users", response_model=List[UserResponse])
async def list_users(service: UserService = Depends(get_user_service)):
    return await service.list_users()
