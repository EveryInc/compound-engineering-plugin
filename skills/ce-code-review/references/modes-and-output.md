# Arguments, modes, and the deliverable

Read this at Stage 0, before scope is resolved. It defines how to parse the arguments, which argument combinations stop the review, the quick-review short-circuit, and what each mode returns.

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
| `depth:full` | `depth:full` | **Force the full spine** — skip the Review depth gate's lite and focused paths. Use when a deep/thorough review is explicitly requested (the one override the gate cannot infer). Does not change conditional selection, merge, or scope on the full path. |
| `depth:auto` | `depth:auto` | **Default** — this skill self-sizes via the Review depth gate after Stage 1. Callers do not classify. |
| `grouping:auto` | `grouping:auto` | **Default** — build thematic triage groups when findings span distinct concerns (Stage 5 step 9b) |
| `grouping:off` | `grouping:off` | Suppress triage groups: no Triage Groups section, empty `triage_groups` in JSON |
| `grouping:always` | `grouping:always` | Always build triage groups, even for small reviews |

**Grouping is presentation, not a mode.** The `grouping:` tokens change how the finding set is organized for triage — never reviewer selection, merge logic, scope rules, or the Stage 5c apply decision.

**Mode alias:** `mode:headless` normalizes to `mode:agent`. `mode:agent` + `mode:headless` is not a conflict. `mode:non-interactive` is **not** an alias for `mode:agent` — that token means “suppress prompts” in other CE skills; if it appears here, treat it as an unrecognized, conflicting `mode:` token and stop rather than guessing what was meant.

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
| **`mode:agent`** | One JSON object (see ## JSON output format below) + the same `/tmp/.../ce-code-review/<run-id>/` artifacts |

Default and `mode:agent` are **report-only**. `mode:agent` changes only the serialization from markdown to JSON for programmatic callers; it does not change reviewer selection, merge logic, or scope rules. `apply:local` is separate mutation authority, not an output mode. The default markdown is the human view; keep it ASCII-safe (pipe tables, `->` not middot `·`, no box-drawing) so it degrades gracefully across terminals.

## Quick Review Short-Circuit

If the invocation arguments indicate the user wants a quick, fast, or light code review — and **`mode:agent` is not active** — do not dispatch the multi-agent flow.

**Announce the chosen path** before any other work (Quick review vs Multi-agent review). Skip this announcement when `mode:agent` is active.

Sequence:

1. **Run the harness's built-in code review.** Forward any review target after stripping tokens. Then stop — do not dispatch the multi-agent pipeline.
2. **Exemption:** If no built-in review exists, continue into the full multi-agent review.
3. **`mode:agent` bypasses this short-circuit only.** It still self-sizes through the Review depth gate and returns JSON from whichever path that gate selects.

**Deprecated:** `mode:autofix` is no longer supported. If passed, ignore it and proceed report-only; it does not grant local apply authority.

## Review depth

Decide after Stage 1 (its 1b facts and 1c mapping), before reading any later reference. This skill owns the decision; a caller may pass `depth:full` but never a depth of its own. Three paths exist: **lite** (this context alone), **focused** (this context plus one independent adversarial read), and **full** (the multi-agent spine from Stage 2).

Floors that run the full spine from Stage 2, whatever the diff looks like: `depth:full`; the helper's `hard_block_full` (the helper reports facts. It never awards lite. `hard_block_full` is a floor, and it covers a named hard-block class, any file the helper could not count, and a `size_band` of `large`, which means the executable non-test changed lines reached the full floor); a Stage 1c criteria search that failed or whose scope is uncertain; and apply authority (`apply:local` or an explicit apply request), which needs Stage 5c's verified-apply mechanics. Line counts below the floor, prose and test volume, `unclassified_lines`, and `signals` are prompts to consider, not floors.

With no floor set, read the Stage 1 diff and decide whether a wrong version of this change would fail loudly where it is made, or silently somewhere else. It fails silently when it would break a silent-pass guard, an auth / money / data boundary, or a public contract, or would let a system degrade under load, failure, or contention with no error at the change site (retry, timeout, ordering, locking, background work). Executable code the helper could not name, visible in `unclassified_lines` under its extension, is executable code for this question; a markdown or data file listed there is what it is. Loud and local → lite. Silent, or unsure → focused, unless the silent failure sits on an auth, money, or public-contract boundary, where the specialist lenses only the full spine carries are the point: then continue from Stage 2.

A helper-named silent-pass class (`silent_pass_classes`, today the CI workflow paths) is a floor on the lens, not on depth: the change can never take lite, because the guard needs the adversarial read the focused path carries, and consequence still decides focused versus full as above. On the focused path that guard gets correctness and the one independent adversarial read and no standards, testing, or security persona; a workflow change that handles credentials, tokens, or permissions is an auth boundary and goes to full by the sentence above.

A floor cannot be talked down, and a path may only move toward full: lite never becomes the answer once the diff reads silent or the helper named a silent-pass class, and focused never replaces a floor.

When the gate selects lite or focused, read `references/depth-paths.md` at that point and run the selected path from this context; the full spine continues from Stage 2 and never opens that file. Either way, close the scope stage with the decision: the stage-log call from `references/scope.md` with `--end scope --start review` (lite, focused) or `--end scope --start select` (full), carrying `--fact` entries for `exec_nontest_lines`, `changed_lines`, `size_band`, `unclassified_lines`, and `depth`.

## Run artifacts

Every run, lite, focused, or full, leaves its receipt (`review.json` in `mode:agent`, `report.md` in default mode), `stages.jsonl` (the stage log `references/scope.md` opens), and `metadata.json` in the run directory. `metadata.json` minimum fields:

```json
{
  "run_id": "<run-id>",
  "branch": "<git branch --show-current at dispatch time>",
  "head_sha": "<git rev-parse HEAD at dispatch time>",
  "verdict": "<Ready to merge | Ready with fixes | Not ready>",
  "completed_at": "<ISO 8601 UTC timestamp>"
}
```

After `metadata.json` is written, the receipt writer runs `run-log.py summarize --run-dir "$RUN_DIR"` (the same `SKILL_DIR` and interpreter recipe as the stage log) as its last action before returning or emitting the receipt; it is the only writer that touches `metadata.json` after the receipt write, and it merges a `cost` object into the existing fields: `status` (`complete` when every started stage ended and the receipt stage is present, else `partial`), `host`, `scope` (the helper facts and chosen depth from the scope stage), `stages` (name, elapsed seconds, reviewers, candidates, tokens when present), `totals` (elapsed, reviewers, candidates produced by the review, peer, and dispatch stages, artifact bytes, tokens when any stage carried them), `peer` (from `adversarial-<provider>-usage.json` when present), and `truncated_events`. A run killed mid-way leaves a parseable partial log, and a maintainer tuning `FULL_EXEC_LINE_MIN` or another threshold reads `cost.status` before trusting a run's numbers.

The full path adds the artifacts listed under "Run artifacts" in `references/finish-input.md`.

## JSON output format (`mode:agent` only)

One definition for every depth path. Emit **one raw JSON object** as the primary response: a single bare JSON value, **no markdown code fence**. A leading ```` ```json ```` fence makes the response start with backticks and breaks naive `JSON.parse` consumers, so never wrap it. Also write `review.json` under the resolved `<run-dir>` with the same payload.

`mode:agent` does not apply fixes (the caller does), so there is no `applied_fixes` field; the handoff is `actionable_findings`. Applied work appears only in explicitly authorized local-apply markdown runs (Stage 5c/6).

Minimum shape:

```json
{
  "status": "complete",
  "verdict": "Ready to merge | Ready with fixes | Not ready",
  "scope": {
    "base": "<merge-base sha, pr:NNN marker, or base: ref>",
    "branch": "<current branch name>",
    "head_sha": "<git rev-parse HEAD>",
    "pr_url": "<url or null>",
    "files_changed": 0
  },
  "intent": "<2-3 line summary>",
  "intent_confidence": "explicit | inferred | uncertain",
  "reviewers": ["correctness"],
  "findings": [],
  "actionable_findings": [],
  "triage_groups": [],
  "pre_existing_findings": [],
  "requirements_completeness": null,
  "learnings": [],
  "agent_native_gaps": [],
  "deployment_notes": [],
  "residual_risks": [],
  "testing_gaps": [],
  "coverage": {"depth": "lite | focused | full"},
  "artifact_path": "<resolved-run-dir>",
  "run_id": "<run-id>"
}
```

Lite fills `findings`, `actionable_findings`, `testing_gaps`, `residual_risks`, and `requirements_completeness` (`null` only when no plan was found) from its own review. The arrays owned by reviewers it did not run (`learnings`, `agent_native_gaps`, `deployment_notes`, `pre_existing_findings`, `triage_groups`) are `[]`, and Coverage names them as not assessed. `reviewers` is `["correctness"]` and `coverage.depth` is `"lite"`. Focused fills the same fields from its merged findings, lists its two reviewers, and sets `coverage.depth` to `"focused"`; the full path's finish leaf fills every field and sets `coverage.depth` to `"full"`.

Each object in `findings` uses the merged finding fields: `#`, `title`, `severity`, `file`, `line`, `confidence`, `autofix_class`, `owner`, `requires_verification`, `pre_existing`, `suggested_fix`, `first_evidence`, `why_it_matters`, `evidence`, `reviewers`, `independent_reviewers`. A finding Stage 5b left unresolved, or confirmed with an unmeasured-incidence reason, also carries `validation_status` and `validation_reason`, and carries `protected_subject` when one applies. Each object in `learnings` is a Known Pattern note: `type` (`known_pattern`), `title`, `citation` (a `<root>/solutions/` path or `(pack: <id>, <path within the pack>)`), and `note` (one line on how it bears on the change); contradicted pack rules are findings, never `learnings` entries. When Compound Packs were resolved for the learnings dispatch, `coverage.compound_packs` carries `roots` as the list of pack ids (strings — never the resolver's absolute `dir` paths) plus the resolver's `warnings` and `errors` arrays verbatim, so a consumer can tell a declared pack that loaded from one that was skipped. The helper derives `independent_reviewers`; synthesis may preserve or union that list but must not infer it from `reviewers`.

An incoming finding may carry an optional `settled_conflict` field naming a `session-settled:` KTD. The marker supplies context for settlement reconciliation; it does not exempt the finding from admission or authorize a change.

`actionable_findings` lists the `gated_auto` / `manual` + `downstream-resolver` subset with the same fields plus stable `#`. A finding with `validation_status: "unresolved"` never appears here; it stays in `findings` as a clearly labeled verification gate.

Each object in `triage_groups` carries `{ "title", "findings": [<stable #s>], "context", "preferred_resolution", "why" }`: the finalized groups from Stage 5 step 6 after Stage 5b step 5 pruning. Every referenced `#` must exist in `findings` (the full set), **not** necessarily in `actionable_findings`. Groups are a triage **lens over all findings, not an apply queue**: a group (and its `preferred_resolution` ordering) can reference advisory or `human`/`release`-owned findings that the caller must not apply. So a caller batching related fixes by theme must first intersect each group's `findings` with `actionable_findings` and act only on that subset; the apply handoff stays `actionable_findings`, never `triage_groups`. Empty array when `grouping:off` is active or no groups were built.

On failure before review completes, set `"status": "failed"` and `"reason": "<one sentence>"`. When all reviewers fail, use `"status": "degraded"` with a reason. When a PR skip rule applies (closed/merged/trivial), use `"status": "skipped"` with the skip reason. Do not emit markdown tables when `mode:agent` is active.

After Stage 6 on the full path, the review ends with the actionable summary, the run artifacts, and the point where the run stops. `references/finish-review.md` defines that ending for the full spine.
