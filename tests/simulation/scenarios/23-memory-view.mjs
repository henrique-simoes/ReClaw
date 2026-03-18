/** Scenario 23 — Memory View: API endpoints, UI navigation, hybrid search, health. */

export const name = "Memory View & Knowledge Base";
export const id = "23-memory-view";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip — no project", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  // ── 1. Memory Stats API ──
  try {
    const stats = await api.get(`/api/memory/${ctx.projectId}/stats`);
    const hasFields = typeof stats.vector_chunks === "number"
      && typeof stats.keyword_chunks === "number"
      && typeof stats.embedding_model === "string"
      && typeof stats.chunk_size === "number"
      && typeof stats.chunk_overlap === "number"
      && stats.hybrid_weights != null;
    checks.push({ name: "Memory stats API", passed: hasFields, detail: `vectors=${stats.vector_chunks}, keywords=${stats.keyword_chunks}, model=${stats.embedding_model}` });
  } catch (e) {
    checks.push({ name: "Memory stats API", passed: false, detail: e.message });
  }

  // ── 2. Memory List API ──
  try {
    const list = await api.get(`/api/memory/${ctx.projectId}?page=1&page_size=10`);
    const hasShape = "chunks" in list && "total" in list && "page" in list;
    checks.push({ name: "Memory list API", passed: hasShape, detail: `total=${list.total}, returned=${list.chunks?.length || 0}` });
  } catch (e) {
    checks.push({ name: "Memory list API", passed: false, detail: e.message });
  }

  // ── 3. Memory Search API ──
  try {
    const search = await api.get(`/api/memory/${ctx.projectId}/search?query=interview&top_k=5`);
    const hasShape = "results" in search && "query" in search;
    checks.push({ name: "Memory search API", passed: hasShape, detail: `results=${search.results?.length || 0}` });
  } catch (e) {
    checks.push({ name: "Memory search API", passed: false, detail: e.message });
  }

  // ── 4. Agent Notes API ──
  try {
    const notes = await api.get(`/api/memory/${ctx.projectId}/agent/reclaw-main/notes`);
    const hasShape = "agent_id" in notes && "notes" in notes;
    checks.push({ name: "Agent notes API", passed: hasShape, detail: `notes=${notes.notes?.length || 0}` });
  } catch (e) {
    checks.push({ name: "Agent notes API", passed: false, detail: e.message });
  }

  // ── 5. Vector Health API ──
  try {
    const health = await api.get("/api/settings/vector-health");
    const hasStatus = typeof health.status === "string";
    checks.push({ name: "Vector health API", passed: hasStatus, detail: `status=${health.status}` });
  } catch (e) {
    checks.push({ name: "Vector health API", passed: false, detail: e.message });
  }

  // ── 6. Navigate to Memory View in UI ──
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Select the [SIM] project first
  const projectBtn = page.locator("text=[SIM]").first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Memory nav (brain icon)
  const memoryNav = page.locator('button[aria-label="Memory"]').first();
  const memoryNavVisible = await memoryNav.isVisible({ timeout: 3000 }).catch(() => false);
  checks.push({ name: "Memory nav button visible", passed: memoryNavVisible, detail: "" });

  if (memoryNavVisible) {
    await memoryNav.click();
    await page.waitForTimeout(1500);
    await screenshot("23-memory-view");

    // ── 7. Verify Memory header rendered ──
    const memoryHeader = page.locator('h2:has-text("Memory")').first();
    const headerVisible = await memoryHeader.isVisible({ timeout: 3000 }).catch(() => false);
    checks.push({ name: "Memory header visible", passed: headerVisible, detail: "" });

    // ── 8. Verify Knowledge Base tab is active ──
    const kbTab = page.locator('button[aria-label="Switch to Knowledge Base tab"]').first();
    const kbTabVisible = await kbTab.isVisible({ timeout: 2000 }).catch(() => false);
    checks.push({ name: "Knowledge Base tab visible", passed: kbTabVisible, detail: "" });

    // ── 9. Verify search input ──
    const searchInput = page.locator('input[aria-label="Search knowledge base"]').first();
    const searchVisible = await searchInput.isVisible({ timeout: 2000 }).catch(() => false);
    checks.push({ name: "KB search input visible", passed: searchVisible, detail: "" });

    // ── 10. Switch to Agent Memory tab ──
    const agentTab = page.locator('button[aria-label="Switch to Agent Memory tab"]').first();
    if (await agentTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await agentTab.click();
      await page.waitForTimeout(1000);
      await screenshot("23-agent-memory-tab");
      checks.push({ name: "Agent Memory tab navigable", passed: true, detail: "" });
    } else {
      checks.push({ name: "Agent Memory tab navigable", passed: false, detail: "Tab not visible" });
    }

    // ── 11. Switch to Health tab ──
    const healthTab = page.locator('button[aria-label="Switch to Health tab"]').first();
    if (await healthTab.isVisible({ timeout: 2000 }).catch(() => false)) {
      await healthTab.click();
      await page.waitForTimeout(1500);
      await screenshot("23-health-tab");

      // Verify health data loaded
      const embedModelLabel = page.locator('text=Embedding Model').first();
      const embedVisible = await embedModelLabel.isVisible({ timeout: 3000 }).catch(() => false);
      checks.push({ name: "Health tab shows embedding model", passed: embedVisible, detail: "" });

      // Verify hybrid weights section
      const vectorWeightLabel = page.locator('text=Vector Weight').first();
      const weightVisible = await vectorWeightLabel.isVisible({ timeout: 2000 }).catch(() => false);
      checks.push({ name: "Health tab shows hybrid weights", passed: weightVisible, detail: "" });
    } else {
      checks.push({ name: "Health tab navigable", passed: false, detail: "Tab not visible" });
    }

    // ── 12. Keyboard shortcut Cmd+8 ──
    // Navigate away first, then use shortcut
    const chatNav = page.locator('button[aria-label="Chat"]').first();
    if (await chatNav.isVisible({ timeout: 2000 }).catch(() => false)) {
      await chatNav.click();
      await page.waitForTimeout(500);
    }
    await page.keyboard.press("Meta+8");
    await page.waitForTimeout(1000);
    const memoryAfterShortcut = page.locator('h2:has-text("Memory")').first();
    const shortcutWorked = await memoryAfterShortcut.isVisible({ timeout: 2000 }).catch(() => false);
    checks.push({ name: "Cmd+8 keyboard shortcut to Memory", passed: shortcutWorked, detail: "" });

    await screenshot("23-memory-shortcut");
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
