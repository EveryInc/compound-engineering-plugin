#!/usr/bin/env python3
"""Code-review eval driver — wires the deterministic spine end-to-end.

`plan`  : enumerate the per-(arm x doc x trial) work, emit the CLI-arm commands the
          orchestrator can run, and the in-process/judge handoff. Refuses to plan a
          run whose threshold/N are not pre-registered (R9).
`finalize`: over a run dir of ingested arm records + the judge's verdicts, run the
          gt-resolve -> gt-score -> aggregate chain and render the decision artifact.

What this driver does NOT do: run arms a_baseline / d_self_critic or the judge. Those
are model-driven and produced by the orchestrator via in-process subagent dispatch (there
is no `claude -p`; see README "How the two halves cooperate"). The driver consumes their
record/verdict files, so it is fully deterministic and unit-testable. The CLI arms (b, c)
are spawnable from Python; `plan` emits their exact commands rather than executing ~N*trials
model calls implicitly.
"""

import argparse
import json
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import run_arms  # noqa: E402  (co-located deterministic carrier)

ARMS = run_arms.ARMS
CLI_ARMS = ["b_isolated", "c_fixed_context"]
IN_PROCESS_ARMS = ["a_baseline", "d_self_critic"]
ARMS_PY = str(Path(__file__).resolve().parent / "arms.py")


def _load(path):
    return json.loads(Path(path).read_text())


def plan(manifest, out_dir, rubric, context, cli_b, cli_c):
    """Enumerate work units + handoff; guard pre-registration (R9)."""
    prereg = manifest.get("pre_registration", {})
    missing = [k for k in ("go_threshold", "minimum_corpus_n", "trials_per_arm") if prereg.get(k) is None]
    if missing:
        return {"ok": False, "error": f"pre-registration incomplete: {', '.join(missing)} must be set before running (R9)"}

    # Pre-registration values must be positive integers, not just present. A string like
    # "2" passes the missing-field check above but is silently ignored downstream:
    # aggregate's `isinstance(threshold, int)` guard turns a string go_threshold into a
    # blanket build_nothing, and corpus_status's `isinstance(minimum, int)` guard turns a
    # string minimum_corpus_n into below_n=False — both corrupt the decision without erroring.
    # trials_per_arm=0 (or a non-int) would enumerate zero arm runs yet still let finalize
    # emit a decision from no experimental data.
    def _is_pos_int(v):
        return isinstance(v, int) and not isinstance(v, bool) and v >= 1

    trials = prereg["trials_per_arm"]
    if not _is_pos_int(trials):
        return {"ok": False, "error": f"trials_per_arm must be an integer >= 1 (got {trials!r}); a decision-grade run needs >= 3 (R8)"}
    go_threshold = prereg["go_threshold"]
    if not _is_pos_int(go_threshold):
        return {"ok": False, "error": f"go_threshold must be an integer >= 1 (got {go_threshold!r}); a non-int is silently ignored downstream and forces build_nothing (R9)"}
    minimum_corpus_n = prereg["minimum_corpus_n"]
    if not _is_pos_int(minimum_corpus_n):
        return {"ok": False, "error": f"minimum_corpus_n must be an integer >= 1 (got {minimum_corpus_n!r}); a non-int is silently ignored downstream and skips the power check (R9)"}

    docs = manifest.get("docs", [])
    if not any(d.get("subset") == "known_failure" for d in docs):
        return {"ok": False, "error": "no known_failure documents in corpus — nothing to score on the primary metric (R7)"}

    cli_for = {"b_isolated": cli_b, "c_fixed_context": cli_c}

    expected_records, cli_commands, in_process_records = [], [], []
    for doc in docs:
        doc_id, path = doc.get("id"), doc.get("path", f"FILL:{doc.get('id')}")
        for trial in range(1, trials + 1):
            for arm in ARMS:
                expected_records.append({"arm": arm, "doc_id": doc_id, "trial": trial})
            for arm in CLI_ARMS:
                argv = ["python3", ARMS_PY, "run-arm", arm, cli_for[arm], path, rubric]
                if arm == "c_fixed_context":
                    argv += ["--context", context]
                argv += ["--doc-id", doc_id, "--trial", str(trial)]
                cli_commands.append({"arm": arm, "doc_id": doc_id, "trial": trial, "argv": argv})
            for arm in IN_PROCESS_ARMS:
                in_process_records.append({"arm": arm, "doc_id": doc_id, "trial": trial})

    out_root = Path(out_dir)
    records_dir = out_root / "records"
    records_dir.mkdir(parents=True, exist_ok=True)

    state = {
        "manifest_docs": len(docs),
        "trials_per_arm": trials,
        "arms": ARMS,
        "records_dir": str(records_dir),
        "expected_records": expected_records,
        "cli_commands": cli_commands,
        "orchestrator_todo": {
            "in_process_arm_records": in_process_records,
            "ingest_to": str(records_dir),
            "judge_gt_verdicts": "per-finding matches_bug for known_failure docs (gt_match_rubric.md)",
            "judge_class_verdicts": "per-(arm,doc) decision_changing for forward_rated + negative_control (judge_rubric.md)",
            "then": f"drive_eval.py finalize {records_dir} <manifest> --gt-verdicts <f> [--class-verdicts <f>] [--integrity correct,total]",
        },
    }
    (out_root / "run-state.json").write_text(json.dumps(state, indent=2))

    return {
        "ok": True,
        "run_dir": str(out_root),
        "records_dir": str(records_dir),
        "counts": {
            "docs": len(docs),
            "known_failure": sum(1 for d in docs if d.get("subset") == "known_failure"),
            "expected_records": len(expected_records),
            "cli_commands": len(cli_commands),
            "in_process_records": len(in_process_records),
        },
    }


