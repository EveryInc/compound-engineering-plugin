#!/usr/bin/env python3
"""Extract error signals from a Claude Code, Codex, Cursor, Pi, or oh-my-pi (omp) JSONL session file.

Usage:
  cat <session.jsonl> | python3 extract-errors.py
  cat <session.jsonl> | python3 extract-errors.py --output PATH

Auto-detects platform from the JSONL structure.
Note: Cursor agent transcripts do not log tool results, so no errors can be extracted.
Finds failed tool calls / commands and outputs them with timestamps.

When --output PATH is given, the extracted error log is written to PATH and
stdout receives only a one-line JSON status (_meta with wrote/bytes/stats).
This lets callers route bulk content to a scratch file without round-tripping
extraction bytes through orchestrator tool results.

Without --output, extracted content goes to stdout and ends with a _meta line.
"""
import argparse
import io
import os
import sys
import json

parser = argparse.ArgumentParser(add_help=True)
parser.add_argument(
    "--output",
    metavar="PATH",
    help="Write extracted errors to PATH instead of stdout. Stdout receives a one-line _meta status.",
)
args = parser.parse_args()

# Session logs are UTF-8; force UTF-8 I/O so Windows' cp1252 default can't crash
# on non-Latin-1 content like emoji, smart quotes, or box-drawing (#1258).
sys.stdin.reconfigure(encoding="utf-8", errors="replace")
sys.stdout.reconfigure(encoding="utf-8", errors="replace")

_original_stdout = sys.stdout
if args.output:
    sys.stdout = io.StringIO()

stats = {"lines": 0, "parse_errors": 0, "errors_found": 0}


def summarize_error(raw):
    """Extract a short error summary instead of dumping the full payload."""
    text = str(raw).strip()
    # Take the first non-empty line as the error message
    for line in text.split("\n"):
        line = line.strip()
        if line:
            return line[:200]
    return text[:200]


def handle_claude(obj):
    if obj.get("type") == "user":
        content = obj.get("message", {}).get("content", [])
        if isinstance(content, list):
            for block in content:
                if block.get("type") == "tool_result" and block.get("is_error"):
                    ts = obj.get("timestamp", "")[:19]
                    summary = summarize_error(block.get("content", ""))
                    print(f"[{ts}] [error] {summary}")
                    print("---")
                    stats["errors_found"] += 1


def handle_codex(obj):
    if obj.get("type") == "event_msg":
        p = obj.get("payload", {})
        if p.get("type") == "exec_command_end":
            output = p.get("aggregated_output", "")
            stderr = p.get("stderr", "")
            command = p.get("command", [])
            cmd_str = command[-1] if command else ""

            exit_match = None
            if "Process exited with code " in output:
                try:
                    code_str = output.split("Process exited with code ")[1].split("\n")[0]
                    exit_code = int(code_str)
                    if exit_code != 0:
                        exit_match = exit_code
                except (IndexError, ValueError):
                    pass

            if exit_match is not None or stderr:
                ts = obj.get("timestamp", "")[:19]
                error_summary = summarize_error(stderr if stderr else output)
                print(f"[{ts}] [error] exit={exit_match} cmd={cmd_str[:120]}: {error_summary}")
                print("---")
                stats["errors_found"] += 1


def _pi_content_summary(content):
    if isinstance(content, str):
        return summarize_error(content)
    if isinstance(content, list):
        text = "\n".join(
            block.get("text", "")
            for block in content
            if isinstance(block, dict) and block.get("type") in ("text", "toolError")
        )
        return summarize_error(text)
    return summarize_error(content)


def _pi_active_path_objects(objects):
    """Return only entries on Pi's active leaf-to-root path."""
    by_id = {
        obj.get("id"): obj
        for obj in objects
        if isinstance(obj.get("id"), str) and obj.get("type") != "session"
    }
    leaf_id = None
    for obj in objects:
        if obj.get("type") != "session" and isinstance(obj.get("id"), str):
            leaf_id = obj["id"]
    if not leaf_id:
        return objects

    active_ids = set()
    current = leaf_id
    while isinstance(current, str) and current and current not in active_ids:
        active_ids.add(current)
        parent = by_id.get(current, {}).get("parentId")
        current = parent if isinstance(parent, str) else None
    return [
        obj
        for obj in objects
        if obj.get("type") == "session" or obj.get("id") in active_ids
    ]


