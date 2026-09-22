# Cross-Model Adversarial Pass

Runs the **adversarial** review a second time through a different model (the "peer"), reached over one fixed route, in a read-only process. The peer gets the **same** `references/personas/adversarial-reviewer.md` brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and joins Stage 5 (synthesis) as reviewer `adversarial-<provider>`. Its findings count as independent corroboration, and can promote a finding both reviewers agree on, only when its identity record (the "receipt") says `independence_verified: true`. Otherwise its findings stay in the review as attributed evidence with no promotion bonus.

This pass is **adversarial-only**. No other persona gets a cross-model twin, and there is no whole-diff generalist peer. The pass costs nothing unless Stage 3 (reviewer selection) already selected the adversarial reviewer.

Before any reviewed content leaves the machine, the host picks one concrete route and approves it (this document calls that approval a "sanction"). `scripts/cross-model-adversarial-review.sh` holds to that fixed route, applies read-only controls, captures JSON in the findings-schema shape, and records identity receipts. Before dispatch it makes a conservative estimate of the diff's token count and file count. An oversized diff is not pasted into the prompt: the worker gives the peer the orchestrator's compact semantic review map and keeps the exact diff as a private file the peer can read selectively. Routes with limited tools receive that temp directory as an extra read root; Codex uses selective `git diff <base> -- <path>` calls inside its existing read-only sandbox. A failed route writes no artifact and never switches recipients on its own.

## Run conditions — run only when all hold

1. `adversarial-reviewer` was selected in Stage 3 (reviewer selection), or the Review depth gate chose the focused path, whose one independent read is this lens. Reuse that selection; do not run a costly external CLI on a trivial diff.
2. The working tree is the reviewed head (standalone, `base:`, or `local-aligned` scope). Skip in `pr-remote` / `branch-remote`: the peer reviews the local tree, which is not the PR or branch head.

## Step 1 — Attest host identity, then sanction one fixed route

Keep requested **target**, CLI **harness/intermediary**, serving **family/provider**, and served model separate. `cursor` means `cursor-agent` with its configured default/Auto model and no `--model` flag. `composer` means an explicit Composer-family model through Cursor. `grok` prefers its native CLI; Grok through Cursor is a distinct route and recipient.

Attest both the host harness and its serving family:

```bash
if [ "${CLAUDECODE:-}" = "1" ]; then XHOST_HARNESS=claude; XHOST_FAMILY=claude;
elif [ -n "${CODEX_SANDBOX:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}" ]; then XHOST_HARNESS=codex; XHOST_FAMILY=codex;
elif [ "${GROK_AGENT:-}" = "1" ] || [ -n "${GROK_SESSION_ID:-}" ]; then XHOST_HARNESS=grok; XHOST_FAMILY=grok;
elif [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST_HARNESS=cursor; XHOST_FAMILY=unknown;
elif [ -n "${OPENCODE_TERMINAL:-}" ]; then XHOST_HARNESS=opencode; XHOST_FAMILY=unknown;
else XHOST_HARNESS=unknown; XHOST_FAMILY=unknown; fi
```

Pass `XHOST_HARNESS` as `CROSS_MODEL_HOST_HARNESS`; pass `XHOST_FAMILY` as the first worker argument. The snippet is evidence, not the verdict: it resolves the harnesses whose environment markers it already names, and where it yields `unknown` on a harness you can identify from your own runtime, attest what you know instead. A harness the snippet does not name needs no new branch here. Both tokens must be peer keys the worker accepts, never a provider's company name. Family is `codex`, `claude`, `grok`, `composer`, or `unknown`. Harness is `codex`, `claude`, `grok`, `cursor`, `opencode`, or `unknown`. A company name such as `anthropic`, `openai`, or `xai` in either slot makes the worker refuse the job and write no artifact.

Cursor is the one harness where your own knowledge cannot fill in the family, because the Cursor harness does not decide which model serves it. Keep family `unknown` unless an observable attestation of the serving family supplies `codex`, `claude`, `grok`, or `composer`. Never infer serving family from the Cursor brand. An unknown host family cannot pass the automatic same-family check, so skip the automatic cross-model pass.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

