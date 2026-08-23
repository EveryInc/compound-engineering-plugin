---
title: "Grok's camelCase structuredOutput and schema-valid non-final positions slip past cross-model peer acceptance"
date: 2026-08-15
category: integration-issues
module: "cross-model structured output (skills/ce-pov)"
problem_type: integration_issue
component: tooling
severity: medium
symptoms:
  - "grok-cli peer route in a ce-pov oracle panel finished with worker exit 0 and a schema-valid artifact whose position was a placeholder ('blocked: gathering subject evidence') instead of a settled verdict"
  - "peer-job-runner marked the job done and the worker's acceptance jq filter (non-empty strings + enum values) passed the placeholder artifact through"
  - "parse_structured() in cross-model-pov.sh only checked snake_case .structured_output, so grok's camelCase .structuredOutput envelope key fell through to the text-scan recovery path"
  - "grok-4.6 sometimes emits a schema-shaped placeholder JSON on its first turn and, if it stops after that turn, the placeholder becomes the final structuredOutput"
root_cause: wrong_api
resolution_type: code_fix
tags:
  - "cross-model"
  - "structured-output"
  - "json-schema"
  - "peer-delegation"
  - "ce-pov"
  - "grok"
---

# Grok's camelCase structuredOutput and schema-valid non-final positions slip past cross-model peer acceptance

## Problem

In a `ce-pov` cross-model panel, the grok-cli peer route could return a schema-valid artifact whose `position` was itself an admission the peer had not finished ("blocked: gathering subject evidence"), and the worker accepted, folded in, and published it as a usable peer voice.

## Symptoms

