#!/usr/bin/env python3
"""Journaled commit engine for ce-user-test state artifacts.

Usage:
    python3 commit-engine.py plan <payload-json-file>
    python3 commit-engine.py apply
    python3 commit-engine.py resume
    python3 commit-engine.py rollback
    python3 commit-engine.py confirm-issues <issues-json-file>
    python3 commit-engine.py status

The engine operates on the current working directory as the target project.
Its journal is:
    tests/user-flows/.user-test-commit-journal.json

Stdout sentinels:
    PLANNED
    APPLIED\n<result-json>
    ISSUES-PENDING\n<result-json>
    CONFIRMED\n<result-json>
    ROLLED-BACK
    NO-JOURNAL
    VALIDATION-FAILED\n<error-list-json>
    BASE-HASH-MISMATCH\n<details-json>
    FOREIGN-JOURNAL <scenario>
    STAGED-INTEGRITY-FAILURE\n<details-json>
    STALE-WARN
    STALE-ROLLBACK-DEFAULT
    CONCURRENT <pid>

Exit codes:
    0 success or actionable non-error no-op
    1 validation/refusal requiring agent decision
    2 usage error

Diagnostics go to stderr and are prefixed with `commit-engine:`.
Writes use tempfile.mkstemp in the target directory plus os.replace.
Pure stdlib; the script never files GitHub issues itself.
"""
from __future__ import annotations

import base64
import json
import os
import re
import signal
import sys
import tempfile
from copy import deepcopy
from datetime import datetime, timezone
from hashlib import sha256
from typing import Any


SCRIPT_NAME = "commit-engine"
JOURNAL_REL = "tests/user-flows/.user-test-commit-journal.json"
CURRENT_SCHEMA_VERSION = 10
EM_DASH = "—"


class UsageFailure(Exception):
    pass


class Refusal(Exception):
    def __init__(self, sentinel: str, details: Any = None):
        super().__init__(sentinel)
        self.sentinel = sentinel
        self.details = details


def stderr(message: str) -> None:
    sys.stderr.write(f"{SCRIPT_NAME}: {message}\n")


def usage() -> int:
    stderr(
        "usage: commit-engine.py plan <payload-json-file> | apply | resume | "
        "rollback | confirm-issues <issues-json-file> | status"
    )
    return 2


def now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None = None) -> str:
    value = dt or now()
    return value.replace(microsecond=0).isoformat().replace("+00:00", "Z")


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def project_root() -> str:
    return os.getcwd()


def to_rel(path: str) -> str:
    return os.path.relpath(path, project_root()).replace(os.sep, "/")


def resolve(rel_path: str) -> str:
    root = os.path.abspath(project_root())
    absolute = os.path.abspath(os.path.join(root, rel_path))
    if absolute != root and not absolute.startswith(root + os.sep):
        raise UsageFailure(f"path escapes project root: {rel_path}")
    return absolute


def journal_path() -> str:
    return resolve(JOURNAL_REL)


def ensure_parent(path: str) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)


def read_bytes(path: str) -> bytes | None:
    try:
        with open(path, "rb") as f:
            return f.read()
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise UsageFailure(f"cannot read {path}: {exc}") from exc


def read_text(path: str) -> str | None:
    raw = read_bytes(path)
    if raw is None:
        return None
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise UsageFailure(f"not utf-8: {path}: {exc}") from exc


def write_atomic(path: str, text: str) -> None:
    ensure_parent(path)
    fd, tmp = tempfile.mkstemp(
        dir=os.path.dirname(path), prefix=f".{os.path.basename(path)}.", suffix=".tmp"
    )
    try:
        with os.fdopen(fd, "w", encoding="utf-8", newline="") as f:
            f.write(text)
        os.replace(tmp, path)
    except BaseException:
        try:
            os.unlink(tmp)
        except OSError:
            pass
        raise


def write_json_atomic(path: str, doc: Any) -> None:
    write_atomic(path, json.dumps(doc, indent=2, ensure_ascii=False) + "\n")


def file_hash_bytes(raw: bytes | None) -> str | None:
    if raw is None:
        return None
    return sha256(raw).hexdigest()


def file_hash(path: str) -> str | None:
    return file_hash_bytes(read_bytes(path))


def load_json_file(path: str) -> Any:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except FileNotFoundError as exc:
        raise UsageFailure(f"file not found: {path}") from exc
    except OSError as exc:
        raise UsageFailure(f"cannot read json file: {exc}") from exc
    except ValueError as exc:
        raise UsageFailure(f"invalid json: {exc}") from exc


def load_registry() -> dict[str, Any]:
    path = os.path.join(os.path.dirname(__file__), "caps-registry.json")
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)["entries"]
    except (OSError, KeyError, TypeError, ValueError) as exc:
        raise UsageFailure(f"cannot read caps registry: {exc}") from exc


REGISTRY = load_registry()


def cap_value(name: str) -> Any:
    return REGISTRY[name]["value"]


def load_journal() -> dict[str, Any] | None:
    path = journal_path()
    if not os.path.exists(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError) as exc:
        raise UsageFailure(f"cannot read journal: {exc}") from exc


def save_journal(journal: dict[str, Any]) -> None:
    journal["heartbeat_at"] = iso()
    write_json_atomic(journal_path(), journal)


