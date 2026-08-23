---
title: Detached job lifecycle for delegated work that must outlive a harness tool call
date: 2026-07-14
category: skill-design
module: "skills (cross-model peer review delegation: ce-doc-review, ce-code-review)"
problem_type: architecture_pattern
component: tooling
severity: high
applies_when:
  - "A skill's bundled script launches delegated work (e.g., a peer-model CLI) whose runtime can exceed a single harness tool-call budget (~2 minutes on some harnesses)"
  - "Designing a launch-and-await flow where one Bash/shell tool call would span the delegate's full runtime"
  - "A long-running delegate silently no-ops on some harnesses while working on others"
  - "Choosing between nohup, setsid double-fork, or new-process-group detachment for cross-harness survival"
  - "Wiring durable job state, sub-second polling, and an atomic terminal record for detached background work"
tags: [detached-jobs, process-lifecycle, cross-harness, tool-call-timeout, setsid-double-fork, background-work, polling, skill-authoring]
---

# Detached Job Lifecycle for Delegated Work That Must Outlive a Harness Tool Call

## Context

Several skills in this plugin delegate real work to external CLIs via bundled scripts — the cross-model peer reviews in ce-doc-review and ce-code-review are the current examples. Their original contract made one shell tool call launch the script and await its exit. The current references instead use `peer-job-runner.py` to start a detached job, perform local review work, and return through bounded `wait` calls. The workers still self-bound and ignore HUP, but those are inner protections rather than a substitute for detachment.

None of that helps when the harness enforces its own ceiling on tool-call duration. A ~2-minute class of limits exists on some hosts, and when it fires, the harness kills the supervising shell itself — the script's internal timeouts, traps, and cleanup logic never get a say. Because these passes are deliberately non-blocking (any failure means no output file, which reads as "the pass didn't run"), the result is a silent no-op: the orchestrator proceeds, the user sees a review with one reviewer quietly missing, and nothing flags that a limit was hit.

This recurs because the intuitive fixes all live inside the tool call, and the tool call is exactly the thing being killed. An earlier delegation feature (ce-work-beta, since retired) failed on the same class of problem from the other direction — heavy foreground polling that burned turns and context waiting on delegated work.

## Guidance

Never let one tool call span a delegate's runtime. Split the lifecycle so every individual tool call is short, and durability lives on disk:

1. **START.** One tool call mints a job id (timestamp + random hex), claims the job directory atomically (`mkdir` *without* `-p` — it fails on collision, so regenerate the id rather than sharing a dir), preflights that the worker is actually runnable and the status file is writable *before* detaching (a phantom id that can never reach a terminal state makes every waiter hang), detaches the worker into a **new session**, prints only the job id, and returns in under a second.

2. **DURABLE STATE.** The job directory is the source of truth, under the stable scratch root:

   ```
   /tmp/compound-engineering-<effective-uid>/<skill>/<run-id>/jobs/<job-id>/
     status      # terminal only: done | failed | timeout; absence means running
     pid         # detached worker's pid
     out.log     # raw delegate stream (also the liveness signal)
     meta.json   # job identity: run id, lens/provider or work unit,
                 # input digest (e.g. base SHA), started timestamp
     <result>    # path declared in meta.json; published ATOMICALLY only after
                 # the output passed validation
   ```

3. **SUPERVISE.** A watchdog runs *inside* the detached process, not in the orchestrator. The worker heartbeat makes outer `out.log` growth a worker-liveness signal; a separate peer log supplies route progress only where that CLI actually streams. Idle and hard limits reap the delegate as their own signals permit. Reaping kills the whole process tree — TERM, a grace period, then KILL; when a process-group kill is unavailable, walk the tree deepest-first so children die before their parents can respawn or orphan them.

4. **WAIT.** The orchestrator checks once after its other work, then uses bounded `wait` slices until the job is terminal or the aggregate deadline is spent. It does not interleave foreground polling turns or shell no-ops. The result is read only after the runner reports a usable terminal state.

