#!/usr/bin/env python3
"""Extract error signals from a Claude Code or Codex JSONL session file.

Usage: cat <session.jsonl> | python3 extract-errors.py

Auto-detects platform (Claude Code vs Codex) from the JSONL structure.
Finds failed tool calls / commands and outputs them with timestamps.
Outputs a _meta line at the end with processing stats.
"""
import sys
import json

stats = {"lines": 0, "parse_errors": 0, "errors_found": 0}


def handle_claude(obj):
    if obj.get("type") == "user":
        content = obj.get("message", {}).get("content", [])
        if isinstance(content, list):
            for block in content:
                if block.get("type") == "tool_result" and block.get("is_error"):
                    ts = obj.get("timestamp", "")[:19]
                    result = str(block.get("content", ""))[:500]
                    print(f"[{ts}] [error] {result}")
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
                error_info = stderr[:300] if stderr else output[:300]
                print(f"[{ts}] [error] exit={exit_match} cmd={cmd_str[:200]}")
                if error_info:
                    print(f"  {error_info}")
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
            elif obj.get("type") in ("session_meta", "turn_context", "response_item"):
                detected = "codex"
        except (json.JSONDecodeError, KeyError):
            pass

handler = handle_claude if detected == "claude" else handle_codex

for line in buffer:
    try:
        handler(json.loads(line))
    except (json.JSONDecodeError, KeyError):
        stats["parse_errors"] += 1

print(json.dumps({"_meta": True, **stats}))
