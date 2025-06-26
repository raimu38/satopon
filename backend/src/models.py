from pydantic import BaseModel, Field, EmailStr
from typing import List, Optional
from datetime import datetime

# --- User ---
class UserModel(BaseModel):
    uid: str                   # 内部主キー
    external_id: str           # sub（supabaseやfirebaseのsub）
    display_name: str
    email: EmailStr
    icon_url: Optional[str] = None
    registered_at: datetime
    is_deleted: bool = False

# --- Room ---
class MemberObj(BaseModel):
    uid: str
    joined_at: datetime

class PendingMemberObj(BaseModel):
    uid: str
    requested_at: datetime

class RoomModel(BaseModel):
    room_id: str
    name: str
    description: Optional[str] = None
    color_id: int
    created_by: str
    created_at: datetime
    is_archived: bool = False
    members: List[MemberObj] = []
    pending_members: List[PendingMemberObj] = [] 

# --- PointRecord ---
class PointObj(BaseModel):
    uid: str
    value: int

class PointRecordModel(BaseModel):
    room_id: str
    round_id: str
    points: List[PointObj]
    created_at: datetime
    approved_by: List[str]
    is_deleted: bool = False

# --- Settlement ---
class SettlementModel(BaseModel):
    room_id: str
    from_uid: str
    to_uid: str
    amount: int
    approved: bool
    created_at: datetime
    approved_at: Optional[datetime] = None
    is_deleted: bool = False

