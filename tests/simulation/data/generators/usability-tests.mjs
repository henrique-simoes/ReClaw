/**
 * Usability test report generator for ReClaw simulation.
 * Produces realistic markdown usability test reports with SUS scores,
 * task metrics, and participant observations.
 */

import { readFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const corporaDir = join(__dirname, "..", "corpora");

const names = JSON.parse(readFileSync(join(corporaDir, "names.json"), "utf-8"));
const painPoints = JSON.parse(readFileSync(join(corporaDir, "pain-points.json"), "utf-8"));
const quotes = JSON.parse(readFileSync(join(corporaDir, "quotes.json"), "utf-8"));
const topics = JSON.parse(readFileSync(join(corporaDir, "research-topics.json"), "utf-8"));
const companies = JSON.parse(readFileSync(join(corporaDir, "companies.json"), "utf-8"));

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function pick(array) {
  return array[Math.floor(Math.random() * array.length)];
}

function pickN(array, n) {
  const shuffled = [...array].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(n, shuffled.length));
}

function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function recentDate() {
  const now = new Date();
  const daysAgo = randInt(1, 60);
  const d = new Date(now.getTime() - daysAgo * 86400000);
  return d.toISOString().split("T")[0];
}

/* ------------------------------------------------------------------ */
/*  Task definitions per topic area                                   */
/* ------------------------------------------------------------------ */

const taskTemplates = {
  "Onboarding Redesign": [
    "Complete the sign-up form and verify email",
    "Set up a user profile with avatar and bio",
    "Connect a third-party account (Google/Slack)",
    "Complete the onboarding tutorial",
    "Create your first project after onboarding",
    "Invite a team member during setup",
    "Configure initial notification preferences",
  ],
  "Dashboard Usability": [
    "Locate the weekly performance summary",
    "Add a custom widget to the dashboard",
    "Filter dashboard data by date range",
    "Export the current dashboard view as PDF",
    "Find and pin a specific metric to the top",
    "Switch between team and personal dashboard views",
    "Identify the highest-performing metric this month",
  ],
  "Mobile Experience Audit": [
    "Log in and navigate to the main dashboard on mobile",
    "Create a new task using only the mobile interface",
    "Upload a photo attachment from the camera roll",
    "Switch between projects using the mobile navigation",
    "Complete a multi-step form on mobile",
    "Search for a specific item on mobile",
    "View and respond to a notification on mobile",
  ],
  "Search and Navigation Overhaul": [
    "Find a specific project using the search bar",
    "Navigate to account settings from the home page",
    "Locate the help documentation for a feature",
    "Use the breadcrumb trail to return to a previous page",
    "Find a recently accessed item without using search",
    "Navigate to a deeply nested settings page",
    "Search for a team member by name",
  ],
  "Collaboration Features": [
    "Share a document with a specific team member",
    "Leave a comment on a shared artifact",
    "Create a shared workspace and invite collaborators",
    "Assign a task to another team member",
    "View and resolve a comment thread",
    "Set permissions on a shared folder",
    "Track changes made by collaborators",
  ],
  "Pricing Page Conversion": [
    "Compare features across pricing tiers",
    "Find the monthly vs. annual pricing toggle",
    "Locate the enterprise contact form",
    "Identify which plan includes the feature you need",
    "Start a free trial from the pricing page",
    "Find cancellation or downgrade options",
    "Calculate the cost for your team size",
  ],
  "Notification and Alerts System": [
    "Find and modify notification preferences",
    "Mute notifications for a specific project",
    "Set up a custom alert for a metric threshold",
    "Distinguish between urgent and non-urgent notifications",
    "Clear all read notifications",
    "Configure email digest frequency",
    "Find the notification that triggered an email you received",
  ],
  "Data Export and Reporting": [
    "Generate a monthly summary report",
    "Export raw data as CSV",
    "Schedule a recurring automated report",
    "Customize the columns included in an export",
    "Share a report link with a stakeholder",
    "Filter report data before exporting",
    "Create a chart from exported data within the app",
  ],
};

// Fallback tasks for any topic not explicitly listed
const genericTasks = [
  "Complete the primary user flow end-to-end",
  "Find and use the main search functionality",
  "Navigate to account settings and update a preference",
  "Perform a common action using keyboard shortcuts",
  "Recover from an intentional error state",
  "Complete a multi-step workflow",
  "Locate help documentation for a specific feature",
  "Share content with another user",
];

