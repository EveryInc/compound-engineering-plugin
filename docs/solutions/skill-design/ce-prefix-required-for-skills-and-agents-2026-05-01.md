---
title: New skills and agents must use the ce- prefix; enforce it in tests, not just prose
date: 2026-05-01
category: skill-design
module: compound-engineering
problem_type: convention
component: plugins/compound-engineering
severity: low
applies_when:
  - Adding a new skill directory under plugins/compound-engineering/skills/
  - Adding a new agent file under plugins/compound-engineering/agents/
  - Authoring or reviewing a PR that introduces a new component to the plugin
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

`plugins/compound-engineering/AGENTS.md` already stated that "all skills and agents use the `ce-` prefix to unambiguously identify them as compound-engineering components." But the rule was prose-only, and three legacy skills (`every-style-editor`, `file-todos`, `lfg`) sit unprefixed in the same directory as their `ce-`-prefixed siblings. The combination — a soft rule plus visible exceptions — let a new skill (`riffrec-feedback-analysis`) ship in PR #747 without the prefix. The user caught it post-merge of the first commit, requiring a rename commit on the same PR.

A prose convention that has visible counterexamples and no machine check is, in practice, an *advisory* convention. Any author skim-reading the directory listing sees `every-style-editor` next to `ce-brainstorm` and reasonably concludes the prefix is optional.

## Root cause

Two layered problems:

1. **The rule was unenforced.** Nothing in CI or the test suite would fail when a non-`ce-` skill was added. The frontmatter test asserts that the skill's `name:` matches its directory and that the directory uses `[a-z0-9-]+`, but does not check for the `ce-` prefix.
2. **The exception list was implicit.** Three legacy skills predate the rule. Without an explicit allowlist, "predates the rule" looks identical to "the rule doesn't apply" when reading the filesystem.

## Solution

Make the rule mechanically enforced and pin the exceptions explicitly.

### 1. Test enforcement

Added to `tests/frontmatter.test.ts` inside the existing `frontmatter YAML validity` block:

```ts
if (pluginRoot === "plugins/compound-engineering") {
  const SKILL_PREFIX_ALLOWLIST = new Set([
    "every-style-editor",
    "file-todos",
    "lfg",
  ])
  test(`${pluginRoot}/${rel} skill name uses ce- prefix`, () => {
    const dirName = path.basename(path.dirname(rel))
    if (SKILL_PREFIX_ALLOWLIST.has(dirName)) return
    expect(
      dirName.startsWith("ce-"),
      `Skill "${dirName}" must use the ce- prefix. ` +
        `If this is a legacy skill that predates the rule, add it to ` +
        `SKILL_PREFIX_ALLOWLIST in tests/frontmatter.test.ts.`,
    ).toBe(true)
  })
}
```

A parallel test at the agent level (no allowlist, since every existing agent already conforms):

```ts
if (
  pluginRoot === "plugins/compound-engineering" &&
  /^agents\/[^/]+\.agent\.md$/.test(rel)
) {
  test(`${pluginRoot}/${rel} agent name uses ce- prefix`, () => {
    const fileName = path.basename(rel, ".agent.md")
    expect(
      fileName.startsWith("ce-"),
      `Agent "${fileName}" must use the ce- prefix.`,
    ).toBe(true)
  })
}
```

The test failure message tells the author exactly what to do — either rename the skill or, if it is genuinely legacy, edit the allowlist (which a reviewer can then push back on).

### 2. Strengthened prose

Updated `plugins/compound-engineering/AGENTS.md` to call the prefix mandatory, name the legacy exceptions, point at the test, and forbid extending the allowlist. The prose now says "no exceptions" and tells authors that the test will fail. Prose alone wouldn't have prevented the original mistake, but pairing it with the test gives a single internally consistent story.

### 3. Persistent author memory

Saved a feedback memory at `~/.claude/projects/-Users-kieranklaassen-compound-engineering-plugin/memory/feedback_ce_prefix_required.md` so future sessions on this repo load the rule automatically and apply it before the test fires.

## Prevention

For any plugin convention that is currently prose-only, ask:

- Is there at least one visible counterexample in the codebase that an author could mistake for permission?
- Is there a mechanical check that would fail on violation?

If the answer to the first is yes and the second is no, the convention will eventually be violated. The fix is one of:

- Add a test that asserts the convention with a hard-coded allowlist for legacy exceptions.
- Migrate the legacy exceptions so the rule is universal and no allowlist is needed.

The allowlist pattern is preferred when migration is risky (renaming an installed skill breaks user invocations) but the rule applies cleanly going forward.

## Related

- `plugins/compound-engineering/AGENTS.md` — Naming Convention section now documents the rule and the allowlist.
- `tests/frontmatter.test.ts` — implements the enforcement.
- PR #747 — the original mistake and the rename + enforcement that came with it.
