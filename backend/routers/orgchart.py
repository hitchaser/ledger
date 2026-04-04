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


@router.get("/focused-tree")
def get_focused_tree(focus: Optional[str] = Query(None), db: Session = Depends(get_db)):
    """Return a lightweight tree for the focused person's context only.
    Returns: chain to root (each with siblings), focused person's direct reports (with child counts).
    This avoids sending all 5000 nodes."""

    # Resolve focus — default to owner
    focus_id = focus
    if not focus_id:
        owner_setting = db.query(Setting).filter(Setting.key == "owner_person_id").first()
        if owner_setting and owner_setting.value:
            focus_id = owner_setting.value

    if not focus_id:
        return {"nodes": [], "focus_id": None, "total": 0}

    # Load all people as lightweight rows (id, name, display_name, role, avatar, manager_id, reporting_level)
    all_people = db.query(Person).filter(Person.is_archived == False).all()
    total = len(all_people)
    lookup = {}
    children_map = {}  # parent_id → [child Person]
    for p in all_people:
        lookup[str(p.id)] = p
        mid = str(p.manager_id) if p.manager_id else None
        if mid:
            children_map.setdefault(mid, []).append(p)

    focus_person = lookup.get(focus_id)
    if not focus_person:
        return {"nodes": [], "focus_id": focus_id, "total": total}

    def person_node(p, include_children=False):
        pid = str(p.id)
        direct_reports = children_map.get(pid, [])
        node = {
            "id": pid,
            "display_name": p.display_name,
            "name": p.name,
            "role": p.role,
            "avatar": p.avatar,
            "reporting_level": p.reporting_level.value if p.reporting_level else "other",
            "manager_id": str(p.manager_id) if p.manager_id else None,
            "child_count": len(direct_reports),
        }
        if include_children:
            node["children"] = sorted(
                [person_node(c) for c in direct_reports],
                key=lambda n: n["display_name"]
            )
        return node

    # Build the chain from focus to root
    chain = []
    current = focus_person
    seen = set()
    while current and str(current.id) not in seen:
        seen.add(str(current.id))
        chain.append(current)
        if current.manager_id:
            current = lookup.get(str(current.manager_id))
        else:
            current = None
    chain.reverse()  # root first

    # Build the result: each chain member gets its siblings shown,
    # and the focused person gets children expanded
    nodes = []
    for i, person in enumerate(chain):
        pid = str(person.id)
        is_focus = (pid == focus_id)
        mid = str(person.manager_id) if person.manager_id else None

        # Add siblings (same manager) for context
        if mid:
            siblings = sorted(children_map.get(mid, []), key=lambda p: p.display_name)
        else:
            # Root level — show all roots
            siblings = sorted([p for p in all_people if not p.manager_id], key=lambda p: p.display_name)

        for sib in siblings:
            sid = str(sib.id)
            in_chain = sid in {str(c.id) for c in chain}
            is_this_focus = (sid == focus_id)
            node = person_node(sib, include_children=is_this_focus)
            node["depth"] = i
            node["in_chain"] = in_chain
            node["is_focus"] = is_this_focus
            node["expanded"] = is_this_focus or in_chain
            nodes.append(node)

    return {
        "nodes": nodes,
        "focus_id": focus_id,
        "chain": [str(c.id) for c in chain],
        "total": total,
    }


@router.get("/children/{person_id}")
def get_org_children(person_id: UUID, db: Session = Depends(get_db)):
    """Return direct children of a person — for lazy loading on expand."""
    children = db.query(Person).filter(
        Person.manager_id == person_id,
        Person.is_archived == False,
    ).order_by(Person.display_name).all()

    # Get child counts for each child
    all_ids = [c.id for c in children]
    child_counts = {}
    if all_ids:
        from sqlalchemy import func
        counts = db.query(
            Person.manager_id, func.count(Person.id)
        ).filter(
            Person.manager_id.in_(all_ids),
            Person.is_archived == False,
        ).group_by(Person.manager_id).all()
        child_counts = dict(counts)

    return [{
        "id": str(c.id),
        "display_name": c.display_name,
        "name": c.name,
        "role": c.role,
        "avatar": c.avatar,
        "reporting_level": c.reporting_level.value if c.reporting_level else "other",
        "manager_id": str(c.manager_id) if c.manager_id else None,
        "child_count": child_counts.get(c.id, 0),
    } for c in children]


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
