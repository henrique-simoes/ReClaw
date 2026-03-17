/**
 * Field research notes generator for ReClaw simulation.
 * Produces realistic markdown field observation notes with
 * participant observations, quotes, and researcher reflections.
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

function recentDate(baseOffset = 0) {
  const now = new Date();
  const daysAgo = randInt(1 + baseOffset, 14 + baseOffset);
  const d = new Date(now.getTime() - daysAgo * 86400000);
  return d.toISOString().split("T")[0];
}

/* ------------------------------------------------------------------ */
/*  Observation templates                                             */
/* ------------------------------------------------------------------ */

const settings = ["Remote (Zoom)", "Remote (Google Meet)", "In-person (office)", "In-person (coffee shop)", "Remote (phone call)", "In-person (conference room)"];

const behavioralObservations = [
  "Participant scrolled past the primary CTA three times before noticing it.",
  "Participant immediately looked for a search bar upon landing on the page.",
  "Opened the help menu within the first 30 seconds of the session.",
  "Spent over 2 minutes reading the empty state message before taking action.",
  "Tried to right-click for additional options, found none available.",
  "Switched between two tabs repeatedly to compare information.",
  "Verbalized frustration after the third failed attempt at the same task.",
  "Used browser back button instead of in-app navigation on multiple occasions.",
  "Paused for 15+ seconds at the form's second step, visibly confused by the field labels.",
  "Smiled and nodded when the success confirmation appeared — clear positive reaction.",
  "Leaned forward and squinted at the screen, suggesting readability issues.",
  "Asked aloud 'Where did that go?' after a modal closed unexpectedly.",
  "Attempted to use keyboard shortcuts that don't exist in the product.",
  "Instinctively tried to drag-and-drop items in the list view.",
  "Opened the settings panel and immediately closed it, saying it was overwhelming.",
  "Completed the task faster than expected but expressed low confidence in the result.",
  "Bookmarked a specific page because 'I'll never find it again through the nav.'",
  "Tried to resize a panel that was fixed-width, suggesting expectations from other tools.",
  "Ignored the tooltip entirely and guessed at the button's function correctly.",
  "Expressed surprise that undoing an action was not possible.",
  "Clicked the same button twice rapidly, triggering a duplicate submission.",
  "Navigated to the wrong section first, then self-corrected after 40 seconds.",
  "Used Cmd+F (browser find) instead of the in-app search functionality.",
  "Commented positively on the visual design but struggled with the interaction model.",
  "Asked whether the page had finished loading — no clear loading indicator was present.",
];

const environmentNotes = [
  "Background noise from an open-plan office was noticeable — participant occasionally distracted.",
  "Participant's monitor was smaller than expected (~13\"), affecting layout perception.",
  "Participant used a trackpad rather than a mouse, influencing interaction precision.",
  "Strong overhead lighting caused screen glare for the participant.",
  "Participant frequently multitasked, checking Slack during brief pauses.",
  "Stable internet connection throughout the session — no technical disruptions.",
  "Participant joined 5 minutes late due to calendar confusion.",
  "Participant shared screen from a dual-monitor setup, occasionally showing the wrong screen.",
  "Quiet home office environment — minimal distractions.",
  "Participant had the product open alongside three other browser tabs for context.",
];

const researcherReflections = [
  "This participant represents a key segment — their confusion around navigation likely extends to other users in similar roles.",
  "The emotional reaction to the error state was stronger than anticipated. Worth revisiting the error copy.",
  "Participant's mental model of the product hierarchy does not match our information architecture.",
  "There's a clear gap between what we consider 'discoverable' and what users actually find without guidance.",
  "The positive reaction to the dashboard suggests it should be the default landing page.",
  "Need to cross-reference this with survey data — the reported satisfaction doesn't match observed behavior.",
  "Participant's workaround reveals an unmet need that could become a feature request.",
  "The language the participant used to describe features differs significantly from our product terminology.",
  "This session reinforced the pattern from previous interviews — mobile is treated as view-only.",
  "The participant's workflow involves steps outside our product that could be integrated.",
  "Consider recruiting more participants from enterprise-sized companies — their patterns may differ.",
  "The think-aloud protocol worked well here. Participant was naturally verbose and articulate.",
];

/* ------------------------------------------------------------------ */
/*  Main generator                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generates synthetic field research notes in markdown.
 *
 * @returns {{ filename: string, content: string }}
 */
