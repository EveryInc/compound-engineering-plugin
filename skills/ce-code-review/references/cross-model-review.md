# Cross-Model Adversarial Pass

Runs the **adversarial** review through one separately routed model target in a read-only process. The peer gets the **same** `references/personas/adversarial-reviewer.md` brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into Stage 5 as reviewer `adversarial-<provider>`. It counts as independent corroboration and can promote agreement only when its receipt records `independence_verified: true`; otherwise it remains attributed review evidence without a promotion bonus.

This pass is **adversarial-only**. No other persona gets a cross-model twin, and there is no whole-diff generalist peer. Cost stays gated on the existing Stage 3 adversarial selection.

The host resolves and sanctions one concrete route before egress; `scripts/cross-model-adversarial-review.sh` enforces that fixed route, applies read-only controls, captures schema-shaped JSON, and records identity receipts. Before dispatch it conservatively estimates diff tokens and file count. Oversized diffs are not inlined: the peer receives **risk-sampled corroboration**, not whole-change-set coverage, through at most two bounded material risk divisions. The exact diff stays private and selectively readable. Tool-limited routes receive that temp directory as an additional read root; Codex uses selective `git diff <base> -- <path>` calls under its existing read-only sandbox. A failed route writes no findings artifact and never switches recipients internally.

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

Apply same-family exclusion to every preference source, not only the default: if the preferred target's serving family equals the attested host family, skip it and continue to the next eligible attested-different target. An explicit preference cannot waive the independent-review boundary.

Before egress, resolve the target to one concrete installed route, verify every recipient against `CROSS_MODEL_PEERS`, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. `CROSS_MODEL_FIXED_ROUTE` accepts exactly these tokens — the worker fail-closes on anything else (including route-shaped guesses like `codex-cli`):

| Target | Route token(s) |
|--------|----------------|
| `codex` | `codex` |
| `claude` | `claude` |
| `grok` | `grok-cli` (native CLI) or `grok-cursor` (via Cursor intermediary) |
| `cursor` | `cursor` |
| `composer` | `composer` |

A failed route returns no artifact and never changes provider or intermediary internally. A retry is a new disclosed and sanctioned dispatch. For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting Cursor-default requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor.

`CROSS_MODEL_PEERS` is an optional restriction: when unset, it leaves the resolved route unfiltered and this skill invocation plus the concrete pre-egress disclosure sanctions that route; when set, the selected target/intermediary must appear. Use this contract directly. Do not inspect the worker source to rediscover its allowlist behavior.

Preferred mappings run first. Only after an observed unavailable, obsolete, or incompatible model may the host choose the closest compatible same-target/same-family replacement. Bind it with `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, leak an override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + reasoning tier (owned by the script)

The peer runs on **one editorially selected model and reasoning tier per provider**. The concrete mapping stays owned by `scripts/cross-model-adversarial-review.sh`. After fixing the route and before announcing or dispatching, obtain the mapping through the worker's read-only receipt command; do not inspect source or reconstruct it:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
CROSS_MODEL_MODEL_OVERRIDE_TARGET="<override-target-or-empty>" CROSS_MODEL_MODEL_OVERRIDE="<override-model-or-empty>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" --emit-route-receipt "<fixed-route>"
```

Use its `model_requested`, `effort_requested`, route, target, harness, and `receipt_supported` fields for the pre-egress announcement and persisted initial tuple. When Step 1 selected a compatible override, pass the same override pair to this receipt command, the initial runner environment, and any retry; an empty pair means no override. Users choose the peer target, not an arbitrary model/effort matrix. Never inherit a harness-configured default model. A lower tier is adopted only after a discriminating effectiveness eval, never from cost alone.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

The ce-code-review invocation authorizes the selected configured/allowlisted route after this disclosure. The announce is a transparent notice, not a second confirmation gate. Skip for an explicit user prohibition or an observed scope/allowlist/route/authentication failure, never solely because the user did not separately authorize the external pass in the same prompt.

