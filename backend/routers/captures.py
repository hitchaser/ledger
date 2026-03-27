import re
from uuid import UUID
from typing import Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import (
    CaptureItem, Person, Project, CaptureItemPerson, CaptureItemProject,
    AIJob, ItemStatus, ItemType, Urgency, LinkSource
)
from schemas import CaptureCreate, CaptureUpdate, CaptureResponse

router = APIRouter(prefix="/api/captures", tags=["captures"])


def parse_hashtags(text: str, db: Session):
    """Parse and strip hashtag shortcuts from capture text."""
    urgency_map = {"today": Urgency.today, "week": Urgency.this_week, "month": Urgency.this_month, "someday": Urgency.someday}
    type_map = {"todo": ItemType.todo, "followup": ItemType.followup, "reminder": ItemType.reminder,
                "goal": ItemType.goal, "note": ItemType.note, "discussion": ItemType.discussion}

    manual_urgency = None
    manual_type = None
    linked_people = []
    linked_projects = []

    tags = re.findall(r"#(\w+)", text)
    for tag in tags:
        tl = tag.lower()
        if tl in urgency_map:
            manual_urgency = urgency_map[tl]
        elif tl in type_map:
            manual_type = type_map[tl]
        else:
            person = db.query(Person).filter(
                Person.is_archived == False,
                Person.display_name.ilike(tl)
            ).first()
            if person:
                linked_people.append(person)
            else:
                project = db.query(Project).filter(
                    Project.is_archived == False,
                    or_(Project.short_code.ilike(tl), Project.name.ilike(tl))
                ).first()
                if project:
                    linked_projects.append(project)

    clean_text = re.sub(r"\s*#\w+", "", text).strip()
    return clean_text, manual_type, manual_urgency, linked_people, linked_projects


def item_to_response(item: CaptureItem) -> dict:
    return {
        "id": item.id,
        "raw_text": item.raw_text,
        "created_at": item.created_at,
        "updated_at": item.updated_at,
        "status": item.status.value if item.status else "open",
        "resolved_at": item.resolved_at,
        "resolution_note": item.resolution_note,
        "item_type": item.item_type.value if item.item_type else None,
        "urgency": item.urgency.value if item.urgency else None,
        "ai_confidence": item.ai_confidence,
        "ai_processed_at": item.ai_processed_at,
        "manual_type": item.manual_type.value if item.manual_type else None,
        "manual_urgency": item.manual_urgency.value if item.manual_urgency else None,
        "effective_type": (item.manual_type or item.item_type).value if (item.manual_type or item.item_type) else None,
        "effective_urgency": (item.manual_urgency or item.urgency).value if (item.manual_urgency or item.urgency) else None,
        "linked_people": [{"id": p.id, "display_name": p.display_name} for p in item.linked_people],
        "linked_projects": [{"id": p.id, "name": p.name, "short_code": p.short_code} for p in item.linked_projects],
        "meeting_session_id": item.meeting_session_id,
    }


@router.post("", response_model=CaptureResponse)
def create_capture(body: CaptureCreate, db: Session = Depends(get_db)):
    text = body.raw_text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    clean_text, manual_type, manual_urgency, people, projects = parse_hashtags(text, db)

    item = CaptureItem(
        raw_text=clean_text or text,
        manual_type=manual_type,
        manual_urgency=manual_urgency,
    )
    db.add(item)
    db.flush()

    for p in people:
        db.add(CaptureItemPerson(capture_item_id=item.id, person_id=p.id, link_source=LinkSource.hashtag))
    for p in projects:
        db.add(CaptureItemProject(capture_item_id=item.id, project_id=p.id, link_source=LinkSource.hashtag))

    # Queue AI classification
    db.add(AIJob(capture_item_id=item.id))
    db.commit()
    db.refresh(item)
    return item_to_response(item)


@router.get("")
def list_captures(
    status: Optional[str] = Query(None),
    type: Optional[str] = Query(None),
    urgency: Optional[str] = Query(None),
    person_id: Optional[UUID] = Query(None),
    project_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    include_done: bool = Query(False),
    limit: int = Query(100),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    q = db.query(CaptureItem)

    if status:
        q = q.filter(CaptureItem.status == status)
    elif not include_done:
        q = q.filter(CaptureItem.status == ItemStatus.open)

    if type:
        q = q.filter(or_(CaptureItem.manual_type == type, CaptureItem.item_type == type))
    if urgency:
        q = q.filter(or_(CaptureItem.manual_urgency == urgency, CaptureItem.urgency == urgency))
    if person_id:
        q = q.join(CaptureItemPerson).filter(CaptureItemPerson.person_id == person_id)
    if project_id:
        q = q.join(CaptureItemProject).filter(CaptureItemProject.project_id == project_id)
    if search:
        q = q.filter(CaptureItem.raw_text.ilike(f"%{search}%"))

    items = q.order_by(CaptureItem.created_at.desc()).offset(offset).limit(limit).all()
    return [item_to_response(i) for i in items]


@router.patch("/{item_id}", response_model=CaptureResponse)
def update_capture(item_id: UUID, body: CaptureUpdate, db: Session = Depends(get_db)):
    item = db.query(CaptureItem).filter(CaptureItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")

    if body.status is not None:
        item.status = body.status
        if body.status == "done":
            item.resolved_at = datetime.now(timezone.utc)
    if body.manual_type is not None:
        item.manual_type = body.manual_type if body.manual_type != "" else None
    if body.manual_urgency is not None:
        item.manual_urgency = body.manual_urgency if body.manual_urgency != "" else None
    if body.resolution_note is not None:
        item.resolution_note = body.resolution_note

    db.commit()
    db.refresh(item)
    return item_to_response(item)


@router.delete("/{item_id}")
def delete_capture(item_id: UUID, db: Session = Depends(get_db)):
    item = db.query(CaptureItem).filter(CaptureItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    db.delete(item)
    db.commit()
    return {"ok": True}


@router.post("/{item_id}/link-person/{person_id}")
def link_person(item_id: UUID, person_id: UUID, db: Session = Depends(get_db)):
    existing = db.query(CaptureItemPerson).filter_by(capture_item_id=item_id, person_id=person_id).first()
    if not existing:
        db.add(CaptureItemPerson(capture_item_id=item_id, person_id=person_id, link_source=LinkSource.manual))
        db.commit()
    return {"ok": True}


@router.delete("/{item_id}/link-person/{person_id}")
def unlink_person(item_id: UUID, person_id: UUID, db: Session = Depends(get_db)):
    link = db.query(CaptureItemPerson).filter_by(capture_item_id=item_id, person_id=person_id).first()
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}


@router.post("/{item_id}/link-project/{project_id}")
def link_project(item_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    existing = db.query(CaptureItemProject).filter_by(capture_item_id=item_id, project_id=project_id).first()
    if not existing:
        db.add(CaptureItemProject(capture_item_id=item_id, project_id=project_id, link_source=LinkSource.manual))
        db.commit()
    return {"ok": True}


@router.delete("/{item_id}/link-project/{project_id}")
def unlink_project(item_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    link = db.query(CaptureItemProject).filter_by(capture_item_id=item_id, project_id=project_id).first()
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}
