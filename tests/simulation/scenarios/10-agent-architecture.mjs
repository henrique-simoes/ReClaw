/** Scenario 10-arch — Agent Architecture Verification:
 *  agent discovery, A2A protocol, custom agent lifecycle, orchestration,
 *  export/import, and resource governance.
 */

export const name = "Agent Architecture Verification";
export const id = "10-agent-architecture";

export async function run(ctx) {
  const { api } = ctx;
  const checks = [];

  // ── Helpers ──

  /** Wrap a fetch call so network failures become "warn" instead of crashes. */
  async function safeCheck(name, fn) {
    try {
      const result = await fn();
      checks.push(result);
    } catch (e) {
      const isNetwork = /fetch|ECONNREFUSED|ETIMEDOUT|NetworkError/i.test(e.message);
      checks.push({
        name,
        passed: false,
        detail: isNetwork ? `[warn] Network error: ${e.message}` : e.message,
      });
    }
  }

  // ── Test 1: Agent Discovery ──
  // GET /api/agents returns all 5 system agents with correct roles

  let systemAgents = [];
  await safeCheck("Agent Discovery — system agents present", async () => {
    const data = await api.get("/api/agents");
    const agents = data.agents || [];
    systemAgents = agents.filter((a) => a.is_system);

    const hasEnough = systemAgents.length >= 5;
    const roles = systemAgents.map((a) => a.role);
    const ids = systemAgents.map((a) => a.id);

    return {
      name: "Agent Discovery — system agents present",
      passed: hasEnough,
      detail: hasEnough
        ? `${systemAgents.length} system agents: ${ids.join(", ")}`
        : `Expected >= 5 system agents, got ${systemAgents.length} (ids: ${ids.join(", ")})`,
    };
  });

  await safeCheck("Agent Discovery — agents have required fields", async () => {
    const data = await api.get("/api/agents");
    const agents = data.agents || [];
    const requiredFields = ["id", "name", "role", "state", "is_system"];
    const missingFields = [];

    for (const agent of agents.slice(0, 5)) {
      for (const field of requiredFields) {
        if (!(field in agent)) {
          missingFields.push(`${agent.id || agent.name || "unknown"} missing '${field}'`);
        }
      }
    }

    return {
      name: "Agent Discovery — agents have required fields",
      passed: missingFields.length === 0,
      detail: missingFields.length === 0
        ? `All agents have fields: ${requiredFields.join(", ")}`
        : `Missing: ${missingFields.join("; ")}`,
    };
  });

  // ── Test 2: A2A Agent Card ──
  // GET /.well-known/agent.json returns valid agent card with required fields

  await safeCheck("A2A Agent Card — endpoint responds", async () => {
    const res = await fetch("http://localhost:8000/.well-known/agent.json");
    const card = await res.json();

    const requiredKeys = ["name", "description", "url", "version", "capabilities", "skills"];
    const missing = requiredKeys.filter((k) => !(k in card));
    const hasAllKeys = missing.length === 0;

    const hasName = typeof card.name === "string" && card.name.length > 0;
    const hasSkills = Array.isArray(card.skills) && card.skills.length > 0;
    const hasCaps = typeof card.capabilities === "object" && card.capabilities !== null;

    const passed = hasAllKeys && hasName && hasSkills && hasCaps;

    return {
      name: "A2A Agent Card — endpoint responds",
      passed,
      detail: passed
        ? `name=${card.name}, version=${card.version}, ${card.skills.length} skills`
        : `Missing keys: ${missing.join(", ")}; name=${hasName}, skills=${hasSkills}, caps=${hasCaps}`,
    };
  });

  await safeCheck("A2A Agent Card — skill structure valid", async () => {
    const res = await fetch("http://localhost:8000/.well-known/agent.json");
    const card = await res.json();

    const skill = (card.skills || [])[0];
    if (!skill) {
      return { name: "A2A Agent Card — skill structure valid", passed: false, detail: "No skills in card" };
    }

    const hasId = typeof skill.id === "string";
    const hasSkillName = typeof skill.name === "string";
    const hasDesc = typeof skill.description === "string";
    const hasTags = Array.isArray(skill.tags);
    const passed = hasId && hasSkillName && hasDesc && hasTags;

    return {
      name: "A2A Agent Card — skill structure valid",
      passed,
      detail: passed
        ? `skill.id=${skill.id}, ${skill.tags?.length || 0} tags`
        : `id=${hasId}, name=${hasSkillName}, desc=${hasDesc}, tags=${hasTags}`,
    };
  });

  // ── Test 3: A2A JSON-RPC ──
  // POST /a2a with agent/discover method returns agents

  await safeCheck("A2A JSON-RPC — agent/discover", async () => {
    const res = await fetch("http://localhost:8000/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "agent/discover",
        params: {},
        id: "sim-arch-discover-1",
      }),
    });
    const body = await res.json();

    const hasJsonrpc = body.jsonrpc === "2.0";
    const hasResult = typeof body.result === "object" && body.result !== null;
    const hasAgents = Array.isArray(body.result?.agents);
    const agentCount = body.result?.agents?.length || 0;
    const passed = hasJsonrpc && hasResult && hasAgents && agentCount > 0;

    return {
      name: "A2A JSON-RPC — agent/discover",
      passed,
      detail: passed
        ? `${agentCount} agents returned via JSON-RPC`
        : `jsonrpc=${hasJsonrpc}, result=${hasResult}, agents=${hasAgents}, count=${agentCount}`,
    };
  });

  await safeCheck("A2A JSON-RPC — unknown method returns error", async () => {
    const res = await fetch("http://localhost:8000/a2a", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "nonexistent/method",
        params: {},
        id: "sim-arch-unknown-1",
      }),
    });
    const body = await res.json();

    const hasError = typeof body.error === "object" && body.error !== null;
    const hasCode = typeof body.error?.code === "number";
    const passed = hasError && hasCode;

    return {
      name: "A2A JSON-RPC — unknown method returns error",
      passed,
      detail: passed
        ? `error.code=${body.error.code}, message=${body.error.message}`
        : `error obj=${hasError}, code=${hasCode}`,
    };
  });

  // ── Test 4: Agent Creation ──
  // POST /api/agents creates a custom agent, returns valid ID and state

  let testAgentId = null;
  await safeCheck("Agent Creation — POST returns valid agent", async () => {
    const agent = await api.post("/api/agents", {
      name: "[SIM-ARCH] Test Agent",
      role: "custom",
      system_prompt: "Architecture test agent created by simulation.",
      capabilities: ["findings_read", "task_management", "a2a_messaging"],
      heartbeat_interval: 30,
    });
    testAgentId = agent.id;

    const hasId = typeof agent.id === "string" && agent.id.length > 0;
    const hasName = agent.name === "[SIM-ARCH] Test Agent";
    const hasRole = agent.role === "custom";
    const hasState = typeof agent.state === "string";
    const hasCaps = Array.isArray(agent.capabilities) && agent.capabilities.length === 3;
    const passed = hasId && hasName && hasRole && hasState && hasCaps;

    return {
      name: "Agent Creation — POST returns valid agent",
      passed,
      detail: passed
        ? `id=${agent.id}, state=${agent.state}`
        : `id=${hasId}, name=${hasName}, role=${hasRole}, state=${hasState}, caps=${hasCaps}`,
    };
  });

  await safeCheck("Agent Creation — GET confirms persisted agent", async () => {
    if (!testAgentId) {
      return { name: "Agent Creation — GET confirms persisted agent", passed: false, detail: "No agent created" };
    }
    const agent = await api.get(`/api/agents/${testAgentId}`);
    const passed =
      agent.name === "[SIM-ARCH] Test Agent" &&
      agent.role === "custom" &&
      agent.system_prompt === "Architecture test agent created by simulation.";

    return {
      name: "Agent Creation — GET confirms persisted agent",
      passed,
      detail: passed
        ? `Confirmed: ${agent.name} (${agent.id})`
        : `name=${agent.name}, role=${agent.role}`,
    };
  });

  // ── Test 5: Agent Lifecycle ──
  // Pause/resume an agent, verify state transitions

  await safeCheck("Agent Lifecycle — pause sets state to paused", async () => {
    if (!testAgentId) {
      return { name: "Agent Lifecycle — pause sets state to paused", passed: false, detail: "No agent created" };
    }
    await api.post(`/api/agents/${testAgentId}/pause`, {});
    const agent = await api.get(`/api/agents/${testAgentId}`);
    const passed = agent.state === "paused";

    return {
      name: "Agent Lifecycle — pause sets state to paused",
      passed,
      detail: `state=${agent.state}`,
    };
  });

  await safeCheck("Agent Lifecycle — resume sets state to idle", async () => {
    if (!testAgentId) {
      return { name: "Agent Lifecycle — resume sets state to idle", passed: false, detail: "No agent created" };
    }
    await api.post(`/api/agents/${testAgentId}/resume`, {});
    const agent = await api.get(`/api/agents/${testAgentId}`);
    const passed = agent.state === "idle";

    return {
      name: "Agent Lifecycle — resume sets state to idle",
      passed,
      detail: `state=${agent.state}`,
    };
  });

  await safeCheck("Agent Lifecycle — update agent config", async () => {
    if (!testAgentId) {
      return { name: "Agent Lifecycle — update agent config", passed: false, detail: "No agent created" };
    }
    const updated = await api.patch(`/api/agents/${testAgentId}`, {
      system_prompt: "Updated by architecture test.",
    });
    const passed = updated.system_prompt === "Updated by architecture test.";

    return {
      name: "Agent Lifecycle — update agent config",
      passed,
      detail: passed ? "system_prompt updated" : `got: ${updated.system_prompt}`,
    };
  });

  // ── Test 6: A2A Messaging ──
  // Agent sends a message, recipient can read it

  let secondAgentId = null;
  await safeCheck("A2A Messaging — create second agent", async () => {
    const agent = await api.post("/api/agents", {
      name: "[SIM-ARCH] Recipient Agent",
      role: "custom",
      system_prompt: "Recipient agent for A2A test.",
      capabilities: ["a2a_messaging"],
      heartbeat_interval: 30,
    });
    secondAgentId = agent.id;

    return {
      name: "A2A Messaging — create second agent",
      passed: !!agent.id,
      detail: `id=${agent.id}`,
    };
  });

  let sentMessageId = null;
  await safeCheck("A2A Messaging — send directed message", async () => {
    if (!testAgentId || !secondAgentId) {
      return { name: "A2A Messaging — send directed message", passed: false, detail: "Missing agents" };
    }
    const msg = await api.post(`/api/agents/${testAgentId}/messages`, {
      to_agent_id: secondAgentId,
      message_type: "consult",
      content: "[SIM-ARCH] Architecture test message from sender to recipient",
    });
    sentMessageId = msg.id;

    const passed =
      !!msg.id &&
      msg.from_agent_id === testAgentId &&
      msg.to_agent_id === secondAgentId &&
      msg.content.includes("[SIM-ARCH]");

    return {
      name: "A2A Messaging — send directed message",
      passed,
      detail: passed ? `msg_id=${msg.id}` : `id=${!!msg.id}, from=${msg.from_agent_id}, to=${msg.to_agent_id}`,
    };
  });

  await safeCheck("A2A Messaging — recipient inbox contains message", async () => {
    if (!secondAgentId || !sentMessageId) {
      return { name: "A2A Messaging — recipient inbox contains message", passed: false, detail: "Missing agent or message" };
    }
    const inbox = await api.get(`/api/agents/${secondAgentId}/messages?limit=20`);
    const messages = inbox.messages || [];
    const found = messages.some(
      (m) => m.from_agent_id === testAgentId && m.content.includes("[SIM-ARCH]")
    );

    return {
      name: "A2A Messaging — recipient inbox contains message",
      passed: found,
      detail: `${messages.length} messages in inbox, target found=${found}`,
    };
  });

  await safeCheck("A2A Messaging — message in global A2A log", async () => {
    const log = await api.get("/api/agents/a2a/log?limit=50");
    const messages = log.messages || [];
    const found = messages.some((m) => m.content.includes("[SIM-ARCH] Architecture test message"));

    return {
      name: "A2A Messaging — message in global A2A log",
      passed: found,
      detail: `${messages.length} messages in log, target found=${found}`,
    };
  });

  // ── Test 7: Task Assignment ──
  // Create a task assigned to a specific agent, verify agent_id is set

  let taskId = null;
  await safeCheck("Task Assignment — create task with agent", async () => {
    if (!ctx.projectId) {
      return {
        name: "Task Assignment — create task with agent",
        passed: false,
        detail: "[warn] No project ID available — skipping task assignment test",
      };
    }
    if (!testAgentId) {
      return {
        name: "Task Assignment — create task with agent",
        passed: false,
        detail: "No agent created for assignment",
      };
    }
    const task = await api.post("/api/tasks", {
      project_id: ctx.projectId,
      title: "[SIM-ARCH] Architecture Task",
      description: "Task for agent architecture verification",
    });
    taskId = task.id;

    // Assign agent
    const updated = await api.patch(`/api/tasks/${task.id}`, {
      agent_id: testAgentId,
    });

    const passed = updated.agent_id === testAgentId;

    return {
      name: "Task Assignment — create task with agent",
      passed,
      detail: passed
        ? `task=${task.id}, agent=${testAgentId}`
        : `expected agent_id=${testAgentId}, got=${updated.agent_id}`,
    };
  });

  await safeCheck("Task Assignment — GET confirms agent_id persisted", async () => {
    if (!taskId || !testAgentId) {
      return {
        name: "Task Assignment — GET confirms agent_id persisted",
        passed: false,
        detail: "No task or agent available",
      };
    }
    const task = await api.get(`/api/tasks/${taskId}`);
    const passed = task.agent_id === testAgentId;

    return {
      name: "Task Assignment — GET confirms agent_id persisted",
      passed,
      detail: `agent_id=${task.agent_id}`,
    };
  });

  // ── Test 8: Orchestrator Status ──
  // GET /api/agents/status returns orchestrator state with agent list

  await safeCheck("Orchestrator Status — endpoint responds", async () => {
    const status = await api.get("/api/agents/status");

    const hasRunning = typeof status.running === "boolean";
    const hasAgents = Array.isArray(status.agents);
    const hasActiveCount = typeof status.active_count === "number";
    const hasPausedCount = typeof status.paused_count === "number";
    const hasResourceStatus = typeof status.resource_status === "object" && status.resource_status !== null;
    const hasRecentActions = Array.isArray(status.recent_actions);

    const passed = hasRunning && hasAgents && hasActiveCount && hasPausedCount && hasResourceStatus && hasRecentActions;

    return {
      name: "Orchestrator Status — endpoint responds",
      passed,
      detail: passed
        ? `running=${status.running}, agents=${status.agents.length}, active=${status.active_count}, paused=${status.paused_count}`
        : `running=${hasRunning}, agents=${hasAgents}, active=${hasActiveCount}, paused=${hasPausedCount}, resources=${hasResourceStatus}, actions=${hasRecentActions}`,
    };
  });

  await safeCheck("Orchestrator Status — resource_status structure", async () => {
    const status = await api.get("/api/agents/status");
    const rs = status.resource_status || {};

    const hasResources = typeof rs.resources === "object" && rs.resources !== null;
    const hasBudget = typeof rs.budget === "object" && rs.budget !== null;

    const passed = hasResources && hasBudget;

    return {
      name: "Orchestrator Status — resource_status structure",
      passed,
      detail: passed
        ? `resources keys: ${Object.keys(rs.resources).join(", ")}`
        : `resources=${hasResources}, budget=${hasBudget}`,
    };
  });

  // ── Test 9: Agent Export/Import ──
  // Export an agent config, import it as a new agent

  let importedAgentId = null;
  await safeCheck("Agent Export — returns portable config", async () => {
    if (!testAgentId) {
      return { name: "Agent Export — returns portable config", passed: false, detail: "No agent to export" };
    }
    const exported = await api.get(`/api/agents/${testAgentId}/export`);

    const hasVersion = typeof exported.reclaw_version === "string";
    const hasType = exported.type === "agent_config";
    const hasAgent = typeof exported.agent === "object" && exported.agent !== null;
    const agentData = exported.agent || {};
    const hasName = typeof agentData.name === "string";
    const hasRole = typeof agentData.role === "string";
    const hasPrompt = typeof agentData.system_prompt === "string";
    const hasCaps = Array.isArray(agentData.capabilities);

    const passed = hasVersion && hasType && hasAgent && hasName && hasRole && hasPrompt && hasCaps;

    return {
      name: "Agent Export — returns portable config",
      passed,
      detail: passed
        ? `version=${exported.reclaw_version}, agent.name=${agentData.name}`
        : `version=${hasVersion}, type=${hasType}, agent=${hasAgent}, name=${hasName}`,
    };
  });

  await safeCheck("Agent Import — creates agent from exported config", async () => {
    if (!testAgentId) {
      return { name: "Agent Import — creates agent from exported config", passed: false, detail: "No agent to export" };
    }
    // First export
    const exported = await api.get(`/api/agents/${testAgentId}/export`);
    const agentData = exported.agent;

    // Import with a modified name to avoid collision
    const imported = await api.post("/api/agents/import", {
      name: `${agentData.name} (imported)`,
      role: agentData.role,
      system_prompt: agentData.system_prompt,
      capabilities: agentData.capabilities,
      heartbeat_interval: agentData.heartbeat_interval,
      memory: agentData.memory || {},
    });
    importedAgentId = imported.id;

    const passed =
      !!imported.id &&
      imported.id !== testAgentId &&
      imported.name === `${agentData.name} (imported)` &&
      imported.role === agentData.role;

    return {
      name: "Agent Import — creates agent from exported config",
      passed,
      detail: passed
        ? `imported id=${imported.id}, name=${imported.name}`
        : `id=${!!imported.id}, different=${imported.id !== testAgentId}, name=${imported.name}`,
    };
  });

  await safeCheck("Agent Import — imported agent is retrievable", async () => {
    if (!importedAgentId) {
      return { name: "Agent Import — imported agent is retrievable", passed: false, detail: "No imported agent" };
    }
    const agent = await api.get(`/api/agents/${importedAgentId}`);
    const passed =
      agent.id === importedAgentId &&
      agent.name.includes("(imported)") &&
      typeof agent.state === "string";

    return {
      name: "Agent Import — imported agent is retrievable",
      passed,
      detail: passed
        ? `${agent.name}, state=${agent.state}`
        : `id match=${agent.id === importedAgentId}, name=${agent.name}`,
    };
  });

  // ── Test 10: Resource Governor ──
  // GET /api/resources returns capacity info

  await safeCheck("Resource Governor — endpoint responds", async () => {
    const status = await api.get("/api/resources");

    const hasResources = typeof status.resources === "object" && status.resources !== null;
    const hasBudget = typeof status.budget === "object" && status.budget !== null;
    const hasActiveAgents = typeof status.active_agents === "number";

    const passed = hasResources && hasBudget && hasActiveAgents;

    return {
      name: "Resource Governor — endpoint responds",
      passed,
      detail: passed
        ? `active_agents=${status.active_agents}, agent_ids=${(status.active_agent_ids || []).join(", ") || "none"}`
        : `resources=${hasResources}, budget=${hasBudget}, active_agents=${hasActiveAgents}`,
    };
  });

  await safeCheck("Resource Governor — resources have expected fields", async () => {
    const status = await api.get("/api/resources");
    const res = status.resources || {};

    const expectedFields = [
      "ram_total_gb",
      "ram_available_gb",
      "ram_used_pct",
      "cpu_cores",
      "cpu_load_pct",
      "disk_free_gb",
      "disk_used_pct",
    ];
    const missing = expectedFields.filter((f) => !(f in res));
    const allNumeric = expectedFields
      .filter((f) => f in res)
      .every((f) => typeof res[f] === "number");
    const passed = missing.length === 0 && allNumeric;

    return {
      name: "Resource Governor — resources have expected fields",
      passed,
      detail: passed
        ? `ram=${res.ram_available_gb.toFixed(1)}GB free, cpu=${res.cpu_cores} cores @ ${res.cpu_load_pct.toFixed(0)}%, disk=${res.disk_free_gb.toFixed(1)}GB free`
        : `missing: ${missing.join(", ")}, allNumeric=${allNumeric}`,
    };
  });

  await safeCheck("Resource Governor — budget has expected fields", async () => {
    const status = await api.get("/api/resources");
    const budget = status.budget || {};

    const expectedFields = [
      "max_concurrent_agents",
      "max_tasks_per_project",
      "max_queued_llm_requests",
      "throttle_delay_ms",
      "paused",
    ];
    const missing = expectedFields.filter((f) => !(f in budget));
    const passed = missing.length === 0;

    return {
      name: "Resource Governor — budget has expected fields",
      passed,
      detail: passed
        ? `max_agents=${budget.max_concurrent_agents}, max_tasks=${budget.max_tasks_per_project}, throttle=${budget.throttle_delay_ms}ms, paused=${budget.paused}`
        : `missing: ${missing.join(", ")}`,
    };
  });

  // ── Cleanup ──

  // Delete test task
  if (taskId) {
    try {
      await api.delete(`/api/tasks/${taskId}`);
    } catch {}
  }

  // Delete test agents (imported first, then originals)
  for (const agentId of [importedAgentId, secondAgentId, testAgentId]) {
    if (agentId) {
      try {
        await api.delete(`/api/agents/${agentId}`);
      } catch {}
    }
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
