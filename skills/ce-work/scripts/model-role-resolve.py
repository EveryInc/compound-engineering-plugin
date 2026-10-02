#!/usr/bin/env python3
"""Resolve the `model_roles:` map in this repo's CE config into a per-role answer.

Reads `<repo-root>/.compound-engineering/config.local.yaml` (personal) and
`config.yaml` (team) and prints one JSON object to stdout. Exit 0 whenever
resolution ran -- a bad entry, a malformed block, or a missing repository is
data in the JSON, never a traceback. Non-zero only for a bad command line.

    model_roles:
      plan: opus high                # <model> [<effort>]
      work: inherit                  # the session model
      doc-review:                    # review roles also take a list: one seat each
        - opus high
        - inherit
      code-review: [sonnet, opus max]

Only the review roles accept a list. On them a scalar model is one seat, and
`[]` or a scalar `inherit` means no seats.

Layering is per role: the personal entry wins, else the team entry. On a
single-model role an invalid entry is skipped with a warning and the next layer
is used. On a review role the first layer with an entry always wins: an invalid
seat is returned marked `invalid` and the other layer's seats are never used. A
structurally malformed `model_roles` block in either file makes every role
`invalid`, so a review skill can fail closed.

`--role <name>` prints:

    {"role": "...", "state": "unset|inherit|entries|invalid",
     "source": "local|team|null",
     "entries": [{"seat": 1, "model": "...", "effort": "...|null",
                  "family": "claude|codex|grok|composer|unknown",
                  "harness": "...|null", "blocked_by": "...|null"}],
     "effort_scale": [...], "warnings": [...], "errors": [...]}

- A bad seat carries `"invalid": true`, a `reason`, and its `raw` text, with the
  other fields null. An `inherit` seat has model `inherit` and a null family.
- `family` is also the seat's peer key. `harness` is set on `work` entries only:
  the engine harness for the family (composer -> cursor), null when no engine
  route accepts the id (an unknown family, a provider-qualified Codex id, or
  an id with a bracketed qualifier).
- `blocked_by` is set on review seats only: `review_mode_off` when
  `cross_model_review_mode` resolves to `off`, `peers_allowlist` when the
  CROSS_MODEL_PEERS environment variable excludes the seat. A seat in the
  attested host family (`--host-family`) is never blocked; with an unknown host
  family, or an unknown seat family, a named seat is always blocked under
  either policy. An `inherit` seat is never blocked. A `cross_model_review_mode`
  value other than `auto` or `off` is ignored, with a warning on review roles.
- `work` adds `engine_opt_out`: true when the entry comes from the team file
  and the personal file sets `work_engine_mode: off`.

`--all` prints `{"roles": [...], "effort_scale", "warnings", "errors"}`. Each
role carries the fields above plus `existing_keys` (the older keys for the same
step that are set: `{"key", "file", "value"}`, value null for a list or map
key), `effective` (`{"from": "map|existing_key|session|invalid", "value"}`),
and `shadowed` (the existing keys a map entry overrides). Its top-level
`warnings`, and every `--role` answer's, name unknown role keys under
`model_roles`.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys

ROLES = ("brainstorm", "plan", "doc-review", "debug", "work", "simplify", "code-review", "compound")
REVIEW_ROLES = ("doc-review", "code-review")
EFFORT_SCALE = ("low", "medium", "high", "xhigh", "max")
FAMILIES = ("claude", "codex", "grok", "composer", "unknown")
HARNESS = {"claude": "claude", "codex": "codex", "grok": "grok", "composer": "cursor"}
LAYERS = (("local", "config.local.yaml"), ("team", "config.yaml"))  # personal first
INHERIT = ("inherit", None)

_REVIEW_KEYS = ("cross_model_peer", "cross_model_model", "cross_model_effort")
EXISTING_KEYS = {
    "brainstorm": ("brainstorm_model",),
    "plan": ("plan_model",),
    "doc-review": _REVIEW_KEYS,
    "code-review": _REVIEW_KEYS,
    "work": ("work_engine_mode", "work_engine_preferences", "work_engine_effort"),
}
STRUCTURED_KEYS = ("work_engine_preferences", "work_engine_effort")
WORK_ENGINE_MODES = ("off", "prefer", "require")
REVIEW_MODES = ("auto", "off")

# An id may end in one bracketed qualifier, such as a context-window variant: `opus[1m]`.
_MODEL_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._:/-]*(\[[A-Za-z0-9]+\])?")


# --- minimal YAML reader: top-level keys plus the model_roles block ----------

def _strip_comment(line: str) -> str:
    """Drop a trailing comment (a # preceded by whitespace, outside quotes)."""
    out, quote = [], ""
    for i, ch in enumerate(line):
        prev = line[i - 1] if i else " "
        if quote:
            if ch == quote:
                quote = ""
        elif ch in "'\"" and prev in " \t[,:":
            quote = ch
        elif ch == "#" and prev in " \t":
            break
        out.append(ch)
    return "".join(out).rstrip()


def _unquote(raw: str) -> str:
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "'\"":
        return raw[1:-1].strip()
    return raw


def parse_config(path: str) -> dict:
    """One config file as `top` (top-level key -> raw value), `roles` (role key
    -> entry with a value under `model_roles`), `role_lines` (every key under
    `model_roles` -> line), and `errors` (structural problems in that block)."""
    name = os.path.basename(path)
    parsed = {"file": name, "top": {}, "roles": {}, "role_lines": {}, "errors": []}
    if not os.path.isfile(path):
        return parsed
    with open(path, encoding="utf-8-sig", errors="replace") as fh:
        lines = fh.read().splitlines()
    errors, roles = parsed["errors"], parsed["roles"]
    in_block, seen_block, key_indent, pending = False, False, None, None
    for lineno, raw in enumerate(lines, 1):
        line = _strip_comment(raw)
        stripped = line.strip()
        if not stripped:
            continue
        indent = len(line) - len(line.lstrip())
        loc = f"{name}:{lineno}"
        if indent == 0:
            if in_block and stripped.startswith("-"):
                errors.append(f"{loc}: `model_roles:` must be a map of `<role>: <entry>` lines, not a list")
                continue
            key, sep, rest = line.partition(":")
            key, rest = key.strip(), rest.strip()
            in_block, key_indent, pending = False, None, None
            if not sep:
                continue
            parsed["top"].setdefault(key, rest)
            if key == "model_roles":
                if seen_block:
                    errors.append(f"{loc}: `model_roles:` is declared more than once")
                seen_block = in_block = True
                if rest not in ("", "{}"):
                    errors.append(f"{loc}: `model_roles:` must be a block map of `<role>: <entry>` lines (got `{rest}`)")
            continue
        if not in_block:
            continue
        if stripped == "-" or stripped.startswith("- "):
            if pending is None or indent < key_indent:
                errors.append(f"{loc}: list item `{stripped}` under model_roles has no role key that takes a list")
            else:
                pending.append(stripped[1:].strip())
            continue
        if key_indent is None:
            key_indent = indent
        key, sep, rest = stripped.partition(":")
        key, pending = key.strip(), None
        if indent != key_indent or not sep or (rest and not rest[0].isspace()):
            errors.append(
                f"{loc}: unrecognized line under model_roles: `{stripped}` -- expected `<role>: <model> [<effort>]`,"
                " `<role>: inherit`, or a list of those on a review role"
            )
            continue
        if key in parsed["role_lines"]:
            errors.append(f"{loc}: role `{key}` is declared more than once under model_roles")
            continue
        parsed["role_lines"][key] = lineno
        rest = rest.strip()
        if not rest:
            pending = []  # a block list may follow; with no items the entry is unset
            roles[key] = {"line": lineno, "is_list": True, "block": True, "values": pending}
        elif rest.startswith("[") and rest.endswith("]"):
            inner = rest[1:-1].strip()
            roles[key] = {"line": lineno, "is_list": True, "values": inner.split(",") if inner else []}
        else:
            roles[key] = {"line": lineno, "is_list": False, "values": [rest]}
    for key in [k for k, entry in roles.items() if entry.get("block") and not entry["values"]]:
        del roles[key]
    return parsed


def _ordinary_scalar(key: str, layers: list, valid: tuple | None = None):
    """`(value, source)` under the ordinary two-file rule: the first active,
    non-empty, valid value wins, personal file first. `(None, None)` when unset."""
    for source, parsed in layers:
        value = _unquote(parsed["top"].get(key, ""))
        if value and (valid is None or value in valid):
            return value, source
    return None, None


# --- entries -----------------------------------------------------------------

def parse_entry(text: str):
    """`(model, effort)`, INHERIT, or a string saying why the entry is invalid."""
    tokens = _unquote(text).split()
    if not tokens:
        return "empty entry"
    if tokens[0] == "inherit":
        return INHERIT if len(tokens) == 1 else "`inherit` takes no effort"
    if len(tokens) > 2:
        return "expected `<model> [<effort>]`"
    if not _MODEL_RE.fullmatch(tokens[0]):
        return f"`{tokens[0]}` is not a model id"
    # Every route matches ids case-sensitively, so a case variant of a routable id would be
    # classified here and then refused by the route.
    if family(tokens[0]) == "unknown" and family(tokens[0].lower()) != "unknown":
        return f"`{tokens[0]}` is not a model id a route accepts: ids are case-sensitive, write `{tokens[0].lower()}`"
    if len(tokens) == 2 and tokens[1] not in EFFORT_SCALE:
        return f"unknown effort `{tokens[1]}` (expected one of {', '.join(EFFORT_SCALE)})"
    return tokens[0], tokens[1] if len(tokens) == 2 else None


def _engine_harness(model: str, model_family: str) -> str | None:
    """The work engine harness for an entry, or None when no engine route accepts it.
    The engine's routes take an unqualified id only: no bracketed qualifier, and no
    provider prefix on a Codex id. The review workers accept both."""
    if "[" in model or (model_family == "codex" and not re.match(r"gpt-|o\d", model)):
        return None
    return HARNESS.get(model_family)


def family(model: str) -> str:
    name = model.split("[", 1)[0]
    if "/" not in name:
        if name in ("fable", "opus", "sonnet", "haiku") or name.startswith("claude-"):
            return "claude"
        if name.startswith("gpt-") or re.match(r"o\d", name):
            return "codex"
        if name.startswith("grok-"):
            return "grok"
        if name.startswith("composer-"):
            return "composer"
    # The Codex route accepts a provider-qualified id: anything, then `.` or `/`, then a GPT or
    # o-series name. Every other id that reaches this point belongs to no family here.
    if re.fullmatch(r".+[./](?:gpt-|o\d).*", name):
        return "codex"
    return "unknown"


def _blocked_by(seat_family: str, policy: dict) -> str | None:
    host, peers = policy["host"], policy["peers"]
    if host != "unknown" and seat_family == host:
        return None  # same provider as the session: nothing new leaves the machine
    if policy["mode"] == "off":
        return "review_mode_off"
    if peers and (host == "unknown" or seat_family == "unknown" or seat_family not in peers):
        return "peers_allowlist"
    return None


def _seat(number: int, text: str, role: str, policy: dict) -> dict:
    seat = {"seat": number, "model": None, "effort": None, "family": None, "harness": None, "blocked_by": None}
    parsed = parse_entry(text)
    if isinstance(parsed, str):
        seat.update(invalid=True, reason=parsed, raw=_unquote(text))
    elif parsed == INHERIT:
        seat["model"] = "inherit"
    else:
        model, effort = parsed
        seat.update(model=model, effort=effort, family=family(model))
        if role == "work":
            seat["harness"] = _engine_harness(seat["model"], seat["family"])
        if role in REVIEW_ROLES:
            seat["blocked_by"] = _blocked_by(seat["family"], policy)
    return seat


def _layer_entries(role: str, entry: dict, loc: str, warnings: list, policy: dict):
    """This layer's answer for the role: a seat list (empty = inherit), or None
    when the layer's entry is skipped and the next layer decides."""
    values = entry["values"]
    if role in REVIEW_ROLES:
        if not entry["is_list"] and parse_entry(values[0]) == INHERIT:
            return []
        return [_seat(n, text, role, policy) for n, text in enumerate(values, 1)]
    if entry["is_list"]:
        warnings.append(f"{loc}: `{role}` takes one `<model> [<effort>]` entry, not a list; entry skipped")
        return None
    parsed = parse_entry(values[0])
    if isinstance(parsed, str):
        warnings.append(f"{loc}: `{role}` entry `{_unquote(values[0])}` skipped: {parsed}")
        return None
    return [] if parsed == INHERIT else [_seat(1, values[0], role, policy)]


def _role_result(role: str) -> dict:
    result = {"role": role, "state": "unset", "source": None, "entries": []}
    if role == "work":
        result["engine_opt_out"] = False
    result.update(warnings=[], errors=[])
    return result


def resolve_role(role: str, layers: list, policy: dict) -> dict:
    result = _role_result(role)
    block_errors = [error for _, parsed in layers for error in parsed["errors"]]
    if block_errors:
        result.update(state="invalid", errors=block_errors)
        return result
    for source, parsed in layers:
        entry = parsed["roles"].get(role)
        if entry is None:
            continue
        entries = _layer_entries(role, entry, f"{parsed['file']}:{entry['line']}", result["warnings"], policy)
        if entries is None:
            continue
        result.update(state="entries" if entries else "inherit", source=source, entries=entries)
        break
    if role == "work" and result["state"] == "entries" and result["source"] == "team":
        # A personal `work_engine_mode: off` keeps a team entry off any external engine.
        result["engine_opt_out"] = _unquote(layers[0][1]["top"].get("work_engine_mode", "")) == "off"
        if result["engine_opt_out"]:
            # The reason travels with the answer, so a caller can state it without re-reading the file.
            result["warnings"].append(
                "config.local.yaml sets `work_engine_mode: off`: the team `work` entry is not handed to another model"
            )
    return result


# --- --all: effective value, existing keys, shadowing ------------------------

def _existing_keys(role: str, layers: list) -> list:
    found = []
    for key in EXISTING_KEYS.get(role, ()):
        if key in STRUCTURED_KEYS:
            # A present list or map, even an empty one, replaces the whole key.
            source = next((s for s, parsed in layers if key in parsed["top"]), None)
            value = None
        else:
            value, source = _ordinary_scalar(key, layers, WORK_ENGINE_MODES if key == "work_engine_mode" else None)
        if source is not None:
            found.append({"key": key, "file": source, "value": value})
    return found


def _describe(result: dict, existing: list) -> dict:
    if result["state"] == "invalid":
        return {"from": "invalid", "value": None}
    if result["state"] == "inherit":
        return {"from": "map", "value": "inherit"}
    if result["state"] == "entries":
        seats = [e for e in result["entries"] if not e.get("invalid")]
        return {"from": "map", "value": ", ".join(" ".join(filter(None, (e["model"], e["effort"]))) for e in seats)}
    if existing:
        shown = (f"{k['key']}: {'(set)' if k['value'] is None else k['value']}" for k in existing)
        return {"from": "existing_key", "value": "; ".join(shown)}
    return {"from": "session", "value": None}


def resolve_all(layers: list, policy: dict) -> dict:
    roles = []
    for role in ROLES:
        result = resolve_role(role, layers, policy)
        existing = _existing_keys(role, layers)
        result["existing_keys"] = existing
        result["effective"] = _describe(result, existing)
        result["shadowed"] = [k["key"] for k in existing] if result["effective"]["from"] == "map" else []
        roles.append(result)
    errors = [error for _, parsed in layers for error in parsed["errors"]]
    return {"roles": roles, "effort_scale": list(EFFORT_SCALE), "warnings": _unknown_roles(layers), "errors": errors}


def _unknown_roles(layers: list) -> list:
    """One warning per key under `model_roles` that is not a role. Every answer
    carries them, so a misspelled role is reported by the skill it was meant for."""
    return [
        f"{parsed['file']}:{line}: unknown role `{key}` under model_roles is ignored (roles: {', '.join(ROLES)})"
        for _, parsed in layers
        for key, line in parsed["role_lines"].items()
        if key not in ROLES
    ]


# --- entry point -------------------------------------------------------------

def _repo_root() -> str | None:
    """The enclosing checkout's top level: git's answer when git is on PATH,
    otherwise the nearest ancestor of the working directory holding a `.git`
    entry. None when the working directory is not inside a checkout."""
    if shutil.which("git") is not None:
        proc = subprocess.run(["git", "rev-parse", "--show-toplevel"],
                              stdout=subprocess.PIPE, stderr=subprocess.DEVNULL, text=True)
        return proc.stdout.strip() if proc.returncode == 0 else None
    current = os.getcwd()
    while True:
        if os.path.lexists(os.path.join(current, ".git")):
            return current
        parent = os.path.dirname(current)
        if parent == current:
            return None
        current = parent


def _resolve(args) -> dict:
    repo_root = _repo_root()
    cfg_dir = os.path.join(repo_root, ".compound-engineering") if repo_root else None
    layers = [(source, parse_config(os.path.join(cfg_dir, name) if cfg_dir else "")) for source, name in LAYERS]
    peers = {p.strip().lower() for p in os.environ.get("CROSS_MODEL_PEERS", "").split(",") if p.strip()}
    if "cursor" in peers:
        peers.add("composer")  # either name sanctions Cursor
    policy = {
        "host": args.host_family,
        "peers": peers,
        "mode": _ordinary_scalar("cross_model_review_mode", layers, REVIEW_MODES)[0] or "auto",
    }
    # An invalid value falls through like any ordinary key. Say so: a typo here leaves review seats unblocked.
    mode_warnings = [
        f"{parsed['file']}: `cross_model_review_mode: {value}` is not `auto` or `off` and is ignored"
        for _, parsed in layers
        for value in [_unquote(parsed["top"].get("cross_model_review_mode", ""))]
        if value and value not in REVIEW_MODES
    ]
    if args.all:
        out = resolve_all(layers, policy)
        out["warnings"] += mode_warnings
    else:
        out = resolve_role(args.role, layers, policy)
        warnings, errors = out.pop("warnings"), out.pop("errors")
        warnings += _unknown_roles(layers)
        if args.role in REVIEW_ROLES:
            warnings += mode_warnings
        out.update(effort_scale=list(EFFORT_SCALE), warnings=warnings, errors=errors)
    if repo_root is None:
        out["warnings"].append("not inside a git repository; no CE config to read")
    return out


def _failed(args, error: str) -> dict:
    """Every requested role `invalid`: a resolver that could not finish must
    never read as "no map", or a review skill would not fail closed."""
    def role_failed(role: str) -> dict:
        result = _role_result(role)
        result.update(state="invalid", errors=[error])
        return result

    if not args.all:
        result = role_failed(args.role)
        result["effort_scale"] = list(EFFORT_SCALE)
        return result
    roles = [
        dict(role_failed(role), existing_keys=[], effective={"from": "invalid", "value": None}, shadowed=[])
        for role in ROLES
    ]
    return {"roles": roles, "effort_scale": list(EFFORT_SCALE), "warnings": [], "errors": [error]}


def main() -> int:
    parser = argparse.ArgumentParser(description="Resolve the CE model role map.")
    which = parser.add_mutually_exclusive_group(required=True)
    which.add_argument("--role", choices=ROLES, help="answer one role")
    which.add_argument("--all", action="store_true", help="answer every role with its effective value and source")
    parser.add_argument(
        "--host-family", choices=FAMILIES, default="unknown",
        help="the session model's attested family, for the review egress policy (default: unknown)",
    )
    args = parser.parse_args()
    try:
        out = _resolve(args)
    except Exception as exc:  # never a traceback: consumers need valid JSON
        out = _failed(args, f"model role resolver failed unexpectedly: {exc}")
    print(json.dumps(out))
    return 0


if __name__ == "__main__":
    sys.exit(main())