- **Interactive host, default mode:** surface a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model" — not the internal "peer" jargon), names the requested **model and reasoning level** from the in-script mapping, and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes, and states that reviewed code/diff content is sent to that provider. **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model> at <effort>; serving model/effort unverified on this route." Placed with the Stage 3 team announce, not buried after it.
  - Call the pass **independent** only when host and target serving families are attestably different. Cursor default/Auto is unverified because its serving family is unknown. Receiptless Composer through Cursor also records `model_actual: unverified`, `serving_family: unknown`, and `independence_verified: false`; call either route a cross-harness review and do not promise agreement promotion.
  - Announce the one fixed route and every recipient before dispatch. Infrastructure recovery may reuse the same sanctioned route. A productive scope timeout may retry once only on that same route, model, base, and hard cap with a materially narrower brief; it is not a recipient-changing dispatch. Any other recipient-changing retry requires new disclosure and sanction. Reconcile target, harness, route, requested model, and actual model from the artifact.
- **Interactive host, no peer resolved** (host serving family un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that review content was sent cross-model to the named provider, so the third-party data egress is auditable.

## Step 4 — Start the detached peer job before local dispatch

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime** — some harnesses kill long tool calls, which silently vanishes the pass. At the Stage 3d routing boundary, start it as a **detached, supervised job** through the bundled runner in one short Bash call (prints the job id in under ~2s). Only after that call returns may the host finalize the local roster and enter Stage 4. The detached worker still overlaps the local reviewers; binding it first prevents the host from accidentally dispatching the in-process adversarial fallback too.

Before `start`, the orchestrator prepares a structured scope with `scripts/cross-model-scope.mjs`, which writes `<run-dir>/adversarial-review-scope.json` and the derived `<run-dir>/adversarial-review-brief.md`. The scope is compact, semantic, and bounded:

- the Stage 2 intent summary and `coverage_mode` (`normal` or `oversized`);
- one or more material risk divisions for a normal-size diff, capped at two only for an oversized diff;
- for each division: one failure question or invariant, one to three representative path prefixes, and either explicit exclusions or one bounded dependency-expansion rule;
- at most one cross-division interaction;
- generated repetition identified for representative coverage through generator inputs, manifests, tests, and selected outputs.

The selected divisions and paths are the peer's review boundary, not starting points for whole-change enumeration. Unselected changed files remain covered by the canonical in-process reviewer roster. This map is agent judgment, not a deterministic directory taxonomy. Do not copy the full file list, diff hunks, or a mechanical extension split into it. The worker embeds the derived brief when present; its transport preflight only measures and stages the exact diff outside the prompt. It never invents, widens, or rewrites the orchestrator's divisions.

Write a private JSON input with the fields above, then run this self-contained fence. Do not hand-write the derived Markdown brief:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
NODE="$(for c in node nodejs; do command -v "$c" >/dev/null 2>&1 && "$c" -e '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$NODE" ] || { echo "no working Node runtime on PATH" >&2; exit 1; };
"$NODE" "$SKILL_DIR/scripts/cross-model-scope.mjs" prepare --input "<run-dir>/adversarial-review-scope-input.json" --scope-out "<run-dir>/adversarial-review-scope.json" --brief-out "<run-dir>/adversarial-review-brief.md"
```

For the one productive-timeout retry, write a one-division retry input with the same `coverage_mode`, intent, division ID, and failure question, plus a new `focus` string that states the narrower sub-question. Run the same fence with `--parent "<run-dir>/adversarial-review-scope.json"`, `--scope-out "<run-dir>/adversarial-review-retry-scope.json"`, and `--brief-out "<run-dir>/adversarial-review-retry-brief.md"`. When the original division has multiple paths, retain a strict subset; for a single-path division, retain that path and narrow the ask through the required distinct focus. Exclusions can only increase, dependency expansion cannot change, and interactions are forbidden. The helper derives the brief and rejects scope widening.

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

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
echo "peer-deadline-secs=$(( ${CROSS_MODEL_HARD_SECS:-1200} + 10 ))";
CE_PEER_HARD_SECS= CROSS_MODEL_MODEL_OVERRIDE_TARGET="<override-target-or-empty>" CROSS_MODEL_MODEL_OVERRIDE="<override-model-or-empty>" CROSS_MODEL_SCOPE_FILE="<run-dir>/adversarial-review-scope.json" CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial -- env CROSS_MODEL_MODEL_OVERRIDE_TARGET="<override-target-or-empty>" CROSS_MODEL_MODEL_OVERRIDE="<override-model-or-empty>" CROSS_MODEL_SCOPE_FILE="<run-dir>/adversarial-review-scope.json" CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-serving-family>" "<target>" "<base-ref>" "<run-dir>"
```

