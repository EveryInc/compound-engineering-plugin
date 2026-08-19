# Arguments, modes, and the deliverable

Read this at Stage 0, before scope resolution. It owns argument parsing, the conflicting-argument stop classes, the quick-review short-circuit, and what each mode returns.

## Argument Parsing

Parse the arguments you were invoked with for optional tokens. Strip each recognized token before interpreting the remainder as a PR number, GitHub URL, or branch name.

| Token | Example | Effect |
|-------|---------|--------|
| `mode:agent` | `mode:agent` | **Report-only**: return **JSON** instead of markdown tables and skip the Stage 5c apply (the caller applies). Does not change reviewer selection, merge logic, or scope rules (see Output format) |
| `mode:headless` | `mode:headless` | **Deprecated alias** for `mode:agent` |
| `mode:report-only` | `mode:report-only` | **Deprecated — ignored.** Former no-artifacts mode; default behavior is review-only without checkout |
| `apply:local` | `apply:local` | Explicitly authorize Stage 5c to apply verified findings to the reviewed local checkout. This is authority, not an output mode; bare review remains report-only. |
| `base:<sha-or-ref>` | `base:abc1234` or `base:origin/main` | Diff base on the **current checkout** (explicit; skips auto base detection) |
| `plan:<path>` | `plan:<root>/plans/2026-03-25-001-feat-foo-plan.md` | Plan file for requirements verification (explicit). Supports markdown and HTML unified plans. |
| `depth:full` | `depth:full` | **Force the full reviewer roster** — skip the Stage 3c small-diff lite path so every always-on persona runs regardless of diff size. Use when a deep/thorough review is explicitly requested (the one escalation signal Stage 3c cannot infer from the diff). Does not change conditional selection, merge, or scope. |
| `depth:auto` | `depth:auto` | **Default** — self-right-size via Stage 3c (lite roster for trivial, low-risk, code-only diffs; full roster otherwise). |
| `grouping:auto` | `grouping:auto` | **Default** — build thematic triage groups when findings span distinct concerns (Stage 5 step 9b) |
| `grouping:off` | `grouping:off` | Suppress triage groups: no Triage Groups section, empty `triage_groups` in JSON |
| `grouping:always` | `grouping:always` | Always build triage groups, even for small reviews |

**Grouping is presentation, not a mode.** The `grouping:` tokens change how the finding set is organized for triage — never reviewer selection, merge logic, scope rules, or the Stage 5c apply decision.

**Mode alias:** `mode:headless` normalizes to `mode:agent`. `mode:agent` + `mode:headless` is not a conflict. `mode:non-interactive` is **not** an alias for `mode:agent` — that token means “suppress prompts” in other CE skills; if it appears here, treat it as an unrecognized/conflicting `mode:` token and stop (fail closed).

**Conflicting arguments:** Stop without dispatching reviewers when:
- Multiple incompatible scope selectors appear together (e.g. `base:` **and** a PR number/branch target — `base:` means "review the current checkout against this base")
- Multiple distinct `mode:` tokens other than the `mode:agent`/`mode:headless` alias pair
- `mode:non-interactive` (alone or with other modes) — not valid for this skill; use `mode:agent` for JSON
- `apply:local` together with `mode:agent` — pipeline handoffs are always report-only
- Multiple distinct `grouping:` tokens (e.g. `grouping:off` **and** `grouping:always`)

Deprecated `mode:autofix` is **not** a conflict — ignore the token and proceed with the normal flow (see below).

Emit a one-line failure reason. In `mode:agent`, return JSON: `{"status":"failed","reason":"..."}`.

## Output format

| Invocation | Deliverable |
|------------|-------------|
| **Default** | Report-only markdown (pipe-delimited finding tables) + Actionable Findings summary |
| **Explicit local apply** | The same markdown report plus verified local fixes and an Applied section |
| **`mode:agent`** | One JSON object (see ### JSON output format below) + the same `/tmp/.../ce-code-review/<run-id>/` artifacts |

Default and `mode:agent` are **report-only**. `mode:agent` changes only the serialization from markdown to JSON for programmatic callers; it does not change reviewer selection, merge logic, or scope rules. `apply:local` is separate mutation authority, not an output mode. The default markdown is the human view; keep it ASCII-safe (pipe tables, `->` not middot `·`, no box-drawing) so it degrades gracefully across terminals.

## Quick Review Short-Circuit

If the invocation arguments indicate the user wants a quick, fast, or light code review — and **`mode:agent` is not active** — do not dispatch the multi-agent flow.

**Announce the chosen path** before any other work (Quick review vs Multi-agent review). Skip this announcement when `mode:agent` is active.

Sequence:

1. **Run the harness's built-in code review.** Forward any review target after stripping tokens. Then stop — do not dispatch the multi-agent pipeline.
2. **Exemption:** If no built-in review exists, continue into the full multi-agent review.
3. **`mode:agent` bypasses this short-circuit** — always run the full multi-agent review and return JSON.

**Deprecated:** `mode:autofix` is no longer supported. If passed, ignore it and proceed report-only; it does not grant local apply authority.

## After Review

After Stage 6, stop. When local apply was explicitly authorized, Stage 5c may already have applied and, on a clean pre-review tree, committed verified fixes. Otherwise the caller or user decides what to apply from the report and artifacts.

### Emit actionable findings summary (default mode only)

After Stage 6 **in default mode**, emit a compact **Actionable Findings** summary for callers:

- List each actionable finding (`gated_auto` or `manual` with `downstream-resolver`) with stable `#`, severity, file:line, title, `autofix_class`, whether `suggested_fix` is present, and `confidence`.
- Include the resolved run-artifact path when one was written.
- When the actionable queue is empty, state `Actionable findings: none.` explicitly.

In `mode:agent` do **not** emit this markdown summary — the actionable findings are carried solely by the `actionable_findings` field of the JSON object. Emit nothing after the JSON object, so the response stays a single parseable JSON value.

Do not run post-review triage (no per-finding walk-through, bulk ticket filing, or routing questions). The report and summary are the complete handoff.

### Mode-specific completion

| Mode | After Stage 6 + actionable summary |
|------|-----------------------------------|
| **Default** | Markdown tables + Actionable Findings summary. |
| **`mode:agent`** | JSON object + `review.json` in run artifact dir. |

Do not offer push/PR/create-branch next steps from this skill.

#### Run artifacts

Always write run artifacts under the resolved `<run-dir>`:

- synthesized findings
- actionable findings list
- advisory outputs
- per-agent `{reviewer_name}.json` from Stage 4
- `adversarial-review-brief.md` when the cross-model route starts — the orchestrator's compact semantic divisions, never a copied diff
- `report.md` — the rendered markdown report exactly as presented to the user (default mode only), so format and numbering stay auditable after the run

`metadata.json` minimum fields:

```json
{
  "run_id": "<run-id>",
  "branch": "<git branch --show-current at dispatch time>",
  "head_sha": "<git rev-parse HEAD at dispatch time>",
  "verdict": "<Ready to merge | Ready with fixes | Not ready>",
  "completed_at": "<ISO 8601 UTC timestamp>"
}
```

Capture `branch` and `head_sha` at dispatch time (no in-skill fixes will land afterward).

## Fallback

If the platform doesn't support parallel sub-agents, run reviewers sequentially. If the platform supports sub-agents but caps active concurrency, use the bounded queueing rules in Stage 4 rather than treating cap-related spawn failures as reviewer failures. Everything else (stages, output format, merge pipeline) stays the same.
