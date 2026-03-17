/**
 * Report generation for simulation test runs.
 *
 * Collects scenario results, evaluator results (accessibility, heuristic,
 * performance), and produces Markdown + JSON reports.
 */

import { writeFile, readFile, mkdir, access } from "node:fs/promises";
import { join } from "node:path";
import { formatDuration } from "./clock.mjs";

// ---------------------------------------------------------------------------
// RunReport
// ---------------------------------------------------------------------------

export class RunReport {
  constructor() {
    /** @type {Date} */
    this.startedAt = new Date();

    /** @type {Date|null} */
    this.finishedAt = null;

    /** @type {ScenarioResult[]} */
    this.scenarios = [];

    /** @type {AccessibilityViolation[]} */
    this.accessibilityViolations = [];

    /** @type {Record<string,number>|null} */
    this.heuristicScores = null;

    /** @type {Record<string,number>|null} */
    this.performanceMetrics = null;

    /** @type {string[]} */
    this.errors = [];
  }

  // -----------------------------------------------------------------------
  // Data collection
  // -----------------------------------------------------------------------

  /**
   * Record the result of a single scenario.
   *
   * @param {string} name
   * @param {{
   *   passed: number,
   *   failed: number,
   *   skipped?: number,
   *   errors?: string[],
   *   screenshots?: string[],
   *   duration: number
   * }} result
   */
  addScenario(name, result) {
    this.scenarios.push({
      name,
      passed: result.passed ?? 0,
      failed: result.failed ?? 0,
      skipped: result.skipped ?? 0,
      errors: result.errors ?? [],
      screenshots: result.screenshots ?? [],
      duration: result.duration ?? 0,
    });
  }

  /**
   * Record accessibility violations (typically from axe-core).
   *
   * @param {Array<{
   *   id: string,
   *   impact: string,
   *   description: string,
   *   help: string,
   *   helpUrl: string,
   *   nodes: Array<{ html: string, target: string[] }>
   * }>} violations
   */
  addAccessibility(violations) {
    this.accessibilityViolations = violations ?? [];
  }

  /**
   * Record heuristic evaluation scores.
   *
   * @param {Record<string,number>} scores  e.g. { visibility: 4, match: 5, ... }
   */
  addHeuristics(scores) {
    this.heuristicScores = scores;
  }

  /**
   * Record performance metrics.
   *
   * @param {Record<string,number>} metrics  e.g. { lcp: 1200, fcp: 500, tti: 2000 }
   */
  addPerformance(metrics) {
    this.performanceMetrics = metrics;
  }

  // -----------------------------------------------------------------------
  // Derived data
  // -----------------------------------------------------------------------

  /** Total pass / fail / skip across all scenarios. */
  get totals() {
    return this.scenarios.reduce(
      (acc, s) => ({
        passed: acc.passed + s.passed,
        failed: acc.failed + s.failed,
        skipped: acc.skipped + s.skipped,
      }),
      { passed: 0, failed: 0, skipped: 0 },
    );
  }

  /** Total duration across all scenarios (ms). */
  get totalDuration() {
    return this.scenarios.reduce((sum, s) => sum + s.duration, 0);
  }

  /** Whether every scenario passed with zero failures. */
  get allPassed() {
    return this.totals.failed === 0;
  }

  // -----------------------------------------------------------------------
  // Markdown generation
  // -----------------------------------------------------------------------

