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
- 2026-10-02 (Phase 3b): Image Library (og:image), Prefetch On Import (background enrichment),
  Fetch Scheduler UI (/api/fetch-config), Source Link Display
- 2026-10-02 (Phase 3c):
  - Image Hosting: publisher photos downloaded + stored in Emergent object storage; served via public
    GET /api/images/{path} (prefix-restricted); image_url = /api/images/samvad/news/{uuid}.ext
  - Backfill: POST /api/news/backfill enriches all existing items missing text/image (bg, single-flight guard)
  - Smart Dedupe: POST /api/news/dedupe removes near-duplicate non-published items (title Jaccard >=0.6)
  - Backfill + Dedupe buttons in the Fetch Scheduler modal; frontend imgSrc() resolves hosted paths
  - Tested: backend 31/31, frontend 100%

## Notes / Known limitations
- Manual Add-News photo uploads still stored as base64 data URLs inline (fetched images are hosted in object storage).
- Object storage has no delete API (soft-delete pattern); orphaned images from dedupe/delete are not purged.
- Admin registration is open (any visitor can create an admin account).

## Backlog
- P1: Server-side pagination for /api/news; object storage for images; full-article extraction
- P2: Brute-force lockout + rate limiting on auth; LLM call timeout → 504; migrate to FastAPI lifespan
- P2: Role separation (editor vs admin), scheduled-fetch category tuning UI
