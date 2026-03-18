"""Intercoder reliability — true dual-coding with Python Kappa calculation.

Implements a multi-step pipeline:
1. First LLM pass: Coder A codes the data
2. Second LLM pass: Coder B codes the same data independently
3. Python calculates Cohen's Kappa from the two coding matrices
4. Disagreements are identified and reconciled

This replaces the single-prompt approach where the LLM was asked to
"calculate Kappa" (which produced unreliable numbers).
"""

import json
import uuid
from collections import Counter

from app.core.ollama import ollama
from app.skills.base import BaseSkill, SkillInput, SkillOutput, SkillPhase, SkillType
from app.skills.skill_factory import _extract_text_from_files, _parse_json_response


def cohen_kappa(coder_a: list[list[str]], coder_b: list[list[str]], all_codes: list[str]) -> dict:
    """Calculate Cohen's Kappa from two sets of multi-label codings.

    For multi-label coding (each item can have multiple codes), we calculate
    Kappa per code using binary agreement (code present/absent for each item).

    Args:
        coder_a: List of code lists, one per item. e.g. [["nav", "ux"], ["perf"]]
        coder_b: Same structure from second coder.
        all_codes: Complete list of unique codes across both coders.

    Returns:
        Dict with overall kappa, per-code kappa, interpretation, etc.
    """
    n_items = len(coder_a)
    if n_items == 0 or not all_codes:
        return {
            "kappa": 0.0, "interpretation": "poor",
            "observed_agreement": 0.0, "expected_agreement": 0.0,
            "n_items_coded": 0, "n_codes_used": 0,
            "per_code_kappa": [], "low_agreement_codes": [],
        }

    per_code_results = []
    total_agree = 0
    total_items_checked = 0

    for code in all_codes:
        # Binary vectors: 1 if code present, 0 if not
        a_binary = [1 if code in items else 0 for items in coder_a]
        b_binary = [1 if code in items else 0 for items in coder_b]

        # Confusion matrix for this code
        # tp = both say yes, tn = both say no, fp = A no B yes, fn = A yes B no
        tp = sum(1 for a, b in zip(a_binary, b_binary) if a == 1 and b == 1)
        tn = sum(1 for a, b in zip(a_binary, b_binary) if a == 0 and b == 0)
        fp = sum(1 for a, b in zip(a_binary, b_binary) if a == 0 and b == 1)
        fn = sum(1 for a, b in zip(a_binary, b_binary) if a == 1 and b == 0)

        po = (tp + tn) / n_items  # observed agreement
        # Expected agreement by chance
        pa = ((tp + fn) / n_items) * ((tp + fp) / n_items)
        pn = ((tn + fp) / n_items) * ((tn + fn) / n_items)
        pe = pa + pn

        if pe == 1.0:
            code_kappa = 1.0 if po == 1.0 else 0.0
        else:
            code_kappa = (po - pe) / (1 - pe)

        per_code_results.append({
            "code": code,
            "agreement_pct": round(po * 100, 1),
            "kappa": round(code_kappa, 3),
            "frequency_a": tp + fn,
            "frequency_b": tp + fp,
        })

        total_agree += po
        total_items_checked += 1

    # Overall kappa = average of per-code kappas (macro average)
    overall_kappa = sum(r["kappa"] for r in per_code_results) / len(per_code_results) if per_code_results else 0.0
    overall_agreement = total_agree / total_items_checked if total_items_checked > 0 else 0.0

    # Landis & Koch interpretation
    if overall_kappa < 0.0:
        interpretation = "poor"
    elif overall_kappa <= 0.20:
        interpretation = "slight"
    elif overall_kappa <= 0.40:
        interpretation = "fair"
    elif overall_kappa <= 0.60:
        interpretation = "moderate"
    elif overall_kappa <= 0.80:
        interpretation = "substantial"
    else:
        interpretation = "almost_perfect"

    low_agreement = [r for r in per_code_results if r["kappa"] < 0.60]

    return {
        "kappa": round(overall_kappa, 3),
        "interpretation": interpretation,
        "observed_agreement": round(overall_agreement, 3),
        "expected_agreement": 0.0,  # per-code Pe varies; overall is the macro avg
        "n_items_coded": n_items,
        "n_codes_used": len(all_codes),
        "per_code_kappa": per_code_results,
        "low_agreement_codes": [
            {"code": r["code"], "kappa": r["kappa"], "issue": "Low inter-coder agreement",
             "resolution": "Review code definition for ambiguity"}
            for r in low_agreement
        ],
    }


# Prompts for the two independent coding passes

CODER_A_PROMPT = """You are Coder A performing qualitative coding on research data.

CODING RULES:
- Code MEANINGFUL PHRASES (3-30 words), never single words
- Each coded segment must be a verbatim or closely paraphrased phrase from the data
- Provide source attribution for each coded segment
- Use the codebook if provided; create new codes if needed (inductive coding)

Context: {context}

Data to code:
{content}

Respond in JSON:
{{
  "codebook": [
    {{"code": "code-name", "definition": "clear definition", "inclusion_criteria": "when to apply", "exclusion_criteria": "when NOT to apply", "examples": ["example phrase"]}}
  ],
  "coding_results": [
    {{"item_id": "seg_1", "text": "verbatim phrase (3-30 words)", "source": "filename or location", "codes": ["code1", "code2"]}}
  ]
}}"""

