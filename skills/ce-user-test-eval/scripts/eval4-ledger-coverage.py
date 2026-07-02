#!/usr/bin/env python3
"""Artifact-only Eval 4 mechanical checker for ce-user-test."""

from __future__ import annotations

import argparse
import json
import re
from hashlib import sha256
from pathlib import Path
from typing import Any


VALIDATION_ERROR_CODES = {
    "anomaly_undispositioned",
    "dismissal_reason_empty",
    "evidence_minimum",
    "evidence_ref_out_of_range",
    "ledger_tiling",
    "ledger_digest_mismatch",
    "ledger_missing",
    "ledger_foreign",
    "marker_with_live_ledger",
    "final_index_understated",
}
WARNING_SENTINELS = {"MIGRATION-DEFAULTS-WARN"}
DISPOSITIONS = {"filed", "noted-in-area", "explore-next-run", "dismissed"}
EVIDENCE_TYPES = {"action", "dom", "timing", "count"}


def is_int(value: Any) -> bool:
    return type(value) is int


def load_json(path: Path) -> tuple[Any | None, dict[str, Any] | None]:
    try:
        return json.loads(path.read_text(encoding="utf-8")), None
    except FileNotFoundError:
        return None, {"check": "artifact_present", "path": str(path), "message": "file missing"}
    except ValueError as exc:
        return None, {"check": "artifact_json", "path": str(path), "message": str(exc)}


def load_text(path: Path) -> str:
    try:
        return path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return ""


def load_ledger(path: Path) -> dict[str, Any]:
    try:
        raw = path.read_bytes()
    except FileNotFoundError:
        return {
            "exists": False,
            "raw": b"",
            "line_count": 0,
            "sha256": None,
            "header": None,
            "entries": [],
        }
    line_count = len(raw.splitlines())
    digest = sha256(raw).hexdigest()
    try:
        text = raw.decode("utf-8")
    except UnicodeDecodeError:
        return {
            "exists": True,
            "raw": raw,
            "line_count": line_count,
            "sha256": digest,
            "header": None,
            "entries": [],
        }
    lines = text.splitlines()
    header = None
    entries: list[dict[str, Any]] = []
    for index, line in enumerate(lines):
        try:
            parsed = json.loads(line)
        except ValueError:
            if index == len(lines) - 1:
                break
            entries.append({"__invalid__": True, "__line__": index + 1})
            continue
        if index == 0:
            header = parsed if isinstance(parsed, dict) else None
        elif isinstance(parsed, dict):
            entries.append(parsed)
        else:
            entries.append({"__invalid__": True, "__line__": index + 1})
    return {
        "exists": True,
        "raw": raw,
        "line_count": line_count,
        "sha256": digest,
        "header": header,
        "entries": entries,
    }


def ledger_header_matches(ledger: dict[str, Any], run: dict[str, Any]) -> bool:
    header = ledger.get("header")
    return (
        ledger.get("exists") is True
        and isinstance(header, dict)
        and header.get("run_timestamp") == run.get("run_timestamp")
        and header.get("scenario_slug") == run.get("scenario_slug")
    )


def result(
    verdict: str,
    *,
    errors: list[dict[str, Any]] | None = None,
    ambiguous_matches: list[dict[str, Any]] | None = None,
    detail: str = "",
    stats: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "eval": "ledger_to_report_coverage",
        "verdict": verdict,
        "pass": True if verdict == "PASS" else False if verdict == "FAIL" else None,
        "detail": detail,
        "errors": errors or [],
        "ambiguous_matches": ambiguous_matches or [],
        "stats": stats or {},
    }


def validation_error(code: str, **fields: Any) -> dict[str, Any]:
    item = {"validation_code": code}
    item.update(fields)
    return item


