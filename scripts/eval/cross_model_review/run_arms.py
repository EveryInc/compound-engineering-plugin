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
import hashlib
import json
import re
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


def _finding_uid(arm, doc_id, fid, text):
    """Opaque, globally-unique id for one arm's finding.

    A content+arm hash: unique per (arm, finding) so two arms reusing a local id
    like `f1` get different uids; order-independent so the pool and finalize agree;
    and it does not visibly encode the arm, so the judge stays blind.
    """
    h = hashlib.sha1(f"{arm}\x1f{doc_id}\x1f{fid}\x1f{text}".encode("utf-8")).hexdigest()
    return "g" + h[:12]


def gt_pool(records):
    """Build the blind GT-match pool + arm provenance from arm records.

    Returns `pool` (what the judge sees: uid + doc_id + text, NO arm, ordered by
    opaque uid so order leaks nothing) and `provenance` (uid -> {arm, doc_id}, the
    private map the runner uses to resolve verdicts back to arms). Fixes the earlier
    cross-arm credit bleed where a verdict keyed on a local finding id (`f2`) credited
    every arm that happened to reuse it.
    """
    pool, provenance = [], {}
    for rec in records:
        arm, doc = rec.get("arm"), rec.get("doc_id")
        for f in rec.get("findings", []):
            uid = _finding_uid(arm, doc, f.get("id"), f.get("text", ""))
            provenance[uid] = {"arm": arm, "doc_id": doc}
            pool.append({"uid": uid, "doc_id": doc, "text": f.get("text", "")})
    pool.sort(key=lambda p: p["uid"])
    return {"pool": pool, "provenance": provenance}


def gt_hits_from_verdicts(provenance, verdicts):
    """Resolve blind per-finding verdicts (keyed by pool uid) to per-(arm,doc) gt_hit.

    A `matches_bug` verdict credits only the one arm whose finding carries that uid;
    `gt_hit` for an (arm,doc) is true if any of that arm's findings on the doc matched.
    """
    matched = {v.get("uid") for v in verdicts if v.get("matches_bug")}
    hits = {}
    for uid, p in provenance.items():
        key = (p.get("arm"), p.get("doc_id"))
        hits.setdefault(key, False)
        if uid in matched:
            hits[key] = True
    return [{"arm": a, "doc_id": d, "gt_hit": h} for (a, d), h in hits.items()]


def build_judge_prompt(pool, manifest):
    """Build the BLIND judge prompt for a non-Claude judge (codex/gemini).

    The judge sees each document's ground-truth bug and the pooled findings by uid
    and text only — never the arm (that's recovered after, preserving the blind).
    Asks for a JSON array of per-finding verdicts so parsing is reliable. Using a
    non-Claude judge is what clears the judge-family confound (R4).
    """
    gt = {d.get("id"): (d.get("ground_truth") or {}).get("bug")
          for d in manifest.get("docs", []) if d.get("subset") == "known_failure"}
    by_doc = {}
    for p in pool.get("pool", []):
        by_doc.setdefault(p.get("doc_id"), []).append(p)
    lines = [
        "You are a blind reviewer-of-reviews. Below are code/plan-review findings grouped by",
        "document. For EACH finding decide three booleans: matches_bug (does it describe THIS",
        "document's known bug?), actionable (a specific, addressable defect, not a generic",
        "caution), decision_changing (a competent owner would act on it).",
        "",
        "Return ONLY a JSON array of objects {uid, matches_bug, actionable, decision_changing}.",
        "No prose. Judge each finding on its own text; you are NOT told which reviewer produced it.",
        "",
    ]
    for doc, items in by_doc.items():
        if doc in gt and gt[doc]:
            lines.append(f"## Document {doc} — the bug a good review should have caught: {gt[doc]}")
        else:
            lines.append(f"## Document {doc} — NEGATIVE CONTROL: no real bug exists; matches_bug must be false for all.")
        for p in items:
            lines.append(f"- uid={p.get('uid')}: {p.get('text','')}")
        lines.append("")
    return "\n".join(lines)


def parse_judge_verdicts(text):
    """Parse the judge's JSON verdict array (tolerating a ```json fence). [] on failure."""
    t = (text or "").strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z0-9]*\n?", "", t)
        t = re.sub(r"\n?```$", "", t).strip()
    try:
        data = json.loads(t)
    except (json.JSONDecodeError, ValueError):
        return []
    return data if isinstance(data, list) else []


