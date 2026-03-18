/** Scenario 02 — Onboarding: full wizard walkthrough or project creation. */

export const name = "Onboarding & Project Setup";
export const id = "02-onboarding";

const PROJECT_NAME = "[SIM] Onboarding Redesign Study";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  // Clean up only SIM projects from prior runs (don't delete user projects)
  const existing = await api.get("/api/projects");
  for (const p of existing) {
    if (p.name?.startsWith("[SIM]") || p.name?.startsWith("[SIM-")) {
      await api.delete(`/api/projects/${p.id}`);
    }
  }

  // Navigate to home — should trigger onboarding if no projects
  await page.goto("http://localhost:3000", { waitUntil: "networkidle", timeout: 15000 });
  await page.waitForTimeout(3000);

  // Check if onboarding wizard appeared
  const wizardVisible = await page.locator("text=Welcome to ReClaw").isVisible().catch(() => false);

  if (wizardVisible) {
    checks.push({ name: "Onboarding wizard appears", passed: true, detail: "Wizard detected" });
    await screenshot("02-onboarding-wizard");

    // Step 0: Welcome — click "Get Started"
    const getStarted = page.locator("button:has-text('Get Started')");
    if (await getStarted.isVisible()) {
      await getStarted.click();
      await page.waitForTimeout(500);
      checks.push({ name: "Welcome step: Get Started clicked", passed: true, detail: "" });
    }

    // Step 1: Create Project
    const projectInput = page.locator('input[placeholder*="Onboarding"]').or(page.locator('input[placeholder*="project"]')).first();
    if (await projectInput.isVisible({ timeout: 3000 }).catch(() => false)) {
      await projectInput.fill(PROJECT_NAME);
      const createBtn = page.locator("button:has-text('Create')").first();
      await createBtn.click();
      await page.waitForTimeout(1000);
      checks.push({ name: "Project created via wizard", passed: true, detail: PROJECT_NAME });
    }

    // Step 2: Set Context (if visible)
    const contextArea = page.locator("textarea").first();
    if (await contextArea.isVisible({ timeout: 2000 }).catch(() => false)) {
      await contextArea.fill(
        "TechStart Inc — B2B SaaS project management platform.\n" +
        "Target: mid-market teams (50-500 employees).\n" +
        "Culture: data-driven, move fast, user-centric.\n" +
        "Key stakeholders: PM (Maria), Eng Lead (James)."
      );
      const saveBtn = page.locator("button:has-text('Save'), button:has-text('Continue')").first();
      if (await saveBtn.isVisible()) await saveBtn.click();
      await page.waitForTimeout(500);
      checks.push({ name: "Context filled in wizard", passed: true, detail: "" });
    }

    // Step 3: Upload or Skip
    const skipBtn = page.locator("button:has-text('Skip'), button:has-text('Start Researching'), button:has-text('Done')").first();
    if (await skipBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await skipBtn.click();
      await page.waitForTimeout(1000);
    }

    await screenshot("02-onboarding-complete");
  } else {
    checks.push({ name: "Onboarding wizard appears", passed: false, detail: "Wizard did not appear — creating project via API" });

    // Fallback: create project via API
    const project = await api.post("/api/projects", { name: PROJECT_NAME, description: "Simulation test project for automated QA" });
    ctx.projectId = project.id;
    checks.push({ name: "Project created via API fallback", passed: !!project.id, detail: project.id });
  }

  // Verify project exists
  const projects = await api.get("/api/projects");
  const simProject = projects.find((p) => p.name === PROJECT_NAME);
  if (simProject) {
    ctx.projectId = simProject.id;
    checks.push({ name: "Project exists in API", passed: true, detail: `ID: ${simProject.id}` });
  } else {
    checks.push({ name: "Project exists in API", passed: false, detail: "Not found after creation" });
  }

  // Verify project appears in sidebar
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const sidebarProject = await page.locator(`text=${PROJECT_NAME}`).isVisible().catch(() => false);
  checks.push({ name: "Project visible in sidebar", passed: sidebarProject, detail: "" });
  await screenshot("02-project-in-sidebar");

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
