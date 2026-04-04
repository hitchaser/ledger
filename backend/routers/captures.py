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


def parse_shortcuts(text: str, db: Session):
    """Parse and strip #hashtag and @mention shortcuts from capture text."""
    type_map = {"todo": ItemType.todo, "followup": ItemType.followup, "reminder": ItemType.reminder,
                "goal": ItemType.goal, "note": ItemType.note, "discussion": ItemType.discussion}

    manual_type = None
    linked_people = []
    linked_projects = []
    seen_people_ids = set()
    seen_project_ids = set()
    strip_fully = set()   # Tags to remove entirely (#todo, etc.)
    strip_symbol = set()  # Tags to keep name but remove #/@ (@John → John)
    matched_mentions = {}  # @mention → person/project (for leading detection)

    # Parse #hashtags (type tags only — people/projects use @ only)
    tags = re.findall(r"#(\w+)", text)
    for tag in tags:
        tl = tag.lower()
        if tl in type_map:
            manual_type = type_map[tl]
            strip_fully.add(f"#{tag}")

    # Parse @mentions — match against known people display_names and project names
    # Supports multi-word display names like "John S" by matching longest known name after @
    people = db.query(Person).filter(Person.is_archived == False).all()
    projects = db.query(Project).filter(Project.is_archived == False).all()
    people_dn_map = {p.display_name.lower(): p for p in people}  # display_name → Person
    project_name_map = {}
    for proj in projects:
        project_name_map[proj.name.lower()] = proj
        if proj.short_code:
            project_name_map[proj.short_code.lower()] = proj

    # Find all @ positions and try to match known names (longest match first)
    at_positions = [i for i, c in enumerate(text) if c == '@']
    for pos in at_positions:
        # Must be at start or preceded by space/newline
        if pos > 0 and text[pos - 1] not in (' ', '\n'):
            continue
        after = text[pos + 1:]
        matched = False
        # Try matching against people display names (longest first for best match)
        for dn_lower, person in sorted(people_dn_map.items(), key=lambda x: -len(x[0])):
            if after.lower().startswith(dn_lower) and person.id not in seen_people_ids:
                # Ensure the match ends at a word boundary or end of string
                end_pos = len(dn_lower)
                if end_pos < len(after) and after[end_pos] not in (' ', ',', '.', '!', '?', '\n', ''):
                    continue
                linked_people.append(person)
                seen_people_ids.add(person.id)
                tag = text[pos:pos + 1 + len(dn_lower)]
                matched_mentions[tag] = True
                matched = True
                break
        if matched:
            continue
        # Try matching against project names/short_codes
        for pn_lower, proj in sorted(project_name_map.items(), key=lambda x: -len(x[0])):
            if after.lower().startswith(pn_lower) and proj.id not in seen_project_ids:
                end_pos = len(pn_lower)
                if end_pos < len(after) and after[end_pos] not in (' ', ',', '.', '!', '?', '\n', ''):
                    continue
                linked_projects.append(proj)
                seen_project_ids.add(proj.id)
                tag = text[pos:pos + 1 + len(pn_lower)]
                matched_mentions[tag] = True
                break

    # Detect leading @mentions: at start of text before any non-mention words
    leading_mentions = set()
    stripped = text.lstrip()
    while stripped.startswith("@"):
        # Try to match any known mention tag at the start
        found_leading = False
        for tag in sorted(matched_mentions.keys(), key=lambda t: -len(t)):
            if stripped.startswith(tag):
                leading_mentions.add(tag)
                stripped = stripped[len(tag):].lstrip()
                found_leading = True
                break
        if not found_leading:
            break

    # Strip metadata tags entirely (#todo, etc.)
    clean_text = text
    for tag in strip_fully:
        clean_text = re.sub(r"\s*" + re.escape(tag) + r"\b", "", clean_text)

    # For #person/#project tags, remove the # symbol, keep the name
    for tag in strip_symbol:
        name = tag[1:]
        clean_text = clean_text.replace(tag, name)

    # For @mentions: leading ones are stripped entirely, non-leading strip @ keep name
    for tag in matched_mentions:
        if tag in leading_mentions:
            clean_text = re.sub(r"\s*" + re.escape(tag) + r"\b", "", clean_text)
        else:
            name = tag[1:]
            clean_text = clean_text.replace(tag, name)

    # Strip @ from any unmatched @mentions
    clean_text = clean_text.replace("@", "")
    clean_text = clean_text.strip()
    return clean_text, manual_type, None, linked_people, linked_projects


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
        "linked_people": [{"id": p.id, "display_name": p.display_name, "name": p.name, "avatar": p.avatar} for p in item.linked_people],
        "linked_projects": [{"id": p.id, "name": p.name, "short_code": p.short_code} for p in item.linked_projects],
        "meeting_session_id": item.meeting_session_id,
        "due_date": item.due_date.isoformat() if item.due_date else None,
        "is_pinned": item.is_pinned or False,
        "recurrence": item.recurrence,
        "notes": [{"id": n.id, "content": n.content, "created_at": n.created_at.isoformat()} for n in (item.notes or [])],
        "predecessors": [{"id": p.id, "raw_text": p.raw_text[:80]} for p in (item.predecessors or [])],
        "sort_order": item.sort_order or 0,
    }


