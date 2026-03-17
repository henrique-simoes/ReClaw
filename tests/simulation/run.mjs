#!/usr/bin/env node
/**
 * ReClaw Simulation Agent — automated QA, UX evaluation, and regression testing.
 *
 * Usage:
 *   node run.mjs                    # Full run (headless)
 *   node run.mjs --headless=false   # Watch in browser
 *   node run.mjs --scenario 01     # Single scenario
 *   node run.mjs --skip-eval        # Skip accessibility/heuristic evaluators
 */

import { chromium } from "playwright";
import { mkdirSync, writeFileSync, readFileSync, existsSync, symlinkSync, unlinkSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESULTS_DIR = join(__dirname, ".results");
const RUNS_DIR = join(RESULTS_DIR, "runs");

// Parse CLI args
const args = process.argv.slice(2);
const headless = !args.includes("--headless=false");
const singleScenario = args.includes("--scenario") ? args[args.indexOf("--scenario") + 1] : null;
const skipEval = args.includes("--skip-eval");

const API_BASE = "http://localhost:8000";
const FRONTEND = "http://localhost:3000";

// ── API Client ──────────────────────────────────────────────

const apiClient = {
  async get(path) {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) throw new Error(`GET ${path}: ${res.status}`);
    return res.json();
  },
  async post(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`POST ${path}: ${res.status}`);
    return res.json();
  },
  async patch(path, body) {
    const res = await fetch(`${API_BASE}${path}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`PATCH ${path}: ${res.status}`);
    return res.json();
  },
  async delete(path) {
    const res = await fetch(`${API_BASE}${path}`, { method: "DELETE" });
    return res;
  },
  async uploadFile(projectId, filePath, fileName) {
    const { readFileSync } = await import("fs");
    const fileData = readFileSync(filePath);
    const formData = new FormData();
    formData.append("file", new Blob([fileData]), fileName);
    const res = await fetch(`${API_BASE}/api/files/upload/${projectId}`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) throw new Error(`Upload ${fileName}: ${res.status}`);
    return res.json();
  },
};

// ── Data Generators ─────────────────────────────────────────

async function loadGenerators() {
  try {
    const interviews = await import("./data/generators/interviews.mjs");
    const surveys = await import("./data/generators/surveys.mjs");
    const usabilityTests = await import("./data/generators/usability-tests.mjs");
    const researchNotes = await import("./data/generators/research-notes.mjs");
    return { interviews, surveys, usabilityTests, researchNotes };
  } catch (e) {
    console.warn("⚠ Data generators not fully available:", e.message);
    // Provide fallback generators
    const fallback = {
      generateTranscript: () => ({
        filename: "interview-sim.txt",
        content: "[00:00] Interviewer: Tell me about your experience.\n[00:30] Sarah: It was mostly positive but the onboarding was confusing.\n[01:15] Interviewer: What specifically was confusing?\n[01:45] Sarah: I couldn't find where to set up my team workspace.\n",
      }),
      generateSurveyCSV: () => ({
        filename: "survey-sim.csv",
        content: "respondent_id,age,role,company_size,signup_ease,onboarding_satisfaction,feature_usefulness,time_to_first_task_min,would_recommend,open_feedback\nR001,28,Designer,50-200,4,3,4,5,8,The interface is clean but I got lost in the settings\nR002,35,PM,200-500,3,2,4,12,6,Onboarding took too long\nR003,42,Engineer,50-200,5,4,5,3,9,Love the keyboard shortcuts\n",
      }),
      generateUsabilityReport: () => ({
        filename: "usability-sim.md",
        content: "# Usability Test Report\n## Task 1: Create a project\n- Completion: 80%\n- Avg time: 45s\n- Errors: 1\n## SUS Score: 72\n",
      }),
      generateFieldNotes: () => ({
        filename: "field-notes-sim.md",
        content: "# Field Notes\n## Session 1\n**Participant:** Sarah Chen\n### Observations\n- Hesitated at the onboarding step 2\n- Asked 'what does context mean here?'\n### Notable Quotes\n> 'I wish the help text was more specific' — Sarah\n",
      }),
    };
    return {
      interviews: fallback,
      surveys: fallback,
      usabilityTests: fallback,
      researchNotes: fallback,
    };
  }
}

// ── Scenarios ───────────────────────────────────────────────

async function loadScenarios() {
  const scenarioFiles = [
    "01-health-check",
    "02-onboarding",
    "03-project-setup",
    "04-file-upload",
    "05-chat-interaction",
    "06-skill-execution",
    "07-findings-chain",
    "08-kanban-workflow",
    "09-navigation-search",
    "10-settings-models",
  ];

  const scenarios = [];
  for (const file of scenarioFiles) {
    try {
      const mod = await import(`./scenarios/${file}.mjs`);
      scenarios.push({ id: mod.id || file, name: mod.name || file, run: mod.run });
    } catch (e) {
      console.warn(`⚠ Could not load scenario ${file}: ${e.message}`);
    }
  }
  return scenarios;
}

// ── Evaluators ──────────────────────────────────────────────

async function loadEvaluators() {
  const evalFiles = ["accessibility", "heuristics", "performance"];
  const evaluators = [];
  for (const file of evalFiles) {
    try {
      const mod = await import(`./evaluators/${file}.mjs`);
      evaluators.push({ name: mod.name || file, evaluate: mod.evaluate });
    } catch (e) {
      console.warn(`⚠ Could not load evaluator ${file}: ${e.message}`);
    }
  }
  return evaluators;
}

// ── Report Generation ───────────────────────────────────────

function generateReport(runDir, scenarioResults, evalResults, duration) {
  const timestamp = new Date().toISOString();
  const totalChecks = scenarioResults.reduce((sum, r) => sum + (r.result?.checks?.length || 0), 0);
  const totalPassed = scenarioResults.reduce((sum, r) => sum + (r.result?.passed || 0), 0);
  const totalFailed = scenarioResults.reduce((sum, r) => sum + (r.result?.failed || 0), 0);

  let md = `# ReClaw Simulation Report\n\n`;
  md += `**Run:** ${timestamp}\n`;
  md += `**Duration:** ${Math.round(duration / 1000)}s\n`;
  md += `**Overall:** ${totalPassed}/${totalChecks} checks passed (${totalChecks ? Math.round((totalPassed / totalChecks) * 100) : 0}%)\n\n`;

  // Scenario results
  md += `## Scenario Results\n\n`;
  md += `| # | Scenario | Passed | Failed | Status |\n`;
  md += `|---|----------|--------|--------|--------|\n`;
  for (const s of scenarioResults) {
    const status = s.result?.failed > 0 ? "FAIL" : s.result?.skipped ? "SKIP" : "PASS";
    md += `| ${s.id} | ${s.name} | ${s.result?.passed || 0} | ${s.result?.failed || 0} | ${status} |\n`;
  }

  // Detailed scenario output
  md += `\n## Detailed Results\n\n`;
  for (const s of scenarioResults) {
    md += `### ${s.name}\n`;
    if (s.result?.checks) {
      for (const c of s.result.checks) {
        md += `- ${c.passed ? "PASS" : "FAIL"} ${c.name}${c.detail ? `: ${c.detail}` : ""}\n`;
      }
    }
    if (s.error) md += `- ERROR: ${s.error}\n`;
    md += `\n`;
  }

  // Evaluator results
  if (evalResults.length > 0) {
    md += `## Evaluations\n\n`;
    for (const e of evalResults) {
      md += `### ${e.name}\n`;
      md += `${e.result?.summary || "No summary"}\n\n`;

      if (e.result?.scores) {
        md += `| Heuristic | Score | Observations |\n|-----------|-------|-------------|\n`;
        for (const s of e.result.scores) {
          md += `| ${s.id}: ${s.name} | ${s.score}/5 | ${s.observations[0] || ""} |\n`;
        }
        md += `\n`;
      }

      if (e.result?.violations?.length > 0) {
        md += `**Violations (${e.result.violations.length}):**\n`;
        for (const v of e.result.violations.slice(0, 20)) {
          md += `- [${v.impact}] ${v.view}: ${v.help} (${v.id})\n`;
        }
        md += `\n`;
      }

      if (e.result?.metrics) {
        md += `| Metric | Value | Threshold |\n|--------|-------|----------|\n`;
        for (const m of e.result.metrics) {
          md += `| ${m.name} | ${m.value}${m.unit} | ${m.threshold}${m.unit} |\n`;
        }
        md += `\n`;
      }
    }
  }

  // Issues for developers
  const issues = [];
  for (const s of scenarioResults) {
    if (s.result?.checks) {
      for (const c of s.result.checks) {
        if (!c.passed) {
          issues.push({
            source: s.name,
            title: c.name,
            detail: c.detail || "",
            severity: "medium",
            category: "functional",
          });
        }
      }
    }
  }
  for (const e of evalResults) {
    if (e.result?.violations) {
      for (const v of e.result.violations) {
        issues.push({
          source: `${e.name} — ${v.view}`,
          title: v.help || v.description,
          detail: v.helpUrl || "",
          severity: v.impact === "critical" ? "critical" : v.impact === "serious" ? "high" : "medium",
          category: "accessibility",
        });
      }
    }
    if (e.result?.scores) {
      for (const s of e.result.scores) {
        if (s.score < 3 && s.suggestions.length > 0) {
          issues.push({
            source: e.name,
            title: `${s.id}: ${s.name} — score ${s.score}/5`,
            detail: s.suggestions.join("; "),
            severity: "medium",
            category: "usability",
          });
        }
      }
    }
  }

  if (issues.length > 0) {
    md += `## Issues for Developers (${issues.length})\n\n`;
    const grouped = { critical: [], high: [], medium: [] };
    for (const i of issues) grouped[i.severity]?.push(i) || (grouped.medium.push(i));
    for (const [sev, items] of Object.entries(grouped)) {
      if (items.length === 0) continue;
      md += `### ${sev.toUpperCase()} (${items.length})\n`;
      for (const i of items) {
        md += `- **${i.title}** (${i.category}) — ${i.source}${i.detail ? `\n  ${i.detail}` : ""}\n`;
      }
      md += `\n`;
    }
  }

  md += `---\nGenerated by ReClaw Simulation Agent\n`;

  // Save
  writeFileSync(join(runDir, "report.md"), md);
  writeFileSync(
    join(runDir, "report.json"),
    JSON.stringify({ timestamp, duration, scenarioResults: scenarioResults.map((s) => ({ ...s, result: s.result })), evalResults: evalResults.map((e) => ({ name: e.name, result: e.result })), issues }, null, 2)
  );
  writeFileSync(join(runDir, "issues.json"), JSON.stringify(issues, null, 2));

  // Update history
  const historyPath = join(RESULTS_DIR, "history.json");
  const history = existsSync(historyPath) ? JSON.parse(readFileSync(historyPath, "utf-8")) : [];
  history.push({
    timestamp,
    duration,
    totalChecks,
    passed: totalPassed,
    failed: totalFailed,
    issueCount: issues.length,
    dir: runDir,
  });
  writeFileSync(historyPath, JSON.stringify(history, null, 2));

  // Update latest symlink
  const latestLink = join(RESULTS_DIR, "latest");
  try { unlinkSync(latestLink); } catch {}
  try { symlinkSync(runDir, latestLink); } catch {}

  return { md, issues };
}

// ── Main ────────────────────────────────────────────────────

async function main() {
  console.log("\n🐾 ReClaw Simulation Agent\n");

  const startTime = Date.now();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDir = join(RUNS_DIR, timestamp);
  const screenshotDir = join(runDir, "screenshots");
  mkdirSync(screenshotDir, { recursive: true });

  // Check prerequisites
  console.log("Checking prerequisites...");
  try {
    await fetch(`${API_BASE}/api/health`);
    console.log("  Backend: OK");
  } catch {
    console.error("  Backend not reachable at", API_BASE);
    console.error("  Start the backend first: python -m uvicorn app.main:app --port 8000 --app-dir backend");
    process.exit(1);
  }

  try {
    await fetch(FRONTEND);
    console.log("  Frontend: OK");
  } catch {
    console.error("  Frontend not reachable at", FRONTEND);
    console.error("  Start the frontend first: cd frontend && npm run dev");
    process.exit(1);
  }

  // Launch browser
  const browser = await chromium.launch({
    headless,
    args: ["--no-sandbox"],
  });
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
    colorScheme: "dark",
  });

  const screenshotFn = async (name) => {
    try {
      await page.screenshot({ path: join(screenshotDir, `${name}.png`) });
    } catch {}
  };

  // Load components
  const generators = await loadGenerators();
  const scenarios = await loadScenarios();
  const evaluators = skipEval ? [] : await loadEvaluators();

  // Context shared across scenarios
  const ctx = {
    api: apiClient,
    page,
    screenshot: screenshotFn,
    generators,
    projectId: null,
    llmConnected: false,
  };

  // Run scenarios
  console.log(`\nRunning ${singleScenario ? "scenario " + singleScenario : `${scenarios.length} scenarios`}...\n`);

  const scenarioResults = [];
  for (const scenario of scenarios) {
    if (singleScenario && !scenario.id.includes(singleScenario)) continue;

    process.stdout.write(`  ${scenario.id}: ${scenario.name}... `);
    try {
      const result = await scenario.run(ctx);
      scenarioResults.push({ id: scenario.id, name: scenario.name, result });
      const status = result.failed > 0 ? "FAIL" : result.skipped ? "SKIP" : "PASS";
      console.log(`${status} (${result.passed}/${result.passed + result.failed})`);
    } catch (e) {
      scenarioResults.push({ id: scenario.id, name: scenario.name, result: { checks: [], passed: 0, failed: 1 }, error: e.message });
      console.log(`ERROR: ${e.message}`);
    }
  }

  // Run evaluators
  const evalResults = [];
  if (!skipEval) {
    console.log(`\nRunning ${evaluators.length} evaluators...\n`);
    for (const evaluator of evaluators) {
      process.stdout.write(`  ${evaluator.name}... `);
      try {
        const result = await evaluator.evaluate(ctx);
        evalResults.push({ name: evaluator.name, result });
        console.log(result.summary || (result.passed ? "PASS" : "FAIL"));
      } catch (e) {
        evalResults.push({ name: evaluator.name, result: { passed: false, summary: e.message } });
        console.log(`ERROR: ${e.message}`);
      }
    }
  }

  // Generate report
  const duration = Date.now() - startTime;
  const { md, issues } = generateReport(runDir, scenarioResults, evalResults, duration);

  await browser.close();

  // Summary
  const totalPassed = scenarioResults.reduce((sum, r) => sum + (r.result?.passed || 0), 0);
  const totalFailed = scenarioResults.reduce((sum, r) => sum + (r.result?.failed || 0), 0);
  const totalChecks = totalPassed + totalFailed;

  console.log(`\n${"=".repeat(60)}`);
  console.log(`RESULTS: ${totalPassed}/${totalChecks} checks passed (${totalChecks ? Math.round((totalPassed / totalChecks) * 100) : 0}%)`);
  console.log(`Issues found: ${issues.length}`);
  console.log(`Duration: ${Math.round(duration / 1000)}s`);
  console.log(`Report: ${join(runDir, "report.md")}`);
  console.log(`${"=".repeat(60)}\n`);

  // Print critical issues
  const critical = issues.filter((i) => i.severity === "critical");
  if (critical.length > 0) {
    console.log("CRITICAL ISSUES:");
    for (const i of critical) {
      console.log(`  - ${i.title} (${i.source})`);
    }
    console.log();
  }

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error("Fatal error:", e);
  process.exit(1);
});
