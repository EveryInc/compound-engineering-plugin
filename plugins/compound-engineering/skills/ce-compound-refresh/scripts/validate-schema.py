#!/usr/bin/env python3
"""Validate ce-compound docs/solutions/ frontmatter against schema.yaml.

Usage:
    python3 validate-schema.py <doc-path>

Exit codes:
    0 — validation passes
    1 — validation failure (diagnostics on stderr)
    2 — usage error (bad arguments, missing file)

Scope:
    Validates frontmatter against the canonical schema defined in
    references/schema.yaml: required fields, enum values, date format,
    array length bounds, and track-specific requirements.

Schema resolution: the script looks for schema.yaml in the same directory
as this script (references/schema.yaml relative to the script's location).
This keeps the path self-contained when converted for other platforms.

Pure-stdlib (no PyYAML or other third-party deps). Parses frontmatter with
simple line-based logic to match validate-frontmatter.py's approach.
"""

import os
import re
import sys

# ---------------------------------------------------------------------------
# Schema definition (mirrors references/schema.yaml)
# We inline it here so the script is fully self-contained when copied to
# other platforms by the converter CLI.
# ---------------------------------------------------------------------------

PROBLEM_TYPES_BUG = {
    "build_error",
    "test_failure",
    "runtime_error",
    "performance_issue",
    "database_issue",
    "security_issue",
    "ui_bug",
    "integration_issue",
    "logic_error",
}

PROBLEM_TYPES_KNOWLEDGE = {
    "best_practice",
    "documentation_gap",
    "workflow_issue",
    "developer_experience",
    "architecture_pattern",
    "design_pattern",
    "tooling_decision",
    "convention",
}

PROBLEM_TYPES = PROBLEM_TYPES_BUG | PROBLEM_TYPES_KNOWLEDGE

# category → directory mapping (used for category field when present)
CATEGORY_MAP = {
    "build_error": "build-errors",
    "test_failure": "test-failures",
    "runtime_error": "runtime-errors",
    "performance_issue": "performance-issues",
    "database_issue": "database-issues",
    "security_issue": "security-issues",
    "ui_bug": "ui-bugs",
    "integration_issue": "integration-issues",
    "logic_error": "logic-errors",
    "developer_experience": "developer-experience",
    "workflow_issue": "workflow-issues",
    "best_practice": "best-practices",
    "documentation_gap": "documentation-gaps",
    "architecture_pattern": "architecture-patterns",
    "design_pattern": "design-patterns",
    "tooling_decision": "tooling-decisions",
    "convention": "conventions",
}

COMPONENTS = {
    "rails_model",
    "rails_controller",
    "rails_view",
    "service_object",
    "background_job",
    "database",
    "frontend_stimulus",
    "hotwire_turbo",
    "email_processing",
    "brief_system",
    "assistant",
    "authentication",
    "payments",
    "development_workflow",
    "testing_framework",
    "documentation",
    "tooling",
    "converter-cli",
    "plugin-development",
    "markdown-rendering",
    "cli",
    "agents",
    "marketplace",
}

SEVERITIES = {"critical", "high", "medium", "low"}

ROOT_CAUSES = {
    "missing_association",
    "missing_include",
    "missing_index",
    "wrong_api",
    "scope_issue",
    "thread_violation",
    "async_timing",
    "memory_leak",
    "config_error",
    "logic_error",
    "test_isolation",
    "missing_validation",
    "missing_permission",
    "missing_workflow_step",
    "inadequate_documentation",
    "missing_tooling",
    "incomplete_setup",
}

RESOLUTION_TYPES = {
    "code_fix",
    "migration",
    "config_change",
    "test_fix",
    "dependency_update",
    "environment_setup",
    "workflow_improvement",
    "documentation_update",
    "tooling_addition",
    "seed_data_update",
}

SHARED_REQUIRED_FIELDS = {"module", "date", "problem_type", "component", "severity"}
BUG_REQUIRED_FIELDS = {"symptoms", "root_cause", "resolution_type"}