# A trial only counts as completed evidence when its arm actually produced a review.
# timeout/error records are schema-valid (run_arms emits them on CLI auth/quota/runtime
# failure) but carry no usable findings; counting them would let coverage() treat a failed
# trial as present and let finalize score it as a real zero-finding review.
COMPLETED_STATUSES = {"ok", "degraded"}


def load_records(records_dir):
    """Schema-conformant, completed record files in the dir (skips run-state and junk).

    Records whose status is timeout/error are dropped here so they are neither scored
    nor counted toward coverage — a failed trial is a missing trial, not a clean
    zero-finding review.
    """
    out = []
    for f in sorted(Path(records_dir).glob("*.json")):
        try:
            rec = json.loads(f.read_text())
        except json.JSONDecodeError:
            continue
        if run_arms.validate_record(rec):
            continue
        if rec.get("status") not in COMPLETED_STATUSES:
            continue
        out.append(rec)
    return out


def _subset_counts(docs):
    c = {"known_failure": 0, "forward_rated": 0, "negative_control": 0}
    for d in docs:
        s = d.get("subset")
        if s in c:
            c[s] += 1
    return c


def _yield_section(yield_per_arm):
    """Finding-yield table — read alongside GT-match, not instead of it."""
    if not yield_per_arm:
        return ""
    rows = [
        f"| {arm} | {yp.get('total', 0)} | {yp.get('unique_actionable', 0)} | {yp.get('decision_changing', 0)} |"
        for arm, yp in yield_per_arm.items()
    ]
    return (
        "## Finding yield (corroborating — GT-match alone undercounts reviewer value)\n\n"
        "Total findings vs. blind-judged unique-actionable and decision-changing. A low\n"
        "GT-match with high unique-actionable yield means the arm found real bugs that were\n"
        "not the one the historical fix targeted.\n\n"
        "| Arm | Findings | Unique-actionable | Decision-changing |\n"
        "|-----|----------|-------------------|-------------------|\n"
        + "\n".join(rows)
        + "\n\n"
    )