def remove_journal() -> None:
    try:
        os.unlink(journal_path())
    except FileNotFoundError:
        pass


def process_alive(pid: Any) -> bool:
    if not isinstance(pid, int) or pid <= 0:
        return False
    if pid == os.getpid():
        return True
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (ProcessLookupError, OSError, ValueError):
        return False


def check_concurrent(journal: dict[str, Any]) -> None:
    pid = journal.get("active_pid")
    if journal.get("active") and process_alive(pid):
        raise Refusal(f"CONCURRENT {pid}")


def check_staleness(journal: dict[str, Any]) -> None:
    try:
        started = parse_iso(journal["start_timestamp"])
    except Exception:
        return
    age = now() - started
    staleness = cap_value("journal_staleness")
    if age.days >= int(staleness["rollback_default_after_days"]):
        raise Refusal("STALE-ROLLBACK-DEFAULT")
    if age.total_seconds() > int(staleness["warn_after_hours"]) * 3600:
        raise Refusal("STALE-WARN")


def print_json_sentinel(sentinel: str, doc: Any) -> int:
    print(sentinel)
    print(json.dumps(doc, ensure_ascii=False))
    return 0


def cells(line: str) -> list[str]:
    stripped = line.strip()
    if not stripped.startswith("|"):
        return []
    if stripped.endswith("|"):
        stripped = stripped[1:-1]
    else:
        stripped = stripped[1:]
    return [part.strip() for part in stripped.split("|")]


def render_row(row: list[str]) -> str:
    return "| " + " | ".join(row) + " |"


def render_separator(headers: list[str]) -> str:
    return "| " + " | ".join("-" * max(3, len(h)) for h in headers) + " |"


def table_end(lines: list[str], start: int) -> int:
    end = start
    while end < len(lines) and lines[end].lstrip().startswith("|"):
        end += 1
    return end


def find_table(lines: list[str], required: set[str]) -> int | None:
    for index, line in enumerate(lines):
        if not line.lstrip().startswith("|"):
            continue
        headers = set(cells(line))
        if required.issubset(headers):
            return index
    return None


def set_cell(row: list[str], headers: list[str], name: str, value: Any) -> None:
    if name in headers:
        row[headers.index(name)] = str(value)


def markdown_lines(text: str) -> tuple[list[str], bool]:
    final = text.endswith("\n")
    if final:
        text = text[:-1]
    return ([] if text == "" else text.split("\n")), final


def join_markdown(lines: list[str], final_newline: bool = True) -> str:
    text = "\n".join(lines)
    if final_newline:
        text += "\n"
    return text


def score_passes(area: dict[str, Any]) -> bool:
    if area.get("skip_reason"):
        return False
    ux = area.get("ux_score")
    if not isinstance(ux, (int, float)):
        return False
    if ux < cap_value("pass_threshold"):
        return False
    quality = area.get("quality_score")
    if quality is not None and quality < cap_value("quality_threshold"):
        return False
    return True


def fmt_score(value: Any) -> str:
    if value is None:
        return EM_DASH
    if isinstance(value, float) and value.is_integer():
        return str(int(value))
    return str(value)


def heading_index(lines: list[str], title: str) -> int | None:
    needle = f"## {title}".lower()
    for index, line in enumerate(lines):
        if line.strip().lower() == needle:
            return index
    return None


def table_after_heading(lines: list[str], title: str) -> int | None:
    heading = heading_index(lines, title)
    if heading is None:
        return None
    for index in range(heading + 1, len(lines)):
        if lines[index].startswith("## "):
            return None
        if lines[index].lstrip().startswith("|"):
            return index
    return None


def ensure_section_table(lines: list[str], title: str, headers: list[str]) -> int:
    table = table_after_heading(lines, title)
    if table is not None:
        return table
    heading = heading_index(lines, title)
    if heading is None:
        if lines and lines[-1] != "":
            lines.append("")
        lines.extend([f"## {title}", "", render_row(headers), render_separator(headers)])
        return len(lines) - 2
    insert_at = heading + 1
    while insert_at < len(lines) and lines[insert_at] == "":
        insert_at += 1
    lines[insert_at:insert_at] = ["", render_row(headers), render_separator(headers)]
    return insert_at + 1


def replace_section_table(lines: list[str], title: str, headers: list[str], rows: list[list[str]]) -> None:
    table = ensure_section_table(lines, title, headers)
    end = table_end(lines, table)
    lines[table:end] = [render_row(headers), render_separator(headers), *[render_row(row) for row in rows]]


def update_area_trends_section(lines: list[str], score_history: dict[str, Any]) -> None:
    headers = ["Area", "Trend", "Last Score", "Delta"]
    rows = []
    for slug, entry in sorted(score_history.get("areas", {}).items()):
        scores = entry.get("scores", []) if isinstance(entry, dict) else []
        last = scores[-1].get("ux", EM_DASH) if scores else EM_DASH
        if len(scores) >= 2:
            delta = float(scores[-1].get("ux", 0)) - float(scores[-2].get("ux", 0))
            rendered_delta = f"{delta:+.1f}"
        else:
            rendered_delta = EM_DASH
        rows.append([slug, entry.get("trend", "stable"), fmt_score(last), rendered_delta])
    replace_section_table(lines, "Area Trends", headers, rows)


