#!/usr/bin/env python3
"""Extract session metadata from Claude Code, Codex, and Cursor JSONL files.

Batch mode (preferred — one invocation for all files):
  python3 extract-metadata.py /path/to/dir/*.jsonl
  python3 extract-metadata.py file1.jsonl file2.jsonl file3.jsonl

Single-file mode (stdin):
  head -20 <session.jsonl> | python3 extract-metadata.py

Auto-detects platform from the JSONL structure.
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


def try_cursor(lines):
    """Cursor agent transcripts: role-based entries, no timestamps or metadata fields."""
    for line in lines:
        try:
            obj = json.loads(line.strip())
            # Cursor entries have 'role' at top level but no 'type'
            if obj.get("role") in ("user", "assistant") and "type" not in obj:
                return {"platform": "cursor"}
        except (json.JSONDecodeError, KeyError):
            pass
    return None


def extract_from_lines(lines):
    return try_claude(lines) or try_codex(lines) or try_cursor(lines)


TAIL_BYTES = 16384  # Read last 16KB to find final timestamp past trailing metadata


def get_last_timestamp(filepath, size):
    """Read the tail of a file to find the last message with a timestamp."""
    try:
        with open(filepath, "rb") as f:
            f.seek(max(0, size - TAIL_BYTES))
            tail = f.read().decode("utf-8", errors="ignore")
            lines = tail.strip().split("\n")
        for line in reversed(lines):
            try:
                obj = json.loads(line.strip())
                if "timestamp" in obj:
                    return obj["timestamp"]
            except (json.JSONDecodeError, KeyError):
                pass
    except (OSError, IOError):
        pass
    return None


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
            if result["platform"] == "cursor":
                # Cursor transcripts have no timestamps in JSONL.
                # Use file modification time as the best available signal.
                # Derive session ID from the parent directory name (UUID).
                mtime = os.path.getmtime(filepath)
                from datetime import datetime, timezone

                result["ts"] = datetime.fromtimestamp(mtime, tz=timezone.utc).isoformat()
                result["session"] = os.path.basename(os.path.dirname(filepath))
            else:
                last_ts = get_last_timestamp(filepath, size)
                if last_ts:
                    result["last_ts"] = last_ts
            return result, None
        else:
            return None, filepath
    except (OSError, IOError) as e:
        return None, filepath


# Parse arguments: files and optional --cwd-filter <substring>
files = []
cwd_filter = None
args = sys.argv[1:]
i = 0
while i < len(args):
    if args[i] == "--cwd-filter" and i + 1 < len(args):
        cwd_filter = args[i + 1]
        i += 2
    elif not args[i].startswith("-"):
        files.append(args[i])
        i += 1
    else:
        i += 1

if files:
    # Batch mode: process all files
    processed = 0
    parse_errors = 0
    filtered = 0
    for filepath in files:
        if not filepath.endswith(".jsonl"):
            continue
        result, error = process_file(filepath)
        processed += 1
        if result:
            # Apply CWD filter: skip Codex sessions from other repos
            if cwd_filter and result.get("cwd") and cwd_filter not in result["cwd"]:
                filtered += 1
                continue
            print(json.dumps(result))
        elif error:
            parse_errors += 1

    meta = {"_meta": True, "files_processed": processed, "parse_errors": parse_errors}
    if filtered:
        meta["filtered_by_cwd"] = filtered
    print(json.dumps(meta))
else:
    # No file arguments: either single-file stdin mode or empty xargs invocation.
    # When xargs runs us with no input (e.g., discover found no files), stdin is
    # empty or a TTY — emit a clean zero-file result instead of a false parse error.
    if sys.stdin.isatty():
        lines = []
    else:
        lines = list(sys.stdin)

    if not lines:
        # No input at all — zero-file result (clean exit for empty pipelines)
        print(json.dumps({"_meta": True, "files_processed": 0, "parse_errors": 0}))
    else:
        # Genuine single-file stdin mode (backward compatible)
        result = extract_from_lines(lines)
        if result:
            print(json.dumps(result))
        print(json.dumps({"_meta": True, "files_processed": 1, "parse_errors": 0 if result else 1}))
