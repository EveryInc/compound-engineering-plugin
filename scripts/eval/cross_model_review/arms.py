#!/usr/bin/env python3
"""Cross-model review eval — CLI arms b (isolated) and c (fixed context) (U3).

Invokes the external model CLIs (codex, agy) over the document via stdin using
argv lists — never string interpolation into a shell — so document content
cannot inject commands (R2 / R14).

Arm b is run isolated from the repo (clean cwd + HOME/config overrides) so the
model genuinely has no workspace context; arm c additionally supplies a fixed
context set. Because "isolation flags are present" is not the same as "the model
had no context", U3 includes a positive isolation PROBE (AD2 / P1): plant a
sentinel only reachable from repo/global config and assert arm b cannot surface
it. The probe's leak-detection logic is unit-tested here; the live subprocess
runs are integration-level (validated at eval time).
"""

import argparse
import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Validated invocation forms (codex 0.133.0, agy 1.0.2):
#   codex exec -s read-only -     (prompt via stdin)
#   agy --print "<instruction>"   (stdin is appended to the prompt)
CODEX_BASE = ["codex", "exec", "-s", "read-only", "-"]
AGY_INSTRUCTION = "Review the document provided on stdin and return findings, one per line."


def isolated_env_and_cwd():
    """Env + cwd for arm b so the CLI cannot read repo or global config.

    codex resolves context from CWD, walks up for AGENTS.md, and reads
    ~/.codex/config.toml. A clean temp CWD defeats CWD-based and upward
    discovery; overriding HOME / CODEX_HOME / XDG_CONFIG_HOME defeats the
    global config. Returns (env, cwd) — the caller owns cleaning up cwd.
    """
    clean_home = tempfile.mkdtemp(prefix="cmre-isolated-home-")
    clean_cwd = tempfile.mkdtemp(prefix="cmre-isolated-cwd-")
    env = dict(os.environ)
    env["HOME"] = clean_home
    env.pop("CODEX_HOME", None)
    env.pop("XDG_CONFIG_HOME", None)
    env.pop("AGY_CONFIG", None)
    return env, clean_cwd, ["HOME", "CODEX_HOME", "XDG_CONFIG_HOME", "AGY_CONFIG"]


def build_invocation(arm, cli, doc_text, rubric, context_text=None):
    """Assemble the subprocess spec. Document content travels via stdin only.

    Returns a spec dict (argv, cwd, env_overrides, stdin payload metadata). The
    actual stdin string is returned under `stdin` for the runner; tests assert
    on argv/cwd/env, never needing the full payload.
    """
    if cli == "codex":
        argv = list(CODEX_BASE)
    elif cli == "agy":
        argv = ["agy", "--print", AGY_INSTRUCTION]
    else:
        raise ValueError(f"unknown cli: {cli}")

    parts = [rubric, "\n\n=== DOCUMENT ===\n", doc_text]
    if arm == "c_fixed_context" and context_text:
        parts += ["\n\n=== REPO CONTEXT (fixed set) ===\n", context_text]
    stdin_payload = "".join(parts)

    if arm == "b_isolated":
        env, cwd, overridden = isolated_env_and_cwd()
    else:
        env, cwd, overridden = dict(os.environ), os.getcwd(), []

    # Defensive: document content must never appear as an argv element.
    doc_in_argv = any(doc_text and doc_text in a for a in argv)

    return {
        "arm": arm,
        "cli": cli,
        "argv": argv,
        "cwd": cwd,
        "env_overrides": overridden,
        "stdin_has_context": arm == "c_fixed_context" and bool(context_text),
        "doc_in_argv": doc_in_argv,
        "_env": env,
        "_stdin": stdin_payload,
    }


def detect_leak(output, sentinel):
    """The isolation probe's check: did arm b surface a sentinel it should not have?"""
    return bool(sentinel) and sentinel in output


def parse_findings(text):
    """Parse a model's free-form output into findings [{id, text}].

    Accepts a JSON array (of strings or {id,text}); otherwise splits markdown
    bullets; otherwise treats the whole non-empty body as a single finding.
    """
    text = (text or "").strip()
    if not text:
        return []
    try:
        data = json.loads(text)
        if isinstance(data, list):
            out = []
            for i, item in enumerate(data, 1):
                if isinstance(item, dict) and "text" in item:
                    out.append({"id": item.get("id", f"f{i}"), "text": str(item["text"])})
                else:
                    out.append({"id": f"f{i}", "text": str(item)})
            return out
    except json.JSONDecodeError:
        pass
    bullets = [ln.strip()[2:].strip() for ln in text.splitlines()
               if ln.strip().startswith(("- ", "* "))]
    if bullets:
        return [{"id": f"f{i}", "text": b} for i, b in enumerate(bullets, 1) if b]
    return [{"id": "f1", "text": text}]


def run_invocation(spec, timeout):
    """Run the CLI arm as a subprocess (integration-level; not unit-tested with live CLIs)."""
    start = time.monotonic()
    try:
        proc = subprocess.run(
            spec["argv"],
            input=spec["_stdin"],
            cwd=spec["cwd"],
            env=spec["_env"],
            capture_output=True,
            text=True,
            timeout=timeout,
            check=False,
        )
    except subprocess.TimeoutExpired:
        return {"status": "timeout", "latency_ms": (time.monotonic() - start) * 1000, "findings": [], "stderr": ""}
    except FileNotFoundError:
        return {"status": "error", "latency_ms": 0, "findings": [], "stderr": f"{spec['cli']} not found"}
    latency_ms = (time.monotonic() - start) * 1000
    status = "ok" if proc.returncode == 0 else "error"
    findings = parse_findings(proc.stdout) if status == "ok" else []
    return {"status": status, "latency_ms": latency_ms, "findings": findings, "stderr": proc.stderr}


def _read(path):
    return Path(path).read_text()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Cross-model review eval CLI arms (b, c).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("build-invocation")
    p.add_argument("arm", choices=["b_isolated", "c_fixed_context"])
    p.add_argument("cli", choices=["codex", "agy"])
    p.add_argument("doc")
    p.add_argument("rubric")
    p.add_argument("--context")

    p = sub.add_parser("detect-leak")
    p.add_argument("sentinel")
    p.add_argument("output")

    p = sub.add_parser("parse-findings")
    p.add_argument("output")

    args = parser.parse_args(argv)

    if args.cmd == "build-invocation":
        ctx = _read(args.context) if args.context else None
        spec = build_invocation(args.arm, args.cli, _read(args.doc), _read(args.rubric), ctx)
        # Do not leak the full env/stdin into the printed spec.
        printable = {k: v for k, v in spec.items() if not k.startswith("_")}
        printable["stdin_len"] = len(spec["_stdin"])
        print(json.dumps(printable))
        return 0

    if args.cmd == "detect-leak":
        print(json.dumps({"leaked": detect_leak(_read(args.output), args.sentinel)}))
        return 0

    if args.cmd == "parse-findings":
        print(json.dumps({"findings": parse_findings(_read(args.output))}))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
