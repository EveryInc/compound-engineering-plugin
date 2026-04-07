#!/usr/bin/env python3
"""Extract session metadata from Claude Code and/or Codex JSONL files.

Batch mode (preferred — one invocation for all files):
  python3 extract-metadata.py /path/to/dir/*.jsonl
  python3 extract-metadata.py file1.jsonl file2.jsonl file3.jsonl

Single-file mode (stdin):
  head -20 <session.jsonl> | python3 extract-metadata.py

Auto-detects platform (Claude Code vs Codex) from the JSONL structure.
Outputs one JSON object per file, one per line.
Includes a final _meta line with processing stats.
"""
import sys
import json
import os

MAX_LINES = 25  # Only need first ~25 lines for metadata


def try_claude(lines):
    for line in lines:
        try:
            obj = json.loads(line.strip())
            if obj.get("type") == "user" and "gitBranch" in obj:
                return {
                    "platform": "claude",
                    "branch": obj["gitBranch"],
                    "ts": obj.get("timestamp", ""),
                    "session": obj.get("sessionId", ""),
                }
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def try_codex(lines):
    meta = {}
    for line in lines:
        try:
            obj = json.loads(line.strip())
            if obj.get("type") == "session_meta":
                p = obj.get("payload", {})
                meta["platform"] = "codex"
                meta["cwd"] = p.get("cwd", "")
                meta["session"] = p.get("id", "")
                meta["ts"] = p.get("timestamp", obj.get("timestamp", ""))
                meta["source"] = p.get("source", "")
                meta["cli_version"] = p.get("cli_version", "")
            elif obj.get("type") == "turn_context":
                p = obj.get("payload", {})
                meta["model"] = p.get("model", "")
                meta["cwd"] = meta.get("cwd") or p.get("cwd", "")
        except (json.JSONDecodeError, KeyError):
            pass
    return meta if meta else None


def extract_from_lines(lines):
    return try_claude(lines) or try_codex(lines)


def process_file(filepath):
    try:
        size = os.path.getsize(filepath)
        with open(filepath, "r") as f:
            lines = []
            for i, line in enumerate(f):
                if i >= MAX_LINES:
                    break
                lines.append(line)
        result = extract_from_lines(lines)
        if result:
            result["file"] = filepath
            result["size"] = size
            return result, None
        else:
            return None, filepath
    except (OSError, IOError) as e:
        return None, filepath


# Collect file arguments (everything that isn't a flag)
files = [a for a in sys.argv[1:] if not a.startswith("-")]

if files:
    # Batch mode: process all files
    processed = 0
    parse_errors = 0
    for filepath in files:
        if not filepath.endswith(".jsonl"):
            continue
        result, error = process_file(filepath)
        processed += 1
        if result:
            print(json.dumps(result))
        elif error:
            parse_errors += 1

    print(json.dumps({
        "_meta": True,
        "files_processed": processed,
        "parse_errors": parse_errors,
    }))
else:
    # Single-file stdin mode (backward compatible)
    lines = list(sys.stdin)
    result = extract_from_lines(lines)
    if result:
        print(json.dumps(result))
    print(json.dumps({"_meta": True, "files_processed": 1, "parse_errors": 0 if result else 1}))