def existing_table_rows(lines: list[str], table: int) -> tuple[list[str], list[list[str]]]:
    headers = cells(lines[table])
    rows = []
    for line in lines[table + 2 : table_end(lines, table)]:
        row = cells(line)
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
        rows.append(row)
    return headers, rows


def update_ux_opportunities_section(lines: list[str], payload: dict[str, Any]) -> None:
    headers = ["ID", "Area", "Priority", "Status", "Suggestion"]
    table = ensure_section_table(lines, "UX Opportunities Log", headers)
    existing_headers, rows = existing_table_rows(lines, table)
    existing_ids = []
    for row in rows:
        if "ID" in existing_headers:
            match = re.match(r"UX(\d+)$", row[existing_headers.index("ID")])
            if match:
                existing_ids.append(int(match.group(1)))
    next_id = (max(existing_ids) + 1) if existing_ids else 1
    for opportunity in payload.get("ux_opportunities", []):
        row = ["" for _ in existing_headers]
        set_cell(row, existing_headers, "ID", opportunity.get("id") or f"UX{next_id:03d}")
        set_cell(row, existing_headers, "Area", opportunity.get("area", ""))
        set_cell(row, existing_headers, "Priority", opportunity.get("priority", "P2"))
        set_cell(row, existing_headers, "Status", opportunity.get("status", "open"))
        set_cell(row, existing_headers, "Suggestion", opportunity.get("suggestion", ""))
        rows.append(row)
        next_id += 1
    open_cap = int(cap_value("ux_opportunities_lifecycle")["open_cap"])
    open_rows = [row for row in rows if "Status" in existing_headers and row[existing_headers.index("Status")] == "open"]
    if len(open_rows) > open_cap:
        to_drop = len(open_rows) - open_cap
        kept = []
        for row in rows:
            if to_drop and "Status" in existing_headers and row[existing_headers.index("Status")] == "open":
                to_drop -= 1
                continue
            kept.append(row)
        rows = kept
    end = table_end(lines, table)
    lines[table:end] = [render_row(existing_headers), render_separator(existing_headers), *[render_row(row) for row in rows]]


def update_good_patterns_section(lines: list[str], payload: dict[str, Any]) -> None:
    headers = ["Area", "Pattern", "First Seen", "Last Confirmed"]
    table = ensure_section_table(lines, "Good Patterns", headers)
    existing_headers, rows = existing_table_rows(lines, table)
    by_area = {row[existing_headers.index("Area")]: row for row in rows if "Area" in existing_headers}
    run_date = payload["run_timestamp"][:10]
    for pattern in payload.get("good_patterns", []):
        area = pattern.get("area", "")
        row = by_area.get(area)
        if row is None:
            row = ["" for _ in existing_headers]
            set_cell(row, existing_headers, "Area", area)
            set_cell(row, existing_headers, "First Seen", run_date)
            rows.append(row)
        set_cell(row, existing_headers, "Pattern", pattern.get("pattern", ""))
        set_cell(row, existing_headers, "Last Confirmed", run_date)
    end = table_end(lines, table)
    lines[table:end] = [render_row(existing_headers), render_separator(existing_headers), *[render_row(row) for row in rows]]


def update_weakness_classes(lines: list[str], payload: dict[str, Any]) -> None:
    for area in payload.get("areas", []):
        weakness = area.get("weakness_class")
        if not weakness:
            continue
        heading = None
        for index, line in enumerate(lines):
            if line.strip() == f"### {area['slug']}":
                heading = index
                break
        if heading is None:
            continue
        end = len(lines)
        for index in range(heading + 1, len(lines)):
            if lines[index].startswith("### ") or lines[index].startswith("## "):
                end = index
                break
        for index in range(heading + 1, end):
            if lines[index].startswith("**weakness_class:**"):
                lines[index] = f"**weakness_class:** {weakness}"
                break
        else:
            insert_at = heading + 1
            while insert_at < end and not lines[insert_at].startswith("**pass_threshold:**"):
                insert_at += 1
            if insert_at < end:
                lines.insert(insert_at + 1, f"**weakness_class:** {weakness}")