CODER_B_PROMPT = """You are Coder B performing INDEPENDENT qualitative coding on research data.
You must code the data using the provided codebook, applying your own judgment independently.

IMPORTANT: Apply codes based solely on your interpretation. Do NOT try to match any previous coding.

CODING RULES:
- Code MEANINGFUL PHRASES (3-30 words), never single words
- Each coded segment must be a verbatim or closely paraphrased phrase from the data
- Use the codebook provided below — apply codes where they fit

Codebook:
{codebook}

Context: {context}

Data to code (use the SAME segments as listed below):
{segments}

For each segment, assign codes from the codebook based on your independent judgment.

Respond in JSON:
{{
  "coding_results": [
    {{"item_id": "seg_1", "codes": ["code1", "code2"]}}
  ]
}}"""

RECONCILIATION_PROMPT = """You are reconciling disagreements between two independent coders.

Below are segments where the two coders disagreed on which codes to apply.
For each disagreement, decide on the FINAL code assignment and briefly explain why.

Codebook:
{codebook}

Disagreements:
{disagreements}

Respond in JSON:
{{
  "reconciled": [
    {{"item_id": "seg_1", "final_codes": ["code1"], "rationale": "brief explanation"}}
  ],
  "codebook_refinements": [
    {{"code": "code-name", "issue": "why it caused disagreement", "refined_definition": "improved definition"}}
  ],
  "themes": [
    {{"name": "theme name", "definition": "what this theme captures", "codes": ["code1", "code2"], "prevalence": "dominant|common|minor", "description": "narrative description"}}
  ]
}}"""


