import os
import json
import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import List

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request
from fastapi.staticfiles import StaticFiles
from starlette.responses import FileResponse, JSONResponse

from database import engine, SessionLocal, Base
from models import AIJob, CaptureItem, Person, Project, CaptureItemPerson, CaptureItemProject, LinkSource
from services.ai_service import classify_capture, get_confidence_auto_resolve, get_confidence_suggest

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("ledger")

# Create tables
Base.metadata.create_all(bind=engine)

# Migration: add profile column if missing
from sqlalchemy import inspect as sa_inspect, text as sa_text
_insp = sa_inspect(engine)
_people_cols = [c["name"] for c in _insp.get_columns("people")]
if "avatar" not in _people_cols:
    with engine.begin() as conn:
        conn.execute(sa_text("ALTER TABLE people ADD COLUMN avatar TEXT"))
    logger.info("Migrated people table: added avatar column")

if "profile" not in _people_cols:
    with engine.begin() as conn:
        conn.execute(sa_text("ALTER TABLE people ADD COLUMN profile JSON"))
    # Migrate context_notes to profile.general for existing people
    _db = SessionLocal()
    for _p in _db.query(Person).all():
        _p.profile = {
            "spouse": "", "anniversary": "", "children": [],
            "pets": [], "birthday": "", "hobbies": "", "location": "",
            "general": _p.context_notes or ""
        }
    _db.commit()
    _db.close()
    logger.info("Migrated people table: added profile column")


# ── WebSocket Manager ──

class ConnectionManager:
    def __init__(self):
        self.connections: List[WebSocket] = []

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.append(ws)

    def disconnect(self, ws: WebSocket):
        if ws in self.connections:
            self.connections.remove(ws)

    async def broadcast(self, message: dict):
        for ws in self.connections[:]:
            try:
                await ws.send_json(message)
            except Exception:
                self.connections.remove(ws)

manager = ConnectionManager()


# ── AI Worker ──

