/** Accessibility Evaluator — axe-core WCAG 2.1 AA scan on every view. */

export const name = "Accessibility (WCAG 2.1 AA)";

export async function evaluate(ctx) {
  const { page, screenshot } = ctx;
  let AxeBuilder;

  try {
    const axeModule = await import("@axe-core/playwright");
    AxeBuilder = axeModule.default || axeModule.AxeBuilder;
  } catch {
    return {
      name,
      passed: false,
      violations: [],
      summary: "axe-core not installed — run: npm install @axe-core/playwright",
    };
  }

  const views = [
    { id: "Chat", nav: 'button[aria-label="Chat"]' },
    { id: "Findings", nav: 'button[aria-label="Findings"]' },
    { id: "Tasks", nav: 'button[aria-label="Tasks"]' },
    { id: "Skills", nav: 'button[aria-label="Skills"]' },
    { id: "Context", nav: 'button[aria-label="Context"]' },
  ];

  const allViolations = [];

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(2000);

  for (const view of views) {
    const navBtn = page.locator(view.nav).first();
    if (await navBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await navBtn.click();
      await page.waitForTimeout(1500);
    }

    try {
      const results = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
        .analyze();

      for (const v of results.violations) {
        allViolations.push({
          view: view.id,
          id: v.id,
          impact: v.impact,
          description: v.description,
          help: v.help,
          helpUrl: v.helpUrl,
          nodes: v.nodes.map((n) => ({
            html: n.html.substring(0, 200),
            target: n.target,
            failureSummary: n.failureSummary,
          })),
        });
      }
    } catch (e) {
      allViolations.push({
        view: view.id,
        id: "scan-error",
        impact: "unknown",
        description: `axe scan failed: ${e.message}`,
        help: "",
        helpUrl: "",
        nodes: [],
      });
    }

    await screenshot(`a11y-${view.id.toLowerCase()}`);
  }

  // Group by severity
  const critical = allViolations.filter((v) => v.impact === "critical");
  const serious = allViolations.filter((v) => v.impact === "serious");
  const moderate = allViolations.filter((v) => v.impact === "moderate");
  const minor = allViolations.filter((v) => v.impact === "minor");

  return {
    name,
    passed: critical.length === 0 && serious.length === 0,
    violations: allViolations,
    stats: {
      total: allViolations.length,
      critical: critical.length,
      serious: serious.length,
      moderate: moderate.length,
      minor: minor.length,
    },
    summary: `${allViolations.length} violations: ${critical.length} critical, ${serious.length} serious, ${moderate.length} moderate, ${minor.length} minor`,
  };
}
