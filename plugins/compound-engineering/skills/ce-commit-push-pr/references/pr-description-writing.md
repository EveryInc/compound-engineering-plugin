# PR Description Writing

How to compose a PR title and body once the diff and commit list are known. Loaded on demand by `ce-commit-push-pr` Step 6 — do not load earlier.

The caller has already resolved the diff, the commit list, and (for existing PRs) the current PR body. This file covers everything from commit classification through the final composed body.

---

## Step A: Classify commits

Scan the commit list and classify each commit:

- **Feature commits** -- implement the PR's purpose (new functionality, intentional refactors, design changes). These drive the description.
- **Fix-up commits** -- iteration work (code review fixes, lint fixes, test fixes, rebase resolutions, style cleanups). Invisible to the reader.

When sizing the description, mentally subtract fix-up commits: a branch with 12 commits but 9 fix-ups is a 3-commit PR.

---

## Step B: Decide on evidence

Decide whether to include an evidence section in the body.

**Evidence is possible** when the diff changes observable behavior demonstrable from the workspace: UI, CLI output, API behavior with runnable code, generated artifacts, or workflow output.

**Evidence is not possible** for:
- Docs-only, markdown-only, changelog-only, release metadata, CI/config-only, test-only, or pure internal refactors
- Behavior requiring unavailable credentials, paid/cloud services, bot tokens, deploy-only infrastructure, or hardware not provided

**Decision logic:**

1. **Existing PR body contains a `## Demo` or `## Screenshots` section with image embeds:** preserve it verbatim unless the user's focus asks to refresh or remove it. Include the preserved block in the body.
2. **No existing evidence block:** omit the evidence section entirely unless the caller already captured evidence and passed it in (e.g., a `ce-demo-reel` URL).

Do not label test output as "Demo" or "Screenshots". Place any preserved evidence block before the Compound Engineering badge.

---

## Step C: Frame the narrative

Articulate the PR's narrative frame:

1. **Before**: What was broken, limited, or impossible? (One sentence.)
2. **After**: What's now possible or improved? (One sentence.)
3. **Scope rationale** (only if 2+ separable-looking concerns): Why do these ship together? (One sentence.)

This frame becomes the opening. For small+simple PRs, the "after" sentence alone may be the entire description.

---

## Step D: Size the change

Assess size (files, diff volume) and complexity (design decisions, trade-offs, cross-cutting concerns) to select description depth:

| Change profile | Description approach |
|---|---|
| Small + simple (typo, config, dep bump) | 1-2 sentences, no headers. Under ~300 characters. |
| Small + non-trivial (bugfix, behavioral change) | Short narrative, ~3-5 sentences. No headers unless two distinct concerns. |
| Medium feature or refactor | Narrative frame (before/after/scope), then what changed and why. Call out design decisions. |
| Large or architecturally significant | Narrative frame + up to 3-5 design-decision callouts + 1-2 sentence test summary + key docs links. Target ~100 lines, cap ~150. For PRs with many mechanisms, use a Summary-level table to list them; do NOT create an H3 subsection per mechanism. Reviewers scrutinize decisions, not inventories — the diff and spec files carry the detail. If you find yourself writing 10+ subsections, consolidate to a table. |
| Performance improvement | Include before/after measurements if available. Markdown table works well. |

When in doubt, shorter is better. Match description weight to change weight. Large PRs need MORE selectivity, not MORE content.

---

## Step E: Apply writing principles

### Writing voice

If the repo has documented style preferences in context, follow those. Otherwise:

- Active voice. No em dashes or `--` substitutes; use periods, commas, colons, or parentheses.
- Vary sentence length. Never three similar-length sentences in a row.
- Do not make a claim and immediately explain it. Trust the reader.
- Plain English. Technical jargon fine; business jargon never.
- No filler: "it's worth noting", "importantly", "essentially", "in order to", "leverage", "utilize."
- Digits for numbers ("3 files"), not words ("three files").

### Writing principles