def ledger_ranges_and_markers(ledger: dict[str, Any]) -> tuple[list[tuple[int, int]], list[int], list[dict[str, Any]]]:
    spans: list[tuple[int, int]] = []
    markers: list[int] = []
    errors: list[dict[str, Any]] = []
    for line_number, entry in enumerate(ledger.get("entries", []), start=2):
        if not isinstance(entry, dict) or entry.get("__invalid__"):
            errors.append(validation_error("ledger_tiling", line=line_number, reason="invalid_json"))
            continue
        index_range = entry.get("index_range")
        if index_range is None:
            at_index = entry.get("at_index")
            if not is_int(at_index):
                errors.append(validation_error("ledger_tiling", line=line_number, reason="invalid_at_index"))
                continue
            markers.append(at_index)
            continue
        if (
            not isinstance(index_range, list)
            or len(index_range) != 2
            or not is_int(index_range[0])
            or not is_int(index_range[1])
            or index_range[0] > index_range[1]
        ):
            errors.append(validation_error("ledger_tiling", line=line_number, reason="invalid_index_range"))
            continue
        spans.append((index_range[0], index_range[1]))
    return spans, markers, errors


def disconnect_tolerance(run: dict[str, Any]) -> int:
    disconnects = run.get("disconnects")
    if not isinstance(disconnects, dict):
        return 0
    count = disconnects.get("count")
    return count if is_int(count) and count > 0 else 0


