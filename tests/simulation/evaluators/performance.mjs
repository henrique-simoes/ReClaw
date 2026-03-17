/** Performance Evaluator — page load times, API response times. */

export const name = "Performance";

export async function evaluate(ctx) {
  const { page, api } = ctx;
  const metrics = [];

  // Page load time
  const pageStart = Date.now();
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  const pageLoadMs = Date.now() - pageStart;
  metrics.push({ name: "Page load (networkidle)", value: pageLoadMs, unit: "ms", threshold: 5000 });

  // View switch times
  const views = ["Findings", "Tasks", "Skills", "Context", "Chat"];
  for (const view of views) {
    const start = Date.now();
    const btn = page.locator(`button[aria-label="${view}"]`).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(500);
    }
    const switchMs = Date.now() - start;
    metrics.push({ name: `View switch: ${view}`, value: switchMs, unit: "ms", threshold: 1000 });
  }

  // API response times
  const endpoints = [
    { name: "GET /api/health", path: "/api/health" },
    { name: "GET /api/settings/status", path: "/api/settings/status" },
    { name: "GET /api/projects", path: "/api/projects" },
    { name: "GET /api/skills", path: "/api/skills" },
    { name: "GET /api/settings/hardware", path: "/api/settings/hardware" },
  ];

  for (const ep of endpoints) {
    const start = Date.now();
    try {
      await api.get(ep.path);
      const ms = Date.now() - start;
      metrics.push({ name: ep.name, value: ms, unit: "ms", threshold: 2000 });
    } catch {
      metrics.push({ name: ep.name, value: -1, unit: "ms", threshold: 2000, error: true });
    }
  }

  // Core Web Vitals via CDP
  try {
    const cdp = await page.context().newCDPSession(page);
    await cdp.send("Performance.enable");
    const perfMetrics = await cdp.send("Performance.getMetrics");
    const cwvMap = {};
    for (const m of perfMetrics.metrics) {
      cwvMap[m.name] = m.value;
    }
    if (cwvMap.DomContentLoaded) {
      metrics.push({ name: "DOMContentLoaded", value: Math.round(cwvMap.DomContentLoaded * 1000), unit: "ms", threshold: 3000 });
    }
    if (cwvMap.LayoutCount) {
      metrics.push({ name: "Layout count", value: cwvMap.LayoutCount, unit: "count", threshold: 100 });
    }
  } catch {
    // CDP not available in all browsers
  }

  const passed = metrics.filter((m) => !m.error && m.value <= m.threshold).length;
  const failed = metrics.filter((m) => m.error || m.value > m.threshold).length;

  return {
    name,
    passed: failed === 0,
    metrics,
    summary: `${passed}/${metrics.length} within thresholds. Page load: ${pageLoadMs}ms.`,
  };
}
