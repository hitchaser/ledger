from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import MeetingSession, CaptureItem, CaptureItemPerson, CaptureItemProject, Person, Project, ProfileLog, LogType, ItemStatus
from schemas import MeetingCreate, MeetingResponse
from services.ai_service import generate_meeting_summary
from sqlalchemy import func

router = APIRouter(prefix="/api/meetings", tags=["meetings"])


@router.post("", response_model=MeetingResponse)
def start_meeting(body: MeetingCreate, db: Session = Depends(get_db)):
    # Check for active session
    active = db.query(MeetingSession).filter(MeetingSession.ended_at == None).first()
    if active:
        raise HTTPException(409, f"Active meeting session exists (id={active.id}). End it first.")

    session = MeetingSession(person_id=body.person_id, project_id=body.project_id)
    db.add(session)
    db.commit()
    db.refresh(session)
    return session


@router.get("/active")
def get_active_meeting(db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.ended_at == None).first()
    if not session:
        return None
    return {
        "id": session.id, "started_at": session.started_at, "ended_at": session.ended_at,
        "person_id": session.person_id, "project_id": session.project_id,
        "items_resolved": session.items_resolved, "items_added": session.items_added,
        "ai_summary": session.ai_summary,
    }


@router.get("/{meeting_id}")
def get_meeting(meeting_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Not found")
    return session


@router.get("/prep/{entity_type}/{entity_id}")
def meeting_prep(entity_type: str, entity_id: UUID, db: Session = Depends(get_db)):
    """Get meeting prep stats: since last meeting summary."""
    # Find last meeting with this person/project
    q = db.query(MeetingSession).filter(MeetingSession.ended_at != None)
    if entity_type == "person":
        q = q.filter(MeetingSession.person_id == entity_id)
    else:
        q = q.filter(MeetingSession.project_id == entity_id)
    last_meeting = q.order_by(MeetingSession.ended_at.desc()).first()
    since = last_meeting.ended_at if last_meeting else None

    # Count items since last meeting
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


@router.patch("/{meeting_id}/end")
def end_meeting(meeting_id: UUID, db: Session = Depends(get_db)):
    session = db.query(MeetingSession).filter(MeetingSession.id == meeting_id).first()
    if not session:
        raise HTTPException(404, "Not found")
    if session.ended_at:
        raise HTTPException(400, "Already ended")

    session.ended_at = datetime.now(timezone.utc)

    # Gather all items linked to this person/project that were created or resolved during the session
    from models import CaptureItemPerson, CaptureItemProject
    meeting_items = []
    context_name = ""
    context_notes = ""

    if session.person_id:
        person = db.query(Person).get(session.person_id)
        if person:
            context_name = person.display_name
            context_notes = person.context_notes or ""
        # Items added during session (linked to this person, created after session start)
        added = db.query(CaptureItem).join(CaptureItemPerson).filter(
            CaptureItemPerson.person_id == session.person_id,
            CaptureItem.created_at >= session.started_at,
        ).all()
        # Items resolved during session (linked to this person, resolved after session start)
        resolved = db.query(CaptureItem).join(CaptureItemPerson).filter(
            CaptureItemPerson.person_id == session.person_id,
            CaptureItem.status == ItemStatus.done,
            CaptureItem.resolved_at != None,
            CaptureItem.resolved_at >= session.started_at,
        ).all()
        meeting_items = list({i.id: i for i in added + resolved}.values())
    elif session.project_id:
        project = db.query(Project).get(session.project_id)
        if project:
            context_name = project.name
            context_notes = project.context_notes or ""
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
        meeting_items = list({i.id: i for i in added + resolved}.values())

    session.items_added = len([i for i in meeting_items if i.status == ItemStatus.open])
    session.items_resolved = len([i for i in meeting_items if i.status == ItemStatus.done])

    summary = generate_meeting_summary(context_name, context_notes, meeting_items)
    session.ai_summary = summary

    # Save as profile log
    if summary:
        log = ProfileLog(
            log_type=LogType.meeting_summary,
            content=summary,
            person_id=session.person_id,
            project_id=session.project_id,
            meeting_session_id=session.id,
        )
        db.add(log)

    db.commit()
    db.refresh(session)
    return {
        "id": session.id, "started_at": session.started_at, "ended_at": session.ended_at,
        "person_id": session.person_id, "project_id": session.project_id,
        "items_resolved": session.items_resolved, "items_added": session.items_added,
        "ai_summary": session.ai_summary,
    }