def validate_ledger_tiling(run: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    final_index = run.get("final_execution_index")
    if not is_int(final_index) or final_index < 0:
        return [validation_error("ledger_tiling", field="final_execution_index", value=final_index)]
    spans, markers, errors = ledger_ranges_and_markers(ledger)
    if errors:
        return errors
    for marker in markers:
        if marker < 0:
            return [validation_error("ledger_tiling", reason="marker_before_zero", at_index=marker)]
    if not spans:
        return [validation_error("ledger_tiling", reason="no_ranges")]
    spans.sort()
    first_start, first_end = spans[0]
    if first_start != 0:
        return [validation_error("ledger_tiling", reason="coverage_must_start_at_zero", start=first_start)]
    coverage_end = first_end
    interior_gap_width = 0
    for start, end in spans[1:]:
        if start <= coverage_end:
            overlap = coverage_end - start + 1
            if overlap > 1:
                return [
                    validation_error(
                        "ledger_tiling",
                        reason="overlap",
                        previous_end=coverage_end,
                        start=start,
                    )
                ]
        elif start == coverage_end + 1:
            pass
        else:
            gap = start - coverage_end - 1
            if gap > 1:
                interior_gap_width += gap
        coverage_end = max(coverage_end, end)
    if coverage_end < final_index:
        return [
            validation_error(
                "ledger_tiling",
                reason="coverage_ends_before_final_index",
                coverage_end=coverage_end,
                final_execution_index=final_index,
            )
        ]
    if coverage_end > final_index:
        return [
            validation_error(
                "final_index_understated",
                final_execution_index=final_index,
                max_index=coverage_end,
            )
        ]
    tolerance = disconnect_tolerance(run)
    if interior_gap_width > tolerance:
        return [
            validation_error(
                "ledger_tiling",
                reason="gap_exceeds_disconnect_tolerance",
                gap_width=interior_gap_width,
                disconnect_count=tolerance,
            )
        ]
    return []


def canonical_anomaly_fields(entry: dict[str, Any]) -> str:
    subset = {
        "area": entry.get("area"),
        "kind": entry.get("kind"),
        "what": entry.get("what"),
        "evidence": entry.get("evidence", []),
        "index_range": entry.get("index_range"),
        "at_index": entry.get("at_index"),
    }
    return json.dumps(subset, sort_keys=True, separators=(",", ":"))


def reconciled_anomalies(
    run: dict[str, Any], ledger: dict[str, Any]
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    matches: list[dict[str, Any]] = []
    payload_anomalies = run.get("anomalies", [])
    if not isinstance(payload_anomalies, list):
        payload_anomalies = []
    by_key: dict[str, list[dict[str, Any]]] = {}
    for anomaly in payload_anomalies:
        if isinstance(anomaly, dict):
            by_key.setdefault(canonical_anomaly_fields(anomaly), []).append(anomaly)
    for line_number, entry in enumerate(ledger.get("entries", []), start=2):
        if not isinstance(entry, dict) or entry.get("__invalid__") or entry.get("kind") != "anomaly":
            continue
        candidates = by_key.get(canonical_anomaly_fields(entry), [])
        match = next((item for item in candidates if item.get("disposition") in DISPOSITIONS), None)
        if match is None:
            errors.append(
                validation_error(
                    "anomaly_undispositioned",
                    line=line_number,
                    area=entry.get("area"),
                    what=entry.get("what"),
                )
            )
            continue
        if match.get("disposition") == "dismissed" and not str(match.get("reason", "")).strip():
            errors.append(
                validation_error(
                    "dismissal_reason_empty",
                    line=line_number,
                    area=entry.get("area"),
                    what=entry.get("what"),
                )
            )
        matches.append({"line": line_number, "ledger": entry, "run": match})
    return matches, errors


def normalized(text: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#]+", " ", str(text).lower())).strip()


def tokens(text: Any) -> set[str]:
    return {token for token in normalized(text).split() if len(token) >= 3}


def issue_refs_from_bugs(text: str) -> set[str]:
    refs: set[str] = set()
    for match in re.findall(r"#\d+|B\d{3,}", text, flags=re.IGNORECASE):
        refs.add(match.upper() if match.upper().startswith("B") else match)
        if match.startswith("#"):
            refs.add(match[1:])
    return refs


def issue_ref_resolves(issue_ref: Any, refs: set[str]) -> bool:
    raw = str(issue_ref or "").strip()
    if not raw:
        return False
    candidates = {raw, raw.upper()}
    for match in re.findall(r"#\d+|B\d{3,}|\d+", raw, flags=re.IGNORECASE):
        candidates.add(match.upper() if match.upper().startswith("B") else match)
        if match.isdigit():
            candidates.add(f"#{match}")
    return any(candidate in refs for candidate in candidates)


def summarize_anomaly(item: dict[str, Any]) -> dict[str, Any]:
    run_item = item["run"]
    ledger_item = item["ledger"]
    return {
        "line": item["line"],
        "area": ledger_item.get("area"),
        "what": ledger_item.get("what"),
        "disposition": run_item.get("disposition"),
        "issue_ref": run_item.get("issue_ref"),
        "reason": run_item.get("reason"),
        "index_range": ledger_item.get("index_range"),
        "at_index": ledger_item.get("at_index"),
    }


def item_text(item: dict[str, Any]) -> str:
    values: list[str] = []
    for key in ("priority", "area", "mode", "why", "weakness_class", "adversarial_instruction"):
        value = item.get(key)
        if isinstance(value, str):
            values.append(value)
    affected = item.get("affected_areas")
    if isinstance(affected, list):
        values.extend(str(value) for value in affected)
    return " ".join(values)


def area_matches(anomaly_area: Any, item: dict[str, Any]) -> bool:
    area = str(anomaly_area or "")
    if item.get("area") == area:
        return True
    affected = item.get("affected_areas")
    return isinstance(affected, list) and area in affected


def map_explore_next_run(
    run: dict[str, Any], anomaly: dict[str, Any]
) -> tuple[bool, bool, list[dict[str, Any]]]:
    items = [item for item in run.get("explore_next_run", []) if isinstance(item, dict)]
    what = anomaly["ledger"].get("what", "")
    exact: list[dict[str, Any]] = []
    candidates: list[dict[str, Any]] = []
    anomaly_tokens = tokens(what)
    for item in items:
        text = item_text(item)
        if normalized(what) and normalized(what) in normalized(text):
            exact.append(item)
            continue
        overlap = anomaly_tokens & tokens(text)
        if area_matches(anomaly["ledger"].get("area"), item) or len(overlap) >= 2:
            candidates.append(item)
    if exact:
        return True, False, exact
    if candidates:
        return True, True, candidates
    return False, False, []


def candidate_report_lines(report_text: str, anomaly: dict[str, Any]) -> list[str]:
    area = str(anomaly["ledger"].get("area") or "")
    issue_ref = str(anomaly["run"].get("issue_ref") or "")
    what_tokens = tokens(anomaly["ledger"].get("what", ""))
    candidates: list[str] = []
    for line in report_text.splitlines():
        line_norm = normalized(line)
        if not line_norm:
            continue
        overlap = what_tokens & tokens(line)
        if (area and normalized(area) in line_norm) or (issue_ref and issue_ref in line) or len(overlap) >= 2:
            candidates.append(line)
    return candidates[:8]


def collect_execution_indices(value: Any) -> list[int]:
    indices: list[int] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "execution_index" and is_int(nested):
                indices.append(nested)
            else:
                indices.extend(collect_execution_indices(nested))
    elif isinstance(value, list):
        for nested in value:
            indices.extend(collect_execution_indices(nested))
    return indices


def verification_results_for_none_span(run: dict[str, Any], entry: dict[str, Any]) -> list[dict[str, Any]]:
    area = entry.get("area")
    index_range = entry.get("index_range")
    at_index = entry.get("at_index")
    results: list[dict[str, Any]] = []
    for result_item in run.get("verification_results", []):
        if not isinstance(result_item, dict):
            continue
        indices = collect_execution_indices(result_item)
        in_range = False
        if isinstance(index_range, list) and len(index_range) == 2:
            start, end = index_range
            in_range = any(is_int(index) and start <= index <= end for index in indices)
        elif is_int(at_index):
            in_range = any(index == at_index for index in indices)
        same_area_without_index = not indices and area is not None and result_item.get("area") == area
        if in_range or same_area_without_index:
            results.append(result_item)
    return results


def semantic_ambiguous_matches(
    run: dict[str, Any],
    ledger: dict[str, Any],
    anomalies: list[dict[str, Any]],
    report_text: str,
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    ambiguous: list[dict[str, Any]] = []
    for anomaly in anomalies:
        run_item = anomaly["run"]
        disposition = run_item.get("disposition")
        if disposition == "explore-next-run":
            mapped, needs_semantic, candidates = map_explore_next_run(run, anomaly)
            if not mapped:
                errors.append(
                    {
                        "check": "explore_next_run_mapping",
                        "message": "explore-next-run disposition has no candidate explore_next_run item",
                        "anomaly": summarize_anomaly(anomaly),
                    }
                )
            elif needs_semantic:
                ambiguous.append(
                    {
                        "type": "explore_next_run_semantic_match",
                        "anomaly": summarize_anomaly(anomaly),
                        "candidates": candidates,
                    }
                )
        what = anomaly["ledger"].get("what", "")
        if normalized(what) and normalized(what) in normalized(report_text):
            continue
        ambiguous.append(
            {
                "type": "report_semantic_match",
                "anomaly": summarize_anomaly(anomaly),
                "report_candidates": candidate_report_lines(report_text, anomaly),
            }
        )
    for line_number, entry in enumerate(ledger.get("entries", []), start=2):
        if not isinstance(entry, dict) or entry.get("kind") != "none":
            continue
        verification_results = verification_results_for_none_span(run, entry)
        if verification_results:
            ambiguous.append(
                {
                    "type": "none_span_spot_check",
                    "line": line_number,
                    "area": entry.get("area"),
                    "index_range": entry.get("index_range"),
                    "at_index": entry.get("at_index"),
                    "verification_results": verification_results,
                }
            )
    return ambiguous, errors


def filed_issue_errors(anomalies: list[dict[str, Any]], bugs_text: str) -> list[dict[str, Any]]:
    refs = issue_refs_from_bugs(bugs_text)
    errors: list[dict[str, Any]] = []
    for anomaly in anomalies:
        if anomaly["run"].get("disposition") != "filed":
            continue
        issue_ref = anomaly["run"].get("issue_ref")
        if not issue_ref_resolves(issue_ref, refs):
            errors.append(
                {
                    "check": "filed_issue_ref_resolves",
                    "message": "filed disposition issue_ref does not resolve in bugs.md",
                    "anomaly": summarize_anomaly(anomaly),
                }
            )
    return errors


def evaluate(args: argparse.Namespace) -> dict[str, Any]:
    run, run_error = load_json(Path(args.run_json))
    if run_error is not None:
        return result("FAIL", errors=[run_error], detail="run JSON could not be loaded")
    if not isinstance(run, dict):
        return result("FAIL", errors=[{"check": "artifact_json", "path": args.run_json, "message": "run JSON is not an object"}])

    ledger = load_ledger(Path(args.ledger))
    stats = {
        "ledger_present": ledger.get("exists") is True,
        "ledger_lines": ledger.get("line_count", 0),
        "ledger_sha256": ledger.get("sha256"),
        "anomaly_lines": sum(1 for entry in ledger.get("entries", []) if isinstance(entry, dict) and entry.get("kind") == "anomaly"),
        "none_lines": sum(1 for entry in ledger.get("entries", []) if isinstance(entry, dict) and entry.get("kind") == "none"),
    }

    marker_present = "migration_defaults_applied" in run
    header_matches = ledger_header_matches(ledger, run)
    if marker_present:
        if header_matches:
            return result(
                "FAIL",
                errors=[validation_error("marker_with_live_ledger", path=args.run_json, ledger=args.ledger)],
                detail="migration-defaulted run has a header-matching live ledger",
                stats=stats,
            )
        return result(
            "NA",
            detail="migration-defaults marker present without a header-matching live ledger",
            stats=stats,
        )

    if not ledger.get("exists"):
        return result(
            "NA",
            detail="ledger_missing: ledger artifact is missing for this run",
            stats=stats,
        )
    if not header_matches:
        header = ledger.get("header") if isinstance(ledger.get("header"), dict) else {}
        return result(
            "NA",
            detail=(
                "ledger_foreign: ledger header does not match run JSON "
                f"(run_timestamp={header.get('run_timestamp')!r}, "
                f"scenario_slug={header.get('scenario_slug')!r}, "
                f"expected_run_timestamp={run.get('run_timestamp')!r}, "
                f"expected_scenario_slug={run.get('scenario_slug')!r})"
            ),
            stats=stats,
        )

    if not Path(args.report).exists():
        return result(
            "FAIL",
            errors=[{"check": "artifact_present", "path": args.report, "message": "file missing"}],
            detail="report artifact is missing",
            stats=stats,
        )
    report_text = load_text(Path(args.report))
    bugs_text = load_text(Path(args.bugs))

    errors: list[dict[str, Any]] = []
    errors.extend(validate_ledger_tiling(run, ledger))
    anomalies, anomaly_errors = reconciled_anomalies(run, ledger)
    errors.extend(anomaly_errors)
    errors.extend(filed_issue_errors(anomalies, bugs_text))
    ambiguous, semantic_mapping_errors = semantic_ambiguous_matches(run, ledger, anomalies, report_text)
    errors.extend(semantic_mapping_errors)
    stats["reconciled_anomalies"] = len(anomalies)
    stats["ambiguous_matches"] = len(ambiguous)
    if errors:
        return result("FAIL", errors=errors, ambiguous_matches=ambiguous, detail="mechanical checks failed", stats=stats)
    return result("PASS", ambiguous_matches=ambiguous, detail="mechanical checks passed", stats=stats)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Evaluate ce-user-test v11 anomaly ledger coverage.")
    parser.add_argument("--run-json", required=True, help="Path to tests/user-flows/.user-test-last-run.json")
    parser.add_argument("--ledger", required=True, help="Path to tests/user-flows/.user-test-anomalies.jsonl")
    parser.add_argument("--bugs", required=True, help="Path to tests/user-flows/bugs.md")
    parser.add_argument("--report", required=True, help="Path to tests/user-flows/.user-test-last-report.md")
    return parser


def main() -> int:
    parsed_args = build_parser().parse_args()
    print(json.dumps(evaluate(parsed_args), indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
