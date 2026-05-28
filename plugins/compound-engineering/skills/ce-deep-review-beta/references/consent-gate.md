# Consent gate — canonical copy + shape

The gate is the only thing between the plan and external vendors. SKILL.md Phase 2 carries the
load-bearing routing; this file pins the **canonical wording** (do not paraphrase — the contract
test asserts these strings) and the question shape.

## Canonical responsibility acknowledgment

**Base (gitleaks ran):**

> This plan content will be sent to the external vendors you select below. You are responsible for
> having configured each vendor with an appropriate data-handling policy (paid plan + DPA where
> applicable) per your organization's requirements. Selecting any model confirms you accept this.

**Escalated (append verbatim when `content_preview: unavailable`):**

> No automated content scan ran (gitleaks is not installed) — you are the sole filter for what is
> egressed. Confirm you have manually checked this plan for secrets, credentials, and PII before
> sending it.

## Canonical preview-unavailable notice

Shown in the gate stem in place of the hit list when `gitleaks-scan.sh` returns
`{"status":"unavailable"}`:

> Automated content preview unavailable — `gitleaks` is not installed (`brew install gitleaks`
> enables automated secret detection). Until then, you are the sole content filter for what is
> egressed.

## Content preview rendering (when gitleaks ran)

Render each hit as one line in the gate stem (values are already redacted by `--redact`):

```
Line <N> (<rule-id>): <redacted preview>
```

If `hits` is empty, state "Content preview: no secret-shaped content detected (best-effort; you are
the final filter)."

## Question shape (within the 4-option blocking-tool cap)

The acknowledgment lives in the **question stem**, not as an option. Selecting any model == consent.

- **≥2 arms available** → `multiSelect: true` over the available models (`codex (OpenAI)`,
  `gemini (Google)`), default none. Each option label is self-contained and third-person. The
  free-text/Other escape serves as cancel. Submitting with ≥1 model selected grants consent for
  that subset; submitting none triggers the one-time re-prompt (then cancel).
- **exactly 1 arm available** → single-select with two options: `Send to <model>` and
  `Cancel — panel-only, no egress`. (A lone toggle cannot be a multi-select; the blocking tool
  needs ≥2 options.)
- **0 arms available** → no gate; Phase 0 already routed to the panel-only sidecar.

## Outcomes (mirror of SKILL.md routing — keep in sync)

- ≥1 model selected → consent; pass the comma-separated subset to Phase 3 (egress = exactly that subset).
- zero selected (multi-select) → re-present once with "Select at least one model to proceed, or
  Cancel for panel-only output"; still none → treat as Cancel.
- Cancel / decline → panel findings to chat; do NOT write `<plan>.deep-review.md` or
  `<plan>.deep-review-draft.md` (the deep-review filename is reserved for verified output).

## Audit

Record `content_preview: ran | unavailable` for the sidecar header so a gitleaks-absent run is
itself audited. When unavailable, the Phase 4 / verification-phase sidecar write also reminds the
user that the sidecar quotes plan content and is about to be written without an automated scan.
