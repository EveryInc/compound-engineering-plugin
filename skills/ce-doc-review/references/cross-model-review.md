# Cross-Model Judgment Pass

Runs ce-doc-review's **conditional judgment lenses** through one separately routed model target in read-only, least-privilege processes. Each peer gets the **same** persona brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into synthesis as reviewer `<reviewer-name>-<provider>`. It counts as independent corroboration and can promote agreement only when its receipt records `independence_verified: true`; otherwise it remains attributed review evidence without a promotion bonus.

The trio is the three **conditional** judgment lenses whose output diverges most across model families: `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer`. The convergent lenses (`coherence`, `scope-guardian`) and the always-on `feasibility` lens do **not** run cross-model — feasibility is excluded specifically so the pass stays conditional and does not spawn on every review.

The host resolves and sanctions one concrete route before egress; the bundled **`scripts/cross-model-doc-review.sh`** enforces that fixed route, composes the prompt, applies least privilege, captures schema-shaped JSON, and normalizes identity receipts. The pass is non-blocking: a failed route writes no fold-in artifact and never switches recipients internally.

## Gate — run only when this holds

Run the cross-model pass for a given trio lens **only when that lens was activated** for this document by the normal Phase 1 persona-selection logic. No new activation triggers are introduced: a routine plan with validated upstream provenance and no high-stakes domain activates none of the trio, so it gets no cross-model pass. The document is already guaranteed readable on disk by Phase 1's missing-document gate — there is no diff and no remote-scope concern, so no additional scope gate is needed.

## Step 1 — Attest host identity, then sanction one fixed route

Keep four identities separate: requested **target**, CLI **harness/intermediary**, serving **family/provider**, and served model. `cursor` means `cursor-agent` with its configured default/Auto model and therefore has no `--model` flag. `composer` means an explicit Composer-family model through `cursor-agent`. `grok` prefers the native Grok CLI; Grok through Cursor is a different route and recipient even though the requested target remains Grok.

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

**Checkout egress policy — evaluate first.** Read `cross_model_review_mode:` from the same two repo CE config files under the ordinary-key rule. Valid values are `auto` (default) and `off`; anything else is invalid and continues to the next layer, then `auto`. When it resolves to `off`, skip the automatic cross-model pass here — before peer resolution, disclosure, or any job start — unless the user explicitly asked for a cross-model peer for this run in conversation (a `cross_model_peer` value or a project-instruction preference is not that opt-in). Record the skip reason as **disabled by checkout config**, distinct from an un-attestable host or an unavailable or non-independent route; each trio lens keeps its in-process twin exactly as it does for any peer that never started, and the whole-document sweep does not run. A live user prohibition still overrides `auto`.

Resolve the preference in this order:

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` from the two repo CE config files (`config.local.yaml` then `config.yaml`). Apply the ordinary-key rule: first active supported target wins; an invalid value continues to the next layer, then step 3.
3. A preference already in your **project instructions** (the active instructions in your context) — consumed from context, **never** read from a named file.
4. **Default:** first available attested-different target in `codex → claude → grok → composer`; Cursor-default participates only when explicitly preferred.

Before content egresses, resolve each selected target to one concrete installed route, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. `CROSS_MODEL_PEERS` is an optional egress restriction, not a required approval: when it is set, every recipient (target and intermediary) must be sanctioned by it under the alias rule below, and an unsanctioned recipient is a named skip; when it is unset or empty, no recipient is filtered and the pass proceeds — this skill invocation plus the pre-egress disclosure is the sanction (in non-interactive mode the invoking skill's request is that sanction and the stderr audit log is the disclosure). Do not inspect the worker source to rediscover this; it implements exactly this contract. `CROSS_MODEL_FIXED_ROUTE` accepts exactly these tokens — the worker fail-closes on anything else (including route-shaped guesses like `codex-cli`):

| Target | Route token(s) |
|--------|----------------|
| `codex` | `codex` |
| `claude` | `claude` |
| `grok` | `grok-cli` (native CLI) or `grok-cursor` (via Cursor intermediary) |
| `cursor` | `cursor` |
| `composer` | `composer` |

The host harness does not choose the Grok route. Target `grok` binds `grok-cli` when that CLI is installed. Bind `grok-cursor` only when the user asked for Grok through Cursor, or when the grok CLI is absent and Cursor is a sanctioned recipient.

A failed dispatched route returns no artifact; it never changes provider or intermediary internally. Retrying the same resolved route retains its existing sanction and disclosure; changing the route or any recipient requires a new resolution, sanction, and disclosure before dispatch. The worker may repeat that same route once only after an exact provider-overload 529; it keeps the recipient, model, scope, and shared peer deadline fixed. For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting a Cursor-default voice itself requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor.

**Checkout-configured model and effort.** After the target is resolved, read `cross_model_model:` and `cross_model_effort:` from the same two repo CE config files under the ordinary-key rule. When `cross_model_model` is set, pass `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<resolved-target>` and `CROSS_MODEL_MODEL_OVERRIDE=<value>`; when `cross_model_effort` is set, pass `CROSS_MODEL_EFFORT_OVERRIDE=<value>`. Both ride the `env` prefix of the start invocation below. The worker validates each against the route it actually runs — a model must be the resolved target's own family (an alias such as `fable` or a full id such as `claude-opus-5` for `claude`; `gpt-*` for `codex`, optionally namespace-qualified such as `openai.gpt-5.6-sol` when that CLI routes through a non-default `model_provider`), an effort must be a level that CLI documents, and cursor-agent routes accept no effort override — and an incompatible value fails the pass closed with a named skip reason rather than substituting. Unset keys leave the script's editorial mapping unchanged. Announce the configured model and effort in the Step 3 line exactly as requested. A model or effort the user states in conversation outranks the config keys.

Preferred model mappings run first. Only after the preferred ID is observed unavailable, obsolete, or incompatible may the host inspect current CLI capabilities and choose the closest compatible **same-target/same-family** replacement. Bind it with both `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, apply one target's override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + reasoning tier (owned by the script)

