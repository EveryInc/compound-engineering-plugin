---
title: ce-retro session retrospective skill - Plan
type: feat
date: 2026-11-10
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
deepened: 2026-11-10
---

# ce-retro session retrospective skill - Plan

## Goal Capsule

- **Objective:** A developer can look back over a repo's recent agent sessions, across every harness on their machine, and come away with a short list of environment changes, each backed by a cost the agent actually paid. The approved ones are landed or handed to the right owner. The next look-back shows whether they worked.
- **Means:** a new user-invoked skill, `ce-retro`, built on copies of `ce-compound`'s session-history scripts plus a local ledger (KTD1, KTD3).
- **Authority:** this plan, then `AGENTS.md` and `docs/solutions/skill-design/portable-agent-skill-authoring.md`, then the current skill text. Skill prose is authored under the repo-local `ce-skill-work` skill.
- **Execution profile:** one PR. Scripts, state helper, skill prose, catalog and docs updates, mechanical tests, and the eval pack all ship together.
- **Stop conditions:** stop and report if `skills/ce-retro/SKILL.md` cannot hold the outcome, proof bar, and authority rules within 8,000 bytes with everything else in references. Also stop if a change to the shared session-history scripts would alter `ce-compound`'s observable discovery results, or if the eval shows the skill does not beat the no-skill control on recall and precision or falls below U5's precision bar.
- **Who finishes:** `ce-work` or `lfg` builds and opens the PR. Merging, and the reply that closes issue #919, stay with the maintainer.

---

## Product Contract

### Summary

Add `ce-retro`, a skill the user runs to review this repo's recent agent sessions from Claude, Codex, Cursor, Pi, oh-my-pi, and their subagents. It finds what slowed or misled the agent, keeps only candidates with a recorded cost that still happen on the current tree, and proposes the cheapest fix in the place the right agent reads. After one approval round it applies the environment edits itself and sends code lessons, standards overhauls, product changes, and skill friction to their owners. A local ledger records what was accepted, routed, or rejected, so later runs grade earlier changes and never re-propose a rejection without new evidence. Issue #919 is answered by pointing post-fix postmortems at `ce-compound` and the broader ask at `ce-retro`.

### Problem Frame

Agents lose time in a repo for reasons that are not code bugs: a doc points at a moved file, the first test command is wrong, an instruction contradicts another, a log the agent needed is out of reach, the user has to correct the same habit twice. None of these is a solved problem that corrected a wrong belief about code, so `ce-compound` never fires on them, and `ce-explain`'s recap reads git, PRs, and docs, not transcripts. The maintainers have found this friction by hand, in multi-session usage audits (#1921, #2039, #2034), and each audit took a long, manual session. Issue #919 asked for a postmortem skill. Its narrow form, a lesson after a verified fix, is already `ce-compound` capture. Its broader form, learning from how sessions went, has no owner.

### Requirements

**Sessions and window**

- R1. The skill reads this repo's sessions from every harness it can reach on the machine, including Claude subagent transcripts and Codex child rollouts. Subagent sessions are folded into their parent when counting evidence.
- R2. "This repo" covers the main checkout and every worktree of the same repository. Sessions whose recorded directory is only an ancestor of the repo are dropped unless their content touches paths inside the repo.
- R3. The window starts at about two weeks back. The agent extends it when evidence is thin and stops before a restructure that moved the paths a candidate depends on, so that evidence describes the current tree. New candidates come only from sessions after the last recorded retro run. Grading may read further back.
- R4. The current session is included up to the retro's own invocation. The retro's own turns are never evidence.
- R5. An optional focus narrows the run to sessions where a named skill or topic actually ran. A focus that matches nothing is reported, and the run never silently widens.

**Candidates and proof**

- R6. Every candidate cites its source sessions and harness and a recorded cost (calls, time, a user correction, a defect caught late). A candidate with no recorded cost is dropped.
- R7. Every candidate is confirmed on the current tree before it is shown. Where the signal can be checked mechanically (a path, a command, a missing entry), the check runs. Otherwise the cause must still be present. A candidate whose cause is gone is dropped.
- R8. Each candidate names the cheapest fix, preferring removal, then a check, then a pointer or doc fix, then a standard, then a new instruction. It also names where the fix lives (always-loaded, review-time, or on-demand, and personal or project scope), who owns it, and the signal a later run would use to tell whether it worked.
- R9. Candidates that touch the same file region are merged or offered as alternatives, so the user cannot approve two conflicting edits.

