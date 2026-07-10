---
title: Building a shared cached primitive across self-contained skills
date: 2026-06-29
category: docs/solutions/skill-design/
module: repo-grounding-cache
problem_type: architecture_pattern
component: tooling
severity: medium
applies_when:
  - Multiple skills independently re-derive the same expensive, question-agnostic data
  - You want one shared cache/helper/persona reused across skills that cannot import each other
  - Adding a cross-skill optimization where the plugin's self-contained-skill rule forbids shared modules
tags: [cross-skill, cache, skill-design, duplication, parity-test, skill-creator-eval]
---

# Building a shared cached primitive across self-contained skills

## Context

Repo-grounding skills (`ce-pov`, `ce-plan`, `ce-optimize`, `ce-ideate`, `ce-brainstorm`, `ce-code-review`, `ce-compound`, `ce-debug`) each independently re-derived the same question-agnostic "project profile" (stack, deps, conventions, structure) on every run — an expensive grounding pass repeated per skill and per invocation. We wanted one shared, cached primitive. But the plugin's hard constraint (AGENTS.md "File References in Skills") forbids cross-skill imports: the converter copies each skill directory as an isolated unit, so a skill may only reference files inside its own tree. There is no shared-module mechanism.

## Guidance

Build the "shared" primitive as **byte-duplicated assets plus a parity test**, not a shared import:

1. **Duplicate the assets into every consuming skill.** Here that was three files per skill: a protocol/schema reference (`references/repo-profile-cache.md`), a bundled helper script (`scripts/repo-profile-cache.py`), and a derivation persona (`references/agents/repo-profiler.md`). Each consumer carries identical copies.
2. **Guard file drift with a `tests/` byte-identity test** — declare the asset filenames x the consumer-skill list and assert each copy equals the first (mirror `tests/compound-support-files.test.ts`). Adding a consumer = drop in the copies + add its name to the test's `CONSUMER_SKILLS`.
3. **Invoke the bundled script via the `SKILL_DIR` anchor**, never `${CLAUDE_SKILL_DIR}` (see `docs/solutions/skill-design/bundled-script-path-resolution-across-harnesses.md`).
4. **Put deterministic work in the script, judgment in the persona.** The Python helper does git keying + validity + atomic read/write (unit-testable); the LLM persona derives the profile only on a miss.
5. **Share state through a single OS-temp location, keyed by content/identity**, so any skill reads what another wrote (`/tmp/compound-engineering/repo-profile/<root-sha>/<head-sha>.json`).

## Why This Matters

The parity test guards **file** drift but **not integration** drift: a consumer can carry byte-identical assets yet wire the grounding phase wrong (skip the cache, or — worse — skip the still-required question-specific grounding). Two layers are needed:

- **Parity test** (`bun test`) — proves the duplicated files are identical across skills.
- **Per-consumer `skill-creator` grounding-phase eval** — proves each skill actually *uses* the primitive correctly: takes the agnostic slice from the cache AND keeps its question-specific work fresh. This is the only check that catches integration drift, and it is manual (not run by CI).

One more unguarded seam: **per-skill field reads** (e.g. a SKILL.md that reads `conventions.testing` from the profile JSON) are not byte-duplicated, so renaming a schema field passes the parity test and the version bump yet silently breaks consumers — document a "grep the consumers for the field" step in the schema-change checklist.

## When to Apply

- Several skills re-derive the same stable, question-agnostic data and you want to compute it once.
- The shared thing is genuinely reusable across skills (not one skill's private concern).
- You can express the shared contract as a small, self-contained asset set (reference + script + persona) rather than a code dependency.

Do **not** reach for this when only one skill needs the data, or when the "shared" data is actually question-specific per skill (then there is nothing stable to cache).

## Examples

The validation layering that made the difference:

```
tests/repo-profile-cache-parity.test.ts   # FILE drift: 3 assets x 8 skills byte-identical
skill-creator evals (per consumer)         # INTEGRATION drift: agnostic-from-cache AND
                                           #   question-specific-still-fresh, per skill
```

The grounding-phase eval pattern is cheap and high-signal precisely because the cache logic lives at the *front* of each skill — you can drive a fresh subagent through just the grounding phase (cache HIT/MISS/NO-CACHE) and observe its decisions without running the whole skill. That pattern caught real wiring issues on every batch it ran.

## Related

- `docs/solutions/skill-design/bundled-script-path-resolution-across-harnesses.md` — the `SKILL_DIR` anchor used to invoke the shared script
- `docs/solutions/skill-design/script-first-skill-architecture.md` — deterministic-script / model-presents split
- `docs/solutions/best-practices/cache-invalidation-input-set-completeness.md` — the cardinal rule for the cache this pattern shipped
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md` — generalizes the field-rename parity gap noted here into a rule: prove the anti-drift test fails on one-sided drift before trusting it.
- AGENTS.md "Shared Repo-Grounding Profile Cache" and "File References in Skills"