class KappaIntercoderSkill(BaseSkill):
    """True dual-coding thematic analysis with Python-calculated Kappa.

    This skill runs TWO separate LLM calls (Coder A and Coder B),
    then calculates Cohen's Kappa in Python with actual math — not
    LLM-generated numbers.
    """

    @property
    def name(self) -> str:
        return "kappa-thematic-analysis"

    @property
    def display_name(self) -> str:
        return "Kappa Intercoder Thematic Analysis"

    @property
    def description(self) -> str:
        return (
            "True dual-coding thematic analysis with Python-calculated Cohen's Kappa. "
            "Runs two independent LLM coding passes, calculates Kappa with actual math, "
            "and reconciles disagreements. Follows Landis & Koch interpretation scale."
        )

    @property
    def phase(self) -> SkillPhase:
        return SkillPhase.DEFINE

    @property
    def skill_type(self) -> SkillType:
        return SkillType.QUALITATIVE

    @property
    def version(self) -> str:
        return "3.0.0"

    async def plan(self, skill_input: SkillInput) -> dict:
        ctx = skill_input.project_context or skill_input.user_context or "General UX research"
        prompt = (
            f"Design a Kappa-validated thematic analysis process.\nContext: {ctx}\n\n"
            "Include:\n"
            "1. **Codebook development** (inductive/deductive/hybrid approach)\n"
            "2. **Dual-coding protocol** — two independent coding passes\n"
            "3. **Cohen's Kappa calculation** — K = (Po - Pe) / (1 - Pe)\n"
            "4. **Disagreement resolution** and codebook refinement\n"
            "5. **Minimum thresholds** — Kappa >= 0.60 for exploratory, >= 0.80 for confirmatory\n"
            "Format as Markdown."
        )
        resp = await ollama.chat(messages=[{"role": "user", "content": prompt}], temperature=0.7)
        return {"skill": self.name, "plan": resp.get("message", {}).get("content", "")}

    async def execute(self, skill_input: SkillInput) -> SkillOutput:
        content = _extract_text_from_files(skill_input.files) if skill_input.files else ""
        if not content and not skill_input.user_context:
            return SkillOutput(success=False, summary="No input provided.", errors=["Provide files or context."])

        from pathlib import Path
        file_sources = [Path(f).name for f in skill_input.files] if skill_input.files else []
        source_label = ", ".join(file_sources[:3]) if file_sources else self.name

        ctx = "\n".join(filter(None, [
            skill_input.company_context, skill_input.project_context, skill_input.user_context
        ]))

        # --- Step 1: Coder A — open coding ---
        prompt_a = CODER_A_PROMPT.format(
            context=ctx or "N/A",
            content=content or skill_input.user_context or "N/A",
        )
        resp_a = await ollama.chat(
            messages=[{"role": "user", "content": prompt_a}],
            temperature=0.3,
        )
        data_a = _parse_json_response(resp_a.get("message", {}).get("content", ""))

        codebook_entries = data_a.get("codebook", [])
        coding_a = data_a.get("coding_results", [])

        if not coding_a:
            return SkillOutput(
                success=False, summary="Coder A produced no coding results.",
                errors=["First coding pass returned empty results."],
            )

        # --- Step 2: Coder B — independent re-coding ---
        codebook_text = json.dumps(codebook_entries, indent=2)
        segments_text = json.dumps(
            [{"item_id": r["item_id"], "text": r.get("text", "")} for r in coding_a],
            indent=2,
        )

        prompt_b = CODER_B_PROMPT.format(
            codebook=codebook_text,
            context=ctx or "N/A",
            segments=segments_text,
        )
        resp_b = await ollama.chat(
            messages=[{"role": "user", "content": prompt_b}],
            temperature=0.3,
        )
        data_b = _parse_json_response(resp_b.get("message", {}).get("content", ""))
        coding_b = data_b.get("coding_results", [])

        # Build lookup for Coder B results
        b_by_id = {r["item_id"]: r.get("codes", []) for r in coding_b}

        # --- Step 3: Calculate Cohen's Kappa in Python ---
        all_codes_set: set[str] = set()
        coder_a_codes: list[list[str]] = []
        coder_b_codes: list[list[str]] = []
        combined_results = []

        for item in coding_a:
            item_id = item["item_id"]
            a_codes = item.get("codes", [])
            b_codes = b_by_id.get(item_id, [])
            all_codes_set.update(a_codes)
            all_codes_set.update(b_codes)
            coder_a_codes.append(a_codes)
            coder_b_codes.append(b_codes)

            agreed = set(a_codes) == set(b_codes)
            combined_results.append({
                "item_id": item_id,
                "text": item.get("text", ""),
                "source": item.get("source", source_label),
                "coder_a": a_codes,
                "coder_b": b_codes,
                "final": list(set(a_codes) | set(b_codes)),  # union until reconciliation
                "agreed": agreed,
            })

        all_codes = sorted(all_codes_set)
        reliability = cohen_kappa(coder_a_codes, coder_b_codes, all_codes)

        # --- Step 4: Reconcile disagreements ---
        disagreements = [r for r in combined_results if not r["agreed"]]
        themes = []
        codebook_refinements = []

        if disagreements:
            disagree_text = json.dumps(
                [{"item_id": d["item_id"], "text": d["text"],
                  "coder_a": d["coder_a"], "coder_b": d["coder_b"]}
                 for d in disagreements],
                indent=2,
            )
            prompt_r = RECONCILIATION_PROMPT.format(
                codebook=codebook_text,
                disagreements=disagree_text,
            )
            resp_r = await ollama.chat(
                messages=[{"role": "user", "content": prompt_r}],
                temperature=0.3,
            )
            data_r = _parse_json_response(resp_r.get("message", {}).get("content", ""))

            # Apply reconciled codes
            reconciled_by_id = {r["item_id"]: r for r in data_r.get("reconciled", [])}
            for item in combined_results:
                if item["item_id"] in reconciled_by_id:
                    item["final"] = reconciled_by_id[item["item_id"]].get("final_codes", item["final"])

            themes = data_r.get("themes", [])
            codebook_refinements = data_r.get("codebook_refinements", [])
        else:
            # All agreed — still need themes, do a quick theme extraction
            prompt_themes = (
                f"Group these codes into themes following Braun & Clarke:\n"
                f"Codes: {json.dumps(all_codes)}\n"
                f"Codebook: {codebook_text}\n\n"
                f"Respond in JSON:\n"
                f'{{"themes": [{{"name": "...", "definition": "...", "codes": ["..."], '
                f'"prevalence": "dominant|common|minor", "description": "..."}}]}}'
            )
            resp_t = await ollama.chat(
                messages=[{"role": "user", "content": prompt_themes}],
                temperature=0.3,
            )
            data_t = _parse_json_response(resp_t.get("message", {}).get("content", ""))
            themes = data_t.get("themes", [])

        # --- Build output ---
        nuggets = [
            {"text": r["text"], "source": r.get("source", source_label),
             "tags": r["final"]}
            for r in combined_results
        ]
        insights = [
            {"text": f"Kappa = {reliability['kappa']} ({reliability['interpretation']}). "
                     f"{len(disagreements)} of {len(combined_results)} segments had disagreements.",
             "confidence": "high" if reliability["kappa"] >= 0.60 else "medium"}
        ]

        # Add theme-based insights
        for theme in themes:
            insights.append({
                "text": f"Theme: {theme.get('name', 'Unnamed')} — {theme.get('description', '')}",
                "confidence": "medium",
            })

        full_artifact = {
            "codebook": codebook_entries,
            "codebook_refinements": codebook_refinements,
            "reliability": reliability,
            "coding_results": combined_results,
            "themes": themes,
        }

        summary = (
            f"Dual-coding analysis complete. Cohen's Kappa = {reliability['kappa']} "
            f"({reliability['interpretation']}). "
            f"{len(codebook_entries)} codes, {len(combined_results)} segments coded, "
            f"{len(disagreements)} disagreements reconciled, {len(themes)} themes identified."
        )

        return SkillOutput(
            success=True,
            summary=summary,
            nuggets=nuggets,
            insights=insights,
            artifacts={
                "kappa_analysis.json": json.dumps(full_artifact, indent=2),
            },
        )
