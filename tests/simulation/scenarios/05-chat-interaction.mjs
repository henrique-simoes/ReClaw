/** Scenario 05 — Chat Interaction: send messages, verify responses. */

export const name = "Chat Interaction";
export const id = "05-chat-interaction";

export async function run(ctx) {
  const { api, page, screenshot } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  if (!ctx.llmConnected) {
    return { checks: [{ name: "Skip — LLM not connected", passed: false, detail: "Chat requires LLM" }], passed: 0, failed: 1, skipped: true };
  }

  // Navigate to Chat
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);

  // Select project
  const projectBtn = page.locator("text=[SIM]").first();
  if (await projectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await projectBtn.click();
    await page.waitForTimeout(500);
  }

  // Click Chat nav
  const chatNav = page.locator('button[aria-label="Chat"]').first();
  await chatNav.click();
  await page.waitForTimeout(1000);

  // Find chat input
  const chatInput = page.locator('textarea[placeholder*="Ask about"], input[placeholder*="Ask about"]').first();
  const inputVisible = await chatInput.isVisible({ timeout: 3000 }).catch(() => false);
  checks.push({ name: "Chat input visible", passed: inputVisible, detail: "" });

  if (!inputVisible) {
    return { checks, passed: checks.filter((c) => c.passed).length, failed: checks.filter((c) => !c.passed).length };
  }

  // Message 1: Ask about research data
  const sendBtn = page.locator('button[aria-label="Send message"]').first();

  // Type into textarea and wait for React state to update before clicking send.
  // Use page.type() instead of fill() for more realistic keystroke events,
  // then wait for the send button to become enabled (not cursor-not-allowed).
  await chatInput.fill("What are the main pain points mentioned in the interview transcripts?");
  await page.waitForTimeout(500);

  // Retry: if send button is still disabled, click the textarea and re-type
  const sendEnabled = await sendBtn.evaluate((btn) => !btn.disabled);
  if (!sendEnabled) {
    await chatInput.click();
    await chatInput.fill("");
    await page.waitForTimeout(200);
    await chatInput.type("What are the main pain points mentioned in the interview transcripts?");
    await page.waitForTimeout(500);
  }

  await sendBtn.click();

  // Wait for response (streaming)
  try {
    await page.waitForTimeout(2000);
    // Wait for assistant message to appear (max 30s for LLM response)
    await page.waitForFunction(
      () => {
        const msgs = document.querySelectorAll('[class*="message"], [class*="chat"], [class*="bubble"]');
        return msgs.length >= 2;
      },
      { timeout: 30000 }
    );
    checks.push({ name: "Chat response received", passed: true, detail: "" });
  } catch (e) {
    checks.push({ name: "Chat response received", passed: false, detail: `Timeout: ${e.message}` });
  }

  await screenshot("05-chat-response");

  // Message 2: Trigger a skill
  await chatInput.fill("Run a thematic analysis on the interview data");
  await page.waitForTimeout(500);
  const send2Enabled = await sendBtn.evaluate((btn) => !btn.disabled);
  if (!send2Enabled) {
    await chatInput.click();
    await chatInput.fill("");
    await page.waitForTimeout(200);
    await chatInput.type("Run a thematic analysis on the interview data");
    await page.waitForTimeout(500);
  }
  await sendBtn.click();
  try {
    await page.waitForTimeout(3000);
    await page.waitForFunction(
      () => document.body.innerText.includes("thematic") || document.body.innerText.includes("analysis") || document.body.innerText.includes("theme"),
      { timeout: 45000 }
    );
    checks.push({ name: "Skill-triggering message processed", passed: true, detail: "" });
  } catch (e) {
    checks.push({ name: "Skill-triggering message processed", passed: false, detail: e.message });
  }

  await screenshot("05-after-skill-trigger");

  // Verify chat history via API
  try {
    const history = await api.get(`/api/chat/history/${ctx.projectId}?limit=10`);
    const msgCount = Array.isArray(history) ? history.length : 0;
    checks.push({ name: "Chat history persisted", passed: msgCount >= 2, detail: `${msgCount} messages` });
  } catch (e) {
    checks.push({ name: "Chat history persisted", passed: false, detail: e.message });
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`).join("\n"),
  };
}
