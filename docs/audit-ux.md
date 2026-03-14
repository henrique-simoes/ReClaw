# ReClaw — UX Evaluation Audit

**Evaluator:** UX Evaluation Agent  
**Date:** 2026-03-14  
**Scope:** Overall platform UX — onboarding, IA, cognitive load, emotional design, competitor comparison, and prioritized improvements  
**Artifacts reviewed:** VISION.md, UI-DESIGN.md, ARCHITECTURE.md, all frontend source components (27 files)

---

## 1. Onboarding Flow

### What happens today

When a brand-new UX researcher opens ReClaw, they land on a **blank chat screen** with the 🐾 emoji and the text _"Select or create a project to start."_ The sidebar shows an empty project list with _"No projects yet. Create one to get started."_ and a `+` button.

### What works
- The empty state messaging is clear enough — users know they need a project.
- Project creation is inline (click `+`, type name, press Enter). Low friction.

### What's missing — critical gaps

| Gap | Impact |
|-----|--------|
| **No welcome wizard / first-run experience** | Users see 8 sidebar nav items, a blank main panel, and a right panel with nothing in it. There's no orientation to the Double Diamond framework, Atomic Research model, context layers, or what ReClaw even does differently. |
| **No sample project / template** | Research tools like Dovetail offer templates. A "Sample Project" with pre-populated interview nuggets, an insight, and one recommendation would teach the Atomic Research chain in 30 seconds. |
| **No progressive disclosure of views** | All 8 nav items (Chat, Findings, Tasks, Interviews, Metrics, Context, History, Settings) are visible from the first second. Most are meaningless until data exists. |
| **No guided "first insight" flow** | The single most important first moment — upload a transcript → get a nugget → see it in Findings — has no guidance. Users have to discover this themselves via chat. |
| **No Ollama/model setup check** | If Ollama isn't running, there's no blocking modal or setup wizard. Users will type in chat and get a confusing error. |
| **No keyboard shortcut cheat sheet** | `⌘K` for search is shown, but there are no shortcuts for switching views, creating tasks, or navigating. |

### Recommendation
Build a **3-step onboarding modal** on first launch:
1. "Welcome to ReClaw" → brief value prop with 15-second video/animation
2. "Create your first project" → inline project creation with optional template
3. "Upload your first file" → drag-and-drop area, explain what happens next

---

## 2. Information Architecture

### Navigation structure (current)

```
Sidebar (8 items):
  Chat | Findings | Tasks | Interviews | Metrics | Context | History | Settings

Projects (below nav):
  Listed with phase indicator
```

### Analysis

**8 items is borderline too many.** Nielsen-Norman research suggests 5-7 top-level nav items for complex tools. The current 8 can be reduced:

| Item | Verdict | Reasoning |
|------|---------|-----------|
| Chat | ✅ Keep | Core interaction point |
| Findings | ✅ Keep | The "crown jewel" per vision doc |
| Tasks | ✅ Keep | Key workflow driver |
| Interviews | ⚠️ Merge | Should be a sub-view of Findings or accessible from Chat |
| Metrics | ⚠️ Merge | Low usage until quant data exists; could be a tab within Findings |
| Context | ✅ Keep | Critical for agent behavior, but could move to project settings |
| History | ⚠️ Demote | Rarely accessed; should be in a project dropdown menu |
| Settings | ⚠️ Demote | Move to header gear icon (standard pattern) |

**Proposed simplified nav (5 items):**
```
Chat | Findings | Tasks | Context | Dashboard*
                                    ↑ replaces Metrics + adds cross-project overview
```

With Interviews as a tab within Findings, History in a project dropdown, and Settings accessible via the header ⚙️ icon.

### Navigation logic

The current IA has a **flat structure** — all 8 views are peers at the same level. But conceptually they're not:
- **Primary workflow:** Chat → Findings → Tasks (the research loop)
- **Configuration:** Context, Settings
- **Reference:** History, Interviews, Metrics

Grouping these visually (with dividers or sections) would reduce cognitive scanning.

### Project ↔ View relationship

Every view requires an active project (except Settings). This is good — it establishes project as the primary organizational unit. However, there's no **cross-project view** for things like:
- Searching across all projects
- Comparing findings between projects
- Team-wide knowledge base (mentioned in VISION.md but absent from UI)

---

## 3. Learning Curve

### Concept density

ReClaw introduces **at least 5 domain-specific concepts** simultaneously:

1. **Double Diamond** (Discover → Define → Develop → Deliver)
2. **Atomic Research** (Nuggets → Facts → Insights → Recommendations)
3. **Context Layers** (Agent Base → Company → Project → Task)
4. **Skills** (Qualitative vs Quantitative methods)
5. **Watched Folders** + auto-ingestion

