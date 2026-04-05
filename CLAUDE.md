# Ledger — Project Architecture & Spec Reference

## Overview
Ledger is a personal productivity web app for a leader managing staff. It runs on a side monitor as a frictionless capture layer and intelligent reference system. Core principle: **capture is instant; organization is automatic via AI**.

Live at: **https://ledger.hitchaser.com**

## Tech Stack
- **Backend:** Python 3.12 / FastAPI 0.115 / SQLAlchemy 2.0 / PostgreSQL
- **Frontend:** React 18 + Vite + Tailwind CSS
- **AI:** Dual-provider — LiteLLM proxy (Gemini, OpenAI, etc.) + Ollama (local Qwen3-Coder 30B on 192.168.1.200). Per-model provider selection (classification vs profile parsing can use different providers).
- **Auth:** JWT session cookies (PyJWT), single-user, 24h sessions
- **Deploy:** Multi-stage Docker (Node build + Python runtime) via Olympus Sandbox API

## Database
- **Host:** olympus-project-postgres (port 5432 internal / 5433 host)
- **Database:** `ledger` (credentials: projects/zAcM5RvlOoUwnFGJj5G06ytmsl9mAw)
- Tables auto-created by SQLAlchemy on startup; inline migrations for schema additions (ALTER TABLE)

### Data Models

**CaptureItem** — atomic unit, everything typed in capture box.
- AI-populated fields: item_type, urgency, ai_confidence, ai_processed_at
- Manual override fields: manual_type, manual_urgency
- Effective type/urgency = manual if set, else AI
- due_date (DateTime, AI-extracted or manual), is_pinned (bool), recurrence (string: daily/weekly/biweekly/monthly), sort_order (Integer, for drag-and-drop ordering)
- Relations: linked_people, linked_projects, notes (ItemNote[]), predecessors (self-referential via item_links), meeting_session

**Person** — staff/contact profile.
- Core fields: name, display_name, role, reporting_level, email, context_notes
- external_id (String, unique, nullable) — org system unique identifier for import sync
- import_source (String, nullable) — "org_import" or null for manually created
- avatar (Text, base64 data URL for headshot)
- profile (JSON): structured fields — spouse, anniversary, children[], pets[], birthday, hobbies, location, general
- is_archived (bool)
- Relations: capture_items, profile_logs, projects (many-to-many via person_projects)

**Project** — project/initiative.
- Fields: name, short_code, status, context_notes, is_archived
- Relations: capture_items, profile_logs, people (many-to-many via person_projects)

**MeetingSession** — first-class meeting entity with notes.
- Fields: started_at, ended_at, title, notes, person_id (legacy), project_id, items_resolved, items_added, ai_summary
- Relations: attendees (many-to-many via MeetingAttendee), project, capture_items

**MeetingAttendee** — junction table for meeting-to-person many-to-many (meeting_id, person_id).

**ProfileLog** — timestamped history entries (meeting summaries, profile updates, manual notes).

**ItemNote** — threaded notes/comments on a capture item.
- Fields: capture_item_id, content, created_at

**item_links** — junction table for predecessor/dependency relationships between items (item_id, predecessor_id).

**PersonProject** — junction table for people-to-projects many-to-many assignments.

**CaptureItemPerson / CaptureItemProject** — junction tables with link_source (ai/manual/hashtag).

**Setting** — key/value store for app settings (AI providers, models, thresholds).

**AIJob** — background job queue for AI classification (status: pending/processing/done/failed).

### Enums
- ItemType: todo, followup, reminder, discussion, goal, profile_update, note
- Urgency: today, this_week, this_month, someday (DEPRECATED — no longer used in AI or UI, kept in DB)
- ItemStatus: open, done, dismissed
- ReportingLevel: executive, manager, ic (legacy: director, employee, peer, other — kept in DB enum but migrated)
- ProjectStatus: active, on_hold, complete, cancelled
- LinkSource: ai, manual, hashtag
- LogType: meeting_summary, profile_update, manual_note

