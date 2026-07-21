# Cross-Model Adversarial Pass

Runs the **adversarial** review through one separately routed model target in a read-only process. The peer gets the **same** `references/personas/adversarial-reviewer.md` brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into Stage 5 as reviewer `adversarial-<provider>`. It counts as independent corroboration and can promote agreement only when its receipt records `independence_verified: true`; otherwise it remains attributed review evidence without a promotion bonus.

This pass is **adversarial-only**. No other persona gets a cross-model twin, and there is no whole-diff generalist peer. Cost stays gated on the existing Stage 3 adversarial selection.

The host resolves and sanctions one concrete route before egress; `scripts/cross-model-adversarial-review.sh` enforces that fixed route, applies read-only controls, captures schema-shaped JSON, and records identity receipts. Before dispatch it conservatively estimates diff tokens and file count. Oversized diffs are not inlined: the worker gives the peer the orchestrator's compact semantic review map and keeps the exact diff as a private, selectively readable artifact. Tool-limited routes receive that temp directory as an additional read root; Codex uses selective `git diff <base> -- <path>` calls under its existing read-only sandbox. A failed route writes no artifact and never switches recipients internally.

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

The peer runs on **one editorially selected model and reasoning tier per provider**. The concrete model IDs and route effort flags live in one mapping in `scripts/cross-model-adversarial-review.sh`; this reference does not duplicate them. Claude Opus and native Grok currently use high, Codex uses extra-high; cursor-agent routes use their model-implied tier or ceiling. Users choose the peer target, not an arbitrary model/effort matrix. Never inherit a harness-configured default model. A lower tier is adopted only after a discriminating effectiveness eval, never from cost alone.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

The ce-code-review invocation authorizes the selected configured/allowlisted route after this disclosure. The announce is a transparent notice, not a second confirmation gate. Skip for an explicit user prohibition or an observed scope/allowlist/route/authentication failure, never solely because the user did not separately authorize the external pass in the same prompt.