- **Lead with value**: Open with what's now possible or fixed, not what was moved around. The subtler failure is leading with the mechanism ("Replace the hardcoded capture block with a tiered skill") instead of the outcome ("Evidence capture now works for CLI tools and libraries, not just web apps").
- **No orphaned opening paragraphs**: If the description uses `##` headings anywhere, the opening must also be under a heading (e.g., `## Summary`). For short descriptions with no sections, a bare paragraph is fine.
- **Describe the net result, not the journey**: The description covers the end state, not how you got there. No iteration history, debugging steps, intermediate failures, or bugs found and fixed during development. This applies equally when regenerating for an existing PR: rewrite from the current state, not as a log of what changed since the last version. Exception: process details critical to understand a design choice.
- **When commits conflict, trust the final diff**: The commit list is supporting context, not the source of truth. If commits describe intermediate steps later revised or reverted, describe the end state from the full branch diff.
- **Explain the non-obvious**: If the diff is self-explanatory, don't narrate it. Spend space on things the diff doesn't show: why this approach, what was rejected, what the reviewer should watch.
- **Use structure when it earns its keep**: Headers, bullets, and tables aid comprehension, not mandatory template sections.
- **Markdown tables for data**: Before/after comparisons, performance numbers, or option trade-offs communicate well as tables.
- **No empty sections**: If a section doesn't apply, omit it. No "N/A" or "None."
- **Test plan — only when non-obvious**: Include when testing requires edge cases the reviewer wouldn't think of, hard-to-verify behavior, or specific setup. Omit when "run the tests" is the only useful guidance. When the branch adds test files, name them with what they cover.
- **No Commits section**: GitHub already shows the commit list in its own tab. A Commits section in the PR body duplicates that without adding context. Omit unless the commits need annotations explaining their ordering or shipping rationale.
- **No Review / process section**: Do not include a section describing how the reviewer should review (checklists of things to look at, process bullets). Process doesn't help the reviewer evaluate code. Call out specific non-obvious things to scrutinize inline with the change that warrants it.

### Visual communication

Include a visual aid only when the change is structurally complex enough that a reviewer would struggle to reconstruct the mental model from prose alone.

**The core distinction — structure vs. parallel variation:**

- Use a **Mermaid diagram** when the change has **topology** — components with directed relationships (calls, flows, dependencies, state transitions, data paths). Diagrams express "A talks to B, B talks to C, C does not talk back to A" in a way tables cannot.
- Use a **markdown table** when the change has **parallel variation of a single shape** — N things that share the same attributes but differ in their values. Tables express "option 1 costs X, option 2 costs Y, option 3 costs Z" cleanly.

Architecture changes are almost always topology (components + edges), so Mermaid is usually the right call — a table of "components that interact" loses the edges and becomes a flat list. Reserve tables for genuinely parallel data: before/after measurements, option trade-offs, flag matrices, config enumerations.

**When to include (prefer Mermaid, not a table, for architecture/flow):**

| PR changes... | Visual aid |
|---|---|
| Architecture touching 3+ interacting components (the components have *directed relationships* — who calls whom, who owns what, which skill delegates to which) | **Mermaid** component or interaction diagram. Do not substitute a table — tables cannot show edges. |
| Multi-step workflow or data flow with non-obvious sequencing | **Mermaid** flow diagram |
| State machine with 3+ states and non-trivial transitions | **Mermaid** state diagram |
| Data model changes with 3+ related entities | **Mermaid** ERD |
| Before/after performance or behavioral measurements (same metric, different values) | **Markdown table** |
| Option or flag trade-offs (same attributes evaluated across variants) | **Markdown table** |
| Feature matrix / compatibility grid | **Markdown table** |

**When in doubt, ask: "Does the information have edges (A → B) or does it have rows (attribute × variant)?"** Edges → Mermaid. Rows → table. Architecture has edges almost by definition.

**When to skip any visual:**
- Sizing routes to "1-2 sentences"
- Prose already communicates clearly
- The diagram would just restate the diff visually
- Mechanical changes (renames, dep bumps, config, formatting)

**Format details:**
- **Mermaid** (default for topology). 5-10 nodes typical, up to 15 for genuinely complex changes. Use `TB` direction. Source should be readable as fallback.
- **ASCII diagrams** for annotated flows needing rich in-box content. 80-column max.
- **Markdown tables** for parallel-variation data only.
- Place inline at point of relevance, not in a separate section.
- Prose is authoritative when it conflicts with a visual.

Verify generated diagrams against the change before including.

### Numbering and references

Never prefix list items with `#` in PR descriptions — GitHub interprets `#1`, `#2` as issue references and auto-links them.

