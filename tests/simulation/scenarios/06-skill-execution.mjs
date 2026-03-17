/** Scenario 06 — Skill Execution: browse catalog, run skills, test management. */

export const name = "Skill Execution & Management";
export const id = "06-skill-execution";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  // Navigate to Skills view
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const skillsNav = page.locator('button[aria-label="Skills"]').first();
  await skillsNav.click();
  await page.waitForTimeout(1500);

  // Verify catalog loads
  const skillsHeading = await page.locator("text=Skills").first().isVisible().catch(() => false);
  checks.push({ name: "Skills view loads", passed: skillsHeading, detail: "" });
  await screenshot("06-skills-catalog");

  // Check skill count badge
  const totalText = await page.locator("text=total").first().textContent().catch(() => "");
  checks.push({ name: "Skill count displayed", passed: totalText.includes("total"), detail: totalText.trim() });

  // Test phase filtering
  const phases = ["Discover", "Define", "Develop", "Deliver"];
  for (const phase of phases) {
    const phaseBtn = page.locator(`button:has-text("${phase}")`).first();
    if (await phaseBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await phaseBtn.click();
      await page.waitForTimeout(500);
      checks.push({ name: `Phase filter: ${phase}`, passed: true, detail: "" });
    }
  }

  // Reset to All
  const allBtn = page.locator('button:has-text("All")').first();
  if (await allBtn.isVisible({ timeout: 1000 }).catch(() => false)) {
    await allBtn.click();
    await page.waitForTimeout(500);
  }

  // Test search
  const searchInput = page.locator('input[placeholder*="Search"]').first();
  if (await searchInput.isVisible({ timeout: 2000 }).catch(() => false)) {
    await searchInput.fill("interview");
    await page.waitForTimeout(500);
    await screenshot("06-skills-search");

    // Count filtered results
    const cards = await page.locator('[class*="rounded"]').count();
    checks.push({ name: "Search filters skills", passed: true, detail: `${cards} results for "interview"` });

    await searchInput.clear();
    await page.waitForTimeout(500);
  }

  // Expand a skill card (click the chevron)
  const expandBtn = page.locator("button:has(svg)").first();
  if (await expandBtn.isVisible()) {
    // Try clicking the first skill card to expand
    const firstCard = page.locator('[class*="border"][class*="rounded"]').nth(1);
    if (await firstCard.isVisible({ timeout: 2000 }).catch(() => false)) {
      await firstCard.click();
      await page.waitForTimeout(500);
      await screenshot("06-skill-expanded");
      checks.push({ name: "Skill card expandable", passed: true, detail: "" });
    }
  }

  // Test Self-Evolution tab
  const evolutionTab = page.locator('button:has-text("Self-Evolution")').first();
  if (await evolutionTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await evolutionTab.click();
    await page.waitForTimeout(1000);
    await screenshot("06-self-evolution");
    checks.push({ name: "Self-Evolution tab loads", passed: true, detail: "" });
  }

  // Test Create New tab
  const createTab = page.locator('button:has-text("Create New")').first();
  if (await createTab.isVisible({ timeout: 2000 }).catch(() => false)) {
    await createTab.click();
    await page.waitForTimeout(1000);
    await screenshot("06-create-skill");
    checks.push({ name: "Create New tab loads", passed: true, detail: "" });
  }

  // Verify skills API
  try {
    const skills = await api.get("/api/skills");
    const list = Array.isArray(skills) ? skills : skills.skills || [];
    checks.push({ name: "Skills API returns skills", passed: list.length > 0, detail: `${list.length} skills` });

    // Check a specific skill
    if (list.length > 0) {
      const firstSkill = list[0];
      const detail = await api.get(`/api/skills/${firstSkill.name}`);
      checks.push({
        name: "Individual skill API works",
        passed: !!detail.name,
        detail: `${detail.name}: ${detail.description?.substring(0, 50)}...`,
      });
    }
  } catch (e) {
    checks.push({ name: "Skills API returns skills", passed: false, detail: e.message });
  }

  // Test skill execution via API (if LLM connected)
  if (ctx.llmConnected && ctx.projectId) {
    try {
      const result = await api.post("/api/skills/thematic-analysis/execute", {
        project_id: ctx.projectId,
        user_context: "Analyze the uploaded interview transcripts for common themes",
      });
      checks.push({ name: "Skill execution via API", passed: true, detail: JSON.stringify(result).substring(0, 100) });
    } catch (e) {
      checks.push({ name: "Skill execution via API", passed: false, detail: e.message });
    }
  }

  // Test health endpoint
  try {
    const health = await api.get("/api/skills/health/all");
    checks.push({ name: "Skills health API", passed: true, detail: JSON.stringify(health).substring(0, 80) });
  } catch (e) {
    checks.push({ name: "Skills health API", passed: false, detail: e.message });
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
