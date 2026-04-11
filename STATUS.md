# Ledger — Status

## Phase 3: Notes Tab — Deployed (2026-04-11)

### Goal
General-purpose capture layer for IMs, emails, and phone calls — things that need to be written down, tagged with people/projects, and searched later. Includes .eml drag-and-drop import for saving emails as notes.

### Data Model
- [x] `Note` model: title, body, source_type (manual|email), email_* fields, linked_people, linked_projects
- [x] `NotePerson` / `NoteProject` junction tables (same pattern as MeetingAttendee)
- [x] `NoteSourceType` enum (manual, email)
- [x] Inline migration in main.py (idempotent table creation)

### Backend
- [x] `routers/notes.py` — full CRUD: list (with filters), create, get, update, delete
- [x] Person/project link/unlink endpoints (POST/DELETE)
- [x] `.eml` import endpoint: parses email headers + body, dedup by Message-ID, auto-tags people by email address
- [x] `services/people_matcher.py` — shared service extracted from meetings.py (email, CN, name-from-email matching)
- [x] `meetings.py` updated to import from people_matcher (no behavior change)
- [x] `search.py` updated with notes section (searches title + body)

### Frontend
- [x] `EmlDropZone.jsx` — drag-and-drop .eml import (modeled on IcsDropZone)
- [x] `NotesList.jsx` — list page with source filter (All/Notes/Emails), client-side search, .eml drop zone
- [x] `NoteDetail.jsx` — create/edit with auto-save (500ms debounce), PersonTypeahead + ProjectTypeahead tagging, email metadata display
- [x] `Sidebar.jsx` — Notes nav link (StickyNote icon) after Meetings
- [x] `App.jsx` — routes: /notes, /notes/new, /notes/:id
- [x] `QuickSearch.jsx` — notes section in search results (StickyNote/Mail icons)
- [x] `PersonProfile.jsx` — "Recent Notes" section (fetches by person_id)
- [x] `ProjectCard.jsx` — "Recent Notes" section (fetches by project_id)
- [x] `client.js` — 11 notes API methods (listNotes, createNote, getNote, updateNote, deleteNote, link/unlink person/project, importEml)

---

## Phase 2d: Outlook .ics Meeting Import (2026-04-06)

### Goal
Eliminate the OneNote round-trip — let Bryan drag an Outlook meeting (`.ics`) onto Ledger and have title, body, and attendees populate in one drop.

### Backend
- [x] Added `icalendar==6.1.0` to requirements
- [x] `POST /api/meetings/{meeting_id}/import-ics` — multipart endpoint accepting `file` + optional `current_notes`
- [x] `_parse_ics()` — extracts SUMMARY, DESCRIPTION (Teams boilerplate stripped), ATTENDEE list, ORGANIZER
- [x] `_match_attendees()` — email-first, name-fallback (CN reversal `"Last, First"` → `"First Last"`); single in-memory query for performance
- [x] `_merge_notes()` — idempotent merge with stable 32-underscore divider; supports re-import without duplicating manual notes
- [x] Title full-override; attendee union (never removes); response includes matched_count + unmatched list

### Frontend
- [x] `IcsDropZone.jsx` — reusable drop zone (compact + card variants), click-to-browse fallback, in-zone spinner only (never blocks notes)
- [x] `api.importIcsToMeeting(meetingId, file, currentNotes)` — FormData POST mirroring org-import pattern
- [x] MeetingDetail: drop zone in metadata section (active meetings only), wires `currentNotes` from textarea so in-flight typing is preserved server-side
- [x] MeetingDetail: amber warning panel for unmatched attendees with dismiss; pauses notes auto-save during import
- [x] MeetingsList: drop zone card above the list; on parse, creates the meeting (reusing 409 force-end UX), navigates to detail with unmatched warning seeded via React Router state
- [x] MeetingDetail seeds unmatched warning from `location.state` after navigation



### Rate Limiting
- [x] In-memory rate limiter: 5 failed attempts → 15-minute IP lockout
- [x] X-Forwarded-For support (Cloudflare/Caddy) with fallback to client.host
- [x] 429 response with retry_after seconds
- [x] Frontend: lockout message with countdown on Login page

