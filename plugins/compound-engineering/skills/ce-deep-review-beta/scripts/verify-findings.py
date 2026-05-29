#!/usr/bin/env python3
"""ce-deep-review-beta — deterministic quote-grep verification backstop (RU4).

Grounds each raw cross-model finding against the reviewed document and assigns ONE verdict:

  CONFIRMED        - the finding embeds a substantial verbatim quote that DOES appear in the doc.
  NOT-FOUND-IN-DOC - the finding embeds a substantial quote that does NOT appear in the doc
                     (the model claimed doc text that isn't there -- likely fabricated/paraphrased).
  NEEDS-HUMAN      - the finding has no substantial verbatim quote to check (paraphrase, or a
                     cross-section implication). The backstop cannot auto-ground it; a human decides.

This is the AUTHORITATIVE gate (R: "the verifier can inherit model contamination unless the
synchronous quote-grep backstop is the authoritative gate"). It is deterministic: same finding +
same doc -> same verdict, with no model in the loop, so it is inherently **blind to the producing
model** -- the verdict NEVER reads the model label. `verify-records` re-attaches the model only to
LABEL output rows, never to compute a verdict.

CONFIRMED means "the quoted evidence exists in the document" -- NOT "the finding is correct or
important." Claim correctness/severity is out of scope for a quote-grep; that is the human's call.

A substantial quote = a quoted span (",  '', ``, or smart quotes) that, normalized, is >= MIN_QUOTE
chars AND contains a space (a phrase, not a lone identifier/filename -- those match too trivially).
"""

import argparse
import json
import os
import re
import sys
import unicodedata
from pathlib import Path

MIN_QUOTE = 12  # normalized chars; below this a "quote" is too short to ground a claim

# Quoted spans the models actually emit: straight/smart double quotes, single quotes, backticks.
_QUOTE_PATTERNS = [
    r'"([^"]+)"',           # straight double
    r"“([^”]+)”",  # smart double  "  "
    r"`([^`]+)`",           # backtick
    r"'([^']+)'",           # straight single (also catches apostrophes; length+space filter prunes)
]


def normalize(s):
    """Lowercase, fold smart punctuation to ASCII, collapse whitespace. Used for both doc and quote
    so format-only differences (smart quotes, em-dashes, wrapping) do not cause false NOT-FOUND."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    # Fold curly quotes/dashes to ASCII so a doc em-dash matches a finding hyphen, etc.
    trans = {
        "“": '"', "”": '"', "‘": "'", "’": "'",
        "–": "-", "—": "-", "−": "-", " ": " ",
    }
    s = s.translate(str.maketrans(trans))
    s = s.lower()
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def extract_quotes(text):
    """All quoted spans in the finding text (raw, de-duplicated, order-preserved)."""
    out = []
    seen = set()
    for pat in _QUOTE_PATTERNS:
        for m in re.finditer(pat, text):
            span = m.group(1).strip()
            if span and span not in seen:
                seen.add(span)
                out.append(span)
    return out


def candidate_quotes(text):
    """Quotes substantial enough to ground a claim: normalized length >= MIN_QUOTE AND multi-word
    (contains a space). A lone `panel-critique.sh` or "agy" is too trivial to confirm anything."""
    cands = []
    for q in extract_quotes(text):
        n = normalize(q)
        if len(n) >= MIN_QUOTE and " " in n:
            cands.append(q)
    return cands


def verify_one(finding_text, doc_norm):
    """Return (verdict, grounding_quote_or_None). Pure function of (finding text, normalized doc) --
    no model label is consulted, so the verdict is blind to the producing model."""
    cands = candidate_quotes(finding_text)
    if not cands:
        return "NEEDS-HUMAN", None
    for q in cands:
        if normalize(q) in doc_norm:
            return "CONFIRMED", q
    return "NOT-FOUND-IN-DOC", None


def _iter_records(records_dir):
    """Yield (model, lens, finding_dict) for every record file <cli>__<lens>.json in the dir."""
    for fn in sorted(os.listdir(records_dir)):
        if not fn.endswith(".json"):
            continue
        stem = fn[:-5]
        model, _, lens = stem.partition("__")
        try:
            rec = json.load(open(os.path.join(records_dir, fn)))
        except (json.JSONDecodeError, OSError):
            continue
        for f in rec.get("findings", []):
            yield model, lens, f


def main(argv=None):
    p = argparse.ArgumentParser(description="ce-deep-review verification backstop (quote-grep).")
    sub = p.add_subparsers(dest="cmd", required=True)

    one = sub.add_parser("verify-one", help="verify a single finding string against a doc")
    one.add_argument("doc")
    one.add_argument("finding")

    rec = sub.add_parser("verify-records", help="verify every finding in a records dir against a doc")
    rec.add_argument("doc")
    rec.add_argument("records_dir")

    args = p.parse_args(argv)
    doc_norm = normalize(Path(args.doc).read_text())

    if args.cmd == "verify-one":
        verdict, quote = verify_one(args.finding, doc_norm)
        print(json.dumps({"verdict": verdict, "grounding_quote": quote}))
        return 0

    if args.cmd == "verify-records":
        rows = []
        counts = {"CONFIRMED": 0, "NOT-FOUND-IN-DOC": 0, "NEEDS-HUMAN": 0}
        for model, lens, f in _iter_records(args.records_dir):
            text = f.get("text", "")
            verdict, quote = verify_one(text, doc_norm)  # blind: model/lens not passed in
            counts[verdict] += 1
            rows.append({
                "model": model, "lens": lens, "id": f.get("id", ""),
                "text": text, "verdict": verdict, "grounding_quote": quote,
            })
        print(json.dumps({"verified": rows, "counts": counts}))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