When referencing actual GitHub issues or PRs, use `org/repo#123` or the full URL. Never use bare `#123` unless verified.

### Applying user focus

If the user provided a focus hint (e.g., "emphasize the benchmarks", "this needs to read as a migration not a feature"), incorporate it alongside the diff-derived narrative. Treat focus as steering, not override: do not invent content the diff does not support, and do not suppress important content the diff demands simply because focus did not mention it. When focus and diff materially disagree (e.g., focus says "include benchmarking" but the diff has no benchmarks), surface the conflict to the user rather than fabricating content.

---

## Step F: Compose the title

Title format: `type: description` or `type(scope): description`.

- **Type** is chosen by intent, not file extension or diff shape. `feat` for new functionality, `fix` for a bug fix, `refactor` for a behavior-preserving change, `docs` for doc-only, `chore` for tooling/maintenance, `perf` for performance, `test` for test-only. Where `fix` and `feat` could both seem to fit, default to `fix`: a change that remedies broken or missing behavior is `fix` even when implemented by adding code. Reserve `feat` for capabilities the user could not previously accomplish. The user may override.
- **Scope** (optional) is the narrowest useful label: a skill/agent name, CLI area, or shared area. Omit when no single label adds clarity.
- **Description** is imperative, lowercase, under 72 characters total. No trailing period.
- If the repo has commit-title conventions visible in recent commits, match them.

Breaking changes use `!` (e.g., `feat!: ...`) or document in the body with a `BREAKING CHANGE:` footer. Do not apply either marker without explicit user confirmation — they trigger automated major-version bumps in some release tooling.

---

## Step G: Compose the body

Assemble the body in this order:

1. **Opening** -- the narrative frame from Step C, at the depth chosen in Step D. Under a heading (e.g., `## Summary`) if the description uses any `##` headings elsewhere; a bare paragraph otherwise.
2. **Body sections** -- only the sections that earn their keep for this change: what changed and why, design decisions, tables for data, visual aids when complexity warrants. Skip empty sections entirely.
3. **Test plan** -- only when non-obvious per the writing principles. Omit otherwise.
4. **Evidence block** -- only the preserved or freshly captured block from Step B, if one exists. Do not fabricate or placeholder.
5. **Compound Engineering badge** -- append a badge footer separated by a `---` rule. Skip if regenerating an existing body that already contains the badge.

**Badge:**

```markdown
---

[![Compound Engineering](https://img.shields.io/badge/Built_with-Compound_Engineering-6366f1)](https://github.com/EveryInc/compound-engineering-plugin)
![HARNESS](https://img.shields.io/badge/MODEL_SLUG-COLOR?logo=LOGO&logoColor=white)
```

**Harness lookup:**

| Harness | `LOGO` | `COLOR` |
|---------|--------|---------|
| Claude Code | `claude` | `D97757` |
| Codex | (omit logo param) | `000000` |
| Gemini CLI | `googlegemini` | `4285F4` |

**Model slug:** Replace spaces with underscores. Append context window and thinking level in parentheses if known. Examples: `Opus_4.6_(1M,_Extended_Thinking)`, `Sonnet_4.6_(200K)`, `Gemini_3.1_Pro`.

---

## Step H: Compression pass

Before applying, re-read the composed body and apply these cuts:

- If any body section restates content already in the `## Summary`, remove it. The Summary plus the diff should carry the reader.
- If "Testing" or "Test plan" has more than 2 paragraphs, compress to bullets.
- If a "Commits" section enumerates the commit log, remove it — GitHub shows it in its own tab.
- If a "Review" or process-oriented section lists how to review, remove it. Move any truly non-obvious review hints inline with the relevant change.
- If the body has 5+ H3 subsections that each describe one mechanism, consolidate them into a single table row per mechanism under one header. Reserve prose H3 callouts for 2-3 genuine design decisions.
- If the body exceeds the sizing-table target by more than 30%, compress the longest non-Summary section by half.

**Value-lead check.** Re-read the first sentence of the Summary. If it describes what was moved around, renamed, or added ("This PR introduces three-tier autofix..."), rewrite to lead with what's now possible or what was broken and is now fixed ("Document reviews previously produced 14+ findings requiring user judgment; this PR cuts that to 4-6.").

Large PRs benefit from selectivity, not comprehensiveness.
