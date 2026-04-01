---
title: Discoverability check for documented solutions in project instruction files
date: 2026-03-30
category: skill-design
module: compound-engineering
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Adding a post-write verification step to a knowledge-compounding skill
  - Ensuring documented knowledge is discoverable by agents in fresh sessions
  - Designing skills that may modify project instruction files
  - Onboarding a new agent platform that reads its own instruction file
tags:
  - discoverability
  - ce-compound
  - ce-compound-refresh
  - instruction-files
  - skill-design
  - knowledge-compounding
---

# Discoverability check for documented solutions in project instruction files

## Context

Knowledge stores — structured directories of solutions, patterns, and learnings — only compound value when agents can find them. A project might accumulate dozens of well-categorized documents under `docs/solutions/` with YAML frontmatter, category directories, and searchable fields, yet agents in fresh sessions, different tools, or collaborators without the originating plugin would never know to look there.

The root cause: project instruction files (`AGENTS.md`, `CLAUDE.md`, `.cursorrules`, etc.) are the universal discovery surface. Every agent platform reads them on session start. If the instruction file doesn't mention the knowledge store, the agent has no reason to search for it — and no way to know what structure to expect if it stumbled upon it accidentally.

This gap becomes more costly as the knowledge store grows. Each undiscovered solution means an agent re-derives something already documented, wastes tokens on exploration, or arrives at a contradictory approach because it never found the prior decision.

## Guidance

After writing or updating a knowledge store entry, verify that the project's root instruction files give agents enough information to discover and use the store. The check has three parts:

**1. Identify the substantive instruction file.**

Projects often have multiple instruction files where one is a shim that delegates to another (e.g., `CLAUDE.md` containing only `@AGENTS.md`). Target the file with actual content, not the shim.

**2. Semantically assess discoverability — not string presence.**

An agent reading the instruction file should be able to answer three questions:
- Does a searchable knowledge store exist in this project?
- What is its structure (location, categories, metadata format)?
- When should I search it?

This is a semantic check, not a grep for a path string. A file might mention `docs/solutions/` in a directory tree without conveying that it's searchable or when to use it. Conversely, a file might describe the knowledge store without using the exact directory path.

**3. Draft the smallest effective addition.**

If discoverability is missing, the addition should be minimal and stylistically consistent:

- Prefer augmenting an existing section (directory listing, architecture description) over adding a new headed section
- Match the file's existing density and tone — a terse file gets a terse addition
- Use informational tone, not imperative — describe what exists and when it's relevant, rather than issuing commands

**4. Gate on user consent.**

Never edit instruction files without asking. In interactive mode, present the proposed change and ask for approval using the platform's question tool. In automated or autofix mode, surface the recommendation without applying it.

## Why This Matters

Without discoverability, a knowledge store has zero value outside the session that wrote it. The entire premise of compounding knowledge is that future sessions build on past ones. If future sessions can't find the store, every session starts from scratch.

The cost is proportional to the store's size: a project with 50 documented solutions where agents never search wastes more effort than one with 3. The waste is silent — no error, no warning, just redundant work and occasionally contradictory decisions.

Keeping the addition minimal and informational avoids a secondary problem: imperative directives like "always search the knowledge store before implementing" cause agents to perform redundant reads when the active workflow already includes a dedicated search step. The instruction file should make the store discoverable, not mandate a specific workflow around it.

The semantic approach (assessing whether an agent would discover the store) rather than syntactic matching (grepping for a path) avoids both false positives (path appears in a tree but conveys nothing about searchability) and false negatives (description uses different phrasing but fully communicates the store's purpose).

## When to Apply

- **After creating a knowledge store for the first time** — the most critical moment, since no prior session has had reason to mention it
- **After writing or refreshing a learning** in an existing store — the check is cheap and catches instruction files that were refactored or regenerated without the discoverability note
- **When onboarding a new agent platform** — if the project adds `.cursorrules` alongside existing `AGENTS.md`, the new file needs the same discoverability affordance
- **When instruction files are substantially rewritten** — reorganization can drop a previously-present mention

The check is unnecessary when:
- The instruction file was just verified in the current session
- The knowledge store is part of a plugin that injects its own discovery mechanism (the plugin's agents already know where to look)

## Examples

**Existing directory listing — add a single line:**

Before:
```
src/              Application source code
tests/            Test suite and fixtures
docs/             Project documentation
scripts/          Build and deploy scripts
```

After:
```
src/              Application source code
tests/            Test suite and fixtures
docs/             Project documentation
docs/solutions/   Categorized solutions with YAML frontmatter; relevant when implementing or debugging in areas with prior decisions
scripts/          Build and deploy scripts
```

One line, matches the existing style, communicates all three things: the store exists, it's structured, and when to use it.

---

**No natural insertion point — small headed section:**

Before:
```markdown
# Project Instructions

Use TypeScript strict mode. Run `npm test` before committing.
Prefer composition over inheritance.
```

After:
```markdown
# Project Instructions

Use TypeScript strict mode. Run `npm test` before committing.
Prefer composition over inheritance.

## Knowledge Store

`docs/solutions/` contains categorized solution documents with YAML frontmatter
(category, severity, tags). Searching this directory is useful when implementing
features or debugging issues in areas where prior decisions have been recorded.
```

---

**Shim file — skip it:**

```markdown
@AGENTS.md
```

This file delegates entirely to `AGENTS.md`. The discoverability note belongs in `AGENTS.md`, not here. Adding content to a shim file defeats its purpose.

## Related

- [#111](https://github.com/EveryInc/compound-engineering-plugin/issues/111) — Enhancement: Add project scaffolding for `docs/solutions/` schema + agentic feedback loops. The discoverability check is a lighter-weight partial solution to this issue's "medium-term" suggestion of making ce:compound check for scaffolding.
- [#171](https://github.com/EveryInc/compound-engineering-plugin/issues/171) — Closed-Loop Self-Improvement System. The discoverability check helps close part of this loop by ensuring agents can find `docs/solutions/` content.
- `docs/solutions/skill-design/compound-refresh-skill-improvements.md` — Documents the ce:compound-refresh skill redesign. The discoverability check adds a new step to that skill's workflow.