5. **DEADLINE OWNERSHIP — one knob, strictly nested windows.** The detached worker owns the per-job idle and hard limits; the caller owns a separate aggregate deadline; the runner supervisor owns the outermost window. All of them derive from **one** env knob at dispatch (`CROSS_MODEL_HARD_SECS` for the cross-model peers) and nest strictly outward: worker hard cap < caller aggregate deadline < runner supervisor cap. When the aggregate deadline passes, the caller proceeds without the job, so an additive pass can never become an unbounded wait.

   Two corollaries, each of which has shipped as a bug:

   - **Never hardcode a derived window.** A literal in prose survives a knob change, and the tightest window then silently reaps a *healthy* peer — the worst outcome, because the peer's full spend is already paid and the loss is invisible in the output. The runner derives its own supervisor hard window from ambient `CROSS_MODEL_HARD_SECS` (`max(1230, knob + 30)`; explicit `CE_PEER_HARD_SECS` still wins for ce-work / elevation). The caller's aggregate deadline (`knob + 10`) is still printed at dispatch — never invent a shorter total wait.
   - **Do not bound the caller's *total* waiting below the deadline.** A single bounded `wait` slice sized to the idle window cannot reach an aggregate deadline several times its length; the caller must repeat slices until terminal or the deadline is spent. Widening the budget is worthless if the waiting side still stops early.

   Earlier revisions of this rule required the aggregate deadline to be **shorter than or equal to** the worker's hard cap. That inverted ordering is what let the caller reap a still-productive worker before its own backstop fired; the outward nesting above supersedes it. `tests/skills/cross-model-peer-budget.test.ts` and the runner unit fixture (`HardDefaultFromCrossModel`) are the mechanical guards — the class recurred under prose-only derivation (#1267 / #1271).

6. **SINGLE TERMINAL RECORD.** Exactly one authoritative terminal state, written atomically after the worker classifies the outcome. Never two files (e.g. a status word AND a separate exit-code file) that a crash can leave disagreeing.

7. **NO PROMPTS.** Nothing in the detached path may ask a question. The worker has no terminal and no user; every input is resolved before detach (headless/CI posture throughout).

The detach itself must create a new session, because plain `nohup` is not sufficient (see the spike below). macOS ships no `setsid(1)` utility, so use a POSIX::setsid double-fork:

```bash
perl -e 'use POSIX qw(setsid); exit if fork; setsid(); exit if fork; open(STDIN,"<","/dev/null"); open(STDOUT,">","/dev/null"); open(STDERR,">>","/dev/null"); exec "/bin/bash","-c",$ARGV[0];' "$CMD"
```

This double-forks, calls `setsid()` between the forks (new session, no controlling terminal, reparented to init), redirects all three standard streams away from the tool call's pipes, and execs the worker. The launching tool call can then return immediately.

## Why This Matters

- **The failure class is silent.** A non-blocking pass that dies with its supervising shell produces no output file, and "no output file" is indistinguishable from "the pass was legitimately skipped." Users lose a reviewer, a delegate's work, or a whole verification pass without any signal. Designing the failure to be non-blocking was correct; letting the happy path share a fate with the harness's tool-call ceiling was not.

- **Internal timeouts cannot defend against external ones.** Every self-bounding mechanism the scripts carry — idle detection, hard caps, HUP traps, cleanup traps — executes inside the process tree the harness kills. Raising `CROSS_MODEL_HARD_SECS`, tuning idle windows, or setting a bigger Bash tool timeout only helps on hosts that honor the requested timeout. On a host with a lower enforced ceiling, the only defense is to not be inside the tool call when the ceiling hits.

- **The spike proved intuition wrong.** The standard Unix reflex — `nohup cmd &` — actually fails to detach on 2 of the 3 harnesses we measured (see Examples). Harness shell tools reap the tool call's process group when the call completes, and `nohup` only blocks SIGHUP; it does not leave the process group. Without the measurement, a detach that works perfectly in local terminal testing (and on Claude Code) would ship broken on other hosts, and — because the failure is a silent no-op — nobody would notice.

- **Portability is the point.** This plugin is authored once and runs on multiple harnesses with different tool-call semantics, timeout ceilings, and process-cleanup behavior. A lifecycle whose only cross-harness contract is "short tool calls + durable files on disk" survives all of them; anything that depends on one harness's backgrounding or timeout behavior does not.

Known anti-patterns, each observed or measured:

| Anti-pattern | Why it fails |
| --- | --- |
| Raise internal timeout caps | The harness kills the supervising shell, not the script; internal limits never fire |
| Tell the orchestrator to background one long call | Harness-dependent; if the call is killed anyway there is no durable state to re-enter |
| Foreground sleep/poll loops in the orchestrator | Burns turns and context; the retired ce-work-beta delegation failure mode |
| Two state files (status word + exit code) | A crash between the writes leaves them disagreeing; waiters cannot classify |
| Interactive prompts in the detached path | No terminal, no user; the job hangs until reaped and reads as a timeout |

