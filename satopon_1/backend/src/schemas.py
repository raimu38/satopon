# src/schemas.py

from pydantic import BaseModel, EmailStr
from typing import List, Optional
from datetime import datetime

# --- User ---
class UserCreate(BaseModel):
    display_name: str
    email: EmailStr
    icon_url: Optional[str] = None

class UserResponse(BaseModel):
    uid: str
    display_name: str
    icon_url: Optional[str]
    registered_at: datetime
    is_online: Optional[bool] = None   # 追加

class UserUpdate(BaseModel):
    display_name: str

# --- Room ---
class RoomCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color_id: int

class RoomUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    color_id: Optional[int] = None

class RoomResponse(BaseModel):
    room_id: str
    name: str
    description: Optional[str]
    color_id: int
    created_by: str
    created_at: datetime
    is_archived: bool
    members: List[dict]
    pending_members: List[dict]   # ←これを追加

class ApproveRejectBody(BaseModel):
    applicant_user_id: str

# --- Point ---
class PointInput(BaseModel):
    uid: str
    value: int

class PointRegisterRequest(BaseModel):
    points: List[PointInput]
    approved_by: List[str]

class PointHistoryResponse(BaseModel):
    round_id: str
    points: List[PointInput]
    created_at: datetime
    approved_by: List[str]
    is_deleted: bool
    _id: Optional[str]

# --- Settlement ---
class SettlementCreate(BaseModel):
    to_uid: str
    amount: int

class SettlementHistoryResponse(BaseModel):
    from_uid: str
    to_uid: str
    amount: int
    approved: bool
    created_at: datetime
    approved_at: Optional[datetime]
    is_deleted: bool
