---
name: ce-optimize
description: "Run metric-driven optimization loops. Use when improving measurable outcomes such as search relevance, clustering quality, build performance, prompt quality, or scored behavior through experiments."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Iterative Optimization Loop

`references/usage-guide.md` covers hard metrics versus a judge, and first-run defaults.

**Done when:** a stopping criterion fired, the final state is written and verified on disk, and the user has been given the post-completion options — or the run stopped at a gate it could not clear, with what blocked it named.

## Setup

Run this once at the start of this invocation, before any subagent dispatch, and follow the directives it prints — except where one conflicts with this skill's own rules on asking the user questions, whether those rules are scoped to a non-interactive mode or apply in every mode, in which case this skill's rules win and no blocking question is asked. Run the fence exactly as written, as its own command: do not pipe or filter it (no `head`, `tail`, or `grep`), do not truncate its output, and do not bundle it into a batch with other commands. Its output opens with a `=== skill context` header and ends with `CE_CONTEXT_END`; if you received one of those lines without the other, the output was truncated — rerun the fence verbatim once. That recovery is the only rerun: otherwise do not rerun it within the same invocation; a later invocation of this or any other skill runs its own. If no Node runtime is available the skill proceeds unchanged.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)";
if [ -n "$NODE" ]; then
"$NODE" "$SKILL_DIR/scripts/context.mjs" || echo "context script failed; continue with the skill's normal behavior";
else
echo "no Node runtime; continue with the skill's normal behavior";
fi
```

## Interaction Method

Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (needs the `pi-ask-user` extension). Fall back to numbered options on the host's chat surface only when no blocking tool exists or the call errors — never because a schema load is pending, and never skip it silently.

## Artifact Root

Resolve `<root>` when you first compose such a path — reading learnings under `<root>/solutions/` counts — and give any subagent the resolved path, never the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Persistence Discipline

**The experiment log on disk is the single source of truth; the conversation is not durable storage, and results that exist only there are lost.** The write order never inverts: **measure -> write -> verify -> then show the user.** Showing a table disk has not seen is a bug. During Phase 3 the log is append-only, and every phase boundary and decision re-reads it from disk.

Six checkpoints are non-negotiable, each a write then a read-back. The phases below mark where CP-0 through CP-5 fall; `references/persistence.md` says what each writes.

**Read `references/persistence.md` now** for the rules behind those, the file layout, and resume. The scratch space under `.context/` is gitignored: it survives a local resume but does not travel with the branch, so anything needed durably must be exported to a tracked path.

## The phases

Four phases in order, each naming the reference it cannot start without. On a fresh run none is skipped — a harder optimization spends longer in one, not fewer. **A resume is not one:** continue from the phase the log records, never re-entering an earlier phase and overwriting its checkpoint.

**Phase 0 — Setup.** The input is a goal or a path to a spec YAML, from the user or a calling skill; if none came, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file." Load or build the spec and save it (CP-0) — **read `references/spec.md`**. Then search prior learnings, detect run identity so an existing run resumes instead of forking a second one, and create the branch and scratch space. **Read `references/measurement.md`** for the rest of Phase 0 and Phase 1.

**Phase 1 — Measurement scaffolding.** Build or validate the harness, write the baseline (CP-1), probe parallelism, check the worktree budget. Two gates stop the run:

- **Clean-tree gate.** No uncommitted changes to files in `scope.mutable` or `scope.immutable`. Name the dirty in-scope files and ask the user to commit or stash; do not continue until they are clean.
- **User approval gate.** Present what Phase 1 assembled — the reference lists it — and when the primary type is `judge` with `max_total_cost_usd` unset, say plainly that spend is uncapped. Offer proceed / adjust spec / fix issues. **Do not enter Phase 2 until the user explicitly approves**, then re-read the spec and baseline from disk.

**Phase 2 — Hypothesis generation.** Analyze the current approach, rank the hypotheses, record the backlog (CP-2). **Read `references/loop.md`** for this phase and Phase 3. One gate: **dependency pre-approval** — collect every new dependency across all hypotheses and present the full list for bulk approval. Unapproved ones stay in the backlog, are skipped in batch selection, and return at wrap-up.

**Phase 3 — Optimization loop.** Select a batch, dispatch experiments, persist each result as it lands (CP-3), evaluate, update state and the digest (CP-4), then check whether to stop. **Stop when any holds:** `stopping.target_reached` is true, `metric.primary.target` set, and the metric reaches it per `metric.primary.direction`; experiments >= `stopping.max_iterations`; elapsed >= `stopping.max_hours`; `metric.judge.max_total_cost_usd` set and judge spend has reached it; no improvement for `stopping.plateau_iterations` **consecutive** experiments; the user interrupts (save state, go to Phase 4); or the backlog is empty with none available. Otherwise start the next batch.

**Phase 4 — Wrap-up.** **Read `references/wrap-up.md`** for the deferred hypotheses, the summary, what is preserved, and cleanup, then present the options below. **Write CP-5 only once the choice does not return to Phase 3** — Continue and approving deferred dependencies both re-enter the loop, and a log marked final while the run continues is what this prevents.

1. **Run `ce-code-review`** on the cumulative diff (baseline to final), on the optimization branch. The reference's mechanical-apply bar decides which findings land; do not commit or push from this step.
2. **Run `ce-compound`** to document the winning strategy as an institutional learning.
3. **Create PR** from the optimization branch to the default branch.
4. **Continue** — re-enter Phase 3, state re-read first.
5. **Done** — leave the branch for manual review.
