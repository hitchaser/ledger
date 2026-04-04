from uuid import UUID
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Person, Setting

router = APIRouter(prefix="/api/org", tags=["org"])


def _build_tree(people):
    """Build tree structure from a list of people rows."""
    lookup = {}
    for p in people:
        lookup[p.id] = {
            "id": str(p.id),
            "display_name": p.display_name,
            "name": p.name,
            "role": p.role,
            "reporting_level": p.reporting_level.value if p.reporting_level else "other",
            "avatar": p.avatar,
            "manager_id": str(p.manager_id) if p.manager_id else None,
            "children": [],
        }

    roots = []
    for node in lookup.values():
        mid = node["manager_id"]
        if mid and mid in {str(k) for k in lookup}:
            for parent in lookup.values():
                if parent["id"] == mid:
                    parent["children"].append(node)
                    break
        else:
            roots.append(node)

    def sort_tree(nodes):
        nodes.sort(key=lambda n: n["display_name"])
        for n in nodes:
            sort_tree(n["children"])
    sort_tree(roots)

    return roots, lookup


def _get_chain_ids(lookup, focus_id_str):
    """Walk up from focus to root, return set of ancestor IDs."""
    chain = []
    current = focus_id_str
    seen = set()
    while current and current not in seen:
        seen.add(current)
        node = None
        for n in lookup.values():
            if n["id"] == current:
                node = n
                break
        if not node:
            break
        chain.append(current)
        current = node["manager_id"]
    return chain


def _get_expanded_ids(lookup, focus_id_str):
    """Compute which nodes should be auto-expanded for a given focus."""
    expanded = set()
    # The focus person's chain to root
    chain = _get_chain_ids(lookup, focus_id_str)
    expanded.update(chain)
    # All ancestors' direct children (siblings at each level)
    for cid in chain:
        for n in lookup.values():
            if n["manager_id"] == cid:
                expanded.add(n["id"])
    # The focus person's direct reports
    for n in lookup.values():
        if n["manager_id"] == focus_id_str:
            expanded.add(n["id"])
    return list(expanded), chain


@router.get("/tree")
def get_org_tree(focus: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Return full org tree structure with optional focus hints."""
    people = db.query(Person).filter(Person.is_archived == False).all()
    roots, lookup = _build_tree(people)

    result = {"roots": roots, "total": len(people)}

    # Resolve focus — use owner_person_id as default if no focus given
    focus_id = focus
    if not focus_id:
        owner_setting = db.query(Setting).filter(Setting.key == "owner_person_id").first()
        if owner_setting and owner_setting.value:
            focus_id = owner_setting.value

    if focus_id and focus_id in {str(k) for k in lookup}:
        expanded_ids, chain = _get_expanded_ids(lookup, focus_id)
        result["expanded_ids"] = expanded_ids
        result["focus_id"] = focus_id
        result["focus_chain"] = chain
    else:
        result["expanded_ids"] = []
        result["focus_chain"] = []

    return result


@router.get("/my-org")
def get_my_org(db: Session = Depends(get_db)):
    """Return the set of person IDs in the owner's org (downward tree walk)."""
    from routers.people import _get_my_org_ids
    org_ids = _get_my_org_ids(db)
    return {"person_ids": [str(pid) for pid in org_ids]}


@router.get("/chain/{person_id}")
def get_org_chain(person_id: UUID, db: Session = Depends(get_db)):
    """Return the management chain for a person (bottom to top)."""
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        return {"chain": []}

    chain = []
    current = person
    seen = set()
    while current and current.id not in seen:
        seen.add(current.id)
        chain.append({
            "id": str(current.id),
            "display_name": current.display_name,
            "name": current.name,
            "role": current.role,
            "reporting_level": current.reporting_level.value if current.reporting_level else "other",
            "avatar": current.avatar,
        })
        if current.manager_id:
            current = db.query(Person).filter(Person.id == current.manager_id).first()
        else:
            current = None

    return {"chain": chain}
