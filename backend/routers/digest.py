from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

from sqlalchemy import case

from database import get_db
from models import CaptureItem, Person, CaptureItemPerson, CaptureItemProject, ItemStatus, Urgency, ItemType
from routers.captures import item_to_response

router = APIRouter(prefix="/api/digest", tags=["digest"])


def _effective_urgency():
    """SQL expression for effective urgency: manual_urgency if set, else urgency."""
    return case(
        (CaptureItem.manual_urgency != None, CaptureItem.manual_urgency),
        else_=CaptureItem.urgency,
    )


@router.get("")
def get_digest(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)
    eff_urgency = _effective_urgency()

    # Overdue: items with due_date in the past (only date-based, not urgency-based)
    overdue = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.due_date != None,
        CaptureItem.due_date < today_start,
    ).order_by(CaptureItem.due_date.asc()).all()

    # Today: due_date is today OR effective urgency=today (regardless of creation date)
    today_items = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        or_(
            and_(CaptureItem.due_date != None, CaptureItem.due_date >= today_start, CaptureItem.due_date < today_end),
            and_(CaptureItem.due_date == None, eff_urgency == Urgency.today),
        ),
    ).order_by(CaptureItem.due_date.asc().nullslast(), CaptureItem.created_at).all()

    # Upcoming: due_date in next 7 days (not today, not overdue)
    week_end = today_start + timedelta(days=7)
    upcoming = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.due_date != None,
        CaptureItem.due_date >= today_end,
        CaptureItem.due_date < week_end,
    ).order_by(CaptureItem.due_date.asc()).all()

    # This week (effective urgency-based, no due date)
    this_week = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        eff_urgency == Urgency.this_week,
        CaptureItem.due_date == None,
    ).order_by(CaptureItem.created_at).all()

    # Collect all IDs already shown in above sections
    shown_ids = set()
    for items in [overdue, today_items, upcoming, this_week]:
        for i in items:
            shown_ids.add(i.id)

    # Stale people: no linked items in 14+ days
    fourteen_days_ago = now - timedelta(days=14)
    all_people = db.query(Person).filter(Person.is_archived == False).all()
    stale_people = []
    for p in all_people:
        latest = db.query(func.max(CaptureItem.created_at)).join(CaptureItemPerson).filter(
            CaptureItemPerson.person_id == p.id
        ).scalar()
        if latest is None or latest < fourteen_days_ago:
            stale_people.append({"id": p.id, "display_name": p.display_name})

    # Orphaned items: open, no linked person or project, NOT already in another section
    orphaned = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        ~CaptureItem.id.in_(db.query(CaptureItemPerson.capture_item_id)),
        ~CaptureItem.id.in_(db.query(CaptureItemProject.capture_item_id)),
        CaptureItem.item_type != ItemType.profile_update,
        ~CaptureItem.id.in_(shown_ids) if shown_ids else True,
    ).order_by(CaptureItem.created_at.desc()).limit(20).all()

    return {
        "overdue_items": [item_to_response(i) for i in overdue],
        "today_items": [item_to_response(i) for i in today_items],
        "upcoming_items": [item_to_response(i) for i in upcoming],
        "this_week_count": len(this_week),
        "this_week_items": [item_to_response(i) for i in this_week],
        "stale_people": stale_people,
        "orphaned_items": [item_to_response(i) for i in orphaned],
    }