export function generateFieldNotes() {
  const topic = pick(topics);
  const company = pick(companies);
  const sessionCount = randInt(3, 6);
  const participants = pickN(names, sessionCount);
  const startDate = recentDate(sessionCount * 2);

  const lines = [];

  // ----- Header -----
  lines.push(`# Field Notes — ${topic.topic}`);
  lines.push("");
  lines.push(`**Research Goal:** ${topic.goal}`);
  lines.push(`**Product:** ${company.product} (${company.name})`);
  lines.push(`**Researcher:** Field Research Team`);
  lines.push(`**Period:** ${startDate} to ${recentDate()}`);
  lines.push(`**Sessions:** ${sessionCount}`);
  lines.push("");

  // ----- Sessions -----
  for (let i = 0; i < sessionCount; i++) {
    const participant = participants[i];
    const setting = pick(settings);
    const sessionDate = recentDate(i * 3);
    const duration = randInt(30, 60);

    lines.push(`## Session ${i + 1}`);
    lines.push("");
    lines.push(`**Date:** ${sessionDate}`);
    lines.push(`**Participant:** ${participant.name} (${participant.id})`);
    lines.push(`**Role:** ${participant.role}, ${participant.company_size} employees`);
    lines.push(`**Setting:** ${setting}`);
    lines.push(`**Duration:** ${duration} minutes`);
    lines.push("");

    // Environment note (50% chance)
    if (Math.random() < 0.5) {
      lines.push(`**Environment:** ${pick(environmentNotes)}`);
      lines.push("");
    }

    // Observations
    lines.push("### Observations");
    lines.push("");

    const obsCount = randInt(3, 6);
    const observations = pickN(behavioralObservations, obsCount);
    for (const obs of observations) {
      lines.push(`- ${obs}`);
    }

    // Add a pain-point observation
    lines.push(`- Participant noted: "${pick(painPoints)}"`);
    lines.push("");

    // Notable Quotes (2-4 per session)
    lines.push("### Notable Quotes");
    lines.push("");

    const quoteCount = randInt(2, 4);
    const sessionQuotes = pickN(quotes, quoteCount);
    for (const q of sessionQuotes) {
      lines.push(`> "${q}" — ${participant.name}`);
      lines.push("");
    }

    // Additional pain point quote (50% chance)
    if (Math.random() < 0.5) {
      lines.push(`> "${pick(painPoints)}" — ${participant.name}`);
      lines.push("");
    }

    // Task-specific notes tied to topic questions
    if (Math.random() < 0.6) {
      const question = pick(topic.questions);
      lines.push("### Task-Specific Notes");
      lines.push("");
      lines.push(`When asked: *"${question}"*`);
      lines.push("");
      lines.push(`- ${participant.name} ${pick([
        "paused to think for several seconds before responding.",
        "immediately launched into a detailed answer, suggesting this is a frequent concern.",
        "referred to a specific incident from last week as an example.",
        "became visibly more engaged — this topic clearly resonates.",
        "gave a measured response, carefully choosing their words.",
        "laughed and said this was the number-one thing they'd change.",
        "deferred to their team lead's experience on this topic.",
        "pulled up the product to demonstrate the issue in real time.",
      ])}`);
      lines.push("");
    }

    // Researcher reflection
    lines.push("### Researcher Notes");
    lines.push("");
    lines.push(`*${pick(researcherReflections)}*`);
    lines.push("");

    // Separator between sessions
    if (i < sessionCount - 1) {
      lines.push("---");
      lines.push("");
    }
  }

  // ----- Cross-Session Themes -----
  lines.push("---");
  lines.push("");
  lines.push("## Cross-Session Themes");
  lines.push("");

  const themeCount = randInt(3, 5);
  const themes = [
    "**Navigation confusion** — Multiple participants struggled to locate features they knew existed, resorting to browser search or help docs.",
    "**Mobile avoidance** — Most participants described using mobile only for quick checks, not for substantive work.",
    "**Notification fatigue** — Across sessions, participants described turning off most notifications due to volume.",
    "**Workaround culture** — Participants have developed informal processes outside the product to compensate for gaps.",
    "**Onboarding cliff** — Initial setup is praised, but participants describe feeling 'abandoned' after the first week.",
    "**Trust in data** — Participants want to rely on product reports but express uncertainty about accuracy.",
    "**Terminology mismatch** — The vocabulary used by participants differs from product labels, causing friction.",
    "**Collaboration gaps** — Teams resort to external tools (Slack, email) for tasks the product should support.",
    "**Performance sensitivity** — Even small delays (2-3 seconds) are perceived as significant blockers.",
    "**Feature discovery** — Powerful features go unused because participants never encounter them organically.",
  ];
  const selectedThemes = pickN(themes, themeCount);

  for (let i = 0; i < selectedThemes.length; i++) {
    lines.push(`${i + 1}. ${selectedThemes[i]}`);
  }
  lines.push("");

  // ----- Next Steps -----
  lines.push("## Next Steps");
  lines.push("");

  const nextSteps = [
    "Schedule follow-up sessions with 2-3 participants who expressed strong opinions for deeper dives.",
    "Cross-reference behavioral observations with analytics data to quantify frequency.",
    "Share preliminary findings with the product team for prioritization discussion.",
    "Design a targeted survey to validate themes across a larger sample.",
    "Create journey maps based on observed workflows for the design review.",
    "Review competitive products for comparison on the top pain-point areas.",
    "Prepare a highlight reel of key moments for stakeholder presentation.",
  ];
  const selectedSteps = pickN(nextSteps, randInt(3, 5));
  for (const step of selectedSteps) {
    lines.push(`- [ ] ${step}`);
  }
  lines.push("");

  // ----- Footer -----
  lines.push("---");
  lines.push(`*Field notes compiled from ${sessionCount} observation sessions.*`);
  lines.push(`*All quotes are verbatim from participants and should be treated as confidential research data.*`);

  const slug = topic.topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `field-notes-${slug}-${startDate}.md`;

  return { filename, content: lines.join("\n") };
}

export default { generateFieldNotes };