### Password Hashing
- [x] bcrypt password hashing (passlib)
- [x] Auto-detect if LEDGER_PASSWORD env var is already a bcrypt hash ($2b$ prefix)
- [x] Transparent upgrade — login behavior unchanged

### TOTP Two-Factor Authentication
- [x] TOTP secret encrypted with Fernet (derived from APP_SECRET_KEY) stored in Settings table
- [x] Login flow: password → if TOTP enabled → pending_token (5-min JWT) → TOTP verification → full session
- [x] POST /api/auth/verify-totp — verify TOTP code or backup code, issue session
- [x] GET /api/auth/totp/status — check 2FA status + remaining backup codes
- [x] POST /api/auth/totp/setup — generate secret + QR code (base64 PNG)
- [x] POST /api/auth/totp/setup/confirm — verify code, enable 2FA, return 8 backup codes
- [x] POST /api/auth/totp/disable — requires current TOTP code
- [x] POST /api/auth/totp/reset — emergency reset via TOTP_RESET_TOKEN env var
- [x] Backup codes: 8 random hex codes, stored as bcrypt hashes, single-use
- [x] Auto-submit on 6-digit code entry

### Frontend
- [x] Login: two-step flow (password → TOTP) with slide transition and ShieldCheck icon
- [x] Login: handles 429 rate limit with error message
- [x] Settings: new "Security" section with 2FA status, setup wizard, disable flow
- [x] Settings: QR code display + manual secret + confirmation input
- [x] Settings: backup codes display with copy + "I've saved these" flow
- [x] API client: verifyTotp, getTotpStatus, setupTotp, confirmTotp, disableTotp methods