**Approval, apply, and routing**

- R10. The user sees one readable account: coverage, then candidates ranked by cost, each with its evidence. They approve, reject, or correct in one round, and can ask to go one at a time.
- R11. `ce-retro` applies approved environment edits itself: instruction pointers and pruning, doc and path fixes, small scripts, harness settings. Each applied edit is verified against its own check. An edit that fails is reported as approved but not applied.
- R12. Edits outside the repo, such as a user-global instruction file, are shown as a diff and written only after their own approval. The previous content is kept in the run's state directory.
- R13. Approved items that `ce-retro` does not own go to their owner: a lesson about how code behaves goes to `ce-compound`, which still applies its own bar. A standards overhaul goes to `ce-setup` with `standards`. A product-code change becomes a plan for `ce-plan`, `ce-work`, or `lfg`. Friction caused by a skill or plugin becomes an upstream issue drafted for the user to post.
- R14. With no user able to answer, the run reports and writes its candidates to a file for a later attended run. It applies nothing and records no decisions.

**State**

- R15. A local ledger records each decision as accepted (with target and success signal), routed (with target and its result), routed-and-skipped (with target and reason), approved-but-not-applied (with reason), or rejected (with reason), plus each run's date. It lives under `.context/compound-engineering/ce-retro/` at the main checkout, so every worktree shares it.
- R16. A later run grades each accepted change against its success signal and the current tree. A change that failed becomes a candidate to revert or replace.
- R17. A rejected or routed-and-skipped candidate comes back only when cost evidence newer than its decision appears.

**Privacy and reporting**

- R18. Commits, PR text, drafted issues, and the ledger cite session ids, harness, and a paraphrased cost, never verbatim transcript text.
- R19. Every run reports coverage per harness: sessions read, the window and why, what was skipped and why. Each source is reported as searched, present but unreadable, or absent.

### Key Decisions

- **Name `ce-retro`, user-invoked only.** The description leads with what it does and carries "retro", "postmortem", and "papercuts" so any of those phrasings find it. (session-settled: user-directed — chosen over ce-papercuts, ce-friction, and ce-debrief: retro is easy to remember, and the others undersold the scope, named only the symptom, or did not say what was being reviewed.) Governs R1-R19.
- **All harnesses, recency-bounded by the agent.** The agent chooses the window with the stated goal that evidence matches the current tree, from a two-week starting point. (session-settled: user-directed — chosen over a fixed cutoff: older evidence loses value as the codebase shifts, and agents can reason over that when given the goal.) Governs R1, R3.
- **Environment friction, not code bugs.** Agent papercuts and navigation are the core. Code bugs stay with `ce-debug` and `ce-compound`. (session-settled: user-directed — chosen over a postmortem limited to bug fixes: the user widened scope to papercuts that block agents from navigating the repo.) Governs R6-R8, R13.
- **`ce-retro` owns environment edits and routes the rest.** (session-settled: user-approved — chosen over handing every finding to ce-compound: ce-compound cannot edit instruction files, other docs, settings, or scripts, cannot change product code, and handles one lesson per run.) Governs R11, R13.
- **Local ledger, not commit trailers.** (session-settled: user-directed — chosen over commit trailers and over a committed ledger file: this repo squash-merges with a blank message so branch trailers never reach main, edits outside the repo get no commit, and a committed file adds churn.) Governs R15-R17.
- **Ledger in CE's working-state location at the main checkout.** (session-settled: user-approved — chosen over an `.out-of-scope` file and over `/tmp`: `/tmp` is cleared on reboot, and a per-worktree location would lose decisions when short-lived worktrees are removed.) Governs R15.
- **The skill and its approach stand on their own merit.** No external retro skill is cited in the skill, guide, plan, or PR, and the eval baseline is a no-skill control. (session-settled: user-directed.) Governs R1-R19.

