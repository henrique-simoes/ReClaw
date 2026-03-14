# 🧑‍🔬 User Simulation Audit — "Sarah" walks through ReClaw

**Date:** 2026-03-14  
**Persona:** Sarah, UX Researcher at a mid-market B2B SaaS company  
**Scenario:** Sarah discovered ReClaw on GitHub and wants to use it for an onboarding redesign study. She has 6 years of UXR experience, is comfortable with research tools (Dovetail, Miro, Figma), but is NOT a developer — she can follow instructions but doesn't write code daily. She has Docker Desktop installed because a colleague set it up for her once.

---

## Step 1: README.md — First Impressions

### What Sarah would do
Open the GitHub repo, scan the README. She's looking for: *What is this? Can I use it? How do I start?*

### What works well
- **The tagline is excellent.** "Local-first AI agent for UX Research" — Sarah immediately gets it. The privacy angle ("no data ever leaves your computer") is a huge selling point for her; she handles PII from user interviews.
- **Feature list maps to her mental model.** Double Diamond, Atomic Research, Kanban — these are frameworks she knows. She doesn't need them explained.
- **Quick Start is genuinely quick.** Four commands. She can handle `git clone`, `cp`, and `docker compose up`.
- **Architecture diagram** is clear and simple. She grasps the three-box model.
- **The 40 skills list organized by Double Diamond phase** is *chef's kiss*. She immediately scans for "User Interviews" and finds it. She also spots "Competitive Analysis" and "Journey Mapping" — methods she uses weekly.

### What would confuse or block her
1. **"Prerequisites: Docker"** — That's it? No mention of RAM requirements, disk space, or how long the first run takes. Sarah's laptop has 16GB RAM. Will Ollama + Qwen 3.5 run? She has no idea.
2. **`cp .env.example .env`** — Sarah might not know what this does or why. A one-line explanation ("copies default settings") would help.
3. **`your-org/reclaw`** in the clone URL — Obviously a placeholder, but it signals "not ready yet." She might close the tab.
4. **No screenshots.** Sarah is a visual person. She wants to see the UI before committing 20 minutes to a Docker setup.
5. **No "What happens next" after `docker compose up`.** She'll see terminal output scrolling. Is it working? How long should she wait? What does success look like?
6. **The install script (`curl | bash`)** — Sarah would never run this. It's scary for non-devs and even many devs avoid it. Fine to offer, but it shouldn't be presented as the recommended path.
7. **No mention of supported OS.** Does this work on Windows? Mac? Linux only?

### Fix recommendations
- Add **system requirements** section: OS, RAM (min 8GB, recommended 16GB), disk (10GB for models), Docker Desktop version.
- Add 2-3 **screenshots** or a GIF of the UI in action.
- Add a **"First run takes ~5 minutes"** note with expected terminal output.
- Replace `your-org` with the actual repo URL or a clear `<YOUR-ORG>` placeholder.
- Add a one-liner explaining `.env`: *"This copies the default configuration. You can customize model settings later."*

---

## Step 2: docker-compose.yml — Setup Complexity

### What Sarah would do
She probably wouldn't read this file directly — she'd just run `docker compose up`. But if something goes wrong, she'd open it trying to debug.

### What works well
- **Three services, clearly named** (`ollama`, `backend`, `frontend`). Even Sarah can see the structure.
- **Health checks** mean the services start in the right order. She won't hit race conditions.
- **Default environment variables** with fallbacks (`${OLLAMA_MODEL:-qwen3:latest}`) mean it works out of the box.
- **Named volumes** persist data between restarts. She won't lose her research.

### What would confuse or block her
1. **GPU section is commented out** with a cryptic comment. If Sarah has an NVIDIA GPU laptop, she'll never benefit from it unless she reads the comments and knows what "uncomment" means in YAML.
2. **`WATCH_DIR:-./data/watch`** — What is this? There's no explanation of the file watcher feature. Sarah would love a "drop files here" folder but doesn't know it exists.
3. **Port conflicts.** If port 3000 or 8000 is in use (common if she runs other dev tools), she'll get an error with no guidance.
4. **No GPU compose file reference** in README. `docker-compose.gpu.yml` exists but is never mentioned.