def update_test_file(payload: dict[str, Any], score_history_after: dict[str, Any]) -> tuple[str, dict[str, Any]]:
    path = resolve(payload["test_file"])
    text = read_text(path)
    if text is None:
        raise UsageFailure(f"test file not found: {payload['test_file']}")
    lines, final = markdown_lines(text)
    for index, line in enumerate(lines):
        if re.match(r"^schema_version\s*:", line):
            lines[index] = f"schema_version: {CURRENT_SCHEMA_VERSION}"
            break

    areas_by_slug = {area["slug"]: area for area in payload.get("areas", [])}
    area_table = find_table(lines, {"Area", "Status", "Last Score"})
    if area_table is not None:
        headers = cells(lines[area_table])
        end = table_end(lines, area_table)
        seen: set[str] = set()
        for index in range(area_table + 2, end):
            row = cells(lines[index])
            if len(row) < len(headers):
                row.extend([""] * (len(headers) - len(row)))
            slug = row[headers.index("Area")]
            area = areas_by_slug.get(slug)
            if area is None:
                continue
            seen.add(slug)
            set_cell(row, headers, "Status", area.get("next_status", row[headers.index("Status")]))
            if not area.get("skip_reason"):
                set_cell(row, headers, "Last Score", fmt_score(area.get("ux_score")))
                set_cell(row, headers, "Last Quality", fmt_score(area.get("quality_score")))
                set_cell(row, headers, "Last Time", fmt_score(area.get("time_seconds")))
            set_cell(
                row,
                headers,
                "Consecutive Passes",
                area.get("consecutive_passes_after", row[headers.index("Consecutive Passes")]),
            )
            if area.get("tactical_note") and "Notes" in headers:
                existing = row[headers.index("Notes")]
                note = f"[Run {payload.get('run_number', 1)}] {area['tactical_note']}"
                notes = [part.strip() for part in existing.split("<br>") if part.strip()]
                notes.append(note)
                notes = notes[-int(cap_value("tactical_notes_per_area_cap")) :]
                row[headers.index("Notes")] = "<br>".join(notes)
            lines[index] = render_row(row)
        for slug, area in areas_by_slug.items():
            if slug in seen:
                continue
            row = ["" for _ in headers]
            set_cell(row, headers, "Area", slug)
            set_cell(row, headers, "Status", area.get("next_status", "Uncharted"))
            set_cell(row, headers, "Last Score", fmt_score(area.get("ux_score")))
            set_cell(row, headers, "Last Quality", fmt_score(area.get("quality_score")))
            set_cell(row, headers, "Last Time", fmt_score(area.get("time_seconds")))
            set_cell(row, headers, "Consecutive Passes", area.get("consecutive_passes_after", 0))
            set_cell(row, headers, "Notes", area.get("assessment", ""))
            lines.insert(end, render_row(row))
            end += 1

    probe_rotations = 0
    probe_table = find_table(lines, {"Query", "Verify", "Status", "Run History"})
    if probe_table is not None:
        headers = cells(lines[probe_table])
        end = table_end(lines, probe_table)
        probe_updates = []
        for probe in payload.get("probes_run", []):
            probe_updates.append((probe, True))
        for probe in payload.get("probes_generated", []):
            probe_updates.append((probe, False))
        for probe, was_run in probe_updates:
            target_index = None
            for index in range(probe_table + 2, end):
                row = cells(lines[index])
                if len(row) < len(headers):
                    row.extend([""] * (len(headers) - len(row)))
                if (
                    row[headers.index("Query")] == probe.get("query")
                    and row[headers.index("Verify")] == probe.get("verify")
                ):
                    target_index = index
                    break
            if target_index is None:
                row = ["" for _ in headers]
                set_cell(row, headers, "Query", probe.get("query", ""))
                set_cell(row, headers, "Verify", probe.get("verify", ""))
                set_cell(row, headers, "Priority", probe.get("priority", "P1"))
                set_cell(row, headers, "Confidence", probe.get("confidence", "high"))
                set_cell(row, headers, "Generated From", probe.get("generated_from", "run result"))
                lines.insert(end, render_row(row))
                target_index = end
                end += 1
            row = cells(lines[target_index])
            if len(row) < len(headers):
                row.extend([""] * (len(headers) - len(row)))
            set_cell(row, headers, "Status", probe.get("status", "untested"))
            if "Run History" in headers and was_run:
                history = [
                    token.strip()
                    for token in row[headers.index("Run History")].split(",")
                    if token.strip()
                ]
                history.insert(0, "P" if probe.get("status") == "passing" else "F")
                cap = int(cap_value("probe_run_history_cap"))
                if len(history) > cap:
                    probe_rotations += len(history) - cap
                row[headers.index("Run History")] = ",".join(history[:cap])
            lines[target_index] = render_row(row)

    update_area_trends_section(lines, score_history_after)
    update_ux_opportunities_section(lines, payload)
    update_good_patterns_section(lines, payload)
    update_weakness_classes(lines, payload)
    return join_markdown(lines, final), {"probe_run_history": probe_rotations}


def load_score_history(path: str) -> dict[str, Any]:
    text = read_text(path)
    if text is None:
        return {"areas": {}}
    try:
        doc = json.loads(text)
    except ValueError:
        return {"areas": {}}
    if not isinstance(doc, dict) or not isinstance(doc.get("areas"), dict):
        return {"areas": {}}
    return doc


def trend(scores: list[dict[str, Any]]) -> str:
    if len(scores) < 3:
        return "stable"
    last = [float(item.get("ux", 0)) for item in scores[-3:]]
    if last[0] < last[1] < last[2]:
        return "improving"
    if last[0] > last[1] > last[2]:
        return "declining"
    if max(last) - min(last) >= 1.0:
        return "volatile"
    return "stable"


def update_score_history(payload: dict[str, Any]) -> tuple[str, dict[str, Any], dict[str, Any], dict[str, Any]]:
    path = resolve("tests/user-flows/score-history.json")
    before = load_score_history(path)
    doc = deepcopy(before)
    rotations = 0
    cap = int(cap_value("score_history_per_area_cap"))
    run_date = payload["run_timestamp"][:10]
    for area in payload.get("areas", []):
        if area.get("skip_reason"):
            continue
        entry = doc.setdefault("areas", {}).setdefault(area["slug"], {"scores": []})
        scores = entry.setdefault("scores", [])
        scores.append(
            {
                "date": run_date,
                "ux": area.get("ux_score"),
                "quality": area.get("quality_score"),
                "time": area.get("time_seconds"),
            }
        )
        if len(scores) > cap:
            rotations += len(scores) - cap
            del scores[: len(scores) - cap]
        entry["trend"] = trend(scores)
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n", before, {"score_history": rotations}, doc


