# Shared scratch ownership blocks sibling agents

**Status:** CURRENT

**Date:** 2026-07-15

**Affected boundaries:** Compound Engineering cross-invocation scratch,
CE Compound run artifacts, PR babysitter state, code/document-review peer jobs,
shared repo-profile cache, and actions.json MCP payload spilling

**Tracking card:** [Investigation: Compound Engineering shared temp ownership collision](https://trello.com/c/ACvNwhRs)

## Symptom

CE Compound failed before research could start:

```text
mkdir: cannot create directory
'/tmp/compound-engineering/ce-compound/<run-id>': Permission denied
```

The same host had previously emitted `payload_spill_error: Permission denied`
when an actions.json bridge tried to write a large MCP result under
`/tmp/actions-json-mcp/payloads`.

## Preserved environment evidence

```text
/tmp/compound-engineering             agent-zara:agent-zara 0775
/tmp/compound-engineering/ce-compound agent-zara:agent-zara 0775
current user                           agent-tomas
```

`agent-tomas` is not a member of `agent-zara`'s primary group. The root and
skill directory therefore allow reads and traversal but not sibling writes.
Passwordless `sudo` is unavailable, so changing the inherited owner is neither
a product fix nor a valid installation assumption.

## Root cause and blame assignment

Both systems used a fixed directory directly under a host-global `/tmp`
namespace:

- CE Compound used `/tmp/compound-engineering/ce-compound/<run-id>` and the
  shared repo-profile helper used `/tmp/compound-engineering/repo-profile`.
- actions.json used `<temp_dir>/actions-json-mcp/payloads`.

`mkdir -p` protects against a missing directory, not an existing directory
owned by another Unix identity. The first sibling agent to create a `0775`
intermediate directory became the accidental owner of every later agent's
scratch boundary.

- **Trigger blame:** a second UID ran a skill after another account had already
  created the fixed parent. This exposed the defect; it did not cause it.
- **Technical blame:** independently authored skills and helpers hand-built a
  predictable host-global path. There was no common resolver validating owner,
  mode, type, symlinks, or lifecycle namespace.
- **Systemic blame:** source, packaged, and installed skill copies could drift.
  The source fix was present and tested while a stale installed
  `ce-code-review/SKILL.md` still hardcoded the shared root. A later upstream
  change also reintroduced an unsafe path in `ce-pov`; the expanded source scan
  caught it. Release/install propagation, not only path construction, is part
  of the root cause.

## Remediation plan

1. Preserve `COMPOUND_ENGINEERING_SCRATCH_ROOT` and route every consumer
   through one byte-identical executable resolver. Resolve validated override
   -> validated XDG runtime dir -> HOME cache -> UID-scoped `/tmp`; never the
   fixed shared root.
2. Separate lifecycle roots and namespaces: atomic `mkdtemp` runtime
   directories, semantic keys under a persistent cache root, locked workflow
   state under a persistent state root, and durable non-repo deliverables
   under a data root.
3. Update CE Compound and sibling run-producing skills, stable PR babysitter
   state, detached peer jobs, plus every byte-identical repo-profile cache
   copy/reference, to the same resolver contract.
4. Add structural and behavioral regression coverage for override validation,
   symlink/mode rejection, candidate order, same-UID concurrency, permissions,
   and hostile legacy paths.
5. Give actions.json payload spilling a bridge-process-scoped directory under
   the OS temp directory so two users and two bridges cannot share ownership.
6. Make release validation compare source, generated packages, and managed
   installed mirrors so an update cannot leave an older hardcoded skill active.
7. Run focused tests, full relevant suites, release validation, and a live
   sibling-agent CE Compound execution.
8. Release or sync the fixed skill/runtime before closing the investigation.

## Closure criteria

- A CE Compound run creates its artifacts without writing under the hostile
  legacy root.
- The repo-profile cache writes and reads under
  `<resolved-cache-root>/repo-profile-v1/`.
- All duplicated cache helpers and references remain byte-identical.
- Two independent bridge configurations resolve distinct default payload
  directories and payload spilling succeeds.
- Relevant Compound Engineering and actions.json test/release gates pass.
- Installed skill/runtime copies are updated and live verification succeeds.
- CE Compound records the durable ownership lesson before this card enters
  Done.

## Verification evidence

The first-stage source isolation was implemented on `fix/owner-safe-scratch-roots-upstream` in
[EveryInc/compound-engineering-plugin#1142](https://github.com/EveryInc/compound-engineering-plugin/pull/1142):

- All run-producing skill instructions now resolve
  `COMPOUND_ENGINEERING_SCRATCH_ROOT` or default to
  `/tmp/compound-engineering-$(id -u)`.
- Every repo-profile helper defaults to the same UID-scoped root, while
  retaining explicit scratch-root and cache-root overrides.
- `tests/scratch-root-contract.test.ts` rejects the legacy shared root across
  Markdown, Python, and shell skill assets. After rebasing onto current
  upstream `main`, this gate found and drove remediation of the newer
  `ce-babysit-pr`, `ce-doc-review`, and detached peer-runner paths.
- Repo-profile tests prove two simulated owners use isolated roots and eight
  concurrent writers still leave a readable atomic cache entry.
- Focused owner/cache/peer/babysit suite: 69 passed, 0 failed with Bun 1.2.20.
- Full Compound suite: 2,085 passed, 0 failed. `release:validate` reports
  synchronized metadata for 30 skills, and `git diff --check` passes.
- The exact branch was installed through the supported Codex local-checkout
  installer as the sole managed Compound bundle. The installed repo-profile
  helper completed `MISS -> put -> HIT` at
  `/tmp/compound-engineering-1005/repo-profile/...`, while an installed
  CE Compound setup created `/tmp/compound-engineering-1005/ce-compound/...`
  owned by `agent-tomas` without touching the still-`agent-zara`-owned legacy
  tree. A fresh subagent independently loaded that installed skill and created
  `/tmp/compound-engineering-1005/ce-compound/20260715-032657-45c0d7f5`.
- The actions.json bridge branch `fix/process-scoped-payload-spills` in
  [ActionsJson/actions.json.dev#261](https://github.com/ActionsJson/actions.json.dev/pull/261) assigns a
  distinct `<temp>/actions-json-mcp-<pid>-<uuid>/payloads` directory to every
  bridge instance. Its focused Rust tests prove defaults are distinct and a
  hostile legacy `<temp>/actions-json-mcp` path cannot block spilling.
- The actions.json suite passes 93 unit tests and 44 characterization tests;
  its working-tree diff passes `git diff --check`.
- The branch bridge was built and staged at
  `~/.local/share/actions-json-mcp/0.1.224-owner-safe-spills`. The Codex
  launcher verifier returned `ok: true` after both the binary and
  `--actions` paths were repointed to that stage.
- An isolated live MCP process from the staged binary, launched with a
  100-byte inline limit, spilled `bridge.payloads.configure` to
  `/tmp/actions-json-mcp-234525-7c280887-8d11-446a-959f-1c9189df52f2/payloads/...`.
  The spill file was non-empty and owned by `agent-tomas`, proving the actual
  staged process uses its process-scoped default rather than the legacy shared
  directory.

Remaining before closure: merge/release the upstream Compound and actions.json
changes, restart Codex so its configured staged actions.json bridge replaces
the still-running legacy process, verify payload spilling through the installed
MCP session, then run the CE Compound closure gate and record the durable
ownership lesson.

### 2026-07-16 continuation

PR #1142 remained open and conflicting after upstream advanced. The work was
rebased into `fix/owner-scoped-scratch-contract`. The stronger implementation:

- adds byte-identical `scripts/scratch-root.py` copies to every scratch
  consumer and executes it from run-producing skills;
- validates every explicit/XDG/HOME/tmp path component and creates private
  atomic runs;
- separates runtime, cache, state, and durable-data resolvers; places
  repo-profile entries under the cache root while PR babysitter state uses the
  persistent state root;
- colocates detached peer jobs under the exact owning run and validates both
  process birth identity and an unguessable job token before treating a PID as
  a lease or signal target;
- expands parity and behavioral tests; and
- records the normative contract in AGENTS.md plus
  `docs/solutions/best-practices/owner-scoped-scratch-space.md`.

Review found two additional propagation/boundary defects before handoff. First,
current public skill docs, durable solutions, and plan examples still taught the
legacy fixed root even though runtime consumers were clean. Those examples now
use resolver-returned runtime/cache/state paths, and a published-guidance scan
prevents recurrence while preserving explicit incident evidence. Second,
`peer-job-runner.py --run-dir` used a create-capable validator plus a broad
`commonpath` check. A caller could therefore invent a missing run, pass the
`runs/` parent, or pass a deeper descendant. The handoff now accepts only an
existing owner-private directory whose immediate parent is the resolved
`<skill>/runs` directory; regression tests cover all three escapes.

The first corrected targeted resolver/runner/parity suite passed 35/35. Tomas's
cross-UID execution then exposed six additional source-to-lifecycle gaps in the
authoritative bundle:

1. Legacy retention scanned every old child of `<skill>/` and could mistake the
   reserved `runs/` container for one disposable legacy run. Aging that
   container and starting a legacy job deleted an active resolver run while its
   supervisor and worker stayed alive. Retention now allowlists the actual
   legacy `<run-id>/jobs/` shape and explicitly excludes `runs/`; the mixed-mode
   reproduction preserves the active run and both process identities.
2. A terminal status word was treated as lease release. With the supervisor
   stopped after TERM, reap self-classified from a worker result and delete
   removed the directory while the supervisor remained alive. Terminal outcome
   and live lease are now independent checks. Reap escalates against the
   verified supervisor birth identity, refuses fallback publication until every
   matching supervisor/worker lease is gone, and delete fails closed while any
   such lease remains.
3. The ce-pov panel omitted `--run-dir`, selecting the legacy runner layout even
   after the parent captured an opaque resolver run. Its contract now includes
   a concrete start command passing the exact `SCRATCH_DIR` to `--run-dir` and
   `CROSS_MODEL_SCRATCH_PARENT`; internal peer temp directories default beneath
   the run.
4. The written rule claimed universal resolver propagation while handed-off
   ce-compound/ce-plan scratch and a predictable browser-test log still bypassed
   it. Cross-agent artifacts now use exact resolver runs and cross-model
   process-local temp defaults beneath those runs. The first browser-log
   migration merely replaced the predictable file with `mktemp -d`; because the
   background server outlived that shell and no later phase retained the exact
   directory, it converted a collision into an unbounded leak. The second
   migration put cleanup in a background Bash subshell, but cross-UID review
   proved that this was not a detached lifecycle: the launching shell's exit
   killed the subshell, wrapper, and listener while leaving the run behind. It
   also signaled only the direct wrapper and trusted a numeric PID, so descendants
   could survive exact-run deletion and a reused PID could kill an unrelated
   process. Pipeline browser startup now creates a ce-test-browser resolver run
   and calls a dedicated lifecycle helper that double-forks into a detached
   session. The helper launches the server in its own process group and publishes
   an owner-private lease containing supervisor/worker birth identities plus an
   unguessable token inherited by the server tree. A later invocation must present
   that token; teardown signals only the verified group/token-bearing descendants,
   escalates TERM to KILL, proves the detached supervisor and full tree are gone,
   and only then removes the exact run. Token or identity mismatch fails closed.
   Behavioral tests now cross the actual invocation boundary: an HTTP listener
   and its two-process wrapper tree remain live after `start` returns, a separate
   `stop` removes all three PIDs before the run disappears, a wrong token changes
   nothing, and a fabricated stale lease does not signal the live unrelated PID.
   A supervisor-SIGKILL fixture additionally proves that a later authenticated
   stop recovers both token-bearing server processes before removing the run.
   The next cross-UID gate found one remaining failure boundary: after the
   double-fork, the launching parent could time out waiting for acknowledgment,
   while the documented shell branch raw-deleted the run and recovery lease.
   Tomas reproduced two token-bearing processes surviving that deletion. The
   helper now owns every post-fork rollback. It publishes the supervisor birth
   identity before launching the worker, retains the generated token in the
   parent, and on any acknowledgment error terminates the identity-matching
   supervisor plus token/group-verified descendants. It removes the exact run
   only after proving extinction; an incomplete proof retains the lease and
   exact path. The docs never raw-delete after `start` failure. A forced delayed-
   acknowledgment regression proves the wrapper and child are dead before the
   helper reports verified rollback and the run disappears.
   Review then forced a still-earlier stall before the detached supervisor could
   publish its own birth lease. In that interval there is no authenticated PID
   to signal, and no worker token is expected yet; treating those absences as
   extinction falsely removed the run while the supervisor remained alive. The
   rollback now fails closed whenever the supervisor lease is unavailable: it
   may stop any token-bearing workers it can prove, but it retains the exact run
   and never attests cleanup. A pre-lease-delay fixture proves the failed start
   leaves the run, waits for the owner-private lease to become recoverable, then
   uses authenticated stop to remove the supervisor, wrapper, child, and run.
   One final ownership split appeared on ordinary `Popen`/exec failure: the
   detached child proved that no worker survived and removed the run before the
   parent read its error; the parent then saw no lease and falsely claimed the
   absent path was retained. Startup-state deletion is now single-writer. The
   detached child may clean a worker it launched but never removes the lease or
   run; parent rollback alone classifies supervisor identity, proves extinction,
   and chooses exact removal versus retained recovery. A nonexistent-command
   regression proves the error reports verified removal, not a phantom retained
   path.
   Birth identity also had a representation drift: a transient `/proc` read
   failure stored `ps-start:<timestamp>`, while later matching preferred the
   recovered `proc-start:<ticks>` representation and therefore called the same
   live supervisor stale. Matching is now source-stable: the stored prefix
   selects the same source for every subsequent comparison. A forced ps-fallback
   fixture proves later status recognizes the supervisor after `/proc` is
   available and stop signals/proves it gone before exact run removal.
   The normative exception is narrowed to unpredictable `mktemp` data owned and
   cleaned by one supervising same-UID process tree; detached children do not
   qualify.
5. O_NOFOLLOW necessarily rejected macOS's root-owned `/tmp` symlink. The
   fallback now verifies the symlink owner, canonicalizes it to `/private/tmp`,
   and performs the no-follow walk on that canonical path. A platform fixture
   exercises the root-owned symlink case.
6. Upgrade and cache modes were incomplete. Same-UID legacy descendants below
   an already validated private root are now tightened from 0775 to 0700 while
   wrong-owner/unsafe override roots remain untouched; repo-profile schema and
   semantic directories are created/tightened to 0700 as well.

A subsequent full-lifecycle review verified those six reproductions and found
four more places where allocation and retention semantics disagreed:

7. ce-sweep said a failed analyzer retained media for a later run, but each
   invocation receives a new opaque run and item state stored neither that path
   nor the raw artifact. The retry contract now deletes the exact attempt run on
   download or analysis failure, returns the item to `needs_download`, and keeps
   only `media_attempts` in durable item state. The next invocation re-downloads
   into a new run; success and `manual_stuck` also clean raw media. A
   two-invocation contract test rejects the former retain-and-reconstruct model.
8. ce-brainstorm, ce-compound, and ce-doc-review created resolver runs without
   owning their close. Each now captures one literal run path, waits for every
   user of it to settle, consumes the artifacts, and calls exact
   `remove-run-dir` on normal, skipped, and early-failure exits. A live lease
   fails closed with the retained path reported; cleanup never races a worker.
9. ce-explain described resolver scratch as reboot-scoped even though the HOME
   fallback is persistent. Durable destinations now trigger exact cleanup;
   `Leave it` and non-interactive degradation explicitly disclose that the
   owner-private path may survive reboot and print its exact cleanup command.
   An empty recap run is removed because it contains no artifact worth keeping.
10. Published ce-babysit-pr documentation used nonexistent `--skill`/`--path`
    flags for `state-subdir`. It now publishes the positional
    `state-subdir "ce-babysit-pr/<host>/<owner>/<repo>/<pr>"` form, guarded by a
    docs-command contract assertion.

The final detached-supervisor/scratch/flattening gate passes 23/23, and the
combined lifecycle/cache/runner/parity gate passes 224/224. The first
complete-suite run correctly caught one earlier teardown block that parsed with
newlines but not after a host flattened the fenced Bash block. Adding explicit
statement separators fixed that real regression. After the detached supervisor
replacement, the complete suite reaches 2,230 passes with the same seven baseline
failures already reproduced on detached clean-upstream `e745e96`: two 2026 ISO
timestamp failures, four Cursor/Composer route fixtures, and one raw POV fixture.
Release validation reports synchronized metadata for 30 skills, both strict
Claude plugin manifests pass, all 13 resolver copies, nine cache helpers, and
three job runners are byte-identical, every changed Python helper compiles, all
three changed shell workers pass `bash -n`, and the staged diff passes
`git diff --cached --check`. Closure still requires Tomas's approval of a
superseding complete bundle, PR merge/release, managed install refresh, and a
live cross-UID run proving no loaded skill references the legacy root.

The first cross-agent review bundle was incomplete even though its checksum was
valid: an unstaged worktree diff omitted newly added resolver files. The
corrected handoff stages/includes additions, verifies expected added-file
entries, and sends a checksummed external bundle instead of relaxing another
UID's access to a private home directory. This is now part of the durable
scratch/review contract.

Final5 exposed one more birth-identity representation boundary after the
source-stability fix. `ps -o lstart` formats its result using the caller's
timezone and locale. Capturing a forced `ps-start` identity under `TZ=UTC` and
later invoking status/stop under `TZ=America/Chicago` therefore made the same
live supervisor appear stale. Stop killed the token-bearing workers, skipped
the real supervisor, deleted its recovery run, and reported success. A later
review message marked final5 ready without exercising that transition, but the
specific cross-environment reproduction and a new local red test superseded the
generic disposition. The `ps` identity path now always runs with `TZ=UTC`,
`LC_ALL=C`, and `LANG=C` for both capture and comparison. The regression changes
timezone and locale across separate start/status/stop invocations and proves
that status recognizes the supervisor and stop signals the supervisor, removes
the full token process tree, and only then deletes the exact run. The supervisor
suite passes 7/7, the focused lifecycle/scratch gate passes 62/62, the eight
affected test files pass 223/223, and the complete suite remains 2,230 passes
with the same seven clean-upstream baseline failures. Release metadata, strict
plugin manifests, Python compilation, shell parsing, and diff whitespace gates
remain green. Final5 is superseded; closure requires a new exact-index final6
bundle and an explicit disposition against that bundle.