### Fix recommendations
- Add a **"Troubleshooting" section** to README covering port conflicts and GPU setup.
- Add a comment in docker-compose.yml: `# Drop files into ./data/watch/ — they'll be auto-indexed!`
- Mention the GPU override file in README: `docker compose -f docker-compose.yml -f docker-compose.gpu.yml up`
- Consider a **setup wizard** that detects hardware and generates the right compose config.

---

## Step 3: page.tsx — Navigation & Information Architecture

### What Sarah would do
Open `localhost:3000`, look at the sidebar, figure out where to click.

### What works well
- **Single-page app with sidebar navigation.** Sarah is used to this pattern (Notion, Linear, Dovetail).
- **Eight clear nav items** with icons: Chat, Findings, Tasks, Interviews, Metrics, Context, History, Settings. Good coverage.
- **Project selector** in the sidebar. She can create a project immediately.
- **Cmd+K search** — power-user feature she'll discover later and love.
- **Right panel** for contextual details. Good use of screen real estate.
- **Status bar** showing connection status and agent activity. She'll know if the system is working.

### What would confuse or block her
1. **No onboarding flow.** Sarah lands on a blank Chat view with "Select or create a project to start." She has to figure out the sidebar project section, click "+", name it, then figure out what to do next. There's no wizard, no template, no guided setup.
2. **No project templates.** Sarah is doing "Onboarding Redesign." She'd love a template that pre-populates company context, suggests research questions, and creates starter tasks.
3. **"Context" label is vague.** Sarah might think it's file context (like a folder). "Project Setup" or "Research Brief" would be clearer.
4. **View ordering.** Chat is first, but for a new project, Sarah should probably go to Context first to set up her project brief. The nav order implies a workflow that doesn't match reality.
5. **No "getting started" checklist.** Other tools (Notion, Linear) show a checklist: "1. Set up your project → 2. Upload transcripts → 3. Ask your first question."
6. **The `window.addEventListener` in the component body** is a memory leak — it registers a new listener on every render. (Dev issue, not UX, but affects performance.)

### Fix recommendations
- Add a **first-run onboarding wizard**: "What are you researching?" → project name, brief context, first research question.
- Add **project templates**: "Onboarding Study", "Competitive Audit", "Usability Test", "Blank Project."
- Rename "Context" to **"Research Brief"** or **"Project Setup"**.
- Add a **getting-started checklist** that appears for new projects.
- Reorder nav to suggest workflow: Context → Chat → Interviews → Findings → Tasks → Metrics.

---

## Step 4: ChatView.tsx — Talking to the Agent

### What Sarah would do
Type a message, upload a file, try to get research help.

### What works well
- **Clean chat interface.** Familiar pattern (ChatGPT-like). Sarah knows how to use this immediately.
- **File upload button** (paperclip icon) with clear accepted formats (.pdf, .docx, .txt, .csv, .md). This is exactly what Sarah needs for transcripts.
- **Streaming responses.** The "Thinking..." indicator and streaming text make the AI feel responsive.
- **Source citations.** When RAG surfaces relevant documents, they're shown with confidence scores. Sarah loves this — traceability matters in research.
- **Keyboard shortcut** (Enter to send, Shift+Enter for newline). Standard and expected.
- **Empty state** is friendly: "Ready to research! Upload interview transcripts, ask research questions, or drop files to get started."

