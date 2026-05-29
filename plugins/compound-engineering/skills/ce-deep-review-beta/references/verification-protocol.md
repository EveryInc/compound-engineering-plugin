# Verification protocol (RU4) — grounding cross-model findings

Pass 2 produces **raw, unverified** cross-model findings. Verification grounds each one against the
reviewed document with a **deterministic quote-grep backstop** and assigns exactly one verdict. This
is what replaces the thin slice's `verification: none`.

## The backstop is the authoritative gate

The verifier is `scripts/verify-findings.py` — a pure function of `(finding text, document)`. It is
**authoritative**: a model (including the orchestrating agent) may not override a deterministic
CONFIRMED or NOT-FOUND-IN-DOC verdict. This is load-bearing — a model verifier judging another
model's findings can inherit the same confabulation it is meant to catch; a deterministic grep
cannot. The backstop being authoritative is the property that makes the verdicts trustworthy.

It is **blind to the producing model**: the verdict function never receives the model label.
`verify-records` reads the model only from the record filename to *label* output rows, never to
compute a verdict. So provenance (which vendor produced a finding) cannot bias the verdict.

## Verdicts

Run via the Bash tool after Pass 2 completes:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/verify-findings.py" verify-records "<plan-path>" "${CMRE_OUT_DIR:-/tmp/cmre-panel}/records"
```

It emits `{"verified": [{model, lens, id, text, verdict, grounding_quote}], "counts": {...}}`. Each
finding gets one of:

- **CONFIRMED** — the finding embeds a *substantial verbatim quote* (a multi-word phrase, normalized
  length ≥ 12 chars) that appears in the document. `grounding_quote` carries the matched span.
  CONFIRMED means **the cited evidence exists in the document — NOT that the finding is correct,
  important, or fairly characterized.** Claim correctness and severity are a human's call; the
  backstop only certifies the quote is real.
- **NOT-FOUND-IN-DOC** — the finding embeds a substantial quote that does **not** appear in the
  document. The model claimed document text that isn't there (fabricated, or a paraphrase the model
  wrongly presented as a quote). Surface it as a flag; do not silently drop it (a human confirms).
- **NEEDS-HUMAN** — the finding has no substantial verbatim quote to check: a paraphrase, a
  cross-section implication, or only a lone identifier/filename in backticks (too trivial to ground).
  The backstop cannot auto-ground it; a human decides. **This is the expected default for a large
  share of findings** — a quote-grep can only adjudicate findings that quote the document. A high
  NEEDS-HUMAN count is not a failure; it is the honest reach of a deterministic backstop.

## Why a quote-grep, with eyes open

A deterministic quote-grep is brittle in known ways, and the protocol is designed around them rather
than pretending they don't exist:

- **Paraphrased quotes** ("must" vs "should") miss the grep. Normalization (lowercase, folded smart
  quotes/dashes, collapsed whitespace) absorbs format-only differences, but a genuine wording change
  yields NOT-FOUND-IN-DOC. That is acceptable: a finding that quotes the document should quote it
  accurately; an inaccurate "quote" is itself worth flagging.
- **Valid findings without a quote** (cross-section implications, structural observations) land in
  NEEDS-HUMAN, never NOT-FOUND-IN-DOC — the backstop does not punish a finding for lacking a quote,
  it just declines to auto-confirm it.
- **Trivial matches** (a finding mentioning `` `panel-critique.sh` ``) are excluded: grounding quotes
  must be multi-word phrases, so a lone filename/identifier cannot manufacture a CONFIRMED.

The NOT-FOUND-IN-DOC and (eventual) miscategorization rates are what RU6's verifier-rate measurement
tracks against the ≤5% bar. Until that lands, treat NOT-FOUND-IN-DOC as "worth a human's glance,"
not "discard."

## What this protocol does NOT do (v1 scope)

- No model-based verifier. A blinded LLM triage of NEEDS-HUMAN findings is a possible later
  enhancement, but v1 keeps the deterministic backstop as the sole authoritative gate — it sidesteps
  the verifier-contamination failure mode entirely.
- No claim-quality scoring (importance, severity, fairness). Out of scope for a quote-grep.
- No auto-deletion. Every finding survives to the output with its verdict; the human triages.