def yield_score(provenance, verdicts):
    """Per-arm finding-yield: the value GT-match alone misses.

    GT-match only credits surfacing the one bug a historical fix targeted, so a
    competent reviewer that finds *other* real bugs scores zero. This tallies, per
    arm, total findings and how many the blind judge classified unique-actionable
    and decision-changing (verdicts keyed by pool uid, resolved to arms here).
    verdicts: [{uid, actionable, decision_changing, duplicate?}].
    """
    by_uid = {v.get("uid"): v for v in verdicts}
    per_arm = {arm: {"total": 0, "unique_actionable": 0, "decision_changing": 0} for arm in ARMS}
    for uid, p in provenance.items():
        arm = p.get("arm")
        if arm not in per_arm:
            per_arm[arm] = {"total": 0, "unique_actionable": 0, "decision_changing": 0}
        per_arm[arm]["total"] += 1
        v = by_uid.get(uid)
        if not v:
            continue
        if v.get("actionable") and not v.get("duplicate"):
            per_arm[arm]["unique_actionable"] += 1
        if v.get("decision_changing"):
            per_arm[arm]["decision_changing"] += 1
    return per_arm


def gt_score(manifest, arm_matches):
    """Per-arm hit counts on the known-failure subset (R7 primary metric).

    arm_matches: [{arm, doc_id, gt_hit}] (e.g. from gt_hits_from_findings). Only
    verdicts on known_failure documents count; everything else is ignored. Returns
    per-arm {hits, scored} plus aggregate-ready known_failure records carrying gt_hit.
    """
    known_failure = {d.get("id") for d in manifest.get("docs", []) if d.get("subset") == "known_failure"}
    per_arm = {arm: {"hits": 0, "scored": 0} for arm in ARMS}
    scored = []
    for m in arm_matches:
        if m.get("doc_id") not in known_failure:
            continue
        arm = m.get("arm")
        if arm not in per_arm:
            continue
        hit = bool(m.get("gt_hit"))
        per_arm[arm]["scored"] += 1
        per_arm[arm]["hits"] += int(hit)
        scored.append({"arm": arm, "doc_id": m["doc_id"], "subset": "known_failure", "gt_hit": hit})
    return {"per_arm": per_arm, "scored": scored, "known_failure_n": len(known_failure)}


def aggregate(scored, manifest):
    """Aggregate post-judge, human-confirmed findings into a three-way decision (U6).

    scored: list of {arm, doc_id, subset, decision_changing: bool, gt_hit?: bool}.
    The primary signal is the per-arm score on the known-failure subset; forward-rated
    counts corroborate (R7). On known_failure the predicate is `gt_hit` when present
    (the targeted code-review GT-match), falling back to `decision_changing` (plan
    review's forward-rated judgment); other subsets always use `decision_changing`.
    Below minimum N, or if the negative control moved, the outcome is inconclusive
    rather than "build nothing" (R9, H2).
    """
    prereg = manifest.get("pre_registration", {})
    threshold = prereg.get("go_threshold")
    status = corpus_status(manifest)
    per_arm = {arm: {"known_failure": 0, "forward_rated": 0} for arm in ARMS}
    control_moved = False
    for s in scored:
        subset, arm = s.get("subset"), s.get("arm")
        if subset == "known_failure" and "gt_hit" in s:
            positive = s.get("gt_hit")
        else:
            positive = s.get("decision_changing")
        if not positive:
            continue
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

    p = sub.add_parser("gt-pool")
    p.add_argument("records")

    p = sub.add_parser("gt-resolve")
    p.add_argument("provenance")
    p.add_argument("verdicts")

    p = sub.add_parser("gt-score")
    p.add_argument("manifest")
    p.add_argument("arm_matches")

    p = sub.add_parser("yield-score")
    p.add_argument("provenance")
    p.add_argument("verdicts")

    p = sub.add_parser("judge-prompt")
    p.add_argument("pool")
    p.add_argument("manifest")

    p = sub.add_parser("judge-parse")
    p.add_argument("output")

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

    if args.cmd == "gt-pool":
        print(json.dumps(gt_pool(_load(args.records))))
        return 0

    if args.cmd == "gt-resolve":
        print(json.dumps(gt_hits_from_verdicts(_load(args.provenance), _load(args.verdicts))))
        return 0

    if args.cmd == "gt-score":
        print(json.dumps(gt_score(_load(args.manifest), _load(args.arm_matches))))
        return 0

    if args.cmd == "yield-score":
        print(json.dumps(yield_score(_load(args.provenance), _load(args.verdicts))))
        return 0

    if args.cmd == "judge-prompt":
        print(build_judge_prompt(_load(args.pool), _load(args.manifest)))
        return 0

    if args.cmd == "judge-parse":
        print(json.dumps(parse_judge_verdicts(Path(args.output).read_text())))
        return 0

    if args.cmd == "aggregate":
        print(json.dumps(aggregate(_load(args.scored), _load(args.manifest))))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