### What would confuse or block her
1. **No suggested prompts.** Sarah doesn't know what to ask. "Analyze my transcript" might work, but she'd love suggestions like: "Generate an interview guide for...", "Find themes across my interviews", "Create a competitive analysis."
2. **No skill picker.** The 40 skills are triggered by keyword detection in the backend (`_detect_skill_intent`), but Sarah has no way to discover them from the chat. She'd have to guess the right words.
3. **File upload UX gap.** After uploading, the system auto-sends "I just uploaded [file]. Can you analyze it?" — but Sarah didn't write that message. It appears as if she said it. This is confusing and feels like the system is putting words in her mouth.
4. **No drag-and-drop.** The placeholder says "drop files here" but there's no drop zone handler. Misleading.
5. **No markdown rendering.** Agent responses are `whitespace-pre-wrap` plain text. When the agent returns markdown (headers, bold, lists), it'll look ugly with raw `**` and `#` characters.
6. **No way to reference previous findings.** Sarah can't say "add this to my findings" or "create a task from this." Chat is isolated from the rest of the tool.
7. **No conversation threads.** If Sarah switches between topics (interview analysis → competitive research), everything is one long thread. No way to organize.
8. **Error display is minimal.** Just `⚠️ {error}` — no recovery guidance.

### Fix recommendations
- Add **suggested prompt chips** above the input: "Generate interview guide", "Analyze transcript", "Find themes", "Create persona."
- Add a **skill picker button** (🧩) next to the input that shows available skills grouped by phase.
- Fix file upload to show a **system message** ("File uploaded and indexed: 42 chunks") instead of faking a user message.
- Implement **drag-and-drop** on the chat area.
- Add **markdown rendering** (react-markdown or similar).
- Add **action buttons** on agent responses: "Save as finding", "Create task", "Copy."

---

## Step 5: KanbanBoard.tsx — Task Management

### What Sarah would do
Create tasks for her research plan, track progress, direct the agent.

### What works well
- **Four-column Kanban** (Backlog → In Progress → In Review → Done). Standard and clear.
- **Drag-and-drop** between columns. Intuitive.
- **Skill tags** on cards show which UXR method is associated. Nice connection.
- **Progress bars** on tasks. Sarah can see how far along the agent is.
- **Agent notes vs. user context.** Clear separation between what the agent found and what Sarah provided.
- **Expandable cards** with details. Good progressive disclosure.
- **Column counts** in headers. Quick overview.

### What would confuse or block her
1. **No task descriptions on creation.** Sarah can only enter a title. She'd want to add: "Interview 5 participants about onboarding friction. Focus on the verification step." But there's no description field in the creation flow.
2. **No way to assign a skill to a task.** The `skill_name` field exists but there's no UI to set it. Only the agent can assign skills.
3. **No due dates or priorities.** Sarah's research has deadlines. She can't set "Complete by March 20."
4. **No task-to-chat connection.** Sarah can't click a task and say "Work on this" to start the agent on it.
5. **Delete is destructive and immediate.** No confirmation dialog. One click and the task is gone.
6. **No filtering or sorting.** With 20+ tasks across a multi-method study, she'd want to filter by skill, priority, or keyword.
7. **"In Review" column is ambiguous.** Review by whom? Sarah? The agent? A stakeholder?
8. **No sub-tasks.** A "Conduct 8 user interviews" task naturally breaks into individual interview tasks.

### Fix recommendations
- Add **description field** (expandable textarea) in task creation.
- Add **skill picker** dropdown when creating a task: "This task uses: [User Interviews ▼]."
- Add **due dates** and **priority** (P1/P2/P3 or Low/Medium/High).
- Add **"Run this task"** button that sends the task to the agent via chat.
- Add **confirmation dialog** for delete.
- Add **filter bar** (by skill, status, keyword).
- Rename "In Review" to **"Needs Review"** and clarify in tooltip: "Tasks waiting for your review of agent output."

---

## Step 6: FindingsView.tsx — Double Diamond + Atomic Research

### What Sarah would do
Browse findings after running some analyses. Try to understand the Atomic Research hierarchy.

