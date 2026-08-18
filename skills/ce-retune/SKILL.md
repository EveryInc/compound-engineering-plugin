---
name: ce-retune
description: "Retune a skill corpus for a new model, measurement-first: mine the run archive for a baseline, establish a noise floor, audit the corpus adversarially, then cut in measured passes until a pre-registered bar clears. Requires a benchmark harness that can A/B two builds of the corpus; refuses without one."
disable-model-invocation: true
argument-hint: "[target model or symptom] [path to the corpus, defaults to ./skills] [bar:<n> consecutive clean runs]"
---

# Retune a Corpus for a New Model

A corpus that degrades on a new model is a measurement problem before it is a writing problem: rewriting what looks wrong produces a plausible fix list and no way to know whether any item mattered.

**Outcome:** a corpus whose measured behavior on the target model clears a bar registered before any change, with the regression classes removed and each removal attributable.

**Done:** the bar is cleared, or the run reports the specific claim it could not support. A green test suite is not done: it proves nothing broke, not that behavior improved.

**Non-goal:** word reduction. Leanness and performance are separate programs that share a corpus; only one of them is the result here. Report completion, not word count.

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

## Phase 0: the measurement gate — check this first

This skill cannot run without a way to observe behavior. Check for all three, and name whichever is missing:

1. **A run archive or a harness that produces one** — per-run logs carrying the tool-call trace, a terminal marker, token counts, and the final message.
2. **A build selector** — the harness can point a run at a specific source checkout of the corpus (a `--plugin-dir`-style override, a configurable skills path, an env var), so two builds are comparable under one runner.
3. **A repeatable task** the corpus actually executes end to end.

If any is missing, **stop and say so**, naming what to build. Do not fall back to a static audit and present it as retuning: an audit can say what looks cuttable and never whether cutting helped. An audit-only pass is a legitimate thing to want; it is a different request.

State the target model and the harness you found before continuing.

## The phases

They run in order, and each names the reference it cannot start without. Read `references/workflow-shapes.md` before dispatching any phase — the wrong orchestration shape is the common failure — and fan out by disjoint file ownership, never by item: items cross files, and agents that share a file lose each other's edits.

1. **Mine the archive** before spending a run — `references/baseline-mining.md`. Historical runs are a free baseline, usually larger than any experiment affordable now.
2. **Establish the noise floor** — `references/noise-floor.md`. Run the harness against **two identical copies** of the corpus, same commit on both sides; whatever difference appears is the floor every later claim must clear. **Register the bar now, in writing, before any change exists.** A bar chosen after seeing results is not a bar.
3. **Audit the corpus adversarially** — `references/corpus-audit.md`. One agent per skill proposes cuts; a second per skill does the opposite and defends the existing prose. **The two passes require independent contexts.** If the host exposes no way to run them as separate agents, report that as a blocker and stop the audit — do not argue both sides in one context and present the result as an audit.
4. **Cut in surgical passes**, one problem per agent — `references/cut-passes.md`, and `references/halt-taxonomy.md` when the symptom is stalling, halting, or a run that ends while naming work it did not do. Two rules bound every pass, whatever class it is cutting. **Never edit a test to make a suite green**: a removed string a test pins is a finding to report, not a test to weaken. And **sort every stop by who is actually on the other side before touching it** — a workflow whose product is stopping to ask a real user is not a defect, and `references/halt-taxonomy.md` carries the screens that decide, so read them before cutting any stop.
5. **Measure, then let the failure choose the next fix** — `references/cut-passes.md` again for what each failure site means and for auditing the phases the instrument never enters. Loop 4 and 5 until the registered bar clears. Then stop; a bar cleared is done — but report what stayed unmeasured, because a cleared bar never implies coverage it does not have.
6. **Ship** — `references/cut-passes.md` carries what the commits and the write-up must preserve.
