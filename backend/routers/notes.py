import re
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from email import policy
from email.parser import BytesParser
from email.utils import parseaddr, getaddresses

from fastapi import APIRouter, Depends, HTTPException, Query, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import func

from database import get_db
from models import Note, NotePerson, NoteProject, NoteSourceType, Person, Project
from schemas import NoteCreate, NoteUpdate
from services.people_matcher import match_emails

router = APIRouter(prefix="/api/notes", tags=["notes"])


def note_to_response(note):
    """Convert a Note to response dict."""
    return {
        "id": note.id,
        "title": note.title,
        "body": note.body,
        "source_type": note.source_type.value if note.source_type else "manual",
        "created_at": note.created_at,
        "updated_at": note.updated_at,
        "email_from": note.email_from,
        "email_to": note.email_to,
        "email_cc": note.email_cc,
        "email_bcc": note.email_bcc,
        "email_date": note.email_date,
        "email_message_id": note.email_message_id,
        "linked_people": [
            {"id": p.id, "display_name": p.display_name, "avatar": p.avatar}
            for p in (note.linked_people or [])
        ],
        "linked_projects": [
            {"id": p.id, "name": p.name, "short_code": p.short_code}
            for p in (note.linked_projects or [])
        ],
    }


@router.get("")
def list_notes(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    person_id: Optional[UUID] = Query(None),
    project_id: Optional[UUID] = Query(None),
    source_type: Optional[str] = Query(None),
    search: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """List notes in reverse chronological order."""
    q = db.query(Note)
    if person_id:
        q = q.filter(Note.linked_people.any(Person.id == person_id))
    if project_id:
        q = q.filter(Note.linked_projects.any(Project.id == project_id))
    if source_type and source_type in ("manual", "email"):
        q = q.filter(Note.source_type == source_type)
    if search:
        ql = f"%{search}%"
        q = q.filter(
            (Note.title.ilike(ql)) | (Note.body.ilike(ql))
        )
    total = q.count()
    notes = q.order_by(Note.created_at.desc()).offset(offset).limit(limit).all()
    return {
        "notes": [note_to_response(n) for n in notes],
        "total": total,
    }


@router.post("")
def create_note(body: NoteCreate, db: Session = Depends(get_db)):
    """Create a new manual note."""
    note = Note(
        title=body.title,
        body=body.body,
        source_type=NoteSourceType.manual,
    )
    db.add(note)
    db.flush()

    for pid in body.person_ids:
        person = db.query(Person).filter(Person.id == pid).first()
        if person:
            db.add(NotePerson(note_id=note.id, person_id=pid))
    for pid in body.project_ids:
        project = db.query(Project).filter(Project.id == pid).first()
        if project:
            db.add(NoteProject(note_id=note.id, project_id=pid))

    db.commit()
    db.refresh(note)
    return note_to_response(note)


@router.get("/{note_id}")
def get_note(note_id: UUID, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    return note_to_response(note)


@router.patch("/{note_id}")
def update_note(note_id: UUID, body: NoteUpdate, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    if body.title is not None:
        note.title = body.title
    if body.body is not None:
        note.body = body.body
    db.commit()
    db.refresh(note)
    return note_to_response(note)


@router.delete("/{note_id}")
def delete_note(note_id: UUID, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    db.query(NotePerson).filter_by(note_id=note_id).delete()
    db.query(NoteProject).filter_by(note_id=note_id).delete()
    db.delete(note)
    db.commit()
    return {"ok": True}


@router.post("/{note_id}/link-person/{person_id}")
def link_person(note_id: UUID, person_id: UUID, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    person = db.query(Person).filter(Person.id == person_id).first()
    if not person:
        raise HTTPException(404, "Person not found")
    existing = db.query(NotePerson).filter_by(note_id=note_id, person_id=person_id).first()
    if not existing:
        db.add(NotePerson(note_id=note_id, person_id=person_id))
        db.commit()
    db.refresh(note)
    return note_to_response(note)


@router.delete("/{note_id}/link-person/{person_id}")
def unlink_person(note_id: UUID, person_id: UUID, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    link = db.query(NotePerson).filter_by(note_id=note_id, person_id=person_id).first()
    if link:
        db.delete(link)
        db.commit()
    db.refresh(note)
    return note_to_response(note)


@router.post("/{note_id}/link-project/{project_id}")
def link_project(note_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(404, "Project not found")
    existing = db.query(NoteProject).filter_by(note_id=note_id, project_id=project_id).first()
    if not existing:
        db.add(NoteProject(note_id=note_id, project_id=project_id))
        db.commit()
    db.refresh(note)
    return note_to_response(note)


@router.delete("/{note_id}/link-project/{project_id}")
def unlink_project(note_id: UUID, project_id: UUID, db: Session = Depends(get_db)):
    note = db.query(Note).filter(Note.id == note_id).first()
    if not note:
        raise HTTPException(404, "Note not found")
    link = db.query(NoteProject).filter_by(note_id=note_id, project_id=project_id).first()
    if link:
        db.delete(link)
        db.commit()
    db.refresh(note)
    return note_to_response(note)


def _extract_email_addresses(header_value: str) -> list[dict]:
    """Parse an email header into list of {name, email} dicts."""
    if not header_value:
        return []
    pairs = getaddresses([header_value])
    return [{"name": name, "email": addr} for name, addr in pairs if addr]


def _clean_plain_text(text: str) -> str:
    """Clean up Outlook-generated plain text (used as fallback when no HTML)."""
    # Remove <mailto:...> artifacts: "display<mailto:actual>" → "display"
    text = re.sub(r'<mailto:[^>]+>', '', text)
    # Clean up "  *\n" bullet patterns → just the content
    text = re.sub(r'\n\s+\*\s*\n', '\n', text)
    # Collapse multiple blank lines
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _strip_html(html: str) -> str:
    """Convert Outlook-style HTML email to clean plain text."""
    from html import unescape

    text = html

    # Normalize line endings
    text = text.replace('\r\n', '\n').replace('\r', '\n')

    # Remove <head>...</head> and <style>...</style> blocks entirely
    text = re.sub(r'<head[^>]*>.*?</head>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<style[^>]*>.*?</style>', '', text, flags=re.IGNORECASE | re.DOTALL)

    # Convert <br> to newline
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)

    # Convert block elements to newlines — only opening tags get a newline;
    # closing tags are stripped silently to avoid double-spacing from <p>x</p>
    text = re.sub(r'<(?:p|div|tr|h[1-6])[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</(?:p|div|tr|h[1-6])>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'</?(?:table|thead|tbody)[^>]*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'<td[^>]*>', ' ', text, flags=re.IGNORECASE)
    text = re.sub(r'</td>', '', text, flags=re.IGNORECASE)
    text = re.sub(r'<hr[^>]*/?>', '\n', text, flags=re.IGNORECASE)

    # Convert list items with nesting awareness. Outlook uses nested <ul><li>
    # for everything — top-level items are field labels (no bullet needed),
    # nested items are sub-values (indented with "  " prefix).
    # Process by tracking <ul>/<ol> depth and replacing tags with markers.
    list_depth = 0
    result_chars = []
    i = 0
    text_lower = text.lower()
    while i < len(text):
        # Check for list open/close tags and list items
        if text[i] == '<':
            tag_end = text.find('>', i)
            if tag_end == -1:
                result_chars.append(text[i])
                i += 1
                continue
            tag_content = text[i:tag_end + 1]
            tag_lower = tag_content.lower()
            if re.match(r'<(?:ul|ol)[\s>]', tag_lower):
                list_depth += 1
                i = tag_end + 1
                continue
            elif re.match(r'</(?:ul|ol)>', tag_lower):
                list_depth = max(0, list_depth - 1)
                i = tag_end + 1
                continue
            elif re.match(r'<li[\s>]', tag_lower):
                if list_depth >= 2:
                    result_chars.append('\n  ')  # indented sub-item
                else:
                    result_chars.append('\n')  # top-level item, no bullet
                i = tag_end + 1
                continue
            elif tag_lower == '</li>':
                i = tag_end + 1
                continue
            else:
                result_chars.append(tag_content)
                i = tag_end + 1
                continue
        else:
            result_chars.append(text[i])
            i += 1
    text = ''.join(result_chars)

    # Convert <a href="mailto:x">display</a> → display
    # But if display text == email or contains "mailto:", just show the email
    def _clean_mailto(m):
        href = m.group(1) or ""
        display = m.group(2) or ""
        email_addr = href.replace("mailto:", "").strip()
        display_clean = display.strip()
        # If display is another mailto link or same as email, just return email
        if "mailto:" in display_clean:
            return email_addr
        if display_clean.lower() == email_addr.lower():
            return email_addr
        if display_clean:
            return display_clean
        return email_addr

    text = re.sub(
        r'<a\s[^>]*href=["\']([^"\']*)["\'][^>]*>(.*?)</a>',
        _clean_mailto, text, flags=re.IGNORECASE | re.DOTALL
    )

    # Strip all remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)

    # Decode HTML entities (&nbsp;, &amp;, &#8226;, etc.)
    text = text.replace('\xa0', ' ')  # non-breaking space
    text = unescape(text)

    # Clean up whitespace within lines
    lines = text.split('\n')
    cleaned = []
    for line in lines:
        # Preserve leading "  " indent for sub-items, strip the rest
        is_indented = line.startswith('  ')
        line = re.sub(r'[ \t]+', ' ', line).strip()
        # Strip standalone bullet chars left over from Outlook formatting
        if line in ('·', '•', '\u00b7', '\u2022'):
            line = ''
        # Re-add indent for sub-items
        if is_indented and line:
            line = '  ' + line
        cleaned.append(line)
    text = '\n'.join(cleaned)

    # Merge orphaned list content. Outlook's <li><p>content</p></li> can
    # produce an empty marker line followed by the content on the next line.
    # For indented sub-items: "  \n\ncontent" → "  content"
    text = re.sub(r'^(  ) *\n+(?=\S)', r'\1', text, flags=re.MULTILINE)

    # Strip redundant bullet chars from start of content
    # e.g. "  · Medicaid" → "  Medicaid", or standalone "· text" → "text"
    text = re.sub(r'^(  )[·•\u00b7\u2022 ]+', r'\1', text, flags=re.MULTILINE)

    # Merge continuation lines after items ending with ":"
    # e.g. "LOB/Markets:\nMedicaid" → "LOB/Markets: Medicaid" (when not followed by sub-items)
    # But NOT when next line is indented (it's a sub-item list)
    text = re.sub(r'^([^\n]*:)\n(?!  |\n)(.+)', r'\1 \2', text, flags=re.MULTILINE)

    # Normalize spacing. Outlook's nested <p><span><br></span></p> structures
    # produce a blank line between every single line. Strategy:
    # 1. Collapse all runs of blank lines to a single \n (no blank line)
    # 2. Re-insert paragraph breaks (blank lines) at section boundaries
    text = re.sub(r'\n{2,}', '\n', text)

    # Now re-insert blank lines at natural paragraph boundaries.
    # A "list line" is any line starting with "  " (indented sub-item) or
    # a line that's part of a list block (preceded by or following indented lines).
    def _is_list_line(ln):
        return ln.startswith('  ')

    lines = text.split('\n')
    result = []
    for i, line in enumerate(lines):
        prev = lines[i - 1] if i > 0 else ''
        nxt = lines[i + 1] if i + 1 < len(lines) else ''
        # Insert blank line when transitioning out of a list block
        if _is_list_line(prev) and not _is_list_line(line) and line:
            result.append('')
        # Insert blank line before common email closings
        elif line.rstrip(',') in ('Best', 'Thanks', 'Regards', 'Thank you', 'Sincerely', 'Cheers'):
            if prev:
                result.append('')
        result.append(line)
    text = '\n'.join(result)

    # Collapse any accidentally created triple+ newlines
    text = re.sub(r'\n{3,}', '\n\n', text)

    return text.strip()


@router.post("/import-eml")
async def import_eml(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """Import a .eml file as a note with source_type='email'."""
    content = await file.read()
    if not content:
        raise HTTPException(400, "Empty .eml file")

    parser = BytesParser(policy=policy.default)
    msg = parser.parsebytes(content)

    # Extract headers
    subject = str(msg.get("Subject", "")) or ""
    from_header = str(msg.get("From", "")) or ""
    to_header = str(msg.get("To", "")) or ""
    cc_header = str(msg.get("Cc", "")) or ""
    bcc_header = str(msg.get("Bcc", "")) or ""
    message_id = str(msg.get("Message-ID", "")) or ""
    date_header = msg.get("Date")

    # Parse date
    email_date = None
    if date_header:
        try:
            from email.utils import parsedate_to_datetime
            email_date = parsedate_to_datetime(str(date_header))
        except Exception:
            pass

    # Dedup by Message-ID
    if message_id:
        existing = db.query(Note).filter(Note.email_message_id == message_id).first()
        if existing:
            return {
                "note": note_to_response(existing),
                "matched_count": 0,
                "unmatched": [],
                "deduplicated": True,
            }

    # Extract body — prefer HTML (our _strip_html produces cleaner output
    # than Outlook's auto-generated text/plain which has mangled bullets
    # and raw <mailto:> artifacts)
    body_text = ""
    plain_text = ""
    html_text = ""
    if msg.is_multipart():
        for part in msg.walk():
            ct = part.get_content_type()
            if ct == "text/html" and not html_text:
                payload = part.get_content()
                if isinstance(payload, str):
                    html_text = payload
            elif ct == "text/plain" and not plain_text:
                payload = part.get_content()
                if isinstance(payload, str):
                    plain_text = payload
        if html_text:
            body_text = _strip_html(html_text)
        elif plain_text:
            body_text = _clean_plain_text(plain_text)
    else:
        ct = msg.get_content_type()
        payload = msg.get_content()
        if isinstance(payload, str):
            if ct == "text/html":
                body_text = _strip_html(payload)
            else:
                body_text = _clean_plain_text(payload)

    if not body_text:
        body_text = "(no body content)"

    # Create the note
    note = Note(
        title=subject or None,
        body=body_text,
        source_type=NoteSourceType.email,
        email_from=from_header or None,
        email_to=to_header or None,
        email_cc=cc_header or None,
        email_bcc=bcc_header or None,
        email_date=email_date,
        email_message_id=message_id or None,
    )
    db.add(note)
    db.flush()

    # Auto-tag people from email addresses
    all_addresses = []
    for header in [from_header, to_header, cc_header, bcc_header]:
        all_addresses.extend(_extract_email_addresses(header))

    matched, unmatched = match_emails(db, all_addresses)
    for person in matched:
        db.add(NotePerson(note_id=note.id, person_id=person.id))

    db.commit()
    db.refresh(note)

    return {
        "note": note_to_response(note),
        "matched_count": len(matched),
        "unmatched": unmatched,
    }
