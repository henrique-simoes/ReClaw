---
name: taxonomy-generator
description: "Generate multi-level taxonomies for projects, tasks, features, and companies.
Supports fine-tuning depth by context level (company-wide, product, feature, task)."
metadata:
  reclaw:
    phase: define
    type: mixed
    version: "1.0.0"
---

# Taxonomy Generator

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
- Governance documentation