**Checkout policy on sending content out — evaluate first.** Read `cross_model_review_mode:` from the same two repo CE config files under the ordinary-key rule. Valid values are `auto` (default) and `off`; anything else is invalid and continues to the next layer, then `auto`. When it resolves to `off`, skip the automatic cross-model pass here, before peer resolution, disclosure, or any job start. The one exception is when the user explicitly asked for a cross-model peer for this run in conversation; a `cross_model_peer` value or a project-instruction preference is not that opt-in. Record the skip reason as **disabled by checkout config**, which is a different reason from an un-attestable host or an unavailable or non-independent route. The in-process `adversarial-reviewer` keeps the lens exactly as it does for any peer that never started. A live user prohibition still overrides `auto`. This pass's skip and target-selection keys are `cross_model_review_mode` and `cross_model_peer`. Missing files or unset keys take the default auto route; they are not a skip. Another skill's engine preference is not this gate. Model and effort overrides stay with the bound target as the reference states.

Resolve the preference in this order:

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` from the two repo CE config files (`config.local.yaml` then `config.yaml`). Apply the ordinary-key rule: first active supported target wins; an invalid value continues to the next layer, then step 3.
3. A preference already in your **project instructions** (the active instructions in your context) — consumed from context, **never** read from a named file.
4. **Default:** first available attested-different target in `codex → claude → grok → composer`; Cursor-default participates only when explicitly preferred.

Before any content is sent, resolve the target to one concrete installed route, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. `CROSS_MODEL_PEERS` is an optional egress restriction, not a required approval. When it is set, every recipient (target and intermediary) must be allowed by it under the alias rule below, and a recipient it does not allow is a named skip. Otherwise, when it is unset or empty, no recipient is filtered and the pass proceeds; invoking this skill plus the disclosure made before sending is the approval. Do not inspect the worker source to rediscover this; it implements exactly this contract. `CROSS_MODEL_FIXED_ROUTE` accepts exactly these tokens. The worker refuses anything else and writes no artifact, including route-shaped guesses like `codex-cli`:

| Target | Route token(s) |
|--------|----------------|
| `codex` | `codex` |
| `claude` | `claude` |
| `grok` | `grok-cli` (native CLI) or `grok-cursor` (via Cursor intermediary) |
| `cursor` | `cursor` |
| `composer` | `composer` |
| `opencode` | `opencode` |

The host harness does not choose the Grok route. Target `grok` binds `grok-cli` when that CLI is installed. Bind `grok-cursor` only when the user asked for Grok through Cursor, or when the grok CLI is absent and Cursor is a sanctioned recipient.

A failed route returns no artifact and never changes provider or intermediary on its own. Retrying the same resolved route retains its existing sanction and disclosure; changing the route or any recipient requires a new resolution, sanction, and disclosure before dispatch. The worker may repeat that same route once only after an exact provider-overload 529; it keeps the recipient, model, scope, and shared peer deadline fixed. For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting Cursor-default requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor.

**Checkout-configured model and effort.** After the target is resolved, read `cross_model_model:` and `cross_model_effort:` from the same two repo CE config files under the ordinary-key rule. When `cross_model_model` is set, pass `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<resolved-target>` and `CROSS_MODEL_MODEL_OVERRIDE=<value>`; when `cross_model_effort` is set, pass `CROSS_MODEL_EFFORT_OVERRIDE=<value>`. Both ride the `env` prefix of the start invocation below. The worker checks each value against the route it actually runs. A model must belong to the resolved target's own family: an alias such as `fable` or a full id such as `claude-opus-5-5` for `claude`; `gpt-*` for `codex`, optionally namespace-qualified such as `openai.gpt-6-sol` when that CLI routes through a non-default `model_provider`. An effort must be a level that CLI documents. cursor-agent routes accept no effort override. An incompatible value stops the pass with a named skip reason; the worker never substitutes. Unset keys leave the script's editorial mapping unchanged. Announce the configured model and effort in the Step 3 (Announce) line exactly as requested. A model or effort the user states in conversation outranks the config keys.

Preferred mappings run first. Only after an observed unavailable, obsolete, or incompatible model may the host choose the closest compatible same-target/same-family replacement. Bind it with `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, leak an override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + reasoning tier (defined in the script)

