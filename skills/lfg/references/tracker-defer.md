# Tracker Detection and Defer Execution

This reference covers how residual actionable findings are filed in the project's tracker. `lfg` loads it in **Non-interactive mode** — the only mode it supports.

---

## Non-interactive mode

All blocking questions are skipped; the fallback chain is executed silently in order. Behavior:

- No confirmation before the first Defer; proceed directly.
- On execution failure, automatically fall to the next tier without prompting. Record the failure.
- On total chain exhaustion (every tier failed or no sink available), return findings in the `no_sink` bucket so the caller can route them to another surface (e.g., a committed residual-findings record file).
- Return a structured result: `{ filed: [{ finding_id, tracker, url }], failed: [{ finding_id, tracker, reason }], no_sink: [{ finding_id, title, severity, file, line }] }`.

The caller decides how to surface the result to the user. "No sink available" is a data-producing outcome, not a prompt trigger.

---

## Detection

The agent determines the project's tracker from whatever documentation is obvious. Primary source: the project's active instructions and conventions already in its context — no need to open or name specific instruction files. Read a file directly only when the relevant instructions aren't already in context: a subdirectory-scoped instruction file governing the area you're working in, or when you're a fresh subagent that wasn't given the project's instructions. Supplementary signals (when primary documentation is ambiguous): `CONTRIBUTING.md`, `README.md`, PR templates under `.github/`, visible tracker URLs in the repo.

A tracker can be surfaced via MCP tool (e.g., a Linear MCP server), CLI (e.g., `gh`), or direct API. All are acceptable. The detection output is a tuple with two availability flags — one for the named tracker specifically and one for the full fallback chain:

```
{ tracker_name, named_sink_available, any_sink_available }
```

Where:
- `tracker_name` — human-readable name ("Linear", "GitHub Issues", "Jira"), or `null` when detection cannot identify a specific tracker
- `named_sink_available` — `true` only when the agent can actually invoke the detected tracker (MCP tool is loaded, CLI is authenticated, or API credentials are in environment); `false` when the tracker is documented but no tool reaches it, or when no tracker is found at all
- `any_sink_available` — `true` when any tier in the fallback chain (named tracker or GitHub Issues via `gh`) can be invoked this session. Drives the `no_sink` bucket.

Detection is reasoning-based. Do not maintain an enumerated checklist of files to read. Read the obvious sources and form a confident conclusion.

---

## Probe timing and caching

Availability probes run **at most once per session** and **only when Defer execution is imminent**. Never speculatively at review start, never per-Defer, never per-finding. The cached tuple is reused for every Defer action in the same run.

Typical probe sequence:

1. Consult the project's instructions already in context for tracker references — don't open or name specific instruction files; read one directly only when the relevant instructions aren't in context (subdirectory scope, or a fresh subagent). If nothing found, set `tracker_name = null`.
2. **Probe the named tracker when one was found.** For GitHub Issues, run `gh auth status` and `gh repo view --json hasIssuesEnabled`. For Linear or other connector/MCP-backed trackers, first discover available tools via the platform's tool-discovery primitive (e.g., `ToolSearch` in Claude Code) rather than assuming absence from an unloaded tool, then verify the discovered tool is responsive. For API-backed trackers, verify credentials wherever the platform exposes them (environment, connector auth, or a documented secrets location) — not only shell env vars. Set `named_sink_available` from the probe result.
3. **Probe the GitHub Issues fallback to compute `any_sink_available`.** Even when the named tracker was found and probed, `gh` matters for the `no_sink` bucket decision so that a run with no documented tracker but working `gh` still files tickets.
   - If `named_sink_available = true`: `any_sink_available = true` (no further probes needed).
   - Otherwise, probe GitHub Issues via `gh auth status` + `gh repo view --json hasIssuesEnabled` (skip if already probed in step 2). If it works, `any_sink_available = true`.
   - Otherwise, `any_sink_available = false`.

When the cached tuple is reused across a session, any `named_sink_available = true` from the session's first probe stays cached — do not re-probe per Defer.

---

## Fallback chain

When the named tracker is unavailable or no tracker is named, fall back in this order. Prefer the project's detected tracker; use `gh` only when no named tracker was found or the named one is unreachable.

