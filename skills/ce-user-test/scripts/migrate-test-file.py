#!/usr/bin/env python3
"""Normalize ce-user-test markdown test files and last-run JSON artifacts.

Usage:
    python3 migrate-test-file.py migrate <test-file>
    python3 migrate-test-file.py migrate-run-json <last-run-json-file>

`migrate <test-file>` prints exactly one of:
    CURRENT                 schema_version is already 11; no bytes written
    MIGRATED <from> -> 11   file was normalized and atomically rewritten
    UNKNOWN-VERSION <n>     schema_version is outside the accepted range
    CORRUPT <reason>        required structure is absent or unreadable

`migrate-run-json <file>` prints:
    CURRENT                 JSON already has the current additive defaults
    MIGRATED-RUN-JSON       JSON was normalized and atomically rewritten
    CORRUPT <reason>        required JSON shape is absent or unreadable

Exit codes:
    0 success, including CURRENT
    1 validation failure (UNKNOWN-VERSION or CORRUPT)
    2 usage error (bad arguments, missing file, unreadable registry)

Diagnostics go to stderr and are prefixed with `migrate-test-file:`.
Writes use tempfile.mkstemp in the target directory plus os.replace.
Pure stdlib; no third-party dependencies.
"""
import json
import os
import re
import sys
import tempfile
from typing import Any, Callable


SCRIPT_NAME = "migrate-test-file"
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


class ValidationFailure(Exception):
    def __init__(self, sentinel: str, reason: str):
        super().__init__(reason)
        self.sentinel = sentinel
        self.reason = reason


class UsageFailure(Exception):
    pass


def stderr(message: str) -> None:
    sys.stderr.write(f"{SCRIPT_NAME}: {message}\n")


def usage() -> int:
    stderr(
        "usage: migrate-test-file.py migrate <test-file> | "
        "migrate-run-json <last-run-json-file>"
    )
    return 2


def read_raw(path: str) -> bytes:
    if not os.path.isfile(path):
        raise UsageFailure(f"file not found: {path}")
    try:
        with open(path, "rb") as f:
            return f.read()
    except OSError as exc:
        raise UsageFailure(f"cannot read file: {exc}") from exc


def decode_utf8(raw: bytes) -> str:
    try:
        return raw.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise ValidationFailure("CORRUPT", f"not utf-8: {exc}") from exc


def detect_eol(text: str) -> str:
    return "\r\n" if "\r\n" in text else "\n"


def split_lines_preserving_final(text: str) -> tuple[list[str], bool]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    final_newline = normalized.endswith("\n")
    if final_newline:
        normalized = normalized[:-1]
    if normalized == "":
        return [], final_newline
    return normalized.split("\n"), final_newline


def join_lines(lines: list[str], final_newline: bool, eol: str) -> str:
    text = "\n".join(lines)
    if final_newline:
        text += "\n"
    if eol != "\n":
        text = text.replace("\n", eol)
    return text


