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

Preferred mappings run first. Only after an observed unavailable, obsolete, or incompatible model may the host choose the closest compatible same-target/same-family replacement. Bind it with `CROSS_MODEL_MODEL_OVERRIDE_TARGET=<target>` and `CROSS_MODEL_MODEL_OVERRIDE=<model-id>`. Never substitute across families, leak an override to another route, silently change an explicit model, or add a recipient.

## Step 2 — Provider model + high reasoning (owned by the script)

The peer runs on **one model per provider at high reasoning** (composer's `-fast` tier is its ceiling — an accepted exception). The concrete model IDs and per-route reasoning flags live in a **single mapping in the script** (`scripts/cross-model-adversarial-review.sh`, the `M_CODEX`/`M_CLAUDE`/`M_GROK`/`M_GROK_CURSOR`/`M_COMPOSER` constants and the `adapter_argv` builder). This reference deliberately does **not** restate the IDs — one source of truth prevents the reference and script from drifting. The IDs are the current instance of the tier principle (a single maintenance point), not the contract.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

- **Interactive host, default mode:** surface a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model" — not the internal "peer" jargon), names the concrete **model and reasoning level** from the in-script mapping (e.g. GPT-5.6-sol at high reasoning, Opus at high, Grok 4.5 at high, Composer 2.5-fast), and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes so Grok-4.5-via-cursor-agent, Composer-via-cursor-agent, and Grok-4.5-via-the-grok-CLI are unambiguous, **and states that reviewed code/diff content is sent to that provider** (third-party egress; for cursor-agent routes the egress is to Cursor *plus* the serving provider). **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model>; serving model unverified on this route" instead of asserting the concrete model. Placed with the Stage 3 team announce, not buried after it. Wording is yours; the falsifiable requirements: prominent, reads as a **cross-model reviewer**, names the requested model (with the unverified marker on receipt-less routes), names the route when it is cursor-agent, names the egress.
  - Call the pass **independent** only when host and target serving families are attestably different. For Cursor default/Auto or an unknown host family, call it a cross-harness review and state that independence is unverified; do not promise agreement promotion before the receipt exists.
  - Announce the one fixed route and every recipient before dispatch. A failure may be retried only after resolving, sanctioning, and disclosing a new route. Reconcile target, harness, route, requested model, and actual model from the artifact.
- **Interactive host, no peer resolved** (host serving family un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that review content was sent cross-model to the named provider, so the third-party data egress is auditable.

## Step 4 — Start the detached peer job (in parallel with the persona reviewers)

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime** — some harnesses kill long tool calls, which silently vanishes the pass. Start it as a **detached, supervised job** through the bundled runner in one short Bash call (prints the job id in under ~2s), launched **in the same Stage 4 dispatch wave as the persona reviewers** so its runtime overlaps theirs.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" python3 "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial -- env CROSS_MODEL_HOST_HARNESS="<host-harness>" CROSS_MODEL_FIXED_ROUTE="<fixed-route>" bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-serving-family>" "<target>" "<base-ref>" "<run-dir>"
```

- `<run-id>` = the Stage 4 run id (the same one that forms `<run-dir>`); job state lives under `/tmp/compound-engineering/ce-code-review/<run-id>/jobs/<job-id>/`.
- `<host-serving-family>` is `codex`, `claude`, `grok`, `composer`, or `unknown`; `<host-harness>` is `codex`, `claude`, `grok`, `cursor`, or `unknown`.
- `<target>` is one of `codex`, `claude`, `grok`, `cursor`, or `composer`; `<fixed-route>` is its already-sanctioned concrete route.
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the Stage 4 run dir (`/tmp/compound-engineering/ce-code-review/<run-id>/`). The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

**Poll, don't await.** The runner detaches the worker into its own supervised session, so no tool call ever spans the peer's runtime — this detach-and-poll contract is uniform on every supported host, including hosts where a long-lived call would have worked. Interleave bounded polls (`python3 "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-id>` — returns early when the job goes terminal) with your remaining Stage 4/5 work. Capture the epoch time right after `start` (`date +%s`) — nothing else tracks wall clock across tool calls. Before the Stage 5 fold-in, loop bounded `wait` until the job is terminal **or 610s have elapsed since the `start`** (compare `date +%s` against the anchor; do not begin a `wait` slice that would extend past the deadline — reap instead). At the deadline `reap <job-id>` if it is still nonterminal, then do one final bounded `wait --max-secs 10 <job-id>` — reap is asynchronous (it signals the supervisor and returns; the terminal record lands up to a grace period later), so a bare `status` immediately after can still read `running`. Fold in the artifact if present. The script self-bounds (codex idle-timeout default 180s with reasoning forced on for liveness; hard backstop `CROSS_MODEL_HARD_SECS` default 600s) and the runner's supervisor backstops it, so the 610s deadline is a last-resort guard, not the normal exit. Done detection stays presence-keyed: the worker itself publishes `<run-dir>/adversarial-<provider>.json` after normalize; absence means the pass didn't run. The script needs no prompt or schema passed in — it reads the persona brief and `findings-schema.json` from the skill dir and reviews the current work tree against `<base-ref>`.

## Step 5 — Fold into Stage 5

- Read the artifact through the runner's verified read — `python3 "$SKILL_DIR/scripts/peer-job-runner.py" result --path <run-dir>/adversarial-<target>.json`. Its findings enter ordinary dedup, but agreement promotion is allowed **only when `independence_verified` is `true`**. A false or absent value may contribute findings but never raises confidence. Peer findings never grant silent-apply authority.
- **Never started / not run** — the job was never started (gates not met, host un-attestable, no different provider reachable, CLI missing/unauthed): the pass simply didn't run. Note "cross-model pass: not run" in Coverage for human-facing markdown; stay silent in `mode:agent`. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- **Ran but produced no usable output** — the job reached `done` (or any terminal state) yet no `adversarial-<provider>.json` exists (the peer ran and egressed but returned nothing schema-shaped — unparseable output, empty findings the script dropped). Distinct from not-run: note "cross-model pass: peer ran, no usable output" in human-facing markdown Coverage. Never fail the review.
- **Started but not `done`** — the final status read reports `failed`, `timeout`, or `died-without-result` (a job reaped at the 610s deadline records `timeout`, with the reap noted in its reason) → still non-blocking, but never silent: name the peer and its terminal state in Coverage (e.g. "cross-model adversarial peer: timeout"). Silent absence stays correct only for passes that never started or were skipped.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- **Classify the skip reason before deleting.** Read `out.log` before cleanup, including bounded lines prefixed `peer skip evidence:`, and name observed quota, authentication, or capability failure. After the same quota or usage-limit evidence appears more than once in this session, do not retry that route automatically. A retry uses a newly resolved, disclosed, and sanctioned fixed route; never silently continue to another recipient.
- After fold-in (or after deadline reaping), delete the consumed job directory (`/tmp/compound-engineering/ce-code-review/<run-id>/jobs/<job-id>/`) — its log and result are review content and must not outlive their use.
- A finding sharing a fingerprint with in-process `adversarial` promotes only when the artifact records `independence_verified: true`. Cursor-default artifacts default false; an unattested host skips automatic dispatch.

## Trust boundary (maintainers)

The peer reviews the **current work tree** (read-only) against `git diff <base-ref>`. Reviewed code/diff content is sent to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). `CROSS_MODEL_PEERS` restricts which providers may receive content.

**Isolation differs from ce-doc-review by design.** Doc-review embeds a self-contained document into a tool-less empty scratch. Code-review needs surrounding code context, so peers run **in-tree read-only**:

- **codex:** `-s read-only` with cwd at the repo root (may fetch `git diff` itself).
- **claude:** deny mutators / Bash / Task / `mcp__*`; **Read allowed** for context; diff is embedded because Bash is denied.
- **grok / cursor-agent:** ask/dontAsk + no write/force/yolo; Read allowed; workspace/cwd at the repo root.

Impact is bounded to disclosure, not repo mutation. The script's stderr audit log records each send so the egress is auditable even in `mode:agent`.
