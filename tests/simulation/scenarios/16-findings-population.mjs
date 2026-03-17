/** Scenario 16 — Findings Population: create nuggets, facts, insights, recommendations via API. */

export const name = "Findings Population";
export const id = "16-findings-population";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip — no project", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  // 1. Create nuggets
  const nuggetIds = [];
  const nuggets = [
    { text: "[SIM] User struggled to find the search function on mobile", source: "Interview P001", source_location: "00:03:45", tags: ["usability", "mobile", "search"], phase: "discover", confidence: 0.9 },
    { text: "[SIM] 6 of 8 participants completed onboarding in under 2 minutes", source: "Usability Test Round 1", source_location: "Task 1", tags: ["onboarding", "performance"], phase: "discover", confidence: 0.95 },
    { text: "[SIM] User quote: 'I wish I could save my research templates'", source: "Interview P003", source_location: "00:12:30", tags: ["templates", "feature-request"], phase: "discover", confidence: 0.85 },
    { text: "[SIM] 72% of survey respondents rate the dashboard as easy to use", source: "Survey Q5", source_location: "Row 15", tags: ["dashboard", "satisfaction"], phase: "discover", confidence: 0.8 },
  ];

  for (const nugget of nuggets) {
    try {
      const created = await api.post(`/api/findings/nuggets`, { ...nugget, project_id: ctx.projectId });
      if (created.id) nuggetIds.push(created.id);
      checks.push({
        name: `Create nugget: ${nugget.text.substring(6, 50)}...`,
        passed: !!created.id,
        detail: `id=${created.id}`,
      });
    } catch (e) {
      checks.push({ name: `Create nugget: ${nugget.text.substring(6, 40)}...`, passed: false, detail: e.message });
    }
  }

  // 2. Create facts from nuggets
  const factIds = [];
  const facts = [
    {
      text: "[SIM] Mobile search discoverability is a recurring pain point",
      nugget_ids: nuggetIds.slice(0, 2),
      phase: "define",
      confidence: 0.85,
    },
    {
      text: "[SIM] Onboarding flow is performant but templates are a gap",
      nugget_ids: nuggetIds.slice(1, 4),
      phase: "define",
      confidence: 0.8,
    },
  ];

  for (const fact of facts) {
    try {
      const created = await api.post(`/api/findings/facts`, { ...fact, project_id: ctx.projectId });
      if (created.id) factIds.push(created.id);
      checks.push({
        name: `Create fact: ${fact.text.substring(6, 50)}...`,
        passed: !!created.id,
        detail: `id=${created.id}, nuggets=${fact.nugget_ids.length}`,
      });
    } catch (e) {
      checks.push({ name: `Create fact: ${fact.text.substring(6, 40)}...`, passed: false, detail: e.message });
    }
  }

  // 3. Create insights from facts
  const insightIds = [];
  const insights = [
    {
      text: "[SIM] Navigation patterns need redesign for mobile-first users who rely on search as primary navigation",
      fact_ids: factIds.slice(0, 1),
      phase: "define",
      confidence: 0.8,
      impact: "high",
    },
    {
      text: "[SIM] Template functionality is a high-value addition that would reduce repeated setup work",
      fact_ids: factIds.slice(1, 2),
      phase: "define",
      confidence: 0.75,
      impact: "medium",
    },
  ];

  for (const insight of insights) {
    try {
      const created = await api.post(`/api/findings/insights`, { ...insight, project_id: ctx.projectId });
      if (created.id) insightIds.push(created.id);
      checks.push({
        name: `Create insight: ${insight.text.substring(6, 50)}...`,
        passed: !!created.id,
        detail: `id=${created.id}, impact=${insight.impact}`,
      });
    } catch (e) {
      checks.push({ name: `Create insight: ${insight.text.substring(6, 40)}...`, passed: false, detail: e.message });
    }
  }

  // 4. Create recommendations
  const recommendations = [
    {
      text: "[SIM] Add persistent search icon to mobile navigation bar with autocomplete",
      insight_ids: insightIds.slice(0, 1),
      phase: "develop",
      priority: "high",
      effort: "medium",
      status: "proposed",
    },
    {
      text: "[SIM] Build research template system with save/load/share functionality",
      insight_ids: insightIds.slice(1, 2),
      phase: "develop",
      priority: "medium",
      effort: "large",
      status: "proposed",
    },
  ];

  for (const rec of recommendations) {
    try {
      const created = await api.post(`/api/findings/recommendations`, { ...rec, project_id: ctx.projectId });
      checks.push({
        name: `Create recommendation: ${rec.text.substring(6, 50)}...`,
        passed: !!created.id,
        detail: `id=${created.id}, priority=${rec.priority}`,
      });
    } catch (e) {
      checks.push({ name: `Create recommendation: ${rec.text.substring(6, 40)}...`, passed: false, detail: e.message });
    }
  }

  // 5. Verify summary
  try {
    const summary = await api.get(`/api/findings/summary/${ctx.projectId}`);
    const totals = summary.totals || {};
    checks.push({
      name: "Findings summary API",
      passed: (totals.nuggets || 0) >= 4 && (totals.facts || 0) >= 2 && (totals.insights || 0) >= 2 && (totals.recommendations || 0) >= 2,
      detail: `N=${totals.nuggets} F=${totals.facts} I=${totals.insights} R=${totals.recommendations}`,
    });
  } catch (e) {
    checks.push({ name: "Findings summary API", passed: false, detail: e.message });
  }

  // 6. UI — navigate to Findings view
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  const projectBtn = page.locator("text=[SIM]").first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(1000);
  }

  await page.keyboard.press("Meta+2");
  await page.waitForTimeout(2000);

  // Check that findings view loaded (look for any findings-related text)
  const findingsVisible = await page.locator("text=Nuggets").isVisible({ timeout: 3000 }).catch(() => false)
    || await page.locator("text=nuggets").isVisible({ timeout: 1000 }).catch(() => false)
    || await page.locator("text=Findings").isVisible({ timeout: 1000 }).catch(() => false)
    || await page.locator("text=Discover").isVisible({ timeout: 1000 }).catch(() => false)
    || await page.locator("text=Define").isVisible({ timeout: 1000 }).catch(() => false);

  checks.push({
    name: "Findings view loads with data",
    passed: findingsVisible,
    detail: "",
  });
  await screenshot("16-findings-populated");

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