  /**
   * Generate a human-readable Markdown report.
   *
   * @returns {string}
   */
  generateMarkdown() {
    this.finishedAt = this.finishedAt ?? new Date();

    const { passed, failed, skipped } = this.totals;
    const total = passed + failed + skipped;
    const statusEmoji = this.allPassed ? "PASS" : "FAIL";

    const lines = [];

    // Header
    lines.push(`# ReClaw Simulation Report`);
    lines.push("");
    lines.push(`**Status:** ${statusEmoji}`);
    lines.push(`**Date:** ${this.startedAt.toISOString()}`);
    lines.push(`**Duration:** ${formatDuration(this.totalDuration)}`);
    lines.push(`**Results:** ${passed}/${total} passed, ${failed} failed, ${skipped} skipped`);
    lines.push("");

    // Scenarios table
    lines.push("## Scenarios");
    lines.push("");
    lines.push("| Scenario | Passed | Failed | Skipped | Duration |");
    lines.push("|----------|--------|--------|---------|----------|");

    for (const s of this.scenarios) {
      const icon = s.failed > 0 ? "FAIL" : "PASS";
      lines.push(
        `| ${icon} ${s.name} | ${s.passed} | ${s.failed} | ${s.skipped} | ${formatDuration(s.duration)} |`,
      );
    }
    lines.push("");

    // Errors
    const allErrors = this.scenarios.flatMap((s) =>
      s.errors.map((e) => ({ scenario: s.name, error: e })),
    );

    if (allErrors.length > 0) {
      lines.push("## Errors");
      lines.push("");
      for (const { scenario, error } of allErrors) {
        lines.push(`### ${scenario}`);
        lines.push("```");
        lines.push(error);
        lines.push("```");
        lines.push("");
      }
    }

    // Accessibility
    if (this.accessibilityViolations.length > 0) {
      lines.push("## Accessibility Violations");
      lines.push("");
      lines.push(`Found **${this.accessibilityViolations.length}** violation(s).`);
      lines.push("");

      for (const v of this.accessibilityViolations) {
        const impactLabel = v.impact ? v.impact.toUpperCase() : "UNKNOWN";
        lines.push(`### [${impactLabel}] ${v.id}`);
        lines.push("");
        lines.push(`> ${v.description}`);
        lines.push("");
        lines.push(`**Help:** ${v.help}`);
        if (v.helpUrl) lines.push(`**More info:** ${v.helpUrl}`);
        lines.push("");
        lines.push(`**Affected nodes:** ${v.nodes?.length ?? 0}`);

        if (v.nodes && v.nodes.length > 0) {
          lines.push("");
          for (const node of v.nodes.slice(0, 5)) {
            lines.push(`- Target: \`${node.target?.join(", ")}\``);
            lines.push(`  HTML: \`${truncate(node.html, 120)}\``);
          }
          if (v.nodes.length > 5) {
            lines.push(`- ... and ${v.nodes.length - 5} more`);
          }
        }
        lines.push("");
      }
    }

    // Heuristics
    if (this.heuristicScores) {
      lines.push("## Heuristic Evaluation");
      lines.push("");
      lines.push("| Heuristic | Score (1-5) |");
      lines.push("|-----------|-------------|");

      for (const [name, score] of Object.entries(this.heuristicScores)) {
        const bar = scoreBar(score);
        lines.push(`| ${name} | ${score}/5 ${bar} |`);
      }

      const avg =
        Object.values(this.heuristicScores).reduce((a, b) => a + b, 0) /
        Object.values(this.heuristicScores).length;
      lines.push("");
      lines.push(`**Average:** ${avg.toFixed(2)}/5`);
      lines.push("");
    }

    // Performance
    if (this.performanceMetrics) {
      lines.push("## Performance");
      lines.push("");
      lines.push("| Metric | Value |");
      lines.push("|--------|-------|");

      for (const [name, value] of Object.entries(this.performanceMetrics)) {
        lines.push(`| ${name} | ${formatDuration(value)} |`);
      }
      lines.push("");
    }

    // Screenshots
    const allScreenshots = this.scenarios.flatMap((s) =>
      s.screenshots.map((p) => ({ scenario: s.name, path: p })),
    );

    if (allScreenshots.length > 0) {
      lines.push("## Screenshots");
      lines.push("");
      for (const { scenario, path } of allScreenshots) {
        const filename = path.split("/").pop();
        lines.push(`- **${scenario}:** \`${filename}\``);
      }
      lines.push("");
    }

    lines.push("---");
    lines.push(`*Generated at ${this.finishedAt.toISOString()}*`);

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // Issues extraction
  // -----------------------------------------------------------------------

  /**
   * Extract actionable developer issues from the run results.
   *
   * @returns {Array<{ severity: string, category: string, title: string, detail: string }>}
   */
  generateIssues() {
    const issues = [];

    // Failed scenarios
    for (const s of this.scenarios) {
      if (s.failed > 0) {
        for (const err of s.errors) {
          issues.push({
            severity: "high",
            category: "scenario",
            title: `Scenario "${s.name}" failed`,
            detail: err,
          });
        }
      }
    }

    // Critical / serious accessibility violations
    for (const v of this.accessibilityViolations) {
      if (v.impact === "critical" || v.impact === "serious") {
        issues.push({
          severity: v.impact === "critical" ? "high" : "medium",
          category: "accessibility",
          title: `[a11y] ${v.id}: ${v.help}`,
          detail: `${v.description}\nAffected: ${v.nodes?.length ?? 0} node(s). See: ${v.helpUrl || "n/a"}`,
        });
      }
    }

    // Minor accessibility violations
    for (const v of this.accessibilityViolations) {
      if (v.impact === "minor" || v.impact === "moderate") {
        issues.push({
          severity: "low",
          category: "accessibility",
          title: `[a11y] ${v.id}: ${v.help}`,
          detail: `${v.description}\nAffected: ${v.nodes?.length ?? 0} node(s). See: ${v.helpUrl || "n/a"}`,
        });
      }
    }

    // Low heuristic scores
    if (this.heuristicScores) {
      for (const [name, score] of Object.entries(this.heuristicScores)) {
        if (score <= 2) {
          issues.push({
            severity: "medium",
            category: "heuristic",
            title: `Low heuristic score: ${name} (${score}/5)`,
            detail: `The "${name}" heuristic scored ${score}/5. Review and improve the related UX patterns.`,
          });
        }
      }
    }

    // Slow performance metrics
    if (this.performanceMetrics) {
      const thresholds = {
        lcp: 2500,
        fcp: 1800,
        tti: 3800,
        cls: 0.1,
        fid: 100,
      };

      for (const [metric, value] of Object.entries(this.performanceMetrics)) {
        const threshold = thresholds[metric.toLowerCase()];
        if (threshold !== undefined && value > threshold) {
          issues.push({
            severity: "medium",
            category: "performance",
            title: `Slow ${metric}: ${formatDuration(value)}`,
            detail: `${metric} = ${value} exceeds threshold of ${threshold}. Investigate and optimize.`,
          });
        }
      }
    }

    return issues;
  }

  // -----------------------------------------------------------------------
  // Persistence
  // -----------------------------------------------------------------------

  /**
   * Write report.md, report.json, and issues.json to the output directory.
   *
   * @param {string} outputDir
   * @returns {Promise<{ reportMd: string, reportJson: string, issuesJson: string }>}
   */
  async save(outputDir) {
    this.finishedAt = this.finishedAt ?? new Date();
    await ensureDir(outputDir);

    const reportMdPath = join(outputDir, "report.md");
    const reportJsonPath = join(outputDir, "report.json");
    const issuesJsonPath = join(outputDir, "issues.json");

    const markdown = this.generateMarkdown();
    const issues = this.generateIssues();

    const jsonData = {
      startedAt: this.startedAt.toISOString(),
      finishedAt: this.finishedAt.toISOString(),
      totals: this.totals,
      totalDuration: this.totalDuration,
      allPassed: this.allPassed,
      scenarios: this.scenarios,
      accessibilityViolations: this.accessibilityViolations.length,
      heuristicScores: this.heuristicScores,
      performanceMetrics: this.performanceMetrics,
    };

    await Promise.all([
      writeFile(reportMdPath, markdown, "utf-8"),
      writeFile(reportJsonPath, JSON.stringify(jsonData, null, 2), "utf-8"),
      writeFile(issuesJsonPath, JSON.stringify(issues, null, 2), "utf-8"),
    ]);

    return {
      reportMd: reportMdPath,
      reportJson: reportJsonPath,
      issuesJson: issuesJsonPath,
    };
  }

  // -----------------------------------------------------------------------
  // Comparison
  // -----------------------------------------------------------------------

  /**
   * Compare this run against a previous run directory (reads its report.json)
   * and generate a comparison Markdown string.
   *
   * @param {string} previousRunDir  Path to a directory containing report.json
   * @returns {Promise<string>}  Comparison Markdown
   */
  async compare(previousRunDir) {
    let previous;
    try {
      const raw = await readFile(join(previousRunDir, "report.json"), "utf-8");
      previous = JSON.parse(raw);
    } catch {
      return "# Comparison\n\nNo previous run found for comparison.\n";
    }

    const current = {
      totals: this.totals,
      totalDuration: this.totalDuration,
      accessibilityViolations: this.accessibilityViolations.length,
      heuristicScores: this.heuristicScores,
      performanceMetrics: this.performanceMetrics,
    };

    const lines = [];
    lines.push("# Run Comparison");
    lines.push("");
    lines.push("| Metric | Previous | Current | Delta |");
    lines.push("|--------|----------|---------|-------|");

    // Test results
    lines.push(row("Passed", previous.totals?.passed, current.totals.passed));
    lines.push(row("Failed", previous.totals?.failed, current.totals.failed, true));
    lines.push(row("Skipped", previous.totals?.skipped, current.totals.skipped));
    lines.push(
      row(
        "Duration",
        previous.totalDuration,
        current.totalDuration,
        true,
        formatDuration,
      ),
    );

    // Accessibility
    lines.push(
      row(
        "A11y violations",
        previous.accessibilityViolations,
        current.accessibilityViolations,
        true,
      ),
    );

    // Heuristics
    if (current.heuristicScores && previous.heuristicScores) {
      lines.push("");
      lines.push("### Heuristic Scores");
      lines.push("");
      lines.push("| Heuristic | Previous | Current | Delta |");
      lines.push("|-----------|----------|---------|-------|");

      for (const key of Object.keys(current.heuristicScores)) {
        lines.push(
          row(
            key,
            previous.heuristicScores?.[key],
            current.heuristicScores[key],
          ),
        );
      }
    }

    // Performance
    if (current.performanceMetrics && previous.performanceMetrics) {
      lines.push("");
      lines.push("### Performance");
      lines.push("");
      lines.push("| Metric | Previous | Current | Delta |");
      lines.push("|--------|----------|---------|-------|");

      for (const key of Object.keys(current.performanceMetrics)) {
        lines.push(
          row(
            key,
            previous.performanceMetrics?.[key],
            current.performanceMetrics[key],
            true,
            formatDuration,
          ),
        );
      }
    }

    lines.push("");
    lines.push(`*Compared at ${new Date().toISOString()}*`);

    return lines.join("\n");
  }

  // -----------------------------------------------------------------------
  // History
  // -----------------------------------------------------------------------

  /**
   * Append a summary of this run to `history.json` inside `resultsDir`.
   * Creates the file if it does not exist.
   *
   * @param {string} resultsDir
   */
  async updateHistory(resultsDir) {
    this.finishedAt = this.finishedAt ?? new Date();
    await ensureDir(resultsDir);

    const historyPath = join(resultsDir, "history.json");

    let history = [];
    try {
      const raw = await readFile(historyPath, "utf-8");
      history = JSON.parse(raw);
      if (!Array.isArray(history)) history = [];
    } catch {
      // File does not exist yet — start fresh
    }

    history.push({
      date: this.finishedAt.toISOString(),
      totals: this.totals,
      totalDuration: this.totalDuration,
      allPassed: this.allPassed,
      scenarioCount: this.scenarios.length,
      accessibilityViolations: this.accessibilityViolations.length,
      heuristicAverage: this.heuristicScores
        ? average(Object.values(this.heuristicScores))
        : null,
      performanceMetrics: this.performanceMetrics,
    });

    await writeFile(historyPath, JSON.stringify(history, null, 2), "utf-8");
  }
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

function truncate(str, maxLen) {
  if (!str) return "";
  return str.length > maxLen ? str.slice(0, maxLen) + "..." : str;
}

function scoreBar(score) {
  const filled = Math.round(score);
  return "X".repeat(filled) + "-".repeat(5 - filled);
}

function average(nums) {
  if (nums.length === 0) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/**
 * Generate a comparison table row.
 * @param {string}   label
 * @param {number}   prev
 * @param {number}   curr
 * @param {boolean}  [lowerIsBetter=false]
 * @param {Function} [fmt]  Formatter for display
 * @returns {string}
 */
function row(label, prev, curr, lowerIsBetter = false, fmt) {
  const format = fmt || ((v) => (v !== undefined && v !== null ? String(v) : "n/a"));
  const prevStr = format(prev);
  const currStr = format(curr);

  let deltaStr = "n/a";
  if (prev !== undefined && prev !== null && curr !== undefined && curr !== null) {
    const delta = curr - prev;
    if (delta === 0) {
      deltaStr = "0 (=)";
    } else {
      const sign = delta > 0 ? "+" : "";
      const indicator =
        lowerIsBetter
          ? delta < 0 ? " (improved)" : " (regressed)"
          : delta > 0 ? " (improved)" : " (regressed)";
      deltaStr = `${sign}${typeof prev === "number" && fmt ? fmt(delta) : delta}${indicator}`;
    }
  }

  return `| ${label} | ${prevStr} | ${currStr} | ${deltaStr} |`;
}