### What works well
- **Phase tabs (Discover → Define → Develop → Deliver)** perfectly mirror the Double Diamond. Sarah uses this framework and immediately understands the navigation.
- **Four finding types** (Nuggets → Facts → Insights → Recommendations) follow the Atomic Research model. This is *exactly* how Sarah thinks about research synthesis.
- **Summary stats** at the top (counts per type). Quick health check on research coverage.
- **Confidence scores** on findings. Critical for research rigor — Sarah needs to know if an insight is backed by 2 or 20 data points.
- **Tags on findings.** Good for cross-cutting themes.
- **Drill-down modal** (AtomicDrilldown) for traceability. Sarah can click an insight and trace it back to the nuggets that support it. This is the killer feature.
- **Phase-filtered counts** in tabs. She knows which phases have the most data.

### What would confuse or block her
1. **No explanation of Atomic Research.** Sarah might know it, but many researchers don't. There's no tooltip, help text, or "What are nuggets?" link. The hierarchy (Nuggets → Facts → Insights → Recommendations) is assumed knowledge.
2. **All four icons are diamonds (💎).** The phase tabs all use the same Diamond icon. They should be visually differentiated — a magnifying glass for Discover, a target for Define, a wrench for Develop, a rocket for Deliver.
3. **No "Add Finding" button.** Sarah sometimes has manual insights she wants to add — things she observed in a session or heard in a hallway conversation. She can't manually create findings; everything comes from the agent.
4. **No editing.** She can't refine the agent's wording on a nugget or change a tag. Findings are read-only.
5. **No export.** Sarah needs to put these in a stakeholder presentation, a Confluence page, or a Miro board. There's no "Export to CSV/PDF/Markdown" option.
6. **Empty states are generic.** "No insights yet for this phase" doesn't tell Sarah what to do. It should say: "Run interview analysis or thematic analysis to generate insights for the Discover phase."
7. **Impact and Priority fields** exist but aren't explained. What's the scale? Who set them?
8. **No search within findings.** With 100+ nuggets across phases, Sarah can't find the one about "verification step."

### Fix recommendations
- Add **"What is Atomic Research?"** tooltip or collapsible explainer with the hierarchy diagram.
- Use **distinct phase icons**: 🔍 Discover, 🎯 Define, 🔨 Develop, 🚀 Deliver.
- Add **"Add Finding"** button for each type (manual entry).
- Make findings **editable** (click to edit text, tags, confidence).
- Add **export button**: CSV, Markdown, PDF, "Copy all as table."
- Improve empty states with **actionable guidance**.
- Add **search/filter bar** within findings.

---

## Step 7: InterviewView.tsx — Transcript Analysis

### What Sarah would do
Upload a transcript, see it parsed, review extracted nuggets.

### What works well
- **Split-pane layout** (transcript left, nuggets/tags right). This is the standard transcript analysis layout (Dovetail, EnjoyHQ). Sarah feels at home.
- **Transcript parsing** handles multiple formats: `[0:00] Speaker: text`, `00:00 - Speaker: text`, `Speaker (00:00): text`. Smart.
- **Highlighted segments** with yellow border for nugget-linked passages. Visual connection between raw data and extracted findings.
- **Tag cloud** with counts. Quick theme overview.
- **Tag filtering** — click a tag to filter nuggets. Efficient.
- **Quick Actions** at the bottom: "Run thematic analysis", "Generate affinity map", "Create synthesis report." These are exactly what Sarah would want next.
- **File tabs** for switching between transcripts. Clean.

### What would confuse or block her
1. **Transcript content isn't actually loaded.** `handleFileSelect` shows a placeholder: "Transcript content would be loaded here. To see full analysis, use the chat." This is a **dead end**. Sarah uploaded a file, clicked it, and gets a placeholder telling her to go somewhere else.
2. **No inline highlighting/tagging.** Sarah expects to select text and tag it — that's the core interaction in every transcript tool. She can't do this.
3. **No speaker management.** Sarah can't rename speakers (P1 → "Maria, PM"), assign colors, or filter by speaker.
4. **Upload button duplicates Chat's upload.** Files uploaded here go to the same place as Chat uploads, but the UX is different. Confusing overlap.
5. **No audio/video support.** The microphone icon and "Interviews" label imply audio. Sarah might try uploading an MP3 and get confused when nothing happens.
6. **Nugget extraction only happens via chat.** There's no "Extract nuggets" button on the transcript view itself. Sarah has to mentally switch contexts.
7. **No manual nugget creation.** Sarah reads a quote and thinks "that's important" — she can't highlight it and create a nugget.
8. **Quick Actions buttons don't seem connected to anything.** They're styled as links but there's no onClick handler visible. Are they wired up?

