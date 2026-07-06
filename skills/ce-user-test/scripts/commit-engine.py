#!/usr/bin/env python3
"""Journaled commit engine for ce-user-test state artifacts.

Usage:
    python3 commit-engine.py plan <payload-json-file>
    python3 commit-engine.py apply [--acknowledge-stale]
    python3 commit-engine.py resume [--acknowledge-stale]
    python3 commit-engine.py rollback [--acknowledge-stale]
    python3 commit-engine.py confirm-issues <issues-json-file> [--acknowledge-stale]
    python3 commit-engine.py status [expected-scenario-slug]

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
    MIGRATION-DEFAULTS-WARN\n<warning-list-json>
    BASE-HASH-MISMATCH\n<details-json>
    FOREIGN-JOURNAL <scenario>
    STAGED-INTEGRITY-FAILURE\n<details-json>
    STALE-WARN
    STALE-ROLLBACK-DEFAULT
    CONCURRENT <pid>
    JOURNAL-EXISTS

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
from typing import Any, Callable


SCRIPT_NAME = "commit-engine"
JOURNAL_REL = "tests/user-flows/.user-test-commit-journal.json"
LEDGER_REL = "tests/user-flows/.user-test-anomalies.jsonl"
LAST_RUN_REL = "tests/user-flows/.user-test-last-run.json"
SCORE_HISTORY_REL = "tests/user-flows/score-history.json"
CURRENT_SCHEMA_VERSION = 11
EM_DASH = "—"


def configure_stdio() -> None:
    for stream in (sys.stdout, sys.stderr):
        if not hasattr(stream, "reconfigure"):
            continue
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass


configure_stdio()


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
        "usage: commit-engine.py plan <payload-json-file> | apply [--acknowledge-stale] | "
        "resume [--acknowledge-stale] | rollback [--acknowledge-stale] | "
        "confirm-issues <issues-json-file> [--acknowledge-stale] | "
        "status [expected-scenario-slug]"
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


def path_context(path: str) -> str:
    try:
        return to_rel(path)
    except Exception:
        return str(path).replace(os.sep, "/")


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
        raise UsageFailure(f"file not found: {path_context(path)}") from exc
    except OSError as exc:
        raise UsageFailure(f"cannot read json file {path_context(path)}: {exc}") from exc
    except ValueError as exc:
        raise UsageFailure(f"invalid json in {path_context(path)}: {exc}") from exc


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
        raise UsageFailure(f"cannot read journal {path_context(path)}: {exc}") from exc


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


def heartbeat_fresh(journal: dict[str, Any]) -> bool:
    try:
        heartbeat = parse_iso(journal["heartbeat_at"])
    except Exception:
        return False
    window = int(cap_value("journal_heartbeat_window"))
    return (now() - heartbeat).total_seconds() <= window


def check_concurrent(journal: dict[str, Any]) -> None:
    pid = journal.get("active_pid")
    if journal.get("active") and (process_alive(pid) or heartbeat_fresh(journal)):
        raise Refusal(f"CONCURRENT {pid}")


def staleness_sentinel(journal: dict[str, Any], acknowledge_stale: bool = False) -> str | None:
    try:
        started = parse_iso(journal["start_timestamp"])
    except Exception:
        return None
    age = now() - started
    staleness = cap_value("journal_staleness")
    if not acknowledge_stale and age.days >= int(staleness["rollback_default_after_days"]):
        return "STALE-ROLLBACK-DEFAULT"
    if not acknowledge_stale and age.total_seconds() > int(staleness["warn_after_hours"]) * 3600:
        return "STALE-WARN"
    return None


def check_staleness(journal: dict[str, Any], acknowledge_stale: bool = False) -> None:
    sentinel = staleness_sentinel(journal, acknowledge_stale)
    if sentinel:
        raise Refusal(sentinel)


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


def section_range(lines: list[str], heading: str) -> tuple[int, int] | None:
    start = None
    for index, line in enumerate(lines):
        if line.strip() == heading:
            start = index
            break
    if start is None:
        return None
    level = len(heading) - len(heading.lstrip("#"))
    end = len(lines)
    for index in range(start + 1, len(lines)):
        if not lines[index].startswith("#"):
            continue
        next_level = len(lines[index]) - len(lines[index].lstrip("#"))
        if next_level <= level:
            end = index
            break
    return start, end


def find_table_in_range(lines: list[str], start: int, end: int, required: set[str]) -> int | None:
    for index in range(start, end):
        if not lines[index].lstrip().startswith("|"):
            continue
        headers = set(cells(lines[index]))
        if required.issubset(headers):
            return index
    return None


def set_cell(row: list[str], headers: list[str], name: str, value: Any) -> None:
    if name in headers:
        row[headers.index(name)] = str(value)


def set_first_available_cell(row: list[str], headers: list[str], names: list[str], value: Any) -> None:
    for name in names:
        if name in headers:
            row[headers.index(name)] = str(value)
            return


def get_first_available_cell(row: list[str], headers: list[str], names: list[str]) -> str:
    for name in names:
        if name in headers and headers.index(name) < len(row):
            return row[headers.index(name)]
    return ""


def ensure_table_column(lines: list[str], table: int, headers: list[str], name: str) -> tuple[list[str], int]:
    if name in headers:
        return headers, table_end(lines, table)
    headers = list(headers)
    headers.append(name)
    lines[table] = render_row(headers)
    if table + 1 < len(lines) and lines[table + 1].lstrip().startswith("|"):
        lines[table + 1] = render_separator(headers)
    end = table_end(lines, table)
    for index in range(table + 2, end):
        row = cells(lines[index])
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
        lines[index] = render_row(row)
    return headers, end


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


def parse_threshold_value(raw: str) -> float | None:
    value = raw.split("#", 1)[0].strip().strip("'\"")
    match = re.match(r"^-?\d+(?:\.\d+)?", value)
    if not match:
        return None
    return float(match.group(0))


def parse_frontmatter_thresholds(text: str) -> dict[str, float]:
    lines, _ = markdown_lines(text)
    if not lines or lines[0].strip() != "---":
        return {}
    thresholds: dict[str, float] = {}
    for line in lines[1:]:
        if line.strip() == "---":
            break
        match = re.match(r"^(pass_threshold|quality_threshold)\s*:\s*(.+)$", line.strip())
        if not match:
            continue
        parsed = parse_threshold_value(match.group(2))
        if parsed is not None:
            thresholds[match.group(1)] = parsed
    return thresholds


def parse_area_thresholds(text: str) -> dict[str, dict[str, float]]:
    lines, _ = markdown_lines(text)
    thresholds: dict[str, dict[str, float]] = {}
    for index, line in enumerate(lines):
        if not line.startswith("### "):
            continue
        slug = line[4:].strip()
        end = len(lines)
        for next_index in range(index + 1, len(lines)):
            if lines[next_index].startswith("### ") or lines[next_index].startswith("## "):
                end = next_index
                break
        area_thresholds: dict[str, float] = {}
        for detail in lines[index + 1 : end]:
            match = re.match(r"^\*\*(pass_threshold|quality_threshold):\*\*\s*(.+)$", detail.strip())
            if not match:
                continue
            parsed = parse_threshold_value(match.group(2))
            if parsed is not None:
                area_thresholds[match.group(1)] = parsed
        if area_thresholds:
            thresholds[slug] = area_thresholds
    return thresholds


def threshold_map(payload: dict[str, Any], test_file_text: str | None) -> dict[str, dict[str, float]]:
    file_thresholds = parse_frontmatter_thresholds(test_file_text or "")
    area_thresholds = parse_area_thresholds(test_file_text or "")
    mapped: dict[str, dict[str, float]] = {}
    for area in payload.get("areas", []):
        slug = area.get("slug")
        if not isinstance(slug, str):
            continue
        mapped[slug] = {
            "pass_threshold": float(cap_value("pass_threshold")),
            "quality_threshold": float(cap_value("quality_threshold")),
        }
        mapped[slug].update(file_thresholds)
        mapped[slug].update(area_thresholds.get(slug, {}))
    return mapped


def score_passes(area: dict[str, Any], thresholds: dict[str, dict[str, float]] | None = None) -> bool:
    if area.get("skip_reason"):
        return False
    ux = area.get("ux_score")
    if not isinstance(ux, (int, float)):
        return False
    area_thresholds = (thresholds or {}).get(area.get("slug"), {})
    pass_threshold = area_thresholds.get("pass_threshold", float(cap_value("pass_threshold")))
    quality_threshold = area_thresholds.get("quality_threshold", float(cap_value("quality_threshold")))
    if ux < pass_threshold:
        return False
    quality = area.get("quality_score")
    if quality is not None and quality < quality_threshold:
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
        if isinstance(entry, list):
            entry = {"scores": entry, "trend": "stable"}
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


def history_run_count_after(last_confirmed: str, current_run_date: str) -> int:
    last_confirmed = (last_confirmed or "").strip()
    if not re.match(r"^\d{4}-\d{2}-\d{2}$", last_confirmed):
        return 0
    dates: set[str] = set()
    text = read_text(resolve("tests/user-flows/test-history.md"))
    if text is not None:
        history_lines, _ = markdown_lines(text)
        table = find_table(history_lines, {"Date", "Areas Tested", "Quality Avg"})
        if table is not None:
            headers = cells(history_lines[table])
            end = table_end(history_lines, table)
            if "Date" in headers:
                date_index = headers.index("Date")
                for line in history_lines[table + 2 : end]:
                    row = cells(line)
                    if date_index >= len(row):
                        continue
                    date = row[date_index].strip()
                    if re.match(r"^\d{4}-\d{2}-\d{2}$", date) and date > last_confirmed:
                        dates.add(date)
    if current_run_date > last_confirmed:
        dates.add(current_run_date)
    return len(dates)


def update_good_patterns_section(lines: list[str], payload: dict[str, Any]) -> None:
    headers = ["Area", "Pattern", "First Seen", "Last Confirmed"]
    table = ensure_section_table(lines, "Good Patterns", headers)
    existing_headers, rows = existing_table_rows(lines, table)
    by_area = {row[existing_headers.index("Area")]: row for row in rows if "Area" in existing_headers}
    run_date = payload["run_timestamp"][:10]
    confirmed_areas: set[str] = set()
    for pattern in payload.get("good_patterns", []):
        area = pattern.get("area", "")
        confirmed_areas.add(area)
        row = by_area.get(area)
        if row is None:
            row = ["" for _ in existing_headers]
            set_cell(row, existing_headers, "Area", area)
            set_cell(row, existing_headers, "First Seen", run_date)
            rows.append(row)
        set_cell(row, existing_headers, "Pattern", pattern.get("pattern", ""))
        set_cell(row, existing_headers, "Last Confirmed", run_date)
    cap = int(cap_value("good_patterns_unconfirmed_runs"))
    kept_rows: list[list[str]] = []
    for row in rows:
        area = get_first_available_cell(row, existing_headers, ["Area"])
        if area in confirmed_areas:
            kept_rows.append(row)
            continue
        last_confirmed = get_first_available_cell(row, existing_headers, ["Last Confirmed"])
        if history_run_count_after(last_confirmed, run_date) >= cap:
            continue
        kept_rows.append(row)
    rows = kept_rows
    end = table_end(lines, table)
    lines[table:end] = [render_row(existing_headers), render_separator(existing_headers), *[render_row(row) for row in rows]]


def update_weakness_classes(lines: list[str], payload: dict[str, Any]) -> None:
    for area in payload.get("areas", []):
        if "weakness_class" not in area or area.get("weakness_class") is None:
            continue
        weakness = str(area.get("weakness_class", ""))
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
        if weakness == "":
            for index in range(heading + 1, end):
                if lines[index].startswith("**weakness_class:**"):
                    del lines[index]
                    break
            continue
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


def append_confirmed_selectors(lines: list[str], payload: dict[str, Any]) -> None:
    run_number = payload.get("run_number", 1)
    for area in payload.get("areas", []):
        selectors = area.get("confirmed_selectors")
        if not isinstance(selectors, dict) or not selectors:
            continue
        area_range = section_range(lines, f"### {area['slug']}")
        if area_range is None:
            continue
        start, end = area_range
        verify_index = None
        for index in range(start + 1, end):
            if lines[index].startswith("**verify:**"):
                verify_index = index
                break
        if verify_index is None:
            insert_at = start + 1
            lines[insert_at:insert_at] = ["", "**verify:**"]
            verify_index = insert_at + 1
            end += 2
        insert_at = verify_index + 1
        while insert_at < end and not lines[insert_at].startswith("**"):
            insert_at += 1
        rendered = ["- Confirmed selectors:"]
        for name, selector in selectors.items():
            rendered.append(f"  {name} (`{selector}`)")
        rendered.append(f"  _Selectors confirmed run {run_number}._")
        lines[insert_at:insert_at] = rendered + [""]


def file_cli_command_present(text: str | None) -> bool:
    if not text:
        return False
    lines, _ = markdown_lines(text)
    if not lines or lines[0].strip() != "---":
        return False
    for line in lines[1:]:
        if line.strip() == "---":
            return False
        match = re.match(r"^cli_test_command\s*:\s*(.*)$", line.strip())
        if not match:
            continue
        value = match.group(1).strip().strip("'\"")
        return bool(value)
    return False


def update_query_statuses(lines: list[str], payload: dict[str, Any], test_file_text: str | None) -> None:
    file_cli_present = file_cli_command_present(test_file_text)
    for result in payload.get("query_results", []):
        area_slug = result.get("area")
        query = result.get("query")
        if not isinstance(area_slug, str) or not isinstance(query, str):
            continue
        area_range = section_range(lines, f"### {area_slug}")
        if area_range is None:
            continue
        table = find_table_in_range(lines, area_range[0], area_range[1], {"Query", "Status"})
        if table is None:
            continue
        headers = cells(lines[table])
        end = table_end(lines, table)
        for index in range(table + 2, end):
            row = cells(lines[index])
            if len(row) < len(headers):
                row.extend([""] * (len(headers) - len(row)))
            if row[headers.index("Query")] != query:
                continue
            status = row[headers.index("Status")] or "active"
            score = result.get("score")
            consecutive = int(result.get("consecutive_successes", 0) or 0)
            soft_regressions = int(result.get("consecutive_soft_regressions", 0) or 0)
            cli_present = bool(result.get("cli_test_command_present", file_cli_present))
            next_status = status
            if status == "[retired]" and not cli_present:
                next_status = "[stable]"
            elif status == "[stable]" and isinstance(score, (int, float)) and score <= 3:
                next_status = "active"
            elif status == "[stable]" and soft_regressions >= 2:
                next_status = "active"
            elif isinstance(score, (int, float)) and score == 5 and consecutive >= 10 and cli_present:
                next_status = "[retired]"
            elif isinstance(score, (int, float)) and score == 5 and consecutive >= 3:
                next_status = "[stable]"
            set_cell(row, headers, "Status", next_status)
            lines[index] = render_row(row)
            break


def update_area_probe_tables(lines: list[str], payload: dict[str, Any]) -> tuple[int, list[dict[str, Any]]]:
    probe_rotations = 0
    issue_candidates: list[dict[str, Any]] = []
    probe_updates = [(probe, True) for probe in payload.get("probes_run", [])]
    probe_updates.extend((probe, False) for probe in payload.get("probes_generated", []))
    for probe, was_run in probe_updates:
        area_slug = probe.get("area")
        if not isinstance(area_slug, str):
            continue
        area_range = section_range(lines, f"### {area_slug}")
        if area_range is None:
            continue
        table = find_table_in_range(lines, area_range[0], area_range[1], {"Query", "Verify", "Status", "Run History"})
        if table is None:
            continue
        headers = cells(lines[table])
        end = table_end(lines, table)
        target_index = None
        for index in range(table + 2, end):
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
        row = cells(lines[target_index])
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
        set_cell(row, headers, "Status", probe.get("status", "untested"))
        if "Run History" in headers and was_run:
            history = [token.strip() for token in row[headers.index("Run History")].split(",") if token.strip()]
            history.insert(0, "P" if probe.get("status") == "passing" else "F")
            cap = int(cap_value("probe_run_history_cap"))
            if len(history) > cap:
                probe_rotations += len(history) - cap
            row[headers.index("Run History")] = ",".join(history[:cap])
        lines[target_index] = render_row(row)
    return probe_rotations, issue_candidates


def update_cross_area_probes(
    lines: list[str],
    payload: dict[str, Any],
    allocate_bug_id: Callable[[], str] | None = None,
    active_bug_areas: set[str] | None = None,
) -> tuple[int, list[dict[str, Any]]]:
    rotations = 0
    issue_candidates: list[dict[str, Any]] = []
    active_bug_areas = active_bug_areas or set()
    table = table_after_heading(lines, "Cross-Area Probes")
    if table is None:
        return rotations, issue_candidates
    headers = cells(lines[table])
    headers, end = ensure_table_column(lines, table, headers, "Escalated To")
    end = table_end(lines, table)
    for probe in payload.get("cross_area_probes_run", []):
        target_index = None
        for index in range(table + 2, end):
            row = cells(lines[index])
            if len(row) < len(headers):
                row.extend([""] * (len(headers) - len(row)))
            if (
                row[headers.index("Trigger Area")] == probe.get("trigger_area")
                and row[headers.index("Action")] == probe.get("action")
                and row[headers.index("Observation Area")] == probe.get("observation_area")
                and row[headers.index("Verify")] == probe.get("verify")
            ):
                target_index = index
                break
        if target_index is None:
            row = ["" for _ in headers]
            set_cell(row, headers, "Trigger Area", probe.get("trigger_area", ""))
            set_cell(row, headers, "Action", probe.get("action", ""))
            set_cell(row, headers, "Observation Area", probe.get("observation_area", ""))
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
        history = []
        if "Run History" in headers:
            history = [token.strip() for token in row[headers.index("Run History")].split(",") if token.strip()]
            history.append("P" if probe.get("status") == "passing" else "F")
            cap = int(cap_value("cross_area_probe_run_history_cap"))
            if len(history) > cap:
                rotations += len(history) - cap
            row[headers.index("Run History")] = ",".join(history[-cap:])
        lines[target_index] = render_row(row)
        if probe.get("status") == "failing" and history[-3:] == ["F", "F", "F"]:
            area = probe.get("trigger_area", "")
            escalated_to = get_first_available_cell(row, headers, ["Escalated To"])
            if not escalated_to and area not in active_bug_areas:
                bug_id = allocate_bug_id() if allocate_bug_id else ""
                set_cell(row, headers, "Escalated To", bug_id)
                lines[target_index] = render_row(row)
                issue_candidates.append(
                    {
                        "id": f"cross-area-{len(issue_candidates) + 1}",
                        "bug_id": bug_id,
                        "area": area,
                        "title": f"Cross-area probe failed: {probe.get('verify', '')}",
                        "body": probe.get("result_detail", probe.get("verify", "")),
                    }
                )
    return rotations, issue_candidates


def journey_token(result: dict[str, Any]) -> str:
    status = result.get("status")
    if status == "passing":
        return "P"
    failed_step = result.get("failed_step")
    if not isinstance(failed_step, int):
        for checkpoint in result.get("checkpoints", []):
            if isinstance(checkpoint, dict) and checkpoint.get("passed") is False:
                failed_step = checkpoint.get("step")
                break
    return f"F:{failed_step}" if isinstance(failed_step, int) else "F"


def update_journeys(
    lines: list[str],
    payload: dict[str, Any],
    allocate_bug_id: Callable[[], str] | None = None,
    active_bug_areas: set[str] | None = None,
) -> list[dict[str, Any]]:
    issue_candidates: list[dict[str, Any]] = []
    active_bug_areas = active_bug_areas or set()
    run_date = payload["run_timestamp"][:10]
    for result in payload.get("journeys_run", []):
        journey_id = result.get("id")
        if not isinstance(journey_id, str):
            continue
        heading = None
        for index, line in enumerate(lines):
            if line.startswith(f"### {journey_id}:"):
                heading = index
                break
        if heading is None:
            continue
        end = len(lines)
        for index in range(heading + 1, len(lines)):
            if lines[index].startswith("### ") or lines[index].startswith("## "):
                end = index
                break
        fields: dict[str, int] = {}
        field_values: dict[str, str] = {}
        for index in range(heading + 1, end):
            match = re.match(r"^\*\*(Status|Last Run|Run History|escalated_to|Escalated To):\*\*\s*(.*)$", lines[index])
            if match:
                fields[match.group(1)] = index
                field_values[match.group(1)] = match.group(2).strip()
        token = journey_token(result)
        previous_history = ""
        if "Run History" in fields:
            previous_history = lines[fields["Run History"]].split("**", 2)[-1].strip()
            previous_history = previous_history if previous_history != "---" else ""
        history = [item for item in previous_history.split() if item]
        history.append(token)
        status = result.get("status", "untested")
        if token == "P":
            status = "stable" if len(history) >= 5 and history[-5:] == ["P"] * 5 else "passing"
        elif token.startswith("F:"):
            status = f"failing-at-{token.split(':', 1)[1]}"
        if "Status" in fields:
            lines[fields["Status"]] = f"**Status:** {status}"
        if "Last Run" in fields:
            lines[fields["Last Run"]] = f"**Last Run:** {run_date}"
        if "Run History" in fields:
            lines[fields["Run History"]] = f"**Run History:** {' '.join(history)}"
        if token.startswith("F:") and history[-3:] == [token, token, token]:
            failed_step = token.split(":", 1)[1]
            area = result.get("failed_area", "")
            escalated_to = field_values.get("escalated_to") or field_values.get("Escalated To") or ""
            if not escalated_to and area not in active_bug_areas:
                bug_id = allocate_bug_id() if allocate_bug_id else ""
                if "escalated_to" in fields:
                    lines[fields["escalated_to"]] = f"**escalated_to:** {bug_id}"
                elif "Escalated To" in fields:
                    lines[fields["Escalated To"]] = f"**Escalated To:** {bug_id}"
                else:
                    insert_at = fields.get("Run History", end - 1) + 1
                    lines.insert(insert_at, f"**escalated_to:** {bug_id}")
                issue_candidates.append(
                    {
                        "id": f"journey-{journey_id}",
                        "bug_id": bug_id,
                        "area": area,
                        "title": f"Journey {journey_id} failed at step {failed_step}",
                        "body": result.get("result_detail", ""),
                    }
                )
    return issue_candidates


def update_test_file(
    payload: dict[str, Any],
    score_history_after: dict[str, Any],
    test_file_text_before: str | None,
    allocate_bug_id: Callable[[], str] | None = None,
    active_bug_areas: set[str] | None = None,
) -> tuple[str, dict[str, Any], list[dict[str, Any]]]:
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

    probe_rotations, probe_candidates = update_area_probe_tables(lines, payload)
    cross_area_rotations, cross_area_candidates = update_cross_area_probes(
        lines, payload, allocate_bug_id, active_bug_areas
    )
    if cross_area_rotations:
        probe_rotations += cross_area_rotations

    update_query_statuses(lines, payload, test_file_text_before)
    append_confirmed_selectors(lines, payload)
    update_area_trends_section(lines, score_history_after)
    update_ux_opportunities_section(lines, payload)
    update_good_patterns_section(lines, payload)
    update_weakness_classes(lines, payload)
    journey_candidates = update_journeys(lines, payload, allocate_bug_id, active_bug_areas)
    return join_markdown(lines, final), {"probe_run_history": probe_rotations}, [
        *probe_candidates,
        *cross_area_candidates,
        *journey_candidates,
    ]


def load_score_history(path: str) -> dict[str, Any]:
    text = read_text(path)
    if text is None:
        return {"areas": {}}
    try:
        doc = json.loads(text)
    except ValueError as exc:
        raise UsageFailure(f"invalid json in {path_context(path)}: {exc}") from exc
    if not isinstance(doc, dict) or not isinstance(doc.get("areas"), dict):
        return {"areas": {}}
    normalized = deepcopy(doc)
    normalized_areas: dict[str, dict[str, Any]] = {}
    for slug, entry in doc.get("areas", {}).items():
        if isinstance(entry, list):
            normalized_areas[str(slug)] = {"scores": entry, "trend": "stable"}
            continue
        if isinstance(entry, dict):
            normalized_entry = dict(entry)
            if not isinstance(normalized_entry.get("scores"), list):
                normalized_entry["scores"] = []
            if not isinstance(normalized_entry.get("trend"), str):
                normalized_entry["trend"] = "stable"
            normalized_areas[str(slug)] = normalized_entry
            continue
        normalized_areas[str(slug)] = {"scores": [], "trend": "stable"}
    normalized["areas"] = normalized_areas
    return normalized


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


def recurring_pattern_notes(headers: list[str], row_lines: list[str]) -> list[str]:
    config = cap_value("pattern_surfacing")
    window = int(config["window_runs"])
    if len(row_lines) < window:
        return []
    recent = row_lines[-window:]
    notes: list[str] = []
    for column, threshold_key, label in (
        ("Best Area", "positive_best_area_count", "best area"),
        ("Worst Area", "negative_worst_area_count", "worst area"),
    ):
        if column not in headers:
            continue
        index = headers.index(column)
        counts: dict[str, int] = {}
        for line in recent:
            row = cells(line)
            if index >= len(row):
                continue
            area = row[index].strip()
            if not area or area == EM_DASH:
                continue
            counts[area] = counts.get(area, 0) + 1
        if not counts:
            continue
        area, count = sorted(counts.items(), key=lambda item: (-item[1], item[0]))[0]
        if count >= int(config[threshold_key]):
            notes.append(f"Pattern: {area} {label} in {count}/{window} recent runs")
    return notes


def update_test_history(
    payload: dict[str, Any],
    score_history_before: dict[str, Any],
    thresholds: dict[str, dict[str, float]],
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
        current_overlap_avg = sum(current_scores[slug] for slug in overlap) / len(overlap)
        prev_avg = sum(previous_scores[slug] for slug in overlap) / len(overlap)
        delta_value = current_overlap_avg - prev_avg
        delta = f"{delta_value:+.1f}"
    else:
        delta_value = None
        delta = EM_DASH
    passes = sum(1 for area in payload.get("areas", []) if score_passes(area, thresholds))
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
    notes = recurring_pattern_notes(headers, [*existing_rows, render_row(row)])
    if notes and "Key Finding" in headers:
        index = headers.index("Key Finding")
        existing_finding = row[index]
        suffix = "; ".join(notes)
        row[index] = suffix if not existing_finding or existing_finding == EM_DASH else f"{existing_finding}; {suffix}"
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


def bug_rows_from_text(text: str | None) -> tuple[list[str], list[list[str]]]:
    if text is None:
        return BUG_HEADERS, []
    lines, _ = markdown_lines(text)
    table = find_table(lines, {"ID", "Area", "Status", "Issue", "Title"})
    if table is None:
        return BUG_HEADERS, []
    headers = cells(lines[table])
    end = table_end(lines, table)
    rows = [cells(line) for line in lines[table + 2 : end]]
    for row in rows:
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
    return headers, rows


def active_bug_areas_from_text(text: str | None) -> set[str]:
    headers, rows = bug_rows_from_text(text)
    areas: set[str] = set()
    for row in rows:
        status = get_first_available_cell(row, headers, ["Status"]).strip().lower()
        area = get_first_available_cell(row, headers, ["Area"]).strip()
        if area and status and status != "fixed":
            areas.add(area)
    return areas


def next_bug_id(existing_rows: list[list[str]], headers: list[str]) -> int:
    if "ID" not in headers:
        return 1
    found = []
    for row in existing_rows:
        match = re.match(r"B(\d+)$", row[headers.index("ID")])
        if match:
            found.append(int(match.group(1)))
    return (max(found) + 1) if found else 1


def make_bug_id_allocator(bugs_text: str | None, payload: dict[str, Any]) -> Callable[[], str]:
    headers, existing = bug_rows_from_text(bugs_text)
    next_id = next_bug_id(existing, headers)
    for candidate in payload.get("issue_candidates", []):
        if not isinstance(candidate, dict):
            continue
        bug_id = candidate.get("bug_id")
        if isinstance(bug_id, str):
            match = re.match(r"^B(\d+)$", bug_id)
            if match:
                next_id = max(next_id, int(match.group(1)) + 1)
                continue
        next_id += 1

    def allocate() -> str:
        nonlocal next_id
        bug_id = f"B{next_id:03d}"
        next_id += 1
        return bug_id

    return allocate


def update_bugs(payload: dict[str, Any], derived_candidates: list[dict[str, Any]] | None = None) -> tuple[str, list[dict[str, Any]]]:
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
    for row in existing:
        if len(row) < len(headers):
            row.extend([""] * (len(headers) - len(row)))
    next_id = next_bug_id(existing, headers)
    journal_candidates: list[dict[str, Any]] = []
    run_date = payload["run_timestamp"][:10]
    rows_by_id = {
        row[headers.index("ID")]: row
        for row in existing
        if "ID" in headers and headers.index("ID") < len(row)
    }
    regression_candidates: list[dict[str, Any]] = []
    for update in payload.get("bug_lifecycle_updates", []):
        bug_id = update.get("bug_id")
        if not isinstance(bug_id, str):
            continue
        row = rows_by_id.get(bug_id)
        if row is None:
            continue
        desired = update.get("status")
        if desired == "fixed" and update.get("fix_check_passed") and update.get("issue_closed"):
            set_cell(row, headers, "Status", "fixed")
            set_cell(row, headers, "Fixed", update.get("fixed_date", run_date))
        elif desired == "regressed":
            set_cell(row, headers, "Status", "regressed")
            set_cell(row, headers, "Regressed", update.get("regressed_date", run_date))
            original_issue = get_first_available_cell(row, headers, ["Issue"])
            title = update.get("title") or f"Regression of {original_issue}: {get_first_available_cell(row, headers, ['Title', 'Summary'])}"
            regression_candidates.append(
                {
                    "id": update.get("id") or f"regression-{bug_id}",
                    "area": update.get("area") or get_first_available_cell(row, headers, ["Area"]),
                    "title": title,
                    "body": update.get("body", title),
                    "regression_of": bug_id,
                    "regressed_date": update.get("regressed_date", run_date),
                }
            )

    new_rows: list[list[str]] = []
    all_candidates = [
        *payload.get("issue_candidates", []),
        *(derived_candidates or []),
        *regression_candidates,
    ]
    for candidate in all_candidates:
        candidate_bug_id = candidate.get("bug_id")
        if isinstance(candidate_bug_id, str) and candidate_bug_id:
            bug_id = candidate_bug_id
            match = re.match(r"^B(\d+)$", bug_id)
            if match:
                next_id = max(next_id, int(match.group(1)) + 1)
        else:
            bug_id = f"B{next_id:03d}"
            next_id += 1
        row = ["" for _ in headers]
        set_cell(row, headers, "ID", bug_id)
        set_cell(row, headers, "Area", candidate.get("area", ""))
        set_cell(row, headers, "Status", "pending")
        set_cell(row, headers, "Issue", "pending")
        set_first_available_cell(row, headers, ["Title", "Summary"], candidate.get("title", ""))
        set_cell(row, headers, "Fixed", candidate.get("fixed_date", EM_DASH))
        set_cell(row, headers, "Regressed", candidate.get("regressed_date", EM_DASH))
        new_rows.append(row)
        saved = dict(candidate)
        saved["bug_id"] = bug_id
        saved["status"] = candidate.get("status", "pending")
        journal_candidates.append(saved)
    lines[table:end] = [
        render_row(headers),
        render_separator(headers),
        *[render_row(row) for row in existing],
        *[render_row(row) for row in new_rows],
    ]
    return join_markdown(lines), journal_candidates


RUN_JSON_ARRAY_KEYS = [
    "anomalies",
    "ux_opportunities",
    "good_patterns",
    "verification_results",
    "probes_run",
    "probes_generated",
    "cross_area_probes_run",
    "journeys_run",
    "explore_next_run",
    "novelty_log",
    "stable_queries_rotated",
]


RUN_JSON_AREA_DEFAULTS = {
    "tactical_note": None,
    "confirmed_selectors": {},
    "weakness_class": None,
    "adversarial_browser": False,
    "adversarial_trigger": None,
    "evidence": [],
}


def merge_areas_for_last_run(existing: dict[str, Any], payload: dict[str, Any]) -> list[dict[str, Any]]:
    existing_by_slug = {
        area.get("slug"): deepcopy(area)
        for area in existing.get("areas", [])
        if isinstance(area, dict) and isinstance(area.get("slug"), str)
    }
    merged: list[dict[str, Any]] = []
    seen: set[str] = set()
    for payload_area in payload.get("areas", []):
        if not isinstance(payload_area, dict) or not isinstance(payload_area.get("slug"), str):
            continue
        slug = payload_area["slug"]
        area = existing_by_slug.get(slug, {"slug": slug})
        area.update(payload_area)
        for key, value in RUN_JSON_AREA_DEFAULTS.items():
            if key not in area:
                if isinstance(value, dict):
                    area[key] = dict(value)
                elif isinstance(value, list):
                    area[key] = list(value)
                else:
                    area[key] = value
        merged.append(area)
        seen.add(slug)
    for slug, area in existing_by_slug.items():
        if slug not in seen:
            for key, value in RUN_JSON_AREA_DEFAULTS.items():
                if key not in area:
                    if isinstance(value, dict):
                        area[key] = dict(value)
                    elif isinstance(value, list):
                        area[key] = list(value)
                    else:
                        area[key] = value
            merged.append(area)
    return merged


def merge_last_run(payload: dict[str, Any]) -> str:
    path = resolve(LAST_RUN_REL)
    existing = load_json_file(path) if os.path.exists(path) else {}
    if not isinstance(existing, dict):
        existing = {}
    doc = deepcopy(existing)
    doc.pop("migration_defaults_applied", None)
    doc["run_timestamp"] = payload["run_timestamp"]
    doc["schema_version"] = CURRENT_SCHEMA_VERSION
    doc["completed"] = existing.get("completed") if isinstance(existing.get("completed"), bool) else True
    doc["scenario_slug"] = payload["scenario_slug"]
    doc["areas"] = merge_areas_for_last_run(existing, payload)
    doc["anomalies"] = deepcopy(payload.get("anomalies", []))
    if not isinstance(doc["anomalies"], list):
        doc["anomalies"] = []
    doc["final_execution_index"] = payload.get("final_execution_index")
    doc["anomaly_ledger_digest"] = deepcopy(payload.get("anomaly_ledger_digest"))
    for key in RUN_JSON_ARRAY_KEYS:
        doc[key] = deepcopy(payload.get(key, existing.get(key, [])))
        if not isinstance(doc[key], list):
            doc[key] = []
    if "disconnects" not in doc or not isinstance(doc.get("disconnects"), dict):
        doc["disconnects"] = {"count": 0, "contexts": []}
    merged = deepcopy(existing.get("novelty_fingerprints", {})) if isinstance(existing, dict) else {}
    if not isinstance(merged, dict):
        merged = {}
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
    test_file_text_before = read_text(resolve(payload["test_file"]))
    bugs_text_before = read_text(resolve("tests/user-flows/bugs.md"))
    allocate_bug_id = make_bug_id_allocator(bugs_text_before, payload)
    active_bug_areas = active_bug_areas_from_text(bugs_text_before)
    thresholds = threshold_map(payload, test_file_text_before)
    score_history_text, score_before, score_rotations, score_after = update_score_history(payload)
    test_file_text, probe_rotations, derived_issue_candidates = update_test_file(
        payload, score_after, test_file_text_before, allocate_bug_id, active_bug_areas
    )
    test_history_text, history_rotations = update_test_history(payload, score_before, thresholds)
    bugs_text, issue_candidates = update_bugs(payload, derived_issue_candidates)
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


DISPOSITIONS = {"filed", "noted-in-area", "explore-next-run", "dismissed"}
EVIDENCE_TYPES = {"action", "dom", "timing", "count"}


def is_int(value: Any) -> bool:
    return type(value) is int


def is_number(value: Any) -> bool:
    return isinstance(value, (int, float)) and not isinstance(value, bool)


def load_optional_json(rel_path: str) -> Any:
    path = resolve(rel_path)
    raw = read_text(path)
    if raw is None:
        return None
    try:
        return json.loads(raw)
    except ValueError as exc:
        raise UsageFailure(f"invalid json in {rel_path}: {exc}") from exc


def migration_defaults_marker_present() -> bool:
    doc = load_optional_json(LAST_RUN_REL)
    return isinstance(doc, dict) and "migration_defaults_applied" in doc


def load_ledger() -> dict[str, Any]:
    raw = read_bytes(resolve(LEDGER_REL))
    if raw is None:
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


def ledger_header_matches(ledger: dict[str, Any], payload: dict[str, Any]) -> bool:
    header = ledger.get("header")
    return (
        ledger.get("exists") is True
        and isinstance(header, dict)
        and header.get("run_timestamp") == payload.get("run_timestamp")
        and header.get("scenario_slug") == payload.get("scenario_slug")
    )


def migration_defaults_warning(payload: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    header = ledger.get("header") if isinstance(ledger.get("header"), dict) else {}
    return [
        {
            "code": "migration_defaults_applied",
            "field": "migration_defaults_applied",
            "path": LAST_RUN_REL,
            "ledger": {
                "path": LEDGER_REL,
                "present": ledger.get("exists") is True,
                "run_timestamp": header.get("run_timestamp"),
                "scenario_slug": header.get("scenario_slug"),
                "expected_run_timestamp": payload.get("run_timestamp"),
                "expected_scenario_slug": payload.get("scenario_slug"),
            },
        }
    ]


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


def validate_anomaly_reconciliation(payload: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    payload_anomalies = payload.get("anomalies", [])
    if not isinstance(payload_anomalies, list):
        payload_anomalies = []
    by_key: dict[str, list[dict[str, Any]]] = {}
    for anomaly in payload_anomalies:
        if isinstance(anomaly, dict):
            by_key.setdefault(canonical_anomaly_fields(anomaly), []).append(anomaly)
    for line_number, entry in enumerate(ledger.get("entries", []), start=2):
        if not isinstance(entry, dict) or entry.get("__invalid__"):
            continue
        if entry.get("kind") != "anomaly":
            continue
        matches = by_key.get(canonical_anomaly_fields(entry), [])
        match = next(
            (item for item in matches if item.get("disposition") in DISPOSITIONS),
            None,
        )
        if match is None:
            errors.append(
                {
                    "code": "anomaly_undispositioned",
                    "line": line_number,
                    "area": entry.get("area"),
                    "what": entry.get("what"),
                }
            )
            continue
        if match.get("disposition") == "dismissed" and not str(match.get("reason", "")).strip():
            errors.append(
                {
                    "code": "dismissal_reason_empty",
                    "line": line_number,
                    "area": entry.get("area"),
                    "what": entry.get("what"),
                }
            )
    return errors


def validate_ledger_digest(payload: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    digest = payload.get("anomaly_ledger_digest")
    if not isinstance(digest, dict):
        return [
            {
                "code": "ledger_digest_mismatch",
                "field": "anomaly_ledger_digest",
                "expected": None,
                "actual": {"lines": ledger.get("line_count"), "sha256": ledger.get("sha256")},
            }
        ]
    expected = {"lines": digest.get("lines"), "sha256": digest.get("sha256")}
    actual = {"lines": ledger.get("line_count"), "sha256": ledger.get("sha256")}
    if expected != actual:
        return [{"code": "ledger_digest_mismatch", "expected": expected, "actual": actual}]
    return []


def ledger_ranges_and_markers(ledger: dict[str, Any]) -> tuple[list[tuple[int, int]], list[int], list[dict[str, Any]]]:
    spans: list[tuple[int, int]] = []
    markers: list[int] = []
    errors: list[dict[str, Any]] = []
    for line_number, entry in enumerate(ledger.get("entries", []), start=2):
        if not isinstance(entry, dict) or entry.get("__invalid__"):
            errors.append({"code": "ledger_tiling", "line": line_number, "reason": "invalid_json"})
            continue
        index_range = entry.get("index_range")
        if index_range is None:
            at_index = entry.get("at_index")
            if not is_int(at_index):
                errors.append({"code": "ledger_tiling", "line": line_number, "reason": "invalid_at_index"})
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
            errors.append({"code": "ledger_tiling", "line": line_number, "reason": "invalid_index_range"})
            continue
        spans.append((index_range[0], index_range[1]))
    return spans, markers, errors


def disconnect_tolerance(payload: dict[str, Any]) -> int:
    disconnects = payload.get("disconnects")
    if not isinstance(disconnects, dict):
        return 0
    count = disconnects.get("count")
    return count if is_int(count) and count > 0 else 0


def validate_ledger_tiling(payload: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    final_index = payload.get("final_execution_index")
    if not is_int(final_index) or final_index < 0:
        return [{"code": "ledger_tiling", "field": "final_execution_index", "value": final_index}]
    spans, markers, errors = ledger_ranges_and_markers(ledger)
    if errors:
        return errors
    for marker in markers:
        if marker < 0:
            return [{"code": "ledger_tiling", "reason": "marker_before_zero", "at_index": marker}]
    if not spans:
        return [{"code": "ledger_tiling", "reason": "no_ranges"}]
    spans.sort()
    first_start, first_end = spans[0]
    if first_start != 0:
        return [{"code": "ledger_tiling", "reason": "coverage_must_start_at_zero", "start": first_start}]
    coverage_end = first_end
    interior_gap_width = 0
    for start, end in spans[1:]:
        if start <= coverage_end:
            overlap = coverage_end - start + 1
            if overlap > 1:
                return [
                    {
                        "code": "ledger_tiling",
                        "reason": "overlap",
                        "previous_end": coverage_end,
                        "start": start,
                    }
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
            {
                "code": "ledger_tiling",
                "reason": "coverage_ends_before_final_index",
                "coverage_end": coverage_end,
                "final_execution_index": final_index,
            }
        ]
    tolerance = disconnect_tolerance(payload)
    if interior_gap_width > tolerance:
        return [
            {
                "code": "ledger_tiling",
                "reason": "gap_exceeds_disconnect_tolerance",
                "gap_width": interior_gap_width,
                "disconnect_count": tolerance,
            }
        ]
    return []


def evidence_entries_from(value: Any) -> list[dict[str, Any]]:
    if not isinstance(value, list):
        return []
    return [entry for entry in value if isinstance(entry, dict)]


def countable_evidence_entries_from(value: Any) -> list[dict[str, Any]]:
    return [entry for entry in evidence_entries_from(value) if well_formed_evidence_entry(entry)]


def well_formed_evidence_entry(entry: Any) -> bool:
    return (
        isinstance(entry, dict)
        and entry.get("type") in EVIDENCE_TYPES
        and isinstance(entry.get("note"), str)
        and bool(entry["note"].strip())
    )


def concrete_evidence_ref(entry: dict[str, Any]) -> bool:
    evidence_type = entry.get("type")
    ref = entry.get("ref")
    if evidence_type == "action":
        return is_int(ref)
    if evidence_type == "dom":
        return isinstance(ref, str) and bool(ref.strip())
    if evidence_type == "timing":
        return is_number(ref)
    if evidence_type == "count":
        return is_number(ref) or (isinstance(ref, str) and bool(ref.strip()))
    return False


def iter_payload_evidence(payload: dict[str, Any]):
    for area in payload.get("areas", []):
        if not isinstance(area, dict):
            continue
        for entry in evidence_entries_from(area.get("evidence")):
            yield "area", area.get("slug"), entry
    anomalies = payload.get("anomalies", [])
    if not isinstance(anomalies, list):
        return
    for anomaly in anomalies:
        if not isinstance(anomaly, dict):
            continue
        for entry in evidence_entries_from(anomaly.get("evidence")):
            yield "anomaly", anomaly.get("area"), entry


def previous_scores() -> dict[str, dict[str, Any]]:
    doc = load_score_history(resolve(SCORE_HISTORY_REL))
    if not isinstance(doc, dict):
        return {}
    areas = doc.get("areas")
    if not isinstance(areas, dict):
        return {}
    result: dict[str, dict[str, Any]] = {}
    for slug, entry in areas.items():
        scores = entry.get("scores", []) if isinstance(entry, dict) else []
        if not scores or not isinstance(scores[-1], dict):
            continue
        result[slug] = {
            "ux_score": scores[-1].get("ux"),
            "quality_score": scores[-1].get("quality"),
        }
    return result


def validate_evidence(payload: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    final_index = payload.get("final_execution_index")
    prior = previous_scores()
    for source, area_slug, entry in iter_payload_evidence(payload):
        if entry.get("type") == "action":
            ref = entry.get("ref")
            if is_int(ref) and is_int(final_index) and ref > final_index:
                errors.append(
                    {
                        "code": "evidence_ref_out_of_range",
                        "source": source,
                        "area": area_slug,
                        "ref": ref,
                        "final_execution_index": final_index,
                    }
                )
    for area in payload.get("areas", []):
        if not isinstance(area, dict) or not isinstance(area.get("slug"), str):
            continue
        if area.get("skip_reason"):
            continue
        evidence = countable_evidence_entries_from(area.get("evidence"))
        concrete = any(concrete_evidence_ref(entry) for entry in evidence)
        scored_dimensions = []
        for field in ("ux_score", "quality_score"):
            score = area.get(field)
            if is_number(score):
                scored_dimensions.append((field, score))
        if scored_dimensions and len(evidence) < 1:
            errors.append(
                {
                    "code": "evidence_minimum",
                    "area": area["slug"],
                    "required": 1,
                    "actual": len(evidence),
                }
            )
            continue
        for field, score in scored_dimensions:
            previous = prior.get(area["slug"], {}).get(field)
            dropped = is_number(previous) and float(previous) - float(score) >= 1
            if score <= 2 or dropped:
                if len(evidence) < 2 or not concrete:
                    errors.append(
                        {
                            "code": "evidence_minimum",
                            "area": area["slug"],
                            "field": field,
                            "required": 2,
                            "actual": len(evidence),
                            "requires_concrete_ref": True,
                            "score": score,
                            "previous_score": previous,
                        }
                    )
    return errors


def collect_execution_indices(value: Any) -> list[int]:
    values: list[int] = []
    if isinstance(value, dict):
        for key, nested in value.items():
            if key == "execution_index" and is_int(nested):
                values.append(nested)
            else:
                values.extend(collect_execution_indices(nested))
    elif isinstance(value, list):
        for nested in value:
            values.extend(collect_execution_indices(nested))
    return values


def max_payload_index(payload: dict[str, Any], ledger: dict[str, Any]) -> int | None:
    values = collect_execution_indices(payload)
    for area in payload.get("areas", []):
        if not isinstance(area, dict):
            continue
        if is_int(area.get("broad_exploration_start_index")):
            values.append(area["broad_exploration_start_index"])
    for _, _, entry in iter_payload_evidence(payload):
        if entry.get("type") == "action" and is_int(entry.get("ref")):
            values.append(entry["ref"])
    spans, markers, _ = ledger_ranges_and_markers(ledger)
    values.extend(end for _, end in spans)
    values.extend(markers)
    return max(values) if values else None


def validate_final_execution_index(payload: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    final_index = payload.get("final_execution_index")
    if not is_int(final_index):
        return [{"code": "final_index_understated", "final_execution_index": final_index, "max_index": None}]
    max_index = max_payload_index(payload, ledger)
    if max_index is not None and final_index < max_index:
        return [
            {
                "code": "final_index_understated",
                "final_execution_index": final_index,
                "max_index": max_index,
            }
        ]
    return []


def validate_full_ledger_gates(payload: dict[str, Any], ledger: dict[str, Any]) -> list[dict[str, Any]]:
    errors: list[dict[str, Any]] = []
    errors.extend(validate_anomaly_reconciliation(payload, ledger))
    errors.extend(validate_ledger_digest(payload, ledger))
    errors.extend(validate_final_execution_index(payload, ledger))
    errors.extend(validate_ledger_tiling(payload, ledger))
    errors.extend(validate_evidence(payload))
    return errors


PROBE_STREAM_KEYS = ("probes_run", "probes_generated")


def add_probe_once(stream: list[dict[str, Any]], seen: set[tuple[str, str]], probe: dict[str, Any]) -> None:
    area = probe.get("area")
    query = probe.get("query")
    if isinstance(area, str) and isinstance(query, str):
        key = (area, query)
        if key in seen:
            return
        seen.add(key)
    stream.append(probe)


def normalize_probe_payload(payload: Any) -> Any:
    if not isinstance(payload, dict):
        return payload
    areas = payload.get("areas")
    if not isinstance(areas, list):
        return payload
    for stream_key in PROBE_STREAM_KEYS:
        stream: list[dict[str, Any]] = []
        seen: set[tuple[str, str]] = set()
        top_level = payload.get(stream_key)
        if isinstance(top_level, list):
            for probe in top_level:
                if isinstance(probe, dict):
                    add_probe_once(stream, seen, deepcopy(probe))
        for area in areas:
            if not isinstance(area, dict) or not isinstance(area.get("slug"), str):
                continue
            nested = area.pop(stream_key, None)
            if not isinstance(nested, list):
                continue
            for probe in nested:
                if not isinstance(probe, dict):
                    continue
                stamped = deepcopy(probe)
                stamped["area"] = area["slug"]
                add_probe_once(stream, seen, stamped)
        payload[stream_key] = stream
    return payload


def top_level_probe_count(payload: dict[str, Any]) -> int:
    count = 0
    for stream_key in PROBE_STREAM_KEYS:
        stream = payload.get(stream_key)
        if isinstance(stream, list):
            count += sum(1 for item in stream if isinstance(item, dict))
    return count


def tested_area_slugs(payload: dict[str, Any]) -> set[str]:
    slugs: set[str] = set()
    areas = payload.get("areas")
    if not isinstance(areas, list):
        return slugs
    for area in areas:
        if (
            isinstance(area, dict)
            and isinstance(area.get("slug"), str)
            and not area.get("skip_reason")
        ):
            slugs.add(area["slug"])
    return slugs


def expected_probe_absence_warnings(payload: dict[str, Any]) -> list[dict[str, Any]]:
    if top_level_probe_count(payload) > 0:
        return []
    slugs = tested_area_slugs(payload)
    if not slugs:
        return []
    test_file = payload.get("test_file")
    if not isinstance(test_file, str):
        return []
    text = read_text(resolve(test_file))
    if text is None:
        return []
    lines, _ = markdown_lines(text)
    areas_with_expected: list[dict[str, Any]] = []
    for slug in sorted(slugs):
        area_range = section_range(lines, f"### {slug}")
        if area_range is None:
            continue
        table = find_table_in_range(lines, area_range[0], area_range[1], {"Query", "Verify", "Status"})
        if table is None:
            continue
        headers = cells(lines[table])
        expected: list[dict[str, str]] = []
        for index in range(table + 2, table_end(lines, table)):
            row = cells(lines[index])
            if len(row) < len(headers):
                row.extend([""] * (len(headers) - len(row)))
            status = row[headers.index("Status")].strip().lower()
            if status not in {"untested", "failing"}:
                continue
            expected.append(
                {
                    "query": row[headers.index("Query")],
                    "status": status,
                }
            )
        if expected:
            areas_with_expected.append({"area": slug, "probes": expected})
    if not areas_with_expected:
        return []
    return [
        {
            "code": "probes_expected_but_absent",
            "path": test_file,
            "areas": areas_with_expected,
        }
    ]


def validate_payload(payload: Any) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    errors: list[dict[str, Any]] = []
    if not isinstance(payload, dict):
        return [{"code": "payload_not_object"}], []
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
    if errors:
        return errors, []

    marker_present = migration_defaults_marker_present()
    ledger = load_ledger()
    header_matches = ledger_header_matches(ledger, payload)
    if marker_present:
        if header_matches:
            errors.append(
                {
                    "code": "marker_with_live_ledger",
                    "path": LAST_RUN_REL,
                    "ledger": LEDGER_REL,
                }
            )
            return errors, []
        return errors, migration_defaults_warning(payload, ledger)
    if not ledger.get("exists"):
        errors.append({"code": "ledger_missing", "path": LEDGER_REL})
        return errors, []
    if not header_matches:
        header = ledger.get("header") if isinstance(ledger.get("header"), dict) else {}
        errors.append(
            {
                "code": "ledger_foreign",
                "path": LEDGER_REL,
                "run_timestamp": header.get("run_timestamp"),
                "scenario_slug": header.get("scenario_slug"),
                "expected_run_timestamp": payload.get("run_timestamp"),
                "expected_scenario_slug": payload.get("scenario_slug"),
            }
        )
        return errors, []
    errors.extend(validate_full_ledger_gates(payload, ledger))
    return errors, []


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
    payload = normalize_probe_payload(load_json_file(payload_file))
    errors, warnings = validate_payload(payload)
    if errors:
        return print_json_sentinel("VALIDATION-FAILED", errors) or 1
    plan_warnings = expected_probe_absence_warnings(payload)

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
    if warnings:
        print("MIGRATION-DEFAULTS-WARN")
        print(json.dumps(warnings, ensure_ascii=False))
    print("PLANNED")
    if plan_warnings:
        print(json.dumps({"warnings": plan_warnings}, ensure_ascii=False))
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


def status_staged_failures(journal: dict[str, Any]) -> list[dict[str, Any]]:
    failures = []
    for item in journal.get("files", []):
        if item.get("applied"):
            continue
        staged_hash = file_hash(resolve(item["staged_path"]))
        if staged_hash == item.get("staged_sha256"):
            continue
        target_hash = file_hash(resolve(item["path"]))
        if target_hash == item.get("staged_sha256"):
            continue
        failures.append({"path": item["path"], "staged_path": item["staged_path"]})
    return failures


def status_base_mismatches(journal: dict[str, Any]) -> list[dict[str, Any]]:
    mismatches = []
    for item in journal.get("files", []):
        if item.get("applied"):
            continue
        target_hash = file_hash(resolve(item["path"]))
        if target_hash == item.get("staged_sha256"):
            continue
        preimage = item["preimage"]
        if preimage.get("sha256") != target_hash:
            mismatches.append({"path": item["path"], "expected": preimage.get("sha256"), "actual": target_hash})
    return mismatches


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
    validate_staged_files(journal)
    validate_base_hashes(journal)
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


def command_apply(acknowledge_stale: bool = False) -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    check_concurrent(journal)
    check_staleness(journal, acknowledge_stale)
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


def command_resume(acknowledge_stale: bool = False) -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    check_concurrent(journal)
    check_staleness(journal, acknowledge_stale)
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


def command_rollback(acknowledge_stale: bool = False) -> int:
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


def issue_maps_and_shape_warnings(
    issues: list[Any],
) -> tuple[dict[Any, dict[str, Any]], dict[Any, dict[str, Any]], list[dict[str, Any]]]:
    by_id: dict[Any, dict[str, Any]] = {}
    by_bug: dict[Any, dict[str, Any]] = {}
    malformed: list[dict[str, Any]] = []
    for index, item in enumerate(issues):
        if not isinstance(item, dict):
            malformed.append({"index": index, "reason": "entry_not_object"})
            continue
        id_value = item.get("id")
        bug_value = item.get("bug_id")
        has_identity = id_value is not None or bug_value is not None
        has_resolution = isinstance(item.get("number"), int) or isinstance(item.get("duplicate_of"), int)
        if not has_identity or not has_resolution:
            malformed.append(
                {
                    "index": index,
                    "reason": "missing_id_bug_id_or_integer_number",
                    "fields": sorted(item.keys()),
                }
            )
        if id_value is not None:
            by_id[id_value] = item
        if bug_value is not None:
            by_bug[bug_value] = item
    return by_id, by_bug, malformed


def confirmed_issue_number(candidate: dict[str, Any]) -> int | None:
    status = candidate.get("status")
    if not isinstance(status, str):
        return None
    match = re.match(r"^filed #(\d+)$", status)
    return int(match.group(1)) if match else None


def normalized_text(value: Any) -> str:
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9#]+", " ", str(value).lower())).strip()


def text_tokens(value: Any) -> set[str]:
    return {token for token in normalized_text(value).split() if len(token) >= 3}


def direct_anomaly_candidate_match(anomaly: dict[str, Any], candidate: dict[str, Any]) -> bool:
    candidate_id = candidate.get("id")
    candidate_bug = candidate.get("bug_id")
    for field in ("issue_candidate_id", "candidate_id", "issue_id"):
        if anomaly.get(field) is not None and anomaly.get(field) == candidate_id:
            return True
    return anomaly.get("bug_id") is not None and anomaly.get("bug_id") == candidate_bug


def text_anomaly_candidate_match(anomaly: dict[str, Any], candidate: dict[str, Any]) -> bool:
    if anomaly.get("area") and candidate.get("area") and anomaly.get("area") != candidate.get("area"):
        return False
    what = anomaly.get("what", "")
    candidate_text = " ".join(str(candidate.get(key, "")) for key in ("title", "body"))
    normalized_what = normalized_text(what)
    normalized_candidate = normalized_text(candidate_text)
    if normalized_what and normalized_what in normalized_candidate:
        return True
    return len(text_tokens(what) & text_tokens(candidate_text)) >= 3


def candidate_for_anomaly(
    anomaly: dict[str, Any], confirmed_candidates: list[dict[str, Any]]
) -> dict[str, Any] | None:
    direct = [candidate for candidate in confirmed_candidates if direct_anomaly_candidate_match(anomaly, candidate)]
    if len(direct) == 1:
        return direct[0]
    text_matches = [
        candidate for candidate in confirmed_candidates if text_anomaly_candidate_match(anomaly, candidate)
    ]
    return text_matches[0] if len(text_matches) == 1 else None


def backfill_last_run_anomaly_issue_refs(journal: dict[str, Any]) -> bool:
    path = resolve(LAST_RUN_REL)
    if not os.path.exists(path):
        return False
    doc = load_json_file(path)
    if not isinstance(doc, dict) or not isinstance(doc.get("anomalies"), list):
        return False
    confirmed = [
        candidate
        for candidate in journal.get("issue_candidates", [])
        if isinstance(candidate, dict) and confirmed_issue_number(candidate) is not None
    ]
    if not confirmed:
        return False
    changed = False
    for anomaly in doc.get("anomalies", []):
        if (
            not isinstance(anomaly, dict)
            or anomaly.get("disposition") != "filed"
            or str(anomaly.get("issue_ref") or "").strip()
        ):
            continue
        candidate = candidate_for_anomaly(anomaly, confirmed)
        if candidate is None:
            continue
        number = confirmed_issue_number(candidate)
        if number is None:
            continue
        anomaly["issue_ref"] = f"#{number}"
        changed = True
    if changed:
        write_json_atomic(path, doc)
    return changed


def confirm_no_match_warning(
    pending_before: list[dict[str, Any]],
    matched: int,
    malformed: list[dict[str, Any]],
) -> dict[str, Any] | None:
    if not pending_before and not malformed:
        return None
    if matched > 0 and not malformed:
        return None
    if matched > 0 or pending_before or malformed:
        return {
            "matched": matched,
            "expected": len(pending_before),
            "malformed_entries": malformed,
            "expected_shape": '{"issues":[{"id":"<pending id>","number":123}]} or {"issues":[{"bug_id":"<pending bug_id>","number":123}]}',
        }
    return None


def command_confirm_issues(issues_file: str, acknowledge_stale: bool = False) -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    check_concurrent(journal)
    check_staleness(journal, acknowledge_stale)
    if journal.get("state") != "applied":
        print("JOURNAL-NOT-APPLIED")
        return 1
    issues_doc = load_json_file(issues_file)
    issues = issues_doc.get("issues") if isinstance(issues_doc, dict) else None
    if not isinstance(issues, list):
        raise UsageFailure("issues json must contain an issues array")
    pending_before = pending_issues(journal)
    by_id, by_bug, malformed_entries = issue_maps_and_shape_warnings(issues)
    matched = 0
    for candidate in journal.get("issue_candidates", []):
        if not isinstance(candidate, dict):
            continue
        update = by_id.get(candidate.get("id")) or by_bug.get(candidate.get("bug_id"))
        if update is None:
            continue
        if isinstance(update.get("number"), int):
            candidate["status"] = f"filed #{update['number']}"
            matched += 1
        elif isinstance(update.get("duplicate_of"), int):
            candidate["status"] = f"duplicate-of #{update['duplicate_of']}"
            matched += 1
    no_match_warning = confirm_no_match_warning(pending_before, matched, malformed_entries)
    update_bugs_with_issues(journal, by_id)
    backfill_last_run_anomaly_issue_refs(journal)
    journal["state"] = "applied"
    save_journal(journal)
    if pending_issues(journal):
        if no_match_warning is not None:
            print("CONFIRM-NO-MATCH")
            print(json.dumps(no_match_warning, ensure_ascii=False))
        return print_json_sentinel("ISSUES-PENDING", {"pending_issues": pending_issues(journal)})
    result = result_for(journal)
    result["files_written"] = sorted(set(result["files_written"] + ["tests/user-flows/bugs.md"]))
    journal["state"] = "confirmed"
    journal["result"] = result
    save_journal(journal)
    remove_journal()
    if no_match_warning is not None:
        print("CONFIRM-NO-MATCH")
        print(json.dumps(no_match_warning, ensure_ascii=False))
    return print_json_sentinel("CONFIRMED", result)


def status_sentinel(journal: dict[str, Any], expected_scenario: str | None = None) -> tuple[str, int]:
    if expected_scenario and journal.get("scenario_slug") != expected_scenario:
        return f"FOREIGN-JOURNAL {journal.get('scenario_slug')}", 1
    if journal.get("active") and (process_alive(journal.get("active_pid")) or heartbeat_fresh(journal)):
        return f"CONCURRENT {journal.get('active_pid')}", 1
    stale = staleness_sentinel(journal)
    if stale:
        return stale, 1
    staged_failures = status_staged_failures(journal)
    if staged_failures:
        return "STAGED-INTEGRITY-FAILURE", 1
    base_mismatches = status_base_mismatches(journal)
    if base_mismatches:
        return "BASE-HASH-MISMATCH", 1
    state = journal.get("state")
    if state == "applied":
        if pending_issues(journal):
            return "ISSUES-PENDING", 0
        return "APPLIED", 0
    if state in ("staged", "planned", "applying"):
        return "JOURNAL-EXISTS", 0
    if state in ("confirmed", "complete"):
        return "NO-JOURNAL", 0
    return f"UNKNOWN-STATE {state}", 1


def command_status(expected_scenario: str | None = None) -> int:
    journal = load_journal()
    if journal is None:
        print("NO-JOURNAL")
        return 0
    sentinel, code = status_sentinel(journal, expected_scenario)
    print(sentinel)
    print(json.dumps(journal, ensure_ascii=False))
    return code


def parse_acknowledge_stale(args: list[str]) -> tuple[list[str], bool]:
    filtered = []
    acknowledged = False
    for arg in args:
        if arg == "--acknowledge-stale":
            acknowledged = True
        else:
            filtered.append(arg)
    return filtered, acknowledged


def main(argv: list[str]) -> int:
    try:
        if len(argv) < 2:
            return usage()
        command = argv[1]
        if command == "plan" and len(argv) == 3:
            return command_plan(argv[2])
        if command == "apply":
            rest, acknowledged = parse_acknowledge_stale(argv[2:])
            if not rest:
                return command_apply(acknowledged)
        if command == "resume":
            rest, acknowledged = parse_acknowledge_stale(argv[2:])
            if not rest:
                return command_resume(acknowledged)
        if command == "rollback":
            rest, acknowledged = parse_acknowledge_stale(argv[2:])
            if not rest:
                return command_rollback(acknowledged)
        if command == "confirm-issues":
            rest, acknowledged = parse_acknowledge_stale(argv[2:])
            if len(rest) == 1:
                return command_confirm_issues(rest[0], acknowledged)
        if command == "status" and len(argv) in (2, 3):
            return command_status(argv[2] if len(argv) == 3 else None)
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
        tb = exc.__traceback__
        origin = "<unknown>"
        while tb is not None:
            origin = f"{path_context(tb.tb_frame.f_code.co_filename)}:{tb.tb_lineno}"
            tb = tb.tb_next
        stderr(f"unexpected {type(exc).__name__} at {origin}: {exc}")
        return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
