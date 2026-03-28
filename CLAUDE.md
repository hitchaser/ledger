# Ledger — Project Architecture & Spec Reference

## Overview
Ledger is a personal productivity web app for a leader managing staff. It runs on a side monitor as a frictionless capture layer and intelligent reference system. Core principle: **capture is instant; organization is automatic via AI**.

## Tech Stack
- **Backend:** Python 3.12 / FastAPI / SQLAlchemy / PostgreSQL
- **Frontend:** React 18 + Vite + Tailwind CSS
- **AI:** Ollama (Qwen3-Coder 30B on 192.168.1.200) via REST API — graceful degradation if offline
- **Auth:** JWT session cookies (PyJWT), single-user, 24h sessions
- **Deploy:** Docker container via Olympus Sandbox API → https://ledger.hitchaser.com

## Database
- **Host:** olympus-project-postgres (port 5432 internal / 5433 host)
- **Database:** `ledger` (credentials: projects/zAcM5RvlOoUwnFGJj5G06ytmsl9mAw)
- Tables auto-created by SQLAlchemy on startup

### Data Models
- **CaptureItem** — atomic unit, everything typed in capture box. Has AI-populated fields (item_type, urgency, confidence) and manual override fields. Effective type/urgency = manual if set, else AI.
- **Person** — staff profile with context_notes (free-form, AI-readable)
- **Project** — project/initiative with short_code, status, context_notes
- **MeetingSession** — logged meeting mode session with person/project
- **ProfileLog** — timestamped history entries (meeting summaries, profile updates)
- **CaptureItemPerson / CaptureItemProject** — junction tables with link_source (ai/manual/hashtag)
- **AIJob** — background job queue for AI classification

### Enums
- ItemType: todo, followup, reminder, discussion, goal, profile_update, note
- Urgency: today, this_week, this_month, someday
- ItemStatus: open, done, dismissed
- ReportingLevel: director, manager, employee, peer, other
- ProjectStatus: active, on_hold, complete, cancelled
- LinkSource: ai, manual, hashtag
- LogType: meeting_summary, profile_update, manual_note

## Authentication
- **Method:** JWT token in httpOnly secure cookie (`ledger_session`)
- **Session duration:** 24 hours (configurable via SESSION_DURATION_HOURS env var)
- **Protected:** All /api/ endpoints except /api/auth/login and /api/health
- **WebSocket:** Also requires valid session cookie
- **Login page:** Obsidian/glass themed, shown automatically when unauthenticated
- **Logout:** Sign Out button in sidebar, clears cookie
- **Frontend 401 handling:** Auto-reloads to trigger login screen on expired sessions
- **Env vars:** LEDGER_USERNAME, LEDGER_PASSWORD, APP_SECRET_KEY, SESSION_DURATION_HOURS

### Auth Endpoints
- **POST /api/auth/login** — authenticate, sets session cookie
- **POST /api/auth/logout** — clears session cookie
- **GET /api/auth/me** — returns current user if authenticated

## API Endpoints
All under /api/ (require authentication):
- **POST/GET /captures** — create/list captures (filters: status, type, urgency, person_id, project_id, search)
- **PATCH /captures/:id** — update status, manual type/urgency, resolution note
- **POST/DELETE /captures/:id/link-person/:pid** — manage person links
- **POST/DELETE /captures/:id/link-project/:pid** — manage project links
- **GET/POST /people** — list/create people
- **GET/PATCH /people/:id** — get/update person
- **GET /people/:id/items** — person's linked captures
- **GET /people/:id/logs** — person's profile logs
- **GET/POST /projects** — list/create projects
- **GET/PATCH /projects/:id** — get/update project
- **GET /projects/:id/items** — project's linked captures
- **GET /projects/:id/logs** — project's profile logs
- **POST /meetings** — start meeting session
- **PATCH /meetings/:id/end** — end meeting, generates AI summary
- **GET /meetings/active** — get active meeting
- **GET /digest** — daily digest (overdue, today, this_week, stale people, orphans)
- **GET /api/health** — health check
- **WS /ws** — WebSocket for live AI classification updates

## AI Pipeline
1. Capture saved → AIJob queued
2. Background worker polls every 2s → calls Ollama /api/chat with known people/projects context
3. Returns JSON: item_type, urgency, linked_people, linked_projects, confidence, resolution_candidates
4. Worker updates CaptureItem, broadcasts via WebSocket
5. Profile updates auto-processed (appended to context_notes, item auto-closed)
6. Resolution: confidence > 0.85 auto-resolves, 0.6-0.85 suggests, < 0.6 ignored

## Frontend Architecture
- React SPA with React Router (browser routing)
- Served as static build from FastAPI
- Views: Feed (default), People Directory, Person Profile, Project Directory, Project Card, Meeting Mode, Daily Digest
- CaptureBox always visible at top
- Collapsible sidebar navigation
- Quick Search (Cmd/Ctrl+K)
- Keyboard shortcuts: / (focus capture), Esc (close modal), Cmd+M (people), Cmd+P (projects)
- Dark mode, dense UI, semantic color badges
- WebSocket for live classification updates

## Hashtag Shortcuts
In capture box: #today #week #month #someday (urgency), #todo #followup #reminder #goal #note (type), #personname (link person), #projectcode (link project). Stripped from display text.

## Meeting Mode
- Two-column: left=context+notes+history, right=open items+inline capture
- End meeting → AI summary generated → modal with copy/save options
- One active session at a time

## File Structure
```
backend/
  main.py          — FastAPI app, WebSocket, AI worker, SPA serving
  database.py      — SQLAlchemy engine + session
  models.py        — All ORM models
  schemas.py       — Pydantic schemas
  routers/         — API route handlers (captures, people, projects, meetings, digest)
  services/        — AI service (Ollama integration)
frontend/
  src/App.jsx      — Main app with routing
  src/components/  — React components
  src/api/client.js — API client
  src/hooks/       — WebSocket hook
```

## Environment Variables
- DATABASE_URL — PostgreSQL connection string
- OLLAMA_BASE_URL — Ollama API (default: http://192.168.1.200:11434)
- OLLAMA_MODEL — Model name (default: qwen3-coder:30b)
- AI_CONFIDENCE_AUTO_RESOLVE — Auto-resolve threshold (default: 0.85)
- AI_CONFIDENCE_SUGGEST — Suggestion threshold (default: 0.60)

## Out of Scope (v1)
Email/calendar integration, mobile design, multi-user, notifications, file attachments, export, voice input, recurring reminders.
