#!/usr/bin/env python3
"""Extract error signals from a Claude Code, Codex, or Cursor JSONL session file.

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


# Auto-detect platform from first few lines, then process all
detected = None
buffer = []

for line in sys.stdin:
    line = line.strip()
    if not line:
        continue
    buffer.append(line)
    stats["lines"] += 1

    if not detected and len(buffer) <= 10:
        try:
            obj = json.loads(line)
            if obj.get("type") in ("user", "assistant"):
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

handlers = {"claude": handle_claude, "codex": handle_codex, "cursor": handle_noop}
handler = handlers.get(detected, handle_noop)

for line in buffer:
    try:
        handler(json.loads(line))
    except (json.JSONDecodeError, KeyError):
        stats["parse_errors"] += 1

print(json.dumps({"_meta": True, **stats}))

if args.output:
    body = sys.stdout.getvalue()
    sys.stdout = _original_stdout
    with open(args.output, "w") as f:
        f.write(body)
    bytes_written = os.path.getsize(args.output)
    print(json.dumps({"_meta": True, "wrote": args.output, "bytes": bytes_written, **stats}))
