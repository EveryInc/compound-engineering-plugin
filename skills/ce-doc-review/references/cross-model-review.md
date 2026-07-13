# Cross-Model Judgment Pass

Runs ce-doc-review's **conditional judgment lenses** through **one different model provider than the host** (auto-chosen from what's available, overridable), in separate read-only, tool-less processes, so their findings are independent of the in-process reviewers. Each peer gets the **same** persona brief the in-process reviewer uses, returns the same `findings-schema.json` shape, and folds into synthesis as reviewer `<reviewer-name>-<provider>` — so agreement between it and the in-process persona promotes the finding (synthesis 3.4 cross-persona agreement; render as `<reviewer-name>, <reviewer-name>-<provider> (+1 anchor)`).

The trio is the three **conditional** judgment lenses whose output diverges most across model families: `adversarial-document-reviewer`, `product-lens-reviewer`, `security-lens-reviewer`. The convergent lenses (`coherence`, `scope-guardian`) and the always-on `feasibility` lens do **not** run cross-model — feasibility is excluded specifically so the pass stays conditional and does not spawn on every review.

All invocation detail (provider→route resolution, availability + classified-failure fallback, composing the prompt from the persona, embedding the document + context slots, read-only tool-less flags, per-provider model, per-route timeouts, capturing schema-shaped JSON, normalizing the reviewer name) lives in the bundled script **`scripts/cross-model-doc-review.sh`**. This reference decides *whether* to run it, *which lenses*, *how the host provider is attested*, and how to fold the results in. The pass is **non-blocking**: the script logs a reason and exits cleanly on any problem, writing no output file — a missing file is simply "no cross-model pass," never a failure.

## Gate — run only when this holds

Run the cross-model pass for a given trio lens **only when that lens was activated** for this document by the normal Phase 1 persona-selection logic. No new activation triggers are introduced: a routine plan with validated upstream provenance and no high-stakes domain activates none of the trio, so it gets no cross-model pass. The document is already guaranteed readable on disk by Phase 1's missing-document gate — there is no diff and no remote-scope concern, so no additional scope gate is needed.

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

