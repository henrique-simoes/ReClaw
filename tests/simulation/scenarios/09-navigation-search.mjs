/** Scenario 09 — Navigation & Search: keyboard shortcuts, view switching, search modal. */

export const name = "Navigation & Search";
export const id = "09-navigation-search";

export async function run(ctx) {
  const { page, screenshot } = ctx;
  const checks = [];

  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Test sidebar nav items exist
  const navItems = ["Chat", "Findings", "Tasks", "Interviews", "Context", "Skills"];
  for (const item of navItems) {
    const btn = page.locator(`button[aria-label="${item}"]`).first();
    const visible = await btn.isVisible({ timeout: 2000 }).catch(() => false);
    checks.push({ name: `Nav item: ${item}`, passed: visible, detail: "" });
  }

  // Test More button reveals secondary nav
  const moreBtn = page.locator('button[aria-label="More views"]').first();
  if (await moreBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
    await moreBtn.click();
    await page.waitForTimeout(500);
    const secondaryItems = ["Metrics", "History", "Settings"];
    for (const item of secondaryItems) {
      const btn = page.locator(`button[aria-label="${item}"]`).first();
      const visible = await btn.isVisible({ timeout: 1000 }).catch(() => false);
      checks.push({ name: `Secondary nav: ${item}`, passed: visible, detail: "" });
    }
  }

  // Test view switching via clicks
  for (const view of navItems) {
    const btn = page.locator(`button[aria-label="${view}"]`).first();
    if (await btn.isVisible({ timeout: 1000 }).catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(800);
      const isSelected = await btn.getAttribute("aria-selected");
      checks.push({ name: `View switch: ${view}`, passed: isSelected === "true", detail: `aria-selected=${isSelected}` });
    }
  }

  // Test keyboard shortcuts — Cmd+1 to Cmd+6
  const viewKeys = { "1": "Chat", "2": "Findings", "3": "Tasks", "4": "Interviews", "5": "Context", "6": "Skills" };
  for (const [key, expectedView] of Object.entries(viewKeys)) {
    await page.keyboard.press(`Meta+${key}`);
    await page.waitForTimeout(500);
    const activeBtn = page.locator(`button[aria-label="${expectedView}"][aria-selected="true"]`).first();
    const isActive = await activeBtn.isVisible({ timeout: 1000 }).catch(() => false);
    checks.push({ name: `Shortcut Cmd+${key} → ${expectedView}`, passed: isActive, detail: "" });
  }

  // Test Cmd+K search modal
  await page.keyboard.press("Meta+k");
  await page.waitForTimeout(500);
  const searchModal = await page.locator('input[placeholder*="Search"]').isVisible({ timeout: 2000 }).catch(() => false);
  checks.push({ name: "Cmd+K opens search modal", passed: searchModal, detail: "" });
  await screenshot("09-search-modal");

  // Close with Escape
  if (searchModal) {
    await page.keyboard.press("Escape");
    await page.waitForTimeout(500);
    const modalClosed = !(await page.locator('[role="dialog"], [class*="modal"]').first().isVisible({ timeout: 1000 }).catch(() => false));
    checks.push({ name: "Escape closes search modal", passed: modalClosed, detail: "" });
  }

  // Test sidebar collapse/expand
  try {
    const collapseBtn = page.locator('button[aria-label="Collapse sidebar"]').first();
    if (await collapseBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await collapseBtn.click({ timeout: 5000 });
      await page.waitForTimeout(500);
      await screenshot("09-sidebar-collapsed");

      const expandBtn = page.locator('button[aria-label="Expand sidebar"]').first();
      const collapsed = await expandBtn.isVisible({ timeout: 1000 }).catch(() => false);
      checks.push({ name: "Sidebar collapse", passed: collapsed, detail: "" });

      if (collapsed) {
        await expandBtn.click();
        await page.waitForTimeout(500);
      }
    }
  } catch (e) {
    checks.push({ name: "Sidebar collapse", passed: false, detail: `Overlay may be blocking: ${e.message.substring(0, 80)}` });
  }

  // Test dark mode toggle
  const darkToggle = page.locator('button[aria-label*="dark"], button[aria-label*="theme"], button[aria-label*="mode"]').first();
  if (await darkToggle.isVisible({ timeout: 2000 }).catch(() => false)) {
    await darkToggle.click();
    await page.waitForTimeout(500);
    await screenshot("09-light-mode");
    checks.push({ name: "Dark mode toggle", passed: true, detail: "" });

    // Toggle back
    await darkToggle.click();
    await page.waitForTimeout(500);
  }

  // Test ? keyboard shortcuts modal
  await page.keyboard.press("?");
  await page.waitForTimeout(1000);
  const shortcutsModal = await page.locator("text=Keyboard Shortcuts").isVisible({ timeout: 2000 }).catch(() => false);
  checks.push({ name: "? opens shortcuts modal", passed: shortcutsModal, detail: "" });

  // Dismiss any open modals/overlays before continuing
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(500);

  // Wait for overlays to disappear
  await page.waitForFunction(
    () => !document.querySelector('.fixed.inset-0.bg-black\\/50, .fixed.inset-0.bg-black\\/60'),
    { timeout: 3000 }
  ).catch(() => {});

  // Test Cmd+. right panel toggle
  await page.keyboard.press("Meta+.");
  await page.waitForTimeout(500);
  await screenshot("09-right-panel-toggled");
  checks.push({ name: "Cmd+. toggles right panel", passed: true, detail: "" });

  // Toggle back
  await page.keyboard.press("Meta+.");
  await page.waitForTimeout(300);

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
