# Cross-Model Adversarial Pass

Runs the **adversarial** review through **one different model provider than the host** (auto-chosen from what's available, overridable), in a separate read-only process, so its findings are independent of the in-process reviewers. The peer gets the **same** `references/personas/adversarial-reviewer.md` brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into Stage 5 as reviewer `adversarial-<provider>` — so agreement between it and the in-process `adversarial` persona promotes the finding (Stage 5 cross-reviewer agreement; render as `adversarial, adversarial-<provider>`).

This pass is **adversarial-only**. No other persona gets a cross-model twin, and there is no whole-diff generalist peer. Cost stays gated on the existing Stage 3 adversarial selection.

All invocation detail (provider→route resolution, availability + classified-failure fallback, composing the prompt from the persona, read-only in-tree flags, per-provider model, per-route timeouts, capturing schema-shaped JSON, normalizing the reviewer name) lives in the bundled script **`scripts/cross-model-adversarial-review.sh`**. This reference decides *whether* to run it, *how the host provider is attested*, *how candidates are ordered*, and how to fold the result in. The pass is **non-blocking**: the script logs a reason and exits cleanly on any problem, writing no output file — a missing file is simply "no cross-model pass," never a failure (though Step 5 distinguishes a never-started skip from a started job that ended non-`done`, which is named in Coverage rather than silent).

## Gates — run only when all hold

1. `adversarial-reviewer` was selected in Stage 3 (reuse that diff gate — don't run a costly external CLI on a trivial diff).
2. Scope is `local-aligned` or standalone — the working tree IS the reviewed head. Skip in `pr-remote` / `branch-remote`: the peer reviews the local tree, which is not the PR/branch head.

## Step 1 — Attest the host provider, then resolve one different-provider peer

**Independence is by provider, not CLI brand.** The four providers and their routes: OpenAI reached by the `codex` CLI (key `codex`); Anthropic by the `claude` CLI (key `claude`); xAI by the `grok` CLI, else `cursor-agent --model grok-4.5-high` (key `grok`); Cursor by `cursor-agent --model composer-2.5-fast` (key `composer`). `cursor-agent` is used ONLY to reach grok (fallback) and composer — never for OpenAI/Anthropic (redundant with the common-harness CLIs, and a same-provider egress).

**Attest the host provider — its only purpose is to exclude it so the pass never self-reviews.** You (the skill) know your own harness; map it to the host provider *key*:

```bash
if [ "${CLAUDECODE:-}" = "1" ]; then XHOST=claude;
elif [ -n "${CODEX_SANDBOX:-}${CODEX_SANDBOX_NETWORK_DISABLED:-}${CODEX_SESSION_ID:-}${CODEX_THREAD_ID:-}${CODEX_CI:-}" ]; then XHOST=codex;
elif [ -n "${CURSOR_AGENT:-}${CURSOR_CONVERSATION_ID:-}" ]; then XHOST=cursor;
else XHOST=unknown; fi
```

(For `XHOST=cursor`, resolve it to the *active serving provider* key per the bullets below before passing it as `host_provider`.)

- **Claude Code → `claude`; Codex → `codex`.** There is no single canonical marker Codex sets across surfaces (CLI, web, CI), and `shell_environment_policy`/IDE inheritance can strip env vars, so check the union above. Do **not** use the *other* CLI's home (e.g. `CODEX_HOME`) — it leaks into a Claude session.
- **Cursor → its *active serving provider*.** Cursor runs a user-chosen model, so the host provider is whichever family that model belongs to (its running model on GPT → `codex`; on Claude → `claude`; on Grok → `grok`; on Composer → `composer`). Attest it from what you can observe about the active model.
- **Un-attestable host (Cursor on an undetectable model, or `unknown`) → skip the pass entirely (zero peers).** Passing an un-attestable host risks selecting a *same-provider* peer, which would silently defeat cross-model independence — so skip rather than guess. Pass `unknown` (or empty) as the host and the script also fails safe to a clean skip.

**Resolve the peer preference (first match wins), then let the script pick by availability:**

1. A preference the user **states in conversation** (e.g. "use grok for the cross-model pass").
2. `cross_model_peer:` in `.compound-engineering/config.local.yaml` (the only file the script/skill reads for this).
3. A preference already in your **project instructions** (the active instructions in your context) — consumed from context, **never** read from a named file.
4. **Default:** first available provider ≠ host, order `codex → claude → grok → composer`.

Compose the **candidate list** as a comma-separated provider key order with any resolved preference **front-loaded** (e.g. a conversation preference of grok → `grok,codex,claude,composer`; no preference → the default `codex,claude,grok,composer`). Pass the attested `host_provider` and this candidate list to the script — **the script owns availability probing, the grok-CLI→cursor-agent fallback, and the host exclusion**; you own only the context resolution it cannot see (conversation, config, project instructions). A second peer is opt-in only via `CROSS_MODEL_MAX_PEERS=2` (default 1).

## Step 2 — Provider model + high reasoning (owned by the script)

The peer runs on **one model per provider at high reasoning** (composer's `-fast` tier is its ceiling — an accepted exception). The concrete model IDs and per-route reasoning flags live in a **single mapping in the script** (`scripts/cross-model-adversarial-review.sh`, the `M_CODEX`/`M_CLAUDE`/`M_GROK`/`M_GROK_CURSOR`/`M_COMPOSER` constants and the `adapter_argv` builder). This reference deliberately does **not** restate the IDs — one source of truth prevents the reference and script from drifting. The IDs are the current instance of the tier principle (a single maintenance point), not the contract.

The script always uses the adversarial persona brief; fold-in forces `reviewer` to `adversarial-<provider>`.

## Step 3 — Announce

- **Interactive host, default mode:** surface a **prominent standalone line** that frames it as an **independent cross-model adversarial review** (say "cross-model" / "independent model" — not the internal "peer" jargon), names the concrete **model and reasoning level** from the in-script mapping (e.g. GPT-5.6-sol at high reasoning, Opus at high, Grok 4.5 at high, Composer 2.5-fast), and — because two different models can arrive over the *same* `cursor-agent` CLI — names **the route as well as the model** for cursor-agent routes so Grok-4.5-via-cursor-agent, Composer-via-cursor-agent, and Grok-4.5-via-the-grok-CLI are unambiguous, **and states that reviewed code/diff content is sent to that provider** (third-party egress; for cursor-agent routes the egress is to Cursor *plus* the serving provider). **Announce wording follows the receipt:** name a model as serving only where the route carries a served-model receipt; on receipt-less routes say "requested <model>; serving model unverified on this route" instead of asserting the concrete model. Placed with the Stage 3 team announce, not buried after it. Wording is yours; the falsifiable requirements: prominent, reads as a **cross-model reviewer**, names the requested model (with the unverified marker on receipt-less routes), names the route when it is cursor-agent, names the egress.
  - **Fallback egress must not be silent.** The front-loaded provider can be *installed but fail at runtime* (unauthenticated, rate-limited, timeout), and the pass then falls through to the next candidate — and a grok primary can switch from the grok CLI to `cursor-agent`, adding Cursor egress. So the announced primary is **not guaranteed** to be the actual egress target. Two requirements: (1) announce the egress **scope**, not just the primary — state that the review goes to whichever candidate actually runs, and that a fallback in the order (or the cursor-agent route for grok) may receive it if the primary is unreachable; (2) **reconcile after collection** — read the actual provider from the `adversarial-<provider>.json` filename **and the `cross_model_route` field inside it**, which distinguishes a direct `grok-cli` egress (xAI only) from a `grok-cursor` egress that *also* sent content to Cursor. The artifact also carries `model_requested` and `model_actual` next to `cross_model_route`: `model_actual: "unverified"` keeps the requested-plus-unverified wording, and a `model_actual` that mismatches the request must be surfaced prominently — never label the output with the requested model. If the actual provider, route, or served model differs from the announced primary, state what *actually* received/served the review in the Coverage line.
- **Interactive host, no peer resolved** (host un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **`mode:agent`:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that review content was sent cross-model to the named provider, so the third-party data egress is auditable.

## Step 4 — Start the detached peer job (in parallel with the persona reviewers)

The script is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Never hold a tool call open for the peer's runtime** — some harnesses kill long tool calls, which silently vanishes the pass. Start it as a **detached, supervised job** through the bundled runner in one short Bash call (prints the job id in under ~2s), launched **in the same Stage 4 dispatch wave as the persona reviewers** so its runtime overlaps theirs.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-code-review SKILL.md you read>";
python3 "$SKILL_DIR/scripts/peer-job-runner.py" start --skill ce-code-review --run-id "<run-id>" --label adversarial -- bash "$SKILL_DIR/scripts/cross-model-adversarial-review.sh" "<host-provider>" "<candidates>" "<base-ref>" "<run-dir>"
```

- `<run-id>` = the Stage 4 run id (the same one that forms `<run-dir>`); job state lives under `/tmp/compound-engineering/ce-code-review/<run-id>/jobs/<job-id>/`.
- `<host-provider>` = attested key from Step 1 (`codex`/`claude`/`grok`/`composer`, or `unknown` to force a clean skip).
- `<candidates>` = the comma-separated preference-front-loaded provider order from Step 1 (e.g. `codex,claude,grok,composer`). The script excludes the host, applies the `CROSS_MODEL_PEERS` allowlist, walks this order by availability, and picks up to `CROSS_MODEL_MAX_PEERS` (default 1).
- `<base-ref>` = the Stage 1 `BASE` (the diff base the peer reviews via `git diff <base-ref>`).
- `<run-dir>` = the Stage 4 run dir (`/tmp/compound-engineering/ce-code-review/<run-id>/`). The script writes `adversarial-<provider>.json` there **only after** forcing `reviewer` to `adversarial-<provider>` and downgrading peer `safe_auto` → `gated_auto`.

**Poll, don't await.** The runner detaches the worker into its own supervised session, so no tool call ever spans the peer's runtime — this detach-and-poll contract is uniform on every supported host, including hosts where a long-lived call would have worked. Interleave bounded polls (`python3 "$SKILL_DIR/scripts/peer-job-runner.py" wait --max-secs 30 --json <job-id>` — returns early when the job goes terminal) with your remaining Stage 4/5 work. Capture the epoch time right after `start` (`date +%s`) — nothing else tracks wall clock across tool calls. Before the Stage 5 fold-in, loop bounded `wait` until the job is terminal **or 610s have elapsed since the `start`** (compare `date +%s` against the anchor; do not begin a `wait` slice that would extend past the deadline — reap instead). At the deadline `reap <job-id>` if it is still nonterminal, then do one final bounded `wait --max-secs 10 <job-id>` — reap is asynchronous (it signals the supervisor and returns; the terminal record lands up to a grace period later), so a bare `status` immediately after can still read `running`. Fold in the artifact if present. The script self-bounds (codex idle-timeout default 180s with reasoning forced on for liveness; hard backstop `CROSS_MODEL_HARD_SECS` default 600s) and the runner's supervisor backstops it, so the 610s deadline is a last-resort guard, not the normal exit. Done detection stays presence-keyed: the worker itself publishes `<run-dir>/adversarial-<provider>.json` after normalize; absence means the pass didn't run. The script needs no prompt or schema passed in — it reads the persona brief and `findings-schema.json` from the skill dir and reviews the current work tree against `<base-ref>`.

## Step 5 — Fold into Stage 5

- Read the artifact through the runner's verified read — `python3 "$SKILL_DIR/scripts/peer-job-runner.py" result --path <run-dir>/adversarial-<provider>.json` (fd-ownership-checked and bounded; exit 4 = unreadable, treat as no file). If present, treat it as one reviewer return with `reviewer: adversarial-<provider>`, exactly like a persona artifact: its merge-tier fields enter Stage 5 dedup/promotion. If the JSON's `reviewer` field is missing the `-<provider>` suffix (legacy/orphan raw output), **force** it from the filename stem before fold-in — never fold in a bare `adversarial`. Peer returns are a corroboration signal only — never auto-applied (`safe_auto`) and the cross-model bonus caps at one anchor step even if a second opt-in peer also agrees.
- **Never started / not run** — the job was never started (gates not met, host un-attestable, no different provider reachable, CLI missing/unauthed): the pass simply didn't run. Note "cross-model pass: not run" in Coverage on an interactive host in default mode; stay silent in `mode:agent`. Ignore any `*.raw.json` leftovers — they are not fold-in artifacts.
- **Ran but produced no usable output** — the job reached `done` (or any terminal state) yet no `adversarial-<provider>.json` exists (the peer ran and egressed but returned nothing schema-shaped — unparseable output, empty findings the script dropped). Distinct from not-run: note "cross-model pass: peer ran, no usable output" in Coverage on an interactive host. Never fail the review.
- **Started but not `done`** — the final status read reports `failed`, `timeout`, or `died-without-result` (a job reaped at the 610s deadline records `timeout`, with the reap noted in its reason) → still non-blocking, but never silent: name the peer and its terminal state in Coverage (e.g. "cross-model adversarial peer: timeout"). Silent absence stays correct only for passes that never started or were skipped.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- **Classify the skip reason before deleting.** When a peer produced no usable output, ended non-`done`, or was passed over so a fallback candidate served instead, read its `out.log` (in the job dir — the worker logs a bounded `peer skip evidence:` tail of the peer's own output there) *before* the delete step below. If that evidence reads as a **quota / usage-limit exhaustion** — the provider self-reports it ran out (HTTP 402, "usage/balance exhausted", "rate limit", "quota") rather than an ordinary empty or malformed review — name that specifically in Coverage ("cross-model codex peer: skipped — provider usage exhausted; adversarial-grok served instead") instead of the generic wording. Judge from the text, not a fixed error-string list — the shape differs per harness. When the pass runs **more than once in this session** (a loop), do not re-select a route you have already seen exhausted this session: front-load a reachable candidate ahead of it so the retry does not re-spend on the known-dead route. This never changes the non-blocking contract — an exhausted peer is still a clean skip, just a legible one.
- After fold-in (or after deadline reaping), delete the consumed job directory (`/tmp/compound-engineering/ce-code-review/<run-id>/jobs/<job-id>/`) — its log and result are review content and must not outlive their use.
- A finding sharing a dedup fingerprint with the in-process `adversarial` persona promotes by one anchor step — the cross-model agreement signal, the strongest in the set (different model providers, separate processes).

## Trust boundary (maintainers)

The peer reviews the **current work tree** (read-only) against `git diff <base-ref>`. Reviewed code/diff content is sent to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). `CROSS_MODEL_PEERS` restricts which providers may receive content.

**Isolation differs from ce-doc-review by design.** Doc-review embeds a self-contained document into a tool-less empty scratch. Code-review needs surrounding code context, so peers run **in-tree read-only**:

- **codex:** `-s read-only` with cwd at the repo root (may fetch `git diff` itself).
- **claude:** deny mutators / Bash / Task / `mcp__*`; **Read allowed** for context; diff is embedded because Bash is denied.
- **grok / cursor-agent:** ask/dontAsk + no write/force/yolo; Read allowed; workspace/cwd at the repo root.

Impact is bounded to disclosure, not repo mutation. The script's stderr audit log records each send so the egress is auditable even in `mode:agent`.