## When to Apply

- Any skill that delegates work to an external CLI (peer model CLIs, builders, analyzers) whose wall-clock runtime is not tightly bounded.
- Any bundled script whose runtime can plausibly exceed the host's tool-call ceiling — assume a ~2-minute class of enforced limits exists on some hosts, regardless of the timeout the orchestrator requests.
- Future cross-model execution engines or delegation features: design the job lifecycle first, then the delegate invocation, not the other way around.
- Not needed for scripts that reliably finish in seconds (metadata extraction, validation, formatting); the single-call contract is simpler and fine there.

## Examples

**The spike (2026-07-14, Darwin 25.5.0 arm64).** One tool call launches a detached writer that appends an epoch line every 5 seconds for 120 seconds (24 lines total). Later, separate tool calls count lines in the output file. PASS means the count kept growing after the launching call returned — i.e. the worker outlived the tool call.

| Detach variant | Claude Code | codex-cli 0.144.4 (danger-full-access, approvals never) | cursor-agent 3.11.19 |
| --- | --- | --- | --- |
| plain `nohup cmd &` | PASS (all 24 lines) | FAIL (1 line; child died when the call ended) | FAIL (2 lines; process gone at first check) |
| new process group: `bash -c 'set -m; nohup bash -c LOOP >/dev/null 2>&1 & disown'` | PASS | PASS (16 then 22 lines) | PASS (17 then 24 lines) |
| new session: perl `POSIX::setsid` double-fork (no nohup) | PASS | PASS | PASS |

Interpretation: those harness shell tools reap the tool call's process group on completion. Escaping requires a new session (strongest — also drops the controlling terminal and reparents to init) or at least a new process group. Plain `nohup` blocks SIGHUP but stays in the doomed group, so it fails everywhere except Claude Code.

Caveats stated plainly: codex was tested with its sandbox disabled (`danger-full-access`); default-sandboxed codex may behave differently and needs its own verification. cursor-agent was tested under its default shell tool.

**The launch snippet** (new-session detach, works on all three tested hosts; macOS has no `setsid(1)`, hence perl):

```bash
CMD='bash /path/to/worker.sh --job-dir /tmp/compound-engineering-<effective-uid>/<skill>/<run-id>/jobs/<job-id>'
perl -e 'use POSIX qw(setsid); exit if fork; setsid(); exit if fork; open(STDIN,"<","/dev/null"); open(STDOUT,">","/dev/null"); open(STDERR,">>","/dev/null"); exec "/bin/bash","-c",$ARGV[0];' "$CMD"
```

## Related

- `docs/solutions/skill-design/anti-poll-scope-and-async-subagent-dispatch.md` — scopes this doc's anti-poll rule. The POLL step's "no foreground sleep loops" and the anti-pattern row target *detached* bash/CLI delegate polling (this doc's subject), **not** harness-managed subagent dispatch (Claude Code `Agent`, Codex `spawn_agent`), which returns on its own tool call with no poll loop. Read it before applying the POLL rule to a skill that fans out subagents, so the ban isn't misread as forbidding concurrent subagent dispatch.
- `docs/solutions/skill-design/requested-vs-verified-model-identity.md` — sibling pattern: the `meta.json` job identity and atomically published result are the natural home for its `model_requested` / `model_actual` receipt fields.
- `docs/solutions/skill-design/cross-harness-cross-model-tool-invocation.md` — documented the empirical precursor on a single host (Codex reaping nohup'd children when the tool call ends); this doc widens that finding to 2 of 3 tested hosts and supplies the survival mechanism.
- `docs/solutions/skill-design/watch-loops-need-a-blocked-external-terminal-state.md` — sibling pattern for supervising long-running external work: terminal-state taxonomy and bounded waits.
- `docs/solutions/skill-design/portable-agent-skill-authoring.md` — the canonical cross-harness authoring guide; this pattern is its "verify per-harness behavior empirically" principle applied to shell-tool process lifecycle.
- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — refines this doc's deadline-ownership rule: when the dispatch *script itself* crashes before any job exists (vs a per-job route failure), the caller first attempts bounded same-route hand-recovery rather than proceeding-without on the first error.
- Issue #1115 (Grok host support for the ce-code-review cross-model pass) is complete; issue #878 (verified cross-model delegation) remains open work that this lifecycle underpins.
