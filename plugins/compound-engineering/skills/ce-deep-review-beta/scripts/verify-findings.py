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
    """Lowercase, fold smart punctuation to ASCII, strip markdown emphasis, collapse whitespace. Used
    for both doc and quote so format-only differences (smart quotes, em-dashes, *emphasis*, wrapping)
    do not cause false NOT-FOUND."""
    if not s:
        return ""
    s = unicodedata.normalize("NFKC", s)
    # Fold curly quotes/dashes to ASCII so a doc em-dash matches a finding hyphen, etc.
    trans = {
        "“": '"', "”": '"', "‘": "'", "’": "'",
        "–": "-", "—": "-", "−": "-", " ": " ",
    }
    s = s.translate(str.maketrans(trans))
    # Strip markdown emphasis markers (*italic*, **bold**, _italic_, __bold__): a model quotes the
    # emphasized text WITHOUT the markers, so a doc "the order *is* the container" must still match a
    # finding that quotes "the order is the container". The markers carry no content inside a prose
    # quote. Safe against snake_case false-merges: removal inserts no space, so "market_id" ->
    # "marketid" only collapses to a match when BOTH doc and quote carry the underscore (a true verbatim
    # quote); a spaced paraphrase "market id" keeps its space and still will not match "marketid".
    s = s.replace("*", "").replace("_", "")
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


def doc_id_for(doc_path):
    """The current run's doc_id base, matching panel-critique.sh's `basename <plan> .md`. Records
    written by the panel store doc_id = `<this base>__<lens>`; verify-records uses it to skip stale
    records left in a reused CMRE_OUT_DIR by a DIFFERENT plan."""
    base = os.path.basename(doc_path)
    if base.endswith(".md"):
        base = base[:-3]
    return base


def _iter_records(records_dir, doc_id_base):
    """Yield (model, lens, finding_dict) for every record file <cli>__<lens>.json in the dir whose
    record belongs to the CURRENT plan. The default CMRE_OUT_DIR (/tmp/cmre-panel/records) is reused
    across runs, so a record from a different plan can linger; verifying its findings against THIS doc
    would publish another plan's review into this sidecar. Each record stores doc_id = `<base>__<lens>`
    (arms.py, via panel-critique.sh's `--doc-id "${doc_id}__${lens}"`); skip any record whose stored
    doc_id doesn't match the current plan's `<doc_id_base>__<lens>`. A record missing doc_id entirely
    is kept (can't prove it's stale; preserves pre-doc_id records and hand-built fixtures)."""
    for fn in sorted(os.listdir(records_dir)):
        if not fn.endswith(".json"):
            continue
        stem = fn[:-5]
        model, _, lens = stem.partition("__")
        try:
            rec = json.load(open(os.path.join(records_dir, fn)))
        except (json.JSONDecodeError, OSError):
            continue
        rec_doc_id = rec.get("doc_id")
        if rec_doc_id is not None and rec_doc_id != f"{doc_id_base}__{lens}":
            continue  # stale record from another plan (or another lens) in a reused dir
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

    meas = sub.add_parser("measure", help="measure false-CONFIRM / false-NOT-FOUND rates on a labeled corpus")
    meas.add_argument("corpus_json")

    args = p.parse_args(argv)

    if args.cmd == "verify-one":
        doc_norm = normalize(Path(args.doc).read_text())
        verdict, quote = verify_one(args.finding, doc_norm)
        print(json.dumps({"verdict": verdict, "grounding_quote": quote}))
        return 0

    if args.cmd == "verify-records":
        doc_norm = normalize(Path(args.doc).read_text())
        doc_id_base = doc_id_for(args.doc)  # skip stale records from another plan in a reused dir
        rows = []
        counts = {"CONFIRMED": 0, "NOT-FOUND-IN-DOC": 0, "NEEDS-HUMAN": 0}
        for model, lens, f in _iter_records(args.records_dir, doc_id_base):
            text = f.get("text", "")
            verdict, quote = verify_one(text, doc_norm)  # blind: model/lens not passed in
            counts[verdict] += 1
            rows.append({
                "model": model, "lens": lens, "id": f.get("id", ""),
                "text": text, "verdict": verdict, "grounding_quote": quote,
            })
        print(json.dumps({"verified": rows, "counts": counts}))
        return 0

    if args.cmd == "measure":
        # RU6b verifier-rate measurement on a labeled corpus. Deterministic + model-blind, so N=1
        # (no trials) and no voice sampling: the verdict is a pure function of (text, doc).
        corpus = json.loads(Path(args.corpus_json).read_text())
        doc_norm = normalize(corpus["document"])
        grounded = confab = false_not_found = false_confirm = 0
        detail = []
        for it in corpus["items"]:
            verdict, _ = verify_one(it["text"], doc_norm)
            exp = it["expected"]
            if exp == "CONFIRMED":
                grounded += 1
                if verdict != "CONFIRMED":       # a grounded finding the backstop failed to confirm
                    false_not_found += 1
            elif exp == "NOT-FOUND-IN-DOC":
                confab += 1
                if verdict == "CONFIRMED":       # a fabricated quote the backstop wrongly confirmed
                    false_confirm += 1
            detail.append({"id": it.get("id"), "expected": exp, "got": verdict})
        fcr = (false_confirm / confab) if confab else 0.0
        fnr = (false_not_found / grounded) if grounded else 0.0
        print(json.dumps({
            "n": len(corpus["items"]), "grounded": grounded, "confabulated": confab,
            "false_confirm_rate": round(fcr, 4), "false_not_found_rate": round(fnr, 4),
            "eligible": fcr <= 0.05 and fnr <= 0.05, "detail": detail,
        }))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
