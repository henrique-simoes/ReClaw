/** Scenario 08 — Kanban Workflow: create, move, edit, delete tasks. */

export const name = "Kanban Task Workflow";
export const id = "08-kanban-workflow";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  // Navigate to Tasks
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  const projectBtn = page.locator("text=[SIM]").first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);
  }

  const tasksNav = page.locator('button[aria-label="Tasks"]').first();
  await tasksNav.click();
  await page.waitForTimeout(1500);

  // Verify Kanban loads
  const columns = ["Backlog", "In Progress", "In Review"];
  for (const col of columns) {
    const visible = await page.locator(`text=${col}`).first().isVisible({ timeout: 2000 }).catch(() => false);
    checks.push({ name: `Column visible: ${col}`, passed: visible, detail: "" });
  }
  await screenshot("08-kanban-empty");

  // Create tasks via API
  const testTasks = [
    { title: "[SIM] Analyze interview transcripts", description: "Run thematic analysis on all uploaded interviews" },
    { title: "[SIM] Create user personas", description: "Build 3-4 personas from research data" },
    { title: "[SIM] Map user journey", description: "Create journey map for onboarding flow" },
  ];

  const createdTasks = [];
  for (const task of testTasks) {
    try {
      const created = await api.post("/api/tasks", {
        project_id: ctx.projectId,
        title: task.title,
        description: task.description,
      });
      createdTasks.push(created);
      checks.push({ name: `Create task: ${task.title}`, passed: !!created.id, detail: created.id });
    } catch (e) {
      checks.push({ name: `Create task: ${task.title}`, passed: false, detail: e.message });
    }
  }

  // Refresh UI
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(1500);

  // Click Tasks nav again after reload
  const tasksNav2 = page.locator('button[aria-label="Tasks"]').first();
  await tasksNav2.click();
  await page.waitForTimeout(1000);
  await screenshot("08-kanban-with-tasks");

  // Check tasks visible in UI
  for (const task of testTasks) {
    const visible = await page.locator(`text=${task.title}`).isVisible({ timeout: 2000 }).catch(() => false);
    checks.push({ name: `Task visible in UI: ${task.title.substring(6)}`, passed: visible, detail: "" });
  }

  // Move a task via API
  if (createdTasks.length > 0) {
    try {
      await api.post(`/api/tasks/${createdTasks[0].id}/move?status=in_progress`);
      checks.push({ name: "Move task to In Progress", passed: true, detail: createdTasks[0].id });

      // Verify via API
      const tasks = await api.get(`/api/tasks?project_id=${ctx.projectId}`);
      const movedTask = tasks.find((t) => t.id === createdTasks[0].id);
      checks.push({
        name: "Task status updated",
        passed: movedTask?.status === "in_progress",
        detail: `Status: ${movedTask?.status}`,
      });
    } catch (e) {
      checks.push({ name: "Move task to In Progress", passed: false, detail: e.message });
    }
  }

  // Update a task
  if (createdTasks.length > 1) {
    try {
      await api.patch(`/api/tasks/${createdTasks[1].id}`, {
        description: "Updated: Build 3-4 data-driven personas from interview and survey data",
      });
      checks.push({ name: "Update task description", passed: true, detail: "" });
    } catch (e) {
      checks.push({ name: "Update task description", passed: false, detail: e.message });
    }
  }

  // Delete a task
  if (createdTasks.length > 2) {
    try {
      await api.delete(`/api/tasks/${createdTasks[2].id}`);
      const remaining = await api.get(`/api/tasks?project_id=${ctx.projectId}`);
      const deleted = remaining.find((t) => t.id === createdTasks[2].id);
      checks.push({ name: "Delete task", passed: !deleted, detail: "" });
    } catch (e) {
      checks.push({ name: "Delete task", passed: false, detail: e.message });
    }
  }

  await screenshot("08-kanban-final");

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