ARRAY_FIELD_BOUNDS = {
    "symptoms": (1, 5),
    "applies_when": (0, 5),
    "tags": (0, 8),
    "related_components": (0, None),
}

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
RAILS_VERSION_RE = re.compile(r"^\d+\.\d+\.\d+$")

YAML_RESERVED_STARTS = {"`", "[", "*", "&", "!", "|", ">", "%", "@", "?"}
YAML_RESERVED_CONTAINS = ": "


def parse_frontmatter(text):
    """Parse simple YAML-ish frontmatter lines into a dict."""
    lines = text.split("\n")
    if not lines or lines[0].rstrip() != "---":
        raise ValueError("file does not start with '---' frontmatter delimiter")

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].rstrip() == "---":
            end_idx = i
            break

    if end_idx is None:
        raise ValueError(
            "frontmatter not closed (no '---' line after opening delimiter)"
        )

    fm_text = "\n".join(lines[1:end_idx])
    fm = _parse_yaml_like(fm_text)
    return fm, 2, end_idx


def _parse_yaml_like(fm_text):
    """Minimal YAML-like parser for frontmatter scalars and simple arrays."""
    result = {}
    current_key = None
    current_list = []
    in_list = False

    for raw_line in fm_text.split("\n"):
        stripped = raw_line.lstrip()
        if not stripped or stripped.startswith("#"):
            if in_list:
                result[current_key] = current_list
                current_list = []
                in_list = False
            continue

        if in_list:
            if stripped.startswith("- "):
                item = stripped[2:].strip()
                current_list.append(item)
                continue
            else:
                result[current_key] = current_list
                current_list = []
                in_list = False
                # fall through to parse this line as scalar key

        if ":" not in stripped:
            continue

        key, _, val = raw_line.partition(":")
        key = key.strip()
        val_stripped = val.strip()

        if not val_stripped:
            in_list = True
            current_key = key
            current_list = []
            continue

        # Skip nested scalars (indented lines)
        if raw_line.startswith((" ", "\t")):
            continue

        # Pre-quoted or flow-collection values
        first = val_stripped[0]
        if first in ('"', "'"):
            result[key] = val_stripped[1:-1]
        elif first in ("[", "{"):
            result[key] = _parse_flow_collection(val_stripped)
        else:
            result[key] = val_stripped

    if in_list:
        result[current_key] = current_list

    return result


def _parse_flow_collection(text):
    """Parse a simple YAML flow collection string like [a, b, c]."""
    inner = text.strip()[1:-1]
    items = []
    for part in inner.split(","):
        part = part.strip()
        if not part:
            continue
        if part[0] in ('"', "'"):
            items.append(part.strip("\"'"))
        else:
            items.append(part)
    return items


def usage_fail(msg):
    sys.stderr.write("validate-schema: {}\n".format(msg))
    sys.exit(2)


def get_track(fm):
    problem_type = fm.get("problem_type")
    if isinstance(problem_type, str):
        if problem_type in PROBLEM_TYPES_BUG:
            return "bug"
        if problem_type in PROBLEM_TYPES_KNOWLEDGE:
            return "knowledge"
    return None


