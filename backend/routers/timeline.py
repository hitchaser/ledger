from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import CaptureItem, Person, Project, MeetingSession, ProfileLog, CaptureItemPerson, CaptureItemProject, ItemStatus

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
        people = [{"id": p.id, "display_name": p.display_name} for p in item.linked_people]
        projects = [{"id": p.id, "name": p.name, "short_code": p.short_code} for p in item.linked_projects]
        events.append({
            "type": "item_created",
            "timestamp": item.created_at.isoformat(),
            "text": item.raw_text[:120],
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
            "text": item.raw_text[:120],
            "item_id": str(item.id),
        })

    # Meetings
    meetings = db.query(MeetingSession).filter(
        MeetingSession.started_at >= since,
        MeetingSession.ended_at != None,
    ).order_by(MeetingSession.started_at.desc()).all()
    for m in meetings:
        name = ""
        if m.person_id:
            person = db.query(Person).get(m.person_id)
            if person:
                name = person.display_name
        elif m.project_id:
            project = db.query(Project).get(m.project_id)
            if project:
                name = project.name
        events.append({
            "type": "meeting",
            "timestamp": m.started_at.isoformat(),
            "text": f"Meeting with {name}",
            "items_resolved": m.items_resolved,
            "items_added": m.items_added,
        })

    # Profile updates
    logs = db.query(ProfileLog).filter(ProfileLog.created_at >= since).order_by(ProfileLog.created_at.desc()).all()
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
            "text": f"{name}: {log.content[:100]}",
        })

    # Sort all events by timestamp descending
    events.sort(key=lambda e: e["timestamp"], reverse=True)

    # Summary stats
    stats = {
        "items_created": len([e for e in events if e["type"] == "item_created"]),
        "items_resolved": len([e for e in events if e["type"] == "item_resolved"]),
        "meetings_held": len([e for e in events if e["type"] == "meeting"]),
    }

    return {"events": events[:100], "stats": stats, "days": days}
