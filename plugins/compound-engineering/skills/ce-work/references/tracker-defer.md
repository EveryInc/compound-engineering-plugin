# Tracker Detection and Defer Execution

How residual actionable findings are filed in the project's tracker. Loaded by caller workflows (e.g., `ce-work` Residual Work Gate), not by `ce-code-review`, which stops after the report.

---

## Execution Modes

Two execution modes. The caller selects one; detection, fallback chain, and ticket composition are shared.

### Interactive mode

Used by `ce-work` Residual Work Gate and similar flows when the user chooses to file tickets. All user-facing prompts fire:

- The session's first Defer with a generic (non-named) label confirms the effective tracker choice.
- Execution failures prompt with Retry / Fall back to next sink / Convert to Skip.
- Routing-question labels reflect `named_sink_available` (name the tracker) vs fallback generics.

### Non-interactive mode

Used by autonomous callers that must not prompt. All blocking questions are skipped; the fallback chain runs silently in order:

- No confirmation on the first generic-label Defer; proceed directly.
- On execution failure, fall to the next tier automatically without prompting. Record the failure.
- On total chain exhaustion (every tier failed or no sink available), return findings in the `no_sink` bucket so the caller can route them elsewhere (e.g., inline in a PR description).
- Return a structured result: `{ filed: [{ finding_id, tracker, url }], failed: [{ finding_id, tracker, reason }], no_sink: [{ finding_id, title, severity, file, line }] }`.

The caller decides how to surface the result. Non-interactive mode treats "no sink available" as a data-producing outcome, not a prompt trigger.

---

## Detection

Determine the project's tracker from whatever documentation is obvious. Primary sources: `CLAUDE.md` and `AGENTS.md` at the repo root and relevant subdirectories. Supplementary (when primary documentation is ambiguous): `CONTRIBUTING.md`, `README.md`, PR templates under `.github/`, visible tracker URLs in the repo.

A tracker can be reached via MCP tool (e.g., a Linear MCP server), CLI (e.g., `gh`), or direct API; all are acceptable. The detection output is a tuple with two availability flags: one for the named tracker (drives label confidence in Interactive mode), one for the full fallback chain (drives whether Defer is offered at all):

```
{ tracker_name, confidence, named_sink_available, any_sink_available }
```

Where:
- `tracker_name` -- human-readable name ("Linear", "GitHub Issues", "Jira"), or `null` when no specific tracker is identified
- `confidence` -- `high` when the tracker is named explicitly in documentation (or via a linked URL to a specific project/workspace) and is unambiguously the project's canonical tracker; `low` when the signal is thin, conflicting, or only implied
- `named_sink_available` -- `true` only when the agent can actually invoke the detected tracker (MCP tool loaded, CLI authenticated, or API credentials in environment); `false` when the tracker is documented but unreachable, or no tracker is found. Inline tracker naming requires this `true`.
- `any_sink_available` -- `true` when any fallback-chain tier (named tracker or GitHub Issues via `gh`) can be invoked this session. Drives whether Defer is offered (Interactive mode) and the `no_sink` bucket (Non-interactive mode).

Detection is reasoning-based; do not maintain an enumerated checklist of files to read. Read the obvious sources and form a confident conclusion; when they don't resolve, the label falls back to generic wording and the agent confirms with the user before executing (Interactive mode only).

---

## Probe timing and caching

Availability probes run **at most once per session** and **only when Defer execution is imminent**: never speculatively at review start, never per-Defer, never per-walk-through-finding. Reuse the cached tuple for every Defer action in the same run.

Typical probe sequence:

1. Read `CLAUDE.md` / `AGENTS.md` for tracker references. If nothing found, set `tracker_name = null`, `confidence = low`.
2. **Probe the named tracker when one was found.** GitHub Issues: `gh auth status` and `gh repo view --json hasIssuesEnabled`. Linear or other MCP-backed trackers: verify the MCP tool is loaded and responsive. API-backed trackers: verify credentials in environment. Set `named_sink_available` from the result.
3. **Probe the GitHub Issues fallback to compute `any_sink_available`.** Even after probing a found named tracker, `gh` matters for the `no_sink` bucket so a run with no documented tracker but working `gh` still offers Defer.
   - `named_sink_available = true`: `any_sink_available = true` (no further probes).
   - Otherwise, probe GitHub Issues via `gh auth status` + `gh repo view --json hasIssuesEnabled` (skip if already probed in step 2). If it works, `any_sink_available = true`; else `false`.

When Interactive mode's routing question is skipped (R2 zero-findings case), no probes run. A session's first-probe `named_sink_available = true` stays cached; do not re-probe per Defer.

---

## Label logic (Interactive mode)

- `confidence = high` AND `named_sink_available = true`: the routing question's option C and the walk-through's per-finding Defer option both include the tracker name verbatim, e.g. `File a Linear ticket per finding`, `Defer: file a Linear ticket`.
- `any_sink_available = true` but either `confidence = low` or `named_sink_available = false` (a fallback tier is working): labels read generically, `File an issue per finding`, `Defer: file a ticket`. Before the session's first Defer, the agent confirms the effective tracker choice via the platform's blocking question tool.
- `any_sink_available = false`: option C is omitted from the routing question, option B (Defer) is omitted from the walk-through per-finding options, and the agent says why in the routing question's stem.

Non-interactive mode skips label decisions; it acts silently on the detected sink.

---

## Fallback chain

When the named tracker is unavailable or none is named, fall back in this order. Prefer the project's detected tracker; use `gh` only when no named tracker was found or the named one is unreachable.