### Fix recommendations
- **Actually load transcript content** from the API when a file is selected. This is the #1 blocker.
- Add **"Analyze this transcript"** button that triggers nugget extraction directly.
- Add **inline text selection → create nugget** interaction.
- Add **speaker management**: rename, color-code, filter by speaker.
- Clarify supported formats: "Text transcripts only (TXT, PDF, DOCX). For audio, use [external tool] to transcribe first."
- Wire up **Quick Actions** to actually trigger skills.

---

## Step 8: ContextEditor.tsx — Project Setup

### What Sarah would do
Set up her company info and project details before starting research.

### What works well
- **Three-layer model** (Company → Project → Guardrails) is brilliant. Sarah immediately gets the hierarchy.
- **Rich placeholder examples** in each section. The company context example ("Acme Corp — B2B SaaS...") directly mirrors Sarah's situation. The project context example ("Redesigning the onboarding flow...") is literally her project. She feels seen.
- **Guardrails section** is powerful. "Flag if sample size < 5" — Sarah would absolutely set this. "Use company terminology: 'workspace' not 'project'" — real-world need.
- **"How context layers work" explainer** at the bottom. Clear, concise, helpful.
- **Save per-section and Save All.** Flexible.
- **Character count badges.** Nice touch for knowing if context is too sparse or too long.

### What would confuse or block her
1. **No guidance on how much to write.** Is 50 characters enough? Is 5,000 too much? Does more context = better results? Sarah doesn't know.
2. **No template/wizard.** Sarah has to start from a blank textarea. A structured form (Company name: ___, Product: ___, Target users: ___) would be faster and ensure she covers all important aspects.
3. **Guardrails are freeform text.** Sarah might not know what rules are useful. A checklist of common guardrails ("Always cite sources", "Flag small samples", "Use inclusive language") would help.
4. **No validation.** Sarah could leave everything blank and the system would never prompt her to fill it in.
5. **"The agent reads them before every task"** — but how? Sarah can't see the agent's system prompt. She doesn't know if her context is actually being used. A "Preview agent prompt" button would build trust.
6. **Eye/EyeOff icons for expand/collapse** are confusing. They suggest "show/hide password" not "expand/collapse section." Use ChevronDown/ChevronRight instead.

### Fix recommendations
- Add **recommended length guidance**: "Aim for 200-500 characters. Be specific but concise."
- Add **structured templates** for each section (toggle between "Guided" and "Freeform" mode).
- Add a **guardrails checklist** of common rules Sarah can toggle on.
- Add a **"Preview how the agent sees this"** button.
- Replace Eye/EyeOff with **ChevronDown/ChevronRight** for expand/collapse.
- Add a **"context completeness" score** — "Your project context is 60% complete. Add target users to improve results."

---

## Step 9: API Routes (chat.py, skills.py) — Chat-to-Skills Integration

### What Sarah would do
She wouldn't read the code directly. But this determines whether her natural language works.

### What works well
- **Intent detection via keyword mapping** (`_detect_skill_intent`) covers ~50 common phrases. "Create persona", "journey map", "heuristic eval" all trigger the right skills. Broad coverage.
- **Skill execution returns structured output** (nuggets, facts, insights, recommendations). Everything flows into the Atomic Research model automatically. Sarah doesn't have to manually categorize.
- **RAG augmentation** means the agent has access to Sarah's uploaded files without her re-specifying. She can just say "analyze my interviews" and it finds them.
- **Context layers compose automatically** (company + project + guardrails) before every response. Sarah's guardrails are always active.
- **Streaming SSE** for responsive feel. Good.

