---
name: ce-debug
description: "Diagnosis loop for bugs and failing behavior. Use when asked to debug or fix failing behavior."
argument-hint: "[issue reference, error message, test path, or description of broken behavior]"
---

# Debug and Fix

Find the root cause of a failure, then — when the user chooses to — fix it with test-first discipline.

**Done when:** the causal chain from trigger to symptom is stated with no gaps and file:line evidence, and either a verified fix has been handed off (PR, commit, or the user's chosen stop) or a diagnosis-only summary has been delivered. **Escalate rather than persist:** 2-3 hypotheses exhausted without confirmation, or 3 failed fix attempts, means diagnose *why* instead of trying again — that is the smart escalation `references/investigate.md` describes. One hypothesis, one change at a time; changing several to see what helps is shotgun debugging.

`<bug_description>` is whatever this skill was invoked with — a failure description, a `mode:` token, or an issue reference (`#123`, `org/repo#123`, an issue URL) — from the user or from a calling skill (`ce-babysit-pr` / `lfg` in `mode:pipeline` pass the failing jobs and log tails). Blank if nothing was provided.


## Mode

Default is **interactive**: investigate, run the Phase 2 fix-choice gate, then the Phase 4 handoff.

**`mode:pipeline`** (set by an orchestrator such as `ce-babysit-pr` or `lfg`): run fully non-interactively and never call the blocking-question tool. Strip the token from `<bug_description>`, then **read `references/pipeline-mode.md` and follow it** — it overrides every "ask the user" point with a conservative default, replaces the Phase 2 fix-gate with "fix convergent bugs, defer divergent ones", and replaces the Phase 4 handoff with a structured return whose `status` is exactly one of `fixed-and-pushed | fixed-not-pushed | diagnosed-no-fix | flaky-infra | needs-human`. The caller branches on those exact spellings, so never rename, abbreviate, or add to them.

## Blocking questions

Wherever this skill asks the user something, use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question, and never end a phase without a response.

## Artifact Root

Resolve `<root>` only when you first compose a `<root>/` path — a run that composes none skips this entirely.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Execution Flow

Five phases in order: **0 Triage -> 1 Investigate -> 2 Root Cause -> 3 Fix -> 4 Handoff.** Beyond Phase 0's trivial-bug fast-path there is no skipping and no complexity tiers — a hard bug spends longer in each phase, it does not enter fewer.

**Read `references/investigate.md` now and follow it for Phases 0-2** — issue fetching, reproduction, environment sanity and the dirty-tree stash experiment, backward tracing, the tracker/PR-history search, hypothesis grounding, and the escalation table. Only the gates below are stated here.

**The issue of record.** Whatever the user handed you is where this bug already lives, whichever system that is — a Sentry issue counts as much as a Linear ticket. Carry its identifier and URL through to Phase 4. Input that is only a stack trace, test path, or description means this run has **no issue of record**. That is an ordinary state, not a gap to fill: ship the fix without one, never open a ticket to manufacture a record, and never ask the user whether to. Phase 1's tracker search reads prior work and **never establishes a new home for the bug** — an existing ticket for this bug is one to *link* in Phase 4, never one to create.

**The trivial-bug fast-path** (cause readable from the input, one-line fix, no deep tracing) still runs Phase 2's fix-choice gate before editing: it saves investigation ceremony, not the user's choice over whether to apply a fix.

**Choosing the regression test.** The regression test for a *confirmed defect* belongs wherever existing coverage already owns that behavior: start from the tests that exist rather than from a new file. Read `references/fix.md` for the homes and the naming rule before writing Phase 2's recommendation, not only before Phase 3's edits. A test that fails because the change deliberately reverses the behavior it asserts does not have a wrong expectation — that is the divergent case below, deferred rather than updated.

### Phase 2 gate: present, then ask

**Causal chain gate:** do not proceed to Phase 3 until you can explain the full chain — trigger through every step to the observed symptom — with no gaps. "Somehow X leads to Y" is a gap. Only the user can authorize proceeding on a best-available hypothesis when investigation is stuck.

Once the root cause is confirmed, write the findings as a user-visible block: the causal chain with file:line references; the proposed fix and the files it changes; which tests to use, add, modify, or strengthen, and whether existing tests should have caught this; and any related ticket or PR and how it shapes the recommendation — if an open PR already fixes this, lead with that link instead of a fresh fix.

**Same-turn presentation before the gate:** do not open the fix-choice question until that findings block has been written in full — in this turn or the immediately preceding assistant message. The blocking question tool renders only its own stem on modal harnesses, so a question fired on "root cause confirmed" alone leaves the user choosing with none of the causal chain in front of them. Naming the options is not presenting the findings, and a promise to explain after the choice is too late.

Then ask (per **Blocking questions**) which path to take. Do not assume the user wants action now; the test recommendations are part of the diagnosis either way.

1. **Fix it now** — proceed to Phase 3
2. **Diagnosis only — I'll take it from here** — skip the fix, write Phase 4's summary, end the skill
3. **Rethink the design** (`ce-brainstorm`) — only when the bug cannot be fixed within the current design: the root cause is a wrong responsibility or interface rather than wrong logic, the requirements themselves are wrong, or every candidate fix is a workaround around an assumption that no longer holds. Size alone is not a design problem.

**`mode:pipeline`:** do not ask. Proceed to Phase 3 and apply a **convergent** fix; a **divergent** fix — one that would reverse a deliberate contract/behavior/product decision, including a "failing" test that asserts intended behavior — is deferred, not applied, per `references/pipeline-mode.md`. Never route to `ce-brainstorm` here; a design problem becomes a `needs-human` residual.

### Phase 3: Fix

If the user chose "Diagnosis only," skip to Phase 4's summary. If they chose "Rethink the design," control has transferred to `ce-brainstorm` and this skill ends.

**Read `references/fix.md` before editing any file** — the test-first sequence, the failed-fix rule, and the defense-in-depth and post-mortem triggers. Two rules decide whether the fix may start at all, so they stay here:

- **Branch.** Check `git status`; if the user has unstaged work in files that need modification, confirm before editing. If the current branch is the default branch, create a feature branch without asking — derive a name from the bug, `git checkout -b <name>`, and say which branch you moved to. Detect the default by comparing against `main`, `master`, or `git rev-parse --abbrev-ref origin/HEAD` **with its `origin/` prefix stripped** — the raw output is `origin/<name>`, so an unstripped comparison never matches.
- **Record the pre-fix scope:** current `HEAD`, whether `git status --short` is clean, and any pre-existing changed files. Then keep a list of **fix-owned files** (the tests and implementation changed for this bug) as you work. Phase 4 answers both of its questions from this record and cannot reconstruct it afterwards.

### Phase 4: Handoff

**`mode:pipeline` — skip this entire interactive handoff.** No polish/review tail, no residual questions, no preview, no learning-capture offer. Commit and push the convergent fix per `references/pipeline-mode.md`, then emit that reference's **structured return** as the final output. Divergent / needs-human items are deferred there (open thread or the caller's run-report comment — never a PR-body section). The rest of this section is the interactive path only.