### Scope Boundaries

- Not a code-bug diagnoser. A defect found in product code is routed, never fixed by `ce-retro`.
- Not a team retrospective, and it produces no "what went well" section.
- Reads only this machine's sessions. Teammates' sessions and shared rejections are out of scope.
- Never posts to an issue tracker. Upstream issues are drafts.
- Considered and not built: reading Codex `archived_sessions/*.jsonl.zst`. A two-week default window rarely reaches archived rollouts, and decompression would add a `zstd` dependency. Coverage reports the archive as present but unread. Revisit if users run windows longer than about a month.
- Considered and not built: carrying `ce-retro` trailers through squash merges by changing `ce-commit-push-pr`. The ledger makes trailers unnecessary.
- Considered and not built: a lease or lock around the ledger. Writes are append-only, one record per decision, and readers dedupe, so two concurrent runs lose nothing. Revisit if duplicate proposals across parallel runs show up in practice.

#### Deferred to Follow-Up Work

- Scheduled retros (a `mode:non-interactive` entry for cron or `ce-sweep`-style runs), after the attended flow is proven.
- A `ce-help` routing eval refresh beyond the rows this plan adds, if routing changes reveal drift.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Copy the session-history scripts into `skills/ce-retro/scripts/session-history/` and keep the two copies byte-identical.** AGENTS.md forbids cross-skill file references. A parity test in the shape of `tests/peer-job-runner-parity.test.ts` holds the copies together, and behavior tests keep running against one copy. New behavior lands in both copies behind opt-in flags, so `ce-compound`'s current calls return the same results: `--include-subagents` for Claude `<session>/subagents/*.jsonl`, a `parent_session` field for Codex `thread_spawn` children, and repeatable `--cwd-filter` roots. Implements R1, R2.
- KTD2. **A new bundled script, `skills/ce-retro/scripts/retro-state.py`, owns repo identity and the ledger.** One writer keeps the ledger format consistent, as `ce-sweep`'s `sweep-state.py` does for its state. It resolves the repo's roots from the absolute git common dir and `git worktree list`, the store directory at the first non-bare worktree (falling back to `<git-common-dir>/compound-engineering/ce-retro/` for a bare repo), and appends and reads decision records. Path and ownership guards follow `skills/ce-prototype/references/preview.md`. Implements R2, R15-R17.
- KTD3. **The ledger is append-only JSONL: one record per decision plus one run record per completed run.** A decision's exact key is the target path plus the friction kind. Mining subagents word each candidate fresh, so text normalization cannot recognize a reworded repeat. Before proposing a candidate, the orchestrator therefore compares it with earlier decisions on the same target and kind, and treats a match on the same underlying friction as the same item, citing the earlier record. Records hold session ids and paraphrase only (R18). Readers take the latest record per item. Implements R15, R17.
- KTD9. **Only attended, unfocused runs advance the new-candidate cutoff, and the cutoff is kept per harness.** The run record stores, for each harness, the latest session time that run actually read. R3's "after the last recorded retro run" reads that per-harness value. A focused run (R5) records its focus and window without advancing anything, and a run with no user (R14) records nothing, so sessions a run never examined, including those from a harness that was unreadable at the time, stay eligible. Implements R3, R5, R14, R19.
- KTD10. **Transcript content is untrusted data, never instructions.** Sessions carry pasted pages, PR comments, and other agents' output written by third parties. Miners are read-only and only return candidate lists. The orchestrator derives any command it runs for R7's check from the current tree, never from transcript text. The approval account shows the exact text of any proposed instruction, script, or permission change, not a paraphrase, so the user approves what will be written. Implements R7, R10, R11.
- KTD4. **Extraction ranks, the current-tree check decides.** Transcript signals look like ordinary events, so the extractors and the agent's first pass rank candidates by cost and confidence. The deciding gate is R7's check against the tree (`docs/solutions/skill-design/detector-that-cannot-decide-should-rank-not-assert.md`). Implements R6, R7.
- KTD5. **Mining fans out to subagents with file paths, not inlined transcripts.** Transcript mining reads far more than it returns. The orchestrator runs discovery and metadata inline, extracts skeletons and errors to a per-run scratch directory, and hands batches of skeleton paths to generic subagents that return candidate lists. The orchestrator owns proof, ranking, approval, and writes. Implements R1, R6.
- KTD6. **Approval follows `ce-setup`'s standards flow.** One account with evidence per item, then one approval with corrections (`skills/ce-setup/references/project-docs.md`). A one-at-a-time walk-through is offered on request. Implements R10.
- KTD7. **`ce-retro` owns environment and tooling checks. Checks that guard code behavior go to `ce-compound`.** This draws a clear line between `ce-retro`'s fix ladder and `ce-compound`'s form ladder. Implements R8, R13.
- KTD8. **The SKILL.md body holds the goal, proof bar, authority, and stop rules. Everything else lives in references read at the step that uses them.** The 8,000-byte cap is planned from the first draft (`docs/solutions/skill-design/size-driven-skill-restructure.md`). Implements R1-R19.

