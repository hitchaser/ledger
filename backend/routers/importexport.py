import io
import json
import csv
from uuid import UUID
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from database import get_db, SessionLocal
from models import (
    Person, Project, CaptureItem, CaptureItemPerson, CaptureItemProject,
    PersonProject, MeetingSession, ProfileLog, ItemNote, Setting, AIJob,
    ReportingLevel, ItemStatus
)

router = APIRouter(prefix="/api/import-export", tags=["import-export"])

REPORTING_LEVEL_MAP = {
    "executive": ReportingLevel.executive,
    "director": ReportingLevel.executive,
    "manager": ReportingLevel.manager,
    "employee": ReportingLevel.ic,
    "ic": ReportingLevel.ic,
    "peer": ReportingLevel.ic,
    "other": ReportingLevel.ic,
}

# ── Column name mappings for org XLSX import ──
ORG_COL_MAP = {
    "unique identifier": "external_id",
    "name": "name",
    "reports to": "reports_to",
    "line detail 1": "role",
    "line detail 2": "location",
    "line detail 3": "_unused",
    "organization name": "org_name",
}


# ── Import ──

@router.post("/preview")
async def preview_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Parse uploaded CSV/XLSX and return preview of changes."""
    content = await file.read()
    rows = _parse_file(file.filename, content)

    if not rows:
        raise HTTPException(400, "No data found in file")

    # Validate and categorize
    existing = {p.display_name.lower(): p for p in db.query(Person).all()}
    preview = []
    errors = []

    for i, row in enumerate(rows, start=2):  # Row 2+ (1 is header)
        display_name = (row.get("display_name") or row.get("display name") or "").strip()
        full_name = (row.get("full_name") or row.get("full name") or row.get("name") or "").strip()

        if not display_name and not full_name:
            errors.append({"row": i, "error": "Missing name and display name"})
            continue

        if not display_name:
            display_name = full_name
        if not full_name:
            full_name = display_name

        action = "update" if display_name.lower() in existing else "create"
        preview.append({
            "row": i,
            "action": action,
            "display_name": display_name,
            "full_name": full_name,
            "role": (row.get("title") or row.get("role") or "").strip(),
            "reporting_level": (row.get("reporting_level") or row.get("level") or row.get("director/manager/employee") or "").strip().lower(),
            "reporting_manager": (row.get("reporting_manager") or row.get("reporting manager") or row.get("manager") or "").strip(),
            "location": (row.get("location") or "").strip(),
            "address": (row.get("address") or "").strip(),
            "email": (row.get("email") or "").strip(),
        })

    # Check manager references
    all_names = {p["display_name"].lower() for p in preview}
    all_names.update(existing.keys())
    for p in preview:
        mgr = p["reporting_manager"]
        if mgr and mgr.lower() not in all_names:
            errors.append({"row": p["row"], "error": f"Reporting manager '{mgr}' not found"})

    creates = len([p for p in preview if p["action"] == "create"])
    updates = len([p for p in preview if p["action"] == "update"])

    return {"preview": preview, "errors": errors, "creates": creates, "updates": updates, "total": len(preview)}


@router.post("/commit")
async def commit_import(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Actually import the file — creates and updates people."""
    content = await file.read()
    rows = _parse_file(file.filename, content)

    if not rows:
        raise HTTPException(400, "No data found in file")

    existing = {p.display_name.lower(): p for p in db.query(Person).all()}
    created = 0
    updated = 0
    errors = []

    # First pass: create/update people (without manager links)
    for i, row in enumerate(rows, start=2):
        display_name = (row.get("display_name") or row.get("display name") or "").strip()
        full_name = (row.get("full_name") or row.get("full name") or row.get("name") or "").strip()
        if not display_name and not full_name:
            continue
        if not display_name:
            display_name = full_name
        if not full_name:
            full_name = display_name

        role = (row.get("title") or row.get("role") or "").strip()
        level_str = (row.get("reporting_level") or row.get("level") or row.get("director/manager/employee") or "").strip().lower()
        level = REPORTING_LEVEL_MAP.get(level_str, ReportingLevel.other)
        location = (row.get("location") or "").strip()
        address = (row.get("address") or "").strip()
        email = (row.get("email") or "").strip()

        person = existing.get(display_name.lower())
        if person:
            # Update
            person.name = full_name
            person.role = role or person.role
            person.reporting_level = level
            if email:
                person.email = email
            profile = {**({} if not person.profile else person.profile)}
            if location:
                profile["location"] = location
            if address:
                profile["address"] = address
            person.profile = profile
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(person, "profile")
            updated += 1
        else:
            # Create
            profile = {
                "spouse": "", "anniversary": "", "children": [],
                "pets": [], "birthday": "", "hobbies": "",
                "location": location, "address": address, "general": ""
            }
            person = Person(
                name=full_name, display_name=display_name, role=role,
                reporting_level=level, email=email, profile=profile,
            )
            db.add(person)
            db.flush()
            existing[display_name.lower()] = person
            created += 1

    # Second pass: resolve manager references
    for row in rows:
        display_name = (row.get("display_name") or row.get("display name") or "").strip()
        if not display_name:
            display_name = (row.get("full_name") or row.get("full name") or row.get("name") or "").strip()
        mgr_name = (row.get("reporting_manager") or row.get("reporting manager") or row.get("manager") or "").strip()

        if display_name and mgr_name:
            person = existing.get(display_name.lower())
            manager = existing.get(mgr_name.lower())
            if person and manager:
                person.manager_id = manager.id
            elif mgr_name:
                errors.append(f"Manager '{mgr_name}' not found for '{display_name}'")

    db.commit()
    return {"created": created, "updated": updated, "errors": errors}