### Middleware
- [x] Pending 2FA tokens (pending_2fa claim) rejected from general API routes
- [x] /api/auth/* paths remain exempt from auth middleware

### Dependencies Added
- bcrypt 4.2.1, passlib[bcrypt] 1.7.4, pyotp 2.9.0, qrcode[pil] 8.0, cryptography 44.0.0

---

## Phase 2b: Org Import & Scale — Deployed (2026-04-04)

### XLSX Org Chart Import
- [x] `external_id` + `import_source` fields on Person model
- [x] Org import endpoints: preview (shows creates/updates/archives) and commit
- [x] Column mapping: Unique Identifier→external_id, Name→name, Reports To→manager, Line Detail 1→role, Line Detail 2→location, Organization Name→reporting_level inference
- [x] Sync logic: match by external_id, create new, update org fields, archive departed
- [x] Never overwrites: display_name (if customized), profile data, avatars, context notes
- [x] Two-pass: create/update first, then resolve manager references
- [x] Reporting level auto-inference from tree structure (has reports→manager, no manager→executive, else ic)
- [x] Import UI on Import/Export page with preview and diff display

### Org Chart Focus Mode
- [x] Route: /org-chart?focus=personId (defaults to owner)
- [x] Auto-expand focused person's chain + direct reports + siblings
- [x] Search box to find and focus on any person
- [x] Breadcrumb trail showing focused person's management chain
- [x] Focus ring highlight on the focused person's node
- [x] Child count badge on collapsed nodes

### Person Profile "See Org"
- [x] "See Org" button navigates to /org-chart?focus={personId}

### People Directory — Scale for 5000
- [x] Pagination (50 per page with prev/next + count display)
- [x] "My Org" / "All" toggle (defaults to My Org)
- [x] Server-side search
- [x] Batch open_item_count query (single GROUP BY instead of N+1)

### PersonTypeahead Component
- [x] Reusable search-based person selector (replaces all dropdowns)
- [x] Debounced search via /api/people/search endpoint
- [x] Used in: PersonProfile (manager), ProjectCard (team assignment)

### Digest Optimization
- [x] Stale contacts limited to "My Org" tree (not all 5000)

### API Changes
- [x] GET /api/people now returns {people: [], total: N} with pagination params
- [x] GET /api/people/search — lightweight typeahead endpoint
- [x] GET /api/org/tree?focus=id — org tree with expansion hints
- [x] GET /api/org/my-org — owner's org tree person IDs
- [x] POST /api/import-export/org-preview — org XLSX preview
- [x] POST /api/import-export/org-commit — org XLSX commit

---

## Phase 2: COMPLETE — Deployed (2026-04-04)

### AI & Classification
- [x] Improved classification prompt: tasks no longer misclassified as profile_update
- [x] AI now receives today's date for accurate due date calculation
- [x] Urgency system removed — dates only (Overdue / Due Today / Upcoming / No Date)
- [x] AI urgency=today auto-converted to due_date=today

### Owner / Self Identity
- [x] Settings: "I am..." dropdown to select yourself from people list
- [x] Owner excluded from stale contacts in digest

### Reporting Levels Simplified
- [x] 3 values: Executive, Manager, Individual Contributor
- [x] Migration: director→executive, employee/peer/other→ic

### @Mention Improvements
- [x] Leading @mentions stripped entirely (just tags): `@John @Jim Check in` → `Check in`
- [x] Non-leading @mentions keep name: `Check with @John` → `Check with John`

### UI Polish
- [x] Light mode org chart collapse arrows (glass class)
- [x] Settings model selector highlight fix (merged state update)
- [x] Full name hover tooltip on person names everywhere
- [x] Full name shown below display name on PersonProfile header
- [x] Person name included in linked_people API response

### Performance
- [x] WebSocket item_updated merges into local state (no global re-render/re-fetch)
- [x] Feed, PersonProfile, ProjectCard, MeetingMode all use local item merge

### Hashtag Autocomplete
- [x] Removed urgency hashtags (#today/#week/#month/#someday)
- [x] People/projects shown first when # typed with empty query
- [x] Result limit increased from 10 to 15

### Timeline
- [x] Expand/collapse for long event text (line-clamp-2 + toggle)

### Drag and Drop Task Ordering
- [x] sort_order column on CaptureItem
- [x] POST /api/captures/reorder endpoint
- [x] Query ordering: pinned → sort_order → created_at
- [x] DraggableItemList shared component (HTML5 drag events)
- [x] Used in Feed, PersonProfile, ProjectCard, MeetingMode
- [x] Visual drag indicator (blue border on drag-over)
- [x] Optimistic UI: reorder locally, sync to API

---

## Phase 1: COMPLETE — In Pilot (2026-03-29)

### Core
- [x] FastAPI + PostgreSQL + React + Vite + Tailwind
- [x] Authentication (JWT cookies, login page)
- [x] Dark/light theme with Settings toggle
- [x] Mobile responsive (hamburger menu)

### Capture & Classification
- [x] Capture box with @mention and #hashtag autocomplete
- [x] AI classification via LiteLLM (Gemini Flash)
- [x] Text-scan fallback linking
- [x] Hashtag shortcuts (type, people, projects)

### Items
- [x] Pin/star (pinned sort to top)
- [x] Due dates (AI-extracted + manual)
- [x] Recurring items (daily/weekly/biweekly/monthly)
- [x] Item notes/thread
- [x] Predecessor/dependency links
- [x] Editable text, type
- [x] Auto-resolve with undo

### People
- [x] Structured profiles (spouse, anniversary, children, pets, birthday, hobbies, location, general)
- [x] AI profile parsing with add/remove/replace ops
- [x] Avatars/headshots
- [x] Project assignments (many-to-many)
- [x] Archive/restore/delete flow
- [x] Duplicate display name warnings

### Projects
- [x] Context notes, short codes, status
- [x] Team member assignments
- [x] Auto-archive on complete/cancelled

### Meetings
- [x] Meeting Mode (two-column layout)
- [x] Meeting prep stats (since last meeting)
- [x] Structured summaries (data-driven)
- [x] Auto-end on navigate away
- [x] Profile display in meeting left panel

### Views
- [x] Feed with filters, search, archive toggle
- [x] Daily Digest (date-aware: overdue, today, upcoming, no date)
- [x] Activity Timeline (7/14/30 day view with stats)
- [x] Universal Search (items + notes + people + projects)

### Settings
- [x] Per-model AI provider (classification vs profile parsing)
- [x] LiteLLM + Ollama dual provider support
- [x] Model presets dropdown
- [x] Confidence thresholds
- [x] API key management (masked)
- [x] Owner identity selection

## Deployment
- URL: https://ledger.hitchaser.com
- GitHub: https://github.com/hitchaser/ledger

## Future Phases (Backlog)
- Bulk actions (select multiple items)
- Export (person profile + items as formatted text)
- Quick link from feed (+ button to attach person/project)
- Notification/reminder system
- Email/calendar integration