TEST_HISTORY_HEADERS = [
    "Date",
    "Areas Tested",
    "Quality Avg",
    "Delta",
    "Pass Rate",
    "Best Area",
    "Worst Area",
    "Demo Ready",
    "Context",
    "Key Finding",
]


def current_area_scores(payload: dict[str, Any]) -> dict[str, float]:
    return {
        area["slug"]: float(area["ux_score"])
        for area in payload.get("areas", [])
        if not area.get("skip_reason") and isinstance(area.get("ux_score"), (int, float))
    }


def previous_area_scores(score_history_before: dict[str, Any]) -> dict[str, float]:
    scores: dict[str, float] = {}
    for slug, entry in score_history_before.get("areas", {}).items():
        area_scores = entry.get("scores", []) if isinstance(entry, dict) else []
        if area_scores:
            scores[slug] = float(area_scores[-1].get("ux", 0))
    return scores


def update_test_history(
    payload: dict[str, Any], score_history_before: dict[str, Any]
) -> tuple[str, dict[str, Any]]:
    path = resolve("tests/user-flows/test-history.md")
    text = read_text(path)
    if text is None:
        lines = [
            "# User Test History",
            "",
            render_row(TEST_HISTORY_HEADERS),
            render_separator(TEST_HISTORY_HEADERS),
        ]
    else:
        lines, _ = markdown_lines(text)
    table = find_table(lines, {"Date", "Areas Tested", "Quality Avg"})
    if table is None:
        lines.extend(["", render_row(TEST_HISTORY_HEADERS), render_separator(TEST_HISTORY_HEADERS)])
        table = len(lines) - 2
    headers = cells(lines[table])
    end = table_end(lines, table)
    existing_rows = lines[table + 2 : end]

    current_scores = current_area_scores(payload)
    avg = sum(current_scores.values()) / len(current_scores) if current_scores else 0.0
    previous_scores = previous_area_scores(score_history_before)
    overlap = [slug for slug in current_scores if slug in previous_scores]
    if overlap:
        prev_avg = sum(previous_scores[slug] for slug in overlap) / len(overlap)
        delta_value = avg - prev_avg
        delta = f"{delta_value:+.1f}"
    else:
        delta_value = None
        delta = EM_DASH
    passes = sum(1 for area in payload.get("areas", []) if score_passes(area))
    scored = len(current_scores)
    pass_rate = f"{round((passes / scored) * 100)}%" if scored else EM_DASH
    best = max(current_scores, key=current_scores.get) if current_scores else EM_DASH
    worst = min(current_scores, key=current_scores.get) if current_scores else EM_DASH
    qualitative = payload.get("qualitative", {})
    row = ["" for _ in headers]
    values = {
        "Date": payload["run_timestamp"][:10],
        "Areas Tested": ", ".join(current_scores.keys()) or EM_DASH,
        "Quality Avg": f"{avg:.1f}" if current_scores else EM_DASH,
        "Delta": delta,
        "Pass Rate": pass_rate,
        "Best Area": best,
        "Worst Area": worst,
        "Demo Ready": qualitative.get("demo_readiness", EM_DASH),
        "Context": qualitative.get("context", EM_DASH),
        "Key Finding": qualitative.get("key_finding", qualitative.get("verdict", EM_DASH)),
    }
    for key, value in values.items():
        set_cell(row, headers, key, value)
    existing_rows.append(render_row(row))
    cap = int(cap_value("test_history_cap"))
    rotations = max(0, len(existing_rows) - cap)
    existing_rows = existing_rows[-cap:]
    lines[table:end] = [render_row(headers), render_separator(headers), *existing_rows]
    warnings = []
    threshold = float(cap_value("delta_warning_threshold"))
    if delta_value is not None and delta_value < threshold:
        warnings.append({"type": "delta", "value": delta_value, "threshold": threshold})
    return join_markdown(lines), {"test_history": rotations, "delta_warnings": warnings}


BUG_HEADERS = ["ID", "Area", "Status", "Issue", "Title"]


def next_bug_id(existing_rows: list[list[str]], headers: list[str]) -> int:
    if "ID" not in headers:
        return 1
    found = []
    for row in existing_rows:
        match = re.match(r"B(\d+)$", row[headers.index("ID")])
        if match:
            found.append(int(match.group(1)))
    return (max(found) + 1) if found else 1