1. **Named tracker** (MCP tool, CLI, or API the agent can invoke directly, identified via Detection above)
2. **GitHub Issues via `gh`** when `gh auth status` succeeds and the repo has issues enabled (`gh repo view --json hasIssuesEnabled` returns `true`)
3. **No sink:** findings remain in the review report's residual-work section (Interactive mode) or are returned in the `no_sink` bucket for the caller to route (Non-interactive mode). The agent does not re-display them through a transient surface.

This chain previously included a third in-session fallback tier, removed because in-session tasks do not survive past the session and so do not meet the "durable filing" intent of a Defer. With no durable tracker, leave findings in the report (Interactive) or return them to the caller (Non-interactive).

---

## Ticket composition

Every Defer action creates a ticket, adapted to the tracker's capabilities:

- **Title:** the merged finding's `title` (schema-capped at 10 words).
- **Body:**
  - Plain-English problem statement: reads the persona-produced `why_it_matters` from the contributing reviewer's artifact at `/tmp/compound-engineering/ce-code-review/<run-id>/{reviewer}.json`, using the same `file + line_bucket(line, +/-3) + normalize(title)` matching agent mode uses (see SKILL.md Stage 6 detail enrichment). With no artifact match, falls back to the merged finding's `title`, `severity`, `file`, and `suggested_fix` (when present), guaranteed in the merge-tier compact return.
  - Suggested fix (when present in `suggested_fix`).
  - Evidence (direct quotes from the reviewer's artifact).
  - Metadata block: `Severity: <level>`, `Confidence: <score>`, `Reviewer(s): <list>`, `Finding ID: <fingerprint>`.
- **Labels** (when supported): severity tag (`P0`, `P1`, `P2`, `P3`), plus a category label from the reviewer name when the tracker convention supports it.
- **Length cap:** when the body would exceed a tracker's length limit, truncate with `... (continued in ce-code-review run artifact: /tmp/compound-engineering/ce-code-review/<run-id>/)` and include the finding_id in both the truncated body and the metadata block so the artifact is discoverable.

The finding_id is a stable fingerprint `normalize(file) + line_bucket(line, +/-3) + normalize(title)`, the same fingerprint the merge pipeline uses.

---

## Failure path

When ticket creation fails at execution (API error, auth expiry mid-session, rate limit, malformed body rejected, 4xx/5xx response):

**Interactive mode:** surface the failure inline and ask the user via the platform's blocking question tool.

Stem:
> Defer failed: <tracker name> returned <error summary>. How should the agent handle this finding?

Options:
- `Retry on <tracker>` -- re-attempt the same tracker once (useful for transient errors)
- `Fall back to next sink` -- move this Defer to the next fallback-chain tier (e.g., Linear to GitHub Issues)
- `Convert to Skip: record the failure` -- abandon this Defer, note it in the completion report's failure section, continue the walk-through or bulk flow

**Non-interactive mode:** do not prompt; fall through to the next tier automatically. If every tier fails, record the finding in the `failed` bucket of the structured return and continue. If the chain exhausts with no sink ever available, the finding ends up in the `no_sink` bucket.

When a high-confidence named tracker fails at execution, cached `named_sink_available` is set `false` for the rest of the session; subsequent Defers fall straight through to the next tier without retrying a confirmed-broken sink. `any_sink_available` downgrades to `false` only when every tier is confirmed broken; a failed Linear call that succeeds via `gh` keeps it `true`.

Fall back to numbered options and waiting for the user's reply only when `ToolSearch` returns no match, the tool call errors, or the platform has no blocking question tool (Interactive mode only).

---

## Per-tracker behavior

Concrete behavior per tracker at execution time. The agent invokes any of these through the appropriate interface (MCP, CLI, or API), depending on what the current environment offers.

| Tracker | Interface | Invocation sketch | Body format | Labels |
|---------|-----------|-------------------|-------------|--------|
| Linear | MCP (preferred) or API | Create issue in the project/workspace identified by documentation; assign to the reporter if the MCP tool exposes user context | Markdown | Severity priority field if the MCP exposes it; otherwise include severity in body |
| GitHub Issues | `gh issue create` | Repo defaults to the current repo. Use `--label` for severity tag when labels exist; omit `--label` if the repo has no label fixture. Fall back to a label-less issue on first failure. | Markdown | `--label P0` / `--label P1` / etc. when labels exist |
| Jira | MCP or API | Create issue in the project identified by documentation; Jira's markdown dialect differs from GitHub's, so use plain text in the body when MCP does not handle conversion | Plain text when MCP does not handle markdown | Severity priority field |
| No sink available | n/a | Interactive: Defer option omitted, findings remain in the report's residual-work section. Non-interactive: findings returned in the `no_sink` bucket for caller routing. | n/a | n/a |

When uncertain, prefer "drop with explicit user-facing notice" over "pass through silently and hope." A Defer that produces no durable artifact and no user message is data loss.

---

## Cross-platform notes

The question-tool name varies by platform. In Interactive mode, use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi via the `pi-ask-user` extension). In Claude Code it should already be loaded from the Interactive-mode pre-load step; if not, call `ToolSearch` with query `select:AskUserQuestion` now. Fall back to numbered options in chat only when the harness genuinely lacks a blocking tool (`ToolSearch` returns no match, the tool call fails, or the runtime mode does not expose it, e.g. Codex edit modes without `request_user_input`). A pending schema load is not a fallback trigger. Never silently skip the question.

Non-interactive mode is platform-agnostic: it never prompts, so the platform's question tool is not relevant.