- **Interactive host, default mode:** surface a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model" — not the internal "peer" jargon), names the requested **model and reasoning level** from the in-script mapping, and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes, and states that reviewed code/diff content is sent to that provider. **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model> at <effort>; serving model/effort unverified on this route." Placed with the Stage 3 team announce, not buried after it.
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. A failure may be retried only after resolving, sanctioning, and disclosing a new route. Reconcile target, harness, route, requested model, and actual model from the artifact.
- **Interactive host, no peer resolved** (host serving family un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that review content was sent cross-model to the named provider, so the third-party data egress is auditable.

## Step 4 — Start the detached peer job before local dispatch

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime** — some harnesses kill long tool calls, which silently vanishes the pass. At the Stage 3d routing boundary, start it as a **detached, supervised job** through the bundled runner in one short Bash call (prints the job id in under ~2s). Only after that call returns may the host finalize the local roster and enter Stage 4. The detached worker still overlaps the local reviewers; binding it first prevents the host from accidentally dispatching the in-process adversarial fallback too.

Before `start`, the orchestrator writes `<run-dir>/adversarial-review-brief.md`. Keep it compact (at most 32 KiB) and semantic:

- the Stage 2 intent summary;
- 2-8 material risk divisions chosen from the current file inventory and diff, each with a one-line reason and representative paths or path prefixes;
- which divisions are explicit generated repetition and should be covered through generator inputs, manifests, tests, and representative outputs;
- any cross-division interaction the adversarial lens must test.

This map is agent judgment, not a deterministic directory taxonomy. Do not copy the full file list, diff hunks, or a mechanical extension split into it. On a simple change, one division is enough. The worker embeds this brief in the peer prompt when it is present. Its transport preflight only measures and stages the exact diff outside the prompt; it never cuts semantic shards or chooses or rewrites the orchestrator's divisions.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" python3 "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial -- env CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-serving-family>" "<target>" "<base-ref>" "<run-dir>"
```

- `<run-id>` = the Stage 3d run id (the same one that forms `<run-dir>`); job state lives under `<run-dir>/jobs/<job-id>/`.
- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned concrete route.
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the absolute Stage 4 run dir. The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

**Single-reap finish.** The runner detaches the worker into its own supervised session. Capture the epoch time right after `start` (`date +%s`) and do not poll while local reviewers are active. After local returns are collected, check status once. If still running and the shared 610s deadline leaves time, issue one bounded `wait` sized to the remaining deadline (cap the wait at 480s — Luna xhigh runs can legitimately take up to ~419s, so a lower cap can end before a healthy peer returns); do not start repeated short polling turns. Fold in the artifact when terminal. At the deadline, `reap <job-id>` and perform one final `wait --max-secs 10` because reap is asynchronous. The script self-bounds (idle timeout 480s; hard backstop 600s), so deadline reaping is exceptional. Done detection stays presence-keyed: the worker publishes `<run-dir>/adversarial-<provider>.json` only after normalization. The script reads the persona brief and schema from the skill dir and reviews the current work tree against `<base-ref>`. Its large-diff preflight is transport only: it measures and stages the exact diff outside the prompt; the orchestrator chooses the semantic divisions, and the reviewer chooses representatives and evidence within them.

The `start` command's returned job ID is the successful-start receipt. Do not immediately call `status`, inspect `--help`, or otherwise verify that receipt; persist it and continue to local dispatch. Status collection begins only after the local wave completes.

The commands in this reference are the executable contract. Do not inspect or grep the worker script for its model mapping/allowlist, run `CROSS_MODEL_DRY_RUN`, call `--emit-adapter`, or probe runner `--help` before dispatch. Those exploratory calls replay host context and cannot strengthen the runner's enforced route.

After local reviewers complete, the one status read is exactly:

```bash
python3 "$SKILL_DIR/scripts/peer-job-runner.py" status "<job-id>" --json
```

If it is still running and time remains, use the documented single `wait`; do not invent alternate status flags or inspect help.

## Step 5 — Fold into Stage 5

- Read the artifact through the runner's verified read — `python3 "$SKILL_DIR/scripts/peer-job-runner.py" result --path <run-dir>/adversarial-<target>.json`. Its findings enter ordinary dedup, but agreement promotion is allowed **only when `independence_verified` is `true`**. A false or absent value may contribute findings but never raises confidence. `independence_verified` attests a different serving family; it does not claim the exact served model was verified. `receipt_supported`, `model_actual`, and `effort_actual` carry that separate identity evidence. Peer findings never grant silent-apply authority.
- In final Coverage, name `cross_model_route`, `model_requested`, `effort_requested`, `receipt_supported`, `model_actual`, `effort_actual`, and `independence_verified` from the artifact. Keep the literal `unverified`; never compress a request into a serving claim such as "via Codex high" when actual model or effort is unverified.
- **Never started / not run** — the job was never started (gates not met, host un-attestable, no different provider reachable, CLI missing/unauthed): the pass simply didn't run. Note "cross-model pass: not run" in Coverage for human-facing markdown; stay silent in `mode:agent`. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- **Dispatch-infrastructure failure** — the runner or worker itself crashed: a non-zero exit before any job starts, a preflight/detach failure, or an unresolved `$SKILL_DIR`/script path. This is distinct from the gate-not-met skips above (there, no dispatch was attempted), so do not fold it into the silent not-run bucket on the first error. The two failure shapes recover at different points. A **no-job-id** preflight failure (exit before any job id, unresolved `$SKILL_DIR`) is recovered entirely at **Stage 3d's no-job branch**, before the local roster is materialized — the only point where re-running the start can still recover cross-model corroboration and, failing that, cleanly fall to the in-process reviewer (which then covers the lens; only corroboration is lost). Do **not** re-attempt that case here at fold-in: Stage 4 may already have dispatched the in-process `adversarial-reviewer`, so a fold-in peer re-run would put both on the same brief and violate the exclusive routing boundary. This step handles only the **job-id-returned-then-failed** crash — its failed job is reaped here and the in-process reviewer is already gone. For it, re-run the **same resolved fixed route** by hand — holding the target and model, the `git diff <base-ref>` read scope, and the adversarial persona brief fixed — while each failure is a new, plausibly recoverable one and the shared 610s deadline holds. This is a same-route retry, deliberately distinct from the quota rule below, which requires a newly disclosed route. Stop once a failure repeats or the deadline is spent; the hand recovery is then the adversarial lens's only cover, so the Coverage line must report the adversarial lens as **degraded**, not merely cross-model corroboration lost. A hand recovery may not substitute a different target or provider, widen the read scope, or relax the read-only trust boundary — those make the recovered peer untrustworthy, not merely unavailable.
- **Ran but produced no usable output** — the job reached `done` (or any terminal state) yet no `adversarial-<provider>.json` exists (the peer ran and egressed but returned nothing schema-shaped — unparseable output, empty findings the script dropped). Distinct from not-run: note "cross-model pass: peer ran, no usable output" in human-facing markdown Coverage. Never fail the review.
- **Started but not `done`** — the final status read reports `failed`, `timeout`, or `died-without-result` (a job reaped at the 610s deadline records `timeout`, with the reap noted in its reason) → still non-blocking, but never silent: name the peer and its terminal state in Coverage (e.g. "cross-model adversarial peer: timeout"). Silent absence stays correct only for passes that never started or were skipped.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- **Classify the skip reason before deleting.** Read `out.log` before cleanup, including bounded lines prefixed `peer skip evidence:`, and name observed quota, authentication, or capability failure. An authentication-shaped peer failure (`not logged in`, `please log in`, 401, or CLI text prompting login) describes only the peer's execution context: a sandboxed host — e.g. a restricted Codex task denying spawned commands network or keychain access — produces the identical signal to a genuine account logout, so classify it as a cross-model execution-context authentication failure and never report it as the user's account being logged out or prompt the user to run a login command on that basis. The cross-model pass is additive and the local review still completed; obtaining it requires a context where the peer CLI can reach the network (for example, outside the restricted sandbox). After the same quota or usage-limit evidence appears more than once in this session, do not retry that route automatically. A retry uses a newly resolved, disclosed, and sanctioned fixed route; never silently continue to another recipient.
- After fold-in (or after deadline reaping), delete the consumed job directory (`<run-dir>/jobs/<job-id>/`) — its log and result are review content and must not outlive their use.
- A finding sharing a fingerprint with in-process `adversarial` promotes only when the artifact records `independence_verified: true`. Cursor-default artifacts default false; an unattested host skips automatic dispatch.

## Trust boundary (maintainers)

The peer reviews the **current work tree** (read-only) against `git diff <base-ref>`. Reviewed code/diff content is sent to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). `CROSS_MODEL_PEERS` restricts which providers may receive content.

**Isolation differs from ce-doc-review by design.** Doc-review embeds a self-contained document into a tool-less empty scratch. Code-review needs surrounding code context, so peers run **in-tree read-only**:

- **codex:** `-s read-only` with cwd at the repo root (may fetch `git diff` itself).
- **claude:** deny mutators / Bash / Task / `mcp__*`; **Read allowed** for context; diff is embedded because Bash is denied.
- **grok / cursor-agent:** ask/dontAsk + no write/force/yolo; Read allowed; workspace/cwd at the repo root.

Impact is bounded to disclosure, not repo mutation. The script's stderr audit log records each send so the egress is auditable even in `mode:agent`.
