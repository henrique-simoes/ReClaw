#!/usr/bin/env python3
"""Generate SKILL.md files following OpenClaw AgentSkills standard.

Creates proper SKILL.md with YAML frontmatter for each skill definition.
Output: skills/{phase}/{skill-name}/SKILL.md
"""

import json
from pathlib import Path

DEFINITIONS_DIR = Path(__file__).parent.parent / "backend" / "app" / "skills" / "definitions"
SKILLS_DIR = Path(__file__).parent.parent / "skills"

# Skill detail descriptions for SKILL.md body
SKILL_DETAILS = {
    "user-interviews": {
        "body": """# User Interviews

## Capabilities

- Generate semi-structured interview guides from research questions and project context
- Process interview transcripts (TXT, PDF, DOCX) — extract nuggets, themes, patterns
- Identify follow-up questions and research gaps
- Synthesize findings across multiple interviews with cross-cutting themes
- Calculate intercoder reliability when multiple coders are involved

## Workflow

1. **Plan** — Provide research questions → receive interview guide with probes
2. **Conduct** — Use the guide (ReClaw provides facilitation tips)
3. **Upload** — Drop transcript files into the project
4. **Analyze** — ReClaw extracts nuggets, tags themes, scores confidence
5. **Synthesize** — Cross-interview patterns → facts → insights → recommendations

## Input

- Research questions (text)
- Interview transcripts (TXT, PDF, DOCX, MD)
- Project context (auto-loaded from context layers)

## Output

- Interview guide (Markdown)
- Nuggets with source references and timestamps
- Thematic analysis with strength indicators
- Pain points with severity ratings
- Synthesis report with cross-cutting themes and evidence chains

## Best Practices

- 5-8 participants per segment for saturation
- 45-60 min per session
- Always record with consent
- "Tell me more" > "Did you like it?"
- Probes yield the best insights, not scripted questions""",
    },
    "survey-ai-detection": {
        "body": """# Survey AI Response Detection

Detect AI-generated survey responses using multiple heuristic and statistical methods.

## Methods (applied in order)

1. **Linguistic analysis** — Vocabulary diversity (Type-Token Ratio), perplexity scoring, burstiness patterns, formality consistency
2. **Response patterns** — Timing analysis, straightlining detection, semantic similarity clustering between responses
3. **Behavioral signals** — Completion time vs expected, sequential patterns, copy-paste indicators
4. **Content quality** — Generic/surface-level answers, absence of personal anecdotes, overly structured responses
5. **Statistical outliers** — Responses deviating from expected distributions

## References

Based on academic research:
- Wu et al. 2025 — "A Survey on LLM-Generated Text Detection" (ACL Anthology)
- Yang et al. 2024 — "A Survey on Detection of LLMs-Generated Content" (EMNLP Findings)
- Dhaini et al. 2023 — "Detecting ChatGPT: State of Detection" (RANLP)

See `references/detection-methods.md` for detailed algorithm descriptions.

## Input

- Survey response data (CSV, JSON, or text)
- Expected completion time (optional)
- Response metadata (timestamps, device info — if available)

## Output

- Per-response flag level (high/medium/low) with confidence score
- Detection method evidence for each flag
- Aggregate statistics (flag rate, clean dataset size)
- Recommendation per response: remove, review, or keep""",
    },
    "kappa-thematic-analysis": {
        "body": """# Kappa Intercoder Thematic Analysis

Rigorous thematic analysis with Cohen's/Fleiss' Kappa intercoder reliability measurement.

## Modes

- **Agent-only** — ReClaw generates two independent codings and measures agreement
- **Agent + Human** — Human codes, ReClaw codes independently, Kappa measured between them
- **Multi-coder** — Fleiss' Kappa for 3+ coders

## Kappa Interpretation (Landis & Koch 1977)

| Kappa | Interpretation |
|-------|---------------|
| < 0.00 | Poor |
| 0.00–0.20 | Slight |
| 0.21–0.40 | Fair |
| 0.41–0.60 | Moderate |
| 0.61–0.80 | Substantial |
| 0.81–1.00 | Almost perfect |

Target: ≥ 0.60 (moderate) minimum, ≥ 0.80 (excellent) preferred.

## Workflow

1. Develop codebook (inductive, deductive, or hybrid)
2. Pilot coding round → measure Kappa
3. Refine codebook for low-agreement codes
4. Full coding with reliability reporting
5. Theme development from validated codes

## Output

- Codebook with definitions and examples
- Per-code Kappa scores
- Overall reliability metrics
- Coding disagreement analysis
- Final themes with prevalence data""",
    },
    "taxonomy-generator": {
        "body": """# Taxonomy Generator

Generate multi-level, MECE taxonomies for organizing research and product knowledge.

## Taxonomy Levels

1. **Company** — Business domains, user segments, product areas
2. **Product** — Features, user flows, content types, interaction patterns
3. **Project** — Research themes, methods, finding categories, phases
4. **Task** — Task types, priorities, skill categories
5. **Feature** — Component types, states, variations

## Principles

- **MECE** — Mutually Exclusive, Collectively Exhaustive where possible
- **Evidence-based** — Categories derived from research data, not assumptions
- **Evolvable** — Governance process for adding/modifying categories
- **Cross-referenced** — Links between levels (e.g., feature → product area)

## Input

- Project context, company context, existing findings
- Or: raw data to taxonomize (research notes, feature lists, etc.)

## Output

- Hierarchical taxonomy per level
- Tag recommendations
- Cross-reference map between levels
- Governance documentation""",
    },
}


