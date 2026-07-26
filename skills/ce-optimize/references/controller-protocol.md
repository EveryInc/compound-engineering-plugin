# Optimize Controller Protocol

Load this reference before CP-0, resume, or any experiment/judge dispatch. The
co-located controller is the only authority for routing, attempt lifecycle,
Codex confinement, identity finalization, measurement markers, and worktree
reuse. A worker response, conversation claim, PID supplied by a caller,
`result.yaml`, or experiment-log row cannot replace controller state.

## Frozen Run

Create one private constraints JSON object from the approved spec. It contains
exactly `backend`, `codex_security`, `measurement`, `scope`, `execution`,
`judge`, `stopping`, `shared_files`, and `sanctioned_env`. Copy complete values;
do not let a candidate or worker construct this file. `sanctioned_env` is an
explicit name-to-value map and cannot include home/path/XDG overrides, token or
secret names, SSH variables, or cloud credential variables. The `judge` object
records the owning adapter (`host` or `codex`) in addition to the unchanged
rubric/sampling contract; this records runtime mechanics and does not activate
judging or alter the approved spec.

When a Codex spec leaves `codex_security` null, complete the existing
once-per-session user choice before `start` and freeze that choice in the
effective constraints object. Record the derivation in the experiment log. A
route, candidate, worker, or later resume cannot answer or change it.

Materialize current-task routing intent only in a host-owned private `0600`
file with an `intents` array. Never accept a routing profile, policy, candidate,
snapshot, binding, lock, or prior history from a worker or resume caller.

From this skill's directory, start a run once:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
python3 -I -S "$SKILL_DIR/scripts/optimize-controller.py" start --run-id "<run-id>" --repo "<canonical-repo>" --spec "<approved-spec>" --constraints "<private-constraints.json>" --host-harness "<host>" --serving-family "<family>" --intents "<private-intents.json>"
```

Omit `--intents`, `--host-harness`, or `--serving-family` only when the host has
no value for that field. `start` performs one resolver `resolve_batch` for the
author and, only when judge mode is already active, the judge. It persists the
complete self-validating snapshot, source revisions, role/instance metadata,
binding digests, every resolver attempt lock, approved spec digest, measurement
digest, scope, backend, concurrency, stopping criteria, and constraints digest
under `/tmp/compound-engineering-<effective-uid>/ce-optimize/<run-id>/` with
effective-user ownership and private modes.

For resume, call the same `start` command. A matching start returns `RESUMED`
without invoking `resolve_batch`; changed live configuration is irrelevant.
Spec, constraints, host, or intent drift blocks. Use `status --run-id <run-id>`
only after that resume gate; it validates the manifest digest plus the complete
frozen resolver snapshot/binding/lock projections before returning state.

## Attempt Transaction

Create a new worktree only after CP-0. Then lock each author or judge instance
before dispatch. Use a unique attempt ID and stable instance ID; fallback
candidates for one instance use ordinal 0, 1, ... and fresh attempt IDs.

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
python3 -I -S "$SKILL_DIR/scripts/optimize-controller.py" lock-attempt --run-id "<run-id>" --attempt-id "<attempt-id>" --role author --instance-id "experiment-<n>" --ordinal <n> --adapter codex --worktree "<canonical-worktree>" --executable "<absolute-codex>" --auth-manifest "<private-auth-manifest.json>"
```

For a native host judge or worktree author, use `--adapter host` and omit Codex
arguments. A judge attempt never receives `--worktree`. The controller rejects
an adapter that differs from the frozen author backend or judge adapter. The
lock binds role, instance, recipient, candidate, backend, worktree, spec and
constraints digests, measurement command/digest, mutable/immutable scopes,
execution policy, stopping criteria, executable identity, auth material, and
the exact resolver attempt lock.

The Codex auth manifest is private JSON with exactly this shape:

```json
{"route":"codex","files":[{"source":"/absolute/private/auth.json","destination":"auth.json"}]}
```