def atomic_write(path: str, text: str) -> None:
    target_dir = os.path.dirname(os.path.abspath(path)) or "."
    fd, tmp = tempfile.mkstemp(
        dir=target_dir,
        prefix=f".{os.path.basename(path)}.",
        suffix=".tmp",
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


def load_registry_value(name: str) -> Any:
    registry_path = os.path.join(os.path.dirname(__file__), "caps-registry.json")
    try:
        with open(registry_path, encoding="utf-8") as f:
            registry = json.load(f)
        return registry["entries"][name]["value"]
    except (OSError, KeyError, TypeError, ValueError) as exc:
        raise UsageFailure(f"cannot read caps registry entry {name}: {exc}") from exc


def parse_frontmatter(lines: list[str]) -> tuple[int, int]:
    if not lines or lines[0].strip() != "---":
        raise ValidationFailure("CORRUPT", "missing frontmatter")
    for index in range(1, len(lines)):
        if lines[index].strip() == "---":
            return 0, index
    raise ValidationFailure("CORRUPT", "unterminated frontmatter")


def frontmatter_has(lines: list[str], fm_end: int, key: str) -> bool:
    pattern = re.compile(rf"^{re.escape(key)}\s*:")
    return any(pattern.match(line) for line in lines[1:fm_end])


def schema_version(lines: list[str], fm_end: int) -> int:
    for line in lines[1:fm_end]:
        match = re.match(r"^schema_version\s*:\s*([^#\s]+)", line)
        if not match:
            continue
        raw = match.group(1).strip().strip('"\'')
        try:
            return int(raw)
        except ValueError as exc:
            raise ValidationFailure("UNKNOWN-VERSION", raw) from exc
    raise ValidationFailure("CORRUPT", "missing schema_version")


def set_schema_version(lines: list[str], fm_end: int) -> None:
    for index in range(1, fm_end):
        if re.match(r"^schema_version\s*:", lines[index]):
            lines[index] = f"schema_version: {CURRENT_SCHEMA_VERSION}"
            return


def append_frontmatter_default(
    lines: list[str], fm_end: int, key: str, rendered_value: str
) -> int:
    if frontmatter_has(lines, fm_end, key):
        return fm_end
    lines.insert(fm_end, f"{key}: {rendered_value}")
    return fm_end + 1


def find_heading(lines: list[str], level: int, title: str) -> int | None:
    needle = f"{'#' * level} {title}".lower()
    for index, line in enumerate(lines):
        if line.strip().lower() == needle:
            return index
    return None


def next_section_index(lines: list[str], start: int) -> int:
    for index in range(start + 1, len(lines)):
        if re.match(r"^##\s+", lines[index]):
            return index
    return len(lines)


def table_start_under_heading(lines: list[str], heading_index: int) -> int | None:
    end = next_section_index(lines, heading_index)
    for index in range(heading_index + 1, end):
        if lines[index].lstrip().startswith("|"):
            return index
    return None


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
    return "| " + " | ".join("-" * max(3, len(header)) for header in headers) + " |"


def table_end(lines: list[str], start: int) -> int:
    end = start
    while end < len(lines) and lines[end].lstrip().startswith("|"):
        end += 1
    return end


def ordered_headers(existing: list[str], desired: list[str]) -> list[str]:
    final = list(existing)
    for header in desired:
        if header in final:
            continue
        desired_index = desired.index(header)
        later = [h for h in desired[desired_index + 1 :] if h in final]
        if later:
            final.insert(final.index(later[0]), header)
            continue
        previous = [h for h in desired[:desired_index] if h in final]
        if previous:
            final.insert(final.index(previous[-1]) + 1, header)
        else:
            final.append(header)
    return final


DefaultFn = Callable[[str, dict[str, str]], str]
TransformFn = Callable[[dict[str, str]], None]


def rewrite_table(
    lines: list[str],
    start: int,
    desired: list[str],
    default_for: DefaultFn,
    transform: TransformFn | None = None,
    rename: dict[str, str] | None = None,
) -> None:
    rename = rename or {}
    original_headers = [rename.get(header, header) for header in cells(lines[start])]
    final_headers = ordered_headers(original_headers, desired)
    end = table_end(lines, start)

    rows: list[list[str]] = []
    for line in lines[start + 2 : end]:
        parsed = cells(line)
        row_map: dict[str, str] = {}
        for index, header in enumerate(original_headers):
            row_map[header] = parsed[index] if index < len(parsed) else ""
        if transform is not None:
            transform(row_map)
        rows.append([row_map.get(header, default_for(header, row_map)) for header in final_headers])

    replacement = [render_row(final_headers), render_separator(final_headers)]
    replacement.extend(render_row(row) for row in rows)
    lines[start:end] = replacement


def ensure_maturity_map(lines: list[str]) -> None:
    areas = find_heading(lines, 2, "Areas")
    if areas is None:
        raise ValidationFailure("CORRUPT", "missing maturity map")
    start = table_start_under_heading(lines, areas)
    if start is None:
        raise ValidationFailure("CORRUPT", "missing maturity map table")
    headers = cells(lines[start])
    if "Area" not in headers or "Status" not in headers:
        raise ValidationFailure("CORRUPT", "maturity map missing Area/Status columns")


def infer_priority(row: dict[str, str]) -> str:
    generated = row.get("Generated From", row.get("Generated", "")).lower()
    if "verification failure" in generated:
        return "P1"
    if "score-based" in generated:
        return "P2"
    return "P2"


def query_transform(row: dict[str, str]) -> None:
    if "Status" in row:
        return
    notes = row.get("Notes", "")
    for status in ("[stable]", "[retired]"):
        if status in notes:
            row["Status"] = status
            row["Notes"] = notes.replace(status, "").strip()
            return


def query_default(header: str, row: dict[str, str]) -> str:
    if header == "Status":
        return row.get("Status", "active")
    return ""


def probe_default(header: str, row: dict[str, str]) -> str:
    if header == "Priority":
        return infer_priority(row)
    if header == "Confidence":
        return "high"
    if header == "Related Bug":
        return "unlinked"
    return ""


def dash_default(header: str, row: dict[str, str]) -> str:
    if header in {
        "Last Quality",
        "Last Time",
        "Delta",
        "Context",
        "Best Area",
        "Worst Area",
    }:
        return EM_DASH
    return ""


AREAS_COLUMNS = [
    "Area",
    "Status",
    "Last Score",
    "Last Quality",
    "Last Time",
    "Consecutive Passes",
    "Notes",
]

RUN_HISTORY_COLUMNS = [
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

QUERY_COLUMNS = ["Query", "Ideal Outcome", "Check", "Status", "Notes"]
MULTI_TURN_COLUMNS = ["Turn", "Query", "Check"]
PROBE_COLUMNS = [
    "Query",
    "Verify",
    "Status",
    "Priority",
    "Confidence",
    "Generated From",
    "Run History",
    "Related Bug",
]
CROSS_AREA_PROBE_COLUMNS = [
    "Trigger Area",
    "Action",
    "Observation Area",
    "Verify",
    "Status",
    "Priority",
    "Confidence",
    "Generated From",
    "Run History",
    "Related Bug",
]

SECTION_BLOCKS = {
    "Cross-Area Probes": [
        "## Cross-Area Probes",
        "",
        render_row(CROSS_AREA_PROBE_COLUMNS),
        render_separator(CROSS_AREA_PROBE_COLUMNS),
    ],
    "Journeys": [
        "## Journeys",
    ],
    "Area Trends": [
        "## Area Trends",
        "",
        "| Area | Trend | Last Score | Delta |",
        "| ---- | ----- | ---------- | ----- |",
    ],
    "UX Opportunities Log": [
        "## UX Opportunities Log",
        "",
        "| ID | Area | Priority | Status | Suggestion |",
        "| -- | ---- | -------- | ------ | ---------- |",
    ],
    "Good Patterns": [
        "## Good Patterns",
        "",
        "| Area | Pattern | First Seen | Last Confirmed |",
        "| ---- | ------- | ---------- | -------------- |",
    ],
}

AREA_DETAIL_BLOCKS = {
    "verify": [
        "**verify:**",
    ],
    "queries": [
        "**Queries:**",
        "",
        render_row(QUERY_COLUMNS),
        render_separator(QUERY_COLUMNS),
    ],
    "multi_turn": [
        "**Multi-turn:**",
        "",
        render_row(MULTI_TURN_COLUMNS),
        render_separator(MULTI_TURN_COLUMNS),
    ],
    "probes": [
        "**Probes:**",
        "",
        render_row(PROBE_COLUMNS),
        render_separator(PROBE_COLUMNS),
    ],
}

MIGRATION_TABLE = [
    {
        "from_version": 1,
        "fills": [
            "Areas.Last Quality",
            "Areas.Last Time",
            "Run History.Delta",
            "Run History.Context",
        ],
    },
    {
        "from_version": 2,
        "fills": [
            "Area Trends section",
            "UX Opportunities Log section",
            "Good Patterns section",
            "Run History.Best Area",
            "Run History.Worst Area",
        ],
    },
    {"from_version": 3, "fills": ["Area verify blocks", "Area Probes tables"]},
    {"from_version": 4, "fills": ["Area Queries tables", "Area Multi-turn tables"]},
    {
        "from_version": 5,
        "fills": [
            "Probes.Priority",
            "Probes.Confidence",
            "Queries.Status",
            "frontmatter.seams_read",
        ],
    },
    {
        "from_version": 6,
        "fills": [
            "Cross-Area Probes section",
            "frontmatter.mcp_restart_threshold",
            "Probes.Related Bug",
        ],
    },
    {
        "from_version": 7,
        "fills": [
            "Area weakness_class",
            "last-run novelty_fingerprints",
            "last-run adversarial_browser",
        ],
    },
    {"from_version": 8, "fills": ["Journeys section"]},
    {"from_version": 9, "fills": ["last-run probe execution ordering stays absent"]},
    {
        "from_version": 10,
        "fills": [
            "last-run areas[].evidence",
            "last-run anomalies[]",
            "last-run final_execution_index",
            "last-run schema_version + migration_defaults_applied marker",
        ],
    },
    {"from_version": 11, "fills": []},
]


def rewrite_known_tables(lines: list[str]) -> None:
    index = 0
    while index < len(lines):
        if not lines[index].lstrip().startswith("|"):
            index += 1
            continue
        header = cells(lines[index])
        if not header:
            index += 1
            continue
        if "Area" in header and "Status" in header and "Last Score" in header:
            rewrite_table(lines, index, AREAS_COLUMNS, dash_default)
        elif "Date" in header and "Areas Tested" in header and "Quality Avg" in header:
            rewrite_table(lines, index, RUN_HISTORY_COLUMNS, dash_default)
        elif "Query" in header and "Ideal Outcome" in header and "Check" in header:
            rewrite_table(lines, index, QUERY_COLUMNS, query_default, query_transform)
        elif "Query" in header and "Verify" in header and "Status" in header:
            rewrite_table(
                lines,
                index,
                PROBE_COLUMNS,
                probe_default,
                rename={"Generated": "Generated From", "Related bug": "Related Bug"},
            )
        elif (
            "Trigger Area" in header
            and "Observation Area" in header
            and "Verify" in header
        ):
            rewrite_table(lines, index, CROSS_AREA_PROBE_COLUMNS, probe_default)
        index = table_end(lines, index) + 1


def area_blocks(lines: list[str]) -> list[tuple[int, int]]:
    details = find_heading(lines, 2, "Area Details")
    if details is None:
        return []
    end = next_section_index(lines, details)
    starts = [
        index
        for index in range(details + 1, end)
        if re.match(r"^###\s+", lines[index])
    ]
    blocks: list[tuple[int, int]] = []
    for offset, start in enumerate(starts):
        block_end = starts[offset + 1] if offset + 1 < len(starts) else end
        blocks.append((start, block_end))
    return blocks


def block_has(block: list[str], marker: str) -> bool:
    return any(line.strip().lower().startswith(marker.lower()) for line in block)


def ensure_area_detail_blocks(lines: list[str], from_version: int) -> list[str]:
    if find_heading(lines, 2, "Area Details") is None:
        return lines
    additions_for_version: list[tuple[str, str]] = []
    if from_version <= 3:
        additions_for_version.extend(
            [("verify", "**verify:**"), ("probes", "**Probes:**")]
        )
    if from_version <= 4:
        additions_for_version.extend(
            [("queries", "**Queries:**"), ("multi_turn", "**Multi-turn:**")]
        )
    if not additions_for_version:
        return lines

    result: list[str] = []
    index = 0
    blocks = area_blocks(lines)
    block_by_start = {start: end for start, end in blocks}
    while index < len(lines):
        if index not in block_by_start:
            result.append(lines[index])
            index += 1
            continue
        end = block_by_start[index]
        block = lines[index:end]
        result.extend(block)
        pending: list[str] = []
        for name, marker in additions_for_version:
            if block_has(block, marker):
                continue
            if pending and pending[-1] != "":
                pending.append("")
            pending.extend(AREA_DETAIL_BLOCKS[name])
            pending.append("")
        if pending:
            if result and result[-1] != "":
                result.append("")
            while pending and pending[-1] == "":
                pending.pop()
            result.extend(pending)
        index = end
    return result


def ensure_sections(lines: list[str]) -> None:
    for title, block in SECTION_BLOCKS.items():
        if find_heading(lines, 2, title) is not None:
            continue
        if lines and lines[-1] != "":
            lines.append("")
        lines.extend(block)


def apply_markdown_migration(lines: list[str], from_version: int, fm_end: int) -> None:
    # Keep this table in code so version-specific fills have one deterministic
    # home; functions below enact the table mechanically.
    _ = MIGRATION_TABLE

    set_schema_version(lines, fm_end)
    if from_version == 10:
        return
    fm_end = append_frontmatter_default(lines, fm_end, "cli_test_command", '""')
    if from_version <= 5:
        fm_end = append_frontmatter_default(lines, fm_end, "seams_read", "false")
    if from_version <= 6:
        threshold = load_registry_value("mcp_restart_threshold")
        fm_end = append_frontmatter_default(
            lines, fm_end, "mcp_restart_threshold", str(threshold)
        )

    rewrite_known_tables(lines)
    lines[:] = ensure_area_detail_blocks(lines, from_version)
    rewrite_known_tables(lines)
    ensure_sections(lines)


def do_migrate(path: str) -> int:
    raw = read_raw(path)
    text = decode_utf8(raw)
    eol = detect_eol(text)
    lines, final_newline = split_lines_preserving_final(text)
    _, fm_end = parse_frontmatter(lines)
    version = schema_version(lines, fm_end)
    if version < 1 or version > CURRENT_SCHEMA_VERSION:
        raise ValidationFailure("UNKNOWN-VERSION", str(version))
    ensure_maturity_map(lines)

    if version == CURRENT_SCHEMA_VERSION:
        print("CURRENT")
        return 0

    apply_markdown_migration(lines, version, fm_end)
    migrated = join_lines(lines, final_newline, eol)
    atomic_write(path, migrated)
    print(f"MIGRATED {version} -> {CURRENT_SCHEMA_VERSION}")
    return 0


RUN_JSON_ARRAY_DEFAULTS = {
    "anomalies": [],
    "ux_opportunities": [],
    "good_patterns": [],
    "verification_results": [],
    "probes_run": [],
    "probes_generated": [],
    "cross_area_probes_run": [],
    "journeys_run": [],
    "novelty_log": [],
    "stable_queries_rotated": [],
}

RUN_JSON_AREA_DEFAULTS = {
    "tactical_note": None,
    "confirmed_selectors": {},
    "weakness_class": None,
    "adversarial_browser": False,
    "adversarial_trigger": None,
    "evidence": [],
}

RUN_JSON_SCALAR_DEFAULTS = {
    "final_execution_index": None,
}

RUN_JSON_V11_DEFAULT_FIELDS = [
    "areas[].evidence",
    "anomalies[]",
    "final_execution_index",
    "schema_version",
]


def validate_last_run(doc: Any) -> dict[str, Any]:
    if not isinstance(doc, dict):
        raise ValidationFailure("CORRUPT", "last-run JSON root is not an object")
    if not isinstance(doc.get("run_timestamp"), str):
        raise ValidationFailure("CORRUPT", "missing run_timestamp")
    if not isinstance(doc.get("completed"), bool):
        raise ValidationFailure("CORRUPT", "missing completed boolean")
    if not isinstance(doc.get("scenario_slug"), str):
        raise ValidationFailure("CORRUPT", "missing scenario_slug")
    areas = doc.get("areas")
    if not isinstance(areas, list):
        raise ValidationFailure("CORRUPT", "areas is not an array")
    for area in areas:
        if not isinstance(area, dict) or not isinstance(area.get("slug"), str):
            raise ValidationFailure("CORRUPT", "area entry missing slug")
    return doc


def normalize_last_run(doc: dict[str, Any]) -> bool:
    changed = False
    incoming_schema_version = doc.get("schema_version")
    stamp_migration_marker = not (
        type(incoming_schema_version) is int
        and incoming_schema_version >= CURRENT_SCHEMA_VERSION
    )
    migration_default_fields: list[str] = []

    for key, value in RUN_JSON_ARRAY_DEFAULTS.items():
        if key not in doc:
            doc[key] = list(value)
            changed = True
            if stamp_migration_marker and key == "anomalies":
                migration_default_fields.append("anomalies[]")
    for key, value in RUN_JSON_SCALAR_DEFAULTS.items():
        if key not in doc:
            doc[key] = value
            changed = True
            if stamp_migration_marker and key == "final_execution_index":
                migration_default_fields.append("final_execution_index")
    if "novelty_fingerprints" not in doc:
        doc["novelty_fingerprints"] = {}
        changed = True
    if "disconnects" not in doc:
        doc["disconnects"] = {"count": 0, "contexts": []}
        changed = True
    elif not isinstance(doc["disconnects"], dict):
        raise ValidationFailure("CORRUPT", "disconnects is not an object")

    for key, value in RUN_JSON_AREA_DEFAULTS.items():
        for area in doc["areas"]:
            if key not in area:
                if isinstance(value, dict):
                    area[key] = dict(value)
                elif isinstance(value, list):
                    area[key] = list(value)
                else:
                    area[key] = value
                changed = True
                if stamp_migration_marker and key == "evidence":
                    if "areas[].evidence" not in migration_default_fields:
                        migration_default_fields.append("areas[].evidence")
    if stamp_migration_marker:
        if doc.get("schema_version") != CURRENT_SCHEMA_VERSION:
            doc["schema_version"] = CURRENT_SCHEMA_VERSION
            changed = True
        migration_default_fields = [
            field
            for field in RUN_JSON_V11_DEFAULT_FIELDS
            if field == "schema_version" or field in migration_default_fields
        ]
        if doc.get("migration_defaults_applied") != migration_default_fields:
            doc["migration_defaults_applied"] = migration_default_fields
            changed = True
    return changed


def do_migrate_run_json(path: str) -> int:
    raw = read_raw(path)
    try:
        doc = json.loads(decode_utf8(raw))
    except json.JSONDecodeError as exc:
        raise ValidationFailure("CORRUPT", f"invalid json: {exc}") from exc
    doc = validate_last_run(doc)
    changed = normalize_last_run(doc)
    if not changed:
        print("CURRENT")
        return 0
    atomic_write(path, json.dumps(doc, indent=2, ensure_ascii=False) + "\n")
    print("MIGRATED-RUN-JSON")
    return 0


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        return usage()
    command, path = argv[1], argv[2]
    try:
        if command == "migrate":
            return do_migrate(path)
        if command == "migrate-run-json":
            return do_migrate_run_json(path)
        return usage()
    except UsageFailure as exc:
        stderr(str(exc))
        return 2
    except ValidationFailure as exc:
        if exc.sentinel == "UNKNOWN-VERSION":
            print(f"UNKNOWN-VERSION {exc.reason}")
            stderr(f"UNKNOWN-VERSION {exc.reason}")
        else:
            print(f"CORRUPT {exc.reason}")
            stderr(f"CORRUPT {exc.reason}")
        return 1


if __name__ == "__main__":
    sys.exit(main(sys.argv))
