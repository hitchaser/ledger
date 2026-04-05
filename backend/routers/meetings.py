from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from database import get_db
from models import (
    MeetingSession, MeetingAttendee, CaptureItem, CaptureItemPerson,
    CaptureItemProject, Person, Project, ProfileLog, LogType, ItemStatus
)
from schemas import MeetingCreate, MeetingUpdate, MeetingResponse
from services.ai_service import generate_meeting_summary
from sqlalchemy import func

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


def meeting_to_response(session, db=None):
    """Convert a MeetingSession to response dict with attendees and project."""
    attendees = [
        {"id": p.id, "display_name": p.display_name, "avatar": p.avatar}
        for p in (session.attendees or [])
    ]
    project = None
    if session.project:
        project = {
            "id": session.project.id,
            "name": session.project.name,
            "short_code": session.project.short_code,
        }
    return {
        "id": session.id,
        "started_at": session.started_at,
        "ended_at": session.ended_at,
        "title": session.title,
        "notes": session.notes,
        "person_id": session.person_id,
        "project_id": session.project_id,
        "items_resolved": session.items_resolved,
        "items_added": session.items_added,
        "ai_summary": session.ai_summary,
        "attendees": attendees,
        "project": project,
    }


@router.get("")
def list_meetings(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    active_only: bool = Query(False),
    person_id: Optional[UUID] = Query(None),
    project_id: Optional[UUID] = Query(None),
    db: Session = Depends(get_db),
):
    """List meetings in reverse chronological order."""
    q = db.query(MeetingSession)
    if active_only:
        q = q.filter(MeetingSession.ended_at == None)
    if person_id:
        q = q.filter(MeetingSession.attendees.any(Person.id == person_id))
    if project_id:
        q = q.filter(MeetingSession.project_id == project_id)
    total = q.count()
    meetings = q.order_by(MeetingSession.started_at.desc()).offset(offset).limit(limit).all()
    return {
        "meetings": [meeting_to_response(m) for m in meetings],
        "total": total,
    }


@router.post("")
def start_meeting(body: MeetingCreate, db: Session = Depends(get_db)):
    # Check for active session
    active = db.query(MeetingSession).filter(MeetingSession.ended_at == None).first()
    if active:
        raise HTTPException(409, f"Active meeting session exists (id={active.id}). End it first.")

    session = MeetingSession(
        title=body.title,
        person_id=body.person_id,
        project_id=body.project_id,
    )
    db.add(session)
    db.flush()

    # Add attendees from attendee_ids
    attendee_ids = set(body.attendee_ids)
    # Also add person_id as attendee if provided (backward compat)
    if body.person_id:
        attendee_ids.add(body.person_id)
    for pid in attendee_ids:
        person = db.query(Person).filter(Person.id == pid).first()
        if person:
            db.add(MeetingAttendee(meeting_id=session.id, person_id=pid))

    db.commit()
    db.refresh(session)
    return meeting_to_response(session)


@router.get("/active")
def get_active_meeting(db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.ended_at == None).first()
    if not session:
        return None
    return meeting_to_response(session)


@router.get("/prep/{entity_type}/{entity_id}")
def meeting_prep(entity_type: str, entity_id: UUID, db: Session = Depends(get_db)):
    """Get meeting prep stats: since last meeting summary."""
    q = db.query(MeetingSession).filter(MeetingSession.ended_at != None)
    if entity_type == "person":
        q = q.filter(MeetingSession.attendees.any(Person.id == entity_id))
    else:
        q = q.filter(MeetingSession.project_id == entity_id)
    last_meeting = q.order_by(MeetingSession.ended_at.desc()).first()
    since = last_meeting.ended_at if last_meeting else None

    if entity_type == "person":
        item_q = db.query(CaptureItem).join(CaptureItemPerson).filter(CaptureItemPerson.person_id == entity_id)
    else:
        item_q = db.query(CaptureItem).join(CaptureItemProject).filter(CaptureItemProject.project_id == entity_id)

    if since:
        new_items = item_q.filter(CaptureItem.created_at >= since).count()
        resolved = item_q.filter(CaptureItem.resolved_at != None, CaptureItem.resolved_at >= since).count()
    else:
        new_items = item_q.count()
        resolved = item_q.filter(CaptureItem.resolved_at != None).count()

    open_count = item_q.filter(CaptureItem.status == ItemStatus.open).count()
    days_since = (datetime.now(timezone.utc) - since).days if since else None

    return {
        "last_meeting": since.isoformat() if since else None,
        "days_since": days_since,
        "new_items": new_items,
        "items_resolved": resolved,
        "open_items": open_count,
    }