All activated lenses run on **one model per provider at high reasoning, except Codex on extra-high** (composer's `-fast` tier is its ceiling — accepted exceptions). The concrete model IDs and per-route reasoning flags live in a **single mapping in the script** (`scripts/cross-model-doc-review.sh`, the `M_CODEX`/`M_CLAUDE`/`M_GROK`/`M_GROK_CURSOR`/`M_COMPOSER` constants and the `adapter_argv` builder). A checkout may pin the resolved target's model and effort through `cross_model_model` / `cross_model_effort` (Step 1); the script validates and never substitutes. This reference deliberately does **not** restate the IDs — one source of truth prevents the reference and script from drifting. The IDs are the current instance of the tier principle (a single maintenance point), not the contract.

The **persona file** basename and the **reviewer name** are distinct: the script reads the brief from `references/personas/<persona-file>.md` but forces the fold-in `reviewer` field to `<reviewer-name>-<provider>` so agreement matches the in-process persona's short name. The script derives the persona-file from the allowlisted reviewer-name — it is **not** a caller argument, so no caller value reaches the brief-read path.

## Step 3 — Announce

Pre-dispatch eligibility is based on installed route presence and sanction, not credential state. Do not run authentication probes before the provider-capable launch; authentication is authoritative only after provider-capable dispatch.

- **Interactive host, default interactive mode:** surface a **prominent standalone line** that frames it as an **independent cross-model review** of the judgment lenses (say "cross-model" / "independent model" — not the internal "peer" jargon), names the concrete **model and reasoning level** from the in-script mapping (e.g. GPT-5.6-luna at extra-high reasoning, Opus at high, Grok 4.6 at high, Composer 2.5-fast), and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes so Grok-4.6-via-cursor-agent, Composer-via-cursor-agent, and Grok-4.6-via-the-grok-CLI are unambiguous, **and states that full document content is sent to that provider** (third-party egress; for cursor-agent routes the egress is to Cursor *plus* the serving provider). **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model>; serving model unverified on this route" instead of asserting the concrete model. Placed with the Phase 2 team announce, not buried after it. Wording is yours; the falsifiable requirements: prominent, reads as a **cross-model reviewer** (not a generic persona), names the requested model (with the unverified marker on receipt-less routes), names the route when it is cursor-agent, names the egress. Example: `🔀 Cross-model pass — the judgment lenses are also being reviewed by an independent model: requested **Grok 4.6 (high reasoning), via cursor-agent** (serving model unverified on this route). Full document content is sent to xAI/Cursor.`
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. A route failure produces no artifact; apply Step 1's retry/disclosure condition before another attempt. Reconcile `cross_model_target`, `cross_model_harness`, `cross_model_route`, `model_requested`, and `model_actual` from the artifact; never infer a serving model from the requested ID.
- **Interactive host, no peer resolved** (host un-attestable, no different-provider route installed, or disabled by checkout config): one quiet line that the cross-model pass was skipped and why — name the checkout policy when that is the reason. Never an error.
- **Non-interactive mode:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that document content was sent cross-model to the named provider, so the third-party data egress is auditable even though the pass is silent to the user. Non-interactive applies the same gates as interactive — an installed, sanctioned, attested-different route runs under the Step 1 contract, unset allowlist included.

## Step 4 — Run the bundled script (one call per activated trio lens, in parallel with the persona reviewers)

Each call is a CLI shell-out, not a subagent. Resolve one target and one fixed route once per document review, then launch every activated lens against that same sanctioned target/route. Launch each call as a detached job through `scripts/peer-job-runner.py` in the same dispatch wave as the in-process reviewers. A failed route does not fall through inside the worker.

**Two modes — slice the trio, sweep the whole doc (R20, KTD6):**

- **Trio peers, sliced.** On **unified artifacts**, pass each activated trio lens the *same reviewer-specific slice its in-process twin got* as `<document-path>` (write that slice to a temp file — e.g. product-lens/adversarial get the Product Contract), not the full document, so the peer is a true corroborating twin rather than an off-lens reviewer. On legacy docs the peer gets the same full document the twin does.
- **One whole-doc sweep.** In the **same wave**, also launch **one** call with reviewer-name **`whole-doc`**, the **full** document (never sliced), and the same resolved provider — a broad different-model read of the entire doc. It runs **once per document** (not per lens), writes `whole-doc-<provider>.json`, and folds in as an independent reviewer that corroborates against *any* in-process finding 3.3 merged it with (it has no in-process twin). Same gate, isolation, and non-blocking rules as the trio calls. A model following this contract MUST issue this `whole-doc` invocation whenever the pass runs, or the broad coverage R20/U9 promises is silently skipped.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host; shell state does not persist between Bash calls, so set it inline in every runner call):

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
  "justification": "Allow the disclosed read-only cross-model review to send the reviewed document to the fixed external provider."
}
```

Disclose that this is not launcher-only isolation: the detached worker inherits that launch context for its lifetime, so the adapter's declared read-only/tool restrictions — not the Codex command sandbox — bound the peer while the reviewed material egresses. If the grant is denied or unavailable, do not execute `start`; create no peer job and retain the in-process reviewers as coverage. After `start` returns a job id, any network, authentication, or provider failure is a started-job outcome and follows the ordinary terminal/recovery rules; keep `status`, `wait`, `result`, and `reap` sandboxed because they need no provider connection.

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_DIR="$SCRATCH_ROOT/ce-doc-review/<run-id>"; (umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "peer-deadline-secs=$(( ${CROSS_MODEL_HARD_SECS:-1200} + 10 ))";
CE_PEER_HARD_SECS= CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-doc-review --run-id "<run-id>" --label "<reviewer-name>" -- env CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-doc-review.sh" "<host-serving-family>" "<target>" "<reviewer-name>" "<document-path>" "<document-type>" "<origin>" "$RUN_DIR"
```

