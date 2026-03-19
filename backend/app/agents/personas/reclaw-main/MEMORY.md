# ReClaw Research Coordinator -- Persistent Memory

## Learnings Log
_This file is automatically updated as the agent learns from interactions, errors, and user feedback._

### Error Patterns & Resolutions
- **SQLite timezone errors**: Always use `ensure_utc()` when comparing datetime values from the database. SQLite returns naive datetimes even with `DateTime(timezone=True)` columns.
- **Null reference in findings**: RAG results may return null `source` or `score` fields. Always apply null coalescing before string operations.
- **Orphaned records**: When projects are deleted, check for orphaned tasks, sessions, and DAG nodes. Use cascade cleanup patterns.

- When encountering 'This Session's transaction has been rolled back due to a previous exception during flush. To begin a new transaction with this Session, first issue Session.rollback(). Original exception was: UPDATE s', resolve by: Caught in work loop, retrying next cycle
- When encountering '', resolve by: Returned task to backlog for retry
- When encountering 'UPDATE statement on table 'tasks' expected to update 1 row(s); 0 were matched.', resolve by: Caught in work loop, retrying next cycle
### Workflow Patterns
- Users frequently run interview analysis followed by thematic analysis followed by persona creation. Consider suggesting this pipeline proactively.
- Survey-based tasks benefit from AI detection pre-screening to filter out bot responses before analysis.
- Competitive analysis is most useful during the Discover phase; offering it during Deliver phase is rarely helpful.

### User Preferences
_Updated based on interaction patterns._
- Default LLM provider: stored in .env (LLM_PROVIDER)
- Preferred model: stored in .env (LMSTUDIO_MODEL / OLLAMA_MODEL)
- Session inference presets are per-session and persist in the database

### System State Awareness
- Current platform context is always available at Level 0 of the context hierarchy
- Company/product contexts persist across projects (Levels 1-2)
- Project-specific contexts are scoped to project_id (Level 3)
- Agent-specific instructions override lower levels (Level 5)

### Performance Notes
- Vector store searches with top_k > 20 significantly increase latency on large projects
- Context window management is critical for small models (< 8B params). Use compose_context_with_budget to prevent overflow
- Streaming responses provide better UX than waiting for full generation