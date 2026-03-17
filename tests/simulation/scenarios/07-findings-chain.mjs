/** Scenario 07 — Findings Chain: verify Atomic Research Nuggets → Facts → Insights → Recs. */

export const name = "Findings & Atomic Research";
export const id = "07-findings-chain";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  // Navigate to Findings
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Select project
  const projectBtn = page.locator("text=[SIM]").first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);
  }

  const findingsNav = page.locator('button[aria-label="Findings"]').first();
  await findingsNav.click();
  await page.waitForTimeout(1500);

  // Verify Findings view loads
  const findingsVisible = await page.locator("text=Findings").first().isVisible().catch(() => false);
  checks.push({ name: "Findings view loads", passed: findingsVisible, detail: "" });
  await screenshot("07-findings-view");

  // Check phase tabs
  const phaseTabs = ["Discover", "Define", "Develop", "Deliver"];
  for (const phase of phaseTabs) {
    const tab = page.locator(`button:has-text("${phase}")`).first();
    const visible = await tab.isVisible({ timeout: 1000 }).catch(() => false);
    checks.push({ name: `Phase tab: ${phase}`, passed: visible, detail: "" });
  }

  // Check summary stats cards (Nuggets, Facts, Insights, Recommendations)
  const statLabels = ["Nuggets", "Facts", "Insights", "Recommendations"];
  for (const label of statLabels) {
    const stat = await page.locator(`text=${label}`).first().isVisible({ timeout: 1000 }).catch(() => false);
    checks.push({ name: `Stats card: ${label}`, passed: stat, detail: "" });
  }

  // Check collapsible sections
  const sections = ["Insights", "Recommendations", "Facts", "Nuggets"];
  for (const section of sections) {
    const sectionHeader = page.locator(`text=${section}`).first();
    if (await sectionHeader.isVisible({ timeout: 1000 }).catch(() => false)) {
      await sectionHeader.click();
      await page.waitForTimeout(300);
    }
  }
  await screenshot("07-findings-expanded");

  // Verify findings via API
  const findingTypes = [
    { name: "nuggets", endpoint: `/api/findings/nuggets?project_id=${ctx.projectId}` },
    { name: "facts", endpoint: `/api/findings/facts?project_id=${ctx.projectId}` },
    { name: "insights", endpoint: `/api/findings/insights?project_id=${ctx.projectId}` },
    { name: "recommendations", endpoint: `/api/findings/recommendations?project_id=${ctx.projectId}` },
  ];

  const counts = {};
  for (const ft of findingTypes) {
    try {
      const results = await api.get(ft.endpoint);
      const count = Array.isArray(results) ? results.length : 0;
      counts[ft.name] = count;
      checks.push({ name: `API: ${ft.name}`, passed: true, detail: `${count} ${ft.name}` });
    } catch (e) {
      counts[ft.name] = 0;
      checks.push({ name: `API: ${ft.name}`, passed: false, detail: e.message });
    }
  }

  // Check if any findings exist (they may not if LLM hasn't processed yet)
  const totalFindings = Object.values(counts).reduce((a, b) => a + b, 0);
  checks.push({
    name: "Findings exist in database",
    passed: totalFindings > 0 || !ctx.llmConnected,
    detail: totalFindings > 0 ? `${totalFindings} total findings` : "No findings yet (LLM may not have processed uploads)",
  });

  // Summary endpoint
  try {
    const summary = await api.get(`/api/findings/summary/${ctx.projectId}`);
    checks.push({ name: "Summary API responds", passed: true, detail: JSON.stringify(summary).substring(0, 80) });
  } catch (e) {
    checks.push({ name: "Summary API responds", passed: false, detail: e.message });
  }

  // Test phase tab switching in UI
  for (const phase of phaseTabs) {
    const tab = page.locator(`button:has-text("${phase}")`).first();
    if (await tab.isVisible({ timeout: 1000 }).catch(() => false)) {
      await tab.click();
      await page.waitForTimeout(500);
    }
  }
  await screenshot("07-phase-switching");

  // Check right panel — Evidence Chain
  const evidenceChain = await page.locator("text=Evidence Chain").isVisible().catch(() => false);
  checks.push({ name: "Evidence Chain panel visible", passed: evidenceChain, detail: "" });

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`).join("\n"),
  };
}