Authorize at most four effective-user-owned `0600` JSON files outside the
repository. Never authorize a directory, `.env*`, SSH/cloud store, unrelated
backend store, or ambient token. The controller stages only those files below
the private attempt root. Missing Landlock, unsafe auth, tracked `.env*`, an
ineligible candidate, or an unavailable executable returns `UNAVAILABLE`
before egress.

For Codex, write the prompt to a private `0600` file and dispatch only through
the controller:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
python3 -I -S "$SKILL_DIR/scripts/optimize-controller.py" dispatch --run-id "<run-id>" --attempt-id "<attempt-id>" --prompt "<private-prompt>"
```

The controller revalidates the executable, interpreter, confinement adapter,
auth digests, and attempt lock. It invokes the exact Codex executable through
its co-located Landlock adapter with an empty environment, isolated HOME/XDG/
temporary/Codex roots, fixed system PATH, and only approved non-credential
environment values. Authors can write only their experiment worktree and
attempt environment. Judges can write only their attempt environment and
cannot read an experiment worktree, hidden references, real home, canonical
checkout, `.env*`, SSH/cloud stores, or controller results. Wrapper,
interpreter, policy, or receipt substitution blocks.

For a native host dispatch, the owning host writes a private receipt with this
exact shape and records it before finalization:

```json
{"protocol":"ce-optimize-host-receipt/v1","attempt_id":"<attempt-id>","lock_digest":"<controller-lock-digest>","outcome":"ok","process":{"terminal":true,"exit_code":0},"serving_report":{"model_actual":"<host-receipted-model>","effort_actual":"<host-receipted-effort>"}}
```

Omit absent serving fields; never copy a worker claim into `serving_report`.
Record it with `record-host --run-id <run-id> --attempt-id <attempt-id>
--receipt <private-receipt>`. If the host cannot issue this receipt while
preserving the environment and workspace boundary, preflight is unavailable.

## Finalization And Integration

Call `finalize --run-id <run-id> --attempt-id <attempt-id>` with no binding,
outcome, terminal/integrated flags, serving report, or prior history. The
controller derives all of them from its process, adapter receipt, result marker,
checkpoint, and cumulative earlier receipts. It invokes `finalize_attempt` with
the complete frozen snapshot and exact resolver lock. Output remains
quarantined unless the result is `ACCEPT`; required unverified/mismatched output
therefore cannot be inspected, parsed, measured, checkpointed, committed, or
merged.

`NEXT_CANDIDATE` is possible only after terminal unintegrated failure. The
controller marks that output discarded and terminally abandoned. Recreate the
worktree through `experiment-worktree.sh`; its reset gate consults all private
attempt leases. Then independently sanction and lock the exact next ordinal.
Do not reuse prompt, auth root, environment, worktree dirt, or receipt.

After an accepted author result, run the frozen measurement only through
`measure --run-id <run-id> --attempt-id <attempt-id>`. The controller owns the
process receipt and writes the bound `result-marker.json` plus `result.yaml`.
Append and verify CP-3 before calling `checkpoint --run-id <run-id>
--attempt-id <attempt-id> --checkpoint-digest <sha256-of-recorded-checkpoint>`.
For an accepted judge, parse/aggregate only after acceptance, append and verify
the score checkpoint, then call the same `checkpoint` command. This marks the
instance completed and integrated.

For a terminal result that will not be integrated, call `abandon --run-id
<run-id> --attempt-id <attempt-id> --reason <reason>`. It refuses live,
measured, or integrated attempts. No `--result-recorded` or caller assertion
overrides the lease. Worktree reset/cleanup is permitted only when every bound
attempt is controller-verified `completed` or `abandoned`; live, dispatching,
unknown, crashed-before-receipt, blocked-but-preserved, or missing state denies
reset.

Every controller mutation appends and fsyncs a redacted event before returning
it. Import those events into the experiment log in sequence before displaying
them, preserving the skill's append-before-display rule.
