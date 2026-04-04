from datetime import datetime, timezone, timedelta
from uuid import UUID
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_, func, or_

from database import get_db
from models import CaptureItem, Person, CaptureItemPerson, CaptureItemProject, ItemStatus, ItemType, Setting

router = APIRouter(prefix="/api/digest", tags=["digest"])


@router.get("")
def get_digest(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    today_end = today_start + timedelta(days=1)

    # Overdue: items with due_date in the past
    overdue = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.due_date != None,
        CaptureItem.due_date < today_start,
    ).order_by(CaptureItem.due_date.asc()).all()

    # Due Today: due_date is today
    today_items = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.due_date != None,
        CaptureItem.due_date >= today_start,
        CaptureItem.due_date < today_end,
    ).order_by(CaptureItem.due_date.asc().nullslast(), CaptureItem.created_at).all()

    # Upcoming: due_date in next 7 days (not today, not overdue)
    week_end = today_start + timedelta(days=7)
    upcoming = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.due_date != None,
        CaptureItem.due_date >= today_end,
        CaptureItem.due_date < week_end,
    ).order_by(CaptureItem.due_date.asc()).all()

    # No Date: open items with no due_date (limited to 30)
    no_date = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.due_date == None,
        CaptureItem.item_type != ItemType.profile_update,
    ).order_by(CaptureItem.is_pinned.desc().nullslast(), CaptureItem.created_at.desc()).limit(30).all()

    # Collect all IDs already shown
    shown_ids = set()
    for items in [overdue, today_items, upcoming, no_date]:
        for i in items:
            shown_ids.add(i.id)

    # Get owner_person_id from settings to exclude from stale people
    owner_setting = db.query(Setting).filter(Setting.key == "owner_person_id").first()
    owner_person_id = None
    if owner_setting and owner_setting.value:
        try:
            owner_person_id = UUID(owner_setting.value)
        except (ValueError, AttributeError):
            pass

    # Stale people: no linked items in 14+ days (limit to my org, exclude owner)
    fourteen_days_ago = now - timedelta(days=14)
    from routers.people import _get_my_org_ids
    my_org_ids = _get_my_org_ids(db)
    people_query = db.query(Person).filter(Person.is_archived == False)
    if my_org_ids:
        people_query = people_query.filter(Person.id.in_(my_org_ids))
    if owner_person_id:
        people_query = people_query.filter(Person.id != owner_person_id)
    all_people = people_query.all()
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

    from routers.captures import item_to_response
    return {
        "overdue_items": [item_to_response(i) for i in overdue],
        "today_items": [item_to_response(i) for i in today_items],
        "upcoming_items": [item_to_response(i) for i in upcoming],
        "no_date_items": [item_to_response(i) for i in no_date],
        "no_date_count": len(no_date),
        "stale_people": stale_people,
        "orphaned_items": [item_to_response(i) for i in orphaned],
    }