def update_bugs(payload: dict[str, Any]) -> tuple[str, list[dict[str, Any]]]:
    path = resolve("tests/user-flows/bugs.md")
    text = read_text(path)
    if text is None:
        lines = ["# User Test Bugs", "", render_row(BUG_HEADERS), render_separator(BUG_HEADERS)]
    else:
        lines, _ = markdown_lines(text)
    table = find_table(lines, {"ID", "Area", "Status", "Issue", "Title"})
    if table is None:
        lines.extend(["", render_row(BUG_HEADERS), render_separator(BUG_HEADERS)])
        table = len(lines) - 2
    headers = cells(lines[table])
    end = table_end(lines, table)
    existing = [cells(line) for line in lines[table + 2 : end]]
    next_id = next_bug_id(existing, headers)
    journal_candidates: list[dict[str, Any]] = []
    new_rows: list[str] = []
    for candidate in payload.get("issue_candidates", []):
        bug_id = candidate.get("bug_id") or f"B{next_id:03d}"
        next_id += 1
        row = ["" for _ in headers]
        set_cell(row, headers, "ID", bug_id)
        set_cell(row, headers, "Area", candidate.get("area", ""))
        set_cell(row, headers, "Status", "pending")
        set_cell(row, headers, "Issue", "pending")
        set_cell(row, headers, "Title", candidate.get("title", ""))
        new_rows.append(render_row(row))
        saved = dict(candidate)
        saved["bug_id"] = bug_id
        saved["status"] = candidate.get("status", "pending")
        journal_candidates.append(saved)
    lines[table:end] = [render_row(headers), render_separator(headers), *lines[table + 2 : end], *new_rows]
    return join_markdown(lines), journal_candidates


def merge_last_run(payload: dict[str, Any]) -> str:
    path = resolve("tests/user-flows/.user-test-last-run.json")
    existing = load_json_file(path) if os.path.exists(path) else {}
    doc = deepcopy(payload)
    merged = deepcopy(existing.get("novelty_fingerprints", {})) if isinstance(existing, dict) else {}
    cap = int(cap_value("novelty_fingerprints_per_area_cap"))
    for area, values in payload.get("novelty_fingerprints", {}).items():
        current = list(merged.get(area, []))
        for value in values:
            if value not in current:
                current.append(value)
        merged[area] = current[-cap:]
    doc["novelty_fingerprints"] = merged
    return json.dumps(doc, indent=2, ensure_ascii=False) + "\n"


def build_mutations(payload: dict[str, Any]) -> tuple[list[dict[str, Any]], dict[str, Any], list[dict[str, Any]]]:
    rotations: dict[str, Any] = {}
    score_history_text, score_before, score_rotations, score_after = update_score_history(payload)
    test_file_text, probe_rotations = update_test_file(payload, score_after)
    test_history_text, history_rotations = update_test_history(payload, score_before)
    bugs_text, issue_candidates = update_bugs(payload)
    last_run_text = merge_last_run(payload)
    for source in (probe_rotations, score_rotations, history_rotations):
        rotations.update(source)
    files = [
        {"path": payload["test_file"], "content": test_file_text},
        {"path": "tests/user-flows/score-history.json", "content": score_history_text},
        {"path": "tests/user-flows/bugs.md", "content": bugs_text},
        {"path": "tests/user-flows/test-history.md", "content": test_history_text},
        {"path": "tests/user-flows/.user-test-last-run.json", "content": last_run_text},
    ]
    return files, rotations, issue_candidates


def validate_payload(payload: Any) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    if not isinstance(payload, dict):
        return [{"code": "payload_not_object"}]
    for key in ("scenario_slug", "test_file", "run_timestamp"):
        if not isinstance(payload.get(key), str) or not payload.get(key):
            errors.append({"code": f"missing_{key}", "field": key})
    areas = payload.get("areas")
    if not isinstance(areas, list) or not areas:
        errors.append({"code": "missing_area", "field": "areas"})
        areas = []
    area_by_slug: dict[str, dict[str, Any]] = {}
    for area in areas:
        if not isinstance(area, dict) or not isinstance(area.get("slug"), str):
            errors.append({"code": "missing_area", "field": "areas[].slug"})
            continue
        area_by_slug[area["slug"]] = area
        if area.get("skip_reason"):
            continue
        ux = area.get("ux_score")
        if not isinstance(ux, (int, float)) or ux < 1 or ux > 5:
            errors.append({"code": "score_out_of_range", "area": area["slug"], "field": "ux_score", "value": ux})
        quality = area.get("quality_score")
        if quality is not None and (
            not isinstance(quality, (int, float)) or quality < 1 or quality > 5
        ):
            errors.append({"code": "score_out_of_range", "area": area["slug"], "field": "quality_score", "value": quality})
    for transition in payload.get("maturity_transitions", []):
        if not isinstance(transition, dict):
            continue
        area_slug = transition.get("area")
        if transition.get("to") != "Proven":
            continue
        area = area_by_slug.get(area_slug)
        if area is None or transition.get("was_run") is False or area.get("skip_reason"):
            errors.append({"code": "promotion_for_unrun_area", "area": area_slug})
            continue
        consecutive = transition.get("consecutive_passes")
        if not isinstance(consecutive, int) or consecutive < 2:
            errors.append(
                {
                    "code": "promotion_contradicts_evidence",
                    "area": area_slug,
                    "evidence": {
                        "consecutive_passes": consecutive,
                        "required": 2,
                    },
                }
            )
    return errors


