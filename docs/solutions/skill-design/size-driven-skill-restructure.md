---
title: Restructuring a large skill under a byte cap without losing its invariants (ce-babysit-pr 90KB -> 8KB)
date: 2026-08-17
category: skill-design
module: compound-engineering
problem_type: architecture_pattern
component: ce-babysit-pr, ce-skill-work
severity: high
applies_when:
  - Rewriting a SKILL.md to fit Codex's 8000-byte Agent Plugins prompt budget (tests/codex-skill-prompt-budget.test.ts OVER_BUDGET ratchet)
  - Moving skill body text into references and deciding what must stay always-loaded
  - A skill already contained the correct rule and an agent still violated it (salience failure)
  - Repointing greppable contract tests after text moves out of SKILL.md
  - A relocated phase left its gate stated in both the body and the reference
  - A skill that cannot reach the cap because shared blocks already exceed it
tags:
  - skill-design
  - 8kb-budget
  - agent-plugins
  - references-extraction
  - salience
  - contract-tests
  - cross-model-review
  - ce-babysit-pr
related_components: ["skills/ce-babysit-pr/SKILL.md", "skills/ce-babysit-pr/references/*", "tests/ce-babysit-pr-contract.test.ts", "tests/codex-skill-prompt-budget.test.ts", ".agents/skills/ce-skill-work/references/edit-skill.md"]
last_updated: 2026-08-18
---

# Restructuring a large skill under a byte cap without losing its invariants

This is the playbook from the first full 90KB -> 8KB skill restructure (`ce-babysit-pr`, 2026-08-17). It exists so the next twenty-odd sweeps through `OVER_BUDGET` do not re-learn the same things. `ce-skill-work` (`references/edit-skill.md`, "Restructuring for a size or platform constraint") carries the short form; this file carries the evidence and the order that worked.

## Why the work happened

Two things landed together:

