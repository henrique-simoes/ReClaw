# ReClaw Pre-Launch Check

**Date:** 2026-03-14  
**Checker:** DevOps Verification Agent  
**Scope:** Final check before first `docker compose up`

---

## 1. Dependency Check

### Backend (Python — `requirements.txt`)

| Status | Package | Used By |
|--------|---------|---------|
| ✅ | fastapi | main.py, all routes |
| ✅ | uvicorn | Dockerfile CMD |
| ✅ | sqlalchemy[asyncio] | all models, database.py |
| ✅ | aiosqlite | database.py (async SQLite driver) |
| ✅ | alembic | alembic/env.py, migrations |
| ✅ | lancedb | core/rag.py |
| ✅ | pyarrow | core/rag.py (implicit via lancedb) |
| ✅ | httpx | core/ollama.py, agents/user_sim_agent.py |
| ✅ | watchfiles | core/file_watcher.py |
| ✅ | python-multipart | routes/files.py (UploadFile) |
| ✅ | pydantic-settings | config.py |
| ✅ | pypdf | core/file_processor.py (delayed import) |
| ✅ | python-docx | core/file_processor.py (delayed import) |
| ✅ | aiofiles | routes/files.py |
| ✅ | psutil | core/resource_governor.py, core/hardware.py, agents/devops_agent.py (delayed imports) |
| ⚠️ | python-magic | In requirements.txt but **never imported** — unused |
| ⚠️ | pyyaml | In requirements.txt but **never imported** — unused |
| 🚫 | **pandas** | **MISSING** — `core/rag.py` calls `.to_pandas()` (line ~100) but pandas is not in requirements.txt or pyproject.toml |

### Frontend (Node.js — `package.json`)

**NPM packages actually imported in source code:**