@router.get("/{meeting_id}")
def get_meeting(meeting_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Not found")
    return meeting_to_response(session)


@router.patch("/{meeting_id}")
def update_meeting(meeting_id: UUID, body: MeetingUpdate, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Not found")
    if body.title is not None:
        session.title = body.title
    if body.notes is not None:
        session.notes = body.notes
    if body.project_id is not None:
        session.project_id = body.project_id if body.project_id else None
    db.commit()
    db.refresh(session)
    return meeting_to_response(session)


@router.delete("/{meeting_id}")
def delete_meeting(meeting_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Not found")
    # Delete attendees, profile logs, and unlink capture items
    db.query(MeetingAttendee).filter_by(meeting_id=meeting_id).delete()
    db.query(ProfileLog).filter_by(meeting_session_id=meeting_id).delete()
    from models import CaptureItem
    db.query(CaptureItem).filter_by(meeting_session_id=meeting_id).update({"meeting_session_id": None})
    db.delete(session)
    db.commit()
    return {"ok": True}


@router.post("/{meeting_id}/attendees/{person_id}")
def add_attendee(meeting_id: UUID, person_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Meeting not found")
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    existing = db.query(MeetingAttendee).filter_by(meeting_id=meeting_id, person_id=person_id).first()
    if not existing:
        db.add(MeetingAttendee(meeting_id=meeting_id, person_id=person_id))
        db.commit()
    db.refresh(session)
    return meeting_to_response(session)


@router.delete("/{meeting_id}/attendees/{person_id}")
def remove_attendee(meeting_id: UUID, person_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Meeting not found")
    att = db.query(MeetingAttendee).filter_by(meeting_id=meeting_id, person_id=person_id).first()
    if att:
        db.delete(att)
        db.commit()
    db.refresh(session)
    return meeting_to_response(session)


@router.patch("/{meeting_id}/end")
def end_meeting(meeting_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Not found")
    if session.ended_at:
        raise HTTPException(400, "Already ended")

    session.ended_at = datetime.now(timezone.utc)

    # Gather items from all attendees + project
    meeting_items = {}
    attendee_names = []

    for person in session.attendees:
        attendee_names.append(person.display_name)
        added = db.query(CaptureItem).join(CaptureItemPerson).filter(
            CaptureItemPerson.person_id == person.id,
            CaptureItem.created_at >= session.started_at,
        ).all()
        resolved = db.query(CaptureItem).join(CaptureItemPerson).filter(
            CaptureItemPerson.person_id == person.id,
            CaptureItem.status == ItemStatus.done,
            CaptureItem.resolved_at != None,
            CaptureItem.resolved_at >= session.started_at,
        ).all()
        for i in added + resolved:
            meeting_items[i.id] = i

    if session.project_id:
        project = db.query(Project).get(session.project_id)
        added = db.query(CaptureItem).join(CaptureItemProject).filter(
            CaptureItemProject.project_id == session.project_id,
            CaptureItem.created_at >= session.started_at,
        ).all()
        resolved = db.query(CaptureItem).join(CaptureItemProject).filter(
            CaptureItemProject.project_id == session.project_id,
            CaptureItem.status == ItemStatus.done,
            CaptureItem.resolved_at != None,
            CaptureItem.resolved_at >= session.started_at,
        ).all()
        for i in added + resolved:
            meeting_items[i.id] = i

    all_items = list(meeting_items.values())
    session.items_added = len([i for i in all_items if i.status == ItemStatus.open])
    session.items_resolved = len([i for i in all_items if i.status == ItemStatus.done])

    # Build context for summary
    context_name = session.title or ", ".join(attendee_names) or "Meeting"
    context_notes = session.notes or ""

    summary = generate_meeting_summary(context_name, context_notes, all_items, attendee_names)
    session.ai_summary = summary

    # Save ProfileLog for each attendee and project
    if summary:
        for person in session.attendees:
            db.add(ProfileLog(
                log_type=LogType.meeting_summary,
                content=summary,
                person_id=person.id,
                meeting_session_id=session.id,
            ))
        if session.project_id:
            db.add(ProfileLog(
                log_type=LogType.meeting_summary,
                content=summary,
                project_id=session.project_id,
                meeting_session_id=session.id,
            ))

    db.commit()
    db.refresh(session)
    return meeting_to_response(session)
