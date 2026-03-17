/**
 * Interview transcript generator for ReClaw simulation.
 * Produces realistic user interview transcripts drawing from corpora data.
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

function formatTimestamp(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `[${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}]`;
}

/* ------------------------------------------------------------------ */
/*  Response builders                                                 */
/* ------------------------------------------------------------------ */

const sentimentPrefixes = {
  positive: [
    "Yeah, absolutely — ",
    "That's actually something I really appreciate. ",
    "Oh for sure, ",
    "I have to say, ",
    "One thing I genuinely enjoy is — ",
  ],
  negative: [
    "Honestly, that's been a pain point for us. ",
    "Yeah, so this is where it gets frustrating. ",
    "I'll be blunt — ",
    "That's probably my biggest complaint. ",
    "This is something that really bothers me. ",
  ],
  neutral: [
    "So, ",
    "Well, in our case, ",
    "That's a good question. ",
    "Let me think about that. ",
    "It depends on the situation, but generally ",
  ],
};

const followUps = [
  "Can you tell me more about that?",
  "What happened next?",
  "How did that affect your workflow?",
  "Is that something you've experienced more than once?",
  "How does that compare to what you expected?",
  "What would an ideal solution look like for you?",
  "Did anyone on your team feel differently about that?",
  "What did you try to do about it?",
  "When did you first notice that?",
  "How important is that to your day-to-day work?",
  "Could you walk me through a specific example?",
  "What was your initial reaction?",
];

function buildResponse(participantName, sentiment) {
  const prefix = pick(sentimentPrefixes[sentiment]);
  let body;

  if (sentiment === "negative") {
    body = pick(painPoints);
  } else if (sentiment === "positive") {
    body = pick(quotes);
  } else {
    // Neutral — mix of a quote with a qualifying remark
    const qualifiers = [
      " I mean, it works, but there's room for improvement.",
      " It's not great, not terrible.",
      " We've gotten used to it at this point.",
      " Some team members feel differently, but that's my take.",
      " I think it depends a lot on your use case.",
    ];
    body = pick(quotes) + pick(qualifiers);
  }

  return `${prefix}${body}`;
}

/* ------------------------------------------------------------------ */
/*  Main generator                                                    */
/* ------------------------------------------------------------------ */

/**
 * Generates a synthetic interview transcript.
 *
 * @param {number} participantCount - Number of participants (default 1).
 * @returns {{ filename: string, content: string }}
 */
export function generateTranscript(participantCount = 1) {
  const topic = pick(topics);
  const participants = pickN(names, participantCount);
  const company = pick(companies);
  const date = recentDate();
  const duration = randInt(25, 45);

  const lines = [];

  // ----- Header -----
  lines.push(`Interview Transcript — ${topic.topic}`);
  for (const p of participants) {
    lines.push(`Participant: ${p.name} (${p.role}, ${p.company_size})`);
  }
  lines.push(`Date: ${date}`);
  lines.push(`Duration: ${duration} minutes`);
  lines.push(`Research Goal: ${topic.goal}`);
  lines.push("");

  // ----- Exchanges per participant -----
  for (const participant of participants) {
    if (participants.length > 1) {
      lines.push(`--- Segment: ${participant.name} ---`);
      lines.push("");
    }

    const exchangeCount = randInt(8, 15);
    let elapsed = 0;

    // Opening question from the topic
    lines.push(`${formatTimestamp(elapsed)} Interviewer: ${topic.questions[0]}`);
    elapsed += randInt(30, 60);

    // First response — always neutral opening
    lines.push(
      `${formatTimestamp(elapsed)} ${participant.name}: ${buildResponse(participant.name, "neutral")}`
    );
    elapsed += randInt(40, 90);

    // Remaining exchanges
    const sentiments = ["positive", "negative", "neutral"];
    const usedQuestions = new Set([0]);

    for (let i = 1; i < exchangeCount; i++) {
      // Interviewer asks a question
      let question;
      // Use topic questions first, then follow-ups
      const unusedTopicQs = topic.questions
        .map((q, idx) => ({ q, idx }))
        .filter(({ idx }) => !usedQuestions.has(idx));

      if (unusedTopicQs.length > 0 && Math.random() < 0.5) {
        const chosen = pick(unusedTopicQs);
        question = chosen.q;
        usedQuestions.add(chosen.idx);
      } else {
        question = pick(followUps);
      }

      lines.push(`${formatTimestamp(elapsed)} Interviewer: ${question}`);
      elapsed += randInt(3, 8); // brief pause before participant responds

      // Participant responds with varied sentiment
      const sentiment = pick(sentiments);
      const response = buildResponse(participant.name, sentiment);
      lines.push(`${formatTimestamp(elapsed)} ${participant.name}: ${response}`);
      elapsed += randInt(30, 90);
    }

    // Closing
    lines.push("");
    lines.push(
      `${formatTimestamp(elapsed)} Interviewer: That's really helpful. Is there anything else you'd like to add before we wrap up?`
    );
    elapsed += randInt(5, 10);
    const closingResponses = [
      `I think I've covered the main things. Thanks for listening — it's good to know someone's paying attention to this stuff.`,
      `Just that I really hope these changes happen soon. The team is getting impatient.`,
      `No, I think that covers it. I appreciate you taking the time to ask about our experience.`,
      `One last thing — ${pick(painPoints)} But otherwise, I think we hit everything.`,
      `I'd just emphasize that ${pick(quotes)} That's really the core of it for me.`,
    ];
    lines.push(`${formatTimestamp(elapsed)} ${participant.name}: ${pick(closingResponses)}`);
    lines.push("");
  }

  lines.push("[END OF TRANSCRIPT]");

  const slug = topic.topic.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
  const filename = `interview-${slug}-${date}.txt`;

  return { filename, content: lines.join("\n") };
}

export default { generateTranscript };