def _find_import_roots(org_rows: list) -> set:
    """Find root external_ids of the import — people whose reports_to is not in the file."""
    all_ext_ids = {r["external_id"] for r in org_rows}
    roots = set()
    for r in org_rows:
        reports_to = r.get("reports_to", "").strip()
        if not reports_to or reports_to not in all_ext_ids:
            roots.add(r["external_id"])
    return roots


def _get_subtree_ext_ids(db, root_ext_ids: set) -> set:
    """Get all external_ids currently under the given root(s) in the DB. BFS tree walk."""
    if not root_ext_ids:
        return set()
    # Load all org-imported people with external_ids
    all_people = db.query(Person).filter(Person.external_id != None, Person.import_source == "org_import").all()
    ext_to_id = {p.external_id: p.id for p in all_people}
    id_to_ext = {p.id: p.external_id for p in all_people}
    children_map = {}
    for p in all_people:
        if p.manager_id:
            children_map.setdefault(p.manager_id, []).append(p.id)

    # Find the Person IDs for our roots
    root_person_ids = set()
    for ext_id in root_ext_ids:
        pid = ext_to_id.get(ext_id)
        if pid:
            root_person_ids.add(pid)

    # BFS from roots
    result_ext_ids = set()
    queue = list(root_person_ids)
    seen = set()
    while queue:
        current = queue.pop(0)
        if current in seen:
            continue
        seen.add(current)
        ext = id_to_ext.get(current)
        if ext:
            result_ext_ids.add(ext)
        queue.extend(children_map.get(current, []))
    return result_ext_ids


def _parse_org_xlsx(rows: list) -> list:
    """Normalize org XLSX rows using column name mapping."""
    result = []
    for row in rows:
        mapped = {}
        for col_name, value in row.items():
            key = ORG_COL_MAP.get(col_name.strip().lower(), col_name.strip().lower())
            mapped[key] = (value or "").strip()
        if mapped.get("external_id") and mapped.get("name"):
            result.append(mapped)
    return result


