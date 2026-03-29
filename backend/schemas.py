from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID


# ── Capture ──

class CaptureCreate(BaseModel):
    raw_text: str

class CaptureUpdate(BaseModel):
    status: Optional[str] = None
    manual_type: Optional[str] = None
    manual_urgency: Optional[str] = None
    resolution_note: Optional[str] = None
    due_date: Optional[str] = None
    is_pinned: Optional[bool] = None
    recurrence: Optional[str] = None

class PersonRef(BaseModel):
    id: UUID
    display_name: str
    class Config:
        from_attributes = True

class ProjectRef(BaseModel):
    id: UUID
    name: str
    short_code: Optional[str] = None
    class Config:
        from_attributes = True

class CaptureResponse(BaseModel):
    id: UUID
    raw_text: str
    created_at: datetime
    updated_at: datetime
    status: str
    resolved_at: Optional[datetime] = None
    resolution_note: Optional[str] = None
    item_type: Optional[str] = None
    urgency: Optional[str] = None
    ai_confidence: Optional[float] = None
    ai_processed_at: Optional[datetime] = None
    manual_type: Optional[str] = None
    manual_urgency: Optional[str] = None
    effective_type: Optional[str] = None
    effective_urgency: Optional[str] = None
    linked_people: List[PersonRef] = []
    linked_projects: List[ProjectRef] = []
    meeting_session_id: Optional[UUID] = None

    class Config:
        from_attributes = True


# ── Person ──

class ProfileData(BaseModel):
    spouse: str = ""
    anniversary: str = ""
    children: List[str] = []
    pets: List[str] = []
    birthday: str = ""
    hobbies: str = ""
    location: str = ""
    general: str = ""

class PersonCreate(BaseModel):
    name: str
    display_name: str
    role: Optional[str] = None
    reporting_level: str = "other"
    email: Optional[str] = None
    context_notes: Optional[str] = ""
    profile: Optional[ProfileData] = None

class PersonUpdate(BaseModel):
    name: Optional[str] = None
    display_name: Optional[str] = None
    role: Optional[str] = None
    reporting_level: Optional[str] = None
    email: Optional[str] = None
    context_notes: Optional[str] = None
    is_archived: Optional[bool] = None
    profile: Optional[ProfileData] = None
    avatar: Optional[str] = None

class PersonResponse(BaseModel):
    id: UUID
    name: str
    display_name: str
    role: Optional[str] = None
    reporting_level: str
    email: Optional[str] = None
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    context_notes: str
    profile: Optional[ProfileData] = None
    open_item_count: int = 0

    class Config:
        from_attributes = True


# ── Project ──

class ProjectCreate(BaseModel):
    name: str
    short_code: Optional[str] = None
    status: str = "active"
    context_notes: Optional[str] = ""

class ProjectUpdate(BaseModel):
    name: Optional[str] = None
    short_code: Optional[str] = None
    status: Optional[str] = None
    context_notes: Optional[str] = None
    is_archived: Optional[bool] = None

class ProjectResponse(BaseModel):
    id: UUID
    name: str
    short_code: Optional[str] = None
    status: str
    created_at: datetime
    updated_at: datetime
    is_archived: bool
    context_notes: str
    open_item_count: int = 0

    class Config:
        from_attributes = True


# ── Meeting ──

class MeetingCreate(BaseModel):
    person_id: Optional[UUID] = None
    project_id: Optional[UUID] = None

class MeetingResponse(BaseModel):
    id: UUID
    started_at: datetime
    ended_at: Optional[datetime] = None
    person_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    items_resolved: int
    items_added: int
    ai_summary: Optional[str] = None

    class Config:
        from_attributes = True


# ── ProfileLog ──

class ProfileLogResponse(BaseModel):
    id: UUID
    created_at: datetime
    log_type: str
    content: str
    person_id: Optional[UUID] = None
    project_id: Optional[UUID] = None
    meeting_session_id: Optional[UUID] = None

    class Config:
        from_attributes = True


# ── Digest ──

class DigestResponse(BaseModel):
    overdue_items: List[CaptureResponse] = []
    today_items: List[CaptureResponse] = []
    this_week_count: int = 0
    this_week_items: List[CaptureResponse] = []
    stale_people: List[PersonRef] = []
    orphaned_items: List[CaptureResponse] = []
