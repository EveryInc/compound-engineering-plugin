# Optimize Controller Protocol

Load this reference before CP-0, resume, or any experiment/judge dispatch. The
co-located controller is the only authority for routing, attempt lifecycle,
Codex confinement, identity finalization, native compatibility completion, measurement markers, and worktree
reuse. A worker response, conversation claim, PID supplied by a caller,
`result.yaml`, or experiment-log row cannot replace controller state.

## Frozen Run

Create one private constraints JSON object from the approved spec. It contains
exactly `backend`, `codex_security`, `measurement`, `scope`, `execution`,
`judge`, `stopping`, `shared_files`, `sanctioned_env`, and `experiment_log`. Copy complete values;
do not let a candidate or worker construct this file. `sanctioned_env` is an
explicit name-to-value map and cannot include home/path/XDG overrides, token or
secret names, SSH/cloud variables, dynamic-loader names, shell startup hooks, or
language runtime/loader hooks. The normalized `measurement` includes the exact
stability mode, repeat count, aggregation, noise threshold, `mutable_outputs`,
and controller-derived `metric_names`. Derive metric names from every gate and
diagnostic plus the hard primary metric when applicable. Mutable outputs default
to empty and may name only absent disposable directories with existing canonical
parents and no overlap with candidate, immutable, or shared-input scope. `experiment_log`
is the canonical repository-relative CP-3 path. The `judge` object
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

The sealed `state.json` manifest is the commit point. Journal records are
hash-chained to the manifest's committed head and written completely before
manifest publication. While holding the run lock, start/status/resume accepts
only a structurally valid, contiguous, digest-valid suffix beyond the committed
sequence and truncates it as uncommitted projection. A missing committed event,
gap, rewrite, malformed record, digest mismatch, or journal behind the manifest
blocks. First creation publishes a sealed sequence-zero manifest before its
first event, so interruption leaves recoverable authoritative state.
One-time legacy journal migration is also restart-safe: a locked load accepts
either an exact all-legacy projection or a fully converted valid chain whose
length equals the committed manifest sequence. Mixed formats, invalid chains or
digests, wrong lengths, and journal-behind state block.

## Attempt Transaction

Create a new worktree only after CP-0. Then lock each author or judge instance
before dispatch. Use a unique attempt ID and stable instance ID; fallback
candidates for one instance use fresh attempt IDs. The candidate ordinal starts
at 0 and is never the experiment number; experiment instance identity remains
stable while fallback ordinals advance through 0, 1, ... independently.

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
python3 -I -S "$SKILL_DIR/scripts/optimize-controller.py" lock-attempt --run-id "<run-id>" --attempt-id "<attempt-id>" --role author --instance-id "experiment-<experiment-number>" --ordinal <candidate-ordinal> --adapter codex --worktree "<canonical-worktree>" --executable "<absolute-codex>" --auth-manifest "<private-auth-manifest.json>"
```

For a CE-default native judge or worktree author, use `--adapter host` and omit
Codex arguments. Configured native host candidates are unavailable because no
controller-owned launcher currently supplies Optimize's required confinement,
environment, barrier, PID/subreaper, and descendant evidence. A judge attempt
never receives `--worktree`. The controller rejects an adapter that differs
from the frozen author backend or judge adapter. The
lock binds role, instance, recipient, candidate, backend, worktree, spec and
constraints digests, measurement command/digest, mutable/immutable scopes,
execution policy, stopping criteria, stability policy, full pre-dispatch
filesystem inventory digest, executable identity, auth material, and the exact
resolver attempt lock. One role + instance + candidate ordinal can be locked
only once, with exactly monotonic prior history.

The Codex auth manifest is private JSON with exactly this shape:

```json
{"route":"codex","files":[{"source":"/absolute/private/auth.json","destination":"auth.json"}]}
```

Authorize at most four effective-user-owned `0600` JSON files outside the
repository. Never authorize a directory, `.env*`, SSH/cloud store, unrelated
backend store, or ambient token. The controller stages only those files below
the private attempt root. Missing Landlock/seccomp, unsafe auth, tracked `.env*`,
an ineligible candidate, or an executable with untrusted owner/mode/ancestors or
inside the project/worktree returns `UNAVAILABLE`
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

The controller records launch authority before releasing a one-use barrier.
The confined adapter is a Linux child subreaper, validates the seccomp audit
architecture, denies native/compat socket creation plus `io_uring_setup`, and
kills/reaps all descendants, including double-forked or `setsid` children,
before terminal evidence. A controller crash leaves recoverable process state;
it never turns unknown execution into abandonment or worktree-reuse authority.
Each routed author has a controller-owned one-hour ceiling, independent of the
measurement command's configured timeout. Stdout and stderr are each capped at
2 MiB while streaming. Timeout or overflow triggers TERM/KILL descendant
containment before bounded failure evidence is published; measurement continues
to use its separately frozen `measurement.timeout_seconds` value.

OpenCode's ordinary `ce_task` adapter can attest the selected model/variant and
native Task permissions, but it cannot attest inherited Landlock, a sanitized
process environment, a controller launch barrier, PID/subreaper state, or
all-descendant cleanup. Therefore it cannot produce a strict Optimize receipt.
The public caller-minted `authorize-host`/`record-host` commands do not exist.

Only a top-level no-routing/CE-default binding retains the characterized native
Task path. After that Task returns, call `complete-native --run-id <run-id>
--attempt-id <attempt-id> --outcome ok|failed`. The controller records a
`native-compatibility-unverified` marker with no model, effort, confinement,
environment, barrier, PID, subreaper, or descendant-cleanup claim. It rejects
this command for every profile candidate. Then call `finalize`; CE-default may
accept compatibility output, but no receipt may describe strict identity or
process evidence.

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

Run the Phase 1 baseline only through `measure.sh <run-id>` (or the equivalent
controller `baseline --run-id <run-id>` operation) after CP-0. It uses the same
Landlock, network, timeout, repeat, and descendant supervisor as experiment
measurement against the read-only canonical repository. No provider config
pointer, staged auth root, sanctioned route environment, or raw child output is
persisted. Only exact declared metric keys with finite numeric/boolean scalar
values can enter the baseline receipt.

After an accepted author result, run the frozen measurement only through
`measure --run-id <run-id> --attempt-id <attempt-id>`. The controller owns the
launch barrier and descendant supervisor, uses a distinct credential-free
environment, keeps the full candidate/worktree/input scope read-only, grants
writes only to private scratch and declared disposable output roots, executes
the exact frozen repeats, deterministically aggregates exact declared scalar
metrics, and writes one bound `result-marker.json` plus `result.yaml`.
Append and verify CP-3 before calling `checkpoint --run-id <run-id>
--attempt-id <attempt-id> --checkpoint-path <approved-experiment-log>`.
The controller opens that exact path without following the final component,
parses one corresponding row, and verifies run, attempt, snapshot, spec, lock,
receipt, constraints, measurement, marker, and metrics digests.
It retains the whole-file digest as checkpoint-time history. Later validation
reopens the log and verifies only that row's immutable controller-bound fields,
so appended experiments and mutable outcome updates do not invalidate it.
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

All destructive reset, clean, worktree removal, branch reset/deletion, and
prune operations run inside controller `worktree-mutate` while the per-worktree
lock is held. Shell helpers never check a lease and mutate after releasing it;
new attempt locks contend on the same lock.

Every controller mutation appends and fsyncs a redacted event before publishing
the sealed manifest and returning it. Import only manifest-committed events into
the experiment log in sequence before displaying them. A journal-only suffix is
an uncommitted projection and is truncated on locked recovery, not imported.
