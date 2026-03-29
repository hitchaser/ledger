# Ledger — Status

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
- [x] Hashtag shortcuts (urgency, type, people, projects)

### Items
- [x] Pin/star (pinned sort to top)
- [x] Due dates (AI-extracted + manual)
- [x] Recurring items (daily/weekly/biweekly/monthly)
- [x] Item notes/thread
- [x] Predecessor/dependency links
- [x] Editable text, type, urgency
- [x] Auto-clear urgency when due date set
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
- [x] Status filter in directory

### Meetings
- [x] Meeting Mode (two-column layout)
- [x] Meeting prep stats (since last meeting)
- [x] Structured summaries (data-driven)
- [x] Auto-end on navigate away
- [x] Profile display in meeting left panel

### Views
- [x] Feed with filters, search, archive toggle
- [x] Daily Digest (due-date-aware: overdue, today, upcoming, this week)
- [x] Activity Timeline (7/14/30 day view with stats)
- [x] Universal Search (items + notes + people + projects)

### Settings
- [x] Per-model AI provider (classification vs profile parsing)
- [x] LiteLLM + Ollama dual provider support
- [x] Model presets dropdown
- [x] Confidence thresholds
- [x] API key management (masked)

## Deployment
- URL: https://ledger.hitchaser.com
- GitHub: https://github.com/hitchaser/ledger

## Future Phases (Backlog)
- Bulk actions (select multiple items)
- Export (person profile + items as formatted text)
- Quick link from feed (+ button to attach person/project)
- Notification/reminder system
- Email/calendar integration
- Drag and drop reordering