The peer runs on **one editorially selected model and reasoning tier per provider**. The concrete model IDs and route effort flags live in one mapping in `scripts/cross-model-adversarial-review.sh`; this reference does not repeat them. Claude Opus currently uses high; Codex and native Grok use extra-high; cursor-agent routes use their model-implied tier or ceiling. Users choose the peer target, and may pin that target's model and effort through `cross_model_model` / `cross_model_effort` (Step 1); the script validates and never substitutes. Never inherit a harness-configured default model. A lower tier is adopted only after an eval shows it finds the same issues, never from cost alone.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

Invoking ce-code-review is the authorization for the selected, configured, and allowlisted route once this disclosure is made. The announcement is a notice, not a second confirmation prompt. Skip only for an explicit user prohibition, a checkout `cross_model_review_mode: off` without a live opt-in, or an observed scope, allowlist, or route failure. Never skip solely because the user did not separately authorize the external pass in the same prompt.

Pre-dispatch eligibility is based on installed route presence and sanction, not credential state. Do not run authentication probes before the provider-capable launch; authentication is authoritative only after provider-capable dispatch.

- **Interactive host, default mode:** print a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model", not the internal "peer" jargon). The line names the requested **model and reasoning level** from the in-script mapping, and states that reviewed code/diff content is sent to that provider. For cursor-agent routes it names **the route as well as the model**, because two different models can arrive over the *same* `cursor-agent` CLI. **One disclosure condition governs the announce and every later mention of the peer:** name it by target and requested model and effort, as a request ("requested <model> at <effort>"), never as a claim that this model served. Add a serving caveat only when a receipt disagrees with the request, or when the route requested no model (Cursor default/Auto says "serving model unverified"). A receipt-less route with a requested model gets no caveat: `model_actual: unverified` means no receipt, not an unknown model. Place the line with the Stage 3 team announce, not buried after it.
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. After a failure, apply Step 1's retry/disclosure condition. Reconcile target, harness, route, requested model, and actual model from the artifact.
- **Interactive host, no peer resolved** (host serving family un-attestable, no different-provider route installed, or disabled by checkout config): one quiet line that the cross-model pass was skipped and why. Name the checkout policy when that is the reason. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still writes a one-line stderr audit log per send saying that review content was sent cross-model to the named provider, so the transfer to a third party is auditable.

## Step 4 — Start the detached peer job before local dispatch

The script is a CLI shell-out, not a subagent, so it does not consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime.** Some harnesses kill long tool calls, and a killed call makes the pass vanish silently. At Stage 3d (routing), start it as a **detached, supervised job** through the bundled runner in one short Bash call; the call prints the job id in under about 2s. Only after that call returns may the host finalize the local reviewer roster and enter Stage 4 (dispatch). The detached worker still runs alongside the local reviewers; starting it first prevents the host from also dispatching the in-process adversarial reviewer by mistake.

Before `start`, the orchestrator writes two compact files under `<run-dir>` and never combines their trust domains:

- `adversarial-review-constraints.md` (at most 32 KiB) contains only applicable criteria distilled from the project's active instructions and conventions already in your context. It is additive context for a corroborative peer, not the complete scoped-standards contract; do not load standards solely to expand it. Write `none` when no additional criteria apply. Never copy raw instruction content or user-controlled text into this trusted file.
- `adversarial-review-brief.md` (at most 32 KiB) is untrusted review data: the Stage 2 intent summary; 2-8 material risk divisions chosen from the current file inventory and diff, each with a one-line reason and representative paths or path prefixes; any explicit generated repetition to cover through generator inputs, manifests, tests, and representative outputs; and any cross-division interaction the adversarial lens must test.

The map is your judgment, not a mechanical directory listing. Do not copy the full file list, diff hunks, or a split by file extension into it. On a simple change, one division is enough. The worker places the constraints and the map in separate prompt regions, each delimited by a nonce; constraint-like text inside the map remains untrusted data. Missing or oversized constraints stop before provider egress so the in-process adversarial fallback retains the lens. The transport preflight only measures the exact diff and stages it outside the prompt; it never cuts semantic shards, and it never chooses or rewrites the orchestrator's divisions.

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

