/** Scenario 24 — Context DAG: lossless summarization, expand, grep, health. */

export const name = "Context DAG (Lossless Summarization)";
export const id = "24-context-dag";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip — no project", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  // ── 1. Create a test chat session ──
  let sessionId = null;
  try {
    const session = await api.post("/api/sessions", {
      project_id: ctx.projectId,
      title: "[SIM] DAG Test Session",
    });
    sessionId = session.id;
    checks.push({ name: "Create test session", passed: !!sessionId, detail: `session=${sessionId}` });
  } catch (e) {
    checks.push({ name: "Create test session", passed: false, detail: e.message });
  }

  if (!sessionId) {
    return { checks, passed: checks.filter((c) => c.passed).length, failed: checks.filter((c) => !c.passed).length };
  }

  // ── 2. DAG Health API (empty session) ──
  try {
    const health = await api.get(`/api/context-dag/${sessionId}/health`);
    const hasFields = typeof health.total_messages === "number"
      && typeof health.fresh_tail_size === "number"
      && typeof health.dag_enabled === "boolean";
    checks.push({
      name: "DAG health API (empty session)",
      passed: hasFields,
      detail: `total=${health.total_messages}, dag_enabled=${health.dag_enabled}`,
    });
  } catch (e) {
    checks.push({ name: "DAG health API (empty session)", passed: false, detail: e.message });
  }

  // ── 3. DAG Structure API (empty session) ──
  try {
    const structure = await api.get(`/api/context-dag/${sessionId}`);
    const hasShape = "session_id" in structure && "nodes" in structure && "stats" in structure;
    checks.push({
      name: "DAG structure API (empty session)",
      passed: hasShape && structure.nodes.length === 0,
      detail: `nodes=${structure.nodes?.length || 0}`,
    });
  } catch (e) {
    checks.push({ name: "DAG structure API (empty session)", passed: false, detail: e.message });
  }

  // ── 4. Send enough messages to test compaction (via chat API) ──
  // Send messages directly via chat history (POST /chat would require LLM)
  // Instead, we test the compact endpoint which can be forced
  try {
    const compact = await api.post(`/api/context-dag/${sessionId}/compact`, {});
    const hasShape = "compacted" in compact;
    checks.push({
      name: "DAG compact API (force)",
      passed: hasShape,
      detail: `compacted=${compact.compacted}`,
    });
  } catch (e) {
    checks.push({ name: "DAG compact API (force)", passed: false, detail: e.message });
  }

  // ── 5. Grep API ──
  try {
    const grep = await api.post(`/api/context-dag/${sessionId}/grep`, { query: "test" });
    const hasShape = "query" in grep && "results" in grep;
    checks.push({
      name: "DAG grep API",
      passed: hasShape,
      detail: `results=${grep.results?.length || 0}`,
    });
  } catch (e) {
    checks.push({ name: "DAG grep API", passed: false, detail: e.message });
  }

  // ── 6. Navigate to Memory → Context History in UI ──
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Select the project
  const projectBtn = page.locator("text=[SIM]").first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Memory nav
  const memoryNav = page.locator('button[aria-label="Memory"]').first();
  if (await memoryNav.isVisible({ timeout: 3000 }).catch(() => false)) {
    await memoryNav.click();
    await page.waitForTimeout(1000);

    // ── 7. Switch to Context History tab ──
    const dagTab = page.locator('button[aria-label="Switch to Context History tab"]').first();
    const dagTabVisible = await dagTab.isVisible({ timeout: 3000 }).catch(() => false);
    checks.push({ name: "Context History tab visible", passed: dagTabVisible, detail: "" });

    if (dagTabVisible) {
      await dagTab.click();
      await page.waitForTimeout(1500);
      await screenshot("24-context-dag-tab");

      // ── 8. Verify header or content rendered ──
      const dagHeader = page.locator('text=Context History').first();
      const headerVisible = await dagHeader.isVisible({ timeout: 2000 }).catch(() => false);
      checks.push({ name: "Context History content rendered", passed: headerVisible, detail: "" });

      // ── 9. Verify search input exists ──
      const searchInput = page.locator('input[aria-label="Search conversation history"]').first();
      const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
      checks.push({ name: "History search input visible", passed: searchVisible, detail: "" });

      // ── 10. Verify health cards ──
      const healthCard = page.locator('text=Fresh Tail').first();
      const healthVisible = await healthCard.isVisible({ timeout: 2000 }).catch(() => false);
      checks.push({ name: "DAG health cards visible", passed: healthVisible, detail: "" });
    }
  } else {
    checks.push({ name: "Memory nav not visible", passed: false, detail: "Could not navigate to Memory" });
  }

  await screenshot("24-context-dag-final");

  // ── Cleanup: delete test session ──
  try {
    await api.delete(`/api/sessions/${sessionId}`);
  } catch { /* best effort */ }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
