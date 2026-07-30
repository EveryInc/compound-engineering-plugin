#!/usr/bin/env python3
"""Apply deterministic validation, exact dedup, confidence gates, and numbering."""

from __future__ import annotations

import json
import sys
from collections import Counter
from typing import Any


SEVERITIES = ("P0", "P1", "P2", "P3")
CONFIDENCES = (0, 25, 50, 75, 100)
AUTOFIX_CLASSES = ("gated_auto", "manual", "advisory")
OWNERS = ("downstream-resolver", "human", "release")
REQUIRED_TOP = {
    "reviewer": str,
    "findings": list,
    "residual_risks": list,
    "testing_gaps": list,
}
REQUIRED_FINDING = {
    "title": str,
    "severity": str,
    "file": str,
    "line": (int, str),
    "confidence": int,
    "autofix_class": str,
    "owner": str,
    "requires_verification": bool,
    "pre_existing": bool,
}


def valid_return(value: Any) -> bool:
    return isinstance(value, dict) and all(
        isinstance(value.get(key), expected) for key, expected in REQUIRED_TOP.items()
    )


def nonempty_string(value: Any) -> bool:
    return isinstance(value, str) and bool(value.strip())


def valid_finding(value: Any) -> bool:
    if not isinstance(value, dict):
        return False
    if not all(isinstance(value.get(key), expected) for key, expected in REQUIRED_FINDING.items()):
        return False
    if type(value["confidence"]) is not int:
        return False
    if "first_evidence" in value and not nonempty_string(value["first_evidence"]):
        return False
    line = value["line"]
    line_valid = (type(line) is int and line > 0) or (
        isinstance(line, str) and bool(line.strip())
    )
    return (
        value["severity"] in SEVERITIES
        and value["confidence"] in CONFIDENCES
        and value["autofix_class"] in AUTOFIX_CLASSES
        and value["owner"] in OWNERS
        and line_valid
    )


def fingerprint(finding: dict[str, Any]) -> tuple[str, str, str]:
    return (
        finding["file"].strip().lower(),
        str(finding["line"]).strip(),
        " ".join(finding["title"].lower().split()),
    )


def independent_reviewer(name: str, source: dict[str, Any]) -> bool:
    if name == "fast-pass":
        return False
    if name.startswith("adversarial-"):
        return source.get("independence_verified") is True
    return True


def promote(confidence: int) -> int:
    return {50: 75, 75: 100, 100: 100}.get(confidence, confidence)


def merge_group(group: list[tuple[dict[str, Any], str, tuple[str, ...]]]) -> dict[str, Any]:
    # Start with the most urgent/high-confidence representation, then merge conservatively.
    group.sort(key=lambda item: (SEVERITIES.index(item[0]["severity"]), -item[0]["confidence"]))
    merged = dict(group[0][0])
    # A current-diff classification wins a disagreement so an exact duplicate
    # cannot disappear merely because the pre-existing reviewer arrived first.
    merged["pre_existing"] = all(item[0]["pre_existing"] for item in group)
    reviewer_names: list[str] = []
    independent: set[str] = set()
    for finding, reviewer, independent_names in group:
        supplied = finding.get("reviewers")
        names = supplied if isinstance(supplied, list) else [reviewer]
        for name in names:
            if isinstance(name, str) and name not in reviewer_names:
                reviewer_names.append(name)
        independent.update(independent_names)

        if AUTOFIX_CLASSES.index(finding["autofix_class"]) > AUTOFIX_CLASSES.index(merged["autofix_class"]):
            merged["autofix_class"] = finding["autofix_class"]
        if OWNERS.index(finding["owner"]) > OWNERS.index(merged["owner"]):
            merged["owner"] = finding["owner"]
        merged["requires_verification"] = (
            merged["requires_verification"] or finding["requires_verification"]
        )
        if not nonempty_string(merged.get("first_evidence")) and nonempty_string(
            finding.get("first_evidence")
        ):
            merged["first_evidence"] = finding["first_evidence"]
        if not merged.get("suggested_fix") and finding.get("suggested_fix"):
            merged["suggested_fix"] = finding["suggested_fix"]
        if not merged.get("settled_conflict") and finding.get("settled_conflict"):
            merged["settled_conflict"] = finding["settled_conflict"]

    confidence = max(item[0]["confidence"] for item in group)
    has_first_evidence = nonempty_string(merged.get("first_evidence"))
    if confidence >= 75 and not has_first_evidence:
        confidence = 50
    if len(independent) >= 2 and has_first_evidence:
        confidence = promote(confidence)
    merged["confidence"] = confidence
    merged["reviewers"] = reviewer_names
    merged["independent_reviewers"] = [
        reviewer for reviewer in reviewer_names if reviewer in independent
    ]
    return merged