The nested windows are one budget with one knob, `CROSS_MODEL_HARD_SECS`. The runner derives its supervisor hard window from that ambient knob automatically (`max(1230, knob + 30)`). Clear `CE_PEER_HARD_SECS` on the start prefix (`CE_PEER_HARD_SECS=`) so a stale ambient value from an earlier session or harness export cannot undercut that derivation — an explicit numeric `CE_PEER_HARD_SECS` still wins when a skill deliberately sets one (ce-work / elevation), which this path must not do. Print the orchestrator deadline as `knob + 10` in the same shell as `start` (as above) and use that printed `peer-deadline-secs=<n>` below; never hardcode it, because a literal survives a knob change and then reaps a healthy peer.

**Do not forward `CROSS_MODEL_HARD_SECS` to the worker.** The runner already passes the ambient environment through, so a knob the user actually set reaches the worker on its own. Re-exporting the orchestrator's *resolved* value would convert a fallback into an explicit override and destroy the one distinction the worker still needs: idle-guarded routes (codex + streaming claude/cursor-family) use the raised `HARD_SECS` default, while `grok-cli` keeps the lower `UNGUARDED_HARD_SECS` bound because its `--json-schema` path cannot stream. Forcing one value would silently restore the doubled hang on that hard-only route.

- `<run-id>` = the Stage 3d run id (the same one that forms `<run-dir>`); job state lives under `<run-dir>/jobs/<job-id>/`.
- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned concrete route token from the Step 1 table (`codex`, `claude`, `grok-cli`, `grok-cursor`, `cursor`, or `composer`).
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the absolute Stage 4 run dir. The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

- `<run-dir>/adversarial-review-scope.json` is the initial scope artifact. Pass its absolute path to the worker as `CROSS_MODEL_SCOPE_FILE`; the worker validates it before egress, derives the peer-visible authorized path set and scoped diff from it, and uses it for bounded timeout evidence. It is never a findings source.

**Single-reap finish.** The runner detaches the worker into its own supervised session. Capture the epoch time right after `start` (`date +%s`) and do not poll while local reviewers are active. After local returns are collected, check status once. If still running, issue bounded `wait` slices until the job is terminal **or** the shared deadline (`peer-deadline-secs` from the `start` call; 1210s by default) has elapsed since `start` — compare `date +%s` against the anchor before each slice and never begin a slice that would cross the deadline. Size each slice at up to 480s (Luna xhigh runs can legitimately take up to ~419s, so a shorter slice can end before a healthy peer returns), and let the slices repeat: one slice is far shorter than the derived deadline, so capping the *total* wait would reap a healthy peer for exactly the reason this budget was widened. A slice is not a polling turn — do not interleave status reads, shell no-ops, or "still waiting" turns between slices. Fold in the artifact when terminal. At the deadline, `reap <job-id>` and perform one final `wait --max-secs 10` because reap is asynchronous. The script self-bounds (idle timeout 480s; hard backstop `CROSS_MODEL_HARD_SECS`, default 1200s) *inside* that deadline, so deadline reaping is exceptional. Done detection stays presence-keyed: the worker publishes `<run-dir>/adversarial-<provider>.json` only after normalization. The script reads the persona brief and schema from the skill dir and reviews the current work tree against `<base-ref>`. Its large-diff preflight is transport only: it measures and stages the exact diff outside the prompt; the orchestrator chooses the semantic divisions, and the reviewer chooses representatives and evidence within them.

The `start` command's returned job ID is the successful-start receipt. Do not immediately call `status`, inspect `--help`, or otherwise verify that receipt; persist it and continue to local dispatch. Status collection begins only after the local wave completes.

