from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_

from database import get_db
from models import CaptureItem, Person, Project, ItemNote, MeetingSession

router = APIRouter(prefix="/api/search", tags=["search"])


@router.get("")
def universal_search(q: str = Query(""), db: Session = Depends(get_db)):
    if not q or len(q.strip()) < 2:
        return {"people": [], "projects": [], "items": [], "meetings": []}

    query = q.strip().lower()
    ql = f"%{query}%"

    # Search people — name, display_name, profile fields
    people_q = db.query(Person).filter(
        or_(
            Person.name.ilike(ql),
            Person.display_name.ilike(ql),
            Person.role.ilike(ql),
            Person.email.ilike(ql),
        )
    ).limit(8).all()

    people = [{
        "id": p.id, "display_name": p.display_name, "name": p.name,
        "role": p.role, "avatar": p.avatar, "is_archived": p.is_archived,
    } for p in people_q]

    # Search projects — name, short_code, context_notes
    projects_q = db.query(Project).filter(
        or_(
            Project.name.ilike(ql),
            Project.short_code.ilike(ql),
            Project.context_notes.ilike(ql),
        )
    ).limit(8).all()

    projects = [{
        "id": p.id, "name": p.name, "short_code": p.short_code,
        "status": p.status.value if p.status else "active", "is_archived": p.is_archived,
    } for p in projects_q]

    # Search items — raw_text + notes, include all statuses
    items_q = db.query(CaptureItem).filter(
        CaptureItem.raw_text.ilike(ql)
    ).order_by(CaptureItem.created_at.desc()).limit(15).all()

    # Also search in item notes
    note_items_q = db.query(CaptureItem).join(ItemNote).filter(
        ItemNote.content.ilike(ql)
    ).order_by(CaptureItem.created_at.desc()).limit(10).all()

    # Merge and dedup
    seen_ids = set()
    items = []
    for item in items_q + note_items_q:
        if item.id in seen_ids:
            continue
        seen_ids.add(item.id)
        # Find matching note text if the match was in a note
        matching_note = None
        for n in (item.notes or []):
            if query in n.content.lower():
                matching_note = n.content[:80]
                break
        items.append({
            "id": str(item.id),
            "raw_text": item.raw_text[:120],
            "status": item.status.value if item.status else "open",
            "effective_type": (item.manual_type or item.item_type).value if (item.manual_type or item.item_type) else None,
            "created_at": item.created_at.isoformat(),
            "matching_note": matching_note,
            "linked_people": [{"id": p.id, "display_name": p.display_name} for p in item.linked_people],
            "linked_projects": [{"id": p.id, "name": p.name, "short_code": p.short_code} for p in item.linked_projects],
        })

    # Search meetings — title and notes
    meetings_q = db.query(MeetingSession).filter(
        or_(
            MeetingSession.title.ilike(ql),
            MeetingSession.notes.ilike(ql),
        )
    ).order_by(MeetingSession.started_at.desc()).limit(8).all()

    meetings = []
    for m in meetings_q:
        attendee_names = [p.display_name for p in (m.attendees or [])]
        matching_notes = None
        if m.notes and query in m.notes.lower():
            # Extract a snippet around the match
            idx = m.notes.lower().index(query)
            start = max(0, idx - 30)
            end = min(len(m.notes), idx + len(query) + 50)
            matching_notes = ("..." if start > 0 else "") + m.notes[start:end] + ("..." if end < len(m.notes) else "")
        meetings.append({
            "id": str(m.id),
            "title": m.title,
            "started_at": m.started_at.isoformat(),
            "ended_at": m.ended_at.isoformat() if m.ended_at else None,
            "attendees": attendee_names,
            "project_name": m.project.name if m.project else None,
            "matching_notes": matching_notes,
        })

    return {"people": people, "projects": projects, "items": items[:20], "meetings": meetings}
