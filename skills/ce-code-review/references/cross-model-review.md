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
elif [ "${GROK_AGENT:-}" = "1" ] || [ -n "${GROK_SESSION_ID:-}" ]; then XHOST_HARNESS=grok; XHOST_FAMILY=grok;
elif [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST_HARNESS=cursor; XHOST_FAMILY=unknown;
else XHOST_HARNESS=unknown; XHOST_FAMILY=unknown; fi
```

Pass `XHOST_HARNESS` as `CROSS_MODEL_HOST_HARNESS`; pass `XHOST_FAMILY` as the first worker argument. The snippet is evidence, not the verdict: it resolves the harnesses whose environment markers it already names, and where it yields `unknown` on a harness you can identify from your own runtime, attest what you know instead. A harness the snippet does not name needs no new branch here. Both tokens come from the peer-key vocabulary the worker accepts, never a provider's corporate name — family `codex`, `claude`, `grok`, `composer`, or `unknown`; harness `codex`, `claude`, `grok`, `cursor`, or `unknown` — and a name such as `anthropic`, `openai`, or `xai` in either slot fail-closes the job with no artifact.

Cursor is the one identity self-knowledge cannot complete, because the harness does not determine the serving model: it keeps family `unknown` unless an observable serving-family attestation supplies `codex`, `claude`, `grok`, or `composer`. Never infer serving family from the Cursor brand. An unknown host family cannot satisfy automatic same-family exclusion, so skip the automatic cross-model pass.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**Checkout egress policy — evaluate first.** Read `cross_model_review_mode:` from the same two repo CE config files under the ordinary-key rule. Valid values are `auto` (default) and `off`; anything else is invalid and continues to the next layer, then `auto`. When it resolves to `off`, skip the automatic cross-model pass here — before peer resolution, disclosure, or any job start — unless the user explicitly asked for a cross-model peer for this run in conversation (a `cross_model_peer` value or a project-instruction preference is not that opt-in). Record the skip reason as **disabled by checkout config**, distinct from an un-attestable host or an unavailable or non-independent route; the in-process `adversarial-reviewer` keeps the lens exactly as it does for any peer that never started. A live user prohibition still overrides `auto`.

Resolve the preference in this order:

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` from the two repo CE config files (`config.local.yaml` then `config.yaml`). Apply the ordinary-key rule: first active supported target wins; an invalid value continues to the next layer, then step 3.
3. A preference already in your **project instructions** (the active instructions in your context) — consumed from context, **never** read from a named file.
4. **Default:** first available attested-different target in `codex → claude → grok → composer`; Cursor-default participates only when explicitly preferred.

Before egress, resolve the target to one concrete installed route, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. `CROSS_MODEL_PEERS` is an optional egress restriction, not a required approval: when it is set, every recipient (target and intermediary) must be sanctioned by it under the alias rule below, and an unsanctioned recipient is a named skip; when it is unset or empty, no recipient is filtered and the pass proceeds — this skill invocation plus the pre-egress disclosure is the sanction. Do not inspect the worker source to rediscover this; it implements exactly this contract. `CROSS_MODEL_FIXED_ROUTE` accepts exactly these tokens — the worker fail-closes on anything else (including route-shaped guesses like `codex-cli`):

| Target | Route token(s) |
|--------|----------------|
| `codex` | `codex` |
| `claude` | `claude` |
| `grok` | `grok-cli` (native CLI) or `grok-cursor` (via Cursor intermediary) |
| `cursor` | `cursor` |
| `composer` | `composer` |

The host harness does not choose the Grok route. Target `grok` binds `grok-cli` when that CLI is installed. Bind `grok-cursor` only when the user asked for Grok through Cursor, or when the grok CLI is absent and Cursor is a sanctioned recipient.

A failed route returns no artifact and never changes provider or intermediary internally. Retrying the same resolved route retains its existing sanction and disclosure; changing the route or any recipient requires a new resolution, sanction, and disclosure before dispatch. The worker may repeat that same route once only after an exact provider-overload 529; it keeps the recipient, model, scope, and shared peer deadline fixed. For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting Cursor-default requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor.

**Checkout-configured model and effort.** After the target is resolved, read `cross_model_model:` and `cross_model_effort:` from the same two repo CE config files under the ordinary-key rule. When `cross_model_model` is set, pass `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<resolved-target>` and `CROSS_MODEL_MODEL_OVERRIDE=<value>`; when `cross_model_effort` is set, pass `CROSS_MODEL_EFFORT_OVERRIDE=<value>`. Both ride the `env` prefix of the start invocation below. The worker validates each against the route it actually runs — a model must be the resolved target's own family (an alias such as `fable` or a full id such as `claude-opus-5` for `claude`; `gpt-*` for `codex`, optionally namespace-qualified such as `openai.gpt-5.6-sol` when that CLI routes through a non-default `model_provider`), an effort must be a level that CLI documents, and cursor-agent routes accept no effort override — and an incompatible value fails the pass closed with a named skip reason rather than substituting. Unset keys leave the script's editorial mapping unchanged. Announce the configured model and effort in the Step 3 line exactly as requested. A model or effort the user states in conversation outranks the config keys.

Preferred mappings run first. Only after an observed unavailable, obsolete, or incompatible model may the host choose the closest compatible same-target/same-family replacement. Bind it with `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, leak an override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + reasoning tier (owned by the script)

The peer runs on **one editorially selected model and reasoning tier per provider**. The concrete model IDs and route effort flags live in one mapping in `scripts/cross-model-adversarial-review.sh`; this reference does not duplicate them. Claude Opus and native Grok currently use high, Codex uses extra-high; cursor-agent routes use their model-implied tier or ceiling. Users choose the peer target, and may pin that target's model and effort through `cross_model_model` / `cross_model_effort` (Step 1); the script validates and never substitutes. Never inherit a harness-configured default model. A lower tier is adopted only after a discriminating effectiveness eval, never from cost alone.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

The ce-code-review invocation authorizes the selected configured/allowlisted route after this disclosure. The announce is a transparent notice, not a second confirmation gate. Skip for an explicit user prohibition, a checkout `cross_model_review_mode: off` without a live opt-in, or an observed scope/allowlist/route failure, never solely because the user did not separately authorize the external pass in the same prompt.

Pre-dispatch eligibility is based on installed route presence and sanction, not credential state. Do not run authentication probes before the provider-capable launch; authentication is authoritative only after provider-capable dispatch.

- **Interactive host, default mode:** surface a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model" — not the internal "peer" jargon), names the requested **model and reasoning level** from the in-script mapping, and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes, and states that reviewed code/diff content is sent to that provider. **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model> at <effort>; serving model/effort unverified on this route." Placed with the Stage 3 team announce, not buried after it.
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. After a failure, apply Step 1's retry/disclosure condition. Reconcile target, harness, route, requested model, and actual model from the artifact.
- **Interactive host, no peer resolved** (host serving family un-attestable, no different-provider route installed, or disabled by checkout config): one quiet line that the cross-model pass was skipped and why — name the checkout policy when that is the reason. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that review content was sent cross-model to the named provider, so the third-party data egress is auditable.

## Step 4 — Start the detached peer job before local dispatch

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime** — some harnesses kill long tool calls, which silently vanishes the pass. At the Stage 3d routing boundary, start it as a **detached, supervised job** through the bundled runner in one short Bash call (prints the job id in under ~2s). Only after that call returns may the host finalize the local roster and enter Stage 4. The detached worker still overlaps the local reviewers; binding it first prevents the host from accidentally dispatching the in-process adversarial fallback too.

Before `start`, the orchestrator writes two compact files under `<run-dir>` and never combines their trust domains:

- `adversarial-review-constraints.md` (at most 32 KiB) contains only applicable criteria distilled from the project's active instructions and conventions already in your context. It is additive context for a corroborative peer, not the complete scoped-standards contract; do not load standards solely to expand it. Write `none` when no additional criteria apply. Never copy raw instruction content or user-controlled text into this trusted file.
- `adversarial-review-brief.md` (at most 32 KiB) is untrusted review data: the Stage 2 intent summary; 2-8 material risk divisions chosen from the current file inventory and diff, each with a one-line reason and representative paths or path prefixes; any explicit generated repetition to cover through generator inputs, manifests, tests, and representative outputs; and any cross-division interaction the adversarial lens must test.

The map is agent judgment, not a deterministic directory taxonomy. Do not copy the full file list, diff hunks, or a mechanical extension split into it. On a simple change, one division is enough. The worker places the constraints and map in separate nonce-delimited prompt regions; constraint-like text inside the map remains untrusted data. Missing or oversized constraints stop before provider egress so the in-process adversarial fallback retains the lens. The transport preflight only measures and stages the exact diff outside the prompt; it never cuts semantic shards or chooses or rewrites the orchestrator's divisions.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host):

**Interpreter.** The commands below run a bundled Python script. Resolve the
interpreter in the *same* shell call as the command -- each tool call is a fresh
shell, so a `$PY` set in an earlier call does not persist. Do not hardcode
`python3`: on native Windows it resolves to a Microsoft Store stub that exits
without running Python, and that stub still satisfies `command -v`, so probe
execution rather than presence.

```bash
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
```

**Host command-sandbox boundary.** The detached worker inherits the permission context of the `start` call that launches it. Before executing that exact call, treat `CODEX_SANDBOX_NETWORK_DISABLED` as a positive signal that the current Codex command sandbox cannot reach the provider; unsetting it does not change the sandbox policy. A DNS or authentication failure alone is not proof of that condition. Use the narrowest host permission that restores the fixed route's provider connection. When Codex exposes only full command escalation, attach this request to the exact `peer-job-runner.py start ...` tool call after the existing egress disclosure:

```json
{
  "sandbox_permissions": "require_escalated",
  "justification": "Allow the disclosed read-only cross-model review to send the reviewed diff to the fixed external provider."
}
```

Disclose that this is not launcher-only isolation: the detached worker inherits that launch context for its lifetime, so the adapter's declared read-only/tool restrictions — not the Codex command sandbox — bound the peer while the reviewed material egresses. If the grant is denied or unavailable, do not execute `start`; keep the in-process adversarial reviewer as the fallback and create no peer job. After `start` returns a job id, any network, authentication, or provider failure is a started-job outcome and follows the ordinary terminal/recovery rules; keep `status`, `wait`, `result`, and `reap` sandboxed because they need no provider connection.

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
echo "peer-deadline-secs=$(( ${CROSS_MODEL_HARD_SECS:-1200} + 10 ))";
CE_PEER_HARD_SECS= CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial -- env CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-serving-family>" "<target>" "<base-ref>" "<run-dir>"
```

When Step 1 resolved a configured model or effort, add `CROSS_MODEL_MODEL_OVERRIDE_TARGET="<target>" CROSS_MODEL_MODEL_OVERRIDE="<model>"` and/or `CROSS_MODEL_EFFORT_OVERRIDE="<effort>"` to the `env` prefix after `CROSS_MODEL_FIXED_ROUTE`; omit them when unset.

The nested windows are one budget with one knob, `CROSS_MODEL_HARD_SECS`. The runner derives its supervisor hard window from that ambient knob automatically (`max(1230, knob + 30)`). Clear `CE_PEER_HARD_SECS` on the start prefix (`CE_PEER_HARD_SECS=`) so a stale ambient value from an earlier session or harness export cannot undercut that derivation — an explicit numeric `CE_PEER_HARD_SECS` still wins when a skill deliberately sets one (ce-work / elevation), which this path must not do. Print the orchestrator deadline as `knob + 10` in the same shell as `start` (as above) and use that printed `peer-deadline-secs=<n>` below; never hardcode it, because a literal survives a knob change and then reaps a healthy peer.

**Do not forward `CROSS_MODEL_HARD_SECS` to the worker.** The runner already passes the ambient environment through, so a knob the user actually set reaches the worker on its own. Re-exporting the orchestrator's *resolved* value would convert a fallback into an explicit override and destroy the one distinction the worker still needs: idle-guarded routes (codex + streaming claude/cursor-family) use the raised `HARD_SECS` default, while `grok-cli` keeps the lower `UNGUARDED_HARD_SECS` bound because its `--json-schema` path cannot stream. Forcing one value would silently restore the doubled hang on that hard-only route.

- `<run-id>` = the Stage 3d run id (the same one that forms `<run-dir>`); job state lives under `<run-dir>/jobs/<job-id>/`.
- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned concrete route token from the Step 1 table (`codex`, `claude`, `grok-cli`, `grok-cursor`, `cursor`, or `composer`).
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the absolute Stage 4 run dir. The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

Every persisted job id remains a lifecycle obligation until its worker is terminal and its job directory is deleted before the skill returns. The normal review path discharges that obligation through the single-reap finish and fold-in below. If the local workflow cannot continue to fold-in, reap the peer promptly, perform the final `wait --max-secs 10` because reap is asynchronous, and delete its job directory without reading or folding the result or attempting route recovery.

**Single-reap finish.** The runner detaches the worker into its own supervised session. Capture the epoch time right after `start` (`date +%s`) and do not poll while local reviewers are active. After local returns are collected, check status once. If still running, issue bounded `wait` slices until the job is terminal **or** the shared deadline (`peer-deadline-secs` from the `start` call; 1210s by default) has elapsed since `start` — compare `date +%s` against the anchor before each slice and never begin a slice that would cross the deadline. Size each slice at up to 480s (Luna xhigh runs can legitimately take up to ~419s, so a shorter slice can end before a healthy peer returns), and let the slices repeat: one slice is far shorter than the derived deadline, so capping the *total* wait would reap a healthy peer for exactly the reason this budget was widened. A slice is not a polling turn — do not interleave status reads, shell no-ops, or "still waiting" turns between slices. Fold in the artifact when terminal. At the deadline, `reap <job-id>` and perform one final `wait --max-secs 10` because reap is asynchronous. The script self-bounds (idle timeout 480s; hard backstop `CROSS_MODEL_HARD_SECS`, default 1200s) *inside* that deadline, so deadline reaping is exceptional. Done detection stays presence-keyed: the worker publishes `<run-dir>/adversarial-<provider>.json` only after normalization. The script reads the persona brief and schema from the skill dir and reviews the current work tree against `<base-ref>`. Its large-diff preflight is transport only: it measures and stages the exact diff outside the prompt; the orchestrator chooses the semantic divisions, and the reviewer chooses representatives and evidence within them.

The `start` command's returned job ID is the successful-start receipt. Do not immediately call `status`, inspect `--help`, or otherwise verify that receipt; persist it and continue to local dispatch. Status collection begins only after the local wave completes.

The commands in this reference are the executable contract. Do not inspect or grep the worker script for its model mapping/allowlist, run `CROSS_MODEL_DRY_RUN`, call `--emit-adapter`, or probe runner `--help` before dispatch. Those exploratory calls replay host context and cannot strengthen the runner's enforced route.

After local reviewers complete, the one status read is exactly:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/peer-job-runner.py" status "<job-id>" --json
```

If it is still running and time remains, each `wait` slice is exactly:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs <remaining-slice-secs> --json "<job-id>"
```

Repeat that call until the job is terminal or the derived deadline is spent; do not invent alternate status flags or inspect help.

## Step 5 — Fold into Stage 5

- Read the artifact through the runner's verified read (resolve `$PY` in the same tool call — shells do not persist):

  ```bash
  SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
  PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
  "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" result --path <run-dir>/adversarial-<target>.json
  ```

  Its findings enter ordinary dedup, but agreement promotion is allowed **only when `independence_verified` is `true`**. A false or absent value may contribute findings but never raises confidence. `independence_verified` attests a different serving family; it does not claim the exact served model was verified. `receipt_supported`, `model_actual`, and `effort_actual` carry that separate identity evidence. Peer findings never grant silent-apply authority.
- In final Coverage, name `cross_model_route`, `model_requested`, `effort_requested`, `receipt_supported`, `model_actual`, `effort_actual`, and `independence_verified` from the artifact. Keep the literal `unverified`; never compress a request into a serving claim such as "via Codex high" when actual model or effort is unverified.
- **Never started / not run** — the job was never started (gates not met, disabled by checkout config, host un-attestable, no different-provider route installed, or CLI missing): the pass simply didn't run. Note "cross-model pass: not run" in Coverage for human-facing markdown — or "cross-model pass: disabled by checkout config" when Step 1's egress policy was the reason; stay silent in `mode:agent`. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- **Dispatch-infrastructure failure** — the runner or worker itself crashed: a non-zero exit before any job starts, a preflight/detach failure, or an unresolved `$SKILL_DIR`/script path. This is distinct from the gate-not-met skips above (there, no dispatch was attempted), so do not fold it into the silent not-run bucket on the first error. The two failure shapes recover at different points. A **no-job-id** preflight failure (exit before any job id, unresolved `$SKILL_DIR`) is recovered entirely at **Stage 3d's no-job branch**, before the local roster is materialized — the only point where re-running the start can still recover cross-model corroboration and, failing that, cleanly fall to the in-process reviewer (which then covers the lens; only corroboration is lost). Do **not** re-attempt that case here at fold-in: Stage 4 may already have dispatched the in-process `adversarial-reviewer`, so a fold-in peer re-run would put both on the same brief and violate the exclusive routing boundary. This step handles only the **job-id-returned-then-failed** crash — its failed job is reaped here and the in-process reviewer is already gone. For it, re-run the **same resolved fixed route** by hand — holding the target and model, the `git diff <base-ref>` read scope, and the adversarial persona brief fixed — while each failure is a new, plausibly recoverable one and the shared peer deadline holds. This is a same-route retry, deliberately distinct from the quota rule below, which requires a newly disclosed route. Stop once a failure repeats or the deadline is spent; the hand recovery is then the adversarial lens's only cover, so the Coverage line must report the adversarial lens as **degraded**, not merely cross-model corroboration lost. A hand recovery may not substitute a different target or provider, widen the read scope, or relax the read-only trust boundary — those make the recovered peer untrustworthy, not merely unavailable.
- **Ran but produced no usable output** — the job reached `done` (or any terminal state) yet no `adversarial-<provider>.json` exists (the peer ran and egressed but returned nothing schema-shaped — unparseable output, empty findings the script dropped). Distinct from not-run: note "cross-model pass: peer ran, no usable output" in human-facing markdown Coverage. Never fail the review. When the diagnostic classification below proves this was a no-review outcome, run the did-not-run fallback before treating the lens as covered.
- **Started but not `done`** — the final status read reports `failed`, `timeout`, or `died-without-result` (a job reaped at the shared deadline records `timeout`, with the reap noted in its reason) → still non-blocking, but never silent: name the peer and its terminal state in Coverage (e.g. "cross-model adversarial peer: timeout"). Silent absence stays correct only for passes that never started or were skipped. When the diagnostic classification below proves this was a no-review outcome, run the did-not-run fallback rather than leaving the lens uncovered.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- **Classify the skip reason before deleting.** Read `out.log` before cleanup, including bounded lines prefixed `peer skip evidence:`. Judge the full diagnostic; do not grep for a closed phrase list. Attribute an account authentication failure only after provider-capable dispatch is positively established by the launch context or provider response; then report the observed failure and login or credential-refresh remediation. Without that proof, login-shaped peer text describes only the peer's execution context: a sandboxed host produces the same signal as a genuine logout, so never report it as the user's account being logged out or prompt a login command.
  - Session or usage quota: the peer did not review. Do not retry that route; run the did-not-run fallback.
  - Any authentication-shaped failure: the peer did not review, whether the explanation is credential-attributable or execution-context-only. Attribution changes the explanation, not coverage; run the did-not-run fallback.
  - Transient provider-capacity or rate-limit failure: the worker exclusively owns the one same-route retry under Step 1's exact-overload condition. Once a provider no-review outcome reaches the host, dispatch in-process `adversarial-reviewer`; the host never restarts that peer. Do not run the did-not-run fallback or switch recipients.
  - Max-turn exhaustion: dispatch in-process `adversarial-reviewer`. Do not retry the peer or switch recipients.
  - Anything else: name the observed failure; do not run the did-not-run fallback.
- **Did-not-run fallback** (first no-review outcome, including the first one): the started job did not cover the adversarial lens. Do not retry that same route. Then:
  1. If this is the first replacement attempt, the failed recipient was **not** an explicit user-stated preference (Step 1 item 1), and another attested-different installed+allowlisted target remains: announce that new recipient and start a new job with a new `CROSS_MODEL_FIXED_ROUTE`. Wait for it with the remaining shared deadline and fold its artifact the same way as the first job. That job owns the lens. Never switch recipients inside the worker. If this replacement also ends in a no-review outcome, do not start a third peer; take step 2.
  2. Otherwise (explicit recipient, or no other eligible peer): dispatch in-process `adversarial-reviewer` now. Coverage records the peer as not-run for quota/auth and that the lens used the local fallback.
  A config or default selection is not an explicit user-stated preference. One replacement only; never silently continue to another recipient.
- After fold-in (or after deadline reaping), delete the consumed job directory (`<run-dir>/jobs/<job-id>/`) — its log and result are review content and must not outlive their use.
- A finding sharing a fingerprint with in-process `adversarial` promotes only when the artifact records `independence_verified: true`. Cursor-default artifacts default false; an unattested host skips automatic dispatch.

## Trust boundary (maintainers)

The peer reviews the **current work tree** (read-only) against `git diff <base-ref>`. Reviewed code/diff content is sent to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). `CROSS_MODEL_PEERS` restricts which providers may receive content.

**Isolation differs from ce-doc-review by design.** Doc-review embeds a self-contained document into a tool-less empty scratch. Code-review needs surrounding code context, so peers run **in-tree read-only**:

- **codex:** `-s read-only` with cwd at the repo root (may fetch `git diff` itself).
- **claude:** deny mutators / Bash / Task / `mcp__*`; **Read allowed** for context; diff is embedded because Bash is denied.
- **grok / cursor-agent:** ask/dontAsk + no write/force/yolo; Read allowed; workspace/cwd at the repo root.

Impact is bounded to disclosure, not repo mutation. The script's stderr audit log records each send so the egress is auditable even in `mode:agent`.