The commands in this reference are the executable contract. Do not inspect or grep the worker script for its model mapping/allowlist, run `CROSS_MODEL_DRY_RUN`, call `--emit-adapter`, or probe runner `--help` before dispatch. Those exploratory calls replay host context and cannot strengthen the runner's enforced route.
**No-job same-route recovery.** If `start` exits nonzero or prints no job ID, rerun that exact `start` fence at most once while the derived deadline remains. Keep the same run ID, target, fixed route, model override pair, scope file, base ref, and hard-cap environment; do not regenerate the scope or resolve another recipient. If the second start also returns no job ID, stop recovery and use the already-selected local adversarial fallback. A successful job ID ends recovery immediately and owns the adversarial lens.


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
- In final Coverage, name `cross_model_route`, `model_requested`, `effort_requested`, `receipt_supported`, `model_actual`, `effort_actual`, and `independence_verified` from the artifact. Also name `coverage_mode`, `scope_digest`, and the sampled division IDs from the validated scope artifact. For `coverage_mode=oversized`, explicitly label the result as sampled corroboration; an empty findings array means no additional issues in the sampled divisions, not a whole-change clean bill. Keep the literal `unverified`; never compress a request into a serving claim such as "via Codex high" when actual model or effort is unverified.
- **Never started / not run** — the job was never started (gates not met, host un-attestable, no different provider reachable, CLI missing/unauthed): the pass simply didn't run. Note "cross-model pass: not run" in Coverage for human-facing markdown; stay silent in `mode:agent`. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- **Ran but produced no usable output** — the job reached `done` yet no `adversarial-<provider>.json` exists. Inspect the bounded `adversarial-<provider>-progress.json` sidecar before classifying it. When present, name its exact terminal reason; `productive_scope_timeout` enters the one narrowed-retry branch below. Without a sidecar, note "cross-model pass: peer ran, no usable output" in human-facing markdown Coverage. Progress/event output is non-finding evidence and must never be reconstructed into findings.
- **Started but not `done`, or `done` with a timeout sidecar** — classify `failed`, `timeout`, or `died-without-result` from the runner and the exact semantic reason from `adversarial-<provider>-progress.json`. `idle_timeout`, `hard_timeout`, execution failure, and `unusable_output` are terminal coverage loss. `productive_scope_timeout` is a scope failure: it may trigger at most one same-route retry with the same requested model, effort, base ref, and effective hard cap. The retry uses exactly one original division, preserves its stable failure question, and adds one explicit narrower `focus`. It preserves intent, coverage mode, and dependency expansion, cannot remove exclusions, cannot add interactions, and uses a strict path subset when the original had multiple paths. Prepare it with `cross-model-scope.mjs --parent <initial-scope>` so unrelated or wider scope fails before egress. **Unchanged scope must fail closed. A larger hard cap must fail closed.** Never dispatch the local adversarial twin late. A second timeout is reported and not retried.

  After preparing the mechanically narrower scope, start the only retry with this fixed-route fence. Substitute the persisted initial attempt tuple verbatim; do not re-resolve any value:

  ```bash
  SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
  PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
  echo "peer-deadline-secs=$(( ${CROSS_MODEL_HARD_SECS:-1200} + 10 ))";
  CE_PEER_HARD_SECS= CROSS_MODEL_MODEL_OVERRIDE_TARGET="<same-override-target-or-empty>" CROSS_MODEL_MODEL_OVERRIDE="<same-override-model-or-empty>" CROSS_MODEL_SCOPE_FILE="<run-dir>/adversarial-review-retry-scope.json" CROSS_MODEL_ATTEMPT_LABEL=retry CROSS_MODEL_RETRY_PROGRESS_FILE="<run-dir>/adversarial-<provider>-progress.json" CROSS_MODEL_HOST_HARNESS="<same-host-harness>" CROSS_MODEL_FIXED_ROUTE="<same-fixed-route>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial-retry -- env CROSS_MODEL_MODEL_OVERRIDE_TARGET="<same-override-target-or-empty>" CROSS_MODEL_MODEL_OVERRIDE="<same-override-model-or-empty>" CROSS_MODEL_SCOPE_FILE="<run-dir>/adversarial-review-retry-scope.json" CROSS_MODEL_ATTEMPT_LABEL=retry CROSS_MODEL_RETRY_PROGRESS_FILE="<run-dir>/adversarial-<provider>-progress.json" CROSS_MODEL_HOST_HARNESS="<same-host-harness>" CROSS_MODEL_FIXED_ROUTE="<same-fixed-route>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<same-host-serving-family>" "<same-target>" "<same-base-ref>" "<run-dir>"
  ```

  Persist the retry job ID under the original canonical peer identity. Fold a successful retry's normalized `adversarial-<provider>.json` exactly as the original peer artifact; Coverage additionally names `attempt=retry`, the parent and retry scope digests, and the sampled division. The runner's lifecycle vocabulary remains unchanged.
- **Terminal result is the sole fold-in source.** Only a completed normalized schema-shaped `adversarial-<provider>.json` may contribute findings, residual risks, testing gaps, or confidence promotion. The progress sidecar, event log, heartbeat, and usage record are untrusted non-finding evidence. They may classify productivity and document retry lineage only.
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
