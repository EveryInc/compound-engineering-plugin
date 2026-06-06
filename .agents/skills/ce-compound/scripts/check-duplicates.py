#!/usr/bin/env python3
"""Pre-filter duplicate docs for ce-compound's Related Docs Finder.

Usage:
    python3 check-duplicates.py <doc-path>
    python3 check-duplicates.py <doc-path> --top-k <n>
    python3 check-duplicates.py <doc-path> --min-score <threshold>

Exit codes:
    0 — written JSON array to stdout (may be empty)
    1 — file error or parse failure (diagnostics on stderr)
    2 — usage error

Output:
    JSON array of candidate matches sorted by descending score, each entry
    containing:
        path        Relative path to the candidate doc
        score       Similarity score in [0.0, 1.0]
        matched_by  List of dimensions that contributed to the score

Scoring:
    title   — Jaccard similarity on significant words (stopwords removed)
    tags    — Intersection-over-union of tag sets
    module  — Exact match (1.0) or 0.0
    component — Exact match (1.0) or 0.0

Dimension weights:
    title:   0.40, tags: 0.25, module: 0.20, component: 0.15

This script only PRE-SELECTS candidates. The orchestrating agent retains
final overlap judgment (High/Moderate/Low). Do not use score alone to
decide whether two docs describe the same problem.

Pure-stdlib (no PyYAML or other third-party deps). Runs in <100ms typical.
"""

import json
import os
import re
import sys

# ---------------------------------------------------------------------------
# Path resolution
# ---------------------------------------------------------------------------


def _resolve_docs_dir() -> str:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    current = script_dir
    while True:
        candidate = os.path.join(current, "docs", "solutions")
        if os.path.isdir(candidate):
            return os.path.normpath(candidate)
        parent = os.path.dirname(current)
        if parent == current:
            break
        current = parent
    return os.path.normpath(
        os.path.join(script_dir, "..", "..", "..", "..", "..", "docs", "solutions")
    )


DOCS_DIR = _resolve_docs_dir()


def _check_doc_path(doc_path):
    real = os.path.realpath(doc_path)
    docs_dir = _resolve_docs_dir()
    if not (real.startswith(docs_dir + os.sep) or real == docs_dir):
        usage_fail("path must be under docs/solutions/: {}".format(doc_path))


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

DOCS_DIR = _resolve_docs_dir()

DEFAULT_TOP_K = 5
DEFAULT_MIN_SCORE = 0.0

WEIGHTS = {
    "title": 0.40,
    "tags": 0.25,
    "module": 0.20,
    "component": 0.15,
}

STOPWORDS = {
    "a",
    "an",
    "the",
    "and",
    "or",
    "but",
    "in",
    "on",
    "at",
    "to",
    "for",
    "of",
    "is",
    "are",
    "was",
    "were",
    "be",
    "been",
    "being",
    "have",
    "has",
    "had",
    "do",
    "does",
    "did",
    "will",
    "would",
    "could",
    "should",
    "may",
    "might",
    "shall",
    "can",
    "this",
    "that",
    "these",
    "those",
    "it",
    "its",
    "with",
    "from",
    "by",
    "not",
    "no",
    "nor",
    "as",
    "if",
    "then",
    "than",
    "too",
    "very",
    "just",
    "because",
    "so",
    "up",
    "down",
    "out",
    "about",
    "into",
    "over",
    "after",
    "new",
}

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def parse_frontmatter(text):
    """Parse simple YAML-ish frontmatter. Returns (fm_dict, error_string | None)."""
    lines = text.split("\n")
    if not lines or lines[0].rstrip() != "---":
        return None, "file does not start with '---' frontmatter delimiter"

    end_idx = None
    for i in range(1, len(lines)):
        if lines[i].rstrip() == "---":
            end_idx = i
            break

    if end_idx is None:
        return None, "frontmatter not closed (no '---' line after opening delimiter)"

    fm_text = "\n".join(lines[1:end_idx])
    fm = {}
    current_key = None
    current_list = []
    in_list = False

    for raw_line in fm_text.split("\n"):
        stripped = raw_line.lstrip()
        if not stripped or stripped.startswith("#"):
            if in_list:
                fm[current_key] = current_list
                current_list = []
                in_list = False
            continue

        if in_list:
            if stripped.startswith("- "):
                current_list.append(stripped[2:].strip())
                continue
            else:
                fm[current_key] = current_list
                current_list = []
                in_list = False

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

        if raw_line.startswith((" ", "\t")):
            continue

        first = val_stripped[0]
        if first in ('"', "'"):
            fm[key] = val_stripped[1:-1]
        elif first in ("[", "{"):
            fm[key] = _parse_flow_collection(val_stripped)
        else:
            fm[key] = val_stripped

    if in_list:
        fm[current_key] = current_list

    return fm, None


def _parse_flow_collection(text):
    """Parse a simple YAML flow collection string like [a, b, c]."""
    inner = text.strip()[1:-1]
    items = []
    for part in inner.split(","):
        part = part.strip()
        if not part:
            continue
        if part[0] in ('"', "'"):
            items.append(part[1:-1])
        else:
            items.append(part)
    return items


def title_words(title):
    """Extract significant words from a title string."""
    words = re.findall(r"[a-zA-Z0-9_]+", title.lower())
    return {w for w in words if w not in STOPWORDS and len(w) > 2}


