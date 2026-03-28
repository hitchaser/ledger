from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from database import get_db
from models import Project as ProjectModel, CaptureItem, CaptureItemProject, ProfileLog, ItemStatus
from schemas import ProjectCreate, ProjectUpdate, ProjectResponse, ProfileLogResponse

router = APIRouter(prefix="/api/projects", tags=["projects"])


def project_response(p: ProjectModel, db: Session) -> dict:
    count = db.query(CaptureItemProject).join(CaptureItem).filter(
        CaptureItemProject.project_id == p.id,
        CaptureItem.status == ItemStatus.open
    ).count()
    return {
        "id": p.id, "name": p.name, "short_code": p.short_code,
        "status": p.status.value if p.status else "active",
        "created_at": p.created_at, "updated_at": p.updated_at,
        "is_archived": p.is_archived, "context_notes": p.context_notes or "",
        "open_item_count": count,
    }


@router.get("")
def list_projects(include_archived: bool = False, db: Session = Depends(get_db)):
    q = db.query(ProjectModel)
    if not include_archived:
        q = q.filter(ProjectModel.is_archived == False)
    projects = q.order_by(ProjectModel.name).all()
    return [project_response(p, db) for p in projects]


@router.post("", response_model=ProjectResponse)
def create_project(body: ProjectCreate, db: Session = Depends(get_db)):
    p = ProjectModel(
        name=body.name, short_code=body.short_code, status=body.status,
        context_notes=body.context_notes or "",
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return project_response(p, db)


@router.get("/{project_id}")
def get_project(project_id: UUID, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    return project_response(p, db)


@router.patch("/{project_id}")
def update_project(project_id: UUID, body: ProjectUpdate, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    for field, val in body.model_dump(exclude_unset=True).items():
        setattr(p, field, val)

    # Auto-archive when status set to complete or cancelled
    if p.status in ("complete", "cancelled"):
        p.is_archived = True
    # Auto-unarchive when status set back to active or on_hold
    elif p.status in ("active", "on_hold"):
        p.is_archived = False

    db.commit()
    db.refresh(p)
    return project_response(p, db)


@router.delete("/{project_id}")
def delete_project(project_id: UUID, db: Session = Depends(get_db)):
    p = db.query(ProjectModel).filter(ProjectModel.id == project_id).first()
    if not p:
        raise HTTPException(404, "Not found")
    if not p.is_archived:
        raise HTTPException(400, "Project must be archived before deleting")
    db.query(CaptureItemProject).filter(CaptureItemProject.project_id == project_id).delete()
    db.query(ProfileLog).filter(ProfileLog.project_id == project_id).delete()
    db.delete(p)
    db.commit()
    return {"ok": True}


@router.get("/{project_id}/items")
def get_project_items(project_id: UUID, status: str = "open", db: Session = Depends(get_db)):
    from routers.captures import item_to_response
    q = db.query(CaptureItem).join(CaptureItemProject).filter(CaptureItemProject.project_id == project_id)
    if status:
        q = q.filter(CaptureItem.status == status)
    items = q.order_by(CaptureItem.created_at.desc()).all()
    return [item_to_response(i) for i in items]


@router.get("/{project_id}/logs")
def get_project_logs(project_id: UUID, db: Session = Depends(get_db)):
    logs = db.query(ProfileLog).filter(ProfileLog.project_id == project_id).order_by(ProfileLog.created_at.desc()).all()
    return [{"id": l.id, "created_at": l.created_at, "log_type": l.log_type.value,
             "content": l.content, "person_id": l.person_id, "project_id": l.project_id,
             "meeting_session_id": l.meeting_session_id} for l in logs]
