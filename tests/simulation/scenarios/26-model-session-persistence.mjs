/** Scenario 26 — Model & Session Persistence: model switching, .env persistence, session survival. */

export const name = "Model & Session Persistence";
export const id = "26-model-session-persistence";

export async function run(ctx) {
  const { api } = ctx;
  const checks = [];

  // ── 1. System status reports correct provider and model ──
  let initialModel = null;
  let provider = null;
  try {
    const status = await api.get("/api/settings/status");
    provider = status.provider;
    initialModel = status.config?.model;
    checks.push({
      name: "System reports active model",
      passed: !!initialModel && initialModel !== "default",
      detail: `provider=${provider}, model=${initialModel}`,
    });
  } catch (e) {
    checks.push({ name: "System reports active model", passed: false, detail: e.message });
  }

  // ── 2. Model list returns available models ──
  let models = [];
  try {
    const mdl = await api.get("/api/settings/models");
    models = mdl.models || [];
    checks.push({
      name: "Model list available",
      passed: models.length > 0,
      detail: `count=${models.length}, status=${mdl.status}`,
    });
  } catch (e) {
    checks.push({ name: "Model list available", passed: false, detail: e.message });
  }

  // ── 3. Active model is in model list (not "default" placeholder) ──
  if (initialModel && models.length > 0) {
    const modelNames = models.map((m) => m.name || m.id);
    const modelInList = modelNames.some((n) => n === initialModel || n.includes(initialModel));
    checks.push({
      name: "Active model exists in model list",
      passed: modelInList,
      detail: modelInList ? `${initialModel} found` : `${initialModel} NOT in [${modelNames.join(", ")}]`,
    });
  }

  // ── 4. Switch model via API (pick a different one if available) ──
  let switchedModel = null;
  if (models.length > 0) {
    const targetModel = models[0].name || models[0].id;
    try {
      const result = await api.post(`/api/settings/model?model_name=${encodeURIComponent(targetModel)}`, {});
      switchedModel = result.model;
      checks.push({
        name: "Switch model via API",
        passed: result.status === "switched" && result.persisted === true,
        detail: `model=${result.model}, persisted=${result.persisted}`,
      });
    } catch (e) {
      checks.push({ name: "Switch model via API", passed: false, detail: e.message });
    }
  }

  // ── 5. Verify model switch reflected in status ──
  if (switchedModel) {
    try {
      const status = await api.get("/api/settings/status");
      checks.push({
        name: "Model switch reflected in status",
        passed: status.config?.model === switchedModel,
        detail: `expected=${switchedModel}, got=${status.config?.model}`,
      });
    } catch (e) {
      checks.push({ name: "Model switch reflected in status", passed: false, detail: e.message });
    }
  }

  // ── 6. Restore original model ──
  if (initialModel && switchedModel && initialModel !== switchedModel) {
    try {
      await api.post(`/api/settings/model?model_name=${encodeURIComponent(initialModel)}`, {});
      checks.push({ name: "Restore original model", passed: true, detail: `restored=${initialModel}` });
    } catch (e) {
      checks.push({ name: "Restore original model", passed: false, detail: e.message });
    }
  }

  // ── 7. Inference presets endpoint works ──
  try {
    const presets = await api.get("/api/inference-presets");
    const keys = Object.keys(presets.presets || {});
    const hasRequired = ["lightweight", "medium", "high", "custom"].every((k) => keys.includes(k));
    checks.push({
      name: "Inference presets available",
      passed: hasRequired,
      detail: `keys=${keys.join(",")}`,
    });
  } catch (e) {
    checks.push({ name: "Inference presets available", passed: false, detail: e.message });
  }

  // ── 8. Session CRUD with persistence ──
  let projectId = null;
  let sessionId = null;

  try {
    const project = await api.post("/api/projects", {
      name: "[SIM] Session Persistence Test",
      description: "Testing session persistence",
    });
    projectId = project.id;
  } catch (e) {
    checks.push({ name: "Create test project for sessions", passed: false, detail: e.message });
  }

  if (projectId) {
    // Create session
    try {
      const session = await api.post("/api/sessions", {
        project_id: projectId,
        title: "[SIM] Persistent Session",
        inference_preset: "high",
      });
      sessionId = session.id;
      checks.push({
        name: "Create session with preset",
        passed: !!sessionId && session.inference_preset === "high",
        detail: `id=${sessionId}, preset=${session.inference_preset}`,
      });
    } catch (e) {
      checks.push({ name: "Create session with preset", passed: false, detail: e.message });
    }

    // List sessions — session should persist
    try {
      const result = await api.get(`/api/sessions/${projectId}`);
      const sessions = result.sessions || [];
      const found = sessions.find((s) => s.id === sessionId);
      checks.push({
        name: "Session persisted in list",
        passed: !!found,
        detail: `found=${!!found}, total=${sessions.length}`,
      });
    } catch (e) {
      checks.push({ name: "Session persisted in list", passed: false, detail: e.message });
    }

    // Update session with model override
    if (sessionId && initialModel) {
      try {
        const updated = await api.patch(`/api/sessions/${sessionId}`, {
          model_override: initialModel,
          inference_preset: "custom",
          custom_temperature: 0.5,
          custom_max_tokens: 2048,
        });
        checks.push({
          name: "Update session model override",
          passed: updated.model_override === initialModel && updated.inference_preset === "custom",
          detail: `model=${updated.model_override}, preset=${updated.inference_preset}`,
        });
      } catch (e) {
        checks.push({ name: "Update session model override", passed: false, detail: e.message });
      }
    }

    // Star session
    if (sessionId) {
      try {
        const star = await api.post(`/api/sessions/${sessionId}/star`, {});
        checks.push({
          name: "Star session toggle",
          passed: star.starred === true,
          detail: `starred=${star.starred}`,
        });
      } catch (e) {
        checks.push({ name: "Star session toggle", passed: false, detail: e.message });
      }
    }

    // Ensure-default creates a session if none exist after deletion
    try {
      const defaultSession = await api.get(`/api/sessions/${projectId}/ensure-default`);
      checks.push({
        name: "Ensure default session",
        passed: !!defaultSession.id,
        detail: `id=${defaultSession.id}`,
      });
    } catch (e) {
      checks.push({ name: "Ensure default session", passed: false, detail: e.message });
    }

    // Delete session
    if (sessionId) {
      try {
        const res = await api.delete(`/api/sessions/${sessionId}`);
        checks.push({
          name: "Delete session",
          passed: res.status === 204,
          detail: `status=${res.status}`,
        });
      } catch (e) {
        checks.push({ name: "Delete session", passed: false, detail: e.message });
      }

      // Verify session actually gone
      try {
        const res = await fetch(`http://localhost:8000/api/sessions/detail/${sessionId}`);
        checks.push({
          name: "Session deletion confirmed (404)",
          passed: res.status === 404,
          detail: `status=${res.status}`,
        });
      } catch (e) {
        checks.push({ name: "Session deletion confirmed (404)", passed: false, detail: e.message });
      }
    }

    // Clean up project
    try {
      await api.delete(`/api/projects/${projectId}`);
    } catch {
      // Ignore cleanup errors
    }
  }

  // ── 9. Provider detection is consistent ──
  try {
    const status = await api.get("/api/settings/status");
    checks.push({
      name: "Provider consistent after operations",
      passed: status.provider === provider,
      detail: `expected=${provider}, got=${status.provider}`,
    });
  } catch (e) {
    checks.push({ name: "Provider consistent after operations", passed: false, detail: e.message });
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