| Status | Package | Used By |
|--------|---------|---------|
| ✅ | next | layout.tsx, next.config.ts |
| ✅ | react | All components |
| ✅ | react-dom | Implicit (React rendering) |
| ✅ | clsx | lib/utils.ts |
| ✅ | tailwind-merge | lib/utils.ts |
| ✅ | lucide-react | Many components (icons) |
| ✅ | zustand | stores/*.ts |

**Declared in package.json but never imported (dead dependencies):**

| Package | Notes |
|---------|-------|
| @dnd-kit/core | Unused — no drag-and-drop imports found |
| @dnd-kit/sortable | Unused |
| @dnd-kit/utilities | Unused |
| @radix-ui/react-dialog | Unused — custom components used instead |
| @radix-ui/react-dropdown-menu | Unused |
| @radix-ui/react-progress | Unused |
| @radix-ui/react-select | Unused |
| @radix-ui/react-separator | Unused |
| @radix-ui/react-slot | Unused |
| @radix-ui/react-tabs | Unused |
| @radix-ui/react-tooltip | Unused — custom Tooltip component exists |
| class-variance-authority | Unused |
| tailwindcss-animate | Unused |

**All `@/` path imports resolve correctly** — tsconfig.json `paths` maps `@/*` to `./src/*`, and every referenced file exists.

---

## 2. Docker Verification

### docker-compose.yml

| Check | Status | Notes |
|-------|--------|-------|
| Services defined | ✅ | ollama, backend, frontend — 3 services |
| Port mappings | ✅ | 11434:11434, 8000:8000, 3000:3000 |
| Health checks | ✅ | ollama (curl /api/tags), backend (curl /api/health) |
| Depends_on conditions | ✅ | backend waits for ollama healthy, frontend waits for backend healthy |
| Volumes | ✅ | Named volumes for ollama_data, backend_data |
| Bind mount | ✅ | WATCH_DIR defaults to ./data/watch (Docker creates if missing) |
| Restart policy | ✅ | All services `unless-stopped` |
| Frontend health check | ⚠️ | **Missing** — frontend has no healthcheck defined |

### backend/Dockerfile

| Check | Status | Notes |
|-------|--------|-------|
| Base image | ✅ | python:3.12-slim |
| System deps | ✅ | curl (for healthcheck), git, libmagic1 (for python-magic) |
| WORKDIR | ✅ | /app |
| Requirements install | ✅ | COPY requirements.txt first for layer caching |
| App copy | ✅ | COPY . . |
| Directory creation | ✅ | mkdir -p data/uploads data/projects data/lance_db |
| CMD | ✅ | uvicorn app.main:app --host 0.0.0.0 --port 8000 |

### frontend/Dockerfile

| Check | Status | Notes |
|-------|--------|-------|
| Base image | ✅ | node:20-slim |
| WORKDIR | ✅ | /app |
| Package copy | ✅ | COPY package.json package-lock.json* ./ |
| Install | 🚫 | **`npm ci` WILL FAIL** — no package-lock.json exists in the repo |
| Build | ✅ | npm run build (next build) |
| CMD | ✅ | npm start (next start) |
| Output mode | ✅ | next.config.ts uses `output: "standalone"` |

### .env.example Coverage

All settings in `config.py` have corresponding entries in `.env.example`: ✅

| config.py field | .env.example | docker-compose.yml |
|---|---|---|
| ollama_host | ✅ | ✅ |
| ollama_model | ✅ | ✅ |
| ollama_embed_model | ✅ | ✅ |
| database_url | ✅ | ✅ |
| lance_db_path | ✅ | ✅ |
| upload_dir | ✅ | ✅ |
| projects_dir | ✅ | ✅ |
| resource_reserve_ram_gb | ✅ | ❌ (not in compose, uses default) |
| resource_reserve_cpu_percent | ✅ | ❌ (not in compose, uses default) |
| file_watch_interval_seconds | ✅ | ❌ (not in compose, uses default) |
| rag_chunk_size | ✅ | ✅ |
| rag_chunk_overlap | ✅ | ✅ |
| rag_top_k | ✅ | ✅ |
| rag_score_threshold | ✅ | ✅ |

### Missing .dockerignore Files

No `.dockerignore` in backend/ or frontend/ — Docker builds will include unnecessary files (`.git`, `node_modules`, `__pycache__`, etc.), causing slower builds and larger images.

---

## 3. API Route Completeness

### Backend Routers (from main.py)

All 10 routers + websocket + 2 inline endpoints registered:

| Router | Prefix | Endpoints |
|--------|--------|-----------|
| chat | /api | POST /chat, GET /chat/history/{project_id} |
| projects | /api | GET/POST /projects, GET/PATCH/DELETE /projects/{id}, GET /projects/{id}/versions |
| tasks | /api | GET/POST /tasks, GET/PATCH/DELETE /tasks/{id}, POST /tasks/{id}/move |
| findings | /api | CRUD for /findings/nuggets, /findings/facts, /findings/insights, /findings/recommendations, GET /findings/search/global, GET /findings/summary/{project_id} |
| files | /api | POST /files/upload/{id}, GET /files/{id}, POST /files/{id}/reprocess, GET /files/{id}/stats |
| settings | /api | GET /settings/hardware, /settings/models, /settings/status, POST /settings/model |
| audit | /api | GET/POST /audit/devops/*, GET/POST /audit/ui/* |
| skills | /api | GET/POST/PATCH/DELETE /skills/*, POST /skills/{name}/execute, /skills/{name}/plan, proposals endpoints |
| agents | /api | GET/POST/PATCH /agents/*, GET /resources, GET/POST /audit/ux/*, GET/POST /audit/sim/*, GET/POST /contexts/* |
| metrics | /api | GET /metrics/{project_id} |
| websocket | — | WS /ws |
| inline | /api | GET /health, GET /skills/registry |

### Duplicate Route Check

| Issue | Status |
|-------|--------|
| Route `/api/skills/registry` | ⚠️ **Potential conflict** — defined as inline in main.py AND skills router has `/skills` and `/skills/{name}`. The inline `/api/skills/registry` could conflict with the skills router's `/skills/{name}` where name="registry". **FastAPI resolves this by order — the inline route is registered AFTER the skills router, so `/skills/{name}` would match first with name="registry".** |

### Frontend API Client vs Backend

| Frontend API call | Backend Endpoint | Match |
|---|---|---|
| projects.list → GET /api/projects | ✅ exists | ✅ |
| projects.get → GET /api/projects/{id} | ✅ exists | ✅ |
| projects.create → POST /api/projects | ✅ exists | ✅ |
| projects.update → PATCH /api/projects/{id} | ✅ exists | ✅ |
| projects.delete → DELETE /api/projects/{id} | ✅ exists | ✅ |
| projects.versions → GET /api/projects/{id}/versions | ✅ exists | ✅ |
| tasks.list → GET /api/tasks | ✅ exists | ✅ |
| tasks.create → POST /api/tasks | ✅ exists | ✅ |
| tasks.update → PATCH /api/tasks/{id} | ✅ exists | ✅ |
| tasks.move → POST /api/tasks/{id}/move | ✅ exists | ✅ |
| tasks.delete → DELETE /api/tasks/{id} | ✅ exists | ✅ |
| chat.send → POST /api/chat | ✅ exists | ✅ |
| chat.history → GET /api/chat/history/{id} | ✅ exists | ✅ |
| findings.nuggets → GET /api/findings/nuggets | ✅ exists | ✅ |
| findings.facts → GET /api/findings/facts | ✅ exists | ✅ |
| findings.insights → GET /api/findings/insights | ✅ exists | ✅ |
| findings.recommendations → GET /api/findings/recommendations | ✅ exists | ✅ |
| findings.summary → GET /api/findings/summary/{id} | ✅ exists | ✅ |
| files.upload → POST /api/files/upload/{id} | ✅ exists | ✅ |
| files.list → GET /api/files/{id} | ✅ exists | ✅ |
| files.stats → GET /api/files/{id}/stats | ✅ exists | ✅ |
| settings.hardware → GET /api/settings/hardware | ✅ exists | ✅ |
| settings.models → GET /api/settings/models | ✅ exists | ✅ |
| settings.status → GET /api/settings/status | ✅ exists | ✅ |
| settings.switchModel → POST /api/settings/model | ✅ exists | ✅ |
| MetricsView → GET /api/metrics/{id} | ✅ exists | ✅ |
| ContextPreview → GET /api/contexts/composed/{id} | ✅ exists (in agents router) | ✅ |

**All frontend API calls have matching backend endpoints.** ✅

---

## 4. Database Schema

### Models and Tables

| Model | Table | ForeignKeys | Status |
|-------|-------|-------------|--------|
| Project | projects | — (root entity) | ✅ |
| Task | tasks | project_id → projects.id | ✅ |
| Message | messages | project_id → projects.id | ✅ |
| Nugget | nuggets | project_id → projects.id | ✅ |
| Fact | facts | project_id → projects.id | ✅ |
| Insight | insights | project_id → projects.id | ✅ |
| Recommendation | recommendations | project_id → projects.id | ✅ |
| ContextDocument | context_documents | — (self-referencing via parent_id string, not FK) | ✅ |

### Relationships

All `relationship()` calls have matching `back_populates` on both sides:
- Project ↔ Task, Message, Nugget, Fact, Insight, Recommendation — all with `cascade="all, delete-orphan"` ✅
- ContextDocument — no SQLAlchemy relationships (uses string IDs) ✅

### Alembic Migration vs Models

| Check | Status | Notes |
|-------|--------|-------|
| projects table | ✅ | Columns match model |
| tasks table | ✅ | Columns match model |
| messages table | ✅ | Columns match model |
| nuggets table | ✅ | Columns match model |
| facts table | ✅ | Columns match model |
| insights table | ✅ | Columns match model |
| recommendations table | ✅ | Columns match model |
| context_documents table | ⚠️ | **MISSING from alembic migration** — exists only in context_hierarchy.py model |
| Indexes | ✅ | All created in migration |

### init_db Model Imports

`init_db()` in `database.py` imports:
- `finding, message, project, task` ✅
- `ContextDocument` from `core.context_hierarchy` ✅

All models are imported before `Base.metadata.create_all()`, so tables will be created at startup even without running alembic. ✅

**Note:** The `context_documents` table will be created by `init_db()` at app startup via `create_all()`, so this is NOT a launch blocker. However, the alembic migration is incomplete and running `alembic upgrade head` alone won't create this table.

---

## 5. Import Chain

### Trace from `main.py`

Starting from `backend/app/main.py`, all imports traced recursively:

```
main.py
├── fastapi, fastapi.middleware.cors (✅ in requirements)
├── app.api.routes.{agents,audit,chat,files,findings,metrics,projects,settings,skills,tasks}
│   ├── fastapi, pydantic, sqlalchemy (✅)
│   ├── app.config.settings (✅)
│   ├── app.models.* (✅ — all files exist)
│   ├── app.core.* (✅ — all files exist)
│   ├── app.agents.* (✅ — all files exist)
│   ├── app.skills.* (✅ — all files exist)
│   └── aiofiles (✅ in requirements)
├── app.api.websocket (✅)
├── app.agents.{devops_agent,ui_audit_agent,ux_eval_agent,user_sim_agent,orchestrator} (✅)
│   ├── httpx (✅ in requirements)
│   ├── psutil (✅ — delayed import, in requirements)
│   └── app.core.*, app.models.* (✅)
├── app.config.settings (✅)
│   └── pydantic_settings (✅ in requirements)
├── app.core.agent (✅)
│   ├── app.core.ollama → httpx (✅)
│   ├── app.core.rag → lancedb, pyarrow, **pandas (🚫 MISSING)**
│   ├── app.core.self_check (✅)
│   ├── app.core.file_processor → pypdf, python-docx (✅ — delayed imports)
│   ├── app.core.embeddings (✅)
│   ├── app.core.context_hierarchy (✅)
│   ├── app.core.resource_governor → psutil (✅ — delayed import)
│   └── app.skills.* (✅)
├── app.core.file_watcher (✅)
│   └── watchfiles (✅ in requirements)
├── app.models.database (✅)
│   └── sqlalchemy, aiosqlite (✅)
├── app.skills.registry (✅)
│   └── app.skills.all_skills → app.skills.skill_factory (✅)
└── app.skills.skill_manager (✅)
```

### Circular Dependencies

No circular imports detected. The import graph is a clean DAG:
- `config` → no app imports
- `models.database` → config
- `models.*` → models.database
- `core.*` → config, models, core.ollama
- `agents.*` → core.*, models.*
- `api.*` → agents.*, core.*, models.*
- `skills.*` → core.*, base
- `main.py` → everything

### Missing Imports

| Import | File | Status |
|--------|------|--------|
| pandas | core/rag.py (`.to_pandas()`) | 🚫 **BLOCKER** — will crash on first vector search |

---

## Summary

### 🚫 BLOCKERS (will crash)

1. **Missing `pandas` dependency** — `backend/app/core/rag.py` calls `.to_pandas()` on LanceDB query results, but `pandas` is not in `requirements.txt` or `pyproject.toml`. First vector search will raise `ImportError: pandas is required`.
   - **Fix:** Add `pandas>=2.2.0` to both `requirements.txt` and `pyproject.toml`

2. **Missing `package-lock.json`** — `frontend/Dockerfile` runs `npm ci` which **requires** a lockfile. Build will fail with `npm ERR! The npm ci command can only install with an existing package-lock.json`.
   - **Fix:** Run `cd frontend && npm install` to generate `package-lock.json`, then commit it

### ⚠️ WARNINGS (might cause issues)

3. **No `.dockerignore` files** — Both backend and frontend Docker builds will copy unnecessary files (`.git`, `node_modules`, `__pycache__`), causing slow builds and large images.
   - **Fix:** Create `.dockerignore` in both `backend/` and `frontend/`

4. **`context_documents` table missing from alembic migration** — The ContextDocument model is not included in `001_initial_schema.py`. Won't crash (init_db creates it via `create_all()`), but alembic is incomplete.
   - **Fix:** Add `context_documents` table to migration, or create a 002 migration

5. **`/api/skills/registry` route shadowed** — Inline route in main.py registered AFTER skills router, so GET `/api/skills/registry` will be caught by the skills router as `name="registry"` instead of the inline handler.
   - **Fix:** Move the inline route before `app.include_router(skills.router)`, or rename it

6. **Frontend healthcheck missing in docker-compose.yml** — Frontend container has no healthcheck defined. Docker won't know if it's actually serving.

7. **Unused Python dependencies** — `python-magic` and `pyyaml` are in requirements but never imported (minor bloat).

### ℹ️ INFO (minor)

8. **13 unused npm packages** — @dnd-kit/*, @radix-ui/*, class-variance-authority, tailwindcss-animate are declared in package.json but never imported. Likely planned for future use.

9. **Dead frontend components** — `Celebration.tsx`, `Tooltip.tsx`, and some others exist but are never imported. No impact.

10. **`output: "standalone"` with `npm start`** — The frontend uses Next.js standalone output but runs via `npm start` instead of `node .next/standalone/server.js`. Works fine but is slightly less optimized.

11. **`NEXT_PUBLIC_API_URL` baked at build time** — In Docker, this env var isn't set during `npm run build`, so it defaults to `http://localhost:8000`. This is correct for browser-side calls (user's browser hits port-mapped backend), but means runtime override has no effect on client-side code.

---

## LAUNCH READY: NO

### Must fix before `docker compose up`:

1. **Add `pandas>=2.2.0` to `requirements.txt` and `pyproject.toml`**
2. **Generate `package-lock.json`** by running `cd frontend && npm install` and committing the lockfile