When Step 1 resolved a configured model or effort, add `CROSS_MODEL_MODEL_OVERRIDE_TARGET="<target>" CROSS_MODEL_MODEL_OVERRIDE="<model>"` and/or `CROSS_MODEL_EFFORT_OVERRIDE="<effort>"` to the `env` prefix after `CROSS_MODEL_FIXED_ROUTE`; omit them when unset.

The nested windows are one budget with one knob, `CROSS_MODEL_HARD_SECS`. The runner derives its supervisor hard window from that ambient knob automatically (`max(1230, knob + 30)`). Clear `CE_PEER_HARD_SECS` on the start prefix (`CE_PEER_HARD_SECS=`) so a stale ambient value from an earlier session or harness export cannot undercut that derivation — an explicit numeric `CE_PEER_HARD_SECS` still wins when a skill deliberately sets one (ce-work / elevation), which this path must not do. Print the orchestrator deadline as `knob + 10` in the same shell as `start` (as above) and use that printed `peer-deadline-secs=<n>` below (all legs share the one value; re-use the first leg's number rather than re-deriving per leg); never hardcode it, because a literal survives a knob change and then reaps a healthy peer.

**Do not forward `CROSS_MODEL_HARD_SECS` to the worker.** The runner already passes the ambient environment through, so a knob the user actually set reaches the worker on its own. Re-exporting the orchestrator's *resolved* value would turn a fallback into an explicit override and destroy the one distinction the worker still needs: idle-guarded routes (codex + streaming claude/cursor-family) use the raised `HARD_SECS` default, while `grok-cli` keeps the lower `UNGUARDED_HARD_SECS` bound because its `--json-schema` path cannot stream. Forcing one value would silently restore the doubled hang on that hard-only route.

Omit `--result-path`; `done` means only that the worker exited. The fixed target determines the expected `<reviewer-name>-<target>.json` filename.

- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is exactly one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned concrete route token from the Step 1 table (`codex`, `claude`, `grok-cli`, `grok-cursor`, `cursor`, or `composer`).
- `<reviewer-name>` = the activated lens (`security-lens`, `adversarial`, or `product-lens`). The script derives the persona-brief filename and (per provider) model from this allowlisted value — the brief path is never caller-controlled.
- `<document-path>` = the document under review.
- `<document-type>` = the Phase 1 classification (`requirements` / `plan` / `unified-requirements` / `unified-plan`).
- `<origin>` = the same `{origin_path}` slot the in-process personas receive.
- `<run-dir>` = the absolute `$RUN_DIR` resolved above. The script writes `<reviewer-name>-<provider>.json` there per resolved peer **only after** forcing `reviewer` to `<reviewer-name>-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

Every runner call is bounded — no tool call ever spans a worker's runtime, on any host. Between dispatch waves, poll outstanding jobs (it returns early when the watched jobs settle):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-ids...>
```

Capture the epoch time right after the final `start` (`date +%s`) — that anchor is how you know when the deadline passes, since nothing else tracks wall clock across tool calls. At synthesis, loop bounded `wait` calls until every job is terminal **or the shared peer deadline (`peer-deadline-secs`) has elapsed since the final `start`** (compare `date +%s` against the anchor before each slice) (do not begin a `wait` slice that would extend past the deadline — reap instead); at that deadline, `reap` each job still nonterminal, then run one final bounded `wait --max-secs 10` pass (reap is asynchronous — the terminal record lands a grace period after it returns), then fold in whichever `<reviewer-name>-<provider>.json` files exist in `<run-dir>`. The detached script still self-bounds (codex idle-timeout default 480s with reasoning forced on for liveness; hard backstop `CROSS_MODEL_HARD_SECS` default 1200s) and exits cleanly; the runner's supervisor windows sit outside those caps as the backstop. The script needs no prompt or schema passed in — it reads the persona brief, `findings-schema.json`, and the document itself from disk.

Any started job whose terminal state is not `done` (`failed` / `timeout` / `died-without-result` — a job reaped at the deadline records `timeout`, with the reap noted in its reason; a preflight failure never yields a job id — a genuine gate-not-met skip is the silent `never-started` case, but a dispatch-infrastructure crash before any job starts is not a clean skip and triggers the hand-recovery rule in Step 5) is named in the Coverage line with its lens and terminal state (e.g. "cross-model security-lens peer: timeout"); silent absence remains correct only for passes that were never started (gate not met / skip). A missing fold-in file is still "the pass didn't run for that lens," never a review failure — except when a dispatch-infrastructure crash voided the whole pass at once, which Step 5 handles as named whole-pass loss (the whole-doc broad read especially), not per-lens "not run." After fold-in, delete the consumed job dirs under `<run-dir>/jobs` (use the environment's preferred deletion command).

The cross-model pass does **not** receive the accumulated decision primer that in-process personas get on round 2+ — the peer prompt carries a round-1 framing regardless of round. This is deliberate (cross-model is most valuable on the first pass), and synthesis's own R29/R30 suppression is the authoritative backstop for re-raised or already-resolved findings, so a peer that re-raises a prior-round-rejected finding is dropped at synthesis, not surfaced.

## Step 5 — Fold into synthesis

- Read each fold-in artifact through the runner's verified read (resolve `$PY` in the same tool call — shells do not persist):

  ```bash
  SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
  PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
  "$PY" "$SKILL_DIR/scripts/peer-job-runner.py" result --path <run-dir>/<reviewer-name>-<target>.json
  ```

  (fd-ownership-checked, bounded; exit 4 means unreadable -> treat as no file). If present, treat it as one reviewer return with `reviewer: <reviewer-name>-<target>`. It enters ordinary dedup, but enters cross-model agreement promotion **only when `independence_verified` is `true`**. A false or absent value may contribute findings but never raises an anchor. Peer returns never grant silent-apply authority.
- **No file, clean skip** (script skipped before starting real work: host un-attestable, no different-provider route installed, CLI missing, unparseable output, or lens not activated) → the pass simply didn't run for that lens. Note "cross-model pass: not run" in Coverage on an interactive host in default mode — or "cross-model pass: disabled by checkout config" when Step 1's egress policy was the reason; stay silent in non-interactive mode. Never fail the review. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- **Dispatch-infrastructure failure vs. clean skip.** The clean skip above is a script that *chose* not to start real work. A dispatch-infrastructure crash is different — the runner or worker itself failed: a non-zero exit before any job starts, a preflight/detach failure, or an unresolved `$SKILL_DIR`/script path. Because every leg shares one runner, route, and `$SKILL_DIR`, such a crash typically drops the **whole** cross-model pass at once, not one lens. Do not fold it into the silent skip on the first error: re-run the **same resolved route** by hand — re-issuing the affected `start` calls with the target/model, the tool-less empty-scratch isolation posture, and the embedded-document read scope all held fixed — while each failure is a new, plausibly recoverable one and the shared peer deadline holds (a same-route retry, distinct from the quota rule below, which requires a newly disclosed route). Stop and drop the cross-model pass once a failure repeats or the deadline is spent. Each trio lens is still covered by its in-process twin; what an infra crash silently voids is the **whole-doc broad read** (the sweep leg has no twin) plus cross-model corroboration — name that loss in the Coverage line rather than letting it disappear as "not run." A hand recovery may not substitute a different target or provider, widen the read scope beyond the embedded document, or relax the read-only empty-scratch posture.
- **Started but not `done`** (the job's final state is `failed` / `timeout` / `died-without-result`) → still non-blocking, but never silent: name the lens and terminal state in Coverage per Step 4's naming rule.
- **Classify the skip reason before the job dirs are deleted.** When a peer produced no usable output or ended non-`done`, read its `out.log` before cleanup, including bounded lines prefixed `peer skip evidence:`. Name observed quota, authentication, or capability failure specifically. Attribute an account authentication failure only after provider-capable dispatch is positively established by the launch context or provider response; then report the observed failure and login or credential-refresh remediation. Without that proof, authentication-shaped peer text describes only the peer's execution context: a sandboxed host can produce the same signal as a genuine logout, so never report it as the user's account being logged out or prompt a login command. The cross-model pass is additive and the in-process reviewers still covered their lenses; obtaining it requires a context where the peer CLI can reach the network. The worker exclusively owns the one same-route retry under Step 1's exact-overload condition. Once a provider no-review outcome reaches the host, the host never restarts that peer. After the same quota or usage-limit evidence appears more than once in this session, do not retry that route automatically; never silently continue to another recipient.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- A finding that 3.3 merged with its in-process twin (`<reviewer-name>`) promotes by one anchor step only when the artifact records `independence_verified: true`. Cursor-default artifacts default false; an unattested host skips automatic dispatch. Whether the two describe one problem is 3.3's one-fix test, not a string match on section or title.

## Trust boundary (maintainers)

The script embeds the **full document content** into the peer prompt and sends it to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). This is a wider egress than a diff-only review. `CROSS_MODEL_PEERS` restricts which providers may receive content. The peer runs strictly read-only, from an empty scratch run-dir, with no project context — every route denies writes, network, MCP, and subagents. On **reads** the routes split into two tiers: **truly tool-less** — claude (`--safe-mode --tools ""`, all built-in tools disabled and custom behavior suppressed, run from the scratch dir) and grok (`--deny Read`/`Edit`/`Write`/`Bash`/`Task`/web/`mcp__*` with `--cwd <scratch>`), which have no read tool at all; and **read-only residual** — codex (`-s read-only -C <scratch>`) and cursor-agent (`--mode ask --sandbox enabled --workspace <scratch>`), which still permit *read* tools (see the accepted residual below). Impact is bounded to disclosure, not repo mutation — and because the reviewed document is the maintainer's own and the host agent already has more repo access than any peer, the read residual adds no material exposure.

**Accepted read residual (codex + cursor-agent routes):** codex (`-s read-only`) and cursor-agent (`--mode ask`) are read-only but retain a *read* tool — codex can also run read-only shell commands and read outside the scratch dir; cursor-agent can Read. Neither can be made truly tool-less (read-only is codex's sandbox floor; ask-mode is cursor-agent's), so they are a weaker isolation posture than the tool-less claude/grok routes. This is an **accepted** risk for ce-doc-review's own-document threat model — the reviewed documents are the maintainer's own planning docs (low injection surface), and the host agent already runs in-repo with strictly more privilege than any peer, so a peer that can read a file the host could already read (and send it to a provider the document already egresses to) adds no materially new exposure. The routes are kept, not fail-closed; the script's stderr audit log records each send so the egress is auditable even in non-interactive mode.
