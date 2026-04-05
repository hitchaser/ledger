from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Person, Project as ProjectModel, PersonProject, CaptureItem, CaptureItemPerson, ProfileLog, ItemStatus, ReportingLevel, Setting

router = APIRouter(prefix="/api/people", tags=["people"])


DEFAULT_PROFILE = {
    "spouse": "", "anniversary": "", "children": [],
    "pets": [], "birthday": "", "hobbies": "", "location": "",
    "address": "", "general": ""
}

def person_response(p: Person, db: Session, open_count_map: dict = None) -> dict:
    if open_count_map is not None:
        count = open_count_map.get(p.id, 0)
    else:
        count = db.query(CaptureItemPerson).join(CaptureItem).filter(
            CaptureItemPerson.person_id == p.id,
            CaptureItem.status == ItemStatus.open
        ).count()
    profile = {**DEFAULT_PROFILE, **(p.profile or {})}
    manager_info = None
    if p.manager_id and p.manager:
        manager_info = {"id": p.manager.id, "display_name": p.manager.display_name}
    return {
        "id": p.id, "name": p.name, "display_name": p.display_name,
        "role": p.role, "reporting_level": p.reporting_level.value if p.reporting_level else "other",
        "email": p.email, "created_at": p.created_at, "updated_at": p.updated_at,
        "is_archived": p.is_archived, "context_notes": p.context_notes or "",
        "profile": profile, "avatar": p.avatar,
        "manager_id": p.manager_id, "manager": manager_info,
        "external_id": p.external_id,
        "import_source": p.import_source,
        "open_item_count": count,
        "projects": [{"id": pr.id, "name": pr.name, "short_code": pr.short_code} for pr in (p.projects or []) if not pr.is_archived],
    }


def _get_my_org_ids(db: Session) -> set:
    """Get person IDs in the owner's org tree (downward walk)."""
    owner_setting = db.query(Setting).filter(Setting.key == "owner_person_id").first()
    if not owner_setting or not owner_setting.value:
        return set()
    try:
        owner_id = UUID(owner_setting.value)
    except (ValueError, AttributeError):
        return set()
    # Load all people (id, manager_id) in one query and walk in-memory
    all_rows = db.query(Person.id, Person.manager_id).filter(Person.is_archived == False).all()
    children_map = {}
    for pid, mid in all_rows:
        if mid:
            children_map.setdefault(mid, []).append(pid)
    result = set()
    queue = [owner_id]
    while queue:
        current = queue.pop(0)
        if current in result:
            continue
        result.add(current)
        queue.extend(children_map.get(current, []))
    return result


def _batch_open_counts(db: Session, person_ids: list = None) -> dict:
    """Get open item counts for people in a single query."""
    q = db.query(
        CaptureItemPerson.person_id,
        func.count(CaptureItemPerson.capture_item_id)
    ).join(CaptureItem).filter(
        CaptureItem.status == ItemStatus.open
    )
    if person_ids is not None:
        q = q.filter(CaptureItemPerson.person_id.in_(person_ids))
    return dict(q.group_by(CaptureItemPerson.person_id).all())


@router.get("/search")
def search_people(
    q: str = Query("", min_length=0),
    limit: int = Query(10),
    db: Session = Depends(get_db),
):
    """Lightweight search for typeahead — minimal response payload."""
    query = db.query(Person).filter(Person.is_archived == False)
    if q:
        term = f"%{q}%"
        from sqlalchemy import or_
        query = query.filter(or_(
            Person.display_name.ilike(term),
            Person.name.ilike(term),
            Person.role.ilike(term),
        ))
    people = query.order_by(Person.display_name).limit(limit).all()
    return [{"id": p.id, "display_name": p.display_name, "name": p.name, "avatar": p.avatar, "role": p.role} for p in people]


@router.get("")
def list_people(
    include_archived: bool = False,
    search: Optional[str] = Query(None),
    my_org: bool = Query(False),
    limit: int = Query(50),
    offset: int = Query(0),
    db: Session = Depends(get_db),
):
    q = db.query(Person)
    if not include_archived:
        q = q.filter(Person.is_archived == False)
    if search:
        term = f"%{search}%"
        from sqlalchemy import or_
        q = q.filter(or_(
            Person.display_name.ilike(term),
            Person.name.ilike(term),
            Person.role.ilike(term),
        ))
    if my_org:
        org_ids = _get_my_org_ids(db)
        if org_ids:
            q = q.filter(Person.id.in_(org_ids))
        # If no owner set, fall through to show all

    total = q.count()
    people = q.order_by(Person.display_name).offset(offset).limit(limit).all()

    # Batch open item counts
    person_ids = [p.id for p in people]
    count_map = _batch_open_counts(db, person_ids)

    return {"people": [person_response(p, db, count_map) for p in people], "total": total}


