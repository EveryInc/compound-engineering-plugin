# Return to Caller

Prepare review feedback under the caller's inherited scope and preserve the judged batch for completion after the caller publishes. The resolver owns judgment, fixes, local validation, a fix-owned commit, and the saved actions. It never pushes and never asks a blocking question. Invocation cannot broaden the caller's authority; merge, rebase, force-push, and CI approval remain excluded.

Full and targeted feedback scopes keep their existing judgment and fix flow. A code-fix batch returns with its entire remote tail pending, including actions that require no fix themselves. A no-change batch may finish immediately through Full Mode's existing reply/resolve protocol. Its record distinguishes verified completion from an incomplete write or resolution. Human decisions retain the rubric's typed `needs-human` payload and remain open.

## Prepare the destination before editing

Run the bundled helper from the absolute directory containing this skill's `SKILL.md`; set the anchor in each shell call because shell state does not persist. Preflight happens before edits, not after the commit:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-resolve-pr-feedback SKILL.md>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/pending-feedback.py" preflight
```

When the invocation supplies `handoff:<path>`, append `--path '<caller path>'` to that command, preserving the actual argument. Preflight refuses an existing destination, including a dangling symlink, and probes exclusive temporary-file creation in its parent directory. Without a supplied path it allocates a private OS scratch directory and returns an unused `pending.json` path. Retain the returned absolute `handoff` path. Do not clean it up at skill completion; the caller owns retention.

If preflight fails, stop before editing and return the blocker. Do not substitute another destination for a rejected caller path. Creation also refuses overwrite, so a destination that appears during preparation cannot be replaced.

## Save the judged batch

Capture the PR's host, base repository, number and canonical URL, plus its actual head repository and head ref from fetched PR metadata. The head repository may differ from the base on a fork PR; do not infer it from the checkout's default remote.

For a batch creating changes, validate the combined fix and commit only its owned changes as Full Mode steps 5-6 define. Record the actual full commit SHA. Do not push. Preserve the final exact reply bodies from the judged per-item results, including multiline Markdown and the recorded commit reference. Save every covered source of a class fix as its own action. Whole-batch deferral applies to replies, human acknowledgments, resolutions and PR-body checklist ticks alike.

For a no-change batch, set `fix_commit` to `null` and save the prepared actions before entering the existing remote tail. Checkpoint observed progress after successful writes and at return. If a later write fails, retain earlier verified progress and return `pending` with the blocker; do not claim the whole batch completed. Existing `resolution-pending` threads carry their visible submitted reply IDs and body, so their saved action requires only the missing resolution.

Build the versioned JSON record in a separate private input file. Source fingerprints are lowercase SHA-256 of the original fetched body encoded as UTF-8, computed from that decoded body by a tool rather than invented or calculated from a paraphrase. The helper must read the original file bytes; do not retype or normalize a received record before validating it.

```json
{
  "schema_version": 1,
  "status": "pending",
  "pr": {
    "host": "github.com",
    "base_repo": "upstream/project",
    "number": 42,
    "url": "https://github.com/upstream/project/pull/42",
    "head_repo": "contributor/project",
    "head_ref": "fix/review"
  },
  "fix_commit": "<full lowercase 40-character SHA, or null when no fix commit>",
  "verification": {
    "command": "<command actually run, or empty when not run>",
    "outcome": "passed",
    "details": "<result and any pre-existing failures>"
  },
  "actions": [
    {
      "source": {
        "kind": "thread",
        "id": "<stable fetched feedback ID>",
        "url": "https://github.com/upstream/project/pull/42#discussion_r11",
        "body_sha256": "<SHA-256 of the original source body>"
      },
      "root_comment_id": 11,
      "thread_id": "<authoritative GraphQL thread ID>",
      "verdict": "fixed",
      "reply_body": "> Original feedback\n\nExact prepared response.",
      "resolve": true,
      "decision_context": null,
      "invariant_key": "<stable root key, or null>"
    }
  ],
  "body_ticks": [
    {"original": "- [ ] P1 — exact finding", "checked": "- [x] P1 — exact finding"}
  ],
  "residuals": []
}
```

- `status` is `pending` until every eligible saved conversation action is verified complete, then `completed`. A completed batch can still carry human residuals whose threads intentionally remain open.
- `verification.outcome` is `passed`, `pre-existing-failure`, `failed`, or `not-run`; preserve the actual result, never replace unavailable validation with success.
- `source.kind` is `thread`, `comment`, or `review`. Non-thread actions have null `root_comment_id` and `thread_id`, and `resolve:false`. IDs are strings; REST root/reply IDs are positive integers.
- `verdict` uses the existing `fixed`, `fixed-differently`, `replied`, `not-addressing`, `declined`, or `needs-human` values. `needs-human` has `resolve:false` and the complete `decision_context` from the rubric; other verdicts have null decision context.
- `residuals` contains the rubric's exact typed `needs-human` objects with all covered `sources`, `decision_context`, and `thread_urls`. Carry existing unresolved human decisions too. Do not reduce them to prose summaries.
- `body_ticks` carries exact original bullets and their checked versions, changing only `[ ]` to `[x]`. An empty array means no planned body mutation.
- Optional action `progress` holds observed `reply_id`, `reply_url`, and `resolved`; optional tick `progress` holds `applied`. Omit unobserved fields. Progress is a checkpoint, not proof that overrides GitHub's current state.

Create the handoff from the input file:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-resolve-pr-feedback SKILL.md>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/pending-feedback.py" create --input '<prepared JSON file>' --path '<preflight handoff path>'
```

The helper validates the original bytes, creates the destination exclusively with private permissions, reads it back, and returns `{handoff, record}`. Preparation is complete only after this succeeds. `validate --path '<handoff path>'` reads and validates an existing record. `checkpoint --input '<updated JSON file>' --path '<handoff path>'` atomically saves progress, status and residuals while preserving the prepared PR, fix SHA, verification, source identities, exact replies and tick intent. These commands never mutate GitHub.

If a save or checkpoint fails, report the actual local commit and any observed remote success, plus the precise failure. Do not lose the fix SHA behind a generic failed status or describe an unreadable record as a usable handoff.

## Structured caller result

Emit this result as the last output of this skill. It ends the skill, not a calling orchestrator's turn; the caller continues its next step in the same session.

```json
{
  "status": "pending",
  "handoff": "<absolute readable validated file path, or null if unavailable>",
  "fix_commit": "<actual fix SHA, or null>",
  "changed_files": ["<fix-owned paths>"],
  "verification": {"command": "<actual command>", "outcome": "passed", "details": "<actual result>"},
  "residuals": [],
  "blockers": []
}
```

The exact result statuses are `pending`, `completed`, and `incomplete-handoff`. Use `pending` for a validated saved batch with deferred or incomplete conversation work, `completed` only for verified no-change completion, and `incomplete-handoff` when no usable saved record exists or its latest observed progress could not be checkpointed. Return typed human residuals even when other actions completed. Name blockers without asking a question.

The caller retains the file, publishes the recorded fix without rewriting its SHA, and returns the saved path to the resolver for later conversation completion. A push alone does not finish the review conversations. This preparation mode returns without implementing any of those caller steps.
