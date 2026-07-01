---
date: 2026-07-01
topic: user-test-deterministic-core
---

# ce-user-test Deterministic Core — Requirements

## Summary

Move ce-user-test's four mechanical subsystems — schema migration, caps/thresholds, the commit write sequence, and GitHub-issue dedup — out of skill prose into bundled Python scripts under `skills/ce-user-test/scripts/`, shipped as one change with a fixture-based aging harness as the regression gate. The agent keeps all judgment (scores, maturity decisions, notes, issue text); scripts own arithmetic and file mutation.

---

## Problem Frame

ce-user-test persists compounding state across runs: a test file at schema v10, plus seven sibling artifacts in `tests/user-flows/`. The rules that maintain that state live as prose an LLM re-executes on every run, and the failure class compounds with the state it manages.

Four subsystems carry the cost. The schema migration ladder is nine cascading conditionals in `skills/ce-user-test/SKILL.md` (one per version, each ending "Do NOT rewrite on read" — which commit mode then contradicts by force-upgrading to v10). Six rotation caps live independently in five files (10/20/10/10/50/6 months) with more thresholds scattered elsewhere (7-vs-5 pattern surfacing, -0.5 delta warning, restart at 15), no shared rationale, and no way to notice when one silently stops being honored. The commit sequence mutates eight files in eleven prose steps, with atomic write documented for exactly one of them — a mid-commit interruption leaves state partially updated with no record of which files reflect old versus new. Issue dedup falls back to an unspecified "semantic title search" while a concrete 70% word-overlap algorithm already exists in `skills/ce-user-test/references/probes.md`.

Every future schema version, cap change, and commit step adds more prose to this pile. The planned v11 schema bump (anomaly ledger + evidence array) would otherwise add a tenth migration rung, and the pending upstream PR's most likely review objection is exactly this complexity.

---

## Key Decisions

- **One change, all four subsystems plus the harness.** A coherent "scripts own the mechanical layer" story over smaller sequential reviews. The migration script alone would leave the commit corruption risk standing.
- **Python 3, stdlib-only, invoked via the SKILL_DIR anchor.** This is the plugin's established pattern (`repo-profile-cache.py`, `validate-frontmatter.py`); no new runtime category, no third-party dependencies, works on the Unix-like shells the repo targets.
- **The judgment/mechanical boundary follows the founding learning.** The agent produces a judgment payload — scores, promotion/demotion decisions, notes, issue text. Scripts execute everything downstream of it: migration, cap enforcement, delta arithmetic, file writes, dedup checks. Scripts never decide a maturity transition or a score (`docs/solutions/2026-02-26-agent-guided-state-and-mcp-resilience-patterns.md`).
- **Scripts live only in `skills/ce-user-test/scripts/`.** The companion skills (`ce-user-test-commit`, `ce-user-test-iterate`, `ce-user-test-eval`) are thin wrappers that invoke the main skill, so self-containment holds without duplicating scripts.
- **Lands on `feat/user-test-skill-v2`, folded into the upstream PR.** Reviewers see the refactored suite, not the prose version.
- **Interrupted commits resume by default.** Staged data persists in the journal; re-executing the remaining steps is safer than discarding a run's results. Rollback is the offered alternative, not the default.

---

## Requirements

**Migration script**

- R1. A single bundled script normalizes a test file of any schema version (v1-v10) to the current schema in one deterministic pass, writing atomically.
- R2. Adding a future schema version requires only a data addition (a migration-table entry) in the script — no new prose in SKILL.md or references.
- R3. The migration ladder in SKILL.md is deleted and replaced by an instruction to run the script at load time.
- R4. An unknown or corrupt `schema_version` aborts with a clear error and no partial write.

**Caps and thresholds registry**

- R5. All rotation caps and numeric thresholds live in one registry read by the scripts; the six current cap sites and scattered thresholds are consolidated there.
- R6. Skill prose refers to caps by name; no numeric cap value appears in more than one place.

**Commit engine**

- R7. Commit mode executes through a script driven by a journal: plan all mutations, stage writes, validate the staged set, then apply atomically as a group.
- R8. An interrupted commit is detected on the next invocation and resumes the remaining steps from staged data by default; the user may choose rollback instead.
- R9. The agent supplies a judgment payload (scores, maturity decisions, notes, issue text); the script performs all file updates, cap enforcement, rotation, and delta arithmetic — including the currently-undefined overlapping-areas delta rules, which the script defines and applies consistently.
- R10. Issue dedup uses the 70% word-overlap algorithm already specified for probes; the undefined "semantic title search" fallback is removed. Filing itself (the `gh` call and issue text) stays agent-driven.