### High-Level Technical Design

Run flow:

```mermaid
flowchart TB
  A[Invoke ce-retro] --> B[retro-state.py: repo roots, store dir, last run]
  B --> C[discover sessions, all harnesses, subagents]
  C --> D[metadata pass, cwd filter on all roots]
  D --> E[agent picks window from the goal]
  E --> F[skeleton and error extraction to scratch]
  F --> G[subagents mine batches, return ranked candidates]
  G --> H[grade accepted changes from the ledger]
  H --> I[match candidates to earlier decisions, drop those without newer cost]
  I --> J[current-tree check per candidate]
  J --> K{user can answer and store writable?}
  K -- no --> K1[report plus candidates file, no edits or ledger records]
  K -- yes --> L[one account, one approval round]
  L --> M1[apply environment edit, verify]
  L --> M2[route to owner]
  L --> M3[record rejection]
  M1 --> N[append ledger records, final report]
  M2 --> N
  M3 --> N
```

Ledger states for one fingerprint:

```mermaid
stateDiagram-v2
  [*] --> proposed
  proposed --> accepted: applied and verified
  proposed --> approved_not_applied: apply failed
  proposed --> routed: sent to owner
  proposed --> rejected: user declined
  routed --> accepted: owner reports done
  routed --> routed_skipped: owner declined
  accepted --> proposed: later grade failed
  rejected --> proposed: newer cost evidence
  routed_skipped --> proposed: newer cost evidence
  approved_not_applied --> proposed: next run
```

### System-Wide Impact

- **`ce-compound`:** its session-history scripts change, behind opt-in flags only (KTD1). Its discovery results and tests must not move.
- **`ce-help`:** gains a manual skill row and three handoff rows. The routing eval reruns after U4.
- **Users' machines:** the skill reads every harness's session store and may write user-global instruction files after approval (R12). That is the widest read and write surface of any CE skill, which is why R18 and the per-item approval in R12 exist.
- **Public repo:** eval corpora come from private sessions and never enter the repo (U5).

### Risks

| Risk | Mitigation |
|---|---|
| Codex refuses skill-granted instruction-file edits when a project or user rule says to ask first | The refusal is a reported stop per item (U3 step 4), and the guide names the Claude/Codex difference |
| Transcript mining cost grows with a wide window and many subagents | Metadata pass on everything, skeletons only for the ranked subset, batched subagents (KTD5), and coverage names what was skipped for budget (R19) |
| Proof gate lets plausible but uncosted candidates through | R6 and R7 are the body's bar, and the clean-window negative control in U5 checks restraint |
| Recall corpus is biased because audited sessions are already fixed | Capture sessions from before each audit's fixes landed (U5 step 2) |

### Assumptions

- The user's "build the plan now" was taken as permission to skip the scoping confirmation.
- Current-session identification uses the harness session id when one is exposed. Otherwise it uses the newest still-growing session file whose directory matches a repo root.
- Sessions from deleted worktrees are attributed when their recorded directory sits under a known worktree root of this repo or their recorded git branch exists here. Others are dropped and counted in coverage.

---

## Output Structure

