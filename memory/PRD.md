# Samvad Editorial Moderation Desk — PRD

## Original Problem Statement
Add a visible 'Approve for Rewrite' button to the Admin Dashboard for every Pending_Review
news item; clicking triggers an AI rewrite into flawless journalistic Hindi and sets status to
Rewritten_Pending_Publish.

## User Choices
- Build full flow from scratch; AI = Gemini 3 Flash (`gemini-3-flash-preview`) via Emergent LLM key
- News ingestion: RSS via keyless Google News Hindi search + manual add (with photo)
- Auto-fetch on schedule (hourly cron) + manual "Fetch Now"
- Auth: JWT email+password; admin self-registers or uses seeded admin
- Protected: approve/publish/add/delete/fetch. Public feed open to everyone.

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB (news_items, users, cron_runs)
- Frontend: React — `/` PublicFeed (open), `/login`, `/admin` (JWT-protected)
- AI: emergentintegrations LlmChat → gemini-3-flash-preview, returns {headline, body}
- Auth: JWT Bearer token in localStorage (`samvad_token`); bcrypt password hashing
- Cron: `.emergent/crons.yml` hourly → POST /api/cron/fetch-news (Bearer WEBHOOK_CRON_SECRET)

## Status Lifecycle
Pending_Review → (Approve for Rewrite / AI) → Rewritten_Pending_Publish → (Publish) → Published

## API
- Auth: POST /api/auth/register, /api/auth/login, GET /api/auth/me
- Public: GET /api/public/news, GET /api/categories
- Admin (Bearer): GET/POST /api/news, PATCH/DELETE /api/news/{id},
  POST /api/news/{id}/approve-rewrite {instructions?}, POST /api/news/{id}/publish, POST /api/news/fetch
- Cron: POST /api/cron/fetch-news

## Implemented
- 2026-09-24: Approve for Rewrite + AI Hindi rewrite, dashboard, seed items
- 2026-10-02 (Phase 2): News source linking (Google News Hindi RSS, 19 categories), Fetch Now + hourly cron,
  Compare & Edit (editable Hindi + re-rewrite with suggestions), Public feed at /, JWT admin login
- 2026-10-02 (Phase 3a): Full-article extraction at rewrite time (gnewsdecoder + trafilatura)
- 2026-10-02 (Phase 3b):
  - Image Library: auto-attach publisher og:image to each story (image_url)
  - Prefetch On Import: background enrichment fetches full text + image for freshly imported drafts
  - Fetch Scheduler UI: admin-configurable categories/query/count/enabled, persisted in db.settings (/api/fetch-config)
  - Source Link Display: "मूल स्रोत देखें" link (resolved publisher URL) on each admin card
  - Tested: backend 24/24, frontend 100%

## Notes / Known limitations
- Manual photo upload stored as base64 data URL in Mongo (MVP). Fetched images use the publisher's hotlinked URL.
- Existing pre-Phase-3 Published rows show a fallback image (no image_url); self-heals for new items.
- Source link falls back to the Google News redirect URL until resolved_url is populated (still opens publisher in-browser).
- Admin registration is open (any visitor can create an admin account).

## Backlog
- P1: Server-side pagination for /api/news; object storage for images; full-article extraction
- P2: Brute-force lockout + rate limiting on auth; LLM call timeout → 504; migrate to FastAPI lifespan
- P2: Role separation (editor vs admin), scheduled-fetch category tuning UI
