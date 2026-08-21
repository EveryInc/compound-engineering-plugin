# Persistence: the rules, the checkpoints, and resume

Read this before Phase 0 and follow it for the whole run. The body states the invariant and names the six checkpoints; this file carries the rules that implement them, the checkpoint table, the file layout, and the resume procedure.

### Core Rules

1. **Write each experiment result to disk IMMEDIATELY after measurement** — not after the batch, not after evaluation, IMMEDIATELY. Append the experiment entry to the experiment log file the moment its metrics are known, before evaluating the next experiment. This is the #1 crash-safety rule.

2. **VERIFY every critical write** — after writing the experiment log, read the file back and confirm the entry is present. This catches silent write failures. Do not proceed to the next experiment until verification passes.

3. **Re-read from disk at every phase boundary and before every decision** — never trust in-memory state across phase transitions, batch boundaries, or after any operation that might have taken significant time. Re-read the experiment log and strategy digest from disk.

4. **One experiment, one log entry.** Append a new experiment entry on its first measurement. Later ladder samples for that same experiment update that entry's metrics and outcome in place so a crash can resume the ladder without losing samples or duplicating the hypothesis. Never rewrite a different experiment's samples or gate values. Outcome, `best`, and `hypothesis_backlog` are also updated in place at batch evaluation (CP-4). Do not rebuild the file from memory.

5. **Per-experiment result markers for crash recovery** — each experiment writes a `result.yaml` marker in its worktree immediately after measurement. On resume, scan for these markers to recover experiments that were measured but not yet logged.

6. **Strategy digest is written after every batch, before generating new hypotheses** — the agent reads the digest (not its memory) when deciding what to try next.

7. **Never present results to the user without writing them to disk first** — the pattern is: measure -> write to disk -> verify -> THEN show the user. Not the reverse.

### Mandatory Disk Checkpoints

These are non-negotiable write-then-verify steps. At each checkpoint, the agent MUST write the specified file and then read it back to confirm the write succeeded.

| Checkpoint | File Written | Phase |
|---|---|---|
| CP-0: Spec saved | `spec.yaml` | Phase 0, after user approval |
| CP-1: Baseline recorded | `experiment-log.yaml` (initial with baseline) | Phase 1, after baseline measurement |
| CP-2: Hypothesis backlog saved | `experiment-log.yaml` (hypothesis_backlog section) | Phase 2, after hypothesis generation |
| CP-3: Each experiment result | `experiment-log.yaml` (append on first measurement; update that entry on later samples) | Phase 3.3, immediately after each measurement |
| CP-4: Batch summary | `experiment-log.yaml` (outcomes + best) + `strategy-digest.md` | Phase 3.5, after batch evaluation |
| CP-5: Final summary | `experiment-log.yaml` (final state) | Phase 4, at wrap-up |

**Format of a verification step:**
1. Write the file using the native file-write tool
2. Read the file back using the native file-read tool
3. Confirm the expected content is present
4. If verification fails, retry the write. If it fails twice, alert the user.

### File Locations (all under `.context/compound-engineering/ce-optimize/<spec-name>/`)

The scratch space under `.context/` is gitignored: it survives a local resume but does not travel with the branch, so anything needed durably must be exported to a tracked path.

| File | Purpose | Written When |
|------|---------|-------------|
| `spec.yaml` | Optimization spec (fixed once the Phase 1 approval gate is cleared) | Phase 0 (CP-0) |
| `experiment-log.yaml` | Full history of all experiments | Initialized at CP-1, appended at first CP-3, updated on later samples and at CP-4 |
| `strategy-digest.md` | Compressed learnings for hypothesis generation | Written at CP-4 after each batch |
| `<worktree>/result.yaml` | Per-experiment crash-recovery marker | Immediately after measurement, before CP-3 |

### On Resume

When Phase 0.4 detects an existing run:
1. Read the experiment log from disk — this is the ground truth
2. Scan worktree directories for `result.yaml` markers not yet in the log
3. Recover any measured-but-unlogged experiments
4. Continue as the body's resume rule directs: skip the work the log proves finished, and re-enter any gate the log does not prove was cleared

---
