#!/usr/bin/env python3
"""Cross-model review evaluation harness — runner skeleton (U2).

Owns the deterministic carrier of the eval: the canonical record contract, the
shared-run-dir record store, the per-arm timeout + circuit breaker for the CLI
arms it spawns, and the label-stripping transform the blinded judge depends on.

The actual CLI-arm invocation lives in arms.py (U3); the in-process arms (a, d)
and the judge are produced by the orchestrator (U4/U5) and ingested here as
schema-conformant record files. Aggregation pools by reading every record file
in the run dir, regardless of which producer wrote it.

Subcommands are intentionally small and deterministic so they are unit-testable
via Bun.spawn(["python3", ...]) without invoking any model.
"""

import argparse
import json
import sys
from pathlib import Path

ARMS = ["a_baseline", "b_isolated", "c_fixed_context", "d_self_critic"]
CLI_ARMS = {"b_isolated", "c_fixed_context"}  # spawned by the runner; subject to timeout/breaker
STATUSES = ["ok", "degraded", "timeout", "error"]
PRODUCERS = ["runner", "orchestrator"]
IDENTIFYING_FIELDS = ["arm", "trial", "latency_ms", "model", "cost", "producer", "status"]
DEFAULT_BREAKER_THRESHOLD = 3
KNOWN_KEYS = {"arm", "doc_id", "trial", "status", "producer", "latency_ms", "findings", "model", "cost"}


def validate_record(rec):
    """Return a list of human-readable errors; empty list means valid."""
    errors = []
    if not isinstance(rec, dict):
        return ["record is not a JSON object"]
    for field in ("arm", "doc_id", "trial", "status", "producer", "latency_ms", "findings"):
        if field not in rec:
            errors.append(f"missing required field: {field}")
    for key in rec:
        if key not in KNOWN_KEYS:
            errors.append(f"unknown field: {key}")
    if rec.get("arm") not in ARMS:
        errors.append(f"arm must be one of {ARMS}")
    if rec.get("status") not in STATUSES:
        errors.append(f"status must be one of {STATUSES}")
    if rec.get("producer") not in PRODUCERS:
        errors.append(f"producer must be one of {PRODUCERS}")
    if not isinstance(rec.get("doc_id"), str) or not rec.get("doc_id"):
        errors.append("doc_id must be a non-empty string")
    trial = rec.get("trial")
    if not isinstance(trial, int) or isinstance(trial, bool) or trial < 1:
        errors.append("trial must be an integer >= 1")
    latency = rec.get("latency_ms")
    if not isinstance(latency, (int, float)) or isinstance(latency, bool) or latency < 0:
        errors.append("latency_ms must be a number >= 0")
    findings = rec.get("findings")
    if not isinstance(findings, list):
        errors.append("findings must be an array")
    else:
        for i, f in enumerate(findings):
            if not isinstance(f, dict) or "id" not in f or "text" not in f:
                errors.append(f"findings[{i}] must be an object with id and text")
    return errors


def corpus_status(manifest):
    """Compute corpus size vs the pre-registered minimum N."""
    docs = manifest.get("docs", [])
    prereg = manifest.get("pre_registration", {})
    minimum = prereg.get("minimum_corpus_n")
    trials = prereg.get("trials_per_arm")
    corpus_n = len(docs)
    below_n = isinstance(minimum, int) and corpus_n < minimum
    return {
        "corpus_n": corpus_n,
        "minimum_corpus_n": minimum,
        "below_n": below_n,
        "trials_per_arm": trials,
        # An eval below minimum N reports "inconclusive", never "build nothing" (R9).
        "outcome_floor": "inconclusive" if below_n else "decidable",
    }


def strip_labels(rec):
    """Remove arm-identifying fields before the blinded judge sees a record.

    Keeps doc_id (the judge dedups within a document) and findings; drops every
    field that could betray which arm produced it (U5 / FE4 / H3).
    """
    return {k: v for k, v in rec.items() if k not in IDENTIFYING_FIELDS}


def breaker_should_disable(consecutive_failures, threshold=DEFAULT_BREAKER_THRESHOLD):
    """Pure circuit-breaker decision: disable an arm after N consecutive failures."""
    return consecutive_failures >= threshold


def ingest(run_dir, record):
    """Validate an externally-produced (orchestrator) record and write it into the store."""
    errors = validate_record(record)
    if errors:
        raise ValueError("; ".join(errors))
    run_path = Path(run_dir)
    run_path.mkdir(parents=True, exist_ok=True)
    name = f"{record['arm']}__{record['doc_id']}__t{record['trial']}.json"
    out = run_path / name
    out.write_text(json.dumps(record, indent=2))
    return str(out)


def pool(run_dir):
    """Read every record file in the run dir and tally by arm."""
    run_path = Path(run_dir)
    by_arm = {arm: 0 for arm in ARMS}
    total = 0
    invalid = 0
    for f in sorted(run_path.glob("*.json")):
        try:
            rec = json.loads(f.read_text())
        except json.JSONDecodeError:
            invalid += 1
            continue
        if validate_record(rec):
            invalid += 1
            continue
        by_arm[rec["arm"]] = by_arm.get(rec["arm"], 0) + 1
        total += 1
    return {"total": total, "by_arm": by_arm, "invalid": invalid}


def _load(path):
    return json.loads(Path(path).read_text())


def main(argv=None):
    parser = argparse.ArgumentParser(description="Cross-model review eval runner (deterministic carrier).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("validate-record")
    p.add_argument("record")

    p = sub.add_parser("corpus-status")
    p.add_argument("manifest")

    p = sub.add_parser("strip-labels")
    p.add_argument("record")

    p = sub.add_parser("breaker-check")
    p.add_argument("consecutive_failures", type=int)
    p.add_argument("--threshold", type=int, default=DEFAULT_BREAKER_THRESHOLD)

    p = sub.add_parser("ingest")
    p.add_argument("run_dir")
    p.add_argument("record")

    p = sub.add_parser("pool")
    p.add_argument("run_dir")

    args = parser.parse_args(argv)

    if args.cmd == "validate-record":
        errors = validate_record(_load(args.record))
        print(json.dumps({"valid": not errors, "errors": errors}))
        return 0 if not errors else 1

    if args.cmd == "corpus-status":
        print(json.dumps(corpus_status(_load(args.manifest))))
        return 0

    if args.cmd == "strip-labels":
        print(json.dumps(strip_labels(_load(args.record))))
        return 0

    if args.cmd == "breaker-check":
        print(json.dumps({"disable": breaker_should_disable(args.consecutive_failures, args.threshold)}))
        return 0

    if args.cmd == "ingest":
        try:
            written = ingest(args.run_dir, _load(args.record))
        except ValueError as e:
            print(json.dumps({"written": None, "error": str(e)}))
            return 1
        print(json.dumps({"written": written}))
        return 0

    if args.cmd == "pool":
        print(json.dumps(pool(args.run_dir)))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
