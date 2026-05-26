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
import re
import subprocess
import sys
import tempfile
import time
from pathlib import Path

# Validated invocation forms:
#   codex 0.133.0:  codex exec -s read-only --skip-git-repo-check -   (prompt via stdin)
#   gemini 0.43.0:  gemini -p "<instruction>" --approval-mode plan --skip-trust -o text
#                   (-p is appended to stdin; plan = read-only so the arm never edits;
#                    --skip-trust is REQUIRED for headless runs in a clean/untrusted CWD,
#                    else gemini exits 55 "not running in a trusted directory")
# Both arms run from a clean temp CWD (no ambient workspace access). codex needs
# --skip-git-repo-check or it refuses with "Not inside a trusted directory".
#
# NOTE: agy 1.0.2 (--print) is retained as an option but proved UNRELIABLE as a
# non-interactive reviewer (cross-model-eval first/second runs): prompt-in-argv hangs,
# doc-on-stdin returns exit 0 with empty output, and it has no no-tools mode. Prefer
# codex/gemini. See docs/solutions/skill-design/cross-model-eval-first-run-2026-05-25.md.
CODEX_BASE = ["codex", "exec", "-s", "read-only", "--skip-git-repo-check", "-"]
AGY_INSTRUCTION = "Review the document provided on stdin. Return ONLY a JSON array of finding strings (one element per distinct finding), no prose or preamble."
GEMINI_INSTRUCTION = "Review the document provided on stdin. Do not modify files. Return ONLY a JSON array of finding strings (one element per distinct finding), no prose or preamble."
GEMINI_BASE = ["gemini", "-p", GEMINI_INSTRUCTION, "--approval-mode", "plan", "--skip-trust", "-o", "text"]

# Lines like "1. foo" or "2) bar" — numbered findings the model commonly emits.
NUMBERED_ITEM = re.compile(r"^\s*\d+[.)]\s+(.*)$")


def clean_cwd():
    """A fresh temp CWD with no ambient repo access.

    Both arms run from here so neither inherits the repo's workspace context
    (codex's AGENTS.md walk-up and git-repo discovery both start from CWD). HOME
    is deliberately NOT overridden — that would strip the CLI's auth (found via
    live smoke). The global config under HOME (~/.codex, agy) is therefore a
    constant across both arms, so it does not confound the b-vs-c delta; the only
    difference between the arms is the fixed context arm c injects via stdin. The
    sentinel isolation probe (detect_leak) guards against repo-context leakage.
    """
    return tempfile.mkdtemp(prefix="cmre-arm-cwd-")


def build_invocation(arm, cli, doc_text, rubric, context_text=None):
    """Assemble the subprocess spec. Document content travels via stdin only.

    Returns a spec dict (argv, cwd, env_overrides, stdin payload metadata). The
    actual stdin string is returned under `stdin` for the runner; tests assert
    on argv/cwd/env, never needing the full payload.
    """
    if cli == "codex":
        argv = list(CODEX_BASE)
    elif cli == "gemini":
        argv = list(GEMINI_BASE)
    elif cli == "agy":
        argv = ["agy", "--print", AGY_INSTRUCTION]
    else:
        raise ValueError(f"unknown cli: {cli}")

    parts = [rubric, "\n\n=== DOCUMENT ===\n", doc_text]
    if arm == "c_fixed_context" and context_text:
        parts += ["\n\n=== REPO CONTEXT (fixed set) ===\n", context_text]
    stdin_payload = "".join(parts)

    # Both arms run from a clean CWD (no ambient repo access). HOME is preserved
    # so the CLI keeps its auth; the global config is constant across arms and
    # does not confound the b-vs-c delta. The only difference is arm c's injected
    # context above.
    cwd = clean_cwd()
    env = dict(os.environ)

    # Defensive: document content must never appear as an argv element.
    doc_in_argv = any(doc_text and doc_text in a for a in argv)

    return {
        "arm": arm,
        "cli": cli,
        "argv": argv,
        "cwd": cwd,
        "isolated_from_repo": True,
        "skip_git_repo_check": "--skip-git-repo-check" in argv,
        "stdin_has_context": arm == "c_fixed_context" and bool(context_text),
        "doc_in_argv": doc_in_argv,
        "_env": env,
        "_stdin": stdin_payload,
    }


def detect_leak(output, sentinel):
    """The isolation probe's check: did arm b surface a sentinel it should not have?"""
    return bool(sentinel) and sentinel in output


def parse_findings(text):
    """Parse a model's output into findings [{id, text}].

    The reliable path is a JSON array (the arm instruction now requests one);
    `--output-format json`/fenced JSON is tolerated. Otherwise: markdown bullets
    or numbered items; otherwise blank-line-separated paragraphs. We deliberately
    do NOT split on every newline — verbose models (e.g. codex) wrap a single
    finding across lines, so line-splitting over-counts wildly (one review parsed
    as ~100 findings). Counts from unstructured prose are best-effort; structured
    JSON output is what makes the yield metric trustworthy.
    """
    text = (text or "").strip()
    if not text:
        return []
    # Tolerate a ```json ... ``` fence around the array.
    json_text = text
    if json_text.startswith("```"):
        json_text = re.sub(r"^```[a-zA-Z0-9]*\n?", "", json_text)
        json_text = re.sub(r"\n?```$", "", json_text).strip()
    try:
        data = json.loads(json_text)
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
    items = []
    for ln in text.splitlines():
        s = ln.strip()
        if s.startswith(("- ", "* ")):
            items.append(s[2:].strip())
            continue
        m = NUMBERED_ITEM.match(ln)
        if m:
            items.append(m.group(1).strip())
    items = [i for i in items if i]
    if items:
        return [{"id": f"f{i}", "text": b} for i, b in enumerate(items, 1)]
    # Best-effort prose fallback: blank-line-separated paragraphs only (a clear finding
    # boundary), never per-line (over-counts wrapped prose).
    paras = [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]
    if len(paras) > 1:
        return [{"id": f"f{i}", "text": p} for i, p in enumerate(paras, 1)]
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
    p.add_argument("cli", choices=["codex", "gemini", "agy"])
    p.add_argument("doc")
    p.add_argument("rubric")
    p.add_argument("--context")

    p = sub.add_parser("detect-leak")
    p.add_argument("sentinel")
    p.add_argument("output")

    p = sub.add_parser("parse-findings")
    p.add_argument("output")

    p = sub.add_parser("run-arm")
    p.add_argument("arm", choices=["b_isolated", "c_fixed_context"])
    p.add_argument("cli", choices=["codex", "gemini", "agy"])
    p.add_argument("doc")
    p.add_argument("rubric")
    p.add_argument("--context")
    p.add_argument("--doc-id", required=True)
    p.add_argument("--trial", type=int, default=1)
    p.add_argument("--timeout", type=float, default=180.0)

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

    if args.cmd == "run-arm":
        ctx = _read(args.context) if args.context else None
        spec = build_invocation(args.arm, args.cli, _read(args.doc), _read(args.rubric), ctx)
        result = run_invocation(spec, args.timeout)
        record = {
            "arm": args.arm,
            "doc_id": args.doc_id,
            "trial": args.trial,
            "status": result["status"],
            "producer": "runner",
            "latency_ms": result["latency_ms"],
            "findings": result["findings"],
            "model": args.cli,
        }
        # stderr carries the CLI's diagnostics (auth/availability failures) for the smoke check.
        if result.get("stderr"):
            sys.stderr.write(result["stderr"])
        print(json.dumps(record))
        return 0 if result["status"] == "ok" else 1

    return 2


if __name__ == "__main__":
    sys.exit(main())
