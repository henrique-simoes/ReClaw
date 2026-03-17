/** Scenario 01 — Health Check: verify all services are reachable. */

export const name = "Health Check";
export const id = "01-health-check";

export async function run(ctx) {
  const { api, page, report } = ctx;
  const checks = [];

  // 1. Backend health
  try {
    const health = await api.get("/api/health");
    checks.push({ name: "Backend /api/health", passed: health.status === "healthy", detail: JSON.stringify(health) });
  } catch (e) {
    checks.push({ name: "Backend /api/health", passed: false, detail: e.message });
  }

  // 2. LLM provider status
  let llmConnected = false;
  try {
    const status = await api.get("/api/settings/status");
    llmConnected = status.services?.llm === "connected";
    checks.push({
      name: "LLM provider connected",
      passed: llmConnected,
      detail: `Provider: ${status.provider || "unknown"}, Model: ${status.config?.model || "unknown"}`,
    });
  } catch (e) {
    checks.push({ name: "LLM provider connected", passed: false, detail: e.message });
  }

  // 3. Frontend loads
  try {
    await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 15000 });
    const title = await page.title();
    checks.push({ name: "Frontend loads", passed: true, detail: `Title: ${title}` });
  } catch (e) {
    checks.push({ name: "Frontend loads", passed: false, detail: e.message });
  }

  // 4. No OllamaCheck blocker (frontend sees LLM as connected)
  const blockerVisible = await page.locator("text=LLM Provider Not Connected").isVisible().catch(() => false);
  checks.push({
    name: "No LLM blocker screen",
    passed: !blockerVisible,
    detail: blockerVisible ? "OllamaCheck screen is showing — LLM not reachable from frontend" : "Main UI loaded",
  });

  // 5. Skills API
  try {
    const skills = await api.get("/api/skills");
    const count = Array.isArray(skills) ? skills.length : skills?.skills?.length || 0;
    checks.push({ name: "Skills API responds", passed: count > 0, detail: `${count} skills loaded` });
  } catch (e) {
    checks.push({ name: "Skills API responds", passed: false, detail: e.message });
  }

  // 6. Scheduler API
  try {
    const schedules = await api.get("/api/schedules");
    checks.push({ name: "Scheduler API responds", passed: true, detail: `${schedules.length || 0} scheduled tasks` });
  } catch (e) {
    checks.push({ name: "Scheduler API responds", passed: false, detail: e.message });
  }

  // 7. Channels API
  try {
    const channels = await api.get("/api/channels");
    checks.push({ name: "Channels API responds", passed: true, detail: JSON.stringify(channels) });
  } catch (e) {
    checks.push({ name: "Channels API responds", passed: false, detail: e.message });
  }

  // Store LLM status in context for downstream scenarios
  ctx.llmConnected = llmConnected;

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`).join("\n"),
  };
}
