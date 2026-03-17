/**
 * Custom assertion helpers for simulation scenarios.
 *
 * Every function either resolves successfully or throws with a descriptive
 * error message, making them easy to use inside scenario steps.
 */

import { SIDEBAR, TOAST } from "./selectors.mjs";

// ---------------------------------------------------------------------------
// waitForText
// ---------------------------------------------------------------------------

/**
 * Wait for text to appear anywhere on the page.
 *
 * @param {import("playwright").Page} page
 * @param {string}  text      The text to look for (substring match)
 * @param {number}  [timeout=10000]  Max ms to wait
 */
export async function waitForText(page, text, timeout = 10_000) {
  try {
    await page.waitForFunction(
      (t) => document.body.innerText.includes(t),
      text,
      { timeout },
    );
  } catch {
    throw new Error(
      `waitForText: "${text}" did not appear on page within ${timeout} ms`,
    );
  }
}

// ---------------------------------------------------------------------------
// waitForTextGone
// ---------------------------------------------------------------------------

/**
 * Wait for text to disappear from the page.
 *
 * @param {import("playwright").Page} page
 * @param {string}  text
 * @param {number}  [timeout=10000]
 */
export async function waitForTextGone(page, text, timeout = 10_000) {
  try {
    await page.waitForFunction(
      (t) => !document.body.innerText.includes(t),
      text,
      { timeout },
    );
  } catch {
    throw new Error(
      `waitForTextGone: "${text}" was still on the page after ${timeout} ms`,
    );
  }
}

// ---------------------------------------------------------------------------
// verifyToast
// ---------------------------------------------------------------------------

/**
 * Wait for a toast notification whose text includes `message`.
 *
 * @param {import("playwright").Page} page
 * @param {string}  message   Substring to match inside the toast
 * @param {number}  [timeout=8000]
 */
export async function verifyToast(page, message, timeout = 8_000) {
  try {
    // Wait for the toast container to appear
    await page.waitForSelector(TOAST.container, {
      state: "visible",
      timeout,
    });

    // Then wait for the specific message text inside it
    await page.waitForFunction(
      ({ containerSel, msg }) => {
        const container = document.querySelector(containerSel);
        if (!container) return false;
        return container.textContent?.includes(msg) ?? false;
      },
      { containerSel: TOAST.container, msg: message },
      { timeout },
    );
  } catch {
    throw new Error(
      `verifyToast: toast with message "${message}" did not appear within ${timeout} ms`,
    );
  }
}

// ---------------------------------------------------------------------------
// verifyViewActive
// ---------------------------------------------------------------------------

/**
 * Assert that the sidebar shows the given view as the currently active tab.
 *
 * @param {import("playwright").Page} page
 * @param {string}  viewName  e.g. "Chat", "Findings", "Tasks", "Settings"
 */
export async function verifyViewActive(page, viewName) {
  const selector = SIDEBAR.tab(viewName);
  const tab = await page.$(selector);

  if (!tab) {
    throw new Error(
      `verifyViewActive: tab "${viewName}" not found. ` +
      `Make sure the "More views" panel is expanded if looking for secondary tabs.`,
    );
  }

  const isSelected = await tab.getAttribute("aria-selected");
  if (isSelected !== "true") {
    throw new Error(
      `verifyViewActive: tab "${viewName}" exists but aria-selected="${isSelected}" (expected "true")`,
    );
  }
}

// ---------------------------------------------------------------------------
// verifyApiResponse
// ---------------------------------------------------------------------------

/**
 * Validate that an API response object matches a simple schema.
 *
 * The `schema` is a plain object whose keys map to expected types:
 *
 *   { id: "string", count: "number", items: "array", ok: "boolean", meta: "object" }
 *
 * Each value can be:
 *   - A type string: "string", "number", "boolean", "object", "array"
 *   - "any" (skip type checking, just assert the key exists)
 *   - An object (recurse into nested schema)
 *
 * @param {any}              response
 * @param {Record<string,string|object>}  schema
 */
