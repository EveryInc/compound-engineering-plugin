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
elif [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST_HARNESS=cursor; XHOST_FAMILY=unknown;
else XHOST_HARNESS=unknown; XHOST_FAMILY=unknown; fi
```

Pass `XHOST_HARNESS` as `CROSS_MODEL_HOST_HARNESS`; pass `XHOST_FAMILY` as the first worker argument. Claude Code maps to harness/family `claude`; Codex maps to `codex`. Cursor maps to harness `cursor` and family `unknown` unless an observable serving-family attestation lets you set `XHOST_FAMILY` to `codex`, `claude`, `grok`, or `composer`. An unknown host family cannot satisfy automatic same-family exclusion, so skip the automatic cross-model pass. Never infer serving family from the Cursor brand.

Resolve the preference in this order:

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` in `.compound-engineering/config.local.yaml` (the only file the script/skill reads for this).
3. A preference already in your **project instructions** (the active instructions in your context) — consumed from context, **never** read from a named file.
4. **Default:** first available attested-different target in `codex → claude → grok → composer`; Cursor-default participates only when explicitly preferred.

Before content egresses, resolve each selected target to one concrete installed route, verify every recipient against `CROSS_MODEL_PEERS`, announce it, and pass it as `CROSS_MODEL_FIXED_ROUTE`. A failed dispatched route returns no artifact; it never changes provider or intermediary internally. A retry is a new host decision and requires disclosure/sanction before dispatch. For backward compatibility, either `cursor` or `composer` in `CROSS_MODEL_PEERS` sanctions Cursor as an intermediary, but selecting a Cursor-default voice itself requires target `cursor`; `grok` alone never sanctions Grok-via-Cursor.

Preferred model mappings run first. Only after the preferred ID is observed unavailable, obsolete, or incompatible may the host inspect current CLI capabilities and choose the closest compatible **same-target/same-family** replacement. Bind it with both `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, apply one target's override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + reasoning tier (owned by the script)

All activated lenses run on **one model per provider at high reasoning, except Codex on medium** (composer's `-fast` tier is its ceiling — accepted exceptions). The concrete model IDs and per-route reasoning flags live in a **single mapping in the script** (`scripts/cross-model-doc-review.sh`, the `M_CODEX`/`M_CLAUDE`/`M_GROK`/`M_GROK_CURSOR`/`M_COMPOSER` constants and the `adapter_argv` builder). This reference deliberately does **not** restate the IDs — one source of truth prevents the reference and script from drifting. The IDs are the current instance of the tier principle (a single maintenance point), not the contract.

The **persona file** basename and the **reviewer name** are distinct: the script reads the brief from `references/personas/<persona-file>.md` but forces the fold-in `reviewer` field to `<reviewer-name>-<provider>` so agreement matches the in-process persona's short name. The script derives the persona-file from the allowlisted reviewer-name — it is **not** a caller argument, so no caller value reaches the brief-read path.

## Step 3 — Announce

The ce-doc-review invocation authorizes the selected configured/allowlisted egress route after this disclosure. The announce is a transparent notice, not a second egress-confirmation gate. Egress authorization does not grant host-execution authority; Step 4 resolves launch authority separately at the actual start call.

- **Interactive host, default (non-headless) mode:** surface a **prominent standalone line** that frames it as an **independent cross-model review** of the judgment lenses (say "cross-model" / "independent model" — not the internal "peer" jargon), names the concrete **model and reasoning level** from the in-script mapping (e.g. GPT-5.6-sol at medium reasoning, Opus at high, Grok 4.5 at high, Composer 2.5-fast), and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes so Grok-4.5-via-cursor-agent, Composer-via-cursor-agent, and Grok-4.5-via-the-grok-CLI are unambiguous, **and states that full document content is sent to that provider** (third-party egress; for cursor-agent routes the egress is to Cursor *plus* the serving provider). **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model>; serving model unverified on this route" instead of asserting the concrete model. Placed with the Phase 2 team announce, not buried after it. Wording is yours; the falsifiable requirements: prominent, reads as a **cross-model reviewer** (not a generic persona), names the requested model (with the unverified marker on receipt-less routes), names the route when it is cursor-agent, names the egress. Example: `🔀 Cross-model pass — the judgment lenses are also being reviewed by an independent model: requested **Grok 4.5 (high reasoning), via cursor-agent** (serving model unverified on this route). Full document content is sent to xAI/Cursor.`
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. A route failure produces no artifact and may be retried only after the host resolves, sanctions, and discloses the new route. Reconcile `cross_model_target`, `cross_model_harness`, `cross_model_route`, `model_requested`, and `model_actual` from the artifact; never infer a serving model from the requested ID.
- **Interactive host, no peer resolved** (host un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **Headless mode:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that document content was sent cross-model to the named provider, so the third-party data egress is auditable even though the pass is silent to the user. Headless still requires a reachable peer under the normal gates; an explicit `cross_model_peer:` in `.compound-engineering/config.local.yaml` or a non-empty `CROSS_MODEL_PEERS` allowlist is the preferred enablement surface when teams want fail-closed-by-default CI egress (unset allowlist still means the default availability order).

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

Every route also accepts only these operational fields: `CROSS_MODEL_HOST_HARNESS`, `CROSS_MODEL_FIXED_ROUTE`, `CROSS_MODEL_PEERS`, `CROSS_MODEL_MAX_PEERS`, `CROSS_MODEL_MODEL_OVERRIDE_TARGET`, `CROSS_MODEL_MODEL_OVERRIDE`, `CROSS_MODEL_INPUT_DIGEST`, `CROSS_MODEL_MAX_DOC_CHARS`, `CROSS_MODEL_IDLE_SECS`, `CROSS_MODEL_HARD_SECS`, and `CROSS_MODEL_HEARTBEAT_SECS`. In the launch command, `<route-discovery-env>` expands to assignments for exactly the selected table row. For example, the macOS `claude` route uses `HOME="$HOME" USER="$USER" PATH="$PATH" TMPDIR="${TMPDIR:-/tmp}" XDG_CONFIG_HOME="${XDG_CONFIG_HOME:-}" CLAUDE_CONFIG_DIR="${CLAUDE_CONFIG_DIR:-}"`; `USER` is required there for native OAuth/keychain discovery. Do not add host-attestation markers or provider-specific credential variables.

## Step 4 — Run the bundled script (one call per activated trio lens, in parallel with the persona reviewers)

Each call is a CLI shell-out, not a subagent. Resolve one target and one fixed route once per document review, then launch every activated lens against that same sanctioned target/route. Launch each call as a detached job through `scripts/peer-job-runner.py` in the same dispatch wave as the in-process reviewers. A failed route does not fall through inside the worker.

Before the first launch, distinguish the current execution lane from the host identity already attested in Step 1. Resolve launch authority for each leg as exactly one outcome:

- `normal` — the current lane can run that finalized native peer command.
- `approved_host_launch` — the current lane is restricted, but the host approved that finalized command.
- `host_denied` — the host rejected that launch.
- `authority_unavailable` — the harness exposes no way to request the authority the launch needs.

Only `normal` and `approved_host_launch` may detach. For `host_denied` or `authority_unavailable`, issue no start command for that leg: there is no job ID and no detach. Continue with the in-process trio twin as the skill-specific local fallback; for a denied/unavailable `whole-doc` leg, name the missing broad read in Coverage rather than inventing a substitute. Because the provider CLI never ran, never infer provider logout, missing credentials, or provider unavailability from either authority branch.

**Restricted Codex adapter.** Submit each exact finalized `peer-job-runner.py start` command below in the same exec call that requests `sandbox_permissions: "require_escalated"`; the `justification` must name the fixed route and the document-content egress recipients. Omit `prefix_rule`: approval is call-scoped, not a reusable token. Never approve a probe and launch later. An unrestricted or already authorized execution lane runs the identical command normally. The adapter metadata shape is:

```text
exec({
  cmd: "<the exact finalized shell command below>",
  sandbox_permissions: "require_escalated",
  justification: "Launch the <label> cross-model document review through <fixed-route>; document content will egress to <recipients>."
})
```

Use per-leg starts by default. Each restricted-Codex leg gets its own call-scoped decision; never claim approval reuse from an earlier leg. An intentional immutable batch is allowed only when one exec call contains every fully resolved start command and its justification names the fixed route, all labels, and all egress recipients. Set the aggregate deadline anchor before the initial launch and preserve it across every leg.

**Two modes — slice the trio, sweep the whole doc (R20, KTD6):**

- **Trio peers, sliced.** On **unified artifacts**, pass each activated trio lens the *same reviewer-specific slice its in-process twin got* as `<document-path>` (write that slice to a temp file — e.g. product-lens/adversarial get the Product Contract), not the full document, so the peer is a true corroborating twin rather than an off-lens reviewer. On legacy docs the peer gets the same full document the twin does.
- **One whole-doc sweep.** In the **same wave**, also launch **one** call with reviewer-name **`whole-doc`**, the **full** document (never sliced), and the same resolved provider — a broad different-model read of the entire doc. It runs **once per document** (not per lens), writes `whole-doc-<provider>.json`, and folds in as an independent reviewer that corroborates by fingerprint against *any* in-process finding (it has no in-process twin). Same gate, isolation, and non-blocking rules as the trio calls. A model following this contract MUST issue this `whole-doc` invocation whenever the pass runs, or the broad coverage R20/U9 promises is silently skipped.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host; shell state does not persist between Bash calls, so set it inline in every runner call):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
install -d -m 700 "$SCRATCH_ROOT" || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_DIR="$SCRATCH_ROOT/ce-doc-review/<run-id>"; (umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
DOCUMENT_PATH="<document-path>";
INPUT_DIGEST="$(python3 -c 'import hashlib,sys; print(hashlib.sha256(open(sys.argv[1], "rb").read()).hexdigest())' "$DOCUMENT_PATH")" || exit 1;
RESULT_PATH="$RUN_DIR/<reviewer-name>-<target>.json";
CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" python3 "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-doc-review --run-id "<run-id>" --label "<reviewer-name>" --input-digest "$INPUT_DIGEST" --result-path "$RESULT_PATH" -- env -i <route-discovery-env> CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" CROSS_MODEL_PEERS="${CROSS_MODEL_PEERS:-}" CROSS_MODEL_MAX_PEERS="${CROSS_MODEL_MAX_PEERS:-}" CROSS_MODEL_MODEL_OVERRIDE_TARGET="${CROSS_MODEL_MODEL_OVERRIDE_TARGET:-}" CROSS_MODEL_MODEL_OVERRIDE="${CROSS_MODEL_MODEL_OVERRIDE:-}" CROSS_MODEL_INPUT_DIGEST="$INPUT_DIGEST" CROSS_MODEL_MAX_DOC_CHARS="${CROSS_MODEL_MAX_DOC_CHARS:-}" CROSS_MODEL_IDLE_SECS="${CROSS_MODEL_IDLE_SECS:-}" CROSS_MODEL_HARD_SECS="${CROSS_MODEL_HARD_SECS:-}" CROSS_MODEL_HEARTBEAT_SECS="${CROSS_MODEL_HEARTBEAT_SECS:-}" bash "$SKILL_DIR/scripts/cross-model-doc-review.sh" "<host-serving-family>" "<target>" "<reviewer-name>" "$DOCUMENT_PATH" "<document-type>" "<origin>" "$RUN_DIR"
```

The caller hashes the exact slice/full-document file and registers its deterministic result path. The worker removes stale output, recomputes the digest immediately before prompting, and publishes only a full-schema artifact carrying that digest. Runner `done` therefore means the registered artifact exists, not merely that the worker exited zero.

- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is exactly one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned route (`grok-cli` and `grok-cursor` remain distinct).
- `<reviewer-name>` = the activated lens (`security-lens`, `adversarial`, or `product-lens`). The script derives the persona-brief filename and (per provider) model from this allowlisted value — the brief path is never caller-controlled.
- `<document-path>` = the document under review.
- `<document-type>` = the Phase 1 classification (`requirements` / `plan` / `unified-requirements` / `unified-plan`).
- `<origin>` = the same `{origin_path}` slot the in-process personas receive.
- `<run-dir>` = the absolute `$RUN_DIR` resolved above. The script writes `<reviewer-name>-<provider>.json` there per resolved peer **only after** forcing `reviewer` to `<reviewer-name>-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

Record one launch ledger row per leg immediately after its authority decision/start attempt with these fields in order: `label`, `target`, `fixed route`, `authority outcome`, `job ID/no-job`, `expected result path`, `input digest`. Record the expected path and exact slice/full-document digest even for `no-job`.

Every runner call is bounded — no tool call ever spans a worker's runtime, on any host. Between dispatch waves, poll outstanding jobs (it returns early when the watched jobs settle):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
python3 "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-ids...>
```

Use the deadline anchor recorded in working state before the initial launch — that anchor is how you know when the deadline passes, since nothing else tracks wall clock across tool calls. At synthesis, loop bounded `wait` calls until every job is terminal **or 610 seconds have elapsed since that anchor** (compare `date +%s` against the anchor before each slice) (do not begin a `wait` slice that would extend past the deadline — reap instead); at that deadline, `reap` each job still nonterminal, then run one final bounded `wait --max-secs 10` pass (reap is asynchronous — the terminal record lands a grace period after it returns), then fold in whichever `<reviewer-name>-<provider>.json` files exist in `<run-dir>`. The detached script still self-bounds (codex idle-timeout default 180s with reasoning forced on for liveness; hard backstop `CROSS_MODEL_HARD_SECS` default 600s) and exits cleanly; the runner's supervisor windows sit outside those caps as the backstop. The script needs no prompt or schema passed in — it reads the persona brief, `findings-schema.json`, and the document itself from disk.

Any started job whose terminal state is not `done` (`failed` / `timeout` / `died-without-result` — a job reaped at the deadline records `timeout`, with the reap noted in its reason; a preflight failure never yields a job id — a genuine gate-not-met skip is the silent `never-started` case, but a dispatch-infrastructure crash before any job starts is not a clean skip and triggers the hand-recovery rule in Step 5) is named in the Coverage line with its lens and terminal state (e.g. "cross-model security-lens peer: timeout"); silent absence remains correct only for passes that were never started (gate not met / skip). A missing fold-in file is still "the pass didn't run for that lens," never a review failure — except when a dispatch-infrastructure crash voided the whole pass at once, which Step 5 handles as named whole-pass loss (the whole-doc broad read especially), not per-lens "not run." After fold-in, delete the consumed job dirs under `<run-dir>/jobs` (use the environment's preferred deletion command).

The cross-model pass does **not** receive the accumulated decision primer that in-process personas get on round 2+ — the peer prompt carries a round-1 framing regardless of round. This is deliberate (cross-model is most valuable on the first pass), and synthesis's own R29/R30 suppression is the authoritative backstop for re-raised or already-resolved findings, so a peer that re-raises a prior-round-rejected finding is dropped at synthesis, not surfaced.

## Step 5 — Fold into synthesis

- For a leg with a job ID, collect only with `python3 "$SKILL_DIR/scripts/peer-job-runner.py" result <job-id>`. Never collect by path or directory scan. Revalidate full schema (including valid empty `findings`), exact reviewer, artifact `job_id` against the collected runner job, and ledger `input_digest`; mismatch is `unusable_output`. A valid artifact without verified serving identity is `ran_attributed`. Promotion requires `ran_verified_independent`: both `independence_verified` and `model_receipt_verified` are true and receipt identity reconciles.
- **No job ID / never started** (gates not met, host un-attestable, no different provider reachable, lens not activated, `host_denied`, or `authority_unavailable`) → issue no job command and inspect no result path. Use the local twin and record an environment-scoped reason; never infer provider logout because no provider command ran.
- **Dispatch-infrastructure failure vs. clean skip.** The clean skip above is a script that *chose* not to start real work. A dispatch-infrastructure crash is different — the runner or worker itself failed: a non-zero exit before any job starts, a preflight/detach failure, or an unresolved `$SKILL_DIR`/script path. Because every leg shares one runner, route, and `$SKILL_DIR`, such a crash typically drops the **whole** cross-model pass at once, not one lens. Do not fold it into the silent skip on the first error: re-run the **same resolved route** by hand — re-issuing the affected `start` calls with the target/model, the tool-less empty-scratch isolation posture, and the embedded-document read scope all held fixed — while each failure is a new, plausibly recoverable one and the shared 610s deadline holds (a same-route retry, distinct from the quota rule below, which requires a newly disclosed route). Stop and drop the cross-model pass once a failure repeats or the deadline is spent. Each trio lens is still covered by its in-process twin; what an infra crash silently voids is the **whole-doc broad read** (the sweep leg has no twin) plus cross-model corroboration — name that loss in the Coverage line rather than letting it disappear as "not run." A hand recovery may not substitute a different target or provider, widen the read scope beyond the embedded document, or relax the read-only empty-scratch posture.
- **Started but not `done`** (the job's final state is `failed` / `timeout` / `died-without-result`) → still non-blocking, but never silent: name the lens and terminal state in Coverage per Step 4's naming rule.
- **Classify before cleanup.** For a started peer, read only bounded runner-owned diagnostics, including the stable `peer skip evidence:` category line. Persist only `auth_failed`, `quota_limited`, `timeout`, or `unusable_output`, redacting credentials, tokens, paths, commands, and raw prose. If quota and authentication markers coexist, `quota_limited` wins. Never retry repeated quota evidence automatically.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- A finding sharing a dedup fingerprint with its in-process twin promotes only for `ran_verified_independent`: both independence and identity receipt are verified and route/target/harness/requested/served identity reconcile. Twin match uses section+title or same section with >50% evidence-substring overlap.

## Trust boundary (maintainers)

The script embeds the **full document content** into the peer prompt and sends it to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). This is a wider egress than a diff-only review. `CROSS_MODEL_PEERS` restricts which providers may receive content. The peer runs strictly read-only, from an empty scratch run-dir, with no project context — every route denies writes, network, MCP, and subagents. On **reads** the routes split into two tiers: **truly tool-less** — claude (`--safe-mode --tools ""`, all built-in tools disabled and custom behavior suppressed, run from the scratch dir) and grok (`--deny Read`/`Edit`/`Write`/`Bash`/`Task`/web/`mcp__*` with `--cwd <scratch>`), which have no read tool at all; and **read-only residual** — codex (`-s read-only -C <scratch>`) and cursor-agent (`--mode ask --sandbox enabled --workspace <scratch>`), which still permit *read* tools (see the accepted residual below). Impact is bounded to disclosure, not repo mutation — and because the reviewed document is the maintainer's own and the host agent already has more repo access than any peer, the read residual adds no material exposure.

**Accepted read residual (codex + cursor-agent routes):** codex (`-s read-only`) and cursor-agent (`--mode ask`) are read-only but retain a *read* tool — codex can also run read-only shell commands and read outside the scratch dir; cursor-agent can Read. Neither can be made truly tool-less (read-only is codex's sandbox floor; ask-mode is cursor-agent's), so they are a weaker isolation posture than the tool-less claude/grok routes. This is an **accepted** risk for ce-doc-review's own-document threat model — the reviewed documents are the maintainer's own planning docs (low injection surface), and the host agent already runs in-repo with strictly more privilege than any peer, so a peer that can read a file the host could already read (and send it to a provider the document already egresses to) adds no materially new exposure. The routes are kept, not fail-closed; the script's stderr audit log records each send so the egress is auditable even in headless mode.