### What would confuse or block her
1. **Keyword matching is brittle.** "Help me understand my interview data" won't trigger the user-interviews skill because it doesn't match any phrases. "Do a user interview analysis" would work, but Sarah might not use that exact phrasing.
2. **No feedback on which skill was matched.** If Sarah says "create a journey map" and the affinity-mapping skill fires instead (unlikely but possible with fuzzy phrasing), she wouldn't know. The response says "🧩 Ran journey-mapping" but only after execution.
3. **No confirmation before execution.** "Run usability testing" immediately executes. Sarah might have wanted to configure it first (which tasks? which screens?). A "plan" step exists in the API but isn't surfaced in chat.
4. **Skills API has powerful features Sarah can't access from the UI:**
   - Skill proposals/self-improvement system
   - Health monitoring
   - Plan vs. Execute distinction
   - Skill creation/editing
   - Toggling skills on/off
   These are API-only. The frontend has no skills management view.
5. **History limit** defaults to 20 messages. A long research session could lose early context.

### Fix recommendations
- **Improve intent detection** with fuzzy matching or let the LLM decide which skill to invoke (tool-use pattern).
- Add **skill confirmation step**: "I'll run User Interviews analysis on your 3 transcripts. Shall I proceed? [Run] [Configure first]"
- Add a **Skills Management view** in the frontend (list all 40 skills, see health, toggle on/off, view proposals).
- Surface the **plan endpoint** in chat: "Before I run this, here's my plan: [steps]. Looks good?"
- Increase history limit or make it configurable.

---

## Step 10: Skill Definitions — Discoverability & Understanding

### What Sarah would do
Try to find out what ReClaw can do. Look for a list of methods.

### What works well
- **45 skills covering the entire Double Diamond.** This is comprehensive. Sarah's usual toolbox (interviews, personas, journey maps, affinity diagrams, heuristic evals, SUS) is all here, plus methods she's heard of but never tried (Kappa analysis, survey AI detection).
- **Skills follow the AgentSkills standard** (SKILL.md with frontmatter). Consistent structure.
- **Each SKILL.md has**: capabilities, workflow, input, output, best practices. Well-documented.
- **JSON definitions** include plan_prompt, execute_prompt, output_schema. The agent knows exactly what to extract.
- **Phase categorization** is correct — skills are in the right Diamond phase.

### What would confuse or block her
1. **Skills are not visible in the UI.** There's no "Skills" or "Methods" page. Sarah has to either (a) read the README's skill list, (b) know the right chat keywords, or (c) call the API directly. The 45 skills are the product's greatest asset and they're completely hidden.
2. **No skill descriptions in the UI.** Even if Sarah knows "affinity mapping" exists, she can't read its description, see its workflow, or understand what inputs it needs without reading the code.
3. **No "recommended skills" for a project phase.** Sarah is in the Discover phase. ReClaw should suggest: "You're in Discover. Try: User Interviews, Competitive Analysis, Stakeholder Interviews."
4. **Skill naming inconsistency.** Some skills use research jargon: "Kappa Thematic Analysis" (intercoder reliability), "SUS/UMUX Scoring", "JTBD Analysis." Sarah knows these, but a junior researcher wouldn't. No tooltip or explainer.
5. **No skill chaining.** Sarah's typical workflow: Interviews → Thematic Analysis → Affinity Mapping → Persona Creation → Journey Mapping. She can't set up a pipeline. Each skill is invoked independently.
6. **The README says 40 skills but the actual count is 45.** Minor inconsistency but signals lack of polish.

### Fix recommendations
- **Add a "Skills Library" view** to the sidebar. Show all skills as cards grouped by phase, with name, description, and "Run" button.
- Add **skill suggestions** based on current project phase and existing data.
- Add **skill chaining**: "Run Interview Analysis → Thematic Analysis → Persona Creation as a pipeline."
- Add **tooltips** for jargon-heavy skill names.
- Fix README count to match reality.
- Add a **"Discover methods"** section to the onboarding wizard.

