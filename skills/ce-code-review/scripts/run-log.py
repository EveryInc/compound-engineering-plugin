#!/usr/bin/env python3
"""Record what a ce-code-review run cost, stage by stage.

`event` appends one JSON line per stage boundary to `<run-dir>/stages.jsonl`
as the run progresses, so a killed run still leaves parseable partial data.
`summarize` folds those lines, the run directory's artifact bytes, and any
peer usage file into a `cost` object merged into `<run-dir>/metadata.json`
without touching the fields already there. Neither subcommand ever fails
the run: an error leaves `cost.status` as `unavailable` with the reason.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

STAGES_FILE = "stages.jsonl"
METADATA_FILE = "metadata.json"
# Stages whose end marks the receipt being written; a run with one of these
# ended and no dangling start is complete.
RECEIPT_STAGES = {"report", "receipt"}
# The job directory holds detached-runner state, not review output.
EXCLUDED_DIRS = {"jobs"}
# Stages that produce candidates; merge and validate only filter them, so
# their counts stay per stage and never enter the total.
PRODUCING_STAGES = {"review", "peer", "dispatch"}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def parse_iso(value: str) -> datetime | None:
    try:
        return datetime.fromisoformat(value)
    except (TypeError, ValueError):
        return None


def host_from_env() -> str:
    """The same attestation the cross-model reference uses, host only."""
    env = os.environ
    if env.get("CLAUDECODE") == "1":
        return "claude"
    if any(env.get(k) for k in ("CODEX_SANDBOX", "CODEX_SANDBOX_NETWORK_DISABLED", "CODEX_SESSION_ID", "CODEX_THREAD_ID", "CODEX_CI")):
        return "codex"
    if env.get("GROK_AGENT") == "1" or env.get("GROK_SESSION_ID"):
        return "grok"
    if env.get("CURSOR_AGENT") or env.get("CURSOR_CONVERSATION_ID"):
        return "cursor"
    if env.get("OPENCODE_TERMINAL"):
        return "opencode"
    return "unknown"


def parse_facts(items: list[str] | None) -> dict[str, object]:
    facts: dict[str, object] = {}
    for item in items or []:
        key, sep, raw = item.partition("=")
        if not sep or not key:
            continue
        try:
            facts[key] = json.loads(raw)
        except ValueError:
            facts[key] = raw
    return facts


def append_line(run_dir: Path, record: dict[str, object]) -> None:
    run_dir.mkdir(parents=True, exist_ok=True)
    line = json.dumps(record, sort_keys=True) + "\n"
    with (run_dir / STAGES_FILE).open("a", encoding="utf-8") as handle:
        handle.write(line)
        handle.flush()


def cmd_event(args: argparse.Namespace) -> int:
    run_dir = Path(args.run_dir)
    if not args.end and not args.start:
        print("run-log event: nothing to record; pass --end and/or --start", file=sys.stderr)
        return 0
    ts = now_iso()
    extras: dict[str, object] = {}
    if args.reviewers is not None:
        extras["reviewers"] = args.reviewers
    if args.candidates is not None:
        extras["candidates"] = args.candidates
    if args.tokens is not None:
        extras["tokens"] = args.tokens
    if args.note:
        extras["note"] = args.note
    facts = parse_facts(args.fact)
    if facts:
        extras["facts"] = facts
    written = []
    if args.end:
        record = {"ts": ts, "stage": args.end, "phase": "end", **extras}
        append_line(run_dir, record)
        written.append(record)
    if args.start:
        record = {"ts": ts, "stage": args.start, "phase": "start"}
        # Facts and counts describe the stage that just ended; a lone --start
        # carries them so the scope stage can record its helper facts.
        if not args.end:
            record.update(extras)
        append_line(run_dir, record)
        written.append(record)
    print(json.dumps({"written": written}, sort_keys=True))
    return 0


def read_events(run_dir: Path) -> tuple[list[dict[str, object]], int]:
    path = run_dir / STAGES_FILE
    if not path.is_file():
        raise FileNotFoundError(str(path))
    events: list[dict[str, object]] = []
    truncated = 0
    with path.open("r", encoding="utf-8") as handle:
        for raw in handle:
            line = raw.strip()
            if not line:
                continue
            try:
                parsed = json.loads(line)
            except ValueError:
                truncated += 1
                continue
            if isinstance(parsed, dict) and "stage" in parsed and "phase" in parsed:
                events.append(parsed)
            else:
                truncated += 1
    return events, truncated


def artifact_bytes(run_dir: Path) -> int:
    total = 0
    for root, dirs, files in os.walk(run_dir):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS]
        for name in files:
            try:
                total += (Path(root) / name).stat().st_size
            except OSError:
                continue
    return total


def peer_usage(run_dir: Path) -> dict[str, object] | None:
    for path in sorted(run_dir.glob("adversarial-*-usage.json")):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            continue
        if isinstance(data, dict):
            provider = path.name[len("adversarial-"):-len("-usage.json")]
            return {"provider": provider, **data}
    return None


def build_cost(run_dir: Path) -> dict[str, object]:
    events, truncated = read_events(run_dir)
    stages: list[dict[str, object]] = []
    order: list[str] = []
    open_starts: dict[str, dict[str, object]] = {}
    by_name: dict[str, dict[str, object]] = {}
    scope_facts: dict[str, object] = {}
    for event in events:
        name = str(event["stage"])
        if name not in by_name:
            by_name[name] = {"stage": name}
            order.append(name)
        entry = by_name[name]
        if event["phase"] == "start":
            open_starts[name] = event
            entry["started_at"] = event.get("ts")
        elif event["phase"] == "end":
            entry["ended_at"] = event.get("ts")
            start = open_starts.pop(name, None)
            if start is not None:
                t0, t1 = parse_iso(str(start.get("ts"))), parse_iso(str(event.get("ts")))
                if t0 and t1:
                    entry["elapsed_seconds"] = round((t1 - t0).total_seconds(), 3)
        for key in ("reviewers", "candidates", "tokens", "note"):
            if key in event:
                entry[key] = event[key]
        facts = event.get("facts")
        if isinstance(facts, dict):
            entry.setdefault("facts", {}).update(facts)
            if name == "scope":
                scope_facts.update(facts)
    stages = [by_name[name] for name in order]
    dangling = sorted(open_starts)
    receipt_done = any(s.get("ended_at") for s in stages if s["stage"] in RECEIPT_STAGES)
    status = "complete" if receipt_done and not dangling else "partial"
    totals = {
        "elapsed_seconds": round(sum(float(s.get("elapsed_seconds", 0) or 0) for s in stages), 3),
        "reviewers": sum(int(s.get("reviewers", 0) or 0) for s in stages),
        "candidates": sum(int(s.get("candidates", 0) or 0) for s in stages if s["stage"] in PRODUCING_STAGES),
        "tokens": sum(int(s.get("tokens", 0) or 0) for s in stages if "tokens" in s),
        "artifact_bytes": artifact_bytes(run_dir),
    }
    if not any("tokens" in s for s in stages):
        del totals["tokens"]
    cost: dict[str, object] = {
        "status": status,
        "host": host_from_env(),
        "stages": stages,
        "totals": totals,
        "truncated_events": truncated,
    }
    if dangling:
        cost["dangling_stages"] = dangling
    if scope_facts:
        cost["scope"] = scope_facts
    peer = peer_usage(run_dir)
    if peer is not None:
        cost["peer"] = peer
    return cost


def cmd_summarize(args: argparse.Namespace) -> int:
    run_dir = Path(args.run_dir)
    try:
        cost = build_cost(run_dir)
    except FileNotFoundError as exc:
        cost = {"status": "unavailable", "reason": f"no stage log: {exc}"}
    except OSError as exc:
        cost = {"status": "unavailable", "reason": str(exc)}
    metadata_path = run_dir / METADATA_FILE
    metadata: dict[str, object] = {}
    if metadata_path.is_file():
        try:
            loaded = json.loads(metadata_path.read_text(encoding="utf-8"))
            if isinstance(loaded, dict):
                metadata = loaded
        except (OSError, ValueError):
            cost.setdefault("notes", []).append("metadata.json was unreadable and was rewritten")
    metadata["cost"] = cost
    run_dir.mkdir(parents=True, exist_ok=True)
    tmp = metadata_path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(metadata, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    os.replace(tmp, metadata_path)
    print(json.dumps({"status": cost.get("status"), "metadata": str(metadata_path)}, sort_keys=True))
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    sub = parser.add_subparsers(dest="command", required=True)
    ev = sub.add_parser("event", help="record a stage boundary")
    ev.add_argument("--run-dir", required=True)
    ev.add_argument("--end", help="stage that just ended")
    ev.add_argument("--start", help="stage that starts now")
    ev.add_argument("--reviewers", type=int)
    ev.add_argument("--candidates", type=int)
    ev.add_argument("--tokens", type=int)
    ev.add_argument("--note")
    ev.add_argument("--fact", action="append", help="key=value (value parsed as JSON when possible)")
    ev.set_defaults(func=cmd_event)
    sm = sub.add_parser("summarize", help="fold the stage log into metadata.json")
    sm.add_argument("--run-dir", required=True)
    sm.set_defaults(func=cmd_summarize)
    args = parser.parse_args()
    return args.func(args)


if __name__ == "__main__":
    raise SystemExit(main())