def _pi_context_objects(objects):
    """Return Pi entries that participate in active LLM context."""
    active = _pi_active_path_objects(objects)
    compactions = [obj for obj in active if obj.get("type") == "compaction"]
    if not compactions:
        return active

    first_kept = compactions[-1].get("firstKeptEntryId")
    if not isinstance(first_kept, str):
        return active

    latest_compaction_id = compactions[-1].get("id")
    started = False
    found_first_kept = False
    context = [obj for obj in active if obj.get("type") == "session"]
    context.append(compactions[-1])
    for obj in active:
        if obj.get("type") == "session":
            continue
        if obj.get("id") == first_kept:
            started = True
            found_first_kept = True
        if obj.get("id") == latest_compaction_id:
            continue
        if started:
            context.append(obj)
    return context if found_first_kept and len(context) > 1 else active


def handle_pi(obj):
    # omp's physical type:'title' slot line returns here like any non-message
    # entry. type:'title_change' entries are a different pi entry type — they
    # return the same way; do not conflate the two when filtering.
    if obj.get("type") != "message":
        return
    msg = obj.get("message", {})
    if msg.get("role") == "bashExecution":
        exit_code = msg.get("exitCode")
        if exit_code in (None, 0) and not msg.get("cancelled"):
            return
        ts = obj.get("timestamp", "")[:19]
        command = msg.get("command", "")
        output = msg.get("output", "")
        summary = summarize_error(output)
        status = "cancelled" if msg.get("cancelled") else f"exit={exit_code}"
        print(f"[{ts}] [error] {status} cmd={command[:120]}: {summary}")
        print("---")
        stats["errors_found"] += 1
        return

    if msg.get("role") != "toolResult":
        return
    content = msg.get("content", [])
    is_error = bool(msg.get("isError"))
    if isinstance(content, list):
        is_error = is_error or any(
            isinstance(block, dict) and block.get("type") == "toolError"
            for block in content
        )
    if not is_error:
        return

    ts = obj.get("timestamp", "")[:19]
    tool = msg.get("toolName", "unknown")
    summary = _pi_content_summary(content)
    print(f"[{ts}] [error] tool={tool}: {summary}")
    print("---")
    stats["errors_found"] += 1


# Auto-detect platform from first few lines, then process all
detected = None
buffer = []
# omp files physically begin with a fixed-width type:'title' slot line before
# the pi-shaped type:'session' header; bare pi files start with the header.
seen_title_slot = False

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    buffer.append(line)
    stats["lines"] += 1

    if not detected and len(buffer) <= 10:
        try:
            obj = json.loads(line)
            if obj.get("type") == "session" and "cwd" in obj:
                detected = "omp" if seen_title_slot else "pi"
            elif obj.get("type") == "title" and len(buffer) == 1:
                seen_title_slot = True
            elif obj.get("type") in ("user", "assistant"):
                detected = "claude"
            elif obj.get("type") in ("session_meta", "turn_context", "response_item", "event_msg"):
                detected = "codex"
            elif obj.get("role") in ("user", "assistant") and "type" not in obj:
                detected = "cursor"
        except (json.JSONDecodeError, KeyError):
            pass

# Cursor transcripts don't log tool results — no errors to extract
def handle_noop(obj):
    pass

handlers = {"claude": handle_claude, "codex": handle_codex, "cursor": handle_noop, "pi": handle_pi, "omp": handle_pi}
handler = handlers.get(detected, handle_noop)

objects = []
for line in buffer:
    try:
        objects.append(json.loads(line))
    except (json.JSONDecodeError, KeyError):
        stats["parse_errors"] += 1

if detected in ("pi", "omp"):
    objects = _pi_context_objects(objects)

for obj in objects:
    try:
        handler(obj)
    except KeyError:
        stats["parse_errors"] += 1

print(json.dumps({"_meta": True, **stats}))

if args.output:
    body = sys.stdout.getvalue()
    sys.stdout = _original_stdout
    with open(args.output, "w", encoding="utf-8") as f:
        f.write(body)
    bytes_written = os.path.getsize(args.output)
    print(json.dumps({"_meta": True, "wrote": args.output, "bytes": bytes_written, **stats}))
