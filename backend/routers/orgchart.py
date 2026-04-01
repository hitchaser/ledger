from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from database import get_db
from models import Person

router = APIRouter(prefix="/api/org", tags=["org"])


@router.get("/tree")
def get_org_tree(db: Session = Depends(get_db)):
    """Return full org tree structure."""
    people = db.query(Person).filter(Person.is_archived == False).all()

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

    # Build tree
    roots = []
    for node in lookup.values():
        mid = node["manager_id"]
        if mid and mid in {str(k) for k in lookup}:
            # Find parent by string ID comparison
            for parent in lookup.values():
                if parent["id"] == mid:
                    parent["children"].append(node)
                    break
        else:
            roots.append(node)

    # Sort children at each level
    def sort_tree(nodes):
        nodes.sort(key=lambda n: n["display_name"])
        for n in nodes:
            sort_tree(n["children"])
    sort_tree(roots)

    return {"roots": roots, "total": len(people)}


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
            "role": current.role,
            "reporting_level": current.reporting_level.value if current.reporting_level else "other",
            "avatar": current.avatar,
        })
        if current.manager_id:
            current = db.query(Person).filter(Person.id == current.manager_id).first()
        else:
            current = None

    # chain[0] is the person, chain[-1] is the top of the chain
    return {"chain": chain}
