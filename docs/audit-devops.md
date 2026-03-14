# ReClaw DevOps Audit Report

**Date:** 2026-03-14  
**Auditor:** DevOps Audit Agent  
**Scope:** Full codebase — backend, frontend, infrastructure, skills  

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 2     |
| HIGH     | 4     |
| MEDIUM   | 5     |
| LOW      | 6     |

**Overall Assessment:** The codebase is well-structured with clean patterns, consistent naming, and good separation of concerns. However, there are two critical dependency issues that would cause runtime crashes, and several high-severity items around missing database model registration and missing dependency declarations.

---

## CRITICAL

### C1. Missing `psutil` in requirements.txt — Runtime crash on import

**Files:**
- `backend/requirements.txt` — `psutil` not listed
- `backend/app/core/hardware.py:148` — `import psutil` (hard import, no try/except)
- `backend/app/core/resource_governor.py:61-72` — `import psutil` (has try/except fallback)
- `backend/app/agents/devops_agent.py:179-180` — `import psutil` (has try/except fallback)

**Issue:** `hardware.py` does a bare `import psutil` inside `detect_hardware()` without a try/except. This function is called from `backend/app/api/routes/settings.py:12` (`get_hardware_info()`). If `psutil` is not installed, the `/api/settings/hardware` endpoint will crash with `ModuleNotFoundError`.

While `resource_governor.py` and `devops_agent.py` gracefully handle the missing import, `hardware.py` does not. Since `psutil` is not declared in `requirements.txt`, it will not be installed in the Docker container.

**Impact:** The `/api/settings/hardware` endpoint crashes. The Settings view in the frontend breaks.

**Fix:** Add `psutil>=6.0.0` to `backend/requirements.txt`.

---

### C2. Missing `pyyaml` in requirements.txt — `skill_loader.py` crashes on import

**Files:**
- `backend/requirements.txt` — `pyyaml` not listed
- `backend/app/skills/skill_loader.py:23` — `import yaml`

**Issue:** `skill_loader.py` imports `yaml` (from the `pyyaml` package) but `pyyaml` is not declared in `requirements.txt`. If any code path triggers `skill_loader.discover_skills()` or `get_skill_catalog()`, it will crash with `ModuleNotFoundError`.

Currently `skill_loader.py` is not imported at startup (the registry uses `skill_factory.py` and `all_skills.py` instead), so this is a latent bomb — it will crash the moment someone tries to use the loader path.

**Impact:** Any future use of `skill_loader.discover_skills()` will crash.

**Fix:** Add `pyyaml>=6.0` to `backend/requirements.txt`.

---

## HIGH

### H1. `ContextDocument` model not imported in `init_db()` — table never created

**Files:**
- `backend/app/models/database.py:42-43` — imports `finding, message, project, task` but NOT `context_hierarchy`
- `backend/app/core/context_hierarchy.py:42-63` — defines `ContextDocument(Base)` as a SQLAlchemy model

**Issue:** `init_db()` imports models to register them with `Base.metadata` before calling `create_all()`. The `ContextDocument` model is defined in `context_hierarchy.py` (not in the `models/` directory) and is NOT imported in `init_db()`. This means the `context_documents` table will never be created automatically.

Any API call to `/api/contexts` will fail with a database error ("no such table: context_documents").

**Impact:** The entire Context Hierarchy feature is broken out of the box.

**Fix:** Add `from app.core.context_hierarchy import ContextDocument` to `init_db()` in `database.py`, line 43. Also add it to the Alembic `env.py` model imports.

---

### H2. `settings.ollama_model` mutation is not thread-safe

**File:** `backend/app/api/routes/settings.py:71`

```python
settings.ollama_model = model_name
```

**Issue:** The `switch_model` endpoint directly mutates the global `Settings` singleton. Pydantic Settings objects are not designed for runtime mutation. This change is:
1. Not persisted across restarts (documented, but still surprising)
2. Not thread-safe — concurrent requests could see inconsistent state
3. Potentially breaks Pydantic's frozen model contract if `model_config` is ever set to `frozen=True`

**Impact:** Race conditions on model switching; confusing behavior for users.

**Fix:** Use an explicit mutable runtime state object separate from the Pydantic Settings.

---

### H3. SQL injection vector in `VectorStore.delete_by_source()`

