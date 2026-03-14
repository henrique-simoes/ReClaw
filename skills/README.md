# ReClaw Skills

Skills are modular, self-contained packages that extend ReClaw's UXR capabilities.

## Skill Structure (follows OpenClaw AgentSkills standard)

```
skill-name/
├── SKILL.md              # Required — YAML frontmatter + instructions
├── scripts/              # Optional — executable code (Python)
├── references/           # Optional — docs loaded into context as needed
└── assets/               # Optional — templates, output files
```

## Frontmatter Schema

```yaml
---
name: skill-name
description: What it does + when to trigger it
metadata:
  reclaw:
    emoji: "🔍"
    phase: discover|define|develop|deliver
    type: qualitative|quantitative|mixed
    version: "1.0.0"
    tags: [interview, synthesis]
---
```

## Adding Skills

1. Create a directory under the appropriate phase: `skills/{phase}/{skill-name}/`
2. Write `SKILL.md` with proper frontmatter
3. Add scripts, references, and assets as needed
4. ReClaw auto-discovers skills on startup