**Aging harness**

- R11. A fixture-based harness simulates at least 100 commit cycles and asserts: caps are enforced, IDs stay unique, dedup fires, rotation happens, and no artifact grows without bound.
- R12. The harness runs in the plugin repo's test suite (`bun test` invoking the scripts), gating CI — it does not run on user machines.

**Skill prose**

- R13. Prose superseded by scripts is deleted, not left as a parallel description — each mechanical rule has exactly one home.
- R14. Scripts are Python 3 stdlib-only with no third-party dependencies, targeting the Unix-like shells the repo supports (macOS, Linux, WSL).

```mermaid
flowchart TB
  A[Agent: judgment payload<br/>scores · maturity calls · notes · issue text] --> B[Commit engine]
  B --> C[Write journal: planned mutations]
  C --> D[Stage all writes]
  D --> E{Validate staged set}
  E -->|ok| F[Apply all atomically]
  E -->|fail| G[Abort — no files touched]
  H[Next invocation finds<br/>incomplete journal] --> I{Resume or rollback?}
  I -->|resume (default)| D
  I -->|rollback| G
```

---

## Acceptance Examples

- AE1. **Covers R1, R4.** Given a v5 test file, when a run loads it, the script rewrites it to the current schema in one pass; given a file with `schema_version: 99`, the script aborts with an error and the file is untouched.
- AE2. **Covers R7, R8.** Given a commit interrupted after some artifacts staged, when the next run starts, it reports the incomplete commit and completes the remaining steps from staged data unless the user chooses rollback.
- AE3. **Covers R10.** Given a new bug whose title shares ≥70% word overlap with an open issue labeled for the same area, the commit engine reports it as a duplicate and no issue is filed.
- AE4. **Covers R2.** When the planned v11 schema (anomaly ledger + evidence array) lands, its migration is one table entry in the script and zero new prose lines in SKILL.md.

---

## Scope Boundaries

- Scripting maturity transitions, promotions/demotions, or scoring — stays agent-owned per the founding learning.
- Scripting Evals 1 and 2 in ce-user-test-eval — deferred; the eval already runs context-isolated and the gain is marginal.
- Event-sourcing the state layer — rejected; the commit journal addresses the actual corruption risk at a fraction of the cost.
- A shared escalation module for probes/journeys — deferred; fold into the script layer if that logic is touched later.
- Syncing the personal `~/.claude/skills` copies — manual re-copy from the branch after landing, per existing convention.

---

## Dependencies / Assumptions

- Assumes `python3` is available on user machines, consistent with the plugin's existing script-bearing skills.
- Assumes this lands on `feat/user-test-skill-v2` before the upstream PR is opened/updated — defaulted when the targeting question went unanswered; flip to a follow-up PR if preferred.
- The v11 schema bump (anomaly ledger + evidence array) is the planned next change and is the first consumer of R2.

---

## Outstanding Questions

**Deferred to planning**

- Behavior when `python3` is missing at runtime: abort the commit with an install instruction, or fall back to legacy prose behavior? Match the precedent set by `repo-profile-cache.py` consumers.
- Journal file format, location, and staleness handling.
- Exact script CLI shapes and the judgment-payload schema.
- Whether the registry is a standalone data file or embedded in one script.

---

## Sources

- `docs/ideation/2026-07-01-ce-user-test-skill-improvements-ideation.html` — the ranked ideation this brainstorm develops (idea 1), including the adversarial verifier's verdicts.
- `docs/solutions/2026-02-26-agent-guided-state-and-mcp-resilience-patterns.md` — the judgment/mechanical boundary this change must respect.
- `docs/solutions/skill-design/script-first-skill-architecture.md` — the pattern and its 60-75% token-cut claim.
- `docs/solutions/2026-02-26-monolith-to-skill-split-anti-patterns.md` — why prose budgets need deterministic gates (the harness).
- `AGENTS.md` — SKILL_DIR anchor rules, self-containment, cross-platform constraints.
- Evidence quotes with file:line pointers consolidated at `C:\tmp\compound-engineering\ce-brainstorm\det-core\grounding.md` (session-temporary; the claims are also verified in the ideation artifact above).
