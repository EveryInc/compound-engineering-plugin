#!/usr/bin/env python3
"""Extract the conversation skeleton from a Claude Code or Codex JSONL session file.

Usage: cat <session.jsonl> | python3 extract-skeleton.py

Auto-detects platform (Claude Code vs Codex) from the JSONL structure.
Extracts:
  - User messages (text only, no tool results)
  - Assistant text (no thinking/reasoning blocks)
  - One-line tool call summaries: [tool] target -> ok/error

The tool summaries provide connective tissue between "I'll try X" and
"That worked" without dumping raw tool inputs/outputs.
Outputs a _meta line at the end with processing stats.
"""
import sys
import json

stats = {"lines": 0, "parse_errors": 0, "user": 0, "assistant": 0, "tool": 0}


def summarize_claude_tool(block):
    """Extract a one-line summary from a Claude Code tool_use block."""
    name = block.get("name", "unknown")
    inp = block.get("input", {})

    # Extract the most informative target from common tool inputs
    target = (
        inp.get("file_path")
        or inp.get("path")
        or inp.get("command", "")[:120]
        or inp.get("pattern", "")
        or inp.get("query", "")[:80]
        or inp.get("prompt", "")[:80]
        or ""
    )
    if isinstance(target, str) and len(target) > 120:
        target = target[:120]

    return f"{name} {target}".strip()


def handle_claude(obj):
    msg_type = obj.get("type")
    ts = obj.get("timestamp", "")[:19]

    if msg_type == "user":
        msg = obj.get("message", {})
        content = msg.get("content", "")

        # Check for tool results (success/error status for prior tool calls)
        if isinstance(content, list):
            for block in content:
                if block.get("type") == "tool_result":
                    is_error = block.get("is_error", False)
                    status = "error" if is_error else "ok"
                    # tool_use_id links back to the tool call but we just need status
                    print(f"[{ts}] [tool-result] -> {status}")
                    stats["tool"] += 1

            # Also extract user text from mixed content
            texts = [
                c.get("text", "")
                for c in content
                if c.get("type") == "text" and len(c.get("text", "")) > 10
            ]
            content = " ".join(texts)

        if isinstance(content, str) and len(content) > 15:
            print(f"[{ts}] [user] {content[:800]}")
            print("---")
            stats["user"] += 1

    elif msg_type == "assistant":
        msg = obj.get("message", {})
        content = msg.get("content", [])
        if isinstance(content, list):
            for block in content:
                if block.get("type") == "text" and len(block.get("text", "")) > 20:
                    print(f"[{ts}] [assistant] {block['text'][:800]}")
                    print("---")
                    stats["assistant"] += 1
                elif block.get("type") == "tool_use":
                    summary = summarize_claude_tool(block)
                    print(f"[{ts}] [tool] {summary}")
                    stats["tool"] += 1


def handle_codex(obj):
    msg_type = obj.get("type")
    ts = obj.get("timestamp", "")[:19]

    if msg_type == "event_msg":
        p = obj.get("payload", {})
        if p.get("type") == "user_message":
            text = p.get("message", "")
            if isinstance(text, str) and len(text) > 15:
                parts = text.split("</system_instruction>")
                user_text = parts[-1].strip() if parts else text
                if len(user_text) > 15:
                    print(f"[{ts}] [user] {user_text[:800]}")
                    print("---")
                    stats["user"] += 1

        elif p.get("type") == "exec_command_end":
            command = p.get("command", [])
            cmd_str = command[-1] if command else ""
            output = p.get("aggregated_output", "")

            # Determine success/failure
            status = "ok"
            if "Process exited with code " in output:
                try:
                    code = int(output.split("Process exited with code ")[1].split("\n")[0])
                    if code != 0:
                        status = f"error(exit {code})"
                except (IndexError, ValueError):
                    pass

            if cmd_str:
                print(f"[{ts}] [tool] exec: {cmd_str[:120]} -> {status}")
                stats["tool"] += 1

    elif msg_type == "response_item":
        p = obj.get("payload", {})
        if p.get("type") == "message" and p.get("role") == "assistant":
            for block in p.get("content", []):
                if block.get("type") == "output_text" and len(block.get("text", "")) > 20:
                    print(f"[{ts}] [assistant] {block['text'][:800]}")
                    print("---")
                    stats["assistant"] += 1

        elif p.get("type") == "function_call":
            name = p.get("name", "unknown")
            args = p.get("arguments", "")
            if isinstance(args, str):
                try:
                    args_obj = json.loads(args)
                    target = args_obj.get("cmd", args_obj.get("command", ""))[:120]
                except (json.JSONDecodeError, AttributeError):
                    target = args[:80]
            else:
                target = str(args)[:80]
            print(f"[{ts}] [tool] {name}: {target}")
            stats["tool"] += 1


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