1. **Named tracker** (MCP tool, CLI, or API the agent can invoke directly, identified via Detection above)
2. **GitHub Issues via `gh`** — when `gh auth status` succeeds and the current repo has issues enabled (`gh repo view --json hasIssuesEnabled` returns `true`)
3. **No sink** — findings are returned in the `no_sink` bucket for the caller to route.

Do not add an in-session task list as a tier. In-session tasks do not survive past the session, so they fail the "durable filing" intent of a Defer action. When no durable tracker exists, the correct behavior is to return the findings to the caller.

---

## Ticket composition

Every Defer action creates a ticket with the following content, adapted to the tracker's capabilities:

- **Title:** the merged finding's `title` (schema-capped at 10 words).
- **Body:**
  - Plain-English problem statement — reads the persona-produced `why_it_matters` from the contributing reviewer's artifact file at `<artifact-path>/{reviewer}.json`, matched on `file + line_bucket(line, +/-3) + normalize(title)`. Falls back to the merged finding's `title`, `severity`, `file`, and `suggested_fix` (when present) when no artifact match is available — these fields are guaranteed in the merge-tier compact return.
  - Suggested fix (when present in the finding's `suggested_fix`).
  - Evidence (direct quotes from the reviewer's artifact).
  - Source: a link to the PR carrying this change when one already exists at filing time; otherwise the branch and head commit SHA, so the ticket points at the code even before a PR is opened. When the same run opens a PR after the ticket is filed, back-fill the PR link into the ticket (best-effort; never block shipping on the update).
  - Metadata block: `Severity: <level>`, `Confidence: <score>`, `Reviewer(s): <list>`, `Finding ID: <fingerprint>`.
- **Labels** (when the tracker supports labels): severity tag (`P0`, `P1`, `P2`, `P3`) and, when the tracker convention supports it, a category label sourced from the reviewer name.
- **Length cap:** when the composed body would exceed a tracker's body length limit, truncate with `... (continued in ce-code-review run artifact: <artifact-path>/)` and include the finding_id in both the truncated body and the metadata block so the artifact is discoverable.

The finding_id is a stable fingerprint composed as `normalize(file) + line_bucket(line, +/-3) + normalize(title)` — the same fingerprint used by the merge pipeline.

---

## Failure path

When ticket creation fails at execution (API error, auth expiry mid-session, rate limit, malformed body rejected, 4xx/5xx response): do not prompt. Automatically fall through to the next tier. If every tier fails, record the finding in the `failed` bucket of the structured return and continue. If the chain exhausts with no sink ever available, the finding ends up in the `no_sink` bucket.

When a named tracker fails at execution, the cached `named_sink_available` is set to `false` for the rest of the session. Subsequent Defer actions fall straight through to the next tier without retrying a confirmed-broken sink. `any_sink_available` is only downgraded to `false` when every tier has been confirmed broken — a failed Linear call that succeeds via `gh` keeps `any_sink_available = true`.

---

## Per-tracker behavior

Concrete behavior per tracker at execution time. The agent may invoke any of these through the appropriate interface (MCP, CLI, or API) — the choice depends on what is available in the current environment.

| Tracker | Interface | Invocation sketch | Body format | Labels |
|---------|-----------|-------------------|-------------|--------|
| Linear | MCP (preferred) or API | Create issue in the project/workspace identified by documentation; assign to the reporter if the MCP tool exposes user context | Markdown | Severity priority field if the MCP exposes it; otherwise include severity in body |
| GitHub Issues | `gh issue create` | Repo defaults to the current repo. Use `--label` for severity tag when labels exist; omit `--label` if the repo has no label fixture. Fall back to a label-less issue on first failure. | Markdown | `--label P0` / `--label P1` / etc. when labels exist |
| Jira | MCP or API | Create issue in the project identified by documentation; Jira's markdown dialect differs from GitHub's — use plain text in the body when MCP does not handle conversion | Plain text when MCP does not handle markdown | Severity priority field |
| No sink available | — | Findings returned in the `no_sink` bucket for caller routing. | — | — |

A Defer that produces no durable artifact and no entry in the structured return is data loss. Every finding handed in must come back in exactly one of `filed`, `failed`, or `no_sink`.