@router.post("/reorder")
def reorder_items(body: dict, db: Session = Depends(get_db)):
    """Set sort_order for a list of items. Array order = sort order."""
    item_ids = body.get("item_ids", [])
    for idx, item_id in enumerate(item_ids):
        db.query(CaptureItem).filter(CaptureItem.id == item_id).update(
            {"sort_order": idx}, synchronize_session=False
        )
    db.commit()
    return {"ok": True}


@router.post("", response_model=CaptureResponse)
def create_capture(body: CaptureCreate, db: Session = Depends(get_db)):
    text = body.raw_text.strip()
    if not text:
        raise HTTPException(400, "Empty text")

    clean_text, manual_type, manual_urgency, people, projects = parse_shortcuts(text, db)

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

    items = q.order_by(CaptureItem.is_pinned.desc().nullslast(), CaptureItem.sort_order.asc().nullslast(), CaptureItem.created_at.desc()).offset(offset).limit(limit).all()
    return [item_to_response(i) for i in items]


@router.patch("/{item_id}", response_model=CaptureResponse)
def update_capture(item_id: UUID, body: CaptureUpdate, db: Session = Depends(get_db)):
    item = db.query(CaptureItem).filter(CaptureItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")

    if body.raw_text is not None and body.raw_text.strip():
        item.raw_text = body.raw_text.strip()
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
    if body.due_date is not None:
        from dateutil.parser import parse as parse_date
        item.due_date = parse_date(body.due_date) if body.due_date else None
        # Clear urgency when a specific due date is set — date takes priority
        if item.due_date:
            item.manual_urgency = None
            item.urgency = None
    if body.is_pinned is not None:
        item.is_pinned = body.is_pinned
    if body.recurrence is not None:
        item.recurrence = body.recurrence if body.recurrence else None

    # Handle recurring: when completing a recurring item, create next occurrence
    if body.status == "done" and item.recurrence:
        _create_next_recurrence(item, db)

    db.commit()
    db.refresh(item)
    return item_to_response(item)


def _create_next_recurrence(item, db):
    """Create the next occurrence of a recurring item."""
    from datetime import timedelta
    intervals = {"daily": timedelta(days=1), "weekly": timedelta(weeks=1),
                 "biweekly": timedelta(weeks=2), "monthly": timedelta(days=30)}
    delta = intervals.get(item.recurrence)
    if not delta:
        return
    base_date = item.due_date or datetime.now(timezone.utc)
    next_date = base_date + delta

    new_item = CaptureItem(
        raw_text=item.raw_text,
        status=ItemStatus.open,
        manual_type=item.manual_type or item.item_type,
        manual_urgency=item.manual_urgency or item.urgency,
        due_date=next_date,
        is_pinned=item.is_pinned,
        recurrence=item.recurrence,
    )
    db.add(new_item)
    db.flush()
    # Copy people/project links
    for link in db.query(CaptureItemPerson).filter_by(capture_item_id=item.id).all():
        db.add(CaptureItemPerson(capture_item_id=new_item.id, person_id=link.person_id, link_source=link.link_source))
    for link in db.query(CaptureItemProject).filter_by(capture_item_id=item.id).all():
        db.add(CaptureItemProject(capture_item_id=new_item.id, project_id=link.project_id, link_source=link.link_source))


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


# ── Item Notes ──

@router.post("/{item_id}/notes")
def add_note(item_id: UUID, body: dict, db: Session = Depends(get_db)):
    from models import ItemNote
    item = db.query(CaptureItem).filter(CaptureItem.id == item_id).first()
    if not item:
        raise HTTPException(404, "Not found")
    note = ItemNote(capture_item_id=item_id, content=body.get("content", "").strip())
    db.add(note)
    db.commit()
    return {"id": note.id, "content": note.content, "created_at": note.created_at.isoformat()}


@router.delete("/{item_id}/notes/{note_id}")
def delete_note(item_id: UUID, note_id: UUID, db: Session = Depends(get_db)):
    from models import ItemNote
    note = db.query(ItemNote).filter(ItemNote.id == note_id, ItemNote.capture_item_id == item_id).first()
    if note:
        db.delete(note)
        db.commit()
    return {"ok": True}


# ── Predecessor Links ──

@router.post("/{item_id}/predecessors/{pred_id}")
def add_predecessor(item_id: UUID, pred_id: UUID, db: Session = Depends(get_db)):
    from models import item_links
    existing = db.execute(item_links.select().where(
        item_links.c.item_id == item_id, item_links.c.predecessor_id == pred_id
    )).first()
    if not existing:
        db.execute(item_links.insert().values(item_id=item_id, predecessor_id=pred_id))
        db.commit()
    return {"ok": True}


@router.delete("/{item_id}/predecessors/{pred_id}")
def remove_predecessor(item_id: UUID, pred_id: UUID, db: Session = Depends(get_db)):
    from models import item_links
    db.execute(item_links.delete().where(
        item_links.c.item_id == item_id, item_links.c.predecessor_id == pred_id
    ))
    db.commit()
    return {"ok": True}