---

## Summary: Severity Ratings

| Area | Usability | Completeness | Sarah's Delight |
|------|-----------|-------------|-----------------|
| README | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Docker setup | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Navigation/IA | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Chat | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐ |
| Kanban | ⭐⭐⭐ | ⭐⭐ | ⭐⭐⭐ |
| Findings | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Interviews | ⭐⭐ | ⭐⭐ | ⭐⭐ |
| Context Editor | ⭐⭐⭐⭐ | ⭐⭐⭐ | ⭐⭐⭐⭐ |
| Chat-to-Skills | ⭐⭐⭐ | ⭐⭐⭐⭐ | ⭐⭐⭐ |
| Skill Discovery | ⭐ | ⭐⭐⭐⭐⭐ | ⭐ |

**Legend:** ⭐ = Poor, ⭐⭐⭐ = Adequate, ⭐⭐⭐⭐⭐ = Excellent

---

## 🌟 Sarah's Top 10 Wish List

*The things Sarah would most want improved, ranked by impact on her daily workflow:*

### 1. 🧩 Skills Library View (CRITICAL)
> "You have 45 research methods built in and I can't see any of them? I had to read the README to find out they exist. Give me a 'Methods' tab where I can browse, search, and launch skills. This should be the first thing I see."

### 2. 📝 Working Transcript Viewer (CRITICAL)
> "I clicked my uploaded transcript and got a placeholder. The Interview view is the core of my workflow — upload transcript → see it → tag passages → extract nuggets. Right now it's a dead end. Please make the transcript actually load."

### 3. 🚀 First-Run Onboarding Wizard (HIGH)
> "I opened the app and stared at a blank chat. No guidance. I need: project template selection → context setup → 'upload your first file' → 'ask your first question.' Walk me through the first 5 minutes."

### 4. 💬 Suggested Prompts & Skill Picker in Chat (HIGH)
> "I don't know what magic words trigger which skill. Give me prompt suggestions above the input and a skill picker button. 'What can I ask you?' is my first question, and the app doesn't answer it."

### 5. ✏️ Editable Findings + Manual Entry (HIGH)
> "The agent extracted a nugget but worded it poorly. I can't edit it. I observed something important in a session that I want to add manually. I can't. Research is a collaborative process between me and the tool — I need to contribute, not just consume."

### 6. 📤 Export Everything (MEDIUM-HIGH)
> "My deliverable is a stakeholder presentation, not a web app. I need 'Export findings as PDF', 'Export as CSV', 'Copy as Markdown table.' If I can't get data out, I can't use this tool in my real workflow."

### 7. 🔗 Skill Confirmation + Planning Step (MEDIUM)
> "When I say 'run competitive analysis,' I want to see the plan first: 'I'll analyze these 3 files, focus on onboarding flows, compare against these competitors. Sound right?' Don't just execute blindly."

### 8. 🏷️ Inline Transcript Tagging (MEDIUM)
> "Let me select text in a transcript and create a nugget from it. That's the core UXR interaction. Highlight → tag → code. Every transcript tool does this. ReClaw should too."

### 9. 📊 Structured Context Templates (MEDIUM)
> "The Context Editor placeholders are great, but I'd love a guided form: 'Company name: ___ | Product: ___ | Target users: ___ | Research questions: 1. ___ 2. ___.' I'll fill in blanks faster than staring at a textarea."

### 10. 🔄 Skill Pipelines / Research Workflows (LOW-MEDIUM)
> "My study follows a predictable path: Interviews → Thematic Analysis → Affinity Map → Personas → Journey Map → Recommendations. Let me set up this pipeline once and run it step by step. Don't make me invoke each skill separately."

---

*Audit generated by Sarah (User Simulation Agent) — 2026-03-14*