export function verifyApiResponse(response, schema) {
  if (response === null || response === undefined) {
    throw new Error("verifyApiResponse: response is null/undefined");
  }

  for (const [key, expectedType] of Object.entries(schema)) {
    if (!(key in response)) {
      throw new Error(
        `verifyApiResponse: missing key "${key}" in response. ` +
        `Keys present: ${Object.keys(response).join(", ")}`,
      );
    }

    const value = response[key];

    if (typeof expectedType === "object" && expectedType !== null) {
      // Recurse for nested schemas
      verifyApiResponse(value, expectedType);
      continue;
    }

    if (expectedType === "any") continue;

    if (expectedType === "array") {
      if (!Array.isArray(value)) {
        throw new Error(
          `verifyApiResponse: key "${key}" expected array, got ${typeof value}`,
        );
      }
      continue;
    }

    if (typeof value !== expectedType) {
      throw new Error(
        `verifyApiResponse: key "${key}" expected ${expectedType}, got ${typeof value} (value: ${JSON.stringify(value)})`,
      );
    }
  }
}

// ---------------------------------------------------------------------------
// assertCount
// ---------------------------------------------------------------------------

/**
 * Assert that the number of elements matching `selector` equals `expected`.
 *
 * @param {import("playwright").Page} page
 * @param {string}  selector
 * @param {number}  expected
 */
export async function assertCount(page, selector, expected) {
  const elements = await page.$$(selector);
  const actual = elements.length;

  if (actual !== expected) {
    throw new Error(
      `assertCount: expected ${expected} element(s) for "${selector}", found ${actual}`,
    );
  }
}

// ---------------------------------------------------------------------------
// assertCountAtLeast
// ---------------------------------------------------------------------------

/**
 * Assert that the number of elements matching `selector` is at least `min`.
 *
 * @param {import("playwright").Page} page
 * @param {string}  selector
 * @param {number}  min
 */
export async function assertCountAtLeast(page, selector, min) {
  const elements = await page.$$(selector);
  const actual = elements.length;

  if (actual < min) {
    throw new Error(
      `assertCountAtLeast: expected at least ${min} element(s) for "${selector}", found ${actual}`,
    );
  }
}

// ---------------------------------------------------------------------------
// assertVisible
// ---------------------------------------------------------------------------

/**
 * Assert that an element matching `selector` is visible on the page right now.
 *
 * @param {import("playwright").Page} page
 * @param {string}  selector
 */
export async function assertVisible(page, selector) {
  const el = await page.$(selector);
  if (!el) {
    throw new Error(`assertVisible: no element found for "${selector}"`);
  }

  const visible = await el.isVisible();
  if (!visible) {
    throw new Error(
      `assertVisible: element "${selector}" exists but is not visible`,
    );
  }
}

// ---------------------------------------------------------------------------
// assertHidden
// ---------------------------------------------------------------------------

/**
 * Assert that no visible element matches `selector`.
 *
 * @param {import("playwright").Page} page
 * @param {string}  selector
 */
export async function assertHidden(page, selector) {
  const el = await page.$(selector);
  if (!el) return; // Not in DOM at all — counts as hidden

  const visible = await el.isVisible();
  if (visible) {
    throw new Error(
      `assertHidden: element "${selector}" is visible (expected hidden or absent)`,
    );
  }
}

// ---------------------------------------------------------------------------
// assertAttribute
// ---------------------------------------------------------------------------

/**
 * Assert that an element has a specific attribute value.
 *
 * @param {import("playwright").Page} page
 * @param {string}  selector
 * @param {string}  attribute
 * @param {string}  expectedValue
 */
export async function assertAttribute(page, selector, attribute, expectedValue) {
  const el = await page.$(selector);
  if (!el) {
    throw new Error(`assertAttribute: no element found for "${selector}"`);
  }

  const actual = await el.getAttribute(attribute);
  if (actual !== expectedValue) {
    throw new Error(
      `assertAttribute: "${selector}" [${attribute}] = "${actual}" (expected "${expectedValue}")`,
    );
  }
}

// ---------------------------------------------------------------------------
// assertUrlContains
// ---------------------------------------------------------------------------

/**
 * Assert that the current page URL contains a substring.
 *
 * @param {import("playwright").Page} page
 * @param {string}  substring
 */
export function assertUrlContains(page, substring) {
  const url = page.url();
  if (!url.includes(substring)) {
    throw new Error(
      `assertUrlContains: current URL "${url}" does not contain "${substring}"`,
    );
  }
}

// ---------------------------------------------------------------------------
// waitForNavigation
// ---------------------------------------------------------------------------

/**
 * Click a selector and wait for navigation to settle.
 *
 * @param {import("playwright").Page} page
 * @param {string}  selector
 * @param {number}  [timeout=10000]
 */
export async function clickAndWait(page, selector, timeout = 10_000) {
  await Promise.all([
    page.waitForLoadState("networkidle", { timeout }),
    page.click(selector),
  ]);
}
