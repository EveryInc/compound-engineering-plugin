"""Preserve a judged feedback batch. This helper never mutates GitHub."""

from __future__ import annotations

import argparse
import json
import os
import re
import subprocess
import sys
import tempfile
from pathlib import Path
from urllib.parse import urlsplit


SCHEMA_VERSION = 1
VERDICTS = {"fixed", "fixed-differently", "replied", "not-addressing", "declined", "needs-human"}
KINDS = {"thread", "comment", "review"}


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def string(value: object, name: str, pattern: str | None = None) -> str:
    require(isinstance(value, str) and bool(value), f"{name} must be a nonempty string")
    if pattern:
        require(re.fullmatch(pattern, value) is not None, f"invalid {name}")
    return value


def positive_int(value: object, name: str) -> None:
    require(type(value) is int and value > 0, f"{name} must be a positive integer")


def object_value(value: object, name: str) -> dict:
    require(isinstance(value, dict), f"{name} must be an object")
    return value


def array(value: object, name: str) -> list:
    require(isinstance(value, list), f"{name} must be an array")
    return value


def decision(value: object) -> None:
    context = object_value(value, "decision_context")
    for key in ("quoted_feedback", "investigation", "decision_reason"):
        string(context.get(key), key)
    options = array(context.get("options"), "options")
    require(bool(options), "decision options must not be empty")
    for option in options:
        option = object_value(option, "option")
        string(option.get("option"), "option")
        string(option.get("tradeoff"), "tradeoff")
    require("recommendation" in context, "missing recommendation")
    if context["recommendation"] is not None:
        string(context["recommendation"], "recommendation")


def progress(value: object) -> None:
    value = object_value(value, "progress")
    require(set(value) <= {"reply_id", "reply_url", "resolved", "applied"}, "unknown progress field")
    if "reply_id" in value:
        positive_int(value["reply_id"], "reply_id")
    if "reply_url" in value:
        string(value["reply_url"], "reply_url")
    for key in ("resolved", "applied"):
        if key in value:
            require(type(value[key]) is bool, f"{key} must be boolean")


