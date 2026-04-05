import uuid
import enum
from datetime import datetime, timezone
from sqlalchemy import (
    Column, String, Text, Float, Integer, Boolean, DateTime,
    ForeignKey, Enum, Table, JSON
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from database import Base


def utcnow():
    return datetime.now(timezone.utc)


# ── Enums ──

class ItemType(str, enum.Enum):
    todo = "todo"
    followup = "followup"
    reminder = "reminder"
    discussion = "discussion"
    goal = "goal"
    profile_update = "profile_update"
    note = "note"


class Urgency(str, enum.Enum):
    today = "today"
    this_week = "this_week"
    this_month = "this_month"
    someday = "someday"


class ItemStatus(str, enum.Enum):
    open = "open"
    done = "done"
    dismissed = "dismissed"


class ReportingLevel(str, enum.Enum):
    executive = "executive"
    director = "director"
    manager = "manager"
    ic = "ic"
    # Legacy values kept for DB compatibility
    employee = "employee"
    peer = "peer"
    other = "other"


class ProjectStatus(str, enum.Enum):
    active = "active"
    on_hold = "on_hold"
    complete = "complete"
    cancelled = "cancelled"


class LinkSource(str, enum.Enum):
    ai = "ai"
    manual = "manual"
    hashtag = "hashtag"


class LogType(str, enum.Enum):
    meeting_summary = "meeting_summary"
    profile_update = "profile_update"
    manual_note = "manual_note"


# ── Junction Tables ──

class PersonProject(Base):
    __tablename__ = "person_projects"
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)


class CaptureItemPerson(Base):
    __tablename__ = "capture_item_people"
    capture_item_id = Column(UUID(as_uuid=True), ForeignKey("capture_items.id", ondelete="CASCADE"), primary_key=True)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id", ondelete="CASCADE"), primary_key=True)
    link_source = Column(Enum(LinkSource), default=LinkSource.ai)


class CaptureItemProject(Base):
    __tablename__ = "capture_item_projects"
    capture_item_id = Column(UUID(as_uuid=True), ForeignKey("capture_items.id", ondelete="CASCADE"), primary_key=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    link_source = Column(Enum(LinkSource), default=LinkSource.ai)


# ── Core Models ──

class CaptureItem(Base):
    __tablename__ = "capture_items"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    raw_text = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    status = Column(Enum(ItemStatus), default=ItemStatus.open, index=True)
    resolved_at = Column(DateTime(timezone=True), nullable=True)
    resolution_note = Column(Text, nullable=True)

    # AI fields
    item_type = Column(Enum(ItemType), nullable=True)
    urgency = Column(Enum(Urgency), nullable=True)
    ai_confidence = Column(Float, nullable=True)
    ai_processed_at = Column(DateTime(timezone=True), nullable=True)

    # Manual overrides
    manual_type = Column(Enum(ItemType), nullable=True)
    manual_urgency = Column(Enum(Urgency), nullable=True)

    # Due date + pin + recurring + ordering
    due_date = Column(DateTime(timezone=True), nullable=True)
    is_pinned = Column(Boolean, default=False)
    recurrence = Column(String, nullable=True)  # daily, weekly, biweekly, monthly
    sort_order = Column(Integer, default=0)

    # Relations
    meeting_session_id = Column(UUID(as_uuid=True), ForeignKey("meeting_sessions.id"), nullable=True)
    linked_people = relationship("Person", secondary="capture_item_people", back_populates="capture_items")
    linked_projects = relationship("Project", secondary="capture_item_projects", back_populates="capture_items")
    notes = relationship("ItemNote", back_populates="capture_item", order_by="ItemNote.created_at")
    predecessors = relationship(
        "CaptureItem", secondary="item_links",
        primaryjoin="CaptureItem.id==item_links.c.item_id",
        secondaryjoin="CaptureItem.id==item_links.c.predecessor_id",
        backref="successors",
    )

    @property
    def effective_type(self):
        return self.manual_type or self.item_type

    @property
    def effective_urgency(self):
        return self.manual_urgency or self.urgency


class Person(Base):
    __tablename__ = "people"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    display_name = Column(Text, nullable=False)
    role = Column(Text, nullable=True)
    reporting_level = Column(Enum(ReportingLevel), default=ReportingLevel.other)
    email = Column(Text, nullable=True)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_archived = Column(Boolean, default=False)
    context_notes = Column(Text, default="")
    avatar = Column(Text, nullable=True)  # base64 data URL
    manager_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True)
    external_id = Column(String, nullable=True)  # per-import reference ID (not stable across exports)
    import_source = Column(String, nullable=True)  # "org_import" or null for manual
    profile = Column(JSON, default=lambda: {
        "spouse": "", "anniversary": "", "children": [],
        "pets": [], "birthday": "", "hobbies": "", "location": "",
        "address": "", "general": ""
    })

    manager = relationship("Person", remote_side="Person.id", foreign_keys=[manager_id], backref="direct_reports")
    capture_items = relationship("CaptureItem", secondary="capture_item_people", back_populates="linked_people")
    profile_logs = relationship("ProfileLog", back_populates="person", foreign_keys="ProfileLog.person_id")
    projects = relationship("Project", secondary="person_projects", back_populates="people")