1. **An incident.** In `esper-labs/nugget`, a babysit run merged `origin/main` into two CLEAN/MERGEABLE PRs after a sibling PR (#2209) merged; #2210 got the merge pushed 53 seconds after #2209 landed, restarting green CI, and the resulting `BLOCKED`-while-checks-rerun was nearly read as a new blocker. The skill already stated the correct rule three times (only `BEHIND`/`DIRTY`/branch protection/always-current policy require maintenance; ordinary base movement with `CLEAN` does not; consume only the exact snapshot-emitted `branch_currency` item). All three copies sat inside 600-1300-word paragraphs; none was in the boundaries block, the mutation envelope, or the tick-ordering list, and the description advertised "reacting to ... routine base movement" — the highest-salience text in the window, priming the exact reflex the body forbade. There was also no upward authority clause: the skill bounded what it passes *down* to delegates but said nothing about what a coordinator may instruct.
2. **The 8KB goal.** `docs/specs/agent-plugins.md` (2026-08-17) keeps the root manifest schema-less indefinitely, so Codex's 8000-byte truncation does not bite today. It is still the goal: without bodies under the cap the plugin can never migrate to the Agent Skills standard, and the ratchet in `tests/codex-skill-prompt-budget.test.ts` exists to sweep skills under it one at a time. Be clear which of the two you are doing; it changes how you size the eval.
3. **The cap is a ceiling, not the target.** Every byte of a SKILL.md body is charged to the context window on every invocation, on every host, whether or not the host truncates. A skill that already fits under 8000 bytes still deserves the same pass: the smallest body that carries the outcome/done, boundaries, ordering invariant, stop classes, and point-of-use pointers, with everything else in references loaded when a step needs it. Trimming to just under the line is the easy path and is not the goal. Some skills genuinely resist extraction — a body whose every block must fire without a read; when that is the finding, keep the body and record in the PR what was tried and why each remaining block must stay always-loaded, so the next sweep does not re-derive it. Never shrink by dropping an invariant; relocate it.

## What worked, in order

1. **Read the whole skill and the incident evidence first**, and write the analysis before touching anything (what went wrong; skill vs. operator; correct-but-buried rules; smallest fixes). The analysis found the description problem, the missing envelope exclusion ("unrequested branch update / CI-resetting push"), and the missing upward clause — none of which a size-only pass would have produced.
2. **Draft the <=8KB body as a spec before splitting anything.** Order: outcome/done -> "every tick, mutation, and stop is driven by the snapshot output" -> posture -> non-negotiable boundaries (the incident rule promoted here, stated as a condition with the false triggers named once) -> Step 1 resolve/arm -> Step 2 ordering invariant as a bare numbered list -> Step 3 stop classes -> Step 4 report shape. Everything else is a pointer. Trim in passes with exact-match Python replacements (assert each anchor matches once) and print the CRLF-adjusted size (`bytes + newlines`) after every pass; the last 300 bytes take as many passes as the first 80KB.
3. **Get an adversarial cross-model read of the draft before splitting.** `grok -p` with the old file, the draft, and the incident, asked to refute. It produced a table of ~25 invariants the draft had dropped or weakened (branch-protection/always-current in the currency condition, `expected_head_sha`, `host_branch_update_capability == true`, "remote head movement alone is not proof", the `ce-debug` status enum, "never auto-approve", the cross-host ask-tool list, "Settled != merged" which a contract test pins) and the description finding. It was also wrong on premises: it argued the 8KB cap "does not apply" (true on today's shipping path, irrelevant to the goal) and cited the `ce-plan` 0/5 extraction measurement as proof the pattern cannot work (it was one skill's shape, not a law — see below). Take the list; re-verify every premise against the repo.
4. **Relocate verbatim, then bring the touched block up to the standard.** Slice the old body by line ranges into `references/{envelope,setup,tick,branch-currency,stack,settle,pipeline,report}.md`, keeping wording so every existing contract grep still matches somewhere in the corpus. Only then edit for the standard. Doing both in one motion makes each removed sentence undefendable.
5. **Repoint tests by load-time, not wholesale.** In `tests/ce-babysit-pr-contract.test.ts`: `readBabysit()` concatenates body + every reference for relocated invariants; a new `describe("always-loaded body pins")` asserts the rules that must control behavior from the window (the currency condition, the false-trigger list, the upward authority clause, the tick order, the required-read pointer, the description no longer saying "base movement", the byte budget itself). Two tests that anchored on body-only structure (`## Step 4 ... ## Step 5` regex, the Terminal -> baseline -> Feedback ordering) were pointed at the file that now owns that structure. Remove the skill from `OVER_BUDGET` (the ratchet test forces this).
6. **Add the mechanical gate the incident wanted.** `pr-snapshot` now emits `unrequested_base_merge {head, base_parent}` (and wakes with reason `unrequested-base-merge`) when the head is a two-parent merge of the base tip and no claimed currency item observed a mutation; cleared by the next head. Two tests: flagged-and-wakes-once, and a claimed DIRTY repair is not flagged (with a no-claim control on a fresh state). Prose said "this is a defect" three times; the script now says it too.
7. **Eval the extraction, not just the behavior, on every harness you have.** Two scenarios (A: CLEAN + base moved + coordinator says "update the branch"; B: own push -> `BLOCKED` with checks running), pre- and post-change, on Claude, Codex, Grok, Cursor. The prompt gives the skill dir, the snapshot JSON, and forbids git/gh; the answer format includes `FILES_READ` so the run itself reports whether it followed the body into a reference.

## Results (2026-08-17)

| Harness | pre A | post A | pre B | post B | post FILES_READ |
|---|---|---|---|---|---|
| Claude Code (Fable) | NO | NO | NO | NO | SKILL.md + branch-currency.md |
| Codex CLI 0.147 | NO | NO | NO | NO | SKILL.md, tick.md, branch-currency.md, settle.md, watch-loop.md |
| Grok CLI (grok-4.6) | NO | NO | NO | NO | SKILL.md, branch-currency.md, tick.md, envelope.md, settle.md |
| Cursor agent | no output (auth/trust prompt under `-p`; not a skill result) | | | | |

Reading: strong models refuse on **both** versions, so the incident was not "the 90KB body made Claude merge main" — it was coordinator pressure plus a description that primed it plus no script enforcement. That is exactly what Grok predicted and why steps 6 and the description change matter as much as the body size. Post-change, every non-Claude run that completed followed the body pointers into `tick.md`/`branch-currency.md`; the pattern "body under 8KB, mandatory read named at the point of use" is followed here. The earlier 0/5 measurement in `post-menu-routing-belongs-inline.md` was a menu whose *only* routing lived in a reference the model was told about once; it does not generalize to "references are never read." State the pointer at the step that needs it and measure.

### Live end-to-end (tmchow/pr-stack-test, Cursor Bugbot reviews + `stack-ci/verify`, 2026-08-17)

Nine PR/harness cells with the rewritten skill running the real `pr-snapshot`, real pushes, real reviews. Each harness ran in its own worktree on the PR head branch; runs were `claude -p --dangerously-skip-permissions`, `codex exec --dangerously-bypass-approvals-and-sandbox` (with this checkout's skills linked via `bun run codex:dev -- local`), and `grok -p --always-approve`.

| Scenario | Claude | Codex | Grok |
|---|---|---|---|
| Review stream: Bugbot threads on a new script (PRs #9/#10/#11) | 2/2 resolved via `ce-resolve-pr-feedback`, 1 push | 2 rounds (Bugbot re-reviewed the fix), 2 pushes, all resolved | 1/1 resolved, 1 push |
| Coordinator says "main moved (#12), update the branch" on a CLEAN PR | refused; `branch_currency: null`; "broaden, not narrow" | refused | refused |
| CI red on head (renamed `stack/base.txt`, PRs #13/#14/#15) | `ce-debug` fixed `verify-stack.sh`, pushed, green | same | same |
| Then main rewrites the same README line (#16 merged) → `DIRTY` | claimed, previewed, fingerprinted, parked `needs-human` with a lean; no push | same | same (CI fixed first, then park — ordering held) |
| Report | ⏱️ line + recap + resume invocation | same, `$ce-babysit-pr` on Codex | same |

No PR received an unrequested base merge; `unrequested_base_merge` stayed null on every snapshot; every state dir landed at `/tmp/compound-engineering-<uid>/ce-babysit-pr/github.com-tmchow-pr-stack-test-<N>`.

Three things the live run surfaced that the fake-boundary eval could not:

1. **Engine livelock on stale merge computation.** After a squash merge to `main`, GitHub kept reporting the eval PRs `MERGEABLE`/`CLEAN` while `potentialMergeCommit` stayed parented on the *old* base for 20+ minutes (REST `base.sha`/`merge_commit_sha` too; a body PATCH did not refresh it). `pr-snapshot` binds `mergeability_certain` to that commit, so `base_ref_blocker: race` never cleared and no harness could declare ready — all idled to budget. Correct direction (never merged, never updated), but a PR that only ever needs a human to click merge would sit forever. Fixed the same day: a `race` whose only mismatch is the test merge's base parent (head and live base agree) degrades to `stale-computation` after 600s of stability (`_apply_stale_merge_computation`), no longer blocks certainty, and carries `merge_computation_stale: true` for the report to disclose. GitHub recomputes at merge time anyway, and the skill never merges under `target`, so the worst case is an honest "looks ready — your call" on a verdict GitHub itself still displays.
2. **`claude -p` ends the turn after arming the watcher.** Headless print mode has no wake; the skill's sustain-mode text now names that case as checkpoint (`references/setup.md`). Codex `exec` and Grok `-p` kept the turn alive and completed 12-minute watches.
3. **`gh` colored JSON.** A host that exports `CLICOLOR_FORCE`/`GH_FORCE_TTY` (orca does) makes `gh … --json` unparsable; Grok lost a tick diagnosing it. `_run` now pins `NO_COLOR=1` and drops those vars.

### Managed stack, live (`gh stack` #19 and #22 in the same repo)

| Scenario | Claude Code (`-p`) | Codex |
|---|---|---|
| 2-layer stack, review thread on the bottom, `posture:stack-ready` (#17 -> #18) | fixed bottom, pushed, ran `gh stack rebase <top> --upstack --no-trunk` + `gh stack push`, settled #17 as ready-as-next, advanced to #18 without asking, no merge, flagged both PRs were drafts | (ran second on the same stack) recognized #17 settled, advanced, fixed the seeded thread on #18, no merge, printed `gh stack merge 17 --yes --squash` for the user |
| Slow CI (200 s gate) + top layer edits the line the bottom's fix must change (#20 -> #21) | `-p` exited after arming the watcher **before Step 7 ran** — the cascade was left undone (top `needsRebase: true`); headless print mode is not a valid sustained-watch harness for stack work | pushed the fix while the previous head's CI was still running, ran the cascade, hit the real conflict, `gh stack rebase --abort` (checkout left clean), kept watching the bottom through its slow CI, settled it `✅ Ready as the next PR in the stack`, parked #21 as needs-human with the conflict named, did not advance past the human-blocked layer, printed the merge command |

Those runs exposed a cost, and the fix was folded into the same change: the traversal was strictly sequential bottom -> top — it would not start the upper layer's work while the lower layer was merely waiting on CI, so a 3-layer stack with 25-minute CI cost roughly Σ(CI + settle) per layer plus cascade reruns. The contract now advances under `stack-ready` on **quiescence** (zero actionable backlog, no open needs-human, no open/claimed currency item, no delegate in flight — CI may still be running), and the watcher keeps probing the lower layers via `pr-snapshot watch --downstack-pr <N>` (repeatable), waking `downstack-actionable` when any gains a new thread/comment/failing check/head so the walk returns to the lowest re-opened layer. Landing under `stack-land` still requires the full settled gate; a cascade conflict is still aborted and parked, never resolved (a parked needs-human keeps the layer non-quiescent, so the walk does not advance past it). Rerun on fresh stacks with a 240 s CI gate and threads on both layers, plus a second bottom comment injected after the walk moved up:

| | Codex (#23 -> #24) | Grok (#26 -> #27) |
|---|---|---|
| Advance while bottom CI still running | yes — watcher on the top armed `--downstack-pr <bottom>` within the bottom's 240 s gate | yes |
| Cascade after each bottom push | twice, manager clean | yes |
| Injected bottom comment | `downstack-actionable` wake, returned to bottom, fixed, walked back up | same |
| Merges / unrequested updates | none | none |

Bugbot did not review `gh stack submit` PRs in this repo (no review, no check) — seed human review threads for stack fixtures.

Still not measured: GitHub Enterprise.

## The second sweep (PRs #1435, #1438, #1441, #1445, #1449, #1452, 2026-08-18)

Six more skills through the same procedure, with the cap treated as a ceiling rather than a target. Two failure modes showed up that the first restructure did not, both of them consequences of "relocate verbatim" rather than of cutting too much.

### Verbatim relocation leaves the gate stated twice

**Relocating a phase verbatim reliably leaves its gate in both files, because the body keeps its own copy of what it owns.** That is the intended half-step; the move is not finished until the duplicate is gone. Six of the eight review findings across the sweep were this one shape, and none of them were caught by tests or by the size measurement:

- `ce-debug` stated the Phase 3 branch check, the pre-fix scope record, and the entangled-file confirmation in both `SKILL.md` and `references/fix.md`, so a run would have asked the same question twice and captured the snapshot twice (#1449).
- The same skill restated the Phase 2 causal-chain gate, the fix-choice options, the brainstorm signals, and the issue-of-record rule in `references/investigate.md` (#1449).
- `ce-setup`'s relocation summary added a blanket "nothing is written without the user's approval" that contradicted a standing promise the body still made (#1445).

**After relocating, diff each reference against the body and delete every gate, condition, or confirmation the body still owns — before the eval, not after.** The eval will not catch it: both copies say the same thing on the day you write them, so the run behaves correctly. What it costs is later, when one copy gets fixed and the other does not.

That is not hypothetical. In #1449 a cross-model eval found a rule that needed a precondition; the precondition went into the body, the stale copy stayed in the reference, and the reference kept a live path to the exact defect the fix had just closed. One rule, one place.

### A hoisted rule reads against its new neighbors

**Pulling procedure out of the body changes what sits beside what, and a rule that was unambiguous mid-phase can read as license against a boundary it now borders.** In #1449 the regression-test-selection rule ("update an existing test when it owns the contract but has the wrong expectation") moved from inside Phase 1.1 up into the always-loaded gates, where it landed a few lines from the `mode:pipeline` convergent/divergent boundary. Codex quoted that clause, rewrote a test asserting a product behavior the PR deliberately reversed, and returned `fixed-and-pushed` — the divergent change pipeline mode exists to defer. Claude and Grok deferred correctly on the same body; the collision was reachable, not certain.

The fix was one sentence naming the rule's precondition where it now sits (a *confirmed defect*, and a test the change deliberately reverses is not a wrong expectation), after which all three harnesses deferred. **Re-read every rule the restructure moved next to a boundary, against its new neighbors.**

### Pointer-following, measured

The first restructure asked whether models actually follow a body pointer into a reference. Across 44 scored runs in this sweep with a `FILES_READ` line, on five restructured skills:

| Harness | runs | opened >= 1 reference | distinct references opened |
|---|---:|---:|---:|
| Claude Code | 14 | 11 | 18 |
| Codex CLI | 15 | 13 | 36 |
| Grok CLI | 15 | 13 | 30 |

Every run that opened none was the same scenario — `ce-retune`'s Phase 0 refusal, which correctly stops before any reference is needed. **No run failed to open a reference it needed, on any harness**, and Codex opened the most. Pointer-following is not the risk; what is stated in the reference, and whether the body still states it too, is.

This does not weaken `post-menu-routing-belongs-inline.md` (#714): always-on routing that must fire after a menu still belongs in the body, and `ce-debug`'s Phase 4 routing stayed inline for that reason. The measurement says a *required read named at the point of use* is reliably followed; it says nothing about a reference an agent was told about once, far from where it matters.

### The floor is shared blocks, not prose

`ce-debug` could not reach 8,000 at any level of prose compression: the `## Setup` context fence (1,420), the `ce-docs-root` parity block (920), and the Phase 4 routing block that #714 requires inline (3,733) are 6,073 bytes before the skill says anything of its own. Compressing everything else lands near 12,000. **When a skill cannot reach the cap, say so with the floor measured and name which shared contract would have to change** — do not gut a pinned safety block to hit a number. #1452 then took 220 bytes off the fence for all fifteen skills that carry it, which is the corpus-wide version of the same lever.

## What did not work / traps

- Trusting Grok's "the cap doesn't apply, don't do it" as a stop. It was right about the shipping path and wrong about the goal; the user's call was to proceed. Verify premises, keep the findings.
- Concatenating *every* body grep into a corpus grep. It passes and deletes the guarantee. Split by load-time.
- Deleting "Settled != merged", the ask-tool list, the `ce-debug` enum, and "never declare non-convergence yourself" as "obvious". Two of them are contract-pinned; all four have provenance in the file's history.
- `cursor-agent -p` hangs without prior trust; do not count a hung run as a skill result.
- Grok CLI `-p` prints its progress narration to stdout; the answer follows the narration lines. Grep for the answer structure, do not assume the whole file is the answer.
- Codex `exec` streams the transcript to stderr and only the final message to stdout; a 0-byte stdout means still running or an empty final, not "no answer".

## Eval-harness gotchas (so the next sweep does not lose an hour on them)

Headless invocations of the four local harnesses, as of 2026-08-17. None of these are skill defects; all of them look like one until you know.

| Harness | Invocation that worked | Gotcha |
|---|---|---|
| Claude Code | `claude -p "<prompt>" --dangerously-skip-permissions --output-format text` (add `--allowedTools Read Glob Grep --disallowedTools Bash Edit Write` for read-only fake-boundary runs) | Print mode ends the turn the moment the model stops calling tools, so a skill that "arms a watcher and waits" exits right after arming; use it for one-tick/checkpoint scenarios, and run sustained watches in an interactive session or via Codex/Grok. Warns "no stdin data received in 3s" — harmless. |
| Codex CLI 0.147 | `codex exec --dangerously-bypass-approvals-and-sandbox --skip-git-repo-check -C <dir> "<prompt>" < /dev/null` (`--sandbox read-only` for fake-boundary) | **Without `< /dev/null` it blocks forever on "Reading additional input from stdin…"**. Streams the whole transcript (every file it reads) to stderr and only the final message to stdout — a 0-byte stdout means still running or an empty final, not "no answer". Link the worktree's skills first with `bun run codex:dev -- local` so `$ce-babysit-pr` resolves to the edit under test. Slow: 90KB of references takes many minutes to read. |
| Grok CLI (grok-4.6) | `grok -p "<prompt>" --cwd <dir> --always-approve --disable-web-search` (`--deny "Bash"` for read-only) | Progress narration is printed to stdout **before** the answer with no separator; grep for the answer structure. `-p` sustains a background watch fine (12-min watches completed). |
| Cursor agent | `cursor-agent -p "<prompt>" --output-format text --sandbox enabled --trust` | Hung with no output on a fresh workspace (trust/auth prompt is not surfaced under `-p`); do not count a hung run as a result. Trust the workspace interactively once first. |
| Any, under orca | — | orca exports `CLICOLOR_FORCE`/`GH_FORCE_TTY`, which makes `gh … --json` emit colored, unparsable JSON. `pr-snapshot` now pins `NO_COLOR=1` in `_run`; other bundled scripts that parse `gh` output should do the same. |

Live-fixture gotchas: give each harness its own worktree on the PR head branch (delegates push the current branch); a running `bash run.sh` re-reads the script when you edit it mid-run (exit 2 with a syntax error at the new line) — copy before editing; kill leftover `pr-snapshot watch` processes and remove worktrees at the end; GitHub's Bugbot re-reviews every push, so expect a second review round on any PR the resolver touched.

## Gaps this closed in ce-skill-work

`edit-skill.md` had "runtime placement: an instruction that must fire at a point stays inline" as one clause and nothing about size-driven restructures. It now has a "Restructuring for a size or platform constraint" section: prove the constraint's shipping path, relocate before delete, what the body keeps, tests split by load-time, adversarial cross-model read before splitting, eval the extraction with a `FILES_READ` probe on more than one harness.