For an experienced UX researcher, Double Diamond and Atomic Research are familiar. For junior researchers, product managers, or designers who do some research, this is **overwhelming**.

### Learning curve rating by concept

| Concept | Familiarity for target user | In-app explanation | Learning curve |
|---------|---------------------------|-------------------|----------------|
| Double Diamond | High (most UXRs know it) | Phase tabs in Findings — clear | Low ✅ |
| Atomic Research | Medium (known but not universally practiced) | Evidence chain modal — good but needs intro | Medium ⚠️ |
| Context Layers | Low (ReClaw-specific concept) | Explained in Context view + right panel | High 🔴 |
| Skills system | Low (what's a "skill"? how do I invoke one?) | Not explained anywhere in UI | High 🔴 |
| Task ↔ Agent autonomy | Low (agents picking up tasks autonomously is novel) | Right panel tips in Tasks view — insufficient | High 🔴 |

### What helps
- The **right panel** adapts contextually — showing tips and explanations relevant to the current view. This is excellent progressive disclosure.
- The **Context Editor** has inline explanations and placeholder text showing examples. Very well done.
- The **AtomicDrilldown** modal breadcrumb (Recommendations → Insights → Facts → Nuggets → Sources) teaches the chain visually.

### What hurts
- No **glossary** or **tooltip system** for terms like "nugget," "fact," "insight," "guardrails"
- No **interactive tutorial** showing how data flows from upload → nugget → fact → insight
- The Skills system is mentioned in VISION.md but has **zero UI presence** beyond skill_name badges on task cards

---

## 4. Critical User Journeys

### Journey 1: First project creation → first finding

**Steps (current):**
1. See empty state → click `+` in sidebar → type name → Enter
2. Land on empty Chat view → "Ready to research!"
3. Click paperclip → upload a file → file gets indexed
4. Auto-message: "I uploaded X, can you analyze it?" → get agent response
5. Navigate to Findings → see nuggets (if analysis produced any)

**Friction points:**
- Step 2→3: No prompt to upload. User has to discover the paperclip icon.
- Step 4: The auto-message after upload is hard-coded and feels robotic ("I just uploaded... Can you analyze it?"). Users didn't write this.
- Step 5: No notification that findings were created. User has to manually check Findings view.
- No celebration moment when first finding is created.

**Rating: 5/10** — Functional but unguided. The gap between "I created a project" and "I see my first insight" is too large and undirected.

### Journey 2: Upload interview transcripts → get insights

**Steps:**
1. Go to Interviews view → click Upload → select file
2. File appears in horizontal tabs → click to view
3. Content shows placeholder: "Transcript content would be loaded here" + instruction to use chat
4. Switch to Chat → ask agent to analyze
5. Agent processes → creates nuggets
6. Go to Findings → see nuggets, maybe facts/insights

**Friction points:**
- Step 3 is a **dead end**. The Interview view can't actually display or analyze transcripts — it tells you to go to Chat. This breaks the mental model.
- No batch upload (can only upload one file at a time via the file input).
- The transcript viewer's `parseTranscript()` function handles multiple formats, but there's no way to see it actually working with real data from this view alone.
- Nuggets appear in the Interview view's right panel, but they're disconnected from the transcript text (no inline highlighting in practice).

**Rating: 4/10** — The Interview view is the weakest component. It promises a rich transcript experience (audio playback, inline highlighting, synced nuggets) but delivers a file list and a placeholder. This is the most important workflow for UX researchers.

### Journey 3: Set up context layers → see agent use them

**Steps:**
1. Navigate to Context view
2. Expand Company Context → write description → Save
3. Expand Project Context → write description → Save
4. Expand Guardrails → set rules → Save
5. Go to Chat → ask a question → observe agent behavior

**Friction points:**
- No **feedback loop** — after setting context, there's no way to verify the agent is using it. No "here's what I know about your project" preview.
- Context saves are individual per section but there's also a "Save All" button — potentially confusing (which one did I save?).
- The "How context layers work" explanation at the bottom is helpful but only visible after scrolling past the editors.
- No diff view showing what changed since last save.

**Rating: 6/10** — The ContextEditor is well-designed with good placeholders and inline help. But the lack of feedback (does the agent actually use this?) undermines confidence.

### Journey 4: Search across findings → drill into evidence

**Steps:**
1. Press ⌘K → search modal opens
2. Type query → press Enter
3. See results filtered by type (nugget/fact/insight/recommendation)
4. Click a result → ... nothing happens (no navigation to the finding)

**Friction points:**
- Search is **client-side only** — fetches all findings and does `includes()`. No semantic/vector search.
- Results are not clickable to navigate. The search modal shows results but clicking them does nothing.
- No filters (by phase, by type, by confidence, by date).
- No search history or recent searches.

**Rating: 4/10** — Search exists and looks good, but it's effectively a read-only display. Can't act on results.

### Journey 5: Create tasks → agent completes them

**Steps:**
1. Go to Tasks view → click `+` on a column → type title → Enter
2. Task appears in Backlog (or selected column)
3. Agent picks up task (via autonomous work loop)
4. Task shows progress bar → moves to In Review when done
5. User reviews → drags to Done

**Friction points:**
- No way to **assign a skill** to a task from the UI. The `skill_name` field exists but there's no dropdown/selector.
- No way to **add user context** to a task from the Kanban card (the `user_context` field shows in expanded view but is read-only).
- No way to **prioritize** — tasks lack a priority field in the UI, and position within columns doesn't seem persisted.
- The drag-and-drop uses HTML5 native drag (no visual feedback during drag, no placeholder shown).
- Delete is the only action in expanded view — no edit, no add context, no reassign.

**Rating: 5/10** — The Kanban board looks the part but is functionally thin. Creating tasks is easy; everything else (configuring, prioritizing, adding context) is missing.

---

## 5. Cognitive Load

### Screen density analysis

**Chat View:** ✅ Clean. Single-column conversation with subtle source badges. Good balance of information density. The max-width constraint (`max-w-3xl`) keeps messages readable.

**Findings View:** ⚠️ Dense. Four stat cards + four collapsible sections + phase tabs. When insights/nuggets are expanded, there's a lot of text on screen. The accordion pattern helps, but the phase tabs + section headers + item cards create 3 layers of nesting.

**Kanban Board:** ✅ Clean. Four columns, minimal card design. Expanded view adds detail progressively.

**Interview View:** ⚠️ Split panel (transcript + tags/nuggets) is fine, but the tag and nugget sections overlap in purpose. "Quick Actions" at the bottom feel disconnected.

**Metrics View:** ✅ Well-structured. Cards + bar charts + instructions. The amber "populate by running skills" callout is excellent — it sets expectations.

**Context Editor:** ✅ Excellent. Progressive disclosure via expandable sections. Placeholder text teaches by example.

**Right Panel:** ⚠️ Always visible (unless collapsed). On narrow screens, this compresses the main panel significantly. The information shown (recent nuggets, recent insights, stats) duplicates what's in Findings. It's most useful in Chat view (showing context) and least useful elsewhere.

### Cognitive load verdict

The platform asks users to hold **too many mental models simultaneously**:
- Which Diamond phase am I in?
- What's the difference between a nugget and a fact?
- What are my context layers doing?
- Is the agent working on something?
- Where are my files?

**Mitigation:** The contextual right panel is the right idea but underdelivers. It should do more teaching and less duplicating.

---

## 6. Emotional Design

### Visual identity
- **Brand:** 🐾 ReClaw with a custom `reclaw-*` color palette (teal/green family based on CSS classes)
- **Typography:** System font stack (`-apple-system, BlinkMacSystemFont, Segoe UI, Roboto`) — clean, professional, not distinctive
- **Icons:** Lucide icon set — consistent, modern, slightly generic
- **Dark mode:** Fully supported with slate color palette — looks polished

### Emotional qualities

| Quality | Rating | Notes |
|---------|--------|-------|
| Professional | 8/10 | Clean, restrained design. Doesn't look like a toy. |
| Trustworthy | 7/10 | Confidence scores, source citations, version history all build trust. But empty states dominate first impression. |
| Approachable | 6/10 | Emoji use (🐾, 💎, ✨, 🎯) adds warmth but can feel juvenile. The 8-view nav is intimidating. |
| Delightful | 4/10 | No micro-interactions, no celebrations (first finding, project complete), no personality in copy. Status bar is utilitarian. |
| Empowering | 5/10 | The tool aspires to make researchers feel powerful, but the gap between vision (automated analysis, evidence chains) and current functionality undermines this. |

### Personality
The 🐾 brand mark is charming but underutilized. ReClaw has no personality in its copy — messages like "Ready to research!" are functional but don't create an emotional connection. Compare to Dovetail's warm onboarding or NotebookLM's "I'm here to help you understand your sources" framing.

---

## 7. Competitor Comparison

### Dovetail
| Dimension | Dovetail | ReClaw | Verdict |
|-----------|----------|--------|---------|
| Onboarding | Guided wizard, templates, sample data | Empty state only | Dovetail wins |
| Transcript analysis | Rich editor, inline tagging, highlights, sentiment | Placeholder viewer, chat-dependent | Dovetail wins by far |
| Research framework | Tag-based, flexible | Double Diamond + Atomic Research (opinionated) | ReClaw's structure is more rigorous; Dovetail's is more flexible |
| AI capabilities | AI-powered summaries, theme generation | Full agent autonomy, task execution, RAG | ReClaw's vision is stronger |
| Collaboration | Multi-user, comments, shared highlights | Single-user (team features planned) | Dovetail wins |
| Pricing model | SaaS, expensive ($29+/user/mo) | Local-first, free, open source | ReClaw wins for solo researchers |
| Data ownership | Cloud-hosted | Local-first | ReClaw wins |

### EnjoyHQ (now part of UserTesting)
| Dimension | EnjoyHQ | ReClaw | Verdict |
|-----------|---------|--------|---------|
| Research repository | Mature, tagged, searchable | Atomic Research model — more structured | ReClaw's model is theoretically superior |
| Integration | Dozens of integrations | Planned but not built | EnjoyHQ wins today |
| Search | Full-text + filters | Client-side substring match | EnjoyHQ wins |
| Analysis tools | Manual tagging, no AI agent | AI agent, autonomous processing | ReClaw's vision is far ahead |

### Google NotebookLM
| Dimension | NotebookLM | ReClaw | Verdict |
|-----------|------------|--------|---------|
| Aesthetic | Clean, Google Material, research-focused | Similar clean aesthetic | Comparable |
| Source handling | Upload → AI synthesizes across sources | Upload → RAG + Atomic Research chain | ReClaw adds structure |
| Conversation | Natural Q&A over sources | Natural Q&A + task execution + findings | ReClaw is more ambitious |
| Audio features | Podcast generation, audio summaries | Audio playback planned | NotebookLM wins on innovation |
| Local/privacy | Cloud-only (Google servers) | Local-first, model-agnostic | ReClaw wins |
| Specialization | General knowledge synthesis | UXR-specific (methods, frameworks, skills) | ReClaw wins for UXR |

### Overall positioning

ReClaw occupies a **unique niche**: the only local-first, AI-agent-driven UX research tool with Atomic Research as a first-class framework. The closest comparison is Dovetail-meets-NotebookLM-meets-a-local-AI-agent, which is compelling.

**Key differentiator to double down on:** The evidence chain (nugget → fact → insight → recommendation) with source traceability. No competitor does this with AI assistance. This is the moat.

**Biggest risk:** The Interview View. This is where researchers spend 60%+ of their time. If it's weaker than Dovetail's transcript editor, researchers won't switch.

---

## 8. Top 10 UX Improvements (Prioritized by Impact)

### 🥇 1. Build a real Interview/Transcript Experience
**Impact: Critical | Effort: High**

The Interview View is the most important view for the target user and it's currently a placeholder. It needs:
- Actual transcript rendering with speaker diarization
- Inline highlighting with click-to-create-nugget
- Audio/video playback with transcript sync
- AI-suggested highlights that users approve/reject
- Batch file upload with drag-and-drop
- Direct analysis trigger (not "go to chat and ask")

This single improvement would make or break adoption.

### 🥈 2. First-run onboarding wizard
**Impact: Critical | Effort: Medium**

New users are dropped into a blank 8-view interface with no guidance. Build:
- 3-step welcome modal (value prop → create project → upload first file)
- Optional sample project with pre-populated Atomic Research data
- Ollama connection check with setup instructions if missing
- Progressive nav reveal (show Chat first, unlock others as data appears)

### 🥉 3. Simplify navigation to 5 items
**Impact: High | Effort: Low**

Reduce from 8 to 5 nav items:
- **Chat** (keep)
- **Findings** (keep — absorb Interviews as a sub-tab, absorb Metrics as a tab)
- **Tasks** (keep)
- **Context** (keep)
- **Dashboard** (new — cross-project overview, replaces standalone Metrics)

Move Settings to header icon. Move History to project dropdown menu. This immediately reduces cognitive load by 37%.

### 4. Make search actionable
**Impact: High | Effort: Medium**

Current search shows results but clicking does nothing. Fix:
- Click a result → navigate to that finding in Findings View with it highlighted
- Add filters: by type, phase, date range, confidence level
- Add semantic search via vector DB (the backend already has LanceDB)
- Show search results in context (which insight does this nugget support?)
- Add recent searches and suggested queries

### 5. Add inline context feedback
**Impact: High | Effort: Medium**

After setting context layers, users can't tell if the agent is using them. Add:
- "What I know" preview button — shows the composed context the agent sees
- Context usage indicators in chat — subtle badges showing which context layer influenced a response
- Guardrail enforcement visibility — when a guardrail fires, show it ("⚠️ Flagging: sample size is 3, below your threshold of 5")

### 6. Task cards need editing and skill assignment
**Impact: High | Effort: Medium**

The Kanban board creates tasks but can't configure them. Add:
- Inline title and description editing
- Skill selector dropdown (from available skills)
- User context textarea (editable, not read-only)
- Priority selector (high/medium/low) with visual indicators
- Due date / time estimate
- Better drag-and-drop with visual feedback (placeholder, drop zones)

### 7. Add celebration and progress moments
**Impact: Medium | Effort: Low**

The app lacks emotional payoff. Add:
- First finding celebration (confetti? subtle animation + congratulatory message)
- Phase completion markers ("🎉 Discover phase is 80% complete — time to Define?")
- Weekly research summary ("This week: 12 nuggets, 3 insights, 1 recommendation")
- Agent "thinking out loud" in status bar with personality, not just "Working..."

### 8. Build a glossary and tooltip system
**Impact: Medium | Effort: Low**

For users unfamiliar with Atomic Research or Double Diamond:
- Hover tooltips on terms like "Nugget," "Fact," "Insight," "Recommendation," "Guardrail"
- `?` icon in each section header linking to a brief explanation
- In-app glossary accessible from help menu
- First-time annotations that appear once per concept

### 9. Right panel redesign
**Impact: Medium | Effort: Medium**

The right panel currently shows:
- In Chat: recent insights + recent nuggets + project stats (duplicates Findings)
- In Findings: evidence chain instructions + findings by phase (duplicates main view)
- In Tasks: tips (static text)
- In Context: how layers work (static text)

Redesign as a **context-aware assistant panel**:
- In Chat: show relevant findings that relate to the current conversation topic (semantic match)
- In Findings: show the evidence chain for the hovered/selected item (remove AtomicDrilldown modal, make it inline)
- In Tasks: show the task's linked findings, files, and agent activity log
- In Context: show a live preview of the composed context the agent sees
- Everywhere: show agent activity feed (what's happening right now)

### 10. Add keyboard shortcuts and power-user features
**Impact: Medium | Effort: Low**

UX researchers are power users of their tools. Add:
- `⌘1-5` to switch views
- `⌘N` for new task
- `⌘Enter` to send chat message (already works via Enter, but standard shortcut)
- `/` commands in chat (like Slack): `/analyze`, `/summarize`, `/compare`
- `⌘.` to toggle right panel
- Keyboard shortcut cheat sheet (accessible via `?`)

---

## Summary Scorecard

| Dimension | Score | Notes |
|-----------|-------|-------|
| Onboarding | 3/10 | No wizard, no templates, no guidance |
| Information Architecture | 6/10 | Logical but too flat; 8 items is too many |
| Learning Curve | 5/10 | Good inline help, but too many new concepts at once |
| Journey: First finding | 5/10 | Works but unguided |
| Journey: Transcripts → insights | 4/10 | Interview View is a placeholder |
| Journey: Context layers | 6/10 | Well-designed editor, no feedback loop |
| Journey: Search → evidence | 4/10 | Search results aren't actionable |
| Journey: Tasks → completion | 5/10 | Board looks good, tasks can't be configured |
| Cognitive Load | 5/10 | Too many concepts, views, and panels at once |
| Emotional Design | 6/10 | Professional but lacking personality and delight |
| Competitor Readiness | 6/10 | Unique positioning, but Interview View is a dealbreaker |
| **Overall** | **5/10** | Strong foundation and vision. Execution gaps in the most critical workflow (transcripts → insights). Fix the Interview View and onboarding, and this jumps to 7+. |

---

## North Star Metric

The single metric that would tell you ReClaw's UX is working:

> **Time from first launch to first validated insight with evidence chain.**

If a new user can go from opening ReClaw → uploading a transcript → seeing an insight linked to nuggets with source citations in under 10 minutes, the UX is working. Currently, this journey is blocked by the placeholder Interview View and lack of onboarding guidance.

---

*This audit was conducted by analyzing design specifications (VISION.md, UI-DESIGN.md, ARCHITECTURE.md) and the complete frontend source code (27 files across components, stores, hooks, and utilities). No usability testing with real users was conducted — findings are based on heuristic evaluation, competitor analysis, and UX best practices.*