class Project(Base):
    __tablename__ = "projects"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    name = Column(Text, nullable=False)
    short_code = Column(Text, nullable=True)
    status = Column(Enum(ProjectStatus), default=ProjectStatus.active)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    updated_at = Column(DateTime(timezone=True), default=utcnow, onupdate=utcnow)
    is_archived = Column(Boolean, default=False)
    context_notes = Column(Text, default="")

    capture_items = relationship("CaptureItem", secondary="capture_item_projects", back_populates="linked_projects")
    profile_logs = relationship("ProfileLog", back_populates="project", foreign_keys="ProfileLog.project_id")
    people = relationship("Person", secondary="person_projects", back_populates="projects")


class MeetingSession(Base):
    __tablename__ = "meeting_sessions"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    started_at = Column(DateTime(timezone=True), default=utcnow)
    ended_at = Column(DateTime(timezone=True), nullable=True)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    items_resolved = Column(Integer, default=0)
    items_added = Column(Integer, default=0)
    ai_summary = Column(Text, nullable=True)

    person = relationship("Person", foreign_keys=[person_id])
    project = relationship("Project", foreign_keys=[project_id])
    capture_items = relationship("CaptureItem", backref="meeting_session")


class ProfileLog(Base):
    __tablename__ = "profile_logs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    log_type = Column(Enum(LogType), nullable=False)
    content = Column(Text, nullable=False)
    person_id = Column(UUID(as_uuid=True), ForeignKey("people.id"), nullable=True)
    project_id = Column(UUID(as_uuid=True), ForeignKey("projects.id"), nullable=True)
    meeting_session_id = Column(UUID(as_uuid=True), ForeignKey("meeting_sessions.id"), nullable=True)

    person = relationship("Person", back_populates="profile_logs", foreign_keys=[person_id])
    project = relationship("Project", back_populates="profile_logs", foreign_keys=[project_id])


class ItemNote(Base):
    __tablename__ = "item_notes"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_item_id = Column(UUID(as_uuid=True), ForeignKey("capture_items.id", ondelete="CASCADE"), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)

    capture_item = relationship("CaptureItem", back_populates="notes")


item_links = Table(
    "item_links", Base.metadata,
    Column("item_id", UUID(as_uuid=True), ForeignKey("capture_items.id", ondelete="CASCADE"), primary_key=True),
    Column("predecessor_id", UUID(as_uuid=True), ForeignKey("capture_items.id", ondelete="CASCADE"), primary_key=True),
)


class Setting(Base):
    __tablename__ = "settings"
    key = Column(String, primary_key=True)
    value = Column(Text, nullable=False)


class AIJob(Base):
    __tablename__ = "ai_jobs"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    capture_item_id = Column(UUID(as_uuid=True), ForeignKey("capture_items.id", ondelete="CASCADE"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=utcnow)
    status = Column(String, default="pending")  # pending, processing, done, failed
    error = Column(Text, nullable=True)