def stage_files(files: list[dict[str, Any]]) -> list[dict[str, Any]]:
    staged: list[dict[str, Any]] = []
    for item in files:
        rel_path = item["path"]
        absolute = resolve(rel_path)
        before = read_bytes(absolute)
        staged_abs = absolute + ".user-test-stage.tmp"
        write_atomic(staged_abs, item["content"])
        staged_bytes = read_bytes(staged_abs)
        staged.append(
            {
                "path": rel_path,
                "staged_path": to_rel(staged_abs),
                "staged_sha256": file_hash_bytes(staged_bytes),
                "preimage": {
                    "exists": before is not None,
                    "sha256": file_hash_bytes(before),
                    "content_b64": base64.b64encode(before).decode("ascii") if before is not None else None,
                },
                "applied": False,
            }
        )
    return staged


def command_plan(payload_file: str) -> int:
    payload = load_json_file(payload_file)
    errors = validate_payload(payload)
    if errors:
        return print_json_sentinel("VALIDATION-FAILED", errors) or 1

    existing = load_journal()
    if existing is not None and existing.get("state") != "complete":
        if existing.get("scenario_slug") != payload.get("scenario_slug"):
            print(f"FOREIGN-JOURNAL {existing.get('scenario_slug')}")
            return 1
        print("JOURNAL-EXISTS")
        return 1

    files, rotations, issue_candidates = build_mutations(payload)
    staged = stage_files(files)
    journal = {
        "journal_schema_version": 1,
        "state": "staged",
        "scenario_slug": payload["scenario_slug"],
        "test_file": payload["test_file"],
        "run_timestamp": payload["run_timestamp"],
        "payload": payload,
        "files": staged,
        "issue_candidates": issue_candidates,
        "rotations": rotations,
        "result": None,
        "start_timestamp": iso(),
        "pid": os.getpid(),
        "active_pid": None,
        "active": False,
        "heartbeat_at": iso(),
    }
    save_journal(journal)
    print("PLANNED")
    return 0


def validate_base_hashes(journal: dict[str, Any]) -> None:
    mismatches = []
    for item in journal.get("files", []):
        if item.get("applied"):
            continue
        preimage = item["preimage"]
        current_hash = file_hash(resolve(item["path"]))
        if preimage.get("sha256") != current_hash:
            mismatches.append({"path": item["path"], "expected": preimage.get("sha256"), "actual": current_hash})
    if mismatches:
        raise Refusal("BASE-HASH-MISMATCH", {"files": mismatches})


def validate_staged_files(journal: dict[str, Any]) -> None:
    failures = []
    changed = False
    for item in journal.get("files", []):
        if item.get("applied"):
            continue
        staged_abs = resolve(item["staged_path"])
        staged_hash = file_hash(staged_abs)
        if staged_hash == item.get("staged_sha256"):
            continue
        target_hash = file_hash(resolve(item["path"]))
        if target_hash == item.get("staged_sha256"):
            item["applied"] = True
            changed = True
            continue
        failures.append({"path": item["path"], "staged_path": item["staged_path"]})
    if changed:
        save_journal(journal)
    if failures:
        raise Refusal("STAGED-INTEGRITY-FAILURE", {"files": failures})


def result_for(journal: dict[str, Any]) -> dict[str, Any]:
    pending = [item for item in journal.get("issue_candidates", []) if item.get("status", "pending") == "pending"]
    duplicates = [
        item for item in journal.get("issue_candidates", []) if str(item.get("status", "")).startswith("duplicate-of")
    ]
    return {
        "scenario_slug": journal.get("scenario_slug"),
        "files_written": [item["path"] for item in journal.get("files", []) if item.get("applied")],
        "pending_issues": pending,
        "duplicates": duplicates,
        "caps_applied": cap_summary(journal.get("rotations", {})),
        "rotations": journal.get("rotations", {}),
    }


def cap_summary(rotations: dict[str, Any]) -> list[str]:
    return [key for key, value in rotations.items() if value]


def apply_remaining(journal: dict[str, Any]) -> int:
    validate_base_hashes(journal)
    validate_staged_files(journal)
    journal["state"] = "applying"
    journal["active"] = True
    journal["active_pid"] = os.getpid()
    save_journal(journal)
    crash_after = os.environ.get("CRASH_AFTER_FILE")
    crash_after_n = int(crash_after) if crash_after and crash_after.isdigit() else None
    renamed = 0
    try:
        for item in journal.get("files", []):
            if item.get("applied"):
                continue
            os.replace(resolve(item["staged_path"]), resolve(item["path"]))
            item["applied"] = True
            renamed += 1
            save_journal(journal)
            if crash_after_n is not None and renamed == crash_after_n:
                journal["active"] = False
                journal["active_pid"] = None
                save_journal(journal)
                print(f"CRASHED-AFTER-FILE {crash_after_n}")
                stderr(f"crash injection after file {crash_after_n}")
                return 1
    finally:
        if crash_after_n is None:
            journal["active"] = False
            journal["active_pid"] = None
    journal["state"] = "applied"
    journal["result"] = result_for(journal)
    save_journal(journal)
    return print_json_sentinel("APPLIED", journal["result"])


def command_apply() -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    if journal.get("state") == "applied":
        return print_pending_or_noop(journal)
    return apply_remaining(journal)


def pending_issues(journal: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        item for item in journal.get("issue_candidates", []) if item.get("status", "pending") == "pending"
    ]


