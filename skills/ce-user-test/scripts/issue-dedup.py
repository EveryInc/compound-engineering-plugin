#!/usr/bin/env python3
"""Judge ce-user-test GitHub issue title duplicates against a fetched corpus.

Usage:
    python3 issue-dedup.py <candidate-title> <corpus-json-file>

Corpus shape:
    []                                      no open issues
    [{"number": 42, "title": "..."}]       gh issue list result
    {"fetch_failed": true}                 caller could not fetch the corpus

Stdout contract:
    DUPLICATE #<n>      best title overlap meets the registry threshold
    UNIQUE              corpus is known and no title meets the threshold
    CORPUS-UNKNOWN      corpus fetch failed; caller must skip filing

Exit codes:
    0 success (DUPLICATE or UNIQUE)
    1 validation failure (CORPUS-UNKNOWN or malformed corpus)
    2 usage error (bad arguments, missing file, unreadable registry)

Diagnostics go to stderr and are prefixed with `issue-dedup:`.
Pure stdlib; the script never shells out to gh.
"""
import json
import os
import re
import sys
from typing import Any


SCRIPT_NAME = "issue-dedup"


def stderr(message: str) -> None:
    sys.stderr.write(f"{SCRIPT_NAME}: {message}\n")


def usage() -> int:
    stderr("usage: issue-dedup.py <candidate-title> <corpus-json-file>")
    return 2


def registry_value(name: str) -> Any:
    path = os.path.join(os.path.dirname(__file__), "caps-registry.json")
    try:
        with open(path, encoding="utf-8") as f:
            registry = json.load(f)
        return registry["entries"][name]["value"]
    except (OSError, KeyError, TypeError, ValueError) as exc:
        stderr(f"cannot read caps registry entry {name}: {exc}")
        sys.exit(2)


def tokens(title: str) -> set[str]:
    return set(re.findall(r"[a-z0-9]+", title.lower()))


def overlap(candidate: set[str], existing: set[str]) -> float:
    shorter = min(len(candidate), len(existing))
    if shorter == 0:
        return 0.0
    return len(candidate & existing) / shorter


def load_corpus(path: str) -> Any:
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except OSError as exc:
        stderr(f"cannot read corpus: {exc}")
        sys.exit(2)
    except ValueError as exc:
        print(f"CORPUS-UNKNOWN")
        stderr(f"malformed corpus: {exc}")
        sys.exit(1)


def main(argv: list[str]) -> int:
    if len(argv) != 3:
        return usage()

    candidate_title, corpus_path = argv[1], argv[2]
    corpus = load_corpus(corpus_path)
    if isinstance(corpus, dict) and corpus.get("fetch_failed") is True:
        print("CORPUS-UNKNOWN")
        return 1
    if not isinstance(corpus, list):
        print("CORPUS-UNKNOWN")
        stderr("corpus must be an array or {'fetch_failed': true}")
        return 1
    if not corpus:
        print("UNIQUE")
        return 0

    candidate_tokens = tokens(candidate_title)
    best_number: int | None = None
    best_score = 0.0
    for item in corpus:
        if not isinstance(item, dict):
            print("CORPUS-UNKNOWN")
            stderr("corpus entry is not an object")
            return 1
        number = item.get("number")
        title = item.get("title")
        if not isinstance(number, int) or not isinstance(title, str):
            print("CORPUS-UNKNOWN")
            stderr("corpus entry missing numeric number or string title")
            return 1
        score = overlap(candidate_tokens, tokens(title))
        if score > best_score:
            best_score = score
            best_number = number

    threshold = float(registry_value("issue_dedup_overlap_threshold"))
    if best_number is not None and best_score >= threshold:
        print(f"DUPLICATE #{best_number}")
    else:
        print("UNIQUE")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