All activated lenses run on **one model per provider at high reasoning** (composer's `-fast` tier is its ceiling — an accepted exception). The concrete model IDs and per-route reasoning flags live in a **single mapping in the script** (`scripts/cross-model-doc-review.sh`, the `M_CODEX`/`M_CLAUDE`/`M_GROK`/`M_GROK_CURSOR`/`M_COMPOSER` constants and the `adapter_argv` builder). This reference deliberately does **not** restate the IDs — one source of truth prevents the reference and script from drifting. The IDs are the current instance of the tier principle (a single maintenance point), not the contract.

The **persona file** basename and the **reviewer name** are distinct: the script reads the brief from `references/personas/<persona-file>.md` but forces the fold-in `reviewer` field to `<reviewer-name>-<provider>` so agreement matches the in-process persona's short name. The script derives the persona-file from the allowlisted reviewer-name — it is **not** a caller argument, so no caller value reaches the brief-read path.

## Step 3 — Announce

- **Interactive host, default (non-headless) mode:** surface a **prominent standalone line** that names the chosen peer provider (and model if cheaply known) and states that the judgment lenses are also being reviewed by an independent model provider — placed with the Phase 2 team announce, not buried after it. Wording is yours; the falsifiable requirements: prominent, names the provider, reads as coverage not plumbing.
- **Interactive host, no peer resolved** (host un-attestable, or no different provider installed/authed): one quiet line that the cross-model pass was skipped and why. Never an error.
- **Headless mode:** emit no user-facing prose. The script still emits a one-line stderr audit log per send that document content was sent cross-model to the named provider, so the third-party data egress is auditable even though the pass is silent to the user.

## Step 4 — Run the bundled script (one call per activated trio lens, in parallel with the persona reviewers)

Each call is a CLI shell-out, not a subagent, so it doesn't consume the subagent concurrency budget. **Launch one call per activated trio lens as a background shell process in the same dispatch wave as the in-process persona reviewers** so runtime overlaps, then collect before synthesis.

Invoke via the skill-dir anchor — set `SKILL_DIR` to the absolute directory of **this** skill's `SKILL.md` (the Bash tool's CWD is the user's project, not the skill dir, on every host):

```bash
SKILL_DIR="<absolute path of the directory containing the ce-doc-review SKILL.md you read>";
bash "$SKILL_DIR/scripts/cross-model-doc-review.sh" "<host-provider>" "<candidates>" "<reviewer-name>" "<document-path>" "<document-type>" "<origin>" "<run-dir>"
```

- `<host-provider>` = `XHOST` from Step 1 (`codex`/`claude`/`grok`/`composer`, or `unknown` to force a clean skip).
- `<candidates>` = the comma-separated preference-front-loaded provider order from Step 1 (e.g. `codex,claude,grok,composer`). The script excludes the host, applies the `CROSS_MODEL_PEERS` allowlist, walks this order by availability, and picks up to `CROSS_MODEL_MAX_PEERS` (default 1).
- `<reviewer-name>` = the activated lens (`security-lens`, `adversarial`, or `product-lens`). The script derives the persona-brief filename and (per provider) model from this allowlisted value — the brief path is never caller-controlled.
- `<document-path>` = the document under review.
- `<document-type>` = the Phase 1 classification (`requirements` / `plan` / `unified-requirements` / `unified-plan`).
- `<origin>` = the same `{origin_path}` slot the in-process personas receive.
- `<run-dir>` = a run scratch dir (e.g. `/tmp/compound-engineering/ce-doc-review/<run-id>/`). The script writes `<reviewer-name>-<provider>.json` there per resolved peer.

Set the Bash tool `timeout` to `660000` (11 min) — the script self-bounds (codex idle-timeout default 180s with reasoning forced on for liveness; hard backstop `CROSS_MODEL_HARD_SECS` default 600s) and exits cleanly. If the harness can't background a shell command, run the calls inline before awaiting the reviewers; correctness is unaffected, only wall-clock. The script needs no prompt or schema passed in — it reads the persona brief, `findings-schema.json`, and the document itself from disk.

The cross-model pass does **not** receive the accumulated decision primer that in-process personas get on round 2+ — the peer prompt carries a round-1 framing regardless of round. This is deliberate (cross-model is most valuable on the first pass), and synthesis's own R29/R30 suppression is the authoritative backstop for re-raised or already-resolved findings, so a peer that re-raises a prior-round-rejected finding is dropped at synthesis, not surfaced.

## Step 5 — Fold into synthesis

- Read each `<run-dir>/<reviewer-name>-<provider>.json`. If present, treat it as one reviewer return with `reviewer: <reviewer-name>-<provider>`, exactly like a persona artifact: it enters synthesis 3.3 dedup and 3.4 cross-persona agreement promotion. Peer returns are a corroboration signal only — synthesis never auto-applies them (`safe_auto`) and caps the cross-model bonus at one anchor step even if a second opt-in peer also agrees.
- **No file** (script skipped: host un-attestable, no different provider reachable, CLI missing/unauthed, timeout, unparseable output, or lens not activated) → the pass simply didn't run for that lens. Note "cross-model pass: not run" in Coverage on an interactive host in default mode; stay silent in headless mode. Never fail the review.
- Empty `findings` → note "cross-model pass: no additional issues" in Coverage.
- A finding sharing a dedup fingerprint with its in-process twin (`<reviewer-name>`) promotes by one anchor step (synthesis 3.4) — the cross-model agreement signal, the strongest in the set (different model providers, separate processes).

## Trust boundary (maintainers)

The script embeds the **full document content** into the peer prompt and sends it to an external model provider (OpenAI, Anthropic, xAI, or Cursor, depending on the resolved peer). This is a wider egress than a diff-only review. `CROSS_MODEL_PEERS` restricts which providers may receive content. The peer runs strictly read-only and **tool-less** — every route denies file reads, web, MCP, and subagents where the CLI supports it (codex `-s read-only` in an empty scratch dir; claude/grok deny `Read`/`Edit`/`Write`/`Bash`/`Task`/web/`mcp__*`), and the cursor-agent routes run `--mode ask --sandbox enabled --workspace <scratch>`. Impact is bounded to disclosure, not repo mutation — and a document from an untrusted author is a prompt-injection surface contained by the read-only, tool-less posture to disclosure-to-self.

**Accepted residual (cursor-agent routes):** `cursor-agent --mode ask` is read-only but cannot fully disable its Read tool, so the grok-fallback and composer routes are a weaker isolation posture than the deny-Read CLIs. This is an accepted risk for ce-doc-review's own-document threat model — the reviewed documents are the maintainer's own planning docs, and the host agent already runs in-repo with strictly more privilege than any peer, so a weaker peer isolation on those two routes adds no materially new exposure. The script's stderr audit log records each send so the egress is auditable even in headless mode.