/* ------------------------------------------------------------------ */
/*  Severity ratings for findings                                     */
/* ------------------------------------------------------------------ */

const severityLevels = ["Critical", "Major", "Minor", "Cosmetic"];

const findingTemplates = [
  { text: "Users consistently hesitated before clicking the primary CTA — the label was ambiguous.", severity: "Major" },
  { text: "3 out of 5 participants attempted to use the back button instead of the in-app navigation, causing loss of form state.", severity: "Critical" },
  { text: "The success confirmation message disappeared too quickly for most participants to read.", severity: "Minor" },
  { text: "Participants expected a drag-and-drop interaction where only click-to-select was available.", severity: "Major" },
  { text: "The loading state provided no progress indication, leading two participants to refresh the page.", severity: "Major" },
  { text: "Error messages did not clearly indicate how to resolve the issue.", severity: "Critical" },
  { text: "Color-coding alone was used to indicate status — problematic for color-blind users.", severity: "Major" },
  { text: "The tooltip text was truncated on smaller screens, hiding critical information.", severity: "Minor" },
  { text: "Inconsistent button placement across different sections confused navigation patterns.", severity: "Minor" },
  { text: "The modal dialog could not be dismissed with the Escape key, violating accessibility expectations.", severity: "Minor" },
  { text: "Users could not distinguish between 'Save' and 'Save & Close' — both labels were visible simultaneously.", severity: "Major" },
  { text: "The breadcrumb trail did not update after a multi-step action, leaving users disoriented.", severity: "Minor" },
  { text: "Auto-complete suggestions in the search bar were irrelevant for the top 3 most common queries.", severity: "Major" },
  { text: "Participants missed critical information below the fold — no visual cue indicated more content.", severity: "Critical" },
  { text: "Form validation only triggered on submit, not inline, causing repeated correction cycles.", severity: "Major" },
  { text: "The empty state provided no guidance on how to get started.", severity: "Minor" },
  { text: "Icon-only buttons lacked labels, and 4 of 5 participants could not identify their function.", severity: "Critical" },
  { text: "Font size in the data table was too small for comfortable reading during extended use.", severity: "Cosmetic" },
  { text: "The active tab indicator had insufficient contrast against the background.", severity: "Cosmetic" },
  { text: "Spacing between interactive elements was too tight, causing frequent mis-taps on mobile.", severity: "Major" },
];

/* ------------------------------------------------------------------ */
/*  SUS Score generation                                              */
/* ------------------------------------------------------------------ */

/**
 * Generate a realistic SUS (System Usability Scale) score.
 * Real-world average is ~68. We generate within a realistic range.
 */
function generateSUSScore(completionRates) {
  // Base SUS correlates loosely with average task completion
  const avgCompletion = completionRates.reduce((a, b) => a + b, 0) / completionRates.length;

  // Map completion rate (0-100) to SUS range (25-95)
  const base = 25 + (avgCompletion / 100) * 55;
  // Add some noise
  const noise = (Math.random() - 0.5) * 20;
  return Math.max(25, Math.min(100, Math.round(base + noise)));
}

