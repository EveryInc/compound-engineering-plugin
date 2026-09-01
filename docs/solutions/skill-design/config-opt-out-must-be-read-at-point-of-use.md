---
title: A named config opt-out must be read at the point of use, not carried over from an earlier step
date: 2026-09-01
category: skill-design
module: ce-commit-push-pr
problem_type: workflow_issue
component: development_workflow
severity: medium
applies_when:
  - a skill states a hard completion gate and separately mentions a config key that opts out of it
  - the config key is read in an earlier step or reference than the one enforcing the gate
  - the gate's prose treats an opt-out as a blocked state rather than a successful terminal
  - evaluating a delegating skill only with the whole skill injected in one clean turn
related_components:
  - ce-babysit-pr
tags: [config-read, compaction, skill-gates, handoff, eval-methodology]
---

# A named config opt-out must be read at the point of use, not carried over from an earlier step

## Context

`ce-commit-push-pr` opens a PR and then, as its final step, decides whether to hand off to `ce-babysit-pr` for ongoing monitoring. The repo's config system supports a standing opt-out for exactly this: `auto_babysit: false` in the user's own `.compound-engineering/config.yaml` (created per checkout — this repo tracks only `config.example.yaml`), or in a checkout-local `config.local.yaml` override. A user set that opt-out on Codex and reported (issue #1601) that the handoff happened anyway — the skill burned tokens babysitting a PR they had explicitly said not to watch.

The root cause was not a logic bug in how `auto_babysit` was interpreted — it was where its resolution lived relative to where it was consumed. The shared config-read block (the `<!-- ce-config-layers:start -->` / `:end -->` fragment that instructs an agent to read `config.local.yaml` then `config.yaml` and take the first active value) existed only in `skills/ce-commit-push-pr/references/compose.md`, scoped there to the teaching-gate keys `pr_teaching_section` / `pr_teaching_archive`. The babysit gate, however, is decided in a different reference entirely: `skills/ce-commit-push-pr/references/apply-and-handoff.md`. That file *named* `auto_babysit` as the opt-out in prose, but contained no instruction to actually read it — the read only happened, incidentally, for unrelated keys, an earlier step back.

A gate that depends on a config value read in an earlier step, for a different purpose, in a different file, is depending on the agent's working memory carrying that value forward. Context compaction — which the reporting user explicitly named ("because of drifts and compactions") — is exactly the failure mode that erases that memory while leaving the current step's instructions intact. The surrounding prose made this worse by stating the handoff as a forceful, low-degrees-of-freedom gate. The reference itself says "this run is not done until `ce-babysit-pr` owns follow-on," "Reporting the PR URL alone is not success," "never ask yes/no," and "**Handoff blocked:** if the skill cannot be loaded or started, stop and report the failure"; the always-loaded body adds "If `ce-babysit-pr` cannot be loaded or started, stop and report it blocked." Against all of that, the opt-out was a single clause in one sentence. Under partial context loss, the strongly-stated gate survives and the weakly-stated exemption does not — and the gate's own blocked-or-failed framing then swallows the opt-out, turning a deliberate user choice into a reported failure.

## Guidance

**Resolve a gate's inputs at the point the gate is evaluated, not at some earlier point in the skill where the value happens to be convenient to read.** If a decision block depends on config key K, the instruction to read K must live immediately adjacent to that block, even if K is also read elsewhere for another purpose. Do not rely on "the agent read this three steps ago" — a compacted, resumed, or long-running agent session may no longer have that step in context, but it will still have the immediately-preceding instructions for the step it is currently executing.

Concretely, in `skills/ce-commit-push-pr/references/apply-and-handoff.md`, the fix places the canonical `ce-config-layers` block directly before the babysit gate, with an explicit framing sentence:

> "Resolve the standing opt-out before applying the gate below. Read `auto_babysit` by the rule here, at the handoff. An earlier step's config read does not carry: a run that reaches the gate without having read the key hands off against the user's standing choice, and a compacted run is the ordinary way that happens."

This duplicates the `ce-config-layers` block across `compose.md` and `apply-and-handoff.md` — and that duplication is correct here, not a smell to dedupe away. Skills cannot import siblings, so the block is byte-duplicated into every independent reader by design; the block is cheap, while each *consuming reference* independently guarantees its own gate is decidable from local context.

**When a gate can be skipped by user configuration, state the skip as a successful terminal, not as a blocked or degraded outcome.** A gate written only as "must complete, or stop and report a failure" has no room for "the user asked not to do this, and that is fine." `apply-and-handoff.md` now says explicitly that a handoff skipped by `auto_babysit: false` is a successful terminal for this run — without that, the pre-fix Claude arm reported the PR as "currently unmonitored," treating the intentional opt-out as an unresolved failure state.

**A test asserting a config key's name appears in a reference proves nothing about whether the reference reads it.** `tests/commit-push-pr-contract.test.ts` originally asserted the literal string `"auto_babysit: false"` was present — which the pre-fix prose satisfied by merely naming the key in an explanatory sentence, with no read instruction attached. The corrected assertions (`tests/commit-push-pr-contract.test.ts:314-319`) check for the actual read mechanism and the successful-terminal framing:

```ts
expect(content).toContain("auto_babysit")
expect(content).toContain("<!-- ce-config-layers:start -->")
expect(content).toContain(".compound-engineering/config.local.yaml")
expect(content).toMatch(/opted out[^.]{0,120}successful terminal/i)
```

Any test whose purpose is "prove this reference actually resolves key K" should assert the read mechanism is present and adjacent, not just that K's name appears somewhere in the file.

**Register a new config-consuming reference in the parity check that guards the config-read pattern.** `tests/config-layers-rule-parity.test.ts` maintains a `CONSUMERS` list of files expected to carry the canonical `ce-config-layers` block verbatim; `apply-and-handoff.md` was added there (`tests/config-layers-rule-parity.test.ts:22`) alongside `compose.md`. When a new reference file gains its own config-gated decision, add it to that list so a future edit that strips the block is caught mechanically rather than by report.

## Why This Matters

This class of bug is invisible to the most common way skills get tested: a single clean-context run with the whole skill in view. A capable model, handed the entire skill body in one pass, will find `auto_babysit` mentioned anywhere in the document and go verify it before acting, even without an explicit "read it here" instruction — masking the defect. The defect only manifests when the reference that owns the decision is evaluated with the rest of the skill no longer in context, which is precisely what happens after compaction on a long-running task, or when a harness re-enters a skill mid-flow from a resumed session.

Skills that gate expensive, hard-to-reverse, or user-annoying actions (spawning a babysitting loop, opening a follow-up PR, sending a notification) are exactly the ones where this matters, because the cost of a false positive — ignoring the opt-out — is paid in the user's time and trust, not just wasted tokens.

## When to Apply

Apply this whenever a skill reference file contains a decision gate — an if/then that changes runtime behavior — driven by a config value, a flag, or any other piece of resolved state:

- The instruction to resolve that state must be co-located with the gate that consumes it, in the same reference file, even if it duplicates a read already performed earlier in the skill for a different key or purpose.
- If the gate can be legitimately skipped by user configuration, the skipped path must be described as a valid, successful outcome — not folded into the same "blocked/failed" language used for genuine inability.
- If a test's job is to prove a reference reads a value (not just mentions it), assert the read mechanism and its proximity to the gate, not merely that the key's name occurs in the file.
- If the skill maintains a parity list of files that must carry the canonical config-read block, add the new consuming file to it in the same change.

## Examples

**Before.** The babysit gate in `apply-and-handoff.md` followed forceful completion language ("this run is not done until `ce-babysit-pr` owns follow-on... never ask yes/no... stop and report the failure") with `auto_babysit` mentioned only in passing prose, no adjacent read instruction. Compaction-proxy eval — only this one reference file in context, repo has an active `auto_babysit: false`:

- Codex: "Automatically hand off https://github.com/acme/widgets/pull/42 to ce-babysit-pr now."
- Claude: "the required `ce-babysit-pr` handoff is blocked ... PR 42 is currently unmonitored"

Both arms ignored or mis-framed the standing opt-out.

**After.** The `ce-config-layers` block plus the explicit resolve-here instruction sits immediately above the gate, and the gate's own text states the opted-out path is a successful terminal. Same compaction-proxy eval, same fixture:

- Codex: "Skip babysit; `auto_babysit: false` is the standing repo config."
- Claude: "skip the ce-babysit-pr handoff because the repo config sets `auto_babysit: false`."

**Methodological example, worth reusing for any similar fix.** The standard full-skill eval cell (`bun run test:skill-eval-cell`, whole skill injected in a clean single turn) passed on both hosts in *both* the pre-fix and post-fix arms — it did not reproduce the bug at all, because a full-context agent can locate and honor `auto_babysit` regardless of where the read instruction technically lives. Only a fixture that withheld the rest of the skill and handed the agent just `apply-and-handoff.md` — simulating what survives compaction — discriminated the broken prose from the fixed prose. When evaluating a fix for a context-loss-triggered defect, build the eval fixture to reproduce the context loss; supplying full context tests a different, easier problem and will pass even on the buggy version.

## Related

- [`skill-gates-state-conditions-not-prescribed-git-commands.md`](./skill-gates-state-conditions-not-prescribed-git-commands.md) — the house pattern for ship/handoff gates in delegating skills; this doc applies it to a config-resolution gate rather than a git-state gate.
- [`state-the-condition-not-a-placement-absolute.md`](./state-the-condition-not-a-placement-absolute.md) — same module, same "decision split across steps, thinner clause lost under compaction" shape.
- [`context-absent-skill-handoff-needs-pinned-invocation.md`](./context-absent-skill-handoff-needs-pinned-invocation.md) — sibling: a handoff seam whose inputs must be resolved at the handoff site rather than assumed from earlier context.
- [`size-driven-skill-restructure.md`](./size-driven-skill-restructure.md) — background on compaction dropping older invoked-skill content, and why ordering is load-bearing.
- [`validate-skill-prose-behavior-with-cross-host-evals.md`](./validate-skill-prose-behavior-with-cross-host-evals.md) — the cross-host eval practice this run extends with a context-withholding fixture.
- Issue [#1601](https://github.com/EveryInc/compound-engineering-plugin/issues/1601) — the report that surfaced this.
