from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import CaptureItem, Person, Project, MeetingSession, ProfileLog, LogType, CaptureItemPerson, CaptureItemProject, ItemStatus, Note

router = APIRouter(prefix="/api/timeline", tags=["timeline"])


@router.get("")
def get_timeline(
    days: int = Query(7),
    db: Session = Depends(get_db),
):
    """Get activity timeline for the past N days."""
    since = datetime.now(timezone.utc) - timedelta(days=days)
    events = []

    # Items created
    items = db.query(CaptureItem).filter(CaptureItem.created_at >= since).order_by(CaptureItem.created_at.desc()).all()
    for item in items:
        people = [{"id": p.id, "display_name": p.display_name, "name": p.name} for p in item.linked_people]
        projects = [{"id": p.id, "name": p.name, "short_code": p.short_code} for p in item.linked_projects]
        events.append({
            "type": "item_created",
            "timestamp": item.created_at.isoformat(),
            "text": item.raw_text,
            "item_id": str(item.id),
            "item_type": (item.manual_type or item.item_type).value if (item.manual_type or item.item_type) else None,
            "people": people,
            "projects": projects,
        })

    # Items resolved
    resolved = db.query(CaptureItem).filter(
        CaptureItem.resolved_at != None,
        CaptureItem.resolved_at >= since,
    ).order_by(CaptureItem.resolved_at.desc()).all()
    for item in resolved:
        events.append({
            "type": "item_resolved",
            "timestamp": item.resolved_at.isoformat(),
            "text": item.raw_text,
            "item_id": str(item.id),
        })

    # Meetings
    meetings = db.query(MeetingSession).filter(
        MeetingSession.started_at >= since,
        MeetingSession.ended_at != None,
    ).order_by(MeetingSession.started_at.desc()).all()
    for m in meetings:
        attendee_names = [p.display_name for p in (m.attendees or [])]
        title = m.title or ("Meeting with " + ", ".join(attendee_names) if attendee_names else "Meeting")
        project_name = m.project.name if m.project else None
        events.append({
            "type": "meeting",
            "timestamp": m.started_at.isoformat(),
            "text": title,
            "meeting_id": str(m.id),
            "attendees": attendee_names,
            "project_name": project_name,
            "items_resolved": m.items_resolved,
            "items_added": m.items_added,
        })

    # Profile updates — exclude meeting_summary logs (one per attendee would flood
    # the timeline; the meeting itself is already rendered as a single event above).
    logs = db.query(ProfileLog).filter(
        ProfileLog.created_at >= since,
        ProfileLog.log_type != LogType.meeting_summary,
    ).order_by(ProfileLog.created_at.desc()).all()
    for log in logs:
        name = ""
        if log.person_id:
            person = db.query(Person).get(log.person_id)
            if person:
                name = person.display_name
        elif log.project_id:
            project = db.query(Project).get(log.project_id)
            if project:
                name = project.name
        events.append({
            "type": log.log_type.value,
            "timestamp": log.created_at.isoformat(),
            "text": f"{name}: {log.content}",
        })

    # Notes created
    notes_created = db.query(Note).filter(Note.created_at >= since).order_by(Note.created_at.desc()).all()
    for n in notes_created:
        is_email = n.source_type and n.source_type.value == "email"
        title = n.title or (n.body[:60] + "..." if n.body and len(n.body) > 60 else n.body or "")
        label = "Email imported" if is_email else "Note added"
        people = [{"id": p.id, "display_name": p.display_name, "name": p.name} for p in (n.linked_people or [])]
        projects = [{"id": p.id, "name": p.name, "short_code": p.short_code} for p in (n.linked_projects or [])]
        events.append({
            "type": "note_created",
            "timestamp": n.created_at.isoformat(),
            "text": f"{label}: {title}",
            "note_id": str(n.id),
            "source_type": n.source_type.value if n.source_type else "manual",
            "people": people,
            "projects": projects,
        })

    # Notes updated (only if updated_at differs from created_at by > 60s)
    notes_updated = db.query(Note).filter(
        Note.updated_at >= since,
        Note.updated_at > Note.created_at + timedelta(seconds=60),
    ).order_by(Note.updated_at.desc()).all()
    for n in notes_updated:
        # Skip if already covered by note_created in this window
        if n.created_at >= since:
            continue
        title = n.title or (n.body[:60] + "..." if n.body and len(n.body) > 60 else n.body or "")
        events.append({
            "type": "note_updated",
            "timestamp": n.updated_at.isoformat(),
            "text": f"Note updated: {title}",
            "note_id": str(n.id),
            "source_type": n.source_type.value if n.source_type else "manual",
        })

    # Sort all events by timestamp descending
    events.sort(key=lambda e: e["timestamp"], reverse=True)

    # Summary stats
    notes_count = len([e for e in events if e["type"] in ("note_created", "note_updated")])
    stats = {
        "items_created": len([e for e in events if e["type"] == "item_created"]),
        "items_resolved": len([e for e in events if e["type"] == "item_resolved"]),
        "meetings_held": len([e for e in events if e["type"] == "meeting"]),
        "notes": notes_count,
    }

    return {"events": events[:100], "stats": stats, "days": days}