function susGrade(score) {
  if (score >= 85) return "A — Excellent";
  if (score >= 72) return "B — Good";
  if (score >= 52) return "C — OK (below average for usability)";
  if (score >= 38) return "D — Poor";
  return "F — Unacceptable";
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generates a synthetic usability test report in markdown.
 *
 * @param {number} taskCount - Number of tasks in the report (default 5).
 * @returns {{ filename: string, content: string }}
 */
export function generateUsabilityReport(taskCount = 5) {
  const topic = pick(topics);
  const company = pick(companies);
  const date = recentDate();
  const participantCount = randInt(4, 8);
  const participants = pickN(names, participantCount);

  // Select tasks for this topic
  const availableTasks = taskTemplates[topic.topic] || genericTasks;
  const tasks = pickN(availableTasks, taskCount);

  const lines = [];
  const completionRates = [];

  // ----- Header -----
  lines.push(`# Usability Test Report — ${topic.topic}`);
  lines.push("");
  lines.push(`**Date:** ${date}`);
  lines.push(`**Product:** ${company.product} (${company.name})`);
  lines.push(`**Research Goal:** ${topic.goal}`);
  lines.push(`**Participants:** ${participantCount} (${participants.map((p) => p.role).join(", ")})`);
  lines.push(`**Methodology:** Moderated remote usability testing with think-aloud protocol`);
  lines.push("");

  // ----- Participant Table -----
  lines.push("## Participants");
  lines.push("");
  lines.push("| ID | Name | Role | Company Size | Age |");
  lines.push("|----|------|------|-------------|-----|");
  for (const p of participants) {
    lines.push(`| ${p.id} | ${p.name} | ${p.role} | ${p.company_size} | ${p.age} |`);
  }
  lines.push("");

  // ----- Tasks -----
  lines.push("## Tasks");
  lines.push("");

  for (let i = 0; i < tasks.length; i++) {
    const taskName = tasks[i];
    const completionRate = randInt(40, 100);
    completionRates.push(completionRate);
    const avgTime = randInt(15, 180);
    const errors = randInt(0, Math.ceil((100 - completionRate) / 15));

    lines.push(`### Task ${i + 1}: ${taskName}`);
    lines.push("");
    lines.push(`- **Completion rate:** ${completionRate}%`);
    lines.push(`- **Average time:** ${avgTime}s`);
    lines.push(`- **Errors observed:** ${errors}`);
    lines.push(`- **Participant observations:**`);

    // Generate 2-4 observations per task
    const obsCount = randInt(2, 4);
    const observationParticipants = pickN(participants, obsCount);

    for (const obs of observationParticipants) {
      const source = Math.random() < 0.5 ? pick(painPoints) : pick(quotes);
      lines.push(`  - ${obs.name} (${obs.role}): "${source}"`);
    }

    lines.push("");
  }

  // ----- SUS Score -----
  const sus = generateSUSScore(completionRates);
  const grade = susGrade(sus);

  lines.push("## SUS Score");
  lines.push("");
  lines.push(`**Overall SUS Score: ${sus} / 100** — Grade: ${grade}`);
  lines.push("");
  lines.push(
    sus >= 68
      ? "The system scores above the industry average (68), indicating generally acceptable usability. However, task-level analysis reveals specific areas needing improvement."
      : "The system scores below the industry average (68), indicating significant usability concerns that should be addressed before the next release."
  );
  lines.push("");

  // ----- Key Findings -----
  lines.push("## Key Findings");
  lines.push("");

  const findingCount = randInt(4, 7);
  const selectedFindings = pickN(findingTemplates, findingCount);

  // Sort by severity: Critical > Major > Minor > Cosmetic
  const severityOrder = { Critical: 0, Major: 1, Minor: 2, Cosmetic: 3 };
  selectedFindings.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  for (let i = 0; i < selectedFindings.length; i++) {
    const f = selectedFindings[i];
    lines.push(`${i + 1}. **[${f.severity}]** ${f.text}`);
  }
  lines.push("");

  // ----- Recommendations -----
  lines.push("## Recommendations");
  lines.push("");

  const recommendations = [
    "Conduct a follow-up A/B test comparing the current flow with a simplified alternative.",
    "Add inline validation to multi-step forms to reduce error-correction cycles.",
    "Improve empty states with actionable guidance to reduce user confusion on first use.",
    "Increase color contrast ratios to meet WCAG AA standards across all interactive elements.",
    "Add visible text labels alongside icon-only buttons in the toolbar.",
    "Implement progressive disclosure to reduce initial cognitive load on complex screens.",
    "Add a persistent breadcrumb trail that updates in real time during multi-step flows.",
    "Provide clearer loading and progress indicators for operations exceeding 2 seconds.",
    "Review and consolidate notification preferences into a single, well-organized settings page.",
    "Add keyboard shortcut support for the 10 most common user actions.",
  ];

  const recCount = randInt(3, 5);
  const selectedRecs = pickN(recommendations, recCount);
  for (let i = 0; i < selectedRecs.length; i++) {
    lines.push(`${i + 1}. ${selectedRecs[i]}`);
  }
  lines.push("");

  // ----- Footer -----
  lines.push("---");
  lines.push(`*Report generated from usability testing session on ${date}.*`);
  lines.push(`*${participantCount} participants, ${taskCount} tasks evaluated.*`);

  const slug = topic.topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `usability-report-${slug}-${date}.md`;

  return { filename, content: lines.join("\n") };
}

export default { generateUsabilityReport };