## Authentication
- **Method:** JWT token in httpOnly secure cookie (`ledger_session`)
- **Session duration:** 24 hours (configurable via SESSION_DURATION_HOURS env var)
- **Protected:** All /api/ endpoints except /api/auth/login, /api/auth/logout, /api/auth/me, /api/health
- **WebSocket:** Also requires valid session cookie (close code 4001 on failure)
- **Login page:** Obsidian/glass themed, shown automatically when unauthenticated
- **Logout:** Sign Out button in sidebar, clears cookie
- **Frontend 401 handling:** Auto-reloads to trigger login screen on expired sessions
- **Env vars:** LEDGER_USERNAME, LEDGER_PASSWORD, APP_SECRET_KEY, SESSION_DURATION_HOURS

## API Endpoints

### Auth (no auth required)
- **POST /api/auth/login** — authenticate, sets session cookie
- **POST /api/auth/logout** — clears session cookie
- **GET /api/auth/me** — returns current user if authenticated

### Captures
- **POST /api/captures** — create capture (parses #hashtag and @mention shortcuts)
- **GET /api/captures** — list captures (filters: status, type, person_id, project_id, search, include_done; pagination: limit, offset; default: open items, sorted by pinned desc → sort_order asc → created_at desc)
- **POST /api/captures/reorder** — set sort_order for items (body: {item_ids: [uuid...]})

### People
- **GET /api/people** — list people (pagination: limit, offset; filters: include_archived, search, my_org; returns {people: [], total: N})
- **GET /api/people/search?q=&limit=10** — lightweight typeahead search (returns [{id, display_name, name, avatar, role}])
- **PATCH /api/captures/:id** — update (raw_text, status, manual_type, manual_urgency, resolution_note, due_date, is_pinned, recurrence)
- **DELETE /api/captures/:id** — delete capture
- **POST/DELETE /api/captures/:id/link-person/:pid** — manage person links
- **POST/DELETE /api/captures/:id/link-project/:pid** — manage project links
- **POST /api/captures/:id/notes** — add note/comment to item thread
- **DELETE /api/captures/:id/notes/:nid** — delete note
- **POST/DELETE /api/captures/:id/predecessors/:pred_id** — manage predecessor/dependency links

### People
- **GET /api/people** — list people (query: include_archived; response includes open_item_count, projects[], avatar)
- **POST /api/people** — create person (with structured profile)
- **GET /api/people/:id** — get person detail
- **PATCH /api/people/:id** — update person (name, display_name, role, reporting_level, email, context_notes, is_archived, profile, avatar)
- **DELETE /api/people/:id** — delete person (must be archived first)
- **POST/DELETE /api/people/:pid/projects/:projid** — manage person-project assignments
- **GET /api/people/:id/items** — person's linked captures (filter by status)
- **GET /api/people/:id/logs** — person's profile logs

### Projects
- **GET /api/projects** — list projects (query: include_archived; response includes open_item_count, people[])
- **POST /api/projects** — create project
- **GET /api/projects/:id** — get project detail
- **PATCH /api/projects/:id** — update project (auto-archives on complete/cancelled, auto-unarchives on active/on_hold)
- **DELETE /api/projects/:id** — delete project (must be archived first)
- **POST/DELETE /api/projects/:projid/people/:pid** — manage project-person assignments
- **GET /api/projects/:id/items** — project's linked captures
- **GET /api/projects/:id/logs** — project's profile logs

### Meetings
- **GET /api/meetings** — list meetings (pagination: limit, offset; filters: active_only, person_id, project_id; returns {meetings: [], total: N})
- **POST /api/meetings** — start meeting session (title, person_id, project_id, attendee_ids; one active at a time, 409 if already active)
- **GET /api/meetings/active** — get active meeting
- **GET /api/meetings/:id** — get meeting by ID (includes attendees[], project)
- **PATCH /api/meetings/:id** — update meeting (title, notes, project_id)
- **POST /api/meetings/:id/attendees/:pid** — add attendee
- **DELETE /api/meetings/:id/attendees/:pid** — remove attendee
- **PATCH /api/meetings/:id/end** — end meeting, generates AI summary with notes context, creates ProfileLog per attendee + project
- **GET /api/meetings/prep/:entity_type/:entity_id** — meeting prep stats (last_meeting date, days_since, new_items, items_resolved, open_items)

### Digest
- **GET /api/digest** �� daily digest with due-date awareness:
  - overdue_items: due_date in past
  - today_items: due_date is today
  - upcoming_items: due_date in next 7 days
  - no_date_items/no_date_count: open items with no due_date
  - stale_people: no linked items in 14+ days (owner excluded)
  - orphaned_items: open, no person or project links

### Search
- **GET /api/search?q=** — universal search across items (raw_text + note content), people (name, display_name, role, email), projects (name, short_code, context_notes), meetings (title, notes). Min 2 chars. Returns categorized results.

### Timeline
- **GET /api/timeline?days=N** — activity timeline for past N days. Events: item_created, item_resolved, meeting, profile_update, meeting_summary. Includes summary stats.

### Settings
- **GET /api/settings** — get all settings (sensitive values masked)
- **PUT /api/settings** — update settings (clears settings cache)

### Other
- **GET /api/health** — health check (no auth)
- **WS /ws** — WebSocket for live AI classification updates (auth-protected)

## AI Pipeline

### Classification Flow
1. Capture saved → AIJob queued (status: pending)
2. Background async worker polls every 2s → picks oldest pending job → sets status to processing
3. Calls AI provider (LiteLLM or Ollama, per classification_provider setting) with known people/projects context + open items for resolution matching
4. Returns JSON: item_type, urgency, linked_people, linked_projects, confidence, resolution_candidates, due_date
5. Worker updates CaptureItem fields, creates person/project links (LinkSource.ai)
6. **Text-scan fallback:** After AI linking, scans raw_text for display_name/project name/short_code matches the AI missed — adds those links too
7. **Text-scan fallback on AI failure:** If AI returns no result, still does text-scan linking and marks job as failed
8. Broadcasts update via WebSocket
9. Stuck jobs (processing > 60s) auto-reset to pending

### Due Date Extraction
- AI prompt asks for ISO date if a deadline is mentioned ("by Friday", "before March 15")
- If AI returns a due_date and item has none, it is set automatically

### Profile Update Processing
- When item_type = profile_update: item auto-closed, profile parse triggered
- Uses separate AI model (profile_provider/profile_model settings — can differ from classification)
- AI returns ops array: each op has field, action (add/remove/replace), value
- Handles corrections (remove wrong + add correct), negation, list fields (children/pets)
- **Keyword fallback:** If AI parse fails, uses text-scan heuristics (daughter/son → children, wife/husband → spouse, etc.) with negation detection
- Updates Person.profile JSON, creates ProfileLog entry

### Resolution
- confidence >= 0.85 → auto-resolves candidate items (sets done, adds resolution_note)
- confidence 0.60-0.85 → suggests resolution via WebSocket
- confidence < 0.60 → ignored

### Meeting Summary
- On meeting end: gathers items created/resolved during session
- Generates structured summary (discussed/completed + added/needs action)
- Saves as ProfileLog (meeting_summary type)

## AI Provider Configuration (Settings Page)
- **classification_provider / classification_model** — provider and model for item classification (default: litellm / gemini/gemini-2.5-flash)
- **profile_provider / profile_model** — provider and model for profile update parsing (default: ollama / qwen3-coder:30b)
- **ollama_base_url** — Ollama endpoint (default: http://192.168.1.200:11434)
- **litellm_base_url** — LiteLLM proxy endpoint (default: http://192.168.1.100:4000)
- **litellm_api_key** — LiteLLM API key (masked in UI)
- **confidence_auto_resolve / confidence_suggest** — thresholds
- **ai_enabled** — master toggle
- **owner_person_id** — the user's own Person ID (excluded from stale contacts)
- Settings cached 30s; cache cleared on save

## Frontend Architecture

### Stack & Routing
- React 18 SPA with React Router (browser routing)
- Served as static build from FastAPI (multi-stage Docker: Vite build → /static)
- Tailwind CSS with dark/light theme support (useTheme hook, persisted to localStorage)

### Pages/Views
| Route | Component | Description |
|-------|-----------|-------------|
| / | Feed | Default view — item feed with filters, digest banner |
| /people | PeopleDirectory | Staff directory with search, archive toggle |
| /people/:id | PersonProfile | Full profile: structured fields, avatar, items, logs, project assignments |
| /projects | ProjectDirectory | Project list with status, archive toggle |
| /projects/:id | ProjectCard | Project detail: items, logs, people assignments |
| /meetings | MeetingsList | Meeting list with search, new meeting button |
| /meetings/:id | MeetingDetail | Notes-first meeting view with attendees, capture |
| /meeting/:type/:id | MeetingMode | Legacy redirect — creates meeting → navigates to /meetings/:id |
| /digest | DailyDigest | Daily digest with overdue/today/upcoming/this_week sections |
| /timeline | Timeline | Activity timeline (configurable days) |
| /settings | SettingsPage | AI provider config, theme toggle |

### Key Components
- **CaptureBox** — always visible at top, @mention and #hashtag autocomplete dropdowns (MentionDropdown), search icon to open QuickSearch
- **Sidebar** — collapsible navigation, mobile responsive hamburger menu, sign out button
- **ItemCard** — rich item display: pin/star, due dates, type/urgency badges, editable text, notes thread, predecessor links, person/project chips
- **QuickSearch** — universal search modal (Cmd/Ctrl+K), searches items, notes, people, projects
- **MentionDropdown** — autocomplete dropdown for @person and #project in capture box (useMentions hook)
- **Avatar / AvatarUpload** — headshot display and upload (base64)
- **Toast** — notification toasts (auto-resolve alerts, etc.)
- **Login** — obsidian/glass themed login page

### Capture Box Features
- @mention autocomplete → links person (leading @mentions stripped entirely, non-leading strip @ keep name)
- #hashtag shortcuts: #todo/#followup/#reminder/#goal/#note/#discussion (type), #personname/#projectcode (links)
- Search icon opens QuickSearch
- Text submitted → parsed for shortcuts → CaptureItem created → AIJob queued

### Keyboard Shortcuts
- `/` — focus capture box (when not in input)
- `Cmd/Ctrl+K` — toggle QuickSearch
- `Cmd/Ctrl+M` — navigate to People
- `Cmd/Ctrl+P` — navigate to Projects
- `Esc` — close QuickSearch

### Item Features
- **Pin/star** — pinned items sort to top of feed
- **Due dates** — AI-extracted or manually set, shown on item card
- **Recurring items** — daily/weekly/biweekly/monthly; completing creates next occurrence with same links
- **Item notes/thread** — add timestamped notes to any item
- **Predecessor/dependency links** — link items as dependencies
- **Editable text** — inline edit of item raw_text
- **Manual type/urgency override** — dropdown to override AI classification
- **Status transitions** — open → done/dismissed

### Digest Banner
- Shows on Feed once per day if overdue or today items exist
- Dismissable per day (localStorage)

### Dark/Light Theme
- Toggle on Settings page
- useTheme hook persists to localStorage
- Tailwind dark: classes throughout

### Mobile Responsive
- Hamburger menu for sidebar on small screens
- Responsive layouts

### WebSocket
- Live AI classification updates
- Auto-resolve notifications
- Reconnects on auth

## Meetings (First-Class Entity)
- **Meetings tab** in sidebar — lists all meetings reverse chronological, with attendee avatars, project badges, active indicators
- **New Meeting button** — zero friction, creates meeting and drops into notes textarea immediately
- **Meeting Detail page** (/meetings/:id) — notes-first design:
  - Header: editable title, End Meeting button, collapsible metadata toggle
  - Metadata: attendees (PersonTypeahead), project link, prep stats — starts collapsed for quick-start, expanded when pre-populated
  - Notes: large textarea, auto-saves with 500ms debounce, bullet-point formatting (- or * continuation on Enter)
  - Capture section: inline item creation linked to attendees + project, open items list
- **Read-only view** for ended meetings: formatted notes, attendees, summary
- **Start Meeting from Person/Project**: creates meeting pre-populated with title + attendee/project, navigates to /meetings/:id
- **Meeting history** shown on PersonProfile and ProjectCard pages
- **Search integration**: meeting titles and notes searchable via universal search
- Multi-attendee support via MeetingAttendee junction table
- End meeting generates summary including notes context, creates ProfileLog per attendee + project
- One active session at a time (409 on conflict)

## Archive/Restore/Delete Flow
- **People:** archive (is_archived=true) → can restore (is_archived=false) → delete (must be archived first, removes junction links and logs)
- **Projects:** auto-archive on status=complete/cancelled, auto-unarchive on status=active/on_hold → delete (must be archived first)
- Directory pages have "show archived" toggle

## People-to-Projects
- Many-to-many via PersonProject junction table
- Assign/unassign from both Person Profile and Project Card
- Person response includes projects[], Project response includes people[]

## Duplicate Display Name Warnings
- Frontend warns when creating/editing a person if display_name matches an existing person

## File Structure
```
backend/
  main.py              — FastAPI app, auth middleware, WebSocket manager, AI worker, SPA serving, inline migrations
  database.py          — SQLAlchemy engine + SessionLocal
  models.py            — All ORM models (CaptureItem, Person, Project, MeetingSession, ProfileLog, ItemNote, Setting, AIJob, junction tables)
  schemas.py           — Pydantic schemas (request/response models)
  requirements.txt     — Python dependencies
  routers/
    auth.py            — JWT login/logout/me
    captures.py        — CRUD captures, notes, predecessors, hashtag/mention parsing
    people.py          — CRUD people, person-project links, items, logs
    projects.py        — CRUD projects, project-person links, items, logs, auto-archive
    meetings.py        — Meeting lifecycle, prep stats, AI summary
    digest.py          — Daily digest with due-date-aware queries
    search.py          — Universal search (items, notes, people, projects)
    timeline.py        — Activity timeline
    settings.py        — Settings CRUD with defaults and cache
  services/
    ai_service.py      — AI abstraction (LiteLLM + Ollama), classify_capture, parse_profile_update, generate_meeting_summary, settings cache

frontend/
  src/
    App.jsx            — Main app: auth check, routing, keyboard shortcuts, digest banner, theme, WebSocket
    main.jsx           — React entry point
    index.css          — Tailwind imports + global styles
    api/
      client.js        — API client (all endpoints, 401 auto-reload)
    components/
      Avatar.jsx       — Avatar display component
      AvatarUpload.jsx — Avatar upload (base64)
      CaptureBox.jsx   — Capture input with @mention/#hashtag autocomplete, search icon
      DailyDigest.jsx  — Digest page (overdue, today, upcoming, no date, stale, orphans)
      DraggableItemList.jsx — Shared drag-and-drop item list (HTML5 drag events, optimistic reorder)
      PersonTypeahead.jsx — Reusable search-based person selector (debounced, replaces all dropdowns)
      Feed.jsx         — Main item feed with filters and digest banner
      ItemCard.jsx     — Item display (pin, due date, notes, predecessors, editable text, badges)
      Login.jsx        — Login page (glass theme)
      MeetingDetail.jsx — Notes-first meeting view (active + read-only ended)
      MeetingMode.jsx  — Legacy redirect: creates meeting → navigates to /meetings/:id
      MeetingsList.jsx — Meeting list page with new meeting button
      MentionDropdown.jsx — Autocomplete dropdown for @mentions and #hashtags
      PeopleDirectory.jsx — People list with search and archive toggle
      PersonProfile.jsx — Person detail (structured profile, avatar, items, logs, projects)
      ProjectCard.jsx  — Project detail (items, logs, people assignments)
      ProjectDirectory.jsx — Project list with archive toggle
      QuickSearch.jsx  — Universal search modal (Cmd+K)
      SettingsPage.jsx — AI settings, theme toggle
      Sidebar.jsx      — Navigation sidebar (collapsible, hamburger on mobile)
      Timeline.jsx     — Activity timeline page
      Toast.jsx        — Notification toasts
    hooks/
      useMentions.js   — @mention and #hashtag autocomplete logic
      useTheme.js      — Dark/light theme persistence
      useWebSocket.js  — WebSocket connection + reconnect

Dockerfile             — Multi-stage: Node 20 frontend build + Python 3.12 runtime
project.json           — Olympus project metadata
```

## Environment Variables
- **DATABASE_URL** — PostgreSQL connection string (auto-injected by Olympus deploy)
- **LEDGER_USERNAME** — Login username (default: hieber)
- **LEDGER_PASSWORD** — Login password
- **APP_SECRET_KEY** — JWT signing secret
- **SESSION_DURATION_HOURS** — Session length in hours (default: 24)

AI settings are stored in the database Settings table (not env vars) and configurable from the Settings page.

## Dependencies (requirements.txt)
fastapi 0.115.6, uvicorn 0.34.0, sqlalchemy 2.0.36, psycopg2-binary 2.9.10, httpx 0.28.1, websockets 14.1, python-multipart 0.0.18, PyJWT 2.10.1, python-dateutil 2.9.0