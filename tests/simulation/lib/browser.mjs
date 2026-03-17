/**
 * Playwright browser lifecycle and screenshot helpers.
 *
 * Uses the non-test Playwright package (`playwright`) so scenarios can be
 * driven from plain Node scripts without the `@playwright/test` runner.
 */

import { chromium } from "playwright";
import { mkdir, access } from "node:fs/promises";
import { join } from "node:path";

/** Default viewport dimensions */
const VIEWPORT = { width: 1280, height: 800 };

/** Base URL for the Next.js frontend */
const BASE_URL = process.env.RECLAW_FRONTEND_URL || "http://localhost:3000";

/**
 * Launch a Chromium browser and return a configured page.
 *
 * @param {boolean} headless  Run headless (default true, override with --headless=false)
 * @returns {Promise<{ browser: import("playwright").Browser, context: import("playwright").BrowserContext, page: import("playwright").Page }>}
 */
export async function launch(headless = true) {
  const browser = await chromium.launch({
    headless,
    args: [
      "--disable-gpu",
      "--no-sandbox",
      "--disable-setuid-sandbox",
    ],
  });

  const context = await browser.newContext({
    viewport: VIEWPORT,
    colorScheme: "dark",
    baseURL: BASE_URL,
    locale: "en-US",
    timezoneId: "America/New_York",
    // Capture HAR for debugging if needed
    recordHar: undefined,
  });

  // Set a reasonable default timeout for all actions (15 s)
  context.setDefaultTimeout(15_000);
  context.setDefaultNavigationTimeout(30_000);

  const page = await context.newPage();

  // Suppress noisy console messages from the app
  page.on("pageerror", (err) => {
    if (process.env.DEBUG) {
      console.error("[page error]", err.message);
    }
  });

  return { browser, context, page };
}

/**
 * Take a screenshot and save it as a PNG file.
 *
 * @param {import("playwright").Page} page       Playwright page
 * @param {string}                     name       Base filename (without extension)
 * @param {string}                     outputDir  Directory to save into (created if missing)
 * @returns {Promise<string>}  Absolute path to the saved screenshot
 */
export async function screenshot(page, name, outputDir) {
  await ensureDir(outputDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}_${timestamp}.png`;
  const filepath = join(outputDir, filename);

  await page.screenshot({
    path: filepath,
    fullPage: false,
    type: "png",
  });

  return filepath;
}

/**
 * Take a full-page screenshot (useful for long scrollable views).
 *
 * @param {import("playwright").Page} page
 * @param {string}                     name
 * @param {string}                     outputDir
 * @returns {Promise<string>}
 */
export async function screenshotFull(page, name, outputDir) {
  await ensureDir(outputDir);

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `${name}_full_${timestamp}.png`;
  const filepath = join(outputDir, filename);

  await page.screenshot({
    path: filepath,
    fullPage: true,
    type: "png",
  });

  return filepath;
}

/**
 * Gracefully close the browser.
 *
 * @param {import("playwright").Browser} browser
 */
export async function close(browser) {
  if (browser) {
    try {
      await browser.close();
    } catch {
      // Already closed — ignore
    }
  }
}

/**
 * Navigate to the app root and wait until the page is interactive.
 *
 * @param {import("playwright").Page} page
 * @param {string}                     path  URL path relative to BASE_URL (default "/")
 */
export async function navigateTo(page, path = "/") {
  await page.goto(path, { waitUntil: "networkidle" });
}

/**
 * Wait for the ReClaw app shell to be fully loaded (sidebar visible).
 *
 * @param {import("playwright").Page} page
 * @param {number}                     timeout  Max ms to wait (default 20 000)
 */
export async function waitForAppReady(page, timeout = 20_000) {
  await page.waitForSelector(
    'aside[role="navigation"][aria-label="Main navigation"]',
    { state: "visible", timeout },
  );
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function ensureDir(dir) {
  try {
    await access(dir);
  } catch {
    await mkdir(dir, { recursive: true });
  }
}