@router.post("/org-preview")
async def org_preview(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Preview org chart XLSX import — shows creates, updates, archives."""
    content = await file.read()
    rows = _parse_file(file.filename, content)
    if not rows:
        raise HTTPException(400, "No data found in file")

    org_rows = _parse_org_xlsx(rows)
    if not org_rows:
        raise HTTPException(400, "No valid rows found. Expected columns: Unique Identifier, Name, Reports To, Line Detail 1, Line Detail 2, Organization Name")

    # Load existing people with external_ids
    existing_by_ext = {p.external_id: p for p in db.query(Person).filter(Person.external_id != None).all()}
    imported_ext_ids = {r["external_id"] for r in org_rows}

    creates = []
    updates = []
    unchanged = 0
    archives = []
    errors = []

    for r in org_rows:
        ext_id = r["external_id"]
        name = r.get("name", "")
        role = r.get("role", "")
        location = r.get("location", "")
        reports_to = r.get("reports_to", "")
        org_name = r.get("org_name", "")
        is_leader = bool(org_name)

        person = existing_by_ext.get(ext_id)
        if person:
            # Check what would change
            changes = {}
            if name and name != person.name:
                changes["name"] = {"from": person.name, "to": name}
            if role and role != (person.role or ""):
                changes["role"] = {"from": person.role or "", "to": role}
            profile = person.profile or {}
            if location and location != profile.get("location", ""):
                changes["location"] = {"from": profile.get("location", ""), "to": location}
            if changes:
                updates.append({"external_id": ext_id, "name": name, "changes": changes, "is_leader": is_leader})
            else:
                unchanged += 1
        else:
            creates.append({"external_id": ext_id, "name": name, "role": role, "location": location, "is_leader": is_leader})

    # Scope archive to the import's subtree only
    import_roots = _find_import_roots(org_rows)
    subtree_ext_ids = _get_subtree_ext_ids(db, import_roots)

    # Departed = in the subtree but not in the new import
    for ext_id in subtree_ext_ids:
        if ext_id not in imported_ext_ids:
            person = existing_by_ext.get(ext_id)
            if person and not person.is_archived:
                archives.append({"external_id": ext_id, "name": person.name, "display_name": person.display_name})

    return {
        "creates": creates,
        "updates": updates,
        "archives": archives,
        "unchanged_count": unchanged,
        "errors": errors,
        "total_rows": len(org_rows),
    }


@router.post("/org-commit")
async def org_commit(file: UploadFile = File(...), db: Session = Depends(get_db)):
    """Commit org chart XLSX import — creates, updates, archives people."""
    content = await file.read()
    rows = _parse_file(file.filename, content)
    if not rows:
        raise HTTPException(400, "No data found in file")

    org_rows = _parse_org_xlsx(rows)
    if not org_rows:
        raise HTTPException(400, "No valid org rows found")

    existing_by_ext = {p.external_id: p for p in db.query(Person).filter(Person.external_id != None).all()}
    imported_ext_ids = {r["external_id"] for r in org_rows}
    created_count = 0
    updated_count = 0
    archived_count = 0
    errors = []

    # Pass 1: Create/update all people (without manager links)
    ext_to_person = dict(existing_by_ext)  # ext_id → Person

    for r in org_rows:
        ext_id = r["external_id"]
        name = r.get("name", "").strip()
        role = r.get("role", "").strip()
        location = r.get("location", "").strip()
        org_name = r.get("org_name", "").strip()

        person = ext_to_person.get(ext_id)
        if person:
            # Update org fields only — preserve user-customized data
            old_name = person.name
            if name and name != old_name:
                person.name = name
                # Only update display_name if it wasn't customized (still equals old name)
                if person.display_name == old_name:
                    person.display_name = name
            if role:
                person.role = role
            if location:
                import copy
                profile = copy.deepcopy(person.profile or {})
                profile["location"] = location
                person.profile = profile
                from sqlalchemy.orm.attributes import flag_modified
                flag_modified(person, "profile")
            person.import_source = "org_import"
            # Unarchive if they were previously archived (returned to org)
            if person.is_archived:
                person.is_archived = False
            updated_count += 1
        else:
            # Create new person
            profile = {
                "spouse": "", "anniversary": "", "children": [],
                "pets": [], "birthday": "", "hobbies": "",
                "location": location, "address": "", "general": ""
            }
            person = Person(
                name=name,
                display_name=name,
                role=role,
                reporting_level=ReportingLevel.ic,
                import_source="org_import",
                external_id=ext_id,
                profile=profile,
            )
            db.add(person)
            db.flush()
            ext_to_person[ext_id] = person
            created_count += 1

    # Pass 2: Resolve manager references via external_id
    for r in org_rows:
        ext_id = r["external_id"]
        reports_to = r.get("reports_to", "").strip()
        person = ext_to_person.get(ext_id)
        if person and reports_to:
            manager = ext_to_person.get(reports_to)
            if manager:
                person.manager_id = manager.id
            else:
                errors.append(f"Manager ext_id '{reports_to}' not found for '{person.name}'")
        elif person and not reports_to:
            person.manager_id = None

    # Pass 3: Archive departed — scoped to the import's subtree only
    import_roots = _find_import_roots(org_rows)
    subtree_ext_ids = _get_subtree_ext_ids(db, import_roots)
    for ext_id in subtree_ext_ids:
        if ext_id not in imported_ext_ids:
            person = existing_by_ext.get(ext_id)
            if person and not person.is_archived:
                person.is_archived = True
                archived_count += 1

    # Pass 4: Infer reporting_level from tree structure
    # Anyone with direct reports is at least manager, top of tree is executive, rest is IC
    has_reports = set()
    for person in ext_to_person.values():
        if person.manager_id:
            has_reports.add(person.manager_id)

    for person in ext_to_person.values():
        if person.id in has_reports:
            if not person.manager_id:
                person.reporting_level = ReportingLevel.executive
            else:
                person.reporting_level = ReportingLevel.manager
        else:
            person.reporting_level = ReportingLevel.ic

    db.commit()
    return {
        "created": created_count,
        "updated": updated_count,
        "archived": archived_count,
        "errors": errors,
        "total": len(org_rows),
    }


def _parse_file(filename: str, content: bytes) -> list:
    """Parse CSV or XLSX file into list of dicts."""
    if filename.endswith(".xlsx"):
        try:
            import openpyxl
            wb = openpyxl.load_workbook(io.BytesIO(content), read_only=True)
            ws = wb.active
            rows = list(ws.iter_rows(values_only=True))
            if len(rows) < 2:
                return []
            headers = [str(h).strip().lower() if h else "" for h in rows[0]]
            return [{headers[j]: (str(cell).strip() if cell else "") for j, cell in enumerate(row) if j < len(headers)} for row in rows[1:]]
        except ImportError:
            raise HTTPException(400, "Excel support not available. Please use CSV format.")
    else:
        # CSV
        text = content.decode("utf-8-sig")
        reader = csv.DictReader(io.StringIO(text))
        return [{k.strip().lower(): (v.strip() if v else "") for k, v in row.items()} for row in reader]


# ── Export: Team Directory ──

@router.get("/export/team")
def export_team(
    columns: str = Query("display_name,name,role,reporting_level,location,address,email,manager"),
    format: str = Query("csv"),
    db: Session = Depends(get_db),
):
    """Export team directory as CSV or XLSX."""
    cols = [c.strip() for c in columns.split(",")]
    people = db.query(Person).filter(Person.is_archived == False).order_by(Person.display_name).all()

    rows = []
    for p in people:
        profile = p.profile or {}
        manager_name = ""
        if p.manager_id and p.manager:
            manager_name = p.manager.display_name
        row = {}
        for col in cols:
            if col == "display_name":
                row["Display Name"] = p.display_name
            elif col == "name":
                row["Full Name"] = p.name
            elif col == "role":
                row["Title"] = p.role or ""
            elif col == "reporting_level":
                row["Level"] = p.reporting_level.value if p.reporting_level else ""
            elif col == "location":
                row["Location"] = profile.get("location", "")
            elif col == "address":
                row["Address"] = profile.get("address", "")
            elif col == "email":
                row["Email"] = p.email or ""
            elif col == "manager":
                row["Reporting Manager"] = manager_name
            elif col == "spouse":
                row["Spouse"] = profile.get("spouse", "")
            elif col == "birthday":
                row["Birthday"] = profile.get("birthday", "")
            elif col == "children":
                row["Children"] = ", ".join(profile.get("children", []))
            elif col == "hobbies":
                row["Hobbies"] = profile.get("hobbies", "")
        rows.append(row)

    if format == "xlsx":
        return _export_xlsx(rows, "team_directory")
    else:
        return _export_csv(rows, "team_directory")


# ── Export: Full Backup ──

@router.get("/export/backup")
def export_backup(db: Session = Depends(get_db)):
    """Full JSON backup of all Ledger data."""
    from routers.captures import item_to_response

    people = db.query(Person).all()
    projects = db.query(Project).all()
    items = db.query(CaptureItem).order_by(CaptureItem.created_at).all()
    meetings = db.query(MeetingSession).all()
    logs = db.query(ProfileLog).all()
    settings = db.query(Setting).all()
    person_projects = db.query(PersonProject).all()

    backup = {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "version": "1.0",
        "people": [{
            "id": str(p.id), "name": p.name, "display_name": p.display_name,
            "role": p.role, "reporting_level": p.reporting_level.value if p.reporting_level else "other",
            "email": p.email, "is_archived": p.is_archived,
            "profile": p.profile, "avatar": p.avatar,
            "manager_id": str(p.manager_id) if p.manager_id else None,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        } for p in people],
        "projects": [{
            "id": str(p.id), "name": p.name, "short_code": p.short_code,
            "status": p.status.value if p.status else "active",
            "is_archived": p.is_archived, "context_notes": p.context_notes,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        } for p in projects],
        "items": [item_to_response(i) for i in items],
        "meetings": [{
            "id": str(m.id), "started_at": m.started_at.isoformat() if m.started_at else None,
            "ended_at": m.ended_at.isoformat() if m.ended_at else None,
            "person_id": str(m.person_id) if m.person_id else None,
            "project_id": str(m.project_id) if m.project_id else None,
            "items_resolved": m.items_resolved, "items_added": m.items_added,
            "ai_summary": m.ai_summary,
        } for m in meetings],
        "profile_logs": [{
            "id": str(l.id), "created_at": l.created_at.isoformat(),
            "log_type": l.log_type.value, "content": l.content,
            "person_id": str(l.person_id) if l.person_id else None,
            "project_id": str(l.project_id) if l.project_id else None,
        } for l in logs],
        "person_projects": [{
            "person_id": str(pp.person_id), "project_id": str(pp.project_id)
        } for pp in person_projects],
        "settings": {s.key: s.value for s in settings},
    }

    content = json.dumps(backup, indent=2, default=str)
    return StreamingResponse(
        io.BytesIO(content.encode()),
        media_type="application/json",
        headers={"Content-Disposition": f"attachment; filename=ledger_backup_{datetime.now().strftime('%Y%m%d')}.json"}
    )


# ── Helpers ──

def _export_csv(rows: list, name: str):
    if not rows:
        return StreamingResponse(io.BytesIO(b"No data"), media_type="text/csv")
    output = io.StringIO()
    writer = csv.DictWriter(output, fieldnames=rows[0].keys())
    writer.writeheader()
    writer.writerows(rows)
    return StreamingResponse(
        io.BytesIO(output.getvalue().encode("utf-8-sig")),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={name}.csv"}
    )


def _export_xlsx(rows: list, name: str):
    try:
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        if rows:
            ws.append(list(rows[0].keys()))
            for row in rows:
                ws.append(list(row.values()))
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        return StreamingResponse(
            output,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename={name}.xlsx"}
        )
    except ImportError:
        raise HTTPException(400, "Excel export not available. Use CSV format.")