def validate(fm, file_path, line_offset=0):
    issues = []

    # Determine track
    track = get_track(fm)
    if track is None:
        issues.append(
            "line {}: 'problem_type' value '{}' ".format(
                line_offset, fm.get("problem_type")
            )
            + "is not a recognized enum value"
        )

    # Required fields (both tracks)
    for field in SHARED_REQUIRED_FIELDS:
        if field not in fm:
            issues.append(
                "line {}: missing required field '{}'".format(line_offset, field)
            )

    # problem_type enum
    problem_type = fm.get("problem_type")
    if isinstance(problem_type, str) and problem_type not in PROBLEM_TYPES:
        issues.append(
            "line {}: 'problem_type' value '{}' is not in ".format(
                line_offset, problem_type
            )
            + "allowed enum values: {}".format(sorted(PROBLEM_TYPES))
        )

    # component enum
    component = fm.get("component")
    if isinstance(component, str) and component not in COMPONENTS:
        issues.append(
            "line {}: 'component' value '{}' is not in ".format(line_offset, component)
            + "allowed enum values: {}".format(sorted(COMPONENTS))
        )

    # severity enum
    severity = fm.get("severity")
    if isinstance(severity, str) and severity not in SEVERITIES:
        issues.append(
            "line {}: 'severity' value '{}' is not in ".format(line_offset, severity)
            + "allowed enum values: {}".format(sorted(SEVERITIES))
        )

    # date format
    date_val = fm.get("date")
    if isinstance(date_val, str):
        if not DATE_RE.match(date_val):
            issues.append(
                "line {}: 'date' value '{}' does not match ".format(
                    line_offset, date_val
                )
                + "YYYY-MM-DD format"
            )
    elif "date" in fm:
        issues.append(
            "line {}: 'date' must be a string in YYYY-MM-DD format".format(line_offset)
        )

    # Track-specific required fields
    if track == "bug":
        for field in BUG_REQUIRED_FIELDS:
            if field not in fm:
                issues.append(
                    "line {}: missing required bug-track field '{}'".format(
                        line_offset, field
                    )
                )

        root_cause = fm.get("root_cause")
        if isinstance(root_cause, str) and root_cause not in ROOT_CAUSES:
            issues.append(
                "line {}: 'root_cause' value '{}' is not in ".format(
                    line_offset, root_cause
                )
                + "allowed enum values: {}".format(sorted(ROOT_CAUSES))
            )

        resolution = fm.get("resolution_type")
        if isinstance(resolution, str) and resolution not in RESOLUTION_TYPES:
            issues.append(
                "line {}: 'resolution_type' value '{}' is not in ".format(
                    line_offset, resolution
                )
                + "allowed enum values: {}".format(sorted(RESOLUTION_TYPES))
            )

        rails_version = fm.get("rails_version")
        if rails_version is not None:
            if isinstance(rails_version, str) and not RAILS_VERSION_RE.match(
                rails_version
            ):
                issues.append(
                    "line {}: 'rails_version' value '{}' ".format(
                        line_offset, rails_version
                    )
                    + "does not match X.Y.Z format"
                )

    # Array field bounds
    for field, (min_items, max_items) in ARRAY_FIELD_BOUNDS.items():
        if field not in fm:
            continue
        value = fm[field]
        if not isinstance(value, list):
            issues.append(
                "line {}: '{}' must be an array, got {}".format(
                    line_offset, field, type(value).__name__
                )
            )
            continue
        count = len(value)
        if min_items is not None and count < min_items:
            issues.append(
                "line {}: '{}' has {} items, minimum {} required".format(
                    line_offset, field, count, min_items
                )
            )
        if max_items is not None and count > max_items:
            issues.append(
                "line {}: '{}' has {} items, maximum {} allowed".format(
                    line_offset, field, count, max_items
                )
            )

    return issues


def main(argv):
    if len(argv) != 2:
        usage_fail("usage: {} <doc-path>".format(os.path.basename(argv[0])))

    doc_path = argv[1]
    if not os.path.isfile(doc_path):
        usage_fail("file not found: {}".format(doc_path))

    try:
        with open(doc_path) as f:
            text = f.read()
    except OSError as e:
        usage_fail("cannot read file: {}".format(e))

    issues = []
    try:
        fm, start_line, _end = parse_frontmatter(text)
    except ValueError as e:
        sys.stderr.write("FAIL: {}\n  {}\n".format(doc_path, e))
        return 1

    issues = validate(fm, doc_path, line_offset=start_line)

    if issues:
        sys.stderr.write("FAIL: {}\n".format(doc_path))
        for issue in issues:
            sys.stderr.write("  {}\n".format(issue))
        return 1

    print("OK: {}".format(doc_path))
    return 0


if __name__ == "__main__":
    import sys as _sys

    sys.exit(main(_sys.argv))
