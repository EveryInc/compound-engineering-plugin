---
name: ce-optimize
description: "Run metric-driven optimization loops. Use when improving measurable outcomes such as search relevance, clustering quality, build performance, prompt quality, or scored behavior through experiments."
argument-hint: "[path to optimization spec YAML, or describe the optimization goal]"
---

# Iterative Optimization Loop

`references/usage-guide.md` covers hard metrics versus a judge, and first-run defaults.

**Done when:** a stopping criterion fired, the final state is written and verified on disk, and the user has been given the post-completion options. If the run instead stopped at a gate it could not clear, say what blocked it.

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

Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (needs the `pi-ask-user` extension). Fall back to numbered options on the host's chat surface only when no blocking tool exists, or when the call errors. A pending schema load is not a reason to fall back. Never skip the question silently.

## Artifact Root

Resolve `<root>` the first time you compose a path under it. Reading learnings under `<root>/solutions/` counts as composing one. Give any subagent the resolved path, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## Persistence Discipline

**The experiment log on disk is the single source of truth.** The conversation is not durable storage. A result that exists only in the conversation is lost. So the write order never inverts: **measure -> write -> verify -> then show the user.** Showing the user a table that disk has not seen yet is a bug. During Phase 3 the log is append-only, and every phase boundary and every decision re-reads it from disk.

**Read `references/persistence.md` now** for the six mandatory checkpoints, CP-0 through CP-5 — each a write followed by a read-back — plus the rules behind them, the file layout, and resume. The phases below mark where each checkpoint falls.

## The phases

Four phases run in order. Each one names the reference it cannot start without. A fresh run skips none of them: a harder optimization spends longer in a phase, it does not run fewer phases.

**A resume is not a fresh run.** On a resume, re-enter Phase 0 only far enough to detect the run and to recover any `result.yaml` markers the log is missing. Then continue from the phase the log records: skip the work the log proves finished, and re-enter any gate it does not. A checkpoint proves the work that produced it, never a user decision — the log holds no record of approval, so a resume that has not seen the user approve presents the Phase 1 gate again.

**Phase 0 — Setup.** The input is a goal, or a path to a spec YAML. It comes from the user or from a calling skill. If neither supplied one, ask: "What would you like to optimize? Describe the goal, or provide a path to an optimization spec YAML file." Load or build the spec and save it (CP-0) — **read `references/spec.md`**. Then search prior learnings, detect run identity, and create the branch and scratch space. **Read `references/measurement.md`** for the rest of Phase 0 and Phase 1.

**Phase 1 — Measurement scaffolding.** Build or validate the harness, write the baseline (CP-1), probe parallelism, check the worktree budget. Two gates stop the run:

- **Clean-tree gate.** Do not continue while any file in `scope.mutable` or `scope.immutable` has uncommitted changes. The reference owns the check and what to ask for.
- **User approval gate.** Present what Phase 1 assembled; the reference lists what to include. If the primary type is `judge` and `max_total_cost_usd` is unset, say plainly that spend is uncapped. Offer proceed and fix issues, plus adjust spec while no experiment has been kept — once one has, the spec is fixed for this run. **Do not enter Phase 2 until the user explicitly approves.** Then re-read the spec and baseline from disk.

**Phase 2 — Hypothesis generation.** Analyze the current approach, rank the hypotheses, record the backlog (CP-2). **Read `references/loop.md`** for this phase and Phase 3. One gate: **dependency pre-approval.** Collect every new dependency across all hypotheses and present the full list for bulk approval. A dependency the user does not approve stays in the backlog, is skipped in batch selection, and comes back at wrap-up.

**Phase 3 — Optimization loop.** Select a batch, dispatch experiments, persist each result as it lands (CP-3), evaluate, update state and the digest (CP-4), then check whether to stop. Stop as soon as any one of seven criteria holds: target reached, max iterations, max hours, judge budget exhausted, plateau, a user interrupt, or no runnable hypothesis left. `references/loop.md` states each one exactly. Otherwise start the next batch.

**Phase 4 — Wrap-up.** **Read `references/wrap-up.md`** for the deferred hypotheses, the summary, what is preserved, and cleanup. Then present the options below. CP-5 marks the log final. **Write it only after the user picks an option that does not return to Phase 3.** Two options do return: Continue, and approving a deferred dependency.

1. **Run `ce-code-review`** on the cumulative diff (baseline to final), on the optimization branch. Do not commit or push from this step.
2. **Run `ce-compound`** to document the winning strategy as an institutional learning.
3. **Create PR** from the optimization branch to the default branch.
4. **Continue** — re-enter Phase 3, state re-read first.
5. **Done** — leave the branch for manual review.