During a `ce-pov oracle` panel run (2026-08-16, reviewing PR #1402), the grok-cli peer job finished in ~20s with worker exit 0 and a schema-valid artifact: `position: "blocked: gathering subject evidence"`, `reasoning: "Need to inspect ... before forming a position."`, `evidence: ["subject-payload: Independent review request (round 1)"]`. peer-job-runner marked the job `done`. The worker's acceptance filter (non-empty strings + enum values) passed it. The panel protocol's acceptance rule in `skills/ce-pov/references/cross-model-panel.md` (pre-fix) accepted any "schema-shaped artifact with non-empty `position` and `reasoning`, a valid `movement`, and the route/model receipt tuple" — nothing in that rule classified a blocked/placeholder position as unusable. Only orchestrator judgment caught it and dropped the voice manually. The Codex peer in the same panel ran 3-4 minutes and returned a grounded position, so the failure was route-specific, not systemic.

## What Didn't Work

- **Requiring evidence to cite something beyond the payload, as the finality condition.** Considered and rejected: a document-only POV (reviewing a spec with no code to inspect) legitimately cites only the payload as evidence. Gating on "cites more than the payload" would false-positive on every valid document-only POV, not just the placeholder case.
- **Assuming `--json-schema` blocks tool use on grok-cli.** A direct repro on grok 1.0.4 (same flags, tiny directory, prompt requiring a file read) showed tools do work under `--json-schema` (`num_turns: 2`, evidence `note.txt:1`). The CLI is not the root cause; the model's habit of emitting a schema-shaped placeholder before spending read turns is. In 1 of 4 repro runs the envelope's `text` field held that placeholder object concatenated with the final one, while `structuredOutput` held only the final.
- **The pre-existing `recover_pov_json` fallback, which only worked by accident.** Before the fix, `parse_structured()` checked only `jq -e '.structured_output'` — snake_case. grok-cli's headless JSON envelope names the key `structuredOutput` (camelCase), so on grok the lookup always missed and execution fell through to `recover_pov_json`, a Python text scan that returns the last dict containing a `position` key. That scan is key-agnostic and has no notion of finality, so a placeholder that is the model's final object is returned as if it were an answer. The sibling scripts `skills/ce-code-review/scripts/cross-model-adversarial-review.sh` and `skills/ce-doc-review/scripts/cross-model-doc-review.sh` already handled `structuredOutput` in their own recovery Python; `ce-pov`'s copy had lagged behind.

## Solution

Two changes in `skills/ce-pov/scripts/cross-model-pov.sh` and one in `skills/ce-pov/references/cross-model-panel.md`, merged in PR #1403 (`6d3cf578`).

**1. Parse the actual envelope key.** `parse_structured()` now checks both cases for the buffered envelope and each stream-json `result` event:

```bash
# before
jq -e '.structured_output' "$1" > "$2" 2>/dev/null && return 0
# after
jq -e '.structured_output // .structuredOutput' "$1" > "$2" 2>/dev/null && return 0
```

A well-formed grok response is now read directly from its own final `structuredOutput` object instead of falling through to the text-scan fallback.

**2. Make finality part of the output contract, and retry once.** `skills/ce-pov/references/pov-schema.json` gains a required `final` boolean ("true when position is your settled answer — a settled Blocked verdict counts; false when you have not finished inspecting"), and `skills/ce-pov/references/agents/pov-peer.md` tells the peer how to set it. The worker never reads finality out of the prose — an earlier draft used a phrase list (`blocked|pending|gathering|…`) and review round 1–2 on the PR showed both failure directions: a settled `Blocked — insufficient project grounding` verdict misclassified as unfinished, and any routine wording variation (`Blocked: I am still gathering…`) slipping past. Model prose cannot be exhaustively classified; the owned contract can. So:

```bash
out_final() { [ -s "$RAW_OUT" ] && jq -e '.final == true' "$RAW_OUT" >/dev/null 2>&1; }
```

`run_fixed_route` calls `attempt_route`, then, when the artifact is schema-shaped but not final, retries once inside what remains of the worker's own `HARD_SECS` window (the retry block in `run_fixed_route`):

```bash
ROUTE_STARTED_AT="$(date +%s)"
attempt_route "$provider" "$FIXED_ROUTE"
nonfinal_position=""
if [ "$RUN_SUCCEEDED" = true ] && ! out_missing_or_invalid && ! out_final; then
  remaining=$(( HARD_SECS - ( $(date +%s) - ROUTE_STARTED_AT ) ))
  if [ "$remaining" -lt "$RETRY_MIN_SECS" ]; then
    nonfinal_position="$position"; rm -f "$RAW_OUT"      # no window left: drop, no retry
  else
    printf '\n\nYour previous response set final to false. This response is the final one: ...\n' >> "$PROMPT_FILE"
    HARD_SECS="$remaining"; UNGUARDED_HARD_SECS="$remaining"
    attempt_route "$provider" "$FIXED_ROUTE"
    if [ "$RUN_SUCCEEDED" = true ] && ! out_missing_or_invalid && ! out_final; then
      nonfinal_position="$(jq -r .position "$RAW_OUT")"; rm -f "$RAW_OUT"
    fi
  fi
fi
```

The retry reuses the same route, target, model, and scope; only the appended prompt paragraph changes, and both attempts stay inside the panel's aggregate deadline (`CROSS_MODEL_HARD_SECS` + 10s). If the second attempt is still non-final, or too little window remains to retry (`CROSS_MODEL_RETRY_MIN_SECS`, default 60s), the artifact is discarded and logged as `peer skip evidence: non-final position: ...` rather than folded in. A shaped artifact that omits `final` is non-final too (fail-closed).

**Candidate selection is by validity and finality, not key presence.** The published candidate is the highest-scoring POV anywhere in the envelope — schema-shaped and final (2) > shaped (1) > any position-bearing object (0), ties to the later candidate — and the structured field (`structured_output` / `structuredOutput` / `result`) is one candidate among those, returned early only when it already scores 2. Otherwise `recover_pov_json` scores every `position`-bearing dict in the envelope and its pick replaces the structured one whenever it scores at least as high. So a settled object in `text` beside a non-final `structuredOutput` is published; a placeholder in `text` beside a final `structuredOutput` is ignored; a shaped non-final POV beside a bare `{}` stub still reaches the retry gate; and a bare `{"final":true}` stub does not beat the complete POV in `text`. Review rounds 2–4 on the PR each found one of these holes in a guard-shaped version of this block; the fix that held was restating it as the scoring rule rather than adding a guard per case.

**3. Classify blocked-but-schema-valid states in the protocol.** `cross-model-panel.md` section 4 previously accepted "schema-shaped artifacts with non-empty `position` and `reasoning`, a valid `movement`, and the route/model receipt tuple" with no finality condition. Its current "Read artifacts and logs…" rule instead requires a settled answer:

> Accept only schema-shaped artifacts whose `position` is a settled answer to the framed question, with non-empty `reasoning`, a valid `movement`, and the route/model receipt tuple. Settledness is the peer's own declaration through the schema's required `final` flag, never a reading of its prose: a settled `Blocked — …` verdict marked `final: true` is a usable answer, while any shaped artifact whose `final` is not true is a placeholder. The worker retries a non-final artifact once on the same route with a final-answer requirement, inside the same hard window, and if it recurs or no window remains drops the voice with `peer skip evidence: non-final position`. Should a non-final artifact still reach you, treat it as no usable artifact, not as a peer voice.

Section 6 also names the failure mode in the Partial-result reporting guidance: "for example quota, authentication, timeout, or a non-final placeholder position that survived the bounded retry."

## Why This Works

The bug had three independent layers, and each is closed at the layer that owns it:

- **Envelope key.** `parse_structured` was reading the wrong field name on grok, so it never saw grok's actual final answer and always landed in a text-scan fallback. Reading `structuredOutput` directly removes the dependency on that fallback for the common case.
- **Finality acceptance.** Even with the right key parsed, a schema-valid object can still be a "not done yet" answer — `skills/ce-pov/references/pov-schema.json` describes `position` as "The adoption grade, document or approach bottom line, skeptic verdict, or blocked state," and a settled Blocked verdict is legitimate, so the prose cannot carry finality. The contract now does (`final`), the worker owns one deterministic condition (`out_final`), and it gives the peer exactly one bounded chance to produce a settled answer before giving up.
- **Protocol classification.** The acceptance rule the orchestrator reads was silent on this state, so a non-final artifact had no documented status. The protocol text now states the condition once — position must be a settled answer — instead of enumerating cases, and tells the orchestrator what to do if a non-final artifact ever reaches it anyway.

This preserves the panel's degradation rules: peers never block a POV, and a dropped voice degrades to partial or solo rather than making grok mandatory or hopping routes mid-retry.

## Prevention

- `tests/skills/ce-pov-cross-model-routes.test.ts` adds fixtures pinning this behavior: a final `structuredOutput` wins over a first-turn placeholder in `text`; a settled final object in `text` beats a non-final `structuredOutput`; a shaped artifact that omits `final` is non-final; a non-final artifact is retried once with the final-answer line in the second prompt; a second non-final drops the voice with the named skip evidence; a non-final artifact with no hard window left is dropped without a retry; and settled `Hold: …` and `Blocked — …` verdicts marked final are accepted whatever their wording.
- When adding a field like `final` to a schema-constrained peer contract, remember every route's stub fixture must carry it — the gate is fail-closed, so a fixture missing the field now exercises the retry-and-drop path.
- When adding a new peer CLI route or a new schema-constrained peer: verify the envelope field name against that CLI's actual headless JSON output rather than assuming it matches your other integrations (grok-cli 1.0.4 uses `structuredOutput`, camelCase). Do not assume schema validity implies usability — if the schema's own description allows an in-progress or blocked value, the worker needs an explicit finality check before folding the artifact in, and the calling protocol needs to say what "usable" means as a condition, not just "matches the schema". Keep the deterministic finality check in the worker script and the acceptance semantics in the protocol doc; do not duplicate one into the other.

## Related Issues

- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — the same-route, boundary-frozen, bounded-retry principle this fix reuses; that doc covers dispatch-infrastructure crashes, this one a route that ran cleanly and returned schema-valid-but-unusable content.
- `docs/solutions/integration-issues/portable-structured-output-schemas-across-model-clis.md` — the other side of the peer-envelope contract: schema rejection at startup vs. schema acceptance of non-final content here.
- `docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md` and `docs/solutions/skill-design/quiet-interval-floors-for-streaming-peer-routes.md` — grok-cli `--json-schema` buffering and hard-only timeouts for the same route (measured on grok 0.2.101; the envelope key and placeholder-then-final concatenation above were observed on 1.0.4).
- [Issue #1270](https://github.com/EveryInc/compound-engineering-plugin/issues/1270) — the completed grok-cli buffering / idle-detection work the route comments reference.