def generate_skill_md(name, defn, detail=None):
    """Generate a SKILL.md file following OpenClaw standard."""
    display = defn.get("display_name", name.replace("-", " ").title())
    desc = defn.get("description", "")
    phase = defn.get("phase", "discover")
    skill_type = defn.get("skill_type", "mixed")
    version = defn.get("version", "1.0.0")

    # Build frontmatter
    lines = [
        "---",
        f"name: {name}",
        f"description: \"{desc}\"",
        "metadata:",
        "  reclaw:",
        f"    phase: {phase}",
        f"    type: {skill_type}",
        f"    version: \"{version}\"",
        "---",
        "",
    ]

    # Add body
    if detail and "body" in detail:
        lines.append(detail["body"].strip())
    else:
        # Generate a standard body
        lines.extend([
            f"# {display}",
            "",
            f"{desc}",
            "",
            f"## Phase",
            "",
            f"Double Diamond: **{phase.title()}**",
            "",
            f"## Type",
            "",
            f"**{skill_type.title()}** research method",
            "",
            "## Workflow",
            "",
            "1. **Plan** — Generate a research plan with objectives, methods, and timeline",
            "2. **Execute** — Process input data (files, context) through the analysis",
            "3. **Validate** — Self-check findings against sources, score confidence",
            "4. **Report** — Structured output with nuggets, facts, insights, recommendations",
            "",
            "## Input",
            "",
            "- Project files (PDF, DOCX, TXT, CSV, MD)",
            "- Project and company context (auto-loaded)",
            "- User instructions and task context",
            "",
            "## Output",
            "",
            "- Nuggets with source references",
            "- Facts verified against evidence",
            "- Insights with confidence scoring",
            "- Actionable recommendations with priority/effort ratings",
        ])

    return "\n".join(lines) + "\n"


def main():
    """Generate SKILL.md for all skill definitions."""
    if not DEFINITIONS_DIR.exists():
        print(f"Definitions directory not found: {DEFINITIONS_DIR}")
        return

    count = 0
    for json_file in sorted(DEFINITIONS_DIR.glob("*.json")):
        if json_file.name.startswith("_"):
            continue

        defn = json.loads(json_file.read_text())
        name = defn["name"]
        phase = defn.get("phase", "discover")

        # Determine output path
        skill_dir = SKILLS_DIR / phase / name
        skill_dir.mkdir(parents=True, exist_ok=True)

        # Get detailed body if available
        detail = SKILL_DETAILS.get(name)

        # Write SKILL.md
        content = generate_skill_md(name, defn, detail)
        (skill_dir / "SKILL.md").write_text(content, encoding="utf-8")

        count += 1
        print(f"  ✓ {phase}/{name}/SKILL.md")

    print(f"\n✅ Generated {count} SKILL.md files")


if __name__ == "__main__":
    main()