def main() -> int:
    try:
        payload = json.load(sys.stdin)
    except (json.JSONDecodeError, OSError) as error:
        print(json.dumps({"status": "failed", "reason": str(error)}))
        return 2

    if not isinstance(payload, list):
        print(json.dumps({"status": "failed", "reason": "expected an array of reviewer returns"}))
        return 2

    malformed_returns = 0
    malformed_findings = 0
    grouped: dict[
        tuple[str, str, str], list[tuple[dict[str, Any], str, tuple[str, ...]]]
    ] = {}
    residual_risks: list[Any] = []
    testing_gaps: list[Any] = []

    for source in payload:
        if not valid_return(source):
            malformed_returns += 1
            continue
        reviewer = source["reviewer"]
        residual_risks.extend(source["residual_risks"])
        testing_gaps.extend(source["testing_gaps"])
        for finding in source["findings"]:
            if not valid_finding(finding):
                malformed_findings += 1
                continue
            finding = dict(finding)
            if reviewer == "fast-pass":
                finding["confidence"] = min(finding["confidence"], 50)
            independent_names: tuple[str, ...]
            if reviewer == "synthesis":
                supplied_reviewers = finding.get("reviewers")
                supplied_independent = finding.get("independent_reviewers")
                reviewer_set = (
                    {name for name in supplied_reviewers if isinstance(name, str)}
                    if isinstance(supplied_reviewers, list)
                    else set()
                )
                independent_list = (
                    supplied_independent if isinstance(supplied_independent, list) else []
                )
                independent_names = tuple(
                    name
                    for name in independent_list
                    if isinstance(name, str) and name in reviewer_set
                )
            elif independent_reviewer(reviewer, source):
                independent_names = (reviewer,)
            else:
                independent_names = ()
            grouped.setdefault(fingerprint(finding), []).append(
                (finding, reviewer, independent_names)
            )

    merged = [merge_group(group) for group in grouped.values()]
    suppressed: Counter[str] = Counter()
    suppressed_findings: list[dict[str, Any]] = []
    survivors: list[dict[str, Any]] = []
    pre_existing: list[dict[str, Any]] = []
    for finding in merged:
        if finding["pre_existing"]:
            pre_existing.append(finding)
            continue
        if (
            finding["confidence"] < 75
            and finding["severity"] != "P0"
            and not finding.get("settled_conflict")
        ):
            suppressed[str(finding["confidence"])] += 1
            suppressed_findings.append(finding)
            continue
        survivors.append(finding)

    suppressed_findings.sort(
        key=lambda item: (
            SEVERITIES.index(item["severity"]),
            -item["confidence"],
            item["file"].lower(),
            str(item["line"]),
            item["title"].lower(),
        )
    )
    survivors.sort(
        key=lambda item: (
            SEVERITIES.index(item["severity"]),
            -item["confidence"],
            item["file"].lower(),
            str(item["line"]),
            item["title"].lower(),
        )
    )
    for number, finding in enumerate(survivors, 1):
        finding["#"] = number

    print(
        json.dumps(
            {
                "status": "complete",
                "findings": survivors,
                "suppressed_findings": suppressed_findings,
                "pre_existing_findings": pre_existing,
                "residual_risks": residual_risks,
                "testing_gaps": testing_gaps,
                "suppressed_by_confidence": dict(sorted(suppressed.items())),
                "malformed_returns": malformed_returns,
                "malformed_findings": malformed_findings,
            },
            sort_keys=True,
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