async def ai_worker():
    """Background worker that processes AI classification jobs."""
    while True:
        try:
            db = SessionLocal()
            # Reset any stuck "processing" jobs older than 60s back to pending
            from sqlalchemy import text as sa_text
            db.execute(sa_text(
                "UPDATE ai_jobs SET status = 'pending' WHERE status = 'processing' "
                "AND created_at < NOW() - INTERVAL '60 seconds'"
            ))
            db.commit()
            job = db.query(AIJob).filter(AIJob.status == "pending").order_by(AIJob.created_at).first()
            if job:
                job.status = "processing"
                db.commit()

                item = db.query(CaptureItem).filter(CaptureItem.id == job.capture_item_id).first()
                if not item:
                    job.status = "done"
                    db.commit()
                    db.close()
                    continue

                people = db.query(Person).filter(Person.is_archived == False).all()
                projects = db.query(Project).filter(Project.is_archived == False).all()
                people_names = [p.display_name for p in people]
                project_names = [f"{p.name}" + (f" ({p.short_code})" if p.short_code else "") for p in projects]

                open_items = db.query(CaptureItem).filter(
                    CaptureItem.status == "open",
                    CaptureItem.id != item.id,
                ).order_by(CaptureItem.created_at.desc()).limit(50).all()
                open_context = "\n".join(f"- {i.id}: {i.raw_text[:100]}" for i in open_items)

                result = classify_capture(item.raw_text, people_names, project_names, open_context)

                if result:
                    if result.get("item_type"):
                        item.item_type = result["item_type"]
                    if result.get("urgency"):
                        item.urgency = result["urgency"]
                    item.ai_confidence = result.get("confidence", 0.0)
                    item.ai_processed_at = datetime.now(timezone.utc)

                    # Track linked IDs to avoid duplicate inserts
                    linked_people_ids = set(
                        r.person_id for r in db.query(CaptureItemPerson).filter_by(capture_item_id=item.id).all()
                    )
                    linked_project_ids = set(
                        r.project_id for r in db.query(CaptureItemProject).filter_by(capture_item_id=item.id).all()
                    )

                    for name in result.get("linked_people", []):
                        person = db.query(Person).filter(
                            Person.display_name.ilike(name),
                            Person.is_archived == False,
                        ).first()
                        if person and person.id not in linked_people_ids:
                            db.add(CaptureItemPerson(
                                capture_item_id=item.id, person_id=person.id,
                                link_source=LinkSource.ai
                            ))
                            linked_people_ids.add(person.id)

                    for name in result.get("linked_projects", []):
                        project = db.query(Project).filter(
                            Project.is_archived == False,
                            Project.name.ilike(f"%{name}%"),
                        ).first()
                        if not project:
                            project = db.query(Project).filter(
                                Project.short_code.ilike(name),
                                Project.is_archived == False,
                            ).first()
                        if project and project.id not in linked_project_ids:
                            db.add(CaptureItemProject(
                                capture_item_id=item.id, project_id=project.id,
                                link_source=LinkSource.ai
                            ))
                            linked_project_ids.add(project.id)

                    # Text-scan fallback: catch any people/projects explicitly
                    # mentioned in the raw text that the AI missed
                    raw_lower = item.raw_text.lower()
                    for person in people:
                        if person.display_name.lower() in raw_lower and person.id not in linked_people_ids:
                            db.add(CaptureItemPerson(
                                capture_item_id=item.id, person_id=person.id,
                                link_source=LinkSource.ai
                            ))
                            linked_people_ids.add(person.id)
                    for proj in projects:
                        name_match = proj.name.lower() in raw_lower
                        code_match = proj.short_code and proj.short_code.lower() in raw_lower
                        if (name_match or code_match) and proj.id not in linked_project_ids:
                            db.add(CaptureItemProject(
                                capture_item_id=item.id, project_id=proj.id,
                                link_source=LinkSource.ai
                            ))
                            linked_project_ids.add(proj.id)

                    if result.get("item_type") == "profile_update":
                        item.status = "done"
                        item.resolved_at = datetime.now(timezone.utc)
                        from models import ProfileLog, LogType
                        from services.ai_service import parse_profile_update

                        for person in (db.query(Person).filter(
                            Person.id.in_(linked_people_ids)
                        ).all() if linked_people_ids else []):
                            profile = person.profile or {
                                "spouse": "", "anniversary": "", "children": [],
                                "pets": [], "birthday": "", "hobbies": "",
                                "location": "", "general": ""
                            }
                            result = parse_profile_update(item.raw_text, profile)
                            ops = result.get("ops", [])

                            # Deep copy profile to ensure SQLAlchemy detects changes
                            import copy
                            profile = copy.deepcopy(profile)

                            log_parts = []
                            for op in ops:
                                field = op.get("field", "general")
                                action = op.get("action", "add")
                                value = op.get("value", "")

                                if field in ("children", "pets"):
                                    current_list = list(profile.get(field, []))
                                    if action == "remove":
                                        if value:
                                            current_list = [v for v in current_list if v.lower() != value.lower()]
                                        else:
                                            current_list = []
                                    elif action in ("add", "replace"):
                                        if value and not any(v.lower() == value.lower() for v in current_list):
                                            current_list.append(value)
                                    profile[field] = current_list
                                elif field == "general":
                                    if action == "add" and value:
                                        existing = profile.get("general", "")
                                        profile["general"] = (existing + "\n" + value).strip() if existing else value
                                else:
                                    if action in ("replace", "add"):
                                        profile[field] = value
                                    elif action == "remove":
                                        profile[field] = ""

                                log_parts.append(f"{action} {field}: {value}" if value else f"{action} {field}")

                            person.profile = profile
                            from sqlalchemy.orm.attributes import flag_modified
                            flag_modified(person, "profile")

                            db.add(ProfileLog(
                                log_type=LogType.profile_update,
                                content="; ".join(log_parts) if log_parts else item.raw_text,
                                person_id=person.id,
                            ))

                        for proj in (db.query(Project).filter(
                            Project.id.in_(linked_project_ids)
                        ).all() if linked_project_ids else []):
                            proj.context_notes = (
                                (proj.context_notes + "\n" if proj.context_notes else "")
                                + item.raw_text
                            )
                            db.add(ProfileLog(
                                log_type=LogType.profile_update,
                                content=item.raw_text,
                                project_id=proj.id,
                            ))

                    job.status = "done"
                    db.commit()

                    from routers.captures import item_to_response
                    db.refresh(item)
                    await manager.broadcast({
                        "type": "item_updated",
                        "item": json.loads(json.dumps(item_to_response(item), default=str)),
                    })

                    candidates = result.get("resolution_candidates", [])
                    confidence = result.get("confidence", 0.0)
                    if candidates and confidence >= get_confidence_suggest():
                        resolved_items = []
                        if confidence >= get_confidence_auto_resolve():
                            # Actually resolve the candidate items
                            for cid in candidates:
                                try:
                                    from uuid import UUID as parse_uuid
                                    candidate_uuid = parse_uuid(str(cid))
                                    candidate = db.query(CaptureItem).filter(
                                        CaptureItem.id == candidate_uuid,
                                        CaptureItem.status == "open",
                                    ).first()
                                    if candidate:
                                        candidate.status = "done"
                                        candidate.resolved_at = datetime.now(timezone.utc)
                                        candidate.resolution_note = f"Auto-resolved by: {item.raw_text[:100]}"
                                        resolved_items.append(str(candidate.id))
                                except (ValueError, Exception) as e:
                                    logger.warning(f"Failed to resolve candidate {cid}: {e}")
                            if resolved_items:
                                db.commit()

                        await manager.broadcast({
                            "type": "resolution_suggestion",
                            "new_item_id": str(item.id),
                            "candidate_ids": candidates,
                            "resolved_ids": resolved_items,
                            "confidence": confidence,
                            "auto_resolve": confidence >= get_confidence_auto_resolve(),
                        })

                else:
                    # AI failed but still do text-scan linking
                    linked_people_ids = set(
                        r.person_id for r in db.query(CaptureItemPerson).filter_by(capture_item_id=item.id).all()
                    )
                    linked_project_ids = set(
                        r.project_id for r in db.query(CaptureItemProject).filter_by(capture_item_id=item.id).all()
                    )
                    raw_lower = item.raw_text.lower()
                    for person in people:
                        if person.display_name.lower() in raw_lower and person.id not in linked_people_ids:
                            db.add(CaptureItemPerson(
                                capture_item_id=item.id, person_id=person.id,
                                link_source=LinkSource.ai
                            ))
                            linked_people_ids.add(person.id)
                    for proj in projects:
                        name_match = proj.name.lower() in raw_lower
                        code_match = proj.short_code and proj.short_code.lower() in raw_lower
                        if (name_match or code_match) and proj.id not in linked_project_ids:
                            db.add(CaptureItemProject(
                                capture_item_id=item.id, project_id=proj.id,
                                link_source=LinkSource.ai
                            ))
                            linked_project_ids.add(proj.id)
                    item.ai_processed_at = datetime.now(timezone.utc)
                    job.status = "failed"
                    job.error = "No result from AI"
                    db.commit()

                    # Broadcast update if text-scan found links
                    from routers.captures import item_to_response
                    db.refresh(item)
                    if item.linked_people or item.linked_projects:
                        await manager.broadcast({
                            "type": "item_updated",
                            "item": json.loads(json.dumps(item_to_response(item), default=str)),
                        })

            db.close()
        except Exception as e:
            logger.error(f"AI worker error: {e}")
        await asyncio.sleep(2)


