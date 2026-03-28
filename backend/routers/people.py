from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Person, CaptureItem, CaptureItemPerson, ProfileLog, ItemStatus, ReportingLevel
from schemas import PersonCreate, PersonUpdate, PersonResponse, ProfileLogResponse

router = APIRouter(prefix="/api/people", tags=["people"])


DEFAULT_PROFILE = {
    "spouse": "", "anniversary": "", "children": [],
    "pets": [], "birthday": "", "hobbies": "", "location": "", "general": ""
}

def person_response(p: Person, db: Session) -> dict:
    count = db.query(CaptureItemPerson).join(CaptureItem).filter(
        CaptureItemPerson.person_id == p.id,
        CaptureItem.status == ItemStatus.open
    ).count()
    profile = {**DEFAULT_PROFILE, **(p.profile or {})}
    return {
        "id": p.id, "name": p.name, "display_name": p.display_name,
        "role": p.role, "reporting_level": p.reporting_level.value if p.reporting_level else "other",
        "email": p.email, "created_at": p.created_at, "updated_at": p.updated_at,
        "is_archived": p.is_archived, "context_notes": p.context_notes or "",
        "profile": profile, "avatar": p.avatar,
        "open_item_count": count,
    }


@router.get("")
def list_people(include_archived: bool = False, db: Session = Depends(get_db)):
    q = db.query(Person)
    if not include_archived:
        q = q.filter(Person.is_archived == False)
    people = q.order_by(Person.display_name).all()
    return [person_response(p, db) for p in people]


@router.post("", response_model=PersonResponse)
def create_person(body: PersonCreate, db: Session = Depends(get_db)):
    profile = body.profile.model_dump() if body.profile else {**DEFAULT_PROFILE}
    p = Person(
        name=body.name, display_name=body.display_name, role=body.role,
        reporting_level=body.reporting_level, email=body.email,
        context_notes=body.context_notes or "",
        profile=profile,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return person_response(p, db)


@router.get("/{person_id}")
def get_person(person_id: UUID, db: Session = Depends(get_db)):
    p = db.query(Person).filter(Person.id == person_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    return person_response(p, db)


@router.patch("/{person_id}")
def update_person(person_id: UUID, body: PersonUpdate, db: Session = Depends(get_db)):
    p = db.query(Person).filter(Person.id == person_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    data = body.model_dump(exclude_unset=True)
    if "profile" in data and data["profile"] is not None:
        p.profile = data.pop("profile")
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(p, "profile")
    for field, val in data.items():
        setattr(p, field, val)
    db.commit()
    db.refresh(p)
    return person_response(p, db)


@router.delete("/{person_id}")
def delete_person(person_id: UUID, db: Session = Depends(get_db)):
    p = db.query(Person).filter(Person.id == person_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if not p.is_archived:
        raise HTTPException(400, "Person must be archived before deleting")
    # Remove junction table links
    db.query(CaptureItemPerson).filter(CaptureItemPerson.person_id == person_id).delete()
    db.query(ProfileLog).filter(ProfileLog.person_id == person_id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/{person_id}/items")
def get_person_items(person_id: UUID, status: str = "open", db: Session = Depends(get_db)):
    from routers.captures import item_to_response
    q = db.query(CaptureItem).join(CaptureItemPerson).filter(CaptureItemPerson.person_id == person_id)
    if status:
        q = q.filter(CaptureItem.status == status)
    items = q.order_by(CaptureItem.created_at.desc()).all()
    return [item_to_response(i) for i in items]


@router.get("/{person_id}/logs")
def get_person_logs(person_id: UUID, db: Session = Depends(get_db)):
    logs = db.query(ProfileLog).filter(ProfileLog.person_id == person_id).order_by(ProfileLog.created_at.desc()).all()
    return [{"id": l.id, "created_at": l.created_at, "log_type": l.log_type.value,
             "content": l.content, "person_id": l.person_id, "project_id": l.project_id,
             "meeting_session_id": l.meeting_session_id} for l in logs]
