/** Scenario 03 — Project Setup: fill context layers via UI. */

export const name = "Project Context Setup";
export const id = "03-project-setup";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip", passed: false, detail: "No project created in scenario 02" }], passed: 0, failed: 1 };
  }

  // Navigate to Context view
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Select the simulation project in sidebar
  const projectBtn = page.locator(`text=[SIM]`).first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Context nav
  const contextNav = page.locator('button[aria-label="Context"]').first();
  await contextNav.click();
  await page.waitForTimeout(1500);
  await screenshot("03-context-view");

  // Check Context Editor loaded
  const contextHeading = await page.locator("text=Project Context").isVisible().catch(() => false);
  checks.push({ name: "Context editor loads", passed: contextHeading, detail: "" });

  // Fill Company Context
  const companySection = page.locator("text=Company Context").first();
  if (await companySection.isVisible({ timeout: 3000 }).catch(() => false)) {
    // Find the textarea near the company section
    const companyTextarea = page.locator("textarea").first();
    if (await companyTextarea.isVisible()) {
      await companyTextarea.fill(
        "TechStart Inc — B2B SaaS project management platform for mid-market teams (50-500 employees).\n\n" +
        "Product: TaskFlow — helps teams plan sprints, track progress, and collaborate on deliverables.\n" +
        "Users: Product managers, engineering leads, designers, and project coordinators.\n" +
        "Culture: Data-driven, move fast, user-centric. Ship weekly, measure everything.\n" +
        "Key stakeholders: Maria (PM), James (Eng Lead), Priya (Design Lead).\n" +
        "Competitors: Asana, Monday.com, Linear, Jira.\n" +
        "Current NPS: 32 (target: 45 by Q3)."
      );
      checks.push({ name: "Company context filled", passed: true, detail: "" });
    }
  }

  // Click Save
  const saveBtn = page.locator("button:has-text('Save')").first();
  if (await saveBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await saveBtn.click();
    await page.waitForTimeout(1000);
    checks.push({ name: "Context saved", passed: true, detail: "" });
  }

  await screenshot("03-context-saved");

  // Verify via API
  try {
    const project = await api.get(`/api/projects/${ctx.projectId}`);
    const hasContext = project.company_context || project.context;
    checks.push({
      name: "Context persisted in API",
      passed: !!hasContext,
      detail: hasContext ? "Context data found" : "No context data in project",
    });
  } catch (e) {
    checks.push({ name: "Context persisted in API", passed: false, detail: e.message });
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