from schemas import PersonCreate, PersonUpdate, PersonResponse

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
    if "manager_id" in data:
        mid = data.pop("manager_id")
        p.manager_id = mid if mid else None
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
    db.query(CaptureItemPerson).filter(CaptureItemPerson.person_id == person_id).delete()
    db.query(ProfileLog).filter(ProfileLog.person_id == person_id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.post("/{person_id}/merge/{target_id}")
def merge_person(person_id: UUID, target_id: UUID, db: Session = Depends(get_db)):
    """Merge source person into target. Transfers all items, logs, projects. Archives source."""
    source = db.query(Person).filter(Person.id == person_id).first()
    target = db.query(Person).filter(Person.id == target_id).first()
    if not source or not target:
        raise HTTPException(404, "Person not found")
    if source.id == target.id:
        raise HTTPException(400, "Cannot merge a person into themselves")

    # Transfer capture item links (skip if target already linked)
    existing_target_items = {r.capture_item_id for r in db.query(CaptureItemPerson).filter_by(person_id=target.id).all()}
    for link in db.query(CaptureItemPerson).filter_by(person_id=source.id).all():
        if link.capture_item_id not in existing_target_items:
            link.person_id = target.id
        else:
            db.delete(link)  # duplicate link, just remove

    # Transfer profile logs
    for log in db.query(ProfileLog).filter_by(person_id=source.id).all():
        log.person_id = target.id

    # Transfer project assignments (skip if target already assigned)
    existing_target_projects = {r.project_id for r in db.query(PersonProject).filter_by(person_id=target.id).all()}
    for link in db.query(PersonProject).filter_by(person_id=source.id).all():
        if link.project_id not in existing_target_projects:
            link.person_id = target.id
        else:
            db.delete(link)

    # Merge profile data: copy non-empty fields from source that are empty on target
    if source.profile:
        import copy
        target_profile = copy.deepcopy(target.profile or {})
        source_profile = source.profile
        for key in ['spouse', 'anniversary', 'birthday', 'hobbies', 'location', 'address']:
            if source_profile.get(key) and not target_profile.get(key):
                target_profile[key] = source_profile[key]
        for key in ['children', 'pets']:
            source_list = source_profile.get(key, [])
            target_list = target_profile.get(key, [])
            if source_list and not target_list:
                target_profile[key] = source_list
        # Append general notes
        source_general = source_profile.get('general', '')
        if source_general:
            existing = target_profile.get('general', '')
            target_profile['general'] = (existing + '\n' + source_general).strip() if existing else source_general
        target.profile = target_profile
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(target, "profile")

    # Copy avatar if target doesn't have one
    if source.avatar and not target.avatar:
        target.avatar = source.avatar

    # Remap any people who report to source → now report to target
    db.query(Person).filter(Person.manager_id == source.id).update(
        {"manager_id": target.id}, synchronize_session=False
    )

    # Archive source
    source.is_archived = True

    db.commit()
    return {
        "ok": True,
        "merged_into": str(target.id),
        "source_archived": str(source.id),
    }


@router.post("/{person_id}/projects/{project_id}")
def link_person_project(person_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    existing = db.query(PersonProject).filter_by(person_id=person_id, project_id=project_id).first()
    if not existing:
        db.add(PersonProject(person_id=person_id, project_id=project_id))
        db.commit()
    return {"ok": True}


@router.delete("/{person_id}/projects/{project_id}")
def unlink_person_project(person_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    link = db.query(PersonProject).filter_by(person_id=person_id, project_id=project_id).first()
    if link:
        db.delete(link)
        db.commit()
    return {"ok": True}


@router.get("/{person_id}/items")
def get_person_items(person_id: UUID, status: str = "open", db: Session = Depends(get_db)):
    from routers.captures import item_to_response
    q = db.query(CaptureItem).join(CaptureItemPerson).filter(CaptureItemPerson.person_id == person_id)
    if status:
        q = q.filter(CaptureItem.status == status)
    items = q.order_by(CaptureItem.is_pinned.desc().nullslast(), CaptureItem.sort_order.asc().nullslast(), CaptureItem.created_at.desc()).all()
    return [item_to_response(i) for i in items]


@router.get("/{person_id}/logs")
def get_person_logs(person_id: UUID, db: Session = Depends(get_db)):
    logs = db.query(ProfileLog).filter(ProfileLog.person_id == person_id).order_by(ProfileLog.created_at.desc()).all()
    return [{"id": l.id, "created_at": l.created_at, "log_type": l.log_type.value,
             "content": l.content, "person_id": l.person_id, "project_id": l.project_id,
             "meeting_session_id": l.meeting_session_id} for l in logs]