**File:** `backend/app/core/rag.py:92`

```python
table.delete(f"source = '{source}'")
```

**Issue:** The `source` parameter is string-interpolated directly into a SQL-like filter expression for LanceDB. If `source` contains a single quote, this breaks. If LanceDB's delete filter supports any form of expression evaluation, this could be an injection vector.

**Impact:** Data corruption or unexpected deletion if source paths contain quotes.

**Fix:** Use parameterized queries or properly escape the `source` value.

---

### H4. Dockerfile uses `--reload` in production CMD

**File:** `backend/Dockerfile:15`

```dockerfile
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]
```

**Issue:** The `--reload` flag enables uvicorn's file watcher for hot-reload. This is a development convenience that:
1. Adds unnecessary CPU overhead in production
2. Can cause unexpected restarts
3. Is a security concern (file changes trigger code execution)

**Impact:** Performance degradation and unexpected behavior in production.

**Fix:** Remove `--reload` from the Dockerfile CMD. Use `docker-compose.override.yml` for development overrides.

---

## MEDIUM

### M1. Alembic `env.py` missing `ContextDocument` model import

**File:** `backend/alembic/env.py:10`

```python
from app.models import project, task, finding, message  # noqa: F401
```

**Issue:** Same as H1 — `ContextDocument` is not imported in the Alembic env, so migrations won't detect it. The `context_documents` table will be missing from auto-generated migrations.

**Fix:** Add `from app.core.context_hierarchy import ContextDocument  # noqa: F401` to the imports.

---

### M2. `UserSimAgent` hardcodes `API_BASE = "http://localhost:8000"`

**File:** `backend/app/agents/user_sim_agent.py:14`

```python
API_BASE = "http://localhost:8000"
```

**Issue:** When running inside Docker, the backend is accessible at `http://backend:8000` (service name), not `http://localhost:8000`. The user simulation agent will fail to connect to the API when running in the container.

**Impact:** User simulation agent silently fails in Docker deployment.

**Fix:** Use `settings.backend_host` or derive from environment variable.

---

### M3. Chat endpoint commits inside a streaming generator — potential session leak

**File:** `backend/app/api/routes/chat.py:147-161`

```python
async def generate():
    ...
    db.add(assistant_msg)
    await db.commit()
```

**Issue:** The `generate()` SSE generator function uses the `db` session from the outer scope (FastAPI dependency). If the client disconnects mid-stream, the generator may be cancelled, leaving the session in an inconsistent state. The assistant message may not be saved, or the session may not be properly closed.

**Impact:** Potential orphaned database sessions; lost assistant messages on client disconnect.

**Fix:** Use a separate `async_session()` inside the generator, or handle `GeneratorExit` explicitly.

---

### M4. Skill routes ordering conflict — `/skills/health/all` vs `/skills/{name}`

**File:** `backend/app/api/routes/skills.py:66-74`

```python
@router.get("/skills/health/all")   # line ~66
...
@router.get("/skills/{name}")        # line ~52
```

**Issue:** FastAPI matches routes in declaration order. `/skills/{name}` is declared before `/skills/health/all`. A GET request to `/skills/health/all` will be matched by the `{name}` path parameter route with `name="health"`, not by the `/skills/health/all` route.

Similarly, `/skills/proposals/pending` and `/skills/proposals/all` will be caught by `/skills/{name}` with `name="proposals"`.

**Impact:** The `/skills/health/all`, `/skills/proposals/pending`, and `/skills/proposals/all` endpoints are unreachable — they return 404 ("Skill not found: health" or "Skill not found: proposals").

**Fix:** Move the static routes (`/skills/health/all`, `/skills/proposals/*`) before the parameterized `/skills/{name}` route, or use a different URL structure (e.g., `/skills-health/all`).

---

### M5. `docker-compose.yml` missing `WATCH_DIR` default directory creation

**File:** `docker-compose.yml:21`

```yaml
- ${WATCH_DIR:-./data/watch}:/app/watch:ro
```

**Issue:** The default `WATCH_DIR` maps to `./data/watch` on the host, but this directory is never created by the install script or documented. Docker Compose will create it as root-owned if it doesn't exist, which may cause permission issues.

**Impact:** File watcher may not work as expected with default configuration.