**Host command-sandbox boundary.** The detached worker inherits the permission context of the `start` call that launches it. Before executing that exact call, treat `CODEX_SANDBOX_NETWORK_DISABLED` as a positive signal that the current Codex command sandbox cannot reach the provider; unsetting it does not change the sandbox policy. A DNS or authentication failure alone is not proof of that condition. Use the narrowest host permission that restores the fixed route's provider connection. When Codex exposes only full command escalation, attach this request to the exact `peer-job-runner.py start ...` tool call after the existing disclosure that reviewed content leaves the machine:

```json
{
  "sandbox_permissions": "require_escalated",
  "justification": "Allow the disclosed read-only cross-model review to send the reviewed diff to the fixed external provider."
}
```

Disclose that this is not launcher-only isolation: the detached worker inherits that launch context for its lifetime, so the adapter's declared read-only/tool restrictions, not the Codex command sandbox, are what bound the peer while the reviewed material is sent out. If the grant is denied or unavailable, do not execute `start`; keep the in-process adversarial reviewer as the fallback and create no peer job. After `start` returns a job id, any network, authentication, or provider failure is a started-job outcome and follows the ordinary terminal/recovery rules; keep `status`, `wait`, `result`, and `reap` sandboxed because they need no provider connection.

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
echo "peer-deadline-secs=$(( ${CROSS_MODEL_HARD_SECS:-1200} + 10 ))";
CE_PEER_HARD_SECS= CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial -- env CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-serving-family>" "<target>" "<base-ref>" "<run-dir>"
```

When Step 1 resolved a configured model or effort, add `CROSS_MODEL_MODEL_OVERRIDE_TARGET="<target>" CROSS_MODEL_MODEL_OVERRIDE="<model>"` and/or `CROSS_MODEL_EFFORT_OVERRIDE="<effort>"` to the `env` prefix after `CROSS_MODEL_FIXED_ROUTE`; omit them when unset.

The three nested time windows are one budget controlled by one setting (the "knob"), `CROSS_MODEL_HARD_SECS`. The runner derives its supervisor hard window from that ambient knob automatically (`max(1230, knob + 30)`). Clear `CE_PEER_HARD_SECS` on the start prefix (`CE_PEER_HARD_SECS=`) so a stale value left in the environment by an earlier session or a harness export cannot undercut that derivation. An explicit numeric `CE_PEER_HARD_SECS` still wins when a skill deliberately sets one (ce-work / elevation); this path must not set one. Print the orchestrator deadline as `knob + 10` in the same shell as `start` (as above) and use that printed `peer-deadline-secs=<n>` below. Never hardcode it: a literal survives a knob change and then reaps a healthy peer.

**Do not forward `CROSS_MODEL_HARD_SECS` to the worker.** The runner already passes the ambient environment through, so a knob the user actually set reaches the worker on its own. Re-exporting the orchestrator's *resolved* value would turn a fallback into an explicit override and erase the one distinction the worker still needs: idle-guarded routes (codex + streaming claude/cursor-family) use the raised `HARD_SECS` default, while `grok-cli` keeps the lower `UNGUARDED_HARD_SECS` bound because its `--json-schema` path cannot stream. Forcing one value would silently bring back the doubled hang on that hard-only route.

- `<run-id>` = the Stage 1b run id (the same one that forms `<run-dir>`); job state lives under `<run-dir>/jobs/<job-id>/`.
- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is one of `codex`, `claude`, `grok`, `cursor`, `composer`, or `opencode`; `<fixed-route>` is its already-sanctioned concrete route token from the Step 1 table (`codex`, `claude`, `grok-cli`, `grok-cursor`, `cursor`, `composer`, or `opencode`).
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the absolute Stage 4 run dir. The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

Every persisted job id remains a lifecycle obligation until its worker is terminal and its job directory is deleted before the skill returns. The normal review path meets that obligation through the single-reap finish and fold-in below. If the local workflow cannot continue to fold-in, reap the peer promptly, perform the final `wait --max-secs 10` because reap is asynchronous, and delete its job directory without reading or folding the result or attempting route recovery.

**Single-reap finish.** The runner detaches the worker into its own supervised session. Capture the epoch time right after `start` (`date +%s`) and do not poll while local reviewers are active. After local returns are collected, check status once. If the job is still running, issue bounded `wait` slices until the job is terminal **or** the shared deadline (`peer-deadline-secs` from the `start` call; 1210s by default) has elapsed since `start`. Compare `date +%s` against the captured start time before each slice, and never begin a slice that would cross the deadline. Size each slice at up to 480s (Luna xhigh runs can legitimately take up to ~419s, so a shorter slice can end before a healthy peer returns), and let the slices repeat: one slice is far shorter than the derived deadline, so capping the *total* wait would reap a healthy peer for exactly the reason this budget was widened. A slice is not a polling turn. Do not interleave status reads, shell no-ops, or "still waiting" turns between slices. Fold in the artifact when the job is terminal. At the deadline, `reap <job-id>` and perform one final `wait --max-secs 10` because reap is asynchronous. The script limits its own runtime (idle timeout 480s; hard backstop `CROSS_MODEL_HARD_SECS`, default 1200s) *inside* that deadline, so reaping at the deadline is the exception. Done is detected by the file's presence: the worker publishes `<run-dir>/adversarial-<provider>.json` only after normalization. The script reads the persona brief and schema from the skill dir and reviews the current work tree against `<base-ref>`. Its large-diff preflight is transport only: it measures the exact diff and stages it outside the prompt; the orchestrator chooses the semantic divisions, and the reviewer chooses representatives and evidence within them.

The job ID that `start` returns is the proof that the start succeeded. Do not immediately call `status`, inspect `--help`, or otherwise verify it; persist it and continue to local dispatch. Status collection begins only after the local wave completes.

The commands in this reference are the executable contract. Do not inspect or grep the worker script for its model mapping or allowlist, run `CROSS_MODEL_DRY_RUN`, call `--emit-adapter`, or probe runner `--help` before dispatch. Those exploratory calls only replay host context and cannot strengthen the route the runner enforces.

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
  "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" result "<job-id>" --path <run-dir>/adversarial-<target>.json
  ```

  The runner checks that it owns the file descriptor and bounds the read. Exit 0 emits the artifact. Exit 2 means the job is still running, so the deadline loop above was left early; return to it rather than classifying. Exit 3 is the only outcome that means the peer produced nothing; it names the job's state, and at that point read `references/cross-model-recovery.md` and follow the branch that matches that state, since it alone owns what happens when the peer yielded no usable artifact. Any other exit means the runner could not complete the read: a trust failure on the artifact or on the job's own state, or a job id that did not resolve. None of those has a recovery branch. Name the failure in Coverage as a degraded cross-model pass, and never fold it into the silent skip.

  Its findings enter ordinary dedup, but agreement promotion is allowed **only when `independence_verified` is `true`**. A false or absent value may contribute findings but never raises confidence. `independence_verified` attests a different serving family; it does not claim the exact served model was verified. `receipt_supported`, `model_actual`, and `effort_actual` carry that separate identity evidence. Peer findings never grant silent-apply authority.
- In final Coverage, name `cross_model_route`, `model_requested`, `effort_requested`, `receipt_supported`, `model_actual`, `effort_actual`, and `independence_verified` from the artifact. Keep the literal `unverified`; never compress a request into a serving claim such as "via Codex high" when actual model or effort is unverified. The disclosure condition above decides how the peer is named in the report.
- **Never started / not run** — the job was never started (run conditions not met, disabled by checkout config, host un-attestable, no different-provider route installed, or CLI missing): the pass simply didn't run. Note "cross-model pass: not run" in Coverage for human-facing markdown — or "cross-model pass: disabled by checkout config" when Step 1's checkout policy was the reason; stay silent in `mode:agent`. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- After fold-in (or after deadline reaping), delete the consumed job directory (`<run-dir>/jobs/<job-id>/`). Its log and result are review content and must not outlive their use.
- A finding sharing a fingerprint with in-process `adversarial` promotes only when the artifact records `independence_verified: true`. Cursor-default artifacts default false; an unattested host skips automatic dispatch.
