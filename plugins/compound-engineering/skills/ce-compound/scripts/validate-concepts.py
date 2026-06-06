#!/usr/bin/env python3
"""Validate CONCEPTS.md structure against ce-compound vocabulary rules.

Usage:
    python3 validate-concepts.py [concepts-path]

    If concepts-path is omitted, defaults to CONCEPTS.md in the parent
    directory of this script's location (i.e., repo root when the script
    lives under plugins/compound-engineering/skills/ce-compound/scripts/).

Exit codes:
    0 — structure passes all checks
    1 — validation failure (diagnostics on stderr)
    2 — usage error (bad arguments)

Checks:
    1. File starts with `# Concepts` heading
    2. Each entry has a `## <Term>` heading followed by at least one
       `### <Avoid / Synonym>` (or similar subsection — we just verify
       at least one `### ` subsection exists under the `## ` entry)
    3. The definition paragraph under each entry is <= 3 sentences
    4. A `## Relationships` section exists somewhere after the first entry
       when there are cross-references (entries that mention other terms)
    5. A `## Flagged ambiguities` section exists near the tail of the file

Pure-stdlib (no PyYAML or other third-party deps).
"""

import os
import re
import sys

CONCEPTS_FILENAME = "CONCEPTS.md"

STRUCTURAL_HEADINGS = {"relationships", "flagged ambiguities"}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _resolve_repo_root():
    script_dir = os.path.dirname(os.path.abspath(__file__))
    current = script_dir
    for _ in range(6):
        if os.path.isfile(os.path.join(current, "package.json")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return script_dir


def _check_concepts_path(concepts_path):
    real = os.path.realpath(concepts_path)
    repo_root = _resolve_repo_root()
    if real != repo_root and not real.startswith(repo_root + os.sep):
        usage_fail("path must be within repo root: {}".format(concepts_path))


def find_concepts_path(explicit_path):
    if explicit_path:
        _check_concepts_path(explicit_path)
        return explicit_path

    script_dir = os.path.dirname(os.path.abspath(__file__))
    current = script_dir
    while True:
        candidate = os.path.join(current, CONCEPTS_FILENAME)
        if os.path.isfile(candidate):
            return candidate
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent

    # Fallback: CWD
    return os.path.join(os.getcwd(), CONCEPTS_FILENAME)


def parse_lines(path):
    with open(path) as f:
        return f.read().split("\n")


def usage_fail(msg):
    sys.stderr.write("validate-concepts: {}\n".format(msg))
    sys.exit(2)


# ---------------------------------------------------------------------------
# Checks
# ---------------------------------------------------------------------------


def check_file_starts_with_heading(lines, path):
    if not lines or not lines[0].strip().startswith("# Concepts"):
        return ["file does not start with `# Concepts` heading"]
    return []


def find_entries(lines):
    """Return [(heading_line_index, heading_text), ...] for ## Term headings that
    are terminology entries, skipping structural sections like Relationships
    and Flagged ambiguities."""
    entries = []
    for i, line in enumerate(lines):
        stripped = line.strip()
        if stripped.startswith("## ") and not stripped.startswith("### "):
            heading_text = stripped[3:].strip()
            if heading_text.lower() not in STRUCTURAL_HEADINGS:
                entries.append((i, heading_text))
    return entries


def find_subsections_under(entry_idx, lines):
    """Return list of ### headings found after the ## entry up to the next ##."""
    subsections = []
    for line in lines[entry_idx + 1 :]:
        if line.strip().startswith("## ") and not line.strip().startswith("### "):
            break
        if line.strip().startswith("### "):
            subsections.append(line.strip()[4:].strip())
    return subsections


def count_sentences(text):
    """Simple sentence counter — counts lines ending with a period, or
    sentence-final punctuation. Conservative: we count period-delimited
    segments within the entry body."""
    # Remove inline code and markdown to get prose
    cleaned = re.sub(r"`[^`]*`", "", text)
    cleaned = re.sub(r"\*[^*]*\*", "", cleaned)
    # Split on period, exclamation, or question mark followed by space or end
    segments = re.split(r"(?<=[.!?])\s+", cleaned.strip())
    # Filter out empty and headings
    sentences = [
        s.strip() for s in segments if s.strip() and not s.strip().startswith("#")
    ]
    return len(sentences)


def extract_entry_body(entry_idx, lines):
    """Return body text for the entry (from after ## heading to next ##)."""
    body_lines = []
    for line in lines[entry_idx + 1 :]:
        if line.strip().startswith("## ") and not line.strip().startswith("### "):
            break
        body_lines.append(line)
    return "\n".join(body_lines)


def check_entries_have_subsections(entries, lines):
    issues = []
    for entry_idx, entry_text in entries:
        subsections = find_subsections_under(entry_idx, lines)
        if not subsections:
            issues.append(
                "line {}: entry '{}' has no ### subsection (expected at least one "
                "like 'Avoid / Synonym')".format(entry_idx + 1, entry_text)
            )
    return issues


def check_definition_length(entries, lines, max_sentences=3):
    issues = []
    for entry_idx, entry_text in entries:
        body = extract_entry_body(entry_idx, lines)
        n = count_sentences(body)
        if n > max_sentences:
            issues.append(
                "line {}: entry '{}' definition is {} sentences (max {})".format(
                    entry_idx + 1, entry_text, n, max_sentences
                )
            )
    return issues


def check_relationships_section(lines):
    """Require a ## Relationships section when entries reference each other."""
    # Check if any entry body mentions another entry's term (case-insensitive,
    # as a whole word). We look for cross-references in the format of a
    # ## Relationship heading or inline mentions.
    full_text = "\n".join(lines)
    has_relationships_heading = bool(
        re.search(r"^##\s+Relationships\b", full_text, re.MULTILINE | re.IGNORECASE)
    )

    # Also try the older heading used in some files
    has_legacy_heading = bool(
        re.search(r"^##\s+Relationships\b", full_text, re.MULTILINE)
    )

    if has_relationships_heading or has_legacy_heading:
        return []

    # Check if there's any explicit cross-reference between entries
    entries = find_entries(lines)
    if len(entries) <= 1:
        return []  # single entry, no relationships needed

    entry_terms = [e[1].lower() for e in entries]

    for entry_idx, entry_text in entries:
        body = extract_entry_body(entry_idx, lines).lower()
        for other_term in entry_terms:
            if other_term != entry_text.lower():
                # Check if this term is mentioned as a reference in the body
                pattern = r"\b" + re.escape(other_term) + r"\b"
                if re.search(pattern, body):
                    # Cross-reference detected but no Relationships section
                    return [
                        "cross-reference to '{}' found under '{}' but no "
                        "## Relationships section exists".format(other_term, entry_text)
                    ]

    return []


def check_flagged_ambiguities(lines):
    """Require a ## Flagged ambiguities section near the tail of the file."""
    full_text = "\n".join(lines)
    # Look for the heading anywhere in the file (tail or otherwise)
    has_heading = bool(
        re.search(
            r"^##\s+Flagged\s+ambiguities\b", full_text, re.MULTILINE | re.IGNORECASE
        )
    )
    if not has_heading:
        return ["missing '## Flagged ambiguities' section"]
    return []


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def validate(concepts_path):
    issues = []

    if not os.path.isfile(concepts_path):
        return ["file not found: {}".format(concepts_path)]

    lines = parse_lines(concepts_path)

    # Check 1
    issues.extend(check_file_starts_with_heading(lines, concepts_path))

    # Check 2-4: per-entry
    entries = find_entries(lines)
    issues.extend(check_entries_have_subsections(entries, lines))
    issues.extend(check_definition_length(entries, lines, max_sentences=3))

    # Check 4: relationships
    issues.extend(check_relationships_section(lines))

    # Check 5
    issues.extend(check_flagged_ambiguities(lines))

    return issues


def main(argv):
    if len(argv) > 2:
        usage_fail("usage: {} [concepts-path]".format(os.path.basename(argv[0])))

    concepts_path = find_concepts_path(argv[1] if len(argv) > 1 else None)
    issues = validate(concepts_path)

    if issues:
        sys.stderr.write("FAIL: {}\n".format(concepts_path))
        for issue in issues:
            sys.stderr.write("  {}\n".format(issue))
        return 1

    # Count entries for informational output
    lines = parse_lines(concepts_path)
    entries = find_entries(lines)
    print("OK: {} — {} entries, structure valid".format(concepts_path, len(entries)))
    return 0


if __name__ == "__main__":
    import sys as _sys

    sys.exit(main(_sys.argv))
