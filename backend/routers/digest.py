from datetime import datetime, timezone, timedelta
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import and_, func

from database import get_db
from models import CaptureItem, Person, CaptureItemPerson, CaptureItemProject, ItemStatus, Urgency, ItemType
from routers.captures import item_to_response

router = APIRouter(prefix="/api/digest", tags=["digest"])


@router.get("")
def get_digest(db: Session = Depends(get_db)):
    now = datetime.now(timezone.utc)
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    # Overdue: urgency=today, created before today, still open
    overdue = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.created_at < today_start,
        CaptureItem.urgency == Urgency.today,
    ).order_by(CaptureItem.created_at).all()

    # Today items
    today_items = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.urgency == Urgency.today,
        CaptureItem.created_at >= today_start,
    ).order_by(CaptureItem.created_at).all()

    # This week items
    this_week = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        CaptureItem.urgency == Urgency.this_week,
    ).order_by(CaptureItem.created_at).all()

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

    # Orphaned items: open, no linked person or project
    orphaned = db.query(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open,
        ~CaptureItem.id.in_(db.query(CaptureItemPerson.capture_item_id)),
        ~CaptureItem.id.in_(db.query(CaptureItemProject.capture_item_id)),
        CaptureItem.item_type != ItemType.profile_update,
    ).order_by(CaptureItem.created_at.desc()).limit(20).all()

    return {
        "overdue_items": [item_to_response(i) for i in overdue],
        "today_items": [item_to_response(i) for i in today_items],
        "this_week_count": len(this_week),
        "this_week_items": [item_to_response(i) for i in this_week],
        "stale_people": stale_people,
        "orphaned_items": [item_to_response(i) for i in orphaned],
    }