def jaccard(set_a, set_b):
    """Jaccard similarity between two sets."""
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    union = set_a | set_b
    return len(intersection) / len(union) if union else 0.0


def tags_intersection_ratio(tags_a, tags_b):
    """Intersection over max(len_a, len_b) for tag overlap."""
    set_a = set(t.lower().strip() for t in (tags_a or []))
    set_b = set(t.lower().strip() for t in (tags_b or []))
    if not set_a and not set_b:
        return 0.0
    intersection = set_a & set_b
    larger = max(len(set_a), len(set_b), 1)
    return len(intersection) / larger


def exact_match(a, b):
    """1.0 if both present and equal, 0.0 otherwise."""
    if a is None and b is None:
        return 0.0
    if a is not None and b is not None and str(a) == str(b):
        return 1.0
    return 0.0


def score_candidate(fm_target, fm_candidate):
    """Compute weighted similarity score and matched dimensions."""
    matched_by = []

    title_score = jaccard(
        title_words(fm_target.get("title", "")),
        title_words(fm_candidate.get("title", "")),
    )
    if title_score > 0:
        matched_by.append("title")

    tags_score = tags_intersection_ratio(
        fm_target.get("tags"), fm_candidate.get("tags")
    )
    if tags_score > 0:
        matched_by.append("tags")

    module_score = exact_match(fm_target.get("module"), fm_candidate.get("module"))
    if module_score > 0:
        matched_by.append("module")

    component_score = exact_match(
        fm_target.get("component"), fm_candidate.get("component")
    )
    if component_score > 0:
        matched_by.append("component")

    total = (
        WEIGHTS["title"] * title_score
        + WEIGHTS["tags"] * tags_score
        + WEIGHTS["module"] * module_score
        + WEIGHTS["component"] * component_score
    )

    return total, matched_by


def find_candidates(target_path, min_score):
    """Scan docs/solutions/ and return ranked candidates for target_path."""
    if not os.path.isfile(target_path):
        sys.stderr.write("check-duplicates: file not found: {}\n".format(target_path))
        sys.exit(1)

    try:
        with open(target_path) as f:
            target_text = f.read()
    except OSError as e:
        sys.stderr.write("check-duplicates: cannot read target: {}\n".format(e))
        sys.exit(1)

    fm_target, err = parse_frontmatter(target_text)
    if err:
        sys.stderr.write("check-duplicates: target parse error — {}\n".format(err))
        sys.exit(1)

    if not os.path.isdir(DOCS_DIR):
        sys.stderr.write(
            "check-duplicates: docs/solutions/ directory not found at {}\n".format(
                DOCS_DIR
            )
        )
        sys.exit(1)

    results = []
    real_docs_dir = os.path.realpath(DOCS_DIR)
    for dirpath, _dirnames, filenames in os.walk(DOCS_DIR):
        for fname in filenames:
            if not fname.endswith(".md"):
                continue
            candidate_path = os.path.join(dirpath, fname)
            real_candidate = os.path.realpath(candidate_path)
            if not real_candidate.startswith(real_docs_dir + os.sep):
                continue
            if os.path.abspath(candidate_path) == os.path.abspath(target_path):
                continue

            try:
                with open(candidate_path) as f:
                    candidate_text = f.read()
            except OSError:
                continue

            fm, err = parse_frontmatter(candidate_text)
            if err:
                continue

            score, matched_by = score_candidate(fm_target, fm)
            if score >= min_score:
                rel_path = os.path.relpath(
                    candidate_path, os.path.dirname(os.path.abspath(target_path))
                )
                # Make the path repo-relative for readability
                try:
                    repo_root = os.path.abspath(os.path.join(DOCS_DIR, "..", ".."))
                    rel = os.path.relpath(candidate_path, repo_root)
                except ValueError:
                    rel = candidate_path
                results.append(
                    {
                        "path": rel,
                        "score": round(score, 2),
                        "matched_by": matched_by,
                    }
                )

    results.sort(key=lambda x: x["score"], reverse=True)
    return results


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------


def usage_fail(msg):
    sys.stderr.write("check-duplicates: {}\n".format(msg))
    sys.exit(2)


def main(argv):
    if len(argv) < 2:
        usage_fail(
            "usage: {} <doc-path> [--top-k <n>] [--min-score <threshold>]".format(
                os.path.basename(argv[0])
            )
        )

    target_path = argv[1]
    _check_doc_path(target_path)
    top_k = DEFAULT_TOP_K
    min_score = DEFAULT_MIN_SCORE

    i = 2
    while i < len(argv):
        if argv[i] == "--top-k" and i + 1 < len(argv):
            try:
                top_k = int(argv[i + 1])
            except ValueError:
                usage_fail("--top-k must be an integer")
            i += 2
        elif argv[i] == "--min-score" and i + 1 < len(argv):
            try:
                min_score = float(argv[i + 1])
            except ValueError:
                usage_fail("--min-score must be a number")
            i += 2
        else:
            i += 1

    candidates = find_candidates(target_path, min_score)
    candidates = candidates[:top_k]

    sys.stdout.write(json.dumps(candidates, indent=2, ensure_ascii=False) + "\n")
    return 0


if __name__ == "__main__":
    import sys as _sys

    sys.exit(main(_sys.argv))
