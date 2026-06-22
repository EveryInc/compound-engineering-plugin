---
title: Public skills must use the ce- prefix; enforce it in tests, not just prose
date: 2026-05-01
last_refreshed: 2026-06-20
category: skill-design
module: compound-engineering
problem_type: convention
component: root plugin
severity: low
applies_when:
  - Adding a new skill directory under `skills/`
  - Authoring or reviewing a PR that introduces a new public plugin component
  - Deciding whether a new specialist prompt should be a public skill or a skill-local reference asset
tags:
  - naming-convention
  - ce-prefix
  - skill-authoring
  - test-enforcement
  - plugin-conventions
related:
  - docs/solutions/skill-design/beta-skills-framework.md
related_pr: https://github.com/EveryInc/compound-engineering-plugin/pull/747
---

## Problem

`AGENTS.md` stated that public Compound Engineering components use the `ce-` prefix to make ownership clear. But the rule was prose-only, and legacy skills sat unprefixed in the same directory as their `ce-`-prefixed siblings. The combination — a soft rule plus visible exceptions — let a new skill (`riffrec-feedback-analysis`) ship in PR #747 without the prefix. The user caught it post-merge of the first commit, requiring a rename commit on the same PR.

That skill is now `ce-riffrec-feedback-analysis`; `lfg` remains the sole intentional public-skill exemption.

The repo no longer ships standalone CE agents. Specialist reviewer, researcher, and helper behavior lives as skill-local prompt assets under `skills/*/references/agents/` or `skills/*/references/personas/`. Those internal filenames should be descriptive for the owning skill, not treated as public plugin component names.

## Root cause

Two layered problems:

1. **The rule was unenforced.** Nothing in CI or the test suite failed when a non-`ce-` public skill was added.
2. **The exception list was implicit.** Legacy skills predated the rule. Without an explicit allowlist, "predates the rule" looked identical to "the rule does not apply" when reading the filesystem.

## Solution

Make the public-skill rule mechanically enforced and pin exceptions explicitly.

### 1. Test enforcement

Enforcement lives in `tests/frontmatter.test.ts`, which walks root `skills/` directories and asserts the prefix on the directory name and frontmatter `name`. Exemptions are explicit:

```ts
const SKILL_PREFIX_ALLOWLIST = new Set([
  // lfg ships as the public command `/lfg` (see README.md).
  "lfg",
])
```

The test also verifies each skill frontmatter `name` matches its parent directory and uses only lowercase letters, numbers, and hyphens. That protects Pi and other native plugin loaders that reject punctuation-heavy names.

### 2. Strengthened prose

`AGENTS.md` documents the naming rule and points authors at the test. Prose alone would not have prevented the original mistake, but pairing it with a CI check gives a single internally consistent story.

### 3. Internal prompt assets stay internal

Do not use this rule as a reason to prefix every internal persona file. After the agentless restructure, names like `learnings-researcher.md` and `coherence-reviewer.md` are intentionally scoped by their owning skill directory. The public namespace is the skill name; the internal filename is just a prompt asset.

## Prevention

For any plugin convention that is prose-only, ask:

- Is there at least one visible counterexample in the codebase that an author could mistake for permission?
- Is there a mechanical check that would fail on violation?

If the answer to the first is yes and the second is no, the convention will eventually be violated. Add a test with a hard-coded allowlist, or migrate the legacy exceptions so the rule is universal.

## Related

- `AGENTS.md` — Naming Convention section documents the rule and allowlist.
- `tests/frontmatter.test.ts` — public-skill prefix enforcement.
- PR #747 — the original mistake and the rename + enforcement that came with it.
