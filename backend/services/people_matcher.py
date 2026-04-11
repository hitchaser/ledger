import re
from sqlalchemy.orm import Session
from models import Person


def strip_parens(s: str) -> str:
    """Remove any `(...)` groups (status notes like '(On Leave)', '(2)', etc.)."""
    return re.sub(r"\s*\([^)]*\)", "", s or "").strip()


def normalize_cn(cn: str) -> list[str]:
    """Return lowercase candidate name strings for an .ics CN like 'Last, First'."""
    cn = strip_parens(cn)
    if not cn:
        return []
    candidates = [cn]
    if "," in cn:
        last, first = [s.strip() for s in cn.split(",", 1)]
        if first and last:
            candidates.append(f"{first} {last}")
    return [c.lower() for c in candidates if c]


def name_candidates_from_email(email: str) -> list[str]:
    """Derive 'first last' / 'last first' candidates from a first.last@domain email."""
    if not email or "@" not in email:
        return []
    local = email.split("@", 1)[0].strip().lower()
    local = re.sub(r"\d+$", "", local)
    parts = [p for p in re.split(r"[._\-]+", local) if p]
    if len(parts) < 2:
        return []
    first = parts[0]
    last = parts[-1]
    return [f"{first} {last}", f"{last} {first}"]


def match_attendees(db: Session, attendees: list[dict]) -> tuple[list[Person], list[dict]]:
    """Match parsed attendees to Person rows. Returns (matched, unmatched)."""
    people = db.query(Person).filter(Person.is_archived == False).all()  # noqa: E712

    email_map: dict[str, Person] = {}
    for p in people:
        if p.email:
            email_map.setdefault(p.email.lower().strip(), p)

    name_map: dict[str, Person] = {}
    for p in people:
        for n in {p.name, p.display_name}:
            if not n:
                continue
            base = n.lower().strip()
            name_map.setdefault(base, p)
            stripped = strip_parens(n).lower()
            if stripped and stripped != base:
                name_map.setdefault(stripped, p)

    matched: list[Person] = []
    seen_ids: set = set()
    unmatched: list[dict] = []

    for att in attendees:
        person = None
        email = (att.get("email") or "").lower().strip()
        if email and "@" in email:
            person = email_map.get(email)
        if not person:
            for cand in normalize_cn(att.get("cn") or ""):
                person = name_map.get(cand)
                if person:
                    break
        if not person and email:
            for cand in name_candidates_from_email(email):
                person = name_map.get(cand)
                if person:
                    break
        if person:
            if person.id not in seen_ids:
                matched.append(person)
                seen_ids.add(person.id)
        else:
            unmatched.append({"cn": att.get("cn") or "", "email": att.get("email") or ""})

    return matched, unmatched


def match_emails(db: Session, email_addresses: list[dict]) -> tuple[list[Person], list[dict]]:
    """Match email addresses to Person rows. Takes list of {name, email} dicts.

    This is a convenience wrapper around match_attendees that maps
    email address dicts to the attendee format expected by match_attendees.
    """
    attendees = [{"cn": e.get("name", ""), "email": e.get("email", "")} for e in email_addresses]
    return match_attendees(db, attendees)