**Fix:** Add `mkdir -p data/watch` to `scripts/install.sh` and document in README.

---

## LOW

### L1. `models/__init__.py` is a bare comment — no re-exports

**File:** `backend/app/models/__init__.py`

```python
# Database models
```

**Issue:** The `__init__.py` doesn't re-export any models. This is fine functionally (models are imported directly), but a convenience `__init__.py` with `from .project import Project` etc. would make imports cleaner across the codebase.

**Impact:** Minor DX friction.

---

### L2. No `.env` file in `.gitignore` pattern review

**File:** `backend/.gitignore` — not checked (root `.gitignore` exists)

**Issue:** The root `.gitignore` should ensure `.env` (not just `.env.example`) is ignored. Verified: the `.env.example` contains no secrets, just configuration defaults. No hardcoded credentials found anywhere in the codebase. ✅

**Impact:** None currently — just a reminder to verify `.env` is gitignored.

---

### L3. `import json` inside method bodies in `ollama.py`

**Files:**
- `backend/app/core/ollama.py:43` — `import json` inside `pull_model()`
- `backend/app/core/ollama.py:77` — `import json` inside `chat_stream()`

**Issue:** `json` is imported inside method bodies rather than at the top of the file. This works but is inconsistent with Python conventions and adds minor overhead on each call.

**Fix:** Move `import json` to the top of the file.

---

### L4. Unused imports in `context_hierarchy.py`

**File:** `backend/app/core/context_hierarchy.py`

```python
from sqlalchemy import select, Column, String, Text, Integer, DateTime, Boolean, ForeignKey
```

**Issue:** `Column, String, Text, Integer, DateTime, Boolean, ForeignKey` are imported from `sqlalchemy` but the model uses `Mapped`/`mapped_column` style (SQLAlchemy 2.0). The old-style imports are unused.

**Impact:** No runtime impact, just dead imports.

---

### L5. `skill_loader.py` is orphaned — not used anywhere

**File:** `backend/app/skills/skill_loader.py`

**Issue:** This module defines `discover_skills()` and `get_skill_catalog()` but is never imported by any other module. The actual skill loading is done by `registry.py` → `all_skills.py` + `skill_manager.py`. This file appears to be an alternative loading mechanism that was written but never integrated.

**Impact:** Dead code. Potential confusion for future developers.

**Fix:** Either integrate it or remove it. It has the C2 `pyyaml` dependency issue noted above.

---

### L6. No TODO/FIXME/HACK comments found

**Observation:** The codebase contains zero TODO, FIXME, or HACK comments. This is clean, but also means there's no documented technical debt trail. The issues identified in this audit should serve as that documentation.

---

## Checks Passed ✅

| Check | Result |
|-------|--------|
| Docker Compose syntax | ✅ Valid YAML, proper service definitions, healthchecks |
| API routes match files | ✅ All 9 routes imported in `main.py` have corresponding files |
| Database ForeignKeys | ✅ All ForeignKeys reference `projects.id` which exists |
| Model relationships | ✅ All back_populates are consistent and bidirectional |
| Hardcoded secrets | ✅ None found — all config via environment variables |
| Import resolution | ✅ All imports resolve to existing files (except C1, C2 deps) |
| Circular dependencies | ✅ None detected — clean dependency graph |
| Git status | ✅ Clean working tree, up to date with `origin/main` |
| File structure | ✅ Well-organized: agents/, api/, core/, models/, skills/ |
| Consistent patterns | ✅ Singleton pattern used consistently for services |

---

## Recommendations (Priority Order)

1. **Add `psutil` and `pyyaml` to `requirements.txt`** — fixes C1, C2 (5 min)
2. **Import `ContextDocument` in `init_db()` and `alembic/env.py`** — fixes H1, M1 (5 min)
3. **Reorder skill routes** — fixes M4 (10 min)
4. **Remove `--reload` from Dockerfile** — fixes H4 (1 min)
5. **Escape source in `VectorStore.delete_by_source()`** — fixes H3 (5 min)
6. **Fix `UserSimAgent` API base URL for Docker** — fixes M2 (5 min)
7. **Move inline `import json` to top of `ollama.py`** — fixes L3 (1 min)
8. **Clean up unused imports in `context_hierarchy.py`** — fixes L4 (1 min)
