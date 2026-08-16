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
- **The pre-existing `recover_pov_json` fallback, which only worked by accident.** Before the fix, `parse_structured()` (`skills/ce-pov/scripts/cross-model-pov.sh:692`, `698`) checked only `jq -e '.structured_output'` — snake_case. grok-cli's headless JSON envelope names the key `structuredOutput` (camelCase), so on grok the lookup always missed and execution fell through to `recover_pov_json`, a Python text scan that returns the last dict containing a `position` key. That scan is key-agnostic and has no notion of finality, so a placeholder that is the model's final object is returned as if it were an answer. The sibling scripts `skills/ce-code-review/scripts/cross-model-adversarial-review.sh` and `skills/ce-doc-review/scripts/cross-model-doc-review.sh` already handled `structuredOutput` in their own recovery Python; `ce-pov`'s copy had lagged behind.

## Solution

Two changes in `skills/ce-pov/scripts/cross-model-pov.sh` and one in `skills/ce-pov/references/cross-model-panel.md`, opened on branch `tmchow/ce-pov-nonfinal-peer`, unmerged as of this writing.

**1. Parse the actual envelope key.** `parse_structured()` now checks both cases at both call sites — the buffered envelope (`cross-model-pov.sh:692`) and the stream-json `result` event (`cross-model-pov.sh:698`):

```bash
# before
jq -e '.structured_output' "$1" > "$2" 2>/dev/null && return 0
# after
jq -e '.structured_output // .structuredOutput' "$1" > "$2" 2>/dev/null && return 0
```

A well-formed grok response is now read directly from its own final `structuredOutput` object instead of falling through to the text-scan fallback.

**2. Classify non-final positions and retry once.** New regex and helpers at `cross-model-pov.sh:366-370`:

```bash
NONFINAL_POSITION_RE='^[[:space:]]*(blocked|pending|placeholder|tbd|todo|in[- ]progress|gathering|still[[:space:]]+(reading|gathering|inspecting|reviewing)|need(s)?[[:space:]]+to[[:space:]]+(read|inspect|gather|review))([[:space:]]|[[:punct:]]|$)'
raw_position() { [ -s "$RAW_OUT" ] && jq -r '.position // ""' "$RAW_OUT" 2>/dev/null; }
position_is_nonfinal() {   # <position>
  printf '%s' "$1" | tr 'A-Z' 'a-z' | grep -Eq "$NONFINAL_POSITION_RE"
}
```

`run_fixed_route` calls `attempt_route` as before, then checks the position (`cross-model-pov.sh:779-795`):

```bash
attempt_route "$provider" "$FIXED_ROUTE"
nonfinal_position=""
position="$(raw_position)"
if [ "$RUN_SUCCEEDED" = true ] && position_is_nonfinal "$position"; then
  log "peer returned a non-final position (\"${position:0:120}\"); retrying once on the same route with a final-answer requirement"
  printf '\n\nYour previous response declared the point of view unfinished. This response is the final one: ...\n' >> "$PROMPT_FILE"
  attempt_route "$provider" "$FIXED_ROUTE"
  position="$(raw_position)"
  if [ "$RUN_SUCCEEDED" = true ] && position_is_nonfinal "$position"; then
    nonfinal_position="$position"
    rm -f "$RAW_OUT"
  fi
fi
```

The retry reuses the same route, target, model, and scope; only the appended prompt paragraph changes. If the second attempt is still non-final, the artifact is discarded and logged as skip evidence (`cross-model-pov.sh:848`: `peer skip evidence: non-final position after retry: ...`) rather than folded in.

**3. Classify blocked-but-schema-valid states in the protocol.** `cross-model-panel.md` section 4 (line 325) previously accepted "schema-shaped artifacts with non-empty `position` and `reasoning`, a valid `movement`, and the route/model receipt tuple" with no finality condition. It now reads (`cross-model-panel.md:325-331`):

> Accept only schema-shaped artifacts whose `position` is a settled answer to the framed question, with non-empty `reasoning`, a valid `movement`, and the route/model receipt tuple. A `position` that declares the peer unfinished — blocked, pending, still gathering or reading — is non-final: the worker retries it once on the same route with a final-answer requirement and, if it recurs, drops the voice with `peer skip evidence: non-final position`. Should such an artifact still reach you, treat it as no usable artifact, not as a peer voice.

Section 6 (`cross-model-panel.md:417-418`) also names the failure mode in the Partial-result reporting guidance: "for example quota, authentication, timeout, or a non-final placeholder position that survived one retry."

## Why This Works

The bug had three independent layers, and each is closed at the layer that owns it:

- **Envelope key.** `parse_structured` was reading the wrong field name on grok, so it never saw grok's actual final answer and always landed in a text-scan fallback. Reading `structuredOutput` directly removes the dependency on that fallback for the common case.
- **Finality acceptance.** Even with the right key parsed, a schema-valid object can still be a "not done yet" answer — `skills/ce-pov/references/pov-schema.json` describes `position` as "The adoption grade, document or approach bottom line, skeptic verdict, or blocked state," so a blocked position is schema-sanctioned but not usable. The worker now owns one deterministic condition (`position_is_nonfinal`) and gives the peer exactly one bounded chance to produce a settled answer before giving up.
- **Protocol classification.** The acceptance rule the orchestrator reads was silent on this state, so a non-final artifact had no documented status. The protocol text now states the condition once — position must be a settled answer — instead of enumerating cases, and tells the orchestrator what to do if a non-final artifact ever reaches it anyway.

This preserves the panel's degradation rules: peers never block a POV, and a dropped voice degrades to partial or solo rather than making grok mandatory or hopping routes mid-retry.

## Prevention

- `tests/skills/ce-pov-cross-model-routes.test.ts` adds four fixtures pinning this behavior: `reads grok's camelCase structuredOutput instead of a first-turn placeholder in text` (line 230), `a non-final position is retried once on the same route with a final-answer requirement` (line 240), `a second non-final position drops the voice with skip evidence naming it` (line 262), and `a settled Hold position is not treated as non-final` (line 279) — the last guards against over-broad matching, since "Hold: do not adopt" is a legitimate settled verdict.
- When adding a new peer CLI route or a new schema-constrained peer: verify the envelope field name against that CLI's actual headless JSON output rather than assuming it matches your other integrations (grok-cli 1.0.4 uses `structuredOutput`, camelCase). Do not assume schema validity implies usability — if the schema's own description allows an in-progress or blocked value, the worker needs an explicit finality check before folding the artifact in, and the calling protocol needs to say what "usable" means as a condition, not just "matches the schema". Keep the deterministic finality check in the worker script and the acceptance semantics in the protocol doc; do not duplicate one into the other.

## Related Issues

- `docs/solutions/skill-design/dispatch-script-failure-degrade-outcome-not-boundary.md` — the same-route, boundary-frozen, bounded-retry principle this fix reuses; that doc covers dispatch-infrastructure crashes, this one a route that ran cleanly and returned schema-valid-but-unusable content.
- `docs/solutions/integration-issues/portable-structured-output-schemas-across-model-clis.md` — the other side of the peer-envelope contract: schema rejection at startup vs. schema acceptance of non-final content here.
- `docs/solutions/skill-design/cli-output-buffering-for-progress-detection.md` and `docs/solutions/skill-design/quiet-interval-floors-for-streaming-peer-routes.md` — grok-cli `--json-schema` buffering and hard-only timeouts for the same route (measured on grok 0.2.101; the envelope key and placeholder-then-final concatenation above were observed on 1.0.4).
- Issue #1270 — the earlier grok-cli buffering / idle-detection work the route comments reference.
