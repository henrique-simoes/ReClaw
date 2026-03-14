---
name: kappa-thematic-analysis
description: "Thematic analysis with Cohen's/Fleiss' Kappa intercoder reliability.
Supports agent-only, human-only, or agent+human coding with reliability measurement."
metadata:
  reclaw:
    phase: define
    type: qualitative
    version: "1.0.0"
---

# Kappa Intercoder Thematic Analysis

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
- Final themes with prevalence data
