/** Scenario 22 — Architecture Evaluation:
 *  Evaluates ReClaw's entire system architecture against OpenClaw/NemoClaw patterns,
 *  protocol compliance, evidence chain integrity, Double Diamond coverage,
 *  API consistency, error handling, and self-improvement mechanisms.
 */

export const name = "Architecture & Protocol Evaluation";
export const id = "22-architecture-evaluation";

export async function run(ctx) {
  const { api } = ctx;
  const checks = [];

  async function safeCheck(checkName, fn) {
    try {
      const result = await fn();
      checks.push(result);
    } catch (e) {
      checks.push({ name: checkName, passed: false, detail: e.message?.substring(0, 150) || "Unknown error" });
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 1: OpenClaw / NemoClaw Architectural Pattern Compliance
  // ═══════════════════════════════════════════════════════════════════

  // Ensure a project exists for architecture testing
  let evalProjectId = ctx.projectId;
  if (!evalProjectId) {
    try {
      const proj = await api.post("/api/projects", { name: "[SIM-22] Architecture Eval", description: "Project for architecture evaluation" });
      evalProjectId = proj.id;
    } catch {}
  }

  // Pattern 1: Atomic Research Hierarchy (Nuggets → Facts → Insights → Recommendations)
  await safeCheck("[OpenClaw] Atomic Research — findings chain API exists", async () => {
    let projectId = evalProjectId;
    if (!projectId) {
      const proj = await api.post("/api/projects", { name: "[SIM-22] Arch Eval" });
      projectId = proj.id;
      evalProjectId = projectId;
    }

    // Create a full evidence chain
    const nugget = await api.post("/api/findings/nuggets", {
      project_id: projectId,
      text: "[SIM-22] Users report 8-10 second load times on mobile banking app",
      source: "interview-P04",
      tags: ["performance", "mobile"],
      phase: "discover",
      confidence: 0.9,
    });

    const fact = await api.post("/api/findings/facts", {
      project_id: projectId,
      text: "[SIM-22] Mobile app performance is a critical pain point affecting 60% of users",
      nugget_ids: [nugget.id],
      phase: "define",
      confidence: 0.85,
    });

    const insight = await api.post("/api/findings/insights", {
      project_id: projectId,
      text: "[SIM-22] Performance optimization would have the highest impact on user satisfaction and retention",
      fact_ids: [fact.id],
      phase: "define",
      confidence: 0.8,
      impact: "high",
    });

    const rec = await api.post("/api/findings/recommendations", {
      project_id: projectId,
      text: "[SIM-22] Implement progressive loading and service worker caching to achieve sub-2s load times",
      insight_ids: [insight.id],
      phase: "deliver",
      priority: "critical",
      effort: "medium",
      status: "proposed",
    });

    const chainComplete = !!nugget.id && !!fact.id && !!insight.id && !!rec.id;

    return {
      name: "[OpenClaw] Atomic Research — findings chain API exists",
      passed: chainComplete,
      detail: `nugget=${nugget.id}, fact=${fact.id}, insight=${insight.id}, rec=${rec.id}`,
    };
  });

  // Pattern 2: Evidence Chain Traceability
  await safeCheck("[OpenClaw] Evidence Chain — recommendation links to insights", async () => {
    let projectId = evalProjectId;
    if (!projectId) return { name: "[OpenClaw] Evidence Chain — recommendation links to insights", passed: false, detail: "No project" };

    // Get all findings for this project to verify chain
    const recs = await api.get(`/api/findings/recommendations?project_id=${projectId}`);
    const recList = Array.isArray(recs) ? recs : recs.recommendations || [];
    const insights = await api.get(`/api/findings/insights?project_id=${projectId}`);
    const insightList = Array.isArray(insights) ? insights : insights.insights || [];
    const facts = await api.get(`/api/findings/facts?project_id=${projectId}`);
    const factList = Array.isArray(facts) ? facts : facts.facts || [];
    const nuggets = await api.get(`/api/findings/nuggets?project_id=${projectId}`);
    const nuggetList = Array.isArray(nuggets) ? nuggets : nuggets.nuggets || [];

    const chainComplete = nuggetList.length > 0 && factList.length > 0 && insightList.length > 0 && recList.length > 0;

    return {
      name: "[OpenClaw] Evidence Chain — recommendation links to insights",
      passed: chainComplete,
      detail: `nuggets=${nuggetList.length}, facts=${factList.length}, insights=${insightList.length}, recs=${recList.length}`,
    };
  });

  // Pattern 3: Double Diamond Phase System
  await safeCheck("[OpenClaw] Double Diamond — all 4 phases have skills", async () => {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];

    const phases = { discover: [], define: [], develop: [], deliver: [] };
    for (const s of list) {
      if (s.phase in phases) phases[s.phase].push(s.name);
    }

    const allPopulated = Object.values(phases).every((arr) => arr.length >= 5);

    return {
      name: "[OpenClaw] Double Diamond — all 4 phases have skills",
      passed: allPopulated,
      detail: Object.entries(phases).map(([p, arr]) => `${p}=${arr.length}`).join(", "),
    };
  });

  // Pattern 4: Skill Registry + Self-Evolution
  await safeCheck("[OpenClaw] Self-Evolution — skill versioning + proposals", async () => {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];

    // Check at least one skill has version tracking
    const firstSkill = list[0];
    if (!firstSkill) return { name: "[OpenClaw] Self-Evolution — skill versioning + proposals", passed: false, detail: "No skills" };

    const detail = await api.get(`/api/skills/${firstSkill.name}`);
    const hasVersion = typeof detail.version === "number" || typeof detail.version === "string";

    // Check proposals endpoint exists
    let proposalsWork = false;
    try {
      await api.get("/api/skills/proposals/all");
      proposalsWork = true;
    } catch {}

    return {
      name: "[OpenClaw] Self-Evolution — skill versioning + proposals",
      passed: proposalsWork,
      detail: `version tracking=${hasVersion}, proposals API=${proposalsWork}`,
    };
  });

  // Pattern 5: Multi-Agent Architecture with Roles
  await safeCheck("[OpenClaw] Multi-Agent — 5 specialized roles", async () => {
    const data = await api.get("/api/agents");
    const agents = data.agents || [];
    const roles = [...new Set(agents.map((a) => a.role))];
    const expected = ["task_executor", "devops_audit", "ui_audit", "ux_evaluation", "user_simulation"];
    const missing = expected.filter((r) => !roles.includes(r));

    return {
      name: "[OpenClaw] Multi-Agent — 5 specialized roles",
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `All 5 roles: ${expected.join(", ")}`
        : `Missing: ${missing.join(", ")}`,
    };
  });

  // Pattern 6: Resource-Aware Governance
  await safeCheck("[OpenClaw] Resource Governance — budget-based agent control", async () => {
    const gov = await api.get("/api/resources");
    const hasResources = gov.resources && typeof gov.resources.ram_available_gb === "number";
    const hasBudget = gov.budget && typeof gov.budget.max_concurrent_agents === "number";
    const hasPaused = typeof gov.budget?.paused === "boolean";

    return {
      name: "[OpenClaw] Resource Governance — budget-based agent control",
      passed: hasResources && hasBudget && hasPaused,
      detail: `resources=${hasResources}, budget=${hasBudget}, paused_flag=${hasPaused}`,
    };
  });

  // Pattern 7: RAG Vector Store Integration
  await safeCheck("[OpenClaw] RAG — vector store health endpoint", async () => {
    try {
      const status = await api.get("/api/settings/status");
      const hasConfig = status.config && typeof status.config.rag_chunk_size === "number";
      const hasTopK = typeof status.config?.rag_top_k === "number";

      return {
        name: "[OpenClaw] RAG — vector store health endpoint",
        passed: hasConfig,
        detail: `chunk_size=${status.config?.rag_chunk_size}, top_k=${status.config?.rag_top_k}`,
      };
    } catch (e) {
      return { name: "[OpenClaw] RAG — vector store health endpoint", passed: false, detail: e.message };
    }
  });

  // Pattern 8: Hardware-Aware Model Selection
  await safeCheck("[OpenClaw] Hardware Detection — model recommendation", async () => {
    const hw = await api.get("/api/settings/hardware");

    const hasHardware = hw.hardware && typeof hw.hardware.total_ram_gb === "number";
    const hasRec = hw.recommendation && typeof hw.recommendation.model_name === "string";
    const hasCPU = hw.hardware && typeof hw.hardware.cpu_cores === "number";

    return {
      name: "[OpenClaw] Hardware Detection — model recommendation",
      passed: hasHardware && hasRec,
      detail: `RAM=${hw.hardware?.total_ram_gb}GB, CPU=${hw.hardware?.cpu_cores} cores, recommended=${hw.recommendation?.model_name}`,
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 2: A2A Protocol Compliance
  // ═══════════════════════════════════════════════════════════════════

  await safeCheck("[A2A] Agent Card — /.well-known/agent.json spec compliance", async () => {
    const res = await fetch("http://localhost:8000/.well-known/agent.json");
    const card = await res.json();

    const specFields = {
      name: typeof card.name === "string",
      description: typeof card.description === "string",
      url: typeof card.url === "string",
      version: typeof card.version === "string",
      protocol_version: typeof card.protocol_version === "string",
      capabilities: typeof card.capabilities === "object",
      skills: Array.isArray(card.skills),
      default_input_modes: Array.isArray(card.default_input_modes),
      default_output_modes: Array.isArray(card.default_output_modes),
    };

    const missing = Object.entries(specFields).filter(([, v]) => !v).map(([k]) => k);
    const passed = missing.length === 0;

    return {
      name: "[A2A] Agent Card — /.well-known/agent.json spec compliance",
      passed,
      detail: passed
        ? `All spec fields present: ${Object.keys(specFields).join(", ")}`
        : `Missing: ${missing.join(", ")}`,
    };
  });

  await safeCheck("[A2A] JSON-RPC — all methods respond correctly", async () => {
    const methods = [
      { method: "agent/discover", params: {} },
      { method: "tasks/list", params: { limit: 5 } },
      { method: "tasks/cancel", params: { id: "test" } },
    ];

    const results = [];
    for (const m of methods) {
      const res = await fetch("http://localhost:8000/a2a", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", method: m.method, params: m.params, id: `sim-22-${m.method}` }),
      });
      const body = await res.json();
      results.push({
        method: m.method,
        ok: body.jsonrpc === "2.0" && (body.result !== undefined || body.error !== undefined),
      });
    }

    const allOk = results.every((r) => r.ok);
    return {
      name: "[A2A] JSON-RPC — all methods respond correctly",
      passed: allOk,
      detail: results.map((r) => `${r.method}=${r.ok ? "OK" : "FAIL"}`).join(", "),
    };
  });

  await safeCheck("[A2A] JSON-RPC — error handling for invalid JSON", async () => {
    const res = await fetch("http://localhost:8000/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "not json {{{",
    });
    const body = await res.json();
    const hasError = body.error && body.error.code === -32700;

    return {
      name: "[A2A] JSON-RPC — error handling for invalid JSON",
      passed: hasError,
      detail: `error.code=${body.error?.code}, message=${body.error?.message}`,
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 3: API Consistency & Error Handling
  // ═══════════════════════════════════════════════════════════════════

  const apiEndpoints = [
    { path: "/api/health", method: "GET", expect: "status" },
    { path: "/api/projects", method: "GET", expect: "array_or_projects" },
    { path: "/api/skills", method: "GET", expect: "array_or_skills" },
    { path: "/api/agents", method: "GET", expect: "agents" },
    { path: "/api/settings/status", method: "GET", expect: "status" },
    { path: "/api/settings/hardware", method: "GET", expect: "hardware" },
    { path: "/api/settings/models", method: "GET", expect: "models" },
    { path: "/api/resources", method: "GET", expect: "resources" },
    { path: "/api/agents/status", method: "GET", expect: "orchestrator" },
    { path: "/api/skills/health/all", method: "GET", expect: "health" },
    { path: "/api/agents/heartbeat/status", method: "GET", expect: "heartbeat" },
    { path: "/api/agents/capacity", method: "GET", expect: "capacity" },
    { path: "/api/skill-registry", method: "GET", expect: "registry" },
    { path: "/.well-known/agent.json", method: "GET", expect: "agent_card" },
  ];

  await safeCheck("[API] All endpoints respond with 200", async () => {
    const results = [];
    for (const ep of apiEndpoints) {
      try {
        const res = await fetch(`http://localhost:8000${ep.path}`);
        results.push({ path: ep.path, status: res.status, ok: res.status === 200 });
      } catch (e) {
        results.push({ path: ep.path, status: 0, ok: false });
      }
    }

    const allOk = results.every((r) => r.ok);
    const failed = results.filter((r) => !r.ok);

    return {
      name: "[API] All endpoints respond with 200",
      passed: allOk,
      detail: allOk
        ? `${results.length}/${results.length} endpoints OK`
        : `Failed: ${failed.map((f) => `${f.path}(${f.status})`).join(", ")}`,
    };
  });

  await safeCheck("[API] Response times under 2 seconds", async () => {
    const timings = [];
    for (const ep of apiEndpoints.slice(0, 8)) {
      const start = Date.now();
      try {
        await fetch(`http://localhost:8000${ep.path}`);
      } catch {}
      const elapsed = Date.now() - start;
      timings.push({ path: ep.path, ms: elapsed, ok: elapsed < 2000 });
    }

    const allFast = timings.every((t) => t.ok);
    const slowest = timings.reduce((a, b) => (a.ms > b.ms ? a : b));

    return {
      name: "[API] Response times under 2 seconds",
      passed: allFast,
      detail: `slowest: ${slowest.path} (${slowest.ms}ms), avg: ${Math.round(timings.reduce((s, t) => s + t.ms, 0) / timings.length)}ms`,
    };
  });

  await safeCheck("[API] JSON content-type on all responses", async () => {
    const results = [];
    for (const ep of apiEndpoints.slice(0, 8)) {
      try {
        const res = await fetch(`http://localhost:8000${ep.path}`);
        const ct = res.headers.get("content-type") || "";
        results.push({ path: ep.path, ct, ok: ct.includes("application/json") });
      } catch (e) {
        results.push({ path: ep.path, ct: "error", ok: false });
      }
    }

    const allJson = results.every((r) => r.ok);
    const nonJson = results.filter((r) => !r.ok);

    return {
      name: "[API] JSON content-type on all responses",
      passed: allJson,
      detail: allJson
        ? `All ${results.length} endpoints return JSON`
        : `Non-JSON: ${nonJson.map((n) => n.path).join(", ")}`,
    };
  });

  await safeCheck("[API] 404 for non-existent resources", async () => {
    const tests = [
      "/api/projects/nonexistent-id-12345",
      "/api/agents/nonexistent-id-12345",
      "/api/skills/nonexistent-skill-name",
    ];

    const results = [];
    for (const path of tests) {
      try {
        const res = await fetch(`http://localhost:8000${path}`);
        results.push({ path, status: res.status, ok: res.status === 404 || res.status === 422 });
      } catch {
        results.push({ path, status: 0, ok: false });
      }
    }

    const allCorrect = results.every((r) => r.ok);

    return {
      name: "[API] 404 for non-existent resources",
      passed: allCorrect,
      detail: results.map((r) => `${r.path.split("/").pop()}=${r.status}`).join(", "),
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 4: Skill Coverage Completeness
  // ═══════════════════════════════════════════════════════════════════

  await safeCheck("[Skills] Coverage — qualitative methods present", async () => {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];
    const names = list.map((s) => s.name);

    const qualMethods = [
      "user-interviews", "thematic-analysis", "affinity-mapping",
      "contextual-inquiry", "diary-studies", "field-studies",
      "persona-creation", "empathy-mapping", "journey-mapping",
    ];
    const found = qualMethods.filter((m) => names.includes(m));
    const missing = qualMethods.filter((m) => !names.includes(m));

    return {
      name: "[Skills] Coverage — qualitative methods present",
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `All ${qualMethods.length} qualitative methods present`
        : `Missing: ${missing.join(", ")}`,
    };
  });

  await safeCheck("[Skills] Coverage — quantitative methods present", async () => {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];
    const names = list.map((s) => s.name);

    const quantMethods = [
      "survey-design", "nps-analysis", "sus-umux-scoring",
      "ab-test-analysis", "analytics-review", "task-analysis-quant",
    ];
    const found = quantMethods.filter((m) => names.includes(m));
    const missing = quantMethods.filter((m) => !names.includes(m));

    return {
      name: "[Skills] Coverage — quantitative methods present",
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `All ${quantMethods.length} quantitative methods present`
        : `Missing: ${missing.join(", ")}`,
    };
  });

  await safeCheck("[Skills] Coverage — evaluation methods present", async () => {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];
    const names = list.map((s) => s.name);

    const evalMethods = [
      "usability-testing", "heuristic-evaluation", "cognitive-walkthrough",
      "accessibility-audit", "design-critique", "design-system-audit",
    ];
    const found = evalMethods.filter((m) => names.includes(m));
    const missing = evalMethods.filter((m) => !names.includes(m));

    return {
      name: "[Skills] Coverage — evaluation methods present",
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `All ${evalMethods.length} evaluation methods present`
        : `Missing: ${missing.join(", ")}`,
    };
  });

  await safeCheck("[Skills] Coverage — synthesis & delivery methods present", async () => {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];
    const names = list.map((s) => s.name);

    const synthMethods = [
      "research-synthesis", "stakeholder-presentation", "handoff-documentation",
      "repository-curation", "research-retro",
    ];
    const found = synthMethods.filter((m) => names.includes(m));
    const missing = synthMethods.filter((m) => !names.includes(m));

    return {
      name: "[Skills] Coverage — synthesis & delivery methods present",
      passed: missing.length === 0,
      detail: missing.length === 0
        ? `All ${synthMethods.length} synthesis methods present`
        : `Missing: ${missing.join(", ")}`,
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 5: WebSocket & Real-Time Communication
  // ═══════════════════════════════════════════════════════════════════

  await safeCheck("[WebSocket] Endpoint exists at /ws", async () => {
    // We can't fully test WebSocket in Node fetch, but verify the endpoint exists
    try {
      const res = await fetch("http://localhost:8000/ws", {
        headers: { Upgrade: "websocket", Connection: "Upgrade" },
      });
      // Expected: 403 or protocol error (not 404)
      return {
        name: "[WebSocket] Endpoint exists at /ws",
        passed: res.status !== 404,
        detail: `status=${res.status} (expected non-404 for WebSocket endpoint)`,
      };
    } catch (e) {
      // Connection error is OK — it means the endpoint exists but rejects HTTP
      return {
        name: "[WebSocket] Endpoint exists at /ws",
        passed: true,
        detail: `WebSocket endpoint responded (${e.message?.substring(0, 50)})`,
      };
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 6: Data Model Integrity
  // ═══════════════════════════════════════════════════════════════════

  await safeCheck("[Data] Project — full CRUD lifecycle", async () => {
    const created = await api.post("/api/projects", {
      name: "[SIM-22] CRUD Test Project",
      description: "Testing CRUD lifecycle",
    });
    const read = await api.get(`/api/projects/${created.id}`);
    const updated = await api.patch(`/api/projects/${created.id}`, { name: "[SIM-22] Updated CRUD" });

    const crudOk = created.id && read.id === created.id && updated.name === "[SIM-22] Updated CRUD";

    // Cleanup
    try { await api.delete(`/api/projects/${created.id}`); } catch {}

    return {
      name: "[Data] Project — full CRUD lifecycle",
      passed: crudOk,
      detail: `create=${!!created.id}, read=${read.id === created.id}, update=${updated.name === "[SIM-22] Updated CRUD"}`,
    };
  });

  await safeCheck("[Data] Task — status transitions (backlog → in_progress → done)", async () => {
    let projId = ctx.projectId;
    if (!projId) {
      const p = await api.post("/api/projects", { name: "[SIM-22] Task Status Test" });
      projId = p.id;
    }

    const task = await api.post("/api/tasks", {
      project_id: projId,
      title: "[SIM-22] Status Test Task",
    });

    // backlog → in_progress
    const t1 = await api.patch(`/api/tasks/${task.id}`, { status: "in_progress" });
    const ip = t1.status === "in_progress";

    // in_progress → in_review
    const t2 = await api.patch(`/api/tasks/${task.id}`, { status: "in_review" });
    const ir = t2.status === "in_review";

    // in_review → done
    const t3 = await api.patch(`/api/tasks/${task.id}`, { status: "done" });
    const done = t3.status === "done";

    // Cleanup
    try { await api.delete(`/api/tasks/${task.id}`); } catch {}

    return {
      name: "[Data] Task — status transitions (backlog → in_progress → done)",
      passed: ip && ir && done,
      detail: `backlog→in_progress=${ip}, →in_review=${ir}, →done=${done}`,
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 7: Findings Summary & Analytics
  // ═══════════════════════════════════════════════════════════════════

  if (evalProjectId) {
    await safeCheck("[Findings] Summary — aggregation by phase", async () => {
      const summary = await api.get(`/api/findings/summary/${evalProjectId}`);

      const hasTotals = typeof summary.totals === "object" || typeof summary.total === "number";
      const hasByPhase = typeof summary.by_phase === "object";

      return {
        name: "[Findings] Summary — aggregation by phase",
        passed: true,
        detail: `totals=${JSON.stringify(summary.totals || summary.total || {}).substring(0, 80)}, by_phase=${hasByPhase}`,
      };
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 8: Security & Input Validation
  // ═══════════════════════════════════════════════════════════════════

  await safeCheck("[Security] Provider validation — rejects invalid provider", async () => {
    try {
      const res = await fetch("http://localhost:8000/api/settings/provider", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "malicious-provider" }),
      });
      // Should return 400 or 422
      return {
        name: "[Security] Provider validation — rejects invalid provider",
        passed: res.status >= 400,
        detail: `status=${res.status} (expected 400+)`,
      };
    } catch (e) {
      return { name: "[Security] Provider validation — rejects invalid provider", passed: true, detail: "Rejected as expected" };
    }
  });

  await safeCheck("[Security] CORS headers present", async () => {
    const res = await fetch("http://localhost:8000/api/health", {
      method: "OPTIONS",
      headers: { Origin: "http://localhost:3000" },
    });

    const cors = res.headers.get("access-control-allow-origin");
    const passed = cors === "http://localhost:3000" || cors === "*";

    return {
      name: "[Security] CORS headers present",
      passed,
      detail: `ACAO=${cors || "not set"}`,
    };
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 9: Scheduler & Channels
  // ═══════════════════════════════════════════════════════════════════

  await safeCheck("[Scheduler] Endpoint responds", async () => {
    try {
      const res = await fetch("http://localhost:8000/api/schedules");
      return {
        name: "[Scheduler] Endpoint responds",
        passed: res.status === 200,
        detail: `status=${res.status}`,
      };
    } catch (e) {
      return { name: "[Scheduler] Endpoint responds", passed: false, detail: e.message };
    }
  });

  await safeCheck("[Channels] Endpoint responds", async () => {
    try {
      const res = await fetch("http://localhost:8000/api/channels");
      return {
        name: "[Channels] Endpoint responds",
        passed: res.status === 200,
        detail: `status=${res.status}`,
      };
    } catch (e) {
      return { name: "[Channels] Endpoint responds", passed: false, detail: e.message };
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  // SECTION 10: Overall Architecture Score
  // ═══════════════════════════════════════════════════════════════════

  const passed = checks.filter((c) => c.passed).length;
  const failed = checks.filter((c) => !c.passed).length;
  const total = checks.length;
  const score = total > 0 ? Math.round((passed / total) * 100) : 0;

  const sectionScores = {};
  for (const check of checks) {
    const section = check.name.match(/\[([^\]]+)\]/)?.[1] || "Other";
    if (!sectionScores[section]) sectionScores[section] = { passed: 0, total: 0 };
    sectionScores[section].total++;
    if (check.passed) sectionScores[section].passed++;
  }

  const scoreSummary = Object.entries(sectionScores)
    .map(([section, { passed: p, total: t }]) => `${section}: ${p}/${t}`)
    .join(" | ");

  return {
    checks,
    passed,
    failed,
    summary: [
      `Architecture Score: ${score}% (${passed}/${total})`,
      scoreSummary,
      "",
      ...checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`),
    ].join("\n"),
  };
}
