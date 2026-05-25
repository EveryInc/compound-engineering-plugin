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


def dedup_findings(items):
    """Group pooled findings by normalized text — the cross-arm agreement signal (U5).

    items: list of {arm, text}. Returns [{text, arms:[...], count}] so it is
    visible when multiple arms independently raised the same point. This is a
    text-normalized dedup, not the full scope-aware peer/nested merge; the eval
    only needs cross-arm agreement, not the review pipeline's chaining.
    """
    groups = {}
    order = []
    for it in items:
        key = " ".join(str(it.get("text", "")).lower().split())
        if key not in groups:
            groups[key] = {"text": it.get("text", ""), "arms": [], "count": 0}
            order.append(key)
        g = groups[key]
        g["count"] += 1
        arm = it.get("arm")
        if arm and arm not in g["arms"]:
            g["arms"].append(arm)
    return [groups[k] for k in order]


def integrity_verdict(correct, total, n_arms, margin=0.15):
    """Blind-integrity check (U5 / R5): can the judge identify arms above chance?

    chance = 1/n_arms. If the judge's arm-guess accuracy exceeds chance by more
    than `margin`, the blind did not hold and the per-arm metric is confounded.
    """
    if total <= 0 or n_arms <= 0:
        return {"accuracy": None, "chance": None, "confounded": False}
    accuracy = correct / total
    chance = 1.0 / n_arms
    return {"accuracy": accuracy, "chance": chance, "confounded": accuracy > chance + margin}


def aggregate(scored, manifest):
    """Aggregate post-judge, human-confirmed findings into a three-way decision (U6).

    scored: list of {arm, doc_id, subset, decision_changing: bool}. The primary
    signal is the per-arm decision-changing count on the known-failure subset;
    forward-rated counts corroborate (R7). Below minimum N, or if the negative
    control moved, the outcome is inconclusive rather than "build nothing" (R9, H2).
    """
    prereg = manifest.get("pre_registration", {})
    threshold = prereg.get("go_threshold")
    status = corpus_status(manifest)
    per_arm = {arm: {"known_failure": 0, "forward_rated": 0} for arm in ARMS}
    control_moved = False
    for s in scored:
        if not s.get("decision_changing"):
            continue
        subset, arm = s.get("subset"), s.get("arm")
        if subset == "negative_control":
            control_moved = True
        elif subset in ("known_failure", "forward_rated") and arm in per_arm:
            per_arm[arm][subset] += 1

    winning_arm, best = None, -1
    for arm, c in per_arm.items():
        if c["known_failure"] > best:
            best, winning_arm = c["known_failure"], arm

    if status["below_n"]:
        outcome = "inconclusive"
    elif control_moved:
        outcome = "inconclusive"  # negative control moved -> harness stability problem (H2)
    elif isinstance(threshold, int) and best >= threshold and best > 0:
        outcome = f"build:{winning_arm}"
    else:
        outcome = "build_nothing"

    return {
        "outcome": outcome,
        "winning_arm": winning_arm if outcome.startswith("build:") else None,
        "per_arm": per_arm,
        "control_moved": control_moved,
        "below_n": status["below_n"],
        "corpus_n": status["corpus_n"],
        "go_threshold": threshold,
    }


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

    p = sub.add_parser("dedup")
    p.add_argument("items")

    p = sub.add_parser("integrity-verdict")
    p.add_argument("correct", type=int)
    p.add_argument("total", type=int)
    p.add_argument("n_arms", type=int)
    p.add_argument("--margin", type=float, default=0.15)

    p = sub.add_parser("aggregate")
    p.add_argument("scored")
    p.add_argument("manifest")

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

    if args.cmd == "dedup":
        print(json.dumps(dedup_findings(_load(args.items))))
        return 0

    if args.cmd == "integrity-verdict":
        print(json.dumps(integrity_verdict(args.correct, args.total, args.n_arms, args.margin)))
        return 0

    if args.cmd == "aggregate":
        print(json.dumps(aggregate(_load(args.scored), _load(args.manifest))))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
