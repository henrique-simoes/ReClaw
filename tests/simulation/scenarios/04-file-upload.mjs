/** Scenario 04 — File Upload: generate and upload research data. */

export const name = "File Upload & Ingestion";
export const id = "04-file-upload";

import { writeFileSync, mkdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function run(ctx) {
  const { api, page, screenshot, generators } = ctx;
  const checks = [];

  if (!ctx.projectId) {
    return { checks: [{ name: "Skip", passed: false, detail: "No project ID" }], passed: 0, failed: 1 };
  }

  // Generate synthetic research files
  const tmpDir = join(__dirname, "..", ".results", "generated-data");
  mkdirSync(tmpDir, { recursive: true });

  const files = [];

  // 1. Interview transcript
  const interview = generators.interviews.generateTranscript(2);
  const interviewPath = join(tmpDir, interview.filename);
  writeFileSync(interviewPath, interview.content);
  files.push({ path: interviewPath, name: interview.filename, type: "interview" });

  // 2. Survey CSV
  const survey = generators.surveys.generateSurveyCSV(15);
  const surveyPath = join(tmpDir, survey.filename);
  writeFileSync(surveyPath, survey.content);
  files.push({ path: surveyPath, name: survey.filename, type: "survey" });

  // 3. Usability test report
  const usability = generators.usabilityTests.generateUsabilityReport(4);
  const usabilityPath = join(tmpDir, usability.filename);
  writeFileSync(usabilityPath, usability.content);
  files.push({ path: usabilityPath, name: usability.filename, type: "usability" });

  // 4. Field notes
  const notes = generators.researchNotes.generateFieldNotes();
  const notesPath = join(tmpDir, notes.filename);
  writeFileSync(notesPath, notes.content);
  files.push({ path: notesPath, name: notes.filename, type: "notes" });

  // 5. Competitive analysis document
  const competitorContent = `# Competitive Analysis Report
## Product: ProjectManager Pro
### Overview
ProjectManager Pro is a mid-market research ops tool targeting UX teams of 5-20.
### Strengths
- Integrated participant recruitment
- Real-time collaboration on findings
- Automated transcript tagging (AI-powered)
### Weaknesses
- No offline support
- Limited export formats (PDF only)
- Pricing starts at $49/user/month — expensive for small teams
### Key Differentiators vs ReClaw
- They have recruitment built-in; we focus on analysis depth
- Their AI tagging is faster but less accurate
- We support more file formats and have better RAG search
## Product: InsightHub
### Overview
InsightHub targets enterprise research teams (50+).
### Strengths
- Robust permissions and governance
- SOC 2 compliance
- White-label reporting
### Weaknesses
- Complex setup (avg 3 weeks onboarding)
- Poor mobile experience
- No agent or automation capabilities
### Market Positioning
ReClaw sits between these two — more powerful than ProjectManager Pro, more accessible than InsightHub.
`;
  const competitorPath = join(tmpDir, "competitor-analysis.md");
  writeFileSync(competitorPath, competitorContent);
  files.push({ path: competitorPath, name: "competitor-analysis.md", type: "competitive" });

  // 6. Analytics/metrics data
  const analyticsContent = `date,page,unique_visitors,bounce_rate,avg_session_duration_sec,conversions,error_count
2024-01-08,/dashboard,1250,32.5,185,45,2
2024-01-08,/projects,890,28.1,142,38,0
2024-01-08,/findings,720,41.2,95,22,1
2024-01-08,/chat,650,15.3,310,55,3
2024-01-08,/settings,180,55.8,45,5,0
2024-01-15,/dashboard,1380,30.1,195,52,1
2024-01-15,/projects,960,26.5,155,42,0
2024-01-15,/findings,810,38.9,110,28,2
2024-01-15,/chat,780,12.8,340,68,1
2024-01-15,/settings,200,52.3,50,8,0
2024-01-22,/dashboard,1520,28.7,210,61,0
2024-01-22,/projects,1050,24.2,168,48,1
2024-01-22,/findings,900,36.4,125,35,0
2024-01-22,/chat,920,11.5,365,82,2
2024-01-22,/settings,220,48.9,55,10,0
`;
  const analyticsPath = join(tmpDir, "analytics-weekly.csv");
  writeFileSync(analyticsPath, analyticsContent);
  files.push({ path: analyticsPath, name: "analytics-weekly.csv", type: "analytics" });

  // 7. Stakeholder interview
  const stakeholderContent = `Stakeholder Interview — Product Direction
Participant: Maria Santos (VP of Product)
Date: 2024-01-20
Duration: 30 minutes

[00:00] Interviewer: Thanks for making time, Maria. Can you walk me through the product vision for Q2?

[00:15] Maria: Absolutely. Our main focus for Q2 is reducing time-to-insight. Right now, researchers spend about 60% of their time organizing data and only 40% actually analyzing it. We want to flip that ratio.

[02:30] Interviewer: What specific features do you see enabling that?

[03:00] Maria: Three things — first, better AI-assisted tagging. Our users love the concept but the accuracy needs to go from 70% to 90%+. Second, we need template systems so researchers aren't starting from scratch every project. Third, and this is the big one — automated synthesis. We want the system to suggest facts and insights based on patterns it sees across nuggets.

[06:45] Interviewer: How does the agent architecture fit into this?

[07:15] Maria: The agents are key. Think of them as research assistants that work 24/7. They should be able to monitor incoming data, flag interesting patterns, and draft preliminary findings. The researcher reviews and refines rather than creating from scratch.

[10:30] Interviewer: Any concerns about the agent approach?

[11:00] Maria: Trust is the big one. Researchers need to feel confident that the AI isn't hallucinating or missing context. That's why the verification step is critical — every AI-generated finding needs a clear evidence trail back to source data.

[15:00] Interviewer: What about the competitive landscape?

[15:30] Maria: InsightHub is our main competitor in enterprise but they're expensive and slow to deploy. ProjectManager Pro is nipping at our heels in the SMB space. Our edge is the combination of AI depth with user control — nobody else is doing agent-based research automation at our level.

[20:00] Interviewer: Any other priorities we should know about?

[20:30] Maria: Mobile experience. 40% of our users access the platform on mobile at least once a week, but our mobile UX is honestly bad. That needs to be a Q2 priority alongside the AI features.

[END OF TRANSCRIPT]
`;
  const stakeholderPath = join(tmpDir, "stakeholder-interview-santos.txt");
  writeFileSync(stakeholderPath, stakeholderContent);
  files.push({ path: stakeholderPath, name: "stakeholder-interview-santos.txt", type: "stakeholder" });

  // 8. Design system audit notes
  const designContent = `# Design System Audit Notes
## Date: 2024-01-18
## Auditor: Design Team

### Color Consistency
- Primary brand color (reclaw-600) used inconsistently — 3 different hex values found
- Dark mode contrast ratios: 2 violations on findings cards (AA fail)
- Status colors (green/yellow/red) not colorblind-safe — need patterns or icons

### Typography
- 4 different font sizes used for "body text" across views
- Chat view uses 14px, Findings uses 13px, Settings uses 15px — needs standardization
- Line height inconsistent: 1.4 in chat, 1.6 in findings, 1.5 in docs

### Component Patterns
- Button styles: 6 different button patterns found (should be 3: primary, secondary, ghost)
- Card designs differ between Kanban, Findings, and Agent views
- Modal/dialog patterns: 2 different close button positions (top-right in settings, top-left in search)

### Spacing
- Padding values: 12px, 16px, 20px, 24px used inconsistently
- Should standardize on 4px grid: 4, 8, 12, 16, 20, 24

### Accessibility
- Focus indicators missing on 40% of interactive elements
- Tab order broken in Kanban board — skips from column header to last card
- Screen reader labels missing on icon-only buttons (7 instances)

### Recommendations
1. Create design tokens file with all values
2. Audit and fix all contrast ratios
3. Standardize button and card components
4. Add focus indicators globally
5. Fix tab order in Kanban and Agent views
`;
  const designPath = join(tmpDir, "design-system-audit.md");
  writeFileSync(designPath, designContent);
  files.push({ path: designPath, name: "design-system-audit.md", type: "design-audit" });

  // Upload each file via API
  for (const file of files) {
    try {
      const result = await api.uploadFile(ctx.projectId, file.path, file.name);
      checks.push({
        name: `Upload ${file.type}: ${file.name}`,
        passed: true,
        detail: `Chunks: ${result.chunks_indexed || result.chunks || "unknown"}`,
      });
    } catch (e) {
      checks.push({ name: `Upload ${file.type}: ${file.name}`, passed: false, detail: e.message });
    }
  }

  // Verify files via API
  try {
    const fileList = await api.get(`/api/files/${ctx.projectId}`);
    const fileCount = fileList.files?.length || (Array.isArray(fileList) ? fileList.length : 0);
    checks.push({ name: "Files listed in API", passed: fileCount >= files.length, detail: `${fileCount} files` });
  } catch (e) {
    checks.push({ name: "Files listed in API", passed: false, detail: e.message });
  }

  // Verify indexing stats
  try {
    const stats = await api.get(`/api/files/${ctx.projectId}/stats`);
    const chunks = stats.total_chunks || stats.indexed_chunks || 0;
    checks.push({ name: "Chunks indexed", passed: chunks > 0, detail: `${chunks} chunks` });
  } catch (e) {
    checks.push({ name: "Chunks indexed", passed: false, detail: e.message });
  }

  // Verify in UI — navigate to chat and check
  await page.goto("http://localhost:3000", { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await screenshot("04-after-upload");

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks.map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}: ${c.detail}`).join("\n"),
  };
}
