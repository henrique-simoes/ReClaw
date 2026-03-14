# Contributing to ReClaw

Thank you for your interest in contributing to ReClaw! 🐾

## Quick Start

```bash
git clone https://github.com/henrique-simoes/ReClaw.git
cd ReClaw

# Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -e ".[dev]"
uvicorn app.main:app --reload

# Frontend (new terminal)
cd frontend
npm install && npm run dev
```

## Project Structure

- `backend/` — Python FastAPI backend
- `frontend/` — Next.js React frontend
- `skills/` — UXR skill definitions (SKILL.md + references + scripts)
- `scripts/` — Utility scripts
- `docs/` — Documentation

## Code Style

- **Python:** Ruff for linting/formatting, type hints everywhere, async/await
- **TypeScript:** ESLint + Prettier, strict mode, no `any` where avoidable
- **Commits:** Conventional commits (`feat:`, `fix:`, `docs:`, `refactor:`)

## Adding a Skill

1. Create `skills/{phase}/{skill-name}/SKILL.md` with YAML frontmatter
2. Add JSON definition in `backend/app/skills/definitions/{skill-name}.json`
3. For complex skills, add Python implementation in `backend/app/skills/{phase}/`
4. Register in `backend/app/skills/registry.py`

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
