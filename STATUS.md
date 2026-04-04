# Ledger — Status

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