```text
skills/ce-retro/
  SKILL.md
  references/
    sessions-and-window.md
    candidates-and-proof.md
    placement-and-routing.md
    approval-and-apply.md
    ledger.md
    report.md
    agents/session-miner.md
  scripts/
    retro-state.py
    session-history/
      discover-sessions.sh
      extract-metadata.py
      extract-skeleton.py
      extract-errors.py
```

---

## Implementation Units

### U1. Shared session-history scripts: copy, extend, hold in parity

- **Goal:** `ce-retro` has its own copy of the session-history scripts that can find subagent and child sessions across all of a repo's worktrees, while `ce-compound`'s results stay unchanged.
- **Requirements:** R1, R2, R19. KTD1.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-compound/scripts/session-history/discover-sessions.sh`, `extract-metadata.py` (modify)
  - `skills/ce-retro/scripts/session-history/*` (create, byte-identical copies)
  - `tests/session-history-scripts.test.ts` (extend)
  - `tests/session-history-parity.test.ts` (create)
  - `tests/fixtures/session-history/` (add Claude `subagents/` and Codex `thread_spawn` fixtures)
  - `scripts/test-scope.ts` (catalog the new copy so changes select the session-history tests)
- **Approach:**
  1. Add `--include-subagents` to Claude discovery, off by default.
  2. Add a `parent_session` field when a Codex rollout's `source` carries `thread_spawn.parent_thread_id`, and a matching field for Claude subagent files from their path.
  3. Let `--cwd-filter` repeat, keeping a session that matches any root. Add an opt-in `--no-ancestor` that drops an ancestor-only match unless the session's content names a path inside one of the roots (R2).
  4. Let `discover-sessions.sh --cwd` repeat, probing each root's Pi and omp session directories and Cursor project folders. A single `--cwd` behaves exactly as today.
  5. Copy all four scripts, then add the parity test.
- **Patterns to follow:** `tests/peer-job-runner-parity.test.ts`, `tests/ce-sweep-analyzer-parity.test.ts`. Interpreter probing per `docs/solutions/conventions/resolve-python-interpreter-not-python3.md`.
- **Test scenarios:**
  - Claude fixture with a parent session and two subagent files: default discovery lists only the parent; with `--include-subagents` it lists all three, and each subagent's metadata names the parent.
  - Codex child rollout with `thread_spawn.parent_thread_id`: metadata includes `parent_session` equal to that id. A rollout without it has no such field.
  - Two `--cwd-filter` roots (main checkout and a worktree path): sessions from either are kept; a session from a sibling repo with a shared name prefix is dropped.
  - `--no-ancestor` with a session whose cwd is `~` and whose content never names a repo path: dropped. The same session without the flag: kept, matching today's behavior.
  - `--no-ancestor` with a session whose cwd is `~` and whose content edits a file inside the repo: kept.
  - Two `--cwd` roots, with a Pi session recorded under a linked worktree whose path lacks the repo name: discovered.
  - Every existing `ce-compound` scenario passes unchanged with no new flags.
  - Parity test fails when one copy differs by one byte.
- **Verification:** both copies are identical, the new flags work on fixtures, and `ce-compound`'s existing tests pass untouched.

### U2. Repo identity and ledger helper

- **Goal:** one script answers "which directories are this repo", "where does state live", and "what was decided before", the same way on every run and worktree.
- **Requirements:** R2, R3, R12, R15, R16, R17, R18. KTD2, KTD3, KTD9.
- **Dependencies:** none.
- **Files:**
  - `skills/ce-retro/scripts/retro-state.py` (create)
  - `tests/skills/ce-retro-state.test.ts` (create)
- **Approach:**
  1. `roots`: absolute common dir, main checkout, and every worktree path, as JSON.
  2. `store`: resolve and create the store directory with the symlink and ownership guards from `skills/ce-prototype/references/preview.md`. Report whether `.context/compound-engineering/` is gitignored at the main checkout, and exit with a distinct status when the store cannot be written, as happens in a sandbox scoped to the current worktree.
  3. `record`: append one decision record (key, state, target, success signal or reason, session ids, date). It rejects records containing fields not in the schema.
  4. `record-run`: append one run record holding, per harness, the latest session time the run read (KTD9).
  5. `read`: latest record per key, the earlier records on the same target and kind for KTD3's match, and the per-harness cutoffs.
  6. `backup`: copy a file outside the repo into a run-named subdirectory of the store before R12's write, and print its path.
- **Patterns to follow:** `skills/ce-sweep/scripts/sweep-state.py` as the single writer. Common-dir resolution in `skills/ce-work/scripts/unit_workspace_state.py` and `skills/ce-worktree/SKILL.md`. Tests write only inside their own `mktemp` repo.
- **Test scenarios:**
  - Run from a linked worktree: `store` resolves inside the main checkout's `.context/compound-engineering/ce-retro/`, and the same call from the main checkout returns the same path.
  - Bare repo with one worktree: `store` resolves under `<git-common-dir>/compound-engineering/ce-retro/`.
  - Symlinked `.context` directory: `store` refuses and exits non-zero with a reason.
  - Non-git directory: `roots` exits with a distinct status the skill can report.
  - Two records for one key (rejected, then proposed with newer evidence): `read` returns the newer one.
  - Store directory is read-only: `store` exits with the unwritable status and writes nothing.
  - A run record with cutoffs for Claude and Codex but none for Pi: `read` returns no Pi cutoff, so all Pi sessions in the window stay eligible.
  - `backup` of a file outside the repo: the copy lands under the store's run subdirectory, byte-identical.
  - Two runs append concurrently: both records survive.
  - A record carrying an unknown field such as `excerpt` is refused.
- **Verification:** every scenario passes in a throwaway repo, and nothing is written outside it.

### U3. The `ce-retro` skill prose

- **Goal:** an agent given only the skill can run the whole flow, from discovery through the ledger, on any supported harness.
- **Requirements:** R1-R19. KTD3-KTD10. Session-settled Key Decisions govern scope and naming.
- **Dependencies:** U1, U2.
- **Files:**
  - `skills/ce-retro/SKILL.md` (create)
  - `skills/ce-retro/references/sessions-and-window.md`, `candidates-and-proof.md`, `placement-and-routing.md`, `approval-and-apply.md`, `ledger.md`, `report.md`, `agents/session-miner.md` (create)
- **Approach:**
  1. Author under `ce-skill-work`. The body states the goal, the done condition, the proof bar (R6, R7), the authority to write (R11, R12, R14), and the privacy rule (R18). Every other rule lives in one reference, read at its step.
  2. The friction signals in the user's scope are a short list of examples under a stated membership condition (environment friction that cost the agent and that an environment change could remove), not a closed table.
  3. Handoffs are one-line directives naming the callee skill and argument, as in `skills/ce-compound/SKILL.md`. Each handoff maps the callee's terminal signal to a ledger state (`Documentation complete` maps to accepted, `Documentation skipped` maps to routed-and-skipped).
  4. Instruction-file edits that a harness or project rule refuses end as a reported stop for that item, not a silent success.
  5. The body and `references/agents/session-miner.md` carry KTD10's untrusted-data rule.
  6. When `store` reports `.context/compound-engineering/` is not gitignored, offer the ignore line before the first write, as `skills/ce-setup/references/repo-fixes.md` Step 8 does. If the user declines, R12 backups go to the run's OS-temp scratch directory instead, and the report names that location.
  7. When `store` reports the store is unwritable, the run behaves as R14 describes and tells the user to rerun from the main checkout or with write access to it.
  8. Frontmatter: `disable-model-invocation: true` and an `argument-hint` for focus and window.
- **Patterns to follow:** `skills/ce-sweep/SKILL.md` frontmatter. The scratch-root preamble from `skills/ce-explain/SKILL.md`. The `SKILL_DIR` script anchor from AGENTS.md. `docs/solutions/skill-design/bound-contradiction-checks-to-named-guidance.md` for conflicting-instruction checks.
- **Test scenarios:**
  - `tests/codex-skill-prompt-budget.test.ts` passes with `ce-retro` under 8,000 bytes and not in `OVER_BUDGET`.
  - `bun run test:skill-guards` passes: no cross-skill paths, no load-time `!` commands, no platform variables without fallback.
  - `tests/scratch-root-preamble-executes.test.ts` covers the copied preamble.
- **Verification:** guards and budget pass, and every reference is named by the step that reads it.

### U4. Catalog, docs, and interplay records

- **Goal:** the new skill is discoverable everywhere the repo lists skills, and its handoffs are recorded where `ce-help` reads them.
- **Requirements:** R13. AGENTS.md "Plugin Maintenance".
- **Dependencies:** U3.
- **Files:**
  - `docs/guides/ce-retro.md` (create)
  - `docs/guides/README.md` (row under Around the Loop)
  - `README.md` (name in the Around the loop group row; three counts 37 to 38)
  - `skills/ce-help/references/skill-map.md` (row marked `(manual)`)
  - `skills/ce-help/references/workflow.md` (one sentence on what `ce-retro` hands to)
  - `tests/skills/ce-help-contract.test.ts` (`STARTS` rows for `ce-compound`, `ce-setup`, `ce-plan`)
  - `tests/release-metadata.test.ts` (skill count 38)
- **Approach:** the guide follows `docs/guides/ce-sweep.md`'s shape and says plainly that it is user-invoked. It explains the difference from `ce-compound` in one paragraph: `ce-compound` keeps one lesson from a solved problem, `ce-retro` looks across sessions for environment friction. It also says that Codex refuses skill-granted instruction-file edits when a project or user rule requires asking first, and that each refused item is reported as a stop.
- **Patterns to follow:** `docs/guides/ce-sweep.md`, existing skill-map rows.
- **Test scenarios:**
  - `tests/release-metadata.test.ts` passes with the name listed once and all three counts at 38.
  - `tests/skills/ce-help-contract.test.ts` passes with the new `STARTS` rows, and the five skills barred from mentioning `ce-compound` still do not.
- **Verification:** `bun run release:validate` and `bun run plugin:validate` pass.

### U5. Behavioral eval pack

- **Goal:** evidence that `ce-retro` finds real friction better than an unguided agent, routes it correctly, and holds back on a clean window.
- **Requirements:** R1, R6-R14, R18. Stop condition on the no-skill control.
- **Dependencies:** U3.
- **Files:**
  - `tests/skill-eval-cell/packs/ce-retro.md` (create)
  - `tests/skill-eval-cell/packs/ce-retro/` (builder that seals a temp `HOME`, `CLAUDE_CONFIG_DIR`, and `CODEX_HOME` around a captured corpus, plus scenario definitions)
- **Approach:**
  1. All rows are `post_only`. The control is the same task given to a bare agent with no skill.
  2. Recall corpus: sessions captured from before each manual audit's fixes landed (#1921, #2039, #2034), with the audits' findings as the withheld answer key. Each recall scenario runs against a worktree checked out at the commit before that audit's fixes, with session timestamps shifted into the default window, so R3 and R7 do not drop findings whose causes the current tree has since fixed. Both arms get the same checkout and corpus. The builder confirms each withheld finding's cause is present at that commit. The captured corpus stays on the maintainer's machine. Only the pack spec, the synthetic fixtures, and aggregate results are committed (no private-repo content).
  3. Grade what the run did: files it would edit, commands it would run, where each item was routed, and handoff calls recorded with `--handoff-probe`. Never offer the grader a menu of friction kinds. Grade precision for both arms with the same worth-acting-on criteria.
  4. Scenarios: recall corpus, clean-window negative control, worktree run (state lands at the main checkout), unwritable store, a planted secret in a transcript (it must not appear in any output), an instruction-shaped request planted in a pasted transcript turn, a rejected candidate re-mined in different words, a refused instruction-file edit, and a run with no user able to answer.
  5. Claude, Codex, and one more harness, at least three trials each on the recall and negative-control rows, with an independent grader.
- **Patterns to follow:** `tests/skill-eval-cell/packs/ce-babysit-pr-stale-intake/`, `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md`, `docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md`, `docs/solutions/skill-design/grading-live-delegation-evals-from-host-session-logs.md`.
- **Test scenarios:**
  - Recall corpus: `ce-retro` recovers more of the audits' findings than the control.
  - Precision: at least half of `ce-retro`'s cost-backed candidates are ones the maintainer marks as worth acting on, and its share is higher than the control's.
  - Clean window: proposes nothing, or only candidates that pass R6 and R7 on inspection.
  - Planted secret: absent from the report, the ledger, commits, and drafted issues.
  - Planted instruction: no miner acts on it, and its text reaches the account only as an exact quoted change awaiting approval, never applied unapproved.
  - Reworded rejection: the earlier rejection suppresses the candidate when no newer cost evidence exists.
  - Unwritable store: nothing applied, no ledger records, candidates file written, and the report says how to rerun.
  - Refused edit: reported as a stop for that item, not as applied.
  - No user able to answer: nothing applied, no ledger decision records, candidates file written.
- **Verification:** results reported per host with trial counts. Any host that did not run is named with its reason.

---

## Verification Contract

| Check | When | Proves |
|---|---|---|
| `bun run test` (or `--changed-since=<base SHA>` on a clean committed candidate) | before publishing | scripts, parity, state helper, catalog counts, budget |
| `bun run typecheck` | before publishing | tests and scripts type-check |
| `bun run test:skill-guards` | after any skill edit | skill shell safety and file-reference rules |
| `bun run release:validate` | before publishing | skill inventory and counts |
| `bun run plugin:validate` | before publishing | marketplace and plugin manifests |
| `bun run test:skill-eval-pack -- --skill ce-retro` | before publishing | behavior against the no-skill control (U5) |
| `tests/skill-eval-cell/packs/ce-help-routing.md` | after U4 | `ce-help` still routes correctly with the new handoffs |

---

## Definition of Done

- U1-U5 are complete and their test scenarios pass.
- `skills/ce-retro/SKILL.md` is under 8,000 bytes and the two session-history copies are byte-identical.
- The eval results on at least two hosts show `ce-retro` beating the no-skill control on recall and precision and meeting U5's precision bar, with the negative control passing.
- No output, fixture, or committed file contains transcript text or private-repo content.
- No external retro skill is named in the skill, guide, plan, or PR.
- Abandoned attempts and experimental code are removed from the diff.
- The PR body mentions #919 without auto-closing it, and a closing reply is drafted for the maintainer.

---

## Deferred / Open Questions

These entries are review items left for the author. They do not block implementation.

### From 2026-11-10 review

- **A bare repository with attached worktrees has two prescribed ledger locations** — KTD2, retro-state helper (P2, whole-doc cross-model reviewer, confidence 100)

  An implementer cannot satisfy both rules, and the two choices put the ledger in different places, so worktrees might not share it. KTD2 says the store goes in the first non-bare worktree and falls back to the git common directory only for a bare repo. A bare repository that has a linked worktree matches both rules, and U2's bare-repo test expects the common directory.
  Change: state in KTD2 that a bare common repository always keeps the ledger under its git common directory, including when worktrees are attached, matching U2's test.

---

## Sources

- `skills/ce-compound/scripts/session-history/discover-sessions.sh:47-51` (Claude discovery depth), `extract-metadata.py:48-67, 415-455` (Codex source passthrough, cwd matching)
- `skills/ce-compound/references/form.md` (the form ladder `ce-retro` routes code lessons into)
- `skills/ce-setup/references/project-docs.md` (approval shape), `skills/ce-setup/references/repo-fixes.md:70-80` (gitignore offer)
- `skills/ce-prototype/references/preview.md:13-40` (`.context` guards), `skills/ce-worktree/SKILL.md:21-31` (common-dir resolution)
- `tests/peer-job-runner-parity.test.ts` (parity test shape)
- `docs/solutions/skill-design/detector-that-cannot-decide-should-rank-not-assert.md`, `size-driven-skill-restructure.md`, `skill-granted-approval-yields-to-project-instructions-on-codex.md`
- Repo merge settings: squash merge with a blank message, merge commits disabled (GitHub API, 2026-11-10)
- Issue #919 (ce-postmortem request) and the manual audits in #1921, #2039, #2034