def print_pending_or_noop(journal: dict[str, Any]) -> int:
    pending = pending_issues(journal)
    if pending:
        return print_json_sentinel("ISSUES-PENDING", {"pending_issues": pending})
    result = result_for(journal)
    journal["state"] = "confirmed"
    save_journal(journal)
    remove_journal()
    return print_json_sentinel("NO-OP", result)


def command_resume() -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    check_concurrent(journal)
    check_staleness(journal)
    state = journal.get("state")
    if state in ("staged", "planned", "applying"):
        return apply_remaining(journal)
    if state == "applied":
        return print_pending_or_noop(journal)
    if state in ("confirmed", "complete"):
        remove_journal()
        print("NO-JOURNAL")
        return 0
    print(f"UNKNOWN-STATE {state}")
    return 1


def restore_preimage(item: dict[str, Any]) -> None:
    target = resolve(item["path"])
    preimage = item["preimage"]
    if preimage.get("exists"):
        raw = base64.b64decode(preimage["content_b64"].encode("ascii"))
        ensure_parent(target)
        fd, tmp = tempfile.mkstemp(dir=os.path.dirname(target), prefix=f".{os.path.basename(target)}.", suffix=".tmp")
        try:
            with os.fdopen(fd, "wb") as f:
                f.write(raw)
            os.replace(tmp, target)
        except BaseException:
            try:
                os.unlink(tmp)
            except OSError:
                pass
            raise
    else:
        try:
            os.unlink(target)
        except FileNotFoundError:
            pass
    try:
        os.unlink(resolve(item["staged_path"]))
    except FileNotFoundError:
        pass


def command_rollback() -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    for item in reversed(journal.get("files", [])):
        restore_preimage(item)
    remove_journal()
    print("ROLLED-BACK")
    return 0


def update_bugs_with_issues(journal: dict[str, Any], issue_map: dict[str, dict[str, Any]]) -> None:
    path = resolve("tests/user-flows/bugs.md")
    text = read_text(path) or ""
    lines, final = markdown_lines(text)
    table = find_table(lines, {"ID", "Area", "Status", "Issue", "Title"})
    if table is None:
        return
    headers = cells(lines[table])
    end = table_end(lines, table)
    bug_to_status = {
        item["bug_id"]: item.get("status", "pending") for item in journal.get("issue_candidates", [])
    }
    for index in range(table + 2, end):
        row = cells(lines[index])
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
        bug_id = row[headers.index("ID")]
        status = bug_to_status.get(bug_id)
        if status is None:
            continue
        if status.startswith("filed #"):
            set_cell(row, headers, "Status", "filed")
            set_cell(row, headers, "Issue", "#" + status.split("#", 1)[1])
        elif status.startswith("duplicate-of #"):
            set_cell(row, headers, "Status", "duplicate")
            set_cell(row, headers, "Issue", "duplicate-of #" + status.split("#", 1)[1])
        lines[index] = render_row(row)
    write_atomic(path, join_markdown(lines, final))


def command_confirm_issues(issues_file: str) -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    issues_doc = load_json_file(issues_file)
    issues = issues_doc.get("issues") if isinstance(issues_doc, dict) else None
    if not isinstance(issues, list):
        raise UsageFailure("issues json must contain an issues array")
    by_id = {item.get("id"): item for item in issues if isinstance(item, dict)}
    by_bug = {item.get("bug_id"): item for item in issues if isinstance(item, dict)}
    for candidate in journal.get("issue_candidates", []):
        update = by_id.get(candidate.get("id")) or by_bug.get(candidate.get("bug_id"))
        if update is None:
            continue
        if isinstance(update.get("number"), int):
            candidate["status"] = f"filed #{update['number']}"
        elif isinstance(update.get("duplicate_of"), int):
            candidate["status"] = f"duplicate-of #{update['duplicate_of']}"
    update_bugs_with_issues(journal, by_id)
    journal["state"] = "applied"
    save_journal(journal)
    if pending_issues(journal):
        return print_json_sentinel("ISSUES-PENDING", {"pending_issues": pending_issues(journal)})
    result = result_for(journal)
    result["files_written"] = sorted(set(result["files_written"] + ["tests/user-flows/bugs.md"]))
    journal["state"] = "confirmed"
    journal["result"] = result
    save_journal(journal)
    remove_journal()
    return print_json_sentinel("CONFIRMED", result)


def command_status() -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    print(json.dumps(journal, ensure_ascii=False))
    return 0


def main(argv: list[str]) -> int:
    try:
        if len(argv) < 2:
            return usage()
        command = argv[1]
        if command == "plan" and len(argv) == 3:
            return command_plan(argv[2])
        if command == "apply" and len(argv) == 2:
            return command_apply()
        if command == "resume" and len(argv) == 2:
            return command_resume()
        if command == "rollback" and len(argv) == 2:
            return command_rollback()
        if command == "confirm-issues" and len(argv) == 3:
            return command_confirm_issues(argv[2])
        if command == "status" and len(argv) == 2:
            return command_status()
        return usage()
    except UsageFailure as exc:
        stderr(str(exc))
        return 2
    except Refusal as exc:
        if exc.details is None:
            print(exc.sentinel)
        else:
            print(exc.sentinel)
            print(json.dumps(exc.details, ensure_ascii=False))
        return 1
    except Exception as exc:
        stderr(str(exc))
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
