---
name: survey-ai-detection
description: "Detect AI-generated survey responses using multiple heuristic and statistical methods.

Based on academic research (Wu et al. 2025, Yang et al. 2024):
- Linguistic analysis: perplexity scoring, burstiness, vocabulary diversity
- Response pattern analysis: timing, straightlining, semantic similarity between responses
- Statistical methods: response length distribution, lexical richness (TTR), coherence scores
- Behavioral signals: completion time vs expected, copy-paste indicators, IP/device clustering"
metadata:
  reclaw:
    phase: discover
    type: quantitative
    version: "1.0.0"
---

# Survey AI Response Detection

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
- Recommendation per response: remove, review, or keep