def render_artifact(manifest, result, gt, integ, judge_family, run_date, yield_per_arm=None):
    docs = manifest.get("docs", [])
    sc = _subset_counts(docs)
    prereg = manifest.get("pre_registration", {})
    fam = judge_family or "<undisclosed>"
    fam_note = "same family as baseline/self-critic — blind-integrity risk" if fam == "claude" else "distinct"

    rows = []
    for arm in ARMS:
        kf = gt["per_arm"].get(arm, {}).get("hits", 0)
        fr = result["per_arm"].get(arm, {}).get("forward_rated", 0)
        rows.append(f"| {arm} | {kf} | {fr} | trials_per_arm={prereg.get('trials_per_arm')} |")

    if integ is not None:
        acc = integ.get("accuracy")
        chance = integ.get("chance")
        integ_line = f"judge arm-guess accuracy {acc} vs chance {chance} — " + (
            "confounded -> result is inconclusive" if integ.get("confounded") else "held"
        )
    else:
        integ_line = "not run"

    power = "met" if not result.get("below_n") else "below -> inconclusive"
    control = "MOVED -> harness stability problem, result is inconclusive" if result.get("control_moved") else "did not move"

    return f"""# Cross-Model Critique Evaluation — Decision Record

Framing note: this evaluates a **cross-model critique** lever, not an "independent review".

**Date:** {run_date}
**Corpus:** {len(docs)} documents ({sc['known_failure']} known-failure, {sc['forward_rated']} forward-rated, {sc['negative_control']} negative-control)
**Pre-registered before running:** go_threshold = {prereg.get('go_threshold')}, minimum_corpus_n = {prereg.get('minimum_corpus_n')}, trials_per_arm = {prereg.get('trials_per_arm')}, arm_c_context_rule = {prereg.get('arm_c_context_rule')}
**Judge model family:** {fam} ({fam_note})

## Outcome

> **{result['outcome']}**

Generated from the aggregate. Known-failure hits are GT-match verdicts (did an arm surface
the bug the fix proved mattered), human-confirmed per R6 before this record is trusted.

## Primary signal — known-failure subset (GT-match hits)

| Arm | Known-failure hits | Forward-rated (corroborating) | Trials |
|-----|--------------------|-------------------------------|--------|
{chr(10).join(rows)}

{_yield_section(yield_per_arm)}## Validity checks

- **Blind-integrity:** {integ_line}.
- **Negative control:** {control}.
- **Power:** corpus_n {result.get('corpus_n')} vs minimum_corpus_n {prereg.get('minimum_corpus_n')} — {power}.

## What this does and does not conclude

- It concludes whether a cross-model-critique lever surfaced the known bug often enough to
  justify its carrying cost, on this corpus, against the pre-registered threshold.
- It does not decompose a self-critic win, and does not measure cross-machine setup fragility.
"""


def coverage(records, manifest):
    """Did the run produce exactly the pre-registered docs x arms x trials records?

    Returns None when trials_per_arm is not a usable int (nothing to check against);
    otherwise {expected, present, complete, missing}. Completeness is exact set
    membership against the expected (arm, doc_id, trial) tuples derived from the
    manifest — not a bare count. A count-only check would mark a run complete on the
    wrong corpus (e.g. records for d1/d3 while the manifest expects d1/d2), and
    finalize would then score/decide on a stale or mismatched set. `present` counts
    only expected tuples that are actually covered, so extra/stale records never
    inflate it toward `expected`.
    """
    trials = manifest.get("pre_registration", {}).get("trials_per_arm")
    if not isinstance(trials, int) or isinstance(trials, bool) or trials < 1:
        return None
    docs = manifest.get("docs", [])
    expected_tuples = {
        (arm, doc.get("id"), trial)
        for doc in docs
        for arm in ARMS
        for trial in range(1, trials + 1)
    }
    present_tuples = {(r.get("arm"), r.get("doc_id"), r.get("trial")) for r in records}
    covered = expected_tuples & present_tuples
    missing = [
        {"arm": a, "doc_id": d, "trial": t}
        for (a, d, t) in sorted(
            expected_tuples - present_tuples, key=lambda x: (str(x[1]), str(x[0]), x[2])
        )
    ]
    return {
        "expected": len(expected_tuples),
        "present": len(covered),
        "complete": covered == expected_tuples,
        "missing": missing,
    }