def validate(record: object) -> dict:
    record = object_value(record, "record")
    require(type(record.get("schema_version")) is int and record["schema_version"] == SCHEMA_VERSION, "unsupported schema_version")
    require(record.get("status") in {"pending", "completed"}, "invalid status")
    pr = object_value(record.get("pr"), "pr")
    host = string(pr.get("host"), "host", r"[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?(?::[0-9]+)?")
    for key in ("base_repo", "head_repo"):
        string(pr.get(key), key, r"[A-Za-z0-9_-][A-Za-z0-9_.-]*/[A-Za-z0-9_-][A-Za-z0-9_.-]*")
    positive_int(pr.get("number"), "PR number")
    expected_url = f"https://{host}/{pr['base_repo']}/pull/{pr['number']}"
    require(pr.get("url") == expected_url, "PR URL does not match host/base/number")
    ref = string(pr.get("head_ref"), "head_ref")
    require(not re.search(r"[\x00-\x20\x7f~^:?*\[\\]", ref) and not any(token in ref for token in ("..", "@{")), "invalid head_ref")
    require(not ref.startswith(("-", "/", ".")) and not ref.endswith(("/", ".", ".lock")) and "//" not in ref, "invalid head_ref")
    require("fix_commit" in record, "missing fix_commit")
    if record["fix_commit"] is not None:
        string(record["fix_commit"], "fix_commit", r"[0-9a-f]{40}")
    verification = object_value(record.get("verification"), "verification")
    require(verification.get("outcome") in {"passed", "pre-existing-failure", "failed", "not-run"}, "invalid verification outcome")
    for key in ("command", "details"):
        require(isinstance(verification.get(key), str), f"verification.{key} must be a string")
    seen = set()
    for action in array(record.get("actions"), "actions"):
        action = object_value(action, "action")
        source = object_value(action.get("source"), "source")
        require(source.get("kind") in KINDS, "invalid source kind")
        source_id = string(source.get("id"), "source id", r"[A-Za-z0-9_+=:-]+")
        key = (source["kind"], source_id)
        require(key not in seen, "duplicate source identity")
        seen.add(key)
        url = urlsplit(string(source.get("url"), "source URL"))
        require(url.scheme == "https" and url.netloc == host and url.path.rstrip("/") == f"/{pr['base_repo']}/pull/{pr['number']}" and not url.query, "source URL does not belong to PR")
        string(source.get("body_sha256"), "body_sha256", r"[0-9a-f]{64}")
        require(action.get("verdict") in VERDICTS, "invalid verdict")
        string(action.get("reply_body"), "reply_body")
        require(type(action.get("resolve")) is bool, "resolve must be boolean")
        if source["kind"] == "thread":
            positive_int(action.get("root_comment_id"), "root_comment_id")
            string(action.get("thread_id"), "thread_id", r"[A-Za-z0-9_+=:-]+")
        else:
            require(action.get("root_comment_id") is None and action.get("thread_id") is None and not action["resolve"], "non-thread action cannot resolve")
        if action["verdict"] == "needs-human":
            require(not action["resolve"], "needs-human action cannot resolve")
            decision(action.get("decision_context"))
        else:
            require(action.get("decision_context") is None, "decision_context belongs to needs-human")
        require("invariant_key" in action, "missing invariant_key")
        if action["invariant_key"] is not None:
            string(action["invariant_key"], "invariant_key", r"[A-Za-z0-9._:-]{1,120}")
        if "progress" in action:
            progress(action["progress"])
    for tick in array(record.get("body_ticks"), "body_ticks"):
        tick = object_value(tick, "body tick")
        original = string(tick.get("original"), "original checklist bullet")
        require(original.startswith("- [ ] ") and "\n" not in original and "\r" not in original, "invalid checklist bullet")
        require(tick.get("checked") == original.replace("- [ ] ", "- [x] ", 1), "body tick must only check the saved bullet")
        if "progress" in tick:
            progress(tick["progress"])
    for residual in array(record.get("residuals"), "residuals"):
        residual = object_value(residual, "residual")
        require(residual.get("type") == "needs-human", "invalid residual type")
        sources = array(residual.get("sources"), "residual sources")
        require(bool(sources), "residual sources must not be empty")
        for source in sources:
            source = object_value(source, "residual source")
            require(source.get("kind") in KINDS, "invalid residual source kind")
            string(source.get("id"), "residual source id", r"[A-Za-z0-9_+=:-]+")
        decision(residual.get("decision_context"))
        thread_urls = array(residual.get("thread_urls"), "thread_urls")
        require(not any(source["kind"] == "thread" for source in sources) or bool(thread_urls), "thread residual must carry thread_urls")
        for url in thread_urls:
            string(url, "thread URL")
    return record


def unique_keys(pairs: list) -> dict:
    result = {}
    for key, value in pairs:
        require(key not in result, f"duplicate JSON key: {key}")
        result[key] = value
    return result


def reject_constant(value: str) -> None:
    raise ValueError(f"invalid JSON constant: {value}")


def read_record(path: Path) -> tuple[dict, bytes]:
    raw = path.read_bytes()
    record = json.loads(raw.decode("utf-8"), object_pairs_hook=unique_keys,
                        parse_constant=reject_constant)
    return validate(record), raw


def prepared_content(record: dict) -> dict:
    return {
        "schema_version": record["schema_version"],
        "pr": record["pr"], "fix_commit": record["fix_commit"], "verification": record["verification"],
        "actions": [{key: value for key, value in action.items() if key != "progress"} for action in record["actions"]],
        "body_ticks": [{key: value for key, value in tick.items() if key != "progress"} for tick in record["body_ticks"]],
    }


def write_record(path: Path, raw: bytes, *, checkpoint: bool) -> None:
    if checkpoint:
        temporary = None
        try:
            with tempfile.NamedTemporaryFile(dir=path.parent, prefix=".pending-feedback-", delete=False) as temp:
                temporary = Path(temp.name)
                temp.write(raw)
                temp.flush()
                os.fsync(temp.fileno())
            os.replace(temporary, path)
        finally:
            if temporary is not None:
                temporary.unlink(missing_ok=True)
    else:
        descriptor = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(descriptor, "wb") as target:
            target.write(raw)
            target.flush()
            os.fsync(target.fileno())
    read_record(path)


