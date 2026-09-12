# Finish handoff: what dispatch writes, what finish reads

A review round runs in two contexts. The **dispatch context** is the orchestrator that resolved scope, selected reviewers, started the peer, dispatched the local batch, and collected it (Stages 1 through 4). The **finish context** is one fresh subagent whose only inputs are this skill's reference files, reached through the absolute skill-directory path in its prompt, and the run directory; it runs Stages 5, 5b, 5c, and 6 from what is on disk. The split exists because a six-lens round routinely uses up the dispatch context before Stage 5b, which is when validator launches start failing (#1679, #1690). It is always on for the multi-agent path; the quick-review short-circuit never reaches it.

**Outcome:** the finish context produces the same report the dispatch context would have, from the run directory alone, and the dispatch context emits that report verbatim. **Done:** `report.md` (default mode) or `review.json` (`mode:agent`) and `metadata.json` are on disk, every persisted peer job directory is deleted, and the dispatch context has returned the finish context's output unchanged.

## The contract: `<run-dir>/finish-input.json`

The dispatch context writes this file after every local reviewer is collected and before it launches the finish subagent. It is the only channel between the two contexts. A fact the finish context needs that is not in this file or in another run-dir artifact does not exist to it, so write every field below; write `null` for a field that does not apply rather than omitting it.

```json
{
  "run_id": "<run-id>",
  "run_dir": "<absolute run dir>",
  "skill_dir": "<absolute path of the directory containing this skill's SKILL.md>",
  "docs_root": "<resolved <root>>",
  "mode": { "agent": false, "apply_local": false, "grouping": "auto", "depth": "auto" },
  "scope": {
    "mode": "local-aligned | standalone | base | pr-remote | branch-remote",
    "base": "<BASE: marker>",
    "diff_a": "<DIFF_A>", "diff_b": "<DIFF_B or null>",
    "pr": { "number": null, "url": null, "title": null, "body": null, "base_ref_name": null, "head_ref_oid": null, "head_ref": null, "base_ref": null, "has_prior_comments": false },
    "branch": "<git branch --show-current at dispatch>",
    "head_sha": "<git rev-parse HEAD at dispatch>",
    "files": "<run-dir>/files.txt",
    "diff": "<run-dir>/full.diff",
    "untracked_excluded": []
  },
  "intent": { "summary": "<the Stage 2 intent summary>", "confidence": "explicit | inferred | uncertain" },
  "plan": { "path": null, "source": "explicit | inferred | none", "settled_decisions": [] },
  "roster": {
    "selected": [{ "reviewer": "correctness", "tier": "session", "reason": "always-on" }],
    "lite": false,
    "standards": { "criteria": [], "fallback_named": false, "not_run_reason": null },
    "packs": { "roots": [], "errors": [], "warnings": [] }
  },
  "collection": {
    "returns": "<run-dir>/raw-returns.json",
    "failed_reviewers": [{ "reviewer": "", "reason": "" }],
    "bound_exceeded": [],
    "fast_pass": { "emitted_preliminary": false, "candidates": [] }
  },
  "peer": {
    "selected": false, "job_id": null, "target": null, "route": null,
    "start_epoch": null, "deadline_secs": null,
    "preference_source": "user | config | instructions | default | null",
    "skip_reason": null
  },
  "coverage_notes": []
}
```

`raw-returns.json` holds every compact reviewer return the dispatch context consumed, one array entry per reviewer, with the `fast-pass` pseudo-reviewer included when it found anything; the per-reviewer artifacts sit beside it. `coverage_notes` carries every sentence Coverage must contain that only the dispatch context knew: the lite-roster decision and its reason, the standards fallback, untracked files excluded, the cross-model skip reason, scope-mode notes.

## How the dispatch context launches it

Put the full contents of `finish-input.json` inline in the finish subagent's prompt, together with the absolute paths of the run directory, this reference, and `references/finish-review.md`, and tell it to read those two references first. Inline the file rather than only naming it: the facts it carries are small, and a subagent that has them in its prompt cannot skip the read. Everything larger (the diff, the per-reviewer artifacts, the compact returns) stays on disk and is read by path. No override on the model: the finish context inherits the session model.

## What the finish context does with it

Read `finish-input.json` first, then `references/finish-review.md` from `skill_dir`, and run it from the top. Where that reference says "from Stage 1", "from Stage 2b", "the roster", or "the intent summary", the value is the corresponding field here. Where it names conversation context, this file is the conversation. Resolve `<root>` to `docs_root`. `mode.agent` decides JSON versus markdown; `mode.apply_local` decides whether Stage 5c runs.

When `peer.job_id` is set, the single-reap finish belongs to this context: perform the status read and bounded `wait` slices `references/cross-model-review.md` defines against `peer.start_epoch` and `peer.deadline_secs`, fold the artifact, and delete the job directory before returning. That obligation moved here with the fold-in; the dispatch context does not touch the peer after writing this file.

The finish context never resolves, announces, or starts a peer route. Changing the recipient needs the user-visible channel and the preference provenance that only the dispatch context has, so when the fold-in rules would call for a replacement recipient after a no-review outcome, take their in-process `adversarial-reviewer` fallback instead and record in Coverage that a replacement recipient was not tried because this context cannot disclose one. `peer.preference_source` is recorded so that Coverage line can say whether the recipient was the user's explicit choice.

Apply the agent lifecycle rule in `references/dispatch-reviewers.md` (Agent lifecycle) to the validator this context launches.

Where the finish reference routes prose through another skill (`ce-noslop`) and this context cannot invoke skills, apply that reference's own presentation rules directly; the report's content contract does not change.

Return the final report text exactly as the reference says to emit it: the markdown report in default mode, the one raw JSON object in `mode:agent`. Nothing else in the return.

## What the dispatch context does with the return

Emit the finish context's return verbatim as this skill's final response. Do not summarize, reformat, or add to it; in `mode:agent` the response must begin with the JSON object. If the finish subagent fails to launch, returns a tool error, or returns something that is neither the report nor the JSON object, that is a failed finish: in `mode:agent` emit `{"status":"failed","reason":"<one sentence>"}`; otherwise say the round could not finish, name the run directory so a re-run can finish from it, and reap any peer job the finish context did not.
