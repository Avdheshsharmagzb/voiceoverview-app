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
- 2026-10-02 (Phase 3c): Image Hosting (object storage), Backfill, Smart Dedupe
- 2026-10-02 (Phase 4): Manual Composer (paste + hosted photo + review/rewrite/publish-direct)
- 2026-10-08 (Phase 5): AI Video generation (RunPod-orchestrated, MOCKED until pod endpoint wired)
  - "Generate Video" per story → background job: auto GPU start/stop (stubbed), watermarked still (Pillow)
    + short silent MP4 (ffmpeg via imageio-ffmpeg) standing in for text-to-video + voice cloning
  - Admin uploads their own watermark LOGO (Scheduler modal); logo overlaid on photo/video
  - Approval gate: video+watermarked photo show on admin card; on APPROVE they attach to the story
    (video_url/video_image_url) and the public feed plays the video on Published items
  - Endpoints: POST /api/watermark/logo, GET /api/watermark, POST /api/news/{id}/generate-video,
    GET /api/news/{id}/video, POST /api/video/{id}/approve|reject
  - RunPod seam: runpod_power(start/stop) uses RUNPOD_API_KEY/RUNPOD_POD_ID/RUNPOD_INFERENCE_URL env
    (placeholders → MOCK). Render concurrency capped (semaphore 2), ffmpeg timeout 60s.
  - Tested: backend 47/47, frontend 100%
- 2026-10-08 (Phase 5b): Hindi Voice Narration in videos
  - OpenAI TTS (tts-1, voice "onyx") via Emergent key generates Hindi narration from the story
    (headline + body, capped ~700 chars ≈ ~55s clip), merged into the MP4 audio track via ffmpeg
  - voice_model recorded on the job ("openai-tts-1/onyx"); silent fallback if TTS fails
  - NOTE: OpenAI voices speak Hindi intelligibly but with a mild English accent (provider ceiling);
    native cloned voice will arrive via RunPod. Render+TTS ≈ 25-40s per clip.

## RunPod wiring (when ready)
- Set RUNPOD_API_KEY, RUNPOD_POD_ID (real values) in backend/.env to enable auto start/stop.
- Set RUNPOD_INFERENCE_URL and replace the body of _render_mock_video / run_video_job's render step
  with a call to the pod's text-to-video + voice-cloning endpoint; keep watermark + object-storage upload.

## Notes / Known limitations
- Video + voice cloning are MOCKED (silent still-render) until the RunPod inference endpoint is provided.
- Quick Add modal image is base64 inline; Composer + watermark + fetched images use object storage.
- Object storage has no delete API; orphaned images/videos (reject/regenerate/delete) are not purged.
- Admin registration is open (any visitor can create an admin account).

## Backlog
- P1: Server-side pagination for /api/news; object storage for images; full-article extraction
- P2: Brute-force lockout + rate limiting on auth; LLM call timeout → 504; migrate to FastAPI lifespan
- P2: Role separation (editor vs admin), scheduled-fetch category tuning UI
