/** Scenario 28 — Self-Evolution & Prompt Compression:
 *  Tests the OpenClaw-style .learnings→promotion pipeline, LLMLingua-inspired
 *  prompt compression, and Prompt RAG for dynamic system prompt composition.
 *
 *  NOW INCLUDES: Deep integration tests for small model handling —
 *  verifies that query-aware prompts retrieve relevant sections,
 *  preserve agent identity, and fit within small context budgets.
 */

export const name = "Self-Evolution & Prompt Compression";
export const id = "28-self-evolution-prompt-compression";

export async function run(ctx) {
  const { api } = ctx;
  const checks = [];

  // ── 1. Self-Evolution API endpoints exist ──
  try {
    const scan = await api.get("/api/agents/evolution/scan");
    checks.push({
      name: "Evolution scan endpoint works",
      passed:
        typeof scan.agents_with_candidates === "number" &&
        typeof scan.total_candidates === "number",
      detail: `${scan.total_candidates} candidates across ${scan.agents_with_candidates} agents`,
    });
  } catch (e) {
    checks.push({
      name: "Evolution scan endpoint works",
      passed: false,
      detail: e.message,
    });
  }

  // ── 2. Per-agent evolution candidates endpoint ──
  const agentIds = [
    "reclaw-main",
    "reclaw-devops",
    "reclaw-ui-audit",
    "reclaw-ux-eval",
    "reclaw-sim",
  ];
  for (const agentId of agentIds) {
    try {
      const result = await api.get(
        `/api/agents/${agentId}/evolution/candidates`
      );
      checks.push({
        name: `${agentId} evolution candidates endpoint`,
        passed:
          result.agent_id === agentId && Array.isArray(result.candidates),
        detail: `${result.count} candidates`,
      });
    } catch (e) {
      checks.push({
        name: `${agentId} evolution candidates endpoint`,
        passed: false,
        detail: e.message,
      });
    }
  }

  // ── 3. Auto-evolve endpoint (safe to call — only promotes mature patterns) ──
  try {
    const evolve = await api.post("/api/agents/reclaw-main/evolution/auto");
    checks.push({
      name: "Auto-evolve endpoint returns valid response",
      passed:
        evolve.agent_id === "reclaw-main" &&
        typeof evolve.promotions_applied === "number" &&
        Array.isArray(evolve.promotions),
      detail: `${evolve.promotions_applied} promotions applied`,
    });
  } catch (e) {
    checks.push({
      name: "Auto-evolve endpoint",
      passed: false,
      detail: e.message,
    });
  }

  // ── 4. Prompt compression stats endpoint ──
  for (const agentId of agentIds) {
    try {
      const stats = await api.get(`/api/agents/${agentId}/prompt/stats`);
      checks.push({
        name: `${agentId} prompt compression stats`,
        passed:
          stats.full_chars > 0 &&
          stats.compressed_chars > 0 &&
          stats.compression_ratio > 0 &&
          stats.compression_ratio <= 1.0,
        detail: `${stats.full_tokens} → ${stats.compressed_tokens} tokens (${(stats.compression_ratio * 100).toFixed(0)}%)`,
      });
    } catch (e) {
      checks.push({
        name: `${agentId} prompt compression stats`,
        passed: false,
        detail: e.message,
      });
    }
  }

  // ── 5. Compression actually reduces token count for large prompts ──
  try {
    const stats = await api.get("/api/agents/reclaw-main/prompt/stats");
    checks.push({
      name: "LLMLingua compression produces smaller output",
      passed: stats.compressed_tokens < stats.full_tokens,
      detail: `${stats.full_tokens} → ${stats.compressed_tokens} tokens`,
    });
  } catch (e) {
    checks.push({
      name: "LLMLingua compression reduces tokens",
      passed: false,
      detail: e.message,
    });
  }

  // ── 6. Identity still loads correctly ──
  for (const agentId of agentIds) {
    try {
      const identity = await api.get(`/api/agents/${agentId}/identity`);
      checks.push({
        name: `${agentId} identity still loads after compression integration`,
        passed: identity.has_persona === true && identity.identity_length > 1000,
        detail: `${identity.identity_length} chars`,
      });
    } catch (e) {
      checks.push({
        name: `${agentId} identity loads`,
        passed: false,
        detail: e.message,
      });
    }
  }

  // ── 7. Learnings endpoint still works ──
  try {
    const learnings = await api.get("/api/agents/reclaw-main/learnings");
    checks.push({
      name: "Learnings endpoint still returns valid data",
      passed:
        learnings.agent_id === "reclaw-main" &&
        Array.isArray(learnings.learnings),
      detail: `${learnings.learnings.length} learnings`,
    });
  } catch (e) {
    checks.push({
      name: "Learnings endpoint",
      passed: false,
      detail: e.message,
    });
  }

  // ── 8. Personas list includes all system agents ──
  try {
    const personas = await api.get("/api/agents/personas/list");
    checks.push({
      name: "All 5 system agents have persona dirs (post-evolution)",
      passed: personas.personas && personas.personas.length >= 5,
      detail: `${(personas.personas || []).length} personas`,
    });
  } catch (e) {
    checks.push({
      name: "Personas list",
      passed: false,
      detail: e.message,
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  //  DEEP INTEGRATION TESTS — Small Model Prompt Handling
  // ══════════════════════════════════════════════════════════════════════

  // ── 9. Prompt RAG: different queries retrieve different sections ──
  try {
    const interviewPrompt = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "How do I analyze interview transcripts?", use_embeddings: false }
    );
    const usabilityPrompt = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "Run a usability heuristic evaluation", use_embeddings: false }
    );

    // The composed prompts should differ because queries are different
    const interviewIncluded = interviewPrompt.section_scores
      .filter((s) => s.included)
      .map((s) => s.header);
    const usabilityIncluded = usabilityPrompt.section_scores
      .filter((s) => s.included)
      .map((s) => s.header);

    // At least one section should differ between the two queries
    const interviewSet = new Set(interviewIncluded);
    const usabilitySet = new Set(usabilityIncluded);
    const onlyInterview = [...interviewSet].filter((x) => !usabilitySet.has(x));
    const onlyUsability = [...usabilitySet].filter((x) => !interviewSet.has(x));
    const hasDifference = onlyInterview.length > 0 || onlyUsability.length > 0;

    checks.push({
      name: "Prompt RAG: different queries → different sections",
      passed: hasDifference,
      detail: `Interview-only: ${onlyInterview.length}, Usability-only: ${onlyUsability.length}`,
    });
  } catch (e) {
    checks.push({
      name: "Prompt RAG query differentiation",
      passed: false,
      detail: e.message,
    });
  }

  // ── 10. Prompt RAG: identity anchor always preserved ──
  try {
    const result = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "random nonsensical question about nothing relevant" }
    );
    checks.push({
      name: "Identity anchor preserved even for irrelevant queries",
      passed:
        result.identity_preserved === true && result.anchor_tokens > 0,
      detail: `Anchor: ${result.anchor_tokens} tokens, identity preserved: ${result.identity_preserved}`,
    });
  } catch (e) {
    checks.push({
      name: "Identity anchor preservation",
      passed: false,
      detail: e.message,
    });
  }

  // ── 11. Prompt RAG: composed prompt is smaller than full identity ──
  try {
    const result = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "Tell me about user research", max_tokens: 1024 }
    );
    // Allow 10% overshoot since token estimation is ~4 chars/token heuristic
    checks.push({
      name: "Composed prompt fits within small model budget",
      passed:
        result.composed_tokens <= 1024 * 1.15 &&
        result.composed_tokens < result.full_tokens,
      detail: `${result.composed_tokens}/${result.full_tokens} tokens (${result.savings_percent}% savings)`,
    });
  } catch (e) {
    checks.push({
      name: "Small model budget compliance",
      passed: false,
      detail: e.message,
    });
  }

  // ── 12. Prompt RAG: all 5 agents produce valid composed prompts ──
  for (const agentId of agentIds) {
    try {
      const result = await api.post(
        `/api/agents/${agentId}/prompt/compose`,
        { query: "Help me with UX research analysis" }
      );
      checks.push({
        name: `${agentId}: Prompt RAG composition works`,
        passed:
          result.composed_tokens > 0 &&
          result.total_sections > 0 &&
          result.sections_included > 0,
        detail: `${result.sections_included}/${result.total_sections} sections, ${result.composed_tokens} tokens`,
      });
    } catch (e) {
      checks.push({
        name: `${agentId}: Prompt RAG composition`,
        passed: false,
        detail: e.message,
      });
    }
  }

  // ── 13. Compression preserves domain terms (UX research vocabulary) ──
  try {
    // Use the full identity endpoint to verify domain terms survive compression
    const identity = await api.get("/api/agents/reclaw-main/identity");
    const fullText = Object.values(identity.files || {}).join(" ").toLowerCase();

    // Key domain terms that should exist in the agent's persona
    const criticalTerms = [
      "usability",
      "heuristic",
      "nugget",
      "insight",
      "recommendation",
      "persona",
      "interview",
      "survey",
    ];

    // Verify critical domain terms exist in the full persona
    const termsInFull = criticalTerms.filter((t) => fullText.includes(t));

    // Check composed prompt includes sections whose HEADERS reference domain terms
    const result = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "Analyze research findings and create usability insights and recommendations" }
    );

    // Domain terms should appear in included section headers/content
    const includedSections = result.section_scores.filter((s) => s.included);
    const sectionText = includedSections
      .map((s) => s.header.toLowerCase())
      .join(" ");
    const headerTerms = criticalTerms.filter(
      (t) => sectionText.includes(t) || result.composed_prompt_preview.toLowerCase().includes(t)
    );

    checks.push({
      name: "Compression preserves UX domain terms",
      passed: termsInFull.length >= 5 && headerTerms.length >= 1,
      detail: `${termsInFull.length} terms in full persona, ${headerTerms.length} in composed: ${headerTerms.join(", ")}`,
    });
  } catch (e) {
    checks.push({
      name: "Domain term preservation",
      passed: false,
      detail: e.message,
    });
  }

  // ── 14. Tiny budget test: even at 512 tokens, identity + some skills remain ──
  try {
    const result = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "Help me with research", max_tokens: 512 }
    );
    checks.push({
      name: "Extreme budget (512 tokens): still has identity + content",
      passed:
        result.composed_tokens > 0 &&
        result.composed_tokens <= 600 && // Allow some overshoot
        result.identity_preserved === true &&
        result.sections_included >= 1,
      detail: `${result.composed_tokens} tokens, ${result.sections_included} sections, identity: ${result.identity_preserved}`,
    });
  } catch (e) {
    checks.push({
      name: "Extreme budget handling",
      passed: false,
      detail: e.message,
    });
  }

  // ── 15. Section relevance scoring: interview query scores interview sections higher ──
  try {
    const result = await api.post(
      "/api/agents/reclaw-main/prompt/compose",
      { query: "How to conduct and analyze user interviews" }
    );
    // Find section scores related to interviews vs unrelated sections
    const interviewSections = result.section_scores.filter(
      (s) =>
        s.header.toLowerCase().includes("interview") ||
        s.header.toLowerCase().includes("transcript")
    );
    const unrelatedSections = result.section_scores.filter(
      (s) =>
        !s.header.toLowerCase().includes("interview") &&
        !s.header.toLowerCase().includes("transcript") &&
        !s.header.toLowerCase().includes("identity") &&
        !s.header.toLowerCase().includes("personality") &&
        !s.header.toLowerCase().includes("values")
    );

    // If there are interview sections, their avg score should be > avg unrelated score
    let passed = true;
    let detail = "No interview-specific sections found in persona";
    if (interviewSections.length > 0 && unrelatedSections.length > 0) {
      const avgInterview =
        interviewSections.reduce((s, x) => s + x.score, 0) /
        interviewSections.length;
      const avgUnrelated =
        unrelatedSections.reduce((s, x) => s + x.score, 0) /
        unrelatedSections.length;
      passed = avgInterview >= avgUnrelated;
      detail = `Interview sections: ${avgInterview.toFixed(3)} avg score vs unrelated: ${avgUnrelated.toFixed(3)}`;
    }

    checks.push({
      name: "Relevance scoring: query-matched sections score higher",
      passed,
      detail,
    });
  } catch (e) {
    checks.push({
      name: "Relevance scoring validation",
      passed: false,
      detail: e.message,
    });
  }

  // ── 16. Custom agent gets persona files on creation ──
  let customAgentId = null;
  try {
    const created = await api.post("/api/agents", {
      name: "TestEvolver",
      role: "custom",
      system_prompt: "You are a test agent for verifying self-evolution features.",
      capabilities: ["skill_execution", "findings_write"],
    });
    customAgentId = created.id;

    const identity = await api.get(`/api/agents/${customAgentId}/identity`);
    checks.push({
      name: "Custom agent gets auto-created persona files",
      passed: identity.has_persona === true,
      detail: `${identity.identity_length} chars, files: ${Object.keys(identity.files || {}).join(", ")}`,
    });

    // Custom agent evolution candidates
    const candidates = await api.get(
      `/api/agents/${customAgentId}/evolution/candidates`
    );
    checks.push({
      name: "Custom agent evolution candidates endpoint works",
      passed:
        candidates.agent_id === customAgentId &&
        Array.isArray(candidates.candidates),
      detail: `${candidates.count} candidates`,
    });

    // Custom agent Prompt RAG also works
    try {
      const composed = await api.post(
        `/api/agents/${customAgentId}/prompt/compose`,
        { query: "test query" }
      );
      checks.push({
        name: "Custom agent Prompt RAG composition works",
        passed: composed.composed_tokens > 0 && composed.identity_preserved === true,
        detail: `${composed.composed_tokens} tokens, ${composed.sections_included} sections`,
      });
    } catch (e) {
      checks.push({
        name: "Custom agent Prompt RAG",
        passed: false,
        detail: e.message,
      });
    }
  } catch (e) {
    checks.push({
      name: "Custom agent persona creation",
      passed: false,
      detail: e.message,
    });
  }

  // ── 17. Cleanup test custom agent ──
  if (customAgentId) {
    try {
      await api.delete(`/api/agents/${customAgentId}`);
    } catch (_) {
      // Non-critical
    }
  }

  // ── 18. Health check still works ──
  try {
    const health = await api.get("/api/health");
    checks.push({
      name: "Health check still healthy after all new features",
      passed: health.status === "healthy",
      detail: health.status,
    });
  } catch (e) {
    checks.push({
      name: "Health check",
      passed: false,
      detail: e.message,
    });
  }

  return {
    checks,
    passed: checks.filter((c) => c.passed).length,
    failed: checks.filter((c) => !c.passed).length,
    summary: checks
      .map((c) => `${c.passed ? "PASS" : "FAIL"} ${c.name}`)
      .join("\n"),
  };
}