**Structured summary** — always write this first:

```
## Debug Summary
**Problem**: [What was broken]
**Root Cause**: [Full causal chain, with file:line references]
**Recommended Tests**: [Tests to add/modify to prevent recurrence, with specific file and assertion guidance]
**Fix**: [What was changed — or "diagnosis only" if Phase 3 was skipped]
**Prevention**: [Test coverage added; defense-in-depth if applicable]
**Confidence**: [High/Medium/Low]
```

**If Phase 3 was skipped**, stop after the summary — the user already said they were taking it from here. Do not prompt.

**If Phase 3 ran, read `references/post-fix-handoff.md` now and follow it before routing below.** It owns this phase's quality tail — the contextual-override checks, the skip-for-mechanical-fixes rule, the scoping that keeps `ce-simplify-code` and `ce-code-review` off unrelated branch work, residual handling, the `## Post-Fix Quality` block, and the learning-capture criteria — and none of that appears in this body. The routing below names *which* action fires, never the scope rules that make it safe, so it cannot be improvised from. Skipping the read ships an unreviewed fix, lets review reach into unrelated branch work, and strands accepted findings in the session.

#### Routing

**Land the fix without carrying along anything the user did not offer up** — not into a commit, not into a push, not into a PR. Do not ask whether to open a PR; permission is not the gate. Two questions decide the handoff, answered from the pre-fix scope Phase 3 recorded rather than inferred from how the branch came to exist. **Fire the action itself** via the platform's skill-invocation primitive — never merely tell the user to type a command.

**1. What may go into the commit — the fix-owned files and nothing else.** This is a constraint on whichever skill commits in question 2, never an action of its own. It holds on every route, remote or not. Do not commit here.

- No fix-owned file carried pre-existing edits: those files are the commit scope, passed to whichever skill commits.
- A fix-owned file already carried the user's edits: no commit separates them (`ce-commit` groups at file level and never splits a file). Ask (per **Blocking questions**) *before* anything commits: commit that file including their edits, leave the fix uncommitted, or stop. Only the first answer continues — the other two end the handoff, so question 2 never runs and nothing commits; say what was left and why. Every option loses something the agent cannot choose on the user's behalf, which is why this question survives. Phase 3's confirmation covered *editing* the file, never committing the user's edits with the fix.

**2. Who commits, and whether it ships.** Exactly one of these runs.

- **Ships** — the pre-fix tree was clean, nothing on the branch is work the user has not already offered, and `origin` is **PR-capable**: somewhere `gh` can actually open a PR. Establish those however fits the repo in front of you. Two facts make it less obvious than it looks.
  - `ce-commit-push-pr` pushes the **whole branch**, and its PR spans every commit on it, not just your fix — so the question is about the branch, not your diff. It also pushes *before* creating the PR, so a remote `gh` cannot open a PR against leaves the branch published with no PR.
  - Already pushed is not already **offered**. Commits in an open PR are under review, so they are offered and this run updates that PR rather than opening a second one; commits pushed for backup or to trigger CI are not, and a first PR would publish them. Compare against the remote rather than a local ref — a local branch, including the default branch Phase 3 may have branched off, can itself be ahead of what was pushed.

  If you cannot establish all three, take the local route instead; that is the safe direction, and the preview is not a substitute for it. Otherwise preview what will be committed, on what branch, and whether a PR opens or updates, then **invoke the `ce-commit-push-pr` skill with `branding:on`.** It commits under question 1's scope, so do not commit first. The preview is a statement, not a question. Surface the resulting PR URL.
- **Stays local** — any of those fails. Invoke the `ce-commit` skill under question 1's scope and push nothing. Say in one line what stayed local and why, and that you will push and open the PR on request. Do not ask first — a local commit is reversible.
- **Not a git repo** — nothing commits. Stop after the summary and the quality block.

**Contextual override** ("don't open PRs from skills", "commit only", "stop after the fix") — follow what the user said, and **Stop here** without committing when that is what they asked for. A vague tonal cue is not an override.

**After a PR is open** — apply the reference's learning-capture criteria; if the user accepts, invoke the `ce-compound` skill, then commit the learning doc to the same branch and push so the open PR picks it up.
