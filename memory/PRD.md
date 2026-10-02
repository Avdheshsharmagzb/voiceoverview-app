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
- 2026-09-24: Approve for Rewrite + AI Hindi rewrite, dashboard, seed items (backend 9/9, frontend 100%)
- 2026-10-02 (Phase 2):
  - News Source Linking: Google News Hindi RSS across 19 categories (national, Delhi, HC/SC judgments,
    Ghaziabad, Noida, Hapur/Bulandshahr, Baghpat, Meerut, Muzaffarnagar, economy, foreign, sports,
    cinema, TV, dharma, mahapurush, ayurveda, yoga). Fetch Now + hourly cron, dedup by source_url.
  - Compare & Edit: editable Hindi headline+body (PATCH) + re-rewrite with admin suggestions
  - Public News Page at / (reader feed of Published stories, category ticker, lead + grid)
  - Admin Login (JWT, register/login, seeded admin), protected write routes
  - Attractive/punchy journalistic Hindi rewrite style
  - Tested: backend 20/20, frontend 100% core flows

## Notes / Known limitations
- Manual photo upload stored as base64 data URL in Mongo (MVP). Consider object storage for scale.
- RSS summaries are short (Google News); full-article scraping not implemented.
- Admin registration is open (any visitor can create an admin account).

## Backlog
- P1: Server-side pagination for /api/news; object storage for images; full-article extraction
- P2: Brute-force lockout + rate limiting on auth; LLM call timeout → 504; migrate to FastAPI lifespan
- P2: Role separation (editor vs admin), scheduled-fetch category tuning UI
