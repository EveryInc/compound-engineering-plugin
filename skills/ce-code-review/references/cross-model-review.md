# Cross-Model Adversarial Pass

Runs the **adversarial** review through one separately routed model target in a read-only process. The peer gets the **same** `references/personas/adversarial-reviewer.md` brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into Stage 5 as reviewer `adversarial-<provider>`. It counts as independent corroboration and can promote agreement only when its receipt records `independence_verified: true`; otherwise it remains attributed review evidence without a promotion bonus.

This pass is **adversarial-only**. No other persona gets a cross-model twin, and there is no whole-diff generalist peer. Cost stays gated on the existing Stage 3 adversarial selection.

The host resolves and sanctions one concrete route before egress; `scripts/cross-model-adversarial-review.sh` enforces that fixed route, applies read-only controls, captures schema-shaped JSON, and records identity receipts. A failed route writes no artifact and never switches recipients internally.

## Gates — run only when all hold

1. `adversarial-reviewer` was selected in Stage 3 (reuse that diff gate — don't run a costly external CLI on a trivial diff).
2. Scope is `local-aligned` or standalone — the working tree IS the reviewed head. Skip in `pr-remote` / `branch-remote`: the peer reviews the local tree, which is not the PR/branch head.

## Step 1 — Attest host identity, then sanction one fixed route

Keep requested **target**, CLI **harness/intermediary**, serving **family/provider**, and served model separate. `cursor` means `cursor-agent` with its configured default/Auto model and no `--model` flag. `composer` means an explicit Composer-family model through Cursor. `grok` prefers its native CLI; Grok through Cursor is a distinct route and recipient.

Attest both the host harness and its serving family:

```bash
if [ "${CLAUDECODE:-}" = "1" ]; then XHOST_HARNESS=claude; XHOST_FAMILY=claude;
elif [ -n "${CODEX_SANDBOX:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}" ]; then XHOST_HARNESS=codex; XHOST_FAMILY=codex;
elif [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST_HARNESS=cursor; XHOST_FAMILY=unknown;
else XHOST_HARNESS=unknown; XHOST_FAMILY=unknown; fi
```

Pass `XHOST_HARNESS` as `CROSS_MODEL_HOST_HARNESS`; pass `XHOST_FAMILY` as the first worker argument. Claude Code maps to harness/family `claude`; Codex to `codex`. Cursor maps to harness `cursor` and family `unknown` unless an observable serving-family attestation lets you set `XHOST_FAMILY` to `codex`, `claude`, `grok`, or `composer`. An unknown host family cannot satisfy automatic same-family exclusion, so skip the automatic cross-model pass. Never infer serving family from the Cursor brand.

Resolve the preference in this order:

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` in `.compound-engineering/config.local.yaml` (the only file the script/skill reads for this).
3. A preference already in your **project instructions** (the active instructions in your context) — consumed from context, **never** read from a named file.
4. **Default:** first available attested-different target in `codex → claude → grok → composer`; Cursor-default participates only when explicitly preferred.

Before egress, resolve the target to one concrete installed route, verify every recipient against `CROSS_MODEL_PEERS`, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. A failed route returns no artifact and never changes provider or intermediary internally. A retry is a new disclosed and sanctioned dispatch. For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting Cursor-default requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor.

`CROSS_MODEL_PEERS` is an optional restriction: when unset, it leaves the resolved route unfiltered and this skill invocation plus the concrete pre-egress disclosure sanctions that route; when set, the selected target/intermediary must appear. Use this contract directly. Do not inspect the worker source to rediscover its allowlist behavior.

Preferred mappings run first. Only after an observed unavailable, obsolete, or incompatible model may the host choose the closest compatible same-target/same-family replacement. Bind it with `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, leak an override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + reasoning tier (owned by the script)

The peer runs on **one editorially selected model and reasoning tier per provider**. The concrete model IDs and route effort flags live in one mapping in `scripts/cross-model-adversarial-review.sh`; this reference does not duplicate them. Claude Opus and native Grok currently use high, Codex uses medium; cursor-agent routes use their model-implied tier or ceiling. Users choose the peer target, not an arbitrary model/effort matrix. Never inherit a harness-configured default model. A lower tier is adopted only after a discriminating effectiveness eval, never from cost alone.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

The ce-code-review invocation authorizes the selected configured/allowlisted route after this disclosure. The announce is a transparent notice, not a second egress-confirmation gate. This does not grant host-execution authority; Step 4 resolves that separately at the actual start call. Skip for an explicit user prohibition or an observed scope/allowlist/route/authentication failure, never solely because the user did not separately authorize the external pass in the same prompt.

- **Interactive host, default mode:** surface a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model" — not the internal "peer" jargon), names the requested **model and reasoning level** from the in-script mapping, and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes, and states that reviewed code/diff content is sent to that provider. **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model> at <effort>; serving model/effort unverified on this route." Placed with the Stage 3 team announce, not buried after it.
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. A failure may be retried only after resolving, sanctioning, and disclosing a new route. Reconcile target, harness, route, requested model, and actual model from the artifact.
- **Interactive host, no peer resolved** (host serving family un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that review content was sent cross-model to the named provider, so the third-party data egress is auditable.

## Peer worker environment allowlist (source of truth)

This route-qualified allowlist is the sole source of truth for the detached worker environment. Build it with `env -i`; everything else is dropped. Native CLI-owned OAuth and keychain discovery remains available only through the accepted non-secret discovery fields, especially `HOME`; credentials themselves stay owned by the CLI. Environment values whose names contain `API`, `TOKEN`, or `KEY` are never forwarded, nor are password, secret, or credential values. A route that requires a secret environment variable is unsupported until separately authorized with a new contract.

| Fixed route | Exact accepted non-secret discovery fields |
|---|---|
| `codex` | `HOME`, `PATH`, `TMPDIR`, `XDG_CONFIG_HOME`, `CODEX_HOME` |
| `claude` | `HOME`, `USER`, `PATH`, `TMPDIR`, `XDG_CONFIG_HOME`, `CLAUDE_CONFIG_DIR` |
| `grok-cli` | `HOME`, `PATH`, `TMPDIR`, `XDG_CONFIG_HOME` |
| `grok-cursor` | `HOME`, `PATH`, `TMPDIR`, `XDG_CONFIG_HOME` |
| `cursor` | `HOME`, `PATH`, `TMPDIR`, `XDG_CONFIG_HOME` |
| `composer` | `HOME`, `PATH`, `TMPDIR`, `XDG_CONFIG_HOME` |

Every route also accepts only these operational fields: `CROSS_MODEL_HOST_HARNESS`, `CROSS_MODEL_FIXED_ROUTE`, `CROSS_MODEL_PEERS`, `CROSS_MODEL_MAX_PEERS`, `CROSS_MODEL_MODEL_OVERRIDE_TARGET`, `CROSS_MODEL_MODEL_OVERRIDE`, `CROSS_MODEL_INPUT_DIGEST`, `CROSS_MODEL_IDLE_SECS`, `CROSS_MODEL_HARD_SECS`, and `CROSS_MODEL_HEARTBEAT_SECS`. In the launch command, `<route-discovery-env>` expands to assignments for exactly the selected table row. For example, the macOS `claude` route uses `HOME="$HOME" USER="$USER" PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-}" CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-}"`; `USER` is required there for native OAuth/keychain discovery. Do not add host-attestation markers or provider-specific credential variables.

## Step 4 — Start the detached peer job before local dispatch

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime** — some harnesses kill long tool calls, which silently vanishes the pass. At the Stage 3d routing boundary, start it as a **detached, supervised job** through the bundled runner in one short Bash call (prints the job id in under ~2s). Only after that call returns may the host finalize the local roster and enter Stage 4. The detached worker still overlaps the local reviewers; binding it first prevents the host from accidentally dispatching the in-process adversarial fallback too.

Before the first launch, distinguish the current execution lane from the host identity already attested in Step 1. Resolve launch authority as exactly one outcome before the exclusive local roster is finalized:

- `normal` — the current lane can run the finalized native peer command.
- `approved_host_launch` — the current lane is restricted, but the host approved that finalized command.
- `host_denied` — the host rejected that launch.
- `authority_unavailable` — the harness exposes no way to request the authority the launch needs.

Only `normal` and `approved_host_launch` may detach. For `host_denied` or `authority_unavailable`, issue no start command: there is no job ID and no detach. Keep the in-process `adversarial-reviewer` as the skill-specific local fallback and record the authority outcome in Coverage. Because the provider CLI never ran, never infer provider logout, missing credentials, or provider unavailability from either branch.

**Restricted Codex adapter.** Submit the exact finalized `peer-job-runner.py start` command below in the same exec call that requests `sandbox_permissions: "require_escalated"`; the `justification` must name the fixed route and the reviewed-code egress recipients. Omit `prefix_rule`: approval is call-scoped, not a reusable token. Never approve a probe and launch later. An unrestricted or already authorized execution lane runs the identical command normally. The adapter metadata shape is:

```text
exec({
  cmd: "<the exact finalized shell command below>",
  sandbox_permissions: "require_escalated",
  justification: "Launch the <target> cross-model adversarial review through <fixed-route>; reviewed code/diff content will egress to <recipients>."
})
```

Set the aggregate deadline anchor before the initial launch, then preserve it across the peer and local waves.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
BASE_REF="<base-ref>";
INPUT_DIGEST="$(git diff "$BASE_REF" -- | python3 -c 'import hashlib,sys; print(hashlib.sha256(sys.stdin.buffer.read()).hexdigest())')" || exit 1;
RESULT_PATH="<run-dir>/adversarial-<target>.json";
CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" python3 "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial --input-digest "$INPUT_DIGEST" --result-path "$RESULT_PATH" -- env -i <route-discovery-env> CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" CROSS_MODEL_PEERS="${CROSS_MODEL_PEERS:-}" CROSS_MODEL_MAX_PEERS="${CROSS_MODEL_MAX_PEERS:-}" CROSS_MODEL_MODEL_OVERRIDE_TARGET="${CROSS_MODEL_MODEL_OVERRIDE_TARGET:-}" CROSS_MODEL_MODEL_OVERRIDE="${CROSS_MODEL_MODEL_OVERRIDE:-}" CROSS_MODEL_INPUT_DIGEST="$INPUT_DIGEST" CROSS_MODEL_IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-}" CROSS_MODEL_HARD_SECS="${CROSS_MODEL_HARD_SECS:-}" CROSS_MODEL_HEARTBEAT_SECS="${CROSS_MODEL_HEARTBEAT_SECS:-}" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-serving-family>" "<target>" "$BASE_REF" "<run-dir>"
```

- `<run-id>` = the Stage 3d run id (the same one that forms `<run-dir>`); job state lives under `<run-dir>/jobs/<job-id>/`.
- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned concrete route.
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the absolute Stage 4 run dir. The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

Record the launch ledger row immediately after the authority decision/start attempt with these fields in order: `label`, `target`, `fixed route`, `authority outcome`, `job ID/no-job`, `expected result path`, `input digest`. The digest is SHA-256 over the exact `git diff <base-ref> --` bytes; the worker removes stale output, recomputes those bytes before prompting, and fails closed on drift.

**Single-reap finish.** The runner detaches the worker into its own supervised session. Use the deadline anchor recorded in working state before the launch and do not poll while local reviewers are active. After local returns are collected, check status once. If still running and the shared 610s deadline leaves time, issue one bounded `wait` sized to the remaining deadline (cap the wait at 240s); do not start repeated short polling turns. Fold in the artifact when terminal. At the deadline, `reap <job-id>` and perform one final `wait --max-secs 10` because reap is asynchronous. The script self-bounds (idle timeout 180s; hard backstop 600s), so deadline reaping is exceptional. Done detection stays presence-keyed: the worker publishes `<run-dir>/adversarial-<provider>.json` only after normalization. The script reads the persona brief and schema from the skill dir and reviews the current work tree against `<base-ref>`.

The `start` command's returned job ID is the successful-start receipt. Do not immediately call `status`, inspect `--help`, or otherwise verify that receipt; persist it and continue to local dispatch. Status collection begins only after the local wave completes.

The commands in this reference are the executable contract. Do not inspect or grep the worker script for its model mapping/allowlist, run `CROSS_MODEL_DRY_RUN`, call `--emit-adapter`, or probe runner `--help` before dispatch. Those exploratory calls replay host context and cannot strengthen the runner's enforced route.

After local reviewers complete, the one status read is exactly:

```bash
python3 "$SKILL_DIR/scripts/peer-job-runner.py" status "<job-id>" --json
```

If it is still running and time remains, use the documented single `wait`; do not invent alternate status flags or inspect help.

## Step 5 — Fold into Stage 5

- If and only if a job ID exists, collect only with `python3 "$SKILL_DIR/scripts/peer-job-runner.py" result <job-id>`. Never collect by path or scan. Revalidate full schema (including valid empty `findings`), exact reviewer, and ledger digest; mismatch is `unusable_output`. A valid artifact without verified serving identity is `ran_attributed`. Promotion requires `ran_verified_independent`: both `independence_verified` and `model_receipt_verified` are true and receipt identity reconciles.
- In final Coverage, name `cross_model_route`, `model_requested`, `effort_requested`, `receipt_supported`, `model_actual`, `effort_actual`, and `independence_verified` from the artifact. Keep the literal `unverified`; never compress a request into a serving claim such as "via Codex high" when actual model or effort is unverified.
- **Never started / not run** — no job ID exists (gates not met, host un-attestable, no different provider reachable, `host_denied`, or `authority_unavailable`). Issue no runner collection command, inspect no result path, keep the local fallback, and record an environment-scoped reason. No provider command ran, so do not claim an authentication failure.
- **Dispatch-infrastructure failure** — the runner or worker itself crashed: a non-zero exit before any job starts, a preflight/detach failure, or an unresolved `$SKILL_DIR`/script path. This is distinct from the gate-not-met skips above (there, no dispatch was attempted), so do not fold it into the silent not-run bucket on the first error. The two failure shapes recover at different points. A **no-job-id** preflight failure (exit before any job id, unresolved `$SKILL_DIR`) is recovered entirely at **Stage 3d's no-job branch**, before the local roster is materialized — the only point where re-running the start can still recover cross-model corroboration and, failing that, cleanly fall to the in-process reviewer (which then covers the lens; only corroboration is lost). Do **not** re-attempt that case here at fold-in: Stage 4 may already have dispatched the in-process `adversarial-reviewer`, so a fold-in peer re-run would put both on the same brief and violate the exclusive routing boundary. This step handles only the **job-id-returned-then-failed** crash — its failed job is reaped here and the in-process reviewer is already gone. For it, re-run the **same resolved fixed route** by hand — holding the target and model, the `git diff <base-ref>` read scope, and the adversarial persona brief fixed — while each failure is a new, plausibly recoverable one and the shared 610s deadline holds. This is a same-route retry, deliberately distinct from the quota rule below, which requires a newly disclosed route. Stop once a failure repeats or the deadline is spent; the hand recovery is then the adversarial lens's only cover, so the Coverage line must report the adversarial lens as **degraded**, not merely cross-model corroboration lost. A hand recovery may not substitute a different target or provider, widen the read scope, or relax the read-only trust boundary — those make the recovered peer untrustworthy, not merely unavailable.
- **Ran but produced no usable output** — a started job failed artifact validation or produced no registered artifact. A full-schema artifact with empty `findings` is successful, not unusable. Record `unusable_output`; never fail the review.
- **Started but not `done`** — the final status read reports `failed`, `timeout`, or `died-without-result` (a job reaped at the 610s deadline records `timeout`, with the reap noted in its reason) → still non-blocking, but never silent: name the peer and its terminal state in Coverage (e.g. "cross-model adversarial peer: timeout"). Silent absence stays correct only for passes that never started or were skipped.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- **Classify before deleting.** Read only bounded runner-owned diagnostics, including the stable `peer skip evidence:` category line. Persist only `auth_failed`, `quota_limited`, `timeout`, or `unusable_output`, redacting credentials, tokens, paths, commands, and raw prose. If quota and authentication markers coexist, `quota_limited` wins. Never retry repeated quota evidence automatically.
- After fold-in (or after deadline reaping), delete the consumed job directory (`<run-dir>/jobs/<job-id>/`) — its log and result are review content and must not outlive their use.
- A finding sharing a fingerprint with in-process `adversarial` promotes only for `ran_verified_independent`, including verified identity receipt reconciliation.

## Trust boundary (maintainers)

The peer reviews the **current work tree** (read-only) against `git diff <base-ref>`. Reviewed code/diff content is sent to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). `CROSS_MODEL_PEERS` restricts which providers may receive content.

**Isolation differs from ce-doc-review by design.** Doc-review embeds a self-contained document into a tool-less empty scratch. Code-review needs surrounding code context, so peers run **in-tree read-only**:

- **codex:** `-s read-only` with cwd at the repo root (may fetch `git diff` itself).
- **claude:** deny mutators / Bash / Task / `mcp__*`; **Read allowed** for context; diff is embedded because Bash is denied.
- **grok / cursor-agent:** ask/dontAsk + no write/force/yolo; Read allowed; workspace/cwd at the repo root.

Impact is bounded to disclosure, not repo mutation. The script's stderr audit log records each send so the egress is auditable even in `mode:agent`.