def finalize(records_dir, manifest, gt_verdicts, class_verdicts=None, integrity=None,
             judge_family=None, out=None, yield_verdicts=None):
    records = load_records(records_dir)

    # Class verdicts cover forward_rated + negative_control only. A class verdict carrying
    # subset "known_failure" would be scored via aggregate's decision_changing fallback,
    # crediting a GT-match hit with no actual GT match — fail loud rather than corrupt the
    # primary signal.
    misrouted = [c for c in (class_verdicts or []) if c.get("subset") == "known_failure"]
    if misrouted:
        raise ValueError(
            f"{len(misrouted)} class-verdict entry(ies) carry subset 'known_failure'; "
            "known-failure scoring must come from --gt-verdicts (GT-match), not class verdicts "
            "(which are for forward_rated + negative_control only)"
        )

    pool = run_arms.gt_pool(records)
    gt_hits = run_arms.gt_hits_from_verdicts(pool["provenance"], gt_verdicts)
    gt = run_arms.gt_score(manifest, gt_hits)
    scored = list(gt["scored"]) + list(class_verdicts or [])
    result = run_arms.aggregate(scored, manifest)

    # An incomplete record set cannot support ANY confident decision (R8/R9 spirit).
    # This covers build_nothing as well as build:<arm>: a "don't build" verdict drawn
    # from partial/interrupted data is a false negative, not a valid decision. An
    # already-inconclusive outcome is left as-is but still annotated with the coverage gap.
    cov = coverage(records, manifest)
    if cov is not None and not cov["complete"]:
        result = {**result, "outcome": "inconclusive", "incomplete_coverage": cov}

    # finding-yield: GT-match alone undercounts a reviewer that finds other real bugs
    yield_per_arm = run_arms.yield_score(pool["provenance"], yield_verdicts) if yield_verdicts is not None else None

    integ = None
    if integrity is not None:
        correct, total = integrity
        integ = run_arms.integrity_verdict(correct, total, len(ARMS))
        if integ.get("confounded"):
            result = {**result, "outcome": "inconclusive", "confounded": True}

    artifact = render_artifact(manifest, result, gt, integ, judge_family, str(date.today()), yield_per_arm)
    artifact_path = None
    if out:
        Path(out).write_text(artifact)
        artifact_path = str(out)

    return {
        "outcome": result["outcome"],
        "artifact_path": artifact_path,
        "per_arm": result["per_arm"],
        "gt_per_arm": gt["per_arm"],
        "yield_per_arm": yield_per_arm,
        "known_failure_n": gt["known_failure_n"],
        "below_n": result.get("below_n"),
        "control_moved": result.get("control_moved"),
        "coverage": cov,
        "incomplete_coverage": result.get("incomplete_coverage"),
        "tied_arms": result.get("tied_arms", []),
        "integrity": integ,
    }


def _parse_integrity(s):
    if not s:
        return None
    correct, total = s.split(",", 1)
    return (int(correct), int(total))


def main(argv=None):
    parser = argparse.ArgumentParser(description="Code-review eval driver (deterministic spine).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("plan")
    p.add_argument("manifest")
    p.add_argument("--out-dir", required=True)
    p.add_argument("--rubric", default="FILL:code-review-rubric.md")
    p.add_argument("--context", default="FILL:arm-c-context.md")
    p.add_argument("--cli-b", default="codex")
    p.add_argument("--cli-c", default="gemini")

    p = sub.add_parser("finalize")
    p.add_argument("records_dir")
    p.add_argument("manifest")
    p.add_argument("--gt-verdicts", required=True)
    p.add_argument("--yield-verdicts", help="per-finding {uid, actionable, decision_changing, duplicate} for finding-yield")
    p.add_argument("--class-verdicts")
    p.add_argument("--integrity", help="correct,total of the judge arm-guessing probe")
    p.add_argument("--judge-family")
    p.add_argument("--out")

    args = parser.parse_args(argv)

    if args.cmd == "plan":
        result = plan(_load(args.manifest), args.out_dir, args.rubric, args.context, args.cli_b, args.cli_c)
        print(json.dumps(result))
        return 0 if result.get("ok") else 1

    if args.cmd == "finalize":
        class_verdicts = _load(args.class_verdicts) if args.class_verdicts else None
        yield_verdicts = _load(args.yield_verdicts) if args.yield_verdicts else None
        try:
            result = finalize(
                args.records_dir,
                _load(args.manifest),
                _load(args.gt_verdicts),
                class_verdicts=class_verdicts,
                integrity=_parse_integrity(args.integrity),
                judge_family=args.judge_family,
                out=args.out,
                yield_verdicts=yield_verdicts,
            )
        except ValueError as e:
            print(json.dumps({"error": str(e)}))
            return 1
        print(json.dumps(result))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
