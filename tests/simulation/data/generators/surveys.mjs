/**
 * Survey CSV generator for ReClaw simulation.
 * Produces realistic survey response data in CSV format.
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

/**
 * Generate a Likert score (1-5) with a bias.
 * bias: "positive" skews 3-5, "negative" skews 1-3, "neutral" is uniform.
 */
function likert(bias = "neutral") {
  if (bias === "positive") {
    // Weighted toward higher scores
    const weights = [0.05, 0.1, 0.2, 0.35, 0.3];
    return weightedPick(weights);
  } else if (bias === "negative") {
    const weights = [0.25, 0.3, 0.25, 0.15, 0.05];
    return weightedPick(weights);
  }
  return randInt(1, 5);
}

function weightedPick(weights) {
  const r = Math.random();
  let cumulative = 0;
  for (let i = 0; i < weights.length; i++) {
    cumulative += weights[i];
    if (r <= cumulative) return i + 1;
  }
  return weights.length;
}

/**
 * Generate an NPS score (0-10) with a correlated profile.
 * Promoters (9-10), Passives (7-8), Detractors (0-6).
 */
function npsScore(overallSatisfaction) {
  // Correlate with overall satisfaction
  if (overallSatisfaction >= 4) {
    // Likely promoter or passive
    return randInt(7, 10);
  } else if (overallSatisfaction === 3) {
    // Likely passive
    return randInt(5, 8);
  } else {
    // Likely detractor
    return randInt(0, 6);
  }
}

/**
 * Escape a string for CSV embedding (double-quote wrapping if needed).
 */
function csvEscape(str) {
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/* ------------------------------------------------------------------ */
/*  Feedback generation                                               */
/* ------------------------------------------------------------------ */

function generateFeedback(overallSatisfaction) {
  // Higher satisfaction => more likely to give positive feedback
  if (overallSatisfaction >= 4) {
    if (Math.random() < 0.7) {
      return pick(quotes);
    }
    // Occasionally a satisfied user still has a pain point
    return pick(quotes) + " Though I'd add: " + pick(painPoints).toLowerCase();
  } else if (overallSatisfaction <= 2) {
    if (Math.random() < 0.7) {
      return pick(painPoints);
    }
    return pick(painPoints) + " That said, " + pick(quotes).toLowerCase();
  }
  // Neutral — mix
  if (Math.random() < 0.5) {
    return pick(quotes);
  }
  return pick(painPoints);
}

/* ------------------------------------------------------------------ */
/*  Persona-based profiles for realistic correlation                  */
/* ------------------------------------------------------------------ */

const profiles = [
  { label: "happy_power_user", signupBias: "positive", onboardBias: "positive", featureBias: "positive", timeRange: [1, 8] },
  { label: "frustrated_new_user", signupBias: "negative", onboardBias: "negative", featureBias: "neutral", timeRange: [15, 30] },
  { label: "neutral_regular", signupBias: "neutral", onboardBias: "neutral", featureBias: "neutral", timeRange: [5, 20] },
  { label: "mixed_feelings", signupBias: "positive", onboardBias: "negative", featureBias: "positive", timeRange: [8, 18] },
  { label: "churning_user", signupBias: "negative", onboardBias: "negative", featureBias: "negative", timeRange: [20, 30] },
  { label: "quiet_satisfied", signupBias: "positive", onboardBias: "positive", featureBias: "neutral", timeRange: [3, 12] },
];

/* ------------------------------------------------------------------ */
/*  Main generator                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generates a synthetic survey CSV.
 *
 * @param {number} respondentCount - Number of survey respondents (default 20).
 * @returns {{ filename: string, content: string }}
 */
export function generateSurveyCSV(respondentCount = 20) {
  const topic = pick(topics);
  const date = recentDate();

  const header =
    "respondent_id,age,role,company_size,signup_ease,onboarding_satisfaction,feature_usefulness,time_to_first_task_min,would_recommend,open_feedback";

  const rows = [header];
  const respondents = pickN(names, Math.min(respondentCount, names.length));

  // If we need more respondents than names, we cycle with suffixes
  const allRespondents = [];
  for (let i = 0; i < respondentCount; i++) {
    if (i < respondents.length) {
      allRespondents.push(respondents[i]);
    } else {
      // Clone with modified id
      const base = pick(names);
      allRespondents.push({
        ...base,
        id: `${base.id}-${i}`,
        age: randInt(22, 58),
      });
    }
  }

  for (let i = 0; i < allRespondents.length; i++) {
    const person = allRespondents[i];
    const profile = pick(profiles);

    const signupEase = likert(profile.signupBias);
    const onboardSat = likert(profile.onboardBias);
    const featureUse = likert(profile.featureBias);
    const timeToTask = randInt(profile.timeRange[0], profile.timeRange[1]);

    // Overall satisfaction is an average of the three Likert scores
    const overallSat = Math.round((signupEase + onboardSat + featureUse) / 3);
    const wouldRecommend = npsScore(overallSat);

    const feedback = generateFeedback(overallSat);

    const row = [
      person.id,
      person.age,
      csvEscape(person.role),
      csvEscape(person.company_size),
      signupEase,
      onboardSat,
      featureUse,
      timeToTask,
      wouldRecommend,
      csvEscape(feedback),
    ].join(",");

    rows.push(row);
  }

  const slug = topic.topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `survey-${slug}-${date}.csv`;

  return { filename, content: rows.join("\n") };
}

export default { generateSurveyCSV };