# ── App Lifecycle ──

@asynccontextmanager
async def lifespan(app: FastAPI):
    task = asyncio.create_task(ai_worker())
    yield
    task.cancel()


app = FastAPI(title="Ledger", lifespan=lifespan)


# ── Auth Middleware ──

@app.middleware("http")
async def auth_middleware(request: Request, call_next):
    path = request.url.path

    # Allow: auth endpoints, health check, static assets, SPA shell
    if (path.startswith("/api/auth/")
        or path == "/api/health"
        or not path.startswith("/api/")):
        return await call_next(request)

    from routers.auth import verify_token, COOKIE_NAME
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return JSONResponse(status_code=401, content={"detail": "Not authenticated"})
    try:
        verify_token(token)
    except Exception:
        return JSONResponse(status_code=401, content={"detail": "Invalid or expired session"})

    return await call_next(request)


# ── Include routers ──

from routers.auth import router as auth_router
from routers.captures import router as captures_router
from routers.people import router as people_router
from routers.projects import router as projects_router
from routers.meetings import router as meetings_router
from routers.digest import router as digest_router
from routers.settings import router as settings_router

app.include_router(auth_router)
app.include_router(captures_router)
app.include_router(people_router)
app.include_router(projects_router)
app.include_router(meetings_router)
app.include_router(digest_router)
app.include_router(settings_router)


# ── WebSocket (auth-protected) ──

@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    from routers.auth import verify_token, COOKIE_NAME
    token = ws.cookies.get(COOKIE_NAME)
    if not token:
        await ws.close(code=4001)
        return
    try:
        verify_token(token)
    except Exception:
        await ws.close(code=4001)
        return

    await manager.connect(ws)
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(ws)


# ── Health check ──

@app.get("/api/health")
def health():
    return {"status": "ok"}


# ── Serve React SPA ──

static_dir = os.path.join(os.path.dirname(__file__), "static")
if os.path.isdir(static_dir):
    assets_dir = os.path.join(static_dir, "assets")
    if os.path.isdir(assets_dir):
        app.mount("/assets", StaticFiles(directory=assets_dir), name="assets")

    @app.get("/{full_path:path}")
    async def serve_spa(full_path: str):
        file_path = os.path.join(static_dir, full_path)
        if full_path and os.path.isfile(file_path):
            return FileResponse(file_path)
        return FileResponse(os.path.join(static_dir, "index.html"))