def github_json(host: str, endpoint: str) -> dict:
    result = subprocess.run(
        ["gh", "api", "--hostname", host, "--method", "GET", endpoint],
        capture_output=True, text=True, check=False,
    )
    require(result.returncode == 0, result.stderr.strip() or f"GitHub GET failed: {endpoint}")
    return object_value(json.loads(result.stdout), "GitHub response")


def inspect_publication(record: dict) -> dict:
    proof = {"verified": False, "reason": "", "head_sha": None,
             "head_repo": None, "head_ref": None, "comparison_status": None}
    pr = record["pr"]
    try:
        fresh = github_json(pr["host"], f"repos/{pr['base_repo']}/pulls/{pr['number']}")
        require(fresh.get("number") == pr["number"] and fresh.get("html_url") == pr["url"],
                "fresh PR host/number/URL differs from the saved PR")
        base = object_value(fresh.get("base"), "fresh base")
        require(object_value(base.get("repo"), "fresh base repository").get("full_name") == pr["base_repo"],
                "fresh PR base repository differs from the saved PR")
        head = object_value(fresh.get("head"), "fresh head")
        proof["head_repo"] = object_value(head.get("repo"), "fresh head repository").get("full_name")
        proof["head_ref"] = head.get("ref")
        proof["head_sha"] = string(head.get("sha"), "fresh head SHA", r"[0-9a-f]{40}")
        require(proof["head_repo"] == pr["head_repo"] and proof["head_ref"] == pr["head_ref"],
                "fresh PR head repository/ref differs from the saved PR")
        commit = record["fix_commit"]
        if commit is None:
            proof.update(verified=True, reason="saved batch created no fix commit")
            return proof
        comparison = github_json(pr["host"], f"repos/{proof['head_repo']}/compare/{commit}...{proof['head_sha']}")
        proof["comparison_status"] = comparison.get("status")
        merge_base = object_value(comparison.get("merge_base_commit"), "comparison merge base")
        require(proof["comparison_status"] in {"ahead", "identical"} and merge_base.get("sha") == commit,
                "recorded fix commit is not positively reachable from the fresh PR head")
        proof.update(verified=True, reason="recorded fix commit is reachable from the fresh PR head")
    except (OSError, ValueError, TypeError) as error:
        proof["reason"] = str(error)
    return proof


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    preflight = subcommands.add_parser("preflight")
    preflight.add_argument("--path")
    for command in ("create", "validate", "checkpoint", "inspect-publication"):
        command_parser = subcommands.add_parser(command)
        command_parser.add_argument("--path", required=True)
        if command in {"create", "checkpoint"}:
            command_parser.add_argument("--input", required=True)
    args = parser.parse_args()
    if args.command == "preflight":
        path = Path(args.path).absolute() if args.path else Path(tempfile.mkdtemp(prefix="ce-pending-feedback-")) / "pending.json"
        require(not os.path.lexists(path), "handoff destination already exists")
        require(path.parent.is_dir(), "handoff parent directory does not exist")
        with tempfile.TemporaryFile(dir=path.parent):
            pass
        print(json.dumps({"handoff": str(path)}))
        return
    path = Path(args.path).absolute()
    if args.command in {"validate", "inspect-publication"}:
        record, _ = read_record(path)
    else:
        record, raw = read_record(Path(args.input))
        if args.command == "checkpoint":
            previous, _ = read_record(path)
            require(prepared_content(previous) == prepared_content(record), "checkpoint cannot replace the prepared batch")
        write_record(path, raw, checkpoint=args.command == "checkpoint")
    output = {"handoff": str(path), "record": record}
    if args.command == "inspect-publication":
        output["publication"] = inspect_publication(record)
    print(json.dumps(output, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except (OSError, ValueError, TypeError) as error:
        print(f"pending feedback: {error}", file=sys.stderr)
        sys.exit(1)
