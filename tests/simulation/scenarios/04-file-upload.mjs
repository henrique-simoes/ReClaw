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
