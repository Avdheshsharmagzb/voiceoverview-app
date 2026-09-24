# Samvad Editorial Moderation Desk — PRD

## Original Problem Statement
The 'Approve for Rewrite' button was missing from the Admin Dashboard. For every news item with status 'Pending_Review', a clear, visible 'Approve for Rewrite' button must render. Clicking it triggers an AI rewrite converting content into flawless journalistic Hindi and updates status to 'Rewritten_Pending_Publish'.

## User Choices
- Build full flow from scratch
- AI model: Gemini 3 Flash (`gemini-3-flash-preview`) via Emergent LLM key
- Seeded sample items + manual "Add News Item" form
- No auth for v1

## Architecture
- Backend: FastAPI (`/app/backend/server.py`), MongoDB `news_items` collection
- Frontend: React (`/app/frontend/src/components/NewsDashboard.jsx`), sonner toasts, framer-motion
- AI: emergentintegrations LlmChat → gemini-3-flash-preview, Hindi journalistic system prompt

## Status Lifecycle
Pending_Review → (Approve for Rewrite / AI) → Rewritten_Pending_Publish → (Publish) → Published

## API
- GET /api/news?status= — list items
- POST /api/news — create (Pending_Review)
- POST /api/news/{id}/approve-rewrite — AI Hindi rewrite, → Rewritten_Pending_Publish
- POST /api/news/{id}/publish — → Published
- DELETE /api/news/{id}

## Implemented (2026-09-24)
- Full editorial dashboard: stat chips, status filter tabs, news cards
- Approve for Rewrite button on every Pending_Review card (with loading state)
- AI Hindi rewrite (Gemini) + Hindi content pane, Publish flow, Add News modal, delete
- 5 seeded sample items. Tested: backend 9/9, frontend 100%.

## Backlog / Next
- P1: Auto-link/scrape real news websites as an ingestion source
- P1: Side-by-side compare drawer (original vs Hindi), edit before publish
- P2: Auth for admins, LLM call timeout (504), migrate to FastAPI lifespan
