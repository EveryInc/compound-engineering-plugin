#!/usr/bin/env python3
"""Dependency-free Compound Engineering settings and routing control plane."""

import argparse
import contextlib
import copy
import errno
import fcntl
import hashlib
import hmac
import json
import os
import re
import stat
import subprocess
import sys
import time


PROTOCOL = "ce-routing/v1"
MODEL_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
EFFORT_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
ROUTE_TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
NAME_TOKEN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,63}$")
ID_TOKEN = re.compile(r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
CATALOG_TOKEN = re.compile(r"^[a-z0-9][a-z0-9.-]{0,127}$")
CONFIG_REVISION = re.compile(r"^cecfg-v1:(?:absent|[0-9a-f]{64})$")
SNAPSHOT_ID = re.compile(r"^cesnap-v1:[0-9a-f]{64}$")
SNAPSHOT_MAC = re.compile(r"^[0-9a-f]{64}$")
FALLBACK_TOKEN = re.compile(r"^[a-z0-9][a-z0-9._-]{0,127}$")
MAX_ATTEMPT_HISTORY = 128
ATTEMPT_LOCK_PROTOCOL = "ce-routing-attempt-lock/v1"
SNAPSHOT_AUTH_PROTOCOL = "ce-routing-snapshot-auth/v1"
CONFIG_REPLACE_PROTOCOL = "ce-config-replace/v1"
SNAPSHOT_LIFETIME_SECONDS = 7 * 24 * 60 * 60
SNAPSHOT_CLOCK_SKEW_SECONDS = 5 * 60
MAX_SNAPSHOT_RECORDS = 1024
SNAPSHOT_STATE_ROOT = None
ADAPTER_OUTCOMES = ("ok", "unavailable", "failed")
COMPATIBILITY_KEYS = (
    "plan_model",
    "brainstorm_model",
    "cross_model_peer",
    "work_engine_mode",
    "work_engine_preferences",
)
COMPATIBILITY_ROLE_SPECS = {
    "ce-plan.plan-author": ("plan-model", ("plan_model",)),
    "ce-brainstorm.approach-generator": ("brainstorm-model", ("brainstorm_model",)),
    "ce-code-review.adversarial-reviewer": ("cross-model-peer", ("cross_model_peer",)),
    "ce-doc-review.product-lens-peer": ("cross-model-peer", ("cross_model_peer",)),
    "ce-doc-review.security-lens-peer": ("cross-model-peer", ("cross_model_peer",)),
    "ce-doc-review.adversarial-document-peer": ("cross-model-peer", ("cross_model_peer",)),
    "ce-doc-review.whole-doc-peer": ("cross-model-peer", ("cross_model_peer",)),
    "ce-pov.panel-peer": ("cross-model-peer", ("cross_model_peer",)),
    "ce-work.implementation-worker": (
        "work-engine",
        ("work_engine_mode", "work_engine_preferences"),
    ),
}
O_NOFOLLOW = getattr(os, "O_NOFOLLOW", 0)
O_DIRECTORY = getattr(os, "O_DIRECTORY", 0)
TRUSTED_GIT = None


def transaction_boundary(_name):
    """Test seam for terminating a subprocess at durable replacement boundaries."""


class RoutingError(Exception):
    def __init__(self, code, message, exit_code=3, **details):
        super().__init__(message)
        self.code = code
        self.message = message
        self.exit_code = exit_code
        self.details = details

    def response(self):
        error = {"code": self.code, "message": self.message}
        error.update(self.details)
        return {"ok": False, "protocol": PROTOCOL, "error": error}


def canonical_json(value):
    return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)


def digest(prefix, value):
    data = value if isinstance(value, bytes) else canonical_json(value).encode("ascii")
    return "{}:{}".format(prefix, hashlib.sha256(data).hexdigest())


def asset_path(canonical_name, generated_name):
    script_dir = os.path.dirname(os.path.realpath(__file__))
    candidates = (
        os.path.join(script_dir, canonical_name),
        os.path.join(os.path.dirname(script_dir), "references", generated_name),
    )
    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate
    raise RoutingError("ASSET_INVALID", "required routing asset is missing", asset=generated_name)


def load_json_asset(canonical_name, generated_name):
    path = asset_path(canonical_name, generated_name)
    try:
        with open(path, "rb") as stream:
            data = stream.read(1024 * 1024 + 1)
        if len(data) > 1024 * 1024:
            raise ValueError("asset exceeds size limit")
        value = json.loads(data.decode("utf-8"))
    except RoutingError:
        raise
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        raise RoutingError("ASSET_INVALID", "routing asset is malformed", asset=generated_name) from exc
    if not isinstance(value, dict):
        raise RoutingError("ASSET_INVALID", "routing asset root must be an object", asset=generated_name)
    return value


def load_consumer_identity():
    value = load_json_asset("consumer-identity.json", "ce-routing-consumer.json")
    if value.get("version") != 1 or set(value) != {"version", "consumer"}:
        raise RoutingError("ASSET_INVALID", "routing consumer identity has an invalid shape")
    consumer = value.get("consumer")
    if not isinstance(consumer, str) or not NAME_TOKEN.fullmatch(consumer):
        raise RoutingError("ASSET_INVALID", "routing consumer identity is malformed")
    return consumer


def validate_role_catalog(value):
    classes = value.get("classes")
    roles = value.get("roles")
    if value.get("version") != 1 or not isinstance(classes, list) or not classes or not isinstance(roles, dict):
        raise RoutingError("ASSET_INVALID", "dispatch role catalog has an invalid shape")
    if len(classes) != len(set(classes)):
        raise RoutingError("ASSET_INVALID", "dispatch role classes must be unique")
    for class_name in classes:
        if not isinstance(class_name, str) or not CATALOG_TOKEN.fullmatch(class_name):
            raise RoutingError("ASSET_INVALID", "dispatch role class is malformed")
    for role, metadata in roles.items():
        if not isinstance(role, str) or not CATALOG_TOKEN.fullmatch(role) or not isinstance(metadata, dict):
            raise RoutingError("ASSET_INVALID", "dispatch role metadata is malformed", role=role)
        for field in ("class", "owner", "adapter_family", "built_in_tier"):
            field_value = metadata.get(field)
            if not isinstance(field_value, str) or not CATALOG_TOKEN.fullmatch(field_value):
                raise RoutingError(
                    "ASSET_INVALID",
                    "dispatch role metadata field '{}' is malformed".format(field),
                    role=role,
                )
    return value


def require_runtime():
    safe_path = getattr(sys.flags, "safe_path", None)
    if not (sys.flags.isolated and sys.flags.no_site) or (safe_path is not None and not safe_path):
        raise RoutingError(
            "RUNTIME_UNSUPPORTED",
            "invoke the routing resolver with python3 -I -S",
        )


class FlowParser:
    def __init__(self, text, line, limits, counter):
        self.text = text
        self.line = line
        self.i = 0
        self.limits = limits
        self.counter = counter

    def error(self, message, code="YAML_SYNTAX"):
        raise RoutingError(code, message, line=self.line, column=self.i + 1)

    def skip_space(self):
        while self.i < len(self.text) and self.text[self.i].isspace():
            self.i += 1

    def bump(self):
        self.counter[0] += 1
        if self.counter[0] > self.limits["max_nodes"]:
            self.error("YAML node limit exceeded", "YAML_UNSUPPORTED")

    def parse(self):
        value = self.value()
        self.skip_space()
        if self.i != len(self.text):
            self.error("unexpected trailing flow content")
        return value

    def value(self):
        self.skip_space()
        if self.i >= len(self.text):
            self.error("expected a value")
        char = self.text[self.i]
        if char == "{":
            return self.mapping()
        if char == "[":
            return self.sequence()
        if char == '"':
            return self.double_quoted()
        if char == "'":
            return self.single_quoted()
        return self.plain(",]}")

    def double_quoted(self):
        try:
            value, consumed = json.JSONDecoder().raw_decode(self.text[self.i:])
        except ValueError as exc:
            self.error("invalid double-quoted string")
        if not isinstance(value, str):
            self.error("quoted YAML value must be a string")
        self.i += consumed
        self.bump()
        self.scalar_bound(value)
        return value

    def single_quoted(self):
        self.i += 1
        out = []
        while self.i < len(self.text):
            char = self.text[self.i]
            self.i += 1
            if char == "'":
                if self.i < len(self.text) and self.text[self.i] == "'":
                    out.append("'")
                    self.i += 1
                    continue
                value = "".join(out)
                self.bump()
                self.scalar_bound(value)
                return value
            out.append(char)
        self.error("unterminated single-quoted string")

    def scalar_bound(self, value):
        if len(value.encode("utf-8")) > self.limits["max_scalar_bytes"]:
            self.error("YAML scalar limit exceeded", "YAML_UNSUPPORTED")

    def plain(self, stops):
        start = self.i
        while self.i < len(self.text) and self.text[self.i] not in stops:
            self.i += 1
        token = self.text[start:self.i].strip()
        if not token:
            self.error("empty plain value")
        if token.startswith(("&", "*", "!", "|", ">")) or token in ("---", "..."):
            self.error("YAML anchors, aliases, tags, directives, and block scalars are unsupported", "YAML_UNSUPPORTED")
        self.bump()
        if token == "null" or token == "~":
            return None
        if token == "true":
            return True
        if token == "false":
            return False
        if re.fullmatch(r"-?(?:0|[1-9][0-9]*)", token):
            return int(token)
        if re.fullmatch(r"[-+]?(?:[0-9]+\.[0-9]*|[0-9]*\.[0-9]+)(?:[eE][-+]?[0-9]+)?", token):
            self.error("floating point YAML values are unsupported", "YAML_UNSUPPORTED")
        self.scalar_bound(token)
        return token

    def mapping_key(self):
        self.skip_space()
        if self.i >= len(self.text):
            self.error("expected mapping key")
        if self.text[self.i] == '"':
            return self.double_quoted()
        if self.text[self.i] == "'":
            return self.single_quoted()
        start = self.i
        while self.i < len(self.text) and self.text[self.i] != ":":
            if self.text[self.i] in "{},[]":
                self.error("invalid flow mapping key")
            self.i += 1
        key = self.text[start:self.i].strip()
        if not key or key == "<<" or key.startswith(("&", "*", "!")):
            self.error("unsupported flow mapping key", "YAML_UNSUPPORTED")
        self.scalar_bound(key)
        return key

    def mapping(self):
        self.i += 1
        result = {}
        self.bump()
        self.skip_space()
        if self.i < len(self.text) and self.text[self.i] == "}":
            self.i += 1
            return result
        while True:
            if len(result) >= self.limits["max_collection_entries"]:
                self.error("YAML collection entry limit exceeded", "YAML_UNSUPPORTED")
            key = self.mapping_key()
            self.skip_space()
            if self.i >= len(self.text) or self.text[self.i] != ":":
                self.error("expected ':' in flow mapping")
            self.i += 1
            value = self.value()
            if key in result:
                self.error("duplicate YAML key '{}'".format(key), "YAML_DUPLICATE_KEY")
            result[key] = value
            self.skip_space()
            if self.i >= len(self.text):
                self.error("unterminated flow mapping")
            char = self.text[self.i]
            self.i += 1
            if char == "}":
                return result
            if char != ",":
                self.error("expected ',' or '}' in flow mapping")

    def sequence(self):
        self.i += 1
        result = []
        self.bump()
        self.skip_space()
        if self.i < len(self.text) and self.text[self.i] == "]":
            self.i += 1
            return result
        while True:
            if len(result) >= self.limits["max_collection_entries"]:
                self.error("YAML collection entry limit exceeded", "YAML_UNSUPPORTED")
            result.append(self.value())
            self.skip_space()
            if self.i >= len(self.text):
                self.error("unterminated flow sequence")
            char = self.text[self.i]
            self.i += 1
            if char == "]":
                return result
            if char != ",":
                self.error("expected ',' or ']' in flow sequence")


def strip_comment(raw, line):
    quote = None
    escaped = False
    flow_depth = 0
    for index, char in enumerate(raw):
        if quote == '"':
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quote = None
            continue
        if quote == "'":
            if char == "'":
                if index + 1 < len(raw) and raw[index + 1] == "'":
                    continue
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char in "[{":
            flow_depth += 1
        elif char in "]}":
            flow_depth -= 1
            if flow_depth < 0:
                raise RoutingError("YAML_SYNTAX", "unbalanced flow delimiter", line=line, column=index + 1)
        elif char == "#" and (index == 0 or raw[index - 1].isspace()):
            return raw[:index].rstrip()
    if quote is not None or flow_depth != 0:
        raise RoutingError("YAML_SYNTAX", "unterminated quoted or flow value", line=line)
    return raw.rstrip()


def split_mapping(text, line):
    quote = None
    escaped = False
    depth = 0
    for index, char in enumerate(text):
        if quote == '"':
            if escaped:
                escaped = False
            elif char == "\\":
                escaped = True
            elif char == '"':
                quote = None
            continue
        if quote == "'":
            if char == "'":
                quote = None
            continue
        if char in ('"', "'"):
            quote = char
        elif char in "[{":
            depth += 1
        elif char in "]}":
            depth -= 1
        elif char == ":" and depth == 0:
            key = text[:index].strip()
            if not key:
                raise RoutingError("YAML_SYNTAX", "empty mapping key", line=line, column=index + 1)
            return key, text[index + 1:].strip()
    return None


class YamlSubset:
    def __init__(self, text, limits):
        self.limits = limits
        self.rows = []
        self.i = 0
        self.counter = [0]
        if "\x00" in text:
            raise RoutingError("YAML_UNSUPPORTED", "NUL is not allowed in YAML")
        for number, raw in enumerate(text.splitlines(), 1):
            if "\t" in raw:
                raise RoutingError("YAML_UNSUPPORTED", "tabs are not allowed in YAML", line=number)
            clean = strip_comment(raw, number)
            if not clean.strip():
                continue
            indent = len(clean) - len(clean.lstrip(" "))
            if indent % 2:
                raise RoutingError("YAML_SYNTAX", "indentation must use two-space steps", line=number)
            content = clean[indent:]
            if content.startswith("%") or content in ("---", "..."):
                raise RoutingError("YAML_UNSUPPORTED", "YAML directives and document markers are unsupported", line=number)
            self.rows.append((indent, content, number))

    def bump(self, line):
        self.counter[0] += 1
        if self.counter[0] > self.limits["max_nodes"]:
            raise RoutingError("YAML_UNSUPPORTED", "YAML node limit exceeded", line=line)

    def parse(self):
        if not self.rows:
            return {}
        if self.rows[0][0] != 0:
            raise RoutingError("YAML_SYNTAX", "root mapping must start at column one", line=self.rows[0][2])
        value = self.block(0, 0)
        if self.i != len(self.rows):
            raise RoutingError("YAML_SYNTAX", "unexpected YAML content", line=self.rows[self.i][2])
        if not isinstance(value, dict):
            raise RoutingError("YAML_SYNTAX", "YAML root must be a mapping", line=self.rows[0][2])
        return value

    @staticmethod
    def is_sequence(content):
        return content == "-" or content.startswith("- ")

    def block(self, indent, depth):
        if depth > self.limits["max_depth"]:
            raise RoutingError("YAML_UNSUPPORTED", "YAML nesting limit exceeded", line=self.rows[self.i][2])
        if self.is_sequence(self.rows[self.i][1]):
            return self.sequence(indent, depth)
        return self.mapping(indent, depth)

    def key(self, token, line):
        token = token.strip()
        if token.startswith(("&", "*", "!")) or token == "<<":
            raise RoutingError("YAML_UNSUPPORTED", "YAML anchors, aliases, tags, and merge keys are unsupported", line=line)
        if token.startswith('"'):
            try:
                key = json.loads(token)
            except ValueError as exc:
                raise RoutingError("YAML_SYNTAX", "invalid quoted mapping key", line=line) from exc
            if not isinstance(key, str):
                raise RoutingError("YAML_SYNTAX", "mapping key must be a string", line=line)
            return key
        if token.startswith("'") and token.endswith("'") and len(token) >= 2:
            return token[1:-1].replace("''", "'")
        if any(char in token for char in "{}[],#"):
            raise RoutingError("YAML_SYNTAX", "invalid plain mapping key", line=line)
        return token

    def scalar(self, text, line):
        return FlowParser(text, line, self.limits, self.counter).parse()

    def nested_value(self, parent_indent, depth):
        if self.i >= len(self.rows):
            return None
        next_indent, next_content, _ = self.rows[self.i]
        if next_indent == parent_indent and self.is_sequence(next_content):
            return self.sequence(parent_indent, depth + 1)
        if next_indent <= parent_indent:
            return None
        if next_indent != parent_indent + 2:
            raise RoutingError("YAML_SYNTAX", "nested content must indent by two spaces", line=self.rows[self.i][2])
        return self.block(next_indent, depth + 1)

    def mapping(self, indent, depth):
        result = {}
        self.bump(self.rows[self.i][2])
        while self.i < len(self.rows):
            current_indent, content, line = self.rows[self.i]
            if current_indent < indent:
                break
            if current_indent > indent:
                raise RoutingError("YAML_SYNTAX", "orphan indented mapping value", line=line)
            if self.is_sequence(content):
                break
            pair = split_mapping(content, line)
            if pair is None:
                raise RoutingError("YAML_SYNTAX", "expected ':' in mapping", line=line)
            key_token, rest = pair
            key = self.key(key_token, line)
            if key in result:
                raise RoutingError("YAML_DUPLICATE_KEY", "duplicate YAML key '{}'".format(key), line=line)
            if len(result) >= self.limits["max_collection_entries"]:
                raise RoutingError("YAML_UNSUPPORTED", "YAML collection entry limit exceeded", line=line)
            self.i += 1
            value = self.scalar(rest, line) if rest else self.nested_value(indent, depth)
            result[key] = value
        return result

    def sequence_item_mapping(self, first, indent, depth, line):
        result = {}
        pair = split_mapping(first, line)
        if pair is None:
            raise RoutingError("YAML_SYNTAX", "expected mapping entry after '-'", line=line)
        key_token, rest = pair
        key = self.key(key_token, line)
        result[key] = self.scalar(rest, line) if rest else self.nested_value(indent, depth)
        continuation_indent = indent + 2
        while self.i < len(self.rows):
            current_indent, content, current_line = self.rows[self.i]
            if current_indent < continuation_indent:
                break
            if current_indent > continuation_indent:
                raise RoutingError("YAML_SYNTAX", "orphan sequence mapping value", line=current_line)
            if self.is_sequence(content):
                break
            pair = split_mapping(content, current_line)
            if pair is None:
                raise RoutingError("YAML_SYNTAX", "expected ':' in sequence mapping", line=current_line)
            key_token, rest = pair
            key = self.key(key_token, current_line)
            if key in result:
                raise RoutingError("YAML_DUPLICATE_KEY", "duplicate YAML key '{}'".format(key), line=current_line)
            self.i += 1
            result[key] = self.scalar(rest, current_line) if rest else self.nested_value(continuation_indent, depth)
        return result

    def sequence(self, indent, depth):
        result = []
        self.bump(self.rows[self.i][2])
        while self.i < len(self.rows):
            current_indent, content, line = self.rows[self.i]
            if current_indent != indent or not self.is_sequence(content):
                break
            if len(result) >= self.limits["max_collection_entries"]:
                raise RoutingError("YAML_UNSUPPORTED", "YAML collection entry limit exceeded", line=line)
            rest = content[1:].strip()
            self.i += 1
            if not rest:
                value = self.nested_value(indent, depth)
            elif rest.startswith(("{", "[", '"', "'")):
                value = self.scalar(rest, line)
            elif split_mapping(rest, line) is not None:
                value = self.sequence_item_mapping(rest, indent, depth + 1, line)
            else:
                value = self.scalar(rest, line)
            result.append(value)
        return result


def parse_yaml(data, limits):
    try:
        text = data.decode("utf-8")
    except UnicodeDecodeError as exc:
        raise RoutingError("YAML_SYNTAX", "configuration is not valid UTF-8") from exc
    return YamlSubset(text, limits).parse()


def mode_bits(st):
    return stat.S_IMODE(st.st_mode)


def current_uid():
    return os.geteuid() if hasattr(os, "geteuid") else None


def validate_owned_path_component(path, expect_dir, final=False):
    try:
        st = os.lstat(path)
    except FileNotFoundError:
        return None
    except OSError as exc:
        raise RoutingError("CONFIG_IO", "cannot inspect configuration path", path=path) from exc
    if stat.S_ISLNK(st.st_mode):
        raise RoutingError("CONFIG_UNSAFE", "configuration path contains a symlink", reason="symlink", path=path)
    if expect_dir and not stat.S_ISDIR(st.st_mode):
        raise RoutingError("CONFIG_UNSAFE", "configuration parent is not a directory", reason="not_directory", path=path)
    if final and not stat.S_ISREG(st.st_mode):
        raise RoutingError("CONFIG_UNSAFE", "configuration is not a regular file", reason="not_regular", path=path)
    if current_uid() is not None and st.st_uid != current_uid():
        raise RoutingError("CONFIG_UNSAFE", "configuration path is not owned by the current user", reason="owner", path=path)
    if mode_bits(st) & 0o022:
        raise RoutingError("CONFIG_UNSAFE", "configuration path is group/world writable", reason="mode", path=path)
    return st


def validate_relative_components(anchor, path):
    anchor = os.path.abspath(anchor)
    path = os.path.abspath(path)
    try:
        if os.path.commonpath((anchor, path)) != anchor:
            raise RoutingError("CONFIG_UNSAFE", "configuration path escapes its trust root", reason="escape", path=path)
    except ValueError as exc:
        raise RoutingError("CONFIG_UNSAFE", "configuration path escapes its trust root", reason="escape", path=path) from exc
    validate_owned_path_component(anchor, True)
    relative = os.path.relpath(path, anchor)
    current = anchor
    parts = [] if relative == "." else relative.split(os.sep)
    for index, part in enumerate(parts):
        if part in ("", ".", ".."):
            raise RoutingError("CONFIG_UNSAFE", "configuration path is malformed", reason="escape", path=path)
        current = os.path.join(current, part)
        final = index == len(parts) - 1
        st = validate_owned_path_component(current, not final, final=final)
        if st is None:
            return False
    return True


def trusted_system_executable(name):
    search = []
    try:
        search.extend(os.confstr("CS_PATH").split(os.pathsep))
    except (AttributeError, OSError, TypeError, ValueError):
        pass
    search.extend(("/usr/bin", "/bin"))
    search.extend(os.environ.get("PATH", "").split(os.pathsep))
    seen = set()
    for directory in search:
        if not directory or not os.path.isabs(directory):
            continue
        candidate = os.path.realpath(os.path.join(directory, name))
        if candidate in seen:
            continue
        seen.add(candidate)
        try:
            if not os.path.isfile(candidate) or not os.access(candidate, os.X_OK):
                continue
            current = os.path.sep
            components = [part for part in candidate.split(os.sep) if part]
            safe = True
            for index, component in enumerate(components):
                current = os.path.join(current, component)
                st = os.lstat(current)
                if stat.S_ISLNK(st.st_mode) or st.st_uid != 0 or mode_bits(st) & 0o022:
                    safe = False
                    break
                if index == len(components) - 1 and not stat.S_ISREG(st.st_mode):
                    safe = False
                    break
            if safe:
                return candidate
        except OSError:
            continue
    raise RoutingError(
        "RUNTIME_UNSUPPORTED",
        "a trusted system Git executable is unavailable",
    )


def sanitized_git_env():
    env = {
        key: value
        for key, value in os.environ.items()
        if not key.startswith("GIT_") and key not in ("HOME", "XDG_CONFIG_HOME")
    }
    env.update(
        {
            "PATH": os.defpath,
            "HOME": os.path.sep,
            "GIT_ATTR_NOSYSTEM": "1",
            "GIT_CONFIG_GLOBAL": os.devnull,
            "GIT_CONFIG_NOSYSTEM": "1",
            "GIT_OPTIONAL_LOCKS": "0",
            "GIT_TERMINAL_PROMPT": "0",
            "LC_ALL": "C",
        }
    )
    return env


def git(repo, *args):
    global TRUSTED_GIT
    if TRUSTED_GIT is None:
        TRUSTED_GIT = trusted_system_executable("git")
    return subprocess.run(
        [TRUSTED_GIT, "-C", repo, *args],
        capture_output=True,
        check=False,
        env=sanitized_git_env(),
    )


def project_root(cwd):
    proc = git(cwd, "rev-parse", "--show-toplevel")
    if proc.returncode != 0:
        return None
    try:
        return os.path.realpath(proc.stdout.decode("utf-8", "strict").strip())
    except UnicodeDecodeError as exc:
        raise RoutingError("CONFIG_PATH_INVALID", "repository root is not valid UTF-8") from exc


def project_path_state(repo, path):
    relative = os.path.relpath(path, repo).replace(os.sep, "/")
    tracked = git(repo, "ls-files", "--error-unmatch", "--", relative).returncode == 0
    ignored = git(repo, "check-ignore", "-q", "--", relative).returncode == 0
    return tracked, ignored


def global_config_path():
    if "COMPOUND_ENGINEERING_HOME" in os.environ:
        root = os.environ["COMPOUND_ENGINEERING_HOME"]
        if not root or not os.path.isabs(root):
            raise RoutingError("CONFIG_PATH_INVALID", "COMPOUND_ENGINEERING_HOME must be an absolute directory")
        return os.path.abspath(root), os.path.join(os.path.abspath(root), "config.yaml")
    xdg = os.environ.get("XDG_CONFIG_HOME")
    if xdg:
        if not os.path.isabs(xdg):
            raise RoutingError("CONFIG_PATH_INVALID", "XDG_CONFIG_HOME must be absolute")
        root = os.path.join(os.path.abspath(xdg), "compound-engineering")
        return root, os.path.join(root, "config.yaml")
    home = os.environ.get("HOME")
    if not home or not os.path.isabs(home):
        raise RoutingError("CONFIG_PATH_INVALID", "HOME must be an absolute directory")
    root = os.path.join(os.path.abspath(home), ".config", "compound-engineering")
    return root, os.path.join(root, "config.yaml")


def file_identity(st):
    return (
        st.st_dev,
        st.st_ino,
        st.st_size,
        st.st_mtime_ns,
        getattr(st, "st_ctime_ns", int(st.st_ctime * 1000000000)),
    )


def read_descriptor(path, cap):
    try:
        fd = os.open(path, os.O_RDONLY | O_NOFOLLOW)
    except OSError as exc:
        reason = "symlink" if getattr(exc, "errno", None) == getattr(os, "ELOOP", 40) else "open"
        raise RoutingError("CONFIG_UNSAFE", "cannot safely open configuration", reason=reason, path=path) from exc
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise RoutingError("CONFIG_UNSAFE", "configuration is not a regular file", reason="not_regular", path=path)
        if current_uid() is not None and before.st_uid != current_uid():
            raise RoutingError("CONFIG_UNSAFE", "configuration is not user-owned", reason="owner", path=path)
        if mode_bits(before) & 0o022:
            raise RoutingError("CONFIG_UNSAFE", "configuration is group/world writable", reason="mode", path=path)
        if before.st_size > cap:
            raise RoutingError("CONFIG_TOO_LARGE", "configuration exceeds size limit", path=path, limit=cap)
        chunks = []
        total = 0
        while total <= cap:
            part = os.read(fd, min(65536, cap + 1 - total))
            if not part:
                break
            chunks.append(part)
            total += len(part)
        if total > cap:
            raise RoutingError("CONFIG_TOO_LARGE", "configuration grew beyond size limit", path=path, limit=cap)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    try:
        current = os.stat(path, follow_symlinks=False)
    except OSError as exc:
        raise RoutingError("CONFIG_CHANGED", "configuration changed during read", path=path) from exc
    identity_before = file_identity(before)
    identity_after = file_identity(after)
    identity_current = file_identity(current)
    if identity_before != identity_after or identity_after != identity_current:
        raise RoutingError("CONFIG_CHANGED", "configuration changed during read", path=path)
    return b"".join(chunks), identity_after


def absent_source(layer, path, authority_trusted=False, ignored=False):
    return {
        "layer": layer,
        "path": path,
        "exists": False,
        "revision": "cecfg-v1:absent",
        "trusted": True,
        "authority_trusted": authority_trusted,
        "ignored": ignored,
        "data": {},
        "raw": b"",
        "identity": None,
        "diagnostics": [],
    }


def read_source(layer, anchor, path, limits, repo=None):
    exists = validate_relative_components(anchor, path)
    ignored = False
    authority_trusted = layer == "global"
    if repo is not None:
        tracked, ignored = project_path_state(repo, path)
        real_relative = os.path.relpath(os.path.realpath(path), repo).replace(os.sep, "/")
        physically_tracked = git(repo, "ls-files", "--error-unmatch", "--", real_relative).returncode == 0
        if tracked or physically_tracked:
            raise RoutingError("CONFIG_UNSAFE", "tracked project configuration is not trusted", reason="tracked", path=path)
        authority_trusted = ignored
    if not exists:
        return absent_source(layer, path, authority_trusted=authority_trusted, ignored=ignored)
    raw, identity = read_descriptor(path, limits["config_bytes"])
    return {
        "layer": layer,
        "path": path,
        "exists": True,
        "revision": digest("cecfg-v1", raw),
        "trusted": True,
        "authority_trusted": authority_trusted,
        "ignored": ignored,
        "data": parse_yaml(raw, limits),
        "raw": raw,
        "identity": identity,
        "diagnostics": [],
    }


def validate_token(value, pattern, name):
    if not isinstance(value, str) or not pattern.fullmatch(value):
        raise RoutingError("SETTING_INVALID", "invalid {}".format(name), setting=name)
    return value


def validate_structured(value, type_name, schema, source, setting):
    spec = schema["structured_types"][type_name]
    if not isinstance(value, dict):
        raise RoutingError("SETTING_INVALID", "{} entries must be mappings".format(setting), setting=setting)
    unknown = set(value) - set(spec["fields"])
    if unknown:
        raise RoutingError("SETTING_INVALID", "unknown {} field '{}'".format(setting, sorted(unknown)[0]), setting=setting)
    missing = [field for field in spec.get("required", []) if field not in value]
    if missing:
        raise RoutingError("SETTING_INVALID", "{} entry is missing '{}'".format(setting, missing[0]), setting=setting)
    out = {}
    for field, field_spec in spec["fields"].items():
        if field not in value:
            if "default" in field_spec:
                out[field] = copy.deepcopy(field_spec["default"])
            continue
        out[field] = validate_value(value[field], field_spec, schema, source, "{}.{}".format(setting, field))
    return out


def validate_candidate(value, schema, source, setting):
    if value == "ce-default":
        return "ce-default"
    return validate_structured(value, "execution_candidate", schema, source, setting)


def validate_binding(value, schema, setting):
    if value in ("inherit", "ce-default"):
        return value
    if not isinstance(value, dict) or set(value) != {"profile", "policy"}:
        raise RoutingError("SETTING_INVALID", "{} must be inherit, ce-default, or profile/policy".format(setting), setting=setting)
    profile = validate_token(value["profile"], NAME_TOKEN, "profile")
    if value["policy"] not in ("prefer", "require"):
        raise RoutingError("SETTING_INVALID", "{} policy must be prefer or require".format(setting), setting=setting)
    return {"profile": profile, "policy": value["policy"]}


def validate_intent_binding(value, schema):
    if not isinstance(value, dict) or set(value) != {"policy", "candidates"}:
        return validate_binding(value, schema, "intent.binding")
    if value["policy"] not in ("prefer", "require"):
        raise RoutingError("SETTING_INVALID", "intent.binding policy must be prefer or require", setting="intent.binding")
    candidates = value["candidates"]
    if not isinstance(candidates, list) or not candidates:
        raise RoutingError("SETTING_INVALID", "intent.binding candidates must be a non-empty list", setting="intent.binding")
    source = {"authority_trusted": True, "diagnostics": []}
    candidates = [validate_candidate(item, schema, source, "intent.binding.candidates") for item in candidates]
    if "ce-default" in candidates and candidates[-1] != "ce-default":
        raise RoutingError("SETTING_INVALID", "ce-default must be the final intent candidate", setting="intent.binding")
    return {"policy": value["policy"], "candidates": candidates}


def validate_routing(value, schema, roles, source):
    if value is None:
        return None
    if not isinstance(value, dict):
        raise RoutingError("SETTING_INVALID", "routing must be a mapping", setting="routing")
    unknown = set(value) - {"profiles", "classes", "roles"}
    if unknown:
        raise RoutingError("SETTING_INVALID", "unknown routing field '{}'".format(sorted(unknown)[0]), setting="routing")
    result = {"profiles": {}, "classes": {}, "roles": {}}
    profiles = value.get("profiles", {})
    if not isinstance(profiles, dict):
        raise RoutingError("SETTING_INVALID", "routing.profiles must be a mapping", setting="routing.profiles")
    for name, profile in profiles.items():
        validate_token(name, NAME_TOKEN, "profile")
        if not isinstance(profile, dict) or set(profile) != {"candidates"} or not isinstance(profile["candidates"], list) or not profile["candidates"]:
            raise RoutingError("SETTING_INVALID", "profile '{}' must contain a non-empty candidates list".format(name), setting="routing.profiles")
        candidates = [validate_candidate(item, schema, source, "routing.profiles.{}.candidates".format(name)) for item in profile["candidates"]]
        if "ce-default" in candidates and candidates[-1] != "ce-default":
            raise RoutingError("SETTING_INVALID", "ce-default must be the final profile candidate", setting="routing.profiles")
        result["profiles"][name] = {"candidates": candidates}
    classes = value.get("classes", {})
    if not isinstance(classes, dict):
        raise RoutingError("SETTING_INVALID", "routing.classes must be a mapping", setting="routing.classes")
    for class_name, binding in classes.items():
        if class_name not in roles["classes"]:
            raise RoutingError("REFERENCE_UNKNOWN", "unknown route class '{}'".format(class_name), setting="routing.classes")
        result["classes"][class_name] = validate_binding(binding, schema, "routing.classes.{}".format(class_name))
    role_bindings = value.get("roles", {})
    if not isinstance(role_bindings, dict):
        raise RoutingError("SETTING_INVALID", "routing.roles must be a mapping", setting="routing.roles")
    for role, binding in role_bindings.items():
        if role not in roles["roles"]:
            raise RoutingError("REFERENCE_UNKNOWN", "unknown dispatch role '{}'".format(role), setting="routing.roles")
        result["roles"][role] = validate_binding(binding, schema, "routing.roles.{}".format(role))
    return result


def validate_value(value, spec, schema, source, setting):
    if value is None:
        if spec.get("nullable"):
            return None
        raise RoutingError("SETTING_INVALID", "{} may not be null".format(setting), setting=setting)
    value_type = spec["type"]
    if value_type == "string":
        if not isinstance(value, str):
            raise RoutingError("SETTING_INVALID", "{} must be a string".format(setting), setting=setting)
        return value
    if value_type == "boolean":
        if not isinstance(value, bool):
            raise RoutingError("SETTING_INVALID", "{} must be true or false".format(setting), setting=setting)
        return value
    if value_type == "integer":
        if isinstance(value, bool) or not isinstance(value, int):
            raise RoutingError("SETTING_INVALID", "{} must be an integer".format(setting), setting=setting)
        if value < spec.get("minimum", value) or value > spec.get("maximum", value):
            raise RoutingError("SETTING_INVALID", "{} is outside its supported range".format(setting), setting=setting)
        return value
    if value_type == "enum":
        if not isinstance(value, str):
            raise RoutingError("SETTING_INVALID", "{} must be a string enum".format(setting), setting=setting)
        normalized = value.lower() if spec.get("casefold") else value
        if normalized not in spec["values"]:
            raise RoutingError("SETTING_INVALID", "invalid value for {}".format(setting), setting=setting)
        return normalized
    if value_type == "model-token":
        return validate_token(value, MODEL_TOKEN, setting)
    if value_type == "effort-token":
        return validate_token(value, EFFORT_TOKEN, setting)
    if value_type == "route-token":
        return validate_token(value, ROUTE_TOKEN, setting)
    if value_type == "id-token":
        return validate_token(value, ID_TOKEN, setting)
    if value_type == "profile-name":
        return validate_token(value, NAME_TOKEN, setting)
    if value_type == "list":
        if not isinstance(value, list):
            raise RoutingError("SETTING_INVALID", "{} must be a list".format(setting), setting=setting)
        out = [validate_structured(item, spec["items"], schema, source, setting) for item in value]
        if spec["items"] == "feedback_source":
            ids = [item["id"] for item in out]
            if len(ids) != len(set(ids)):
                raise RoutingError("SETTING_INVALID", "feedback source ids must be unique", setting=setting)
            if not source["authority_trusted"]:
                for item in out:
                    if item.get("approved"):
                        item["approved"] = False
                        source["diagnostics"].append({
                            "code": "AUTHORITY_UNTRUSTED",
                            "setting": setting,
                            "message": "untrusted source approval was denied",
                        })
        return out
    raise RoutingError("ASSET_INVALID", "unknown registry type '{}'".format(value_type))


def validate_source(source, schema, roles):
    data = source["data"]
    if not isinstance(data, dict):
        raise RoutingError("YAML_SYNTAX", "configuration root must be a mapping")
    retired = schema.get("retired", {})
    unknown = set(data) - set(schema["settings"]) - set(retired)
    if unknown:
        raise RoutingError("SETTING_INVALID", "unknown configuration key '{}'".format(sorted(unknown)[0]), setting=sorted(unknown)[0])
    for key in sorted(set(data) & set(retired)):
        source["diagnostics"].append({
            "code": "RETIRED_SETTING",
            "setting": key,
            "replacement": retired[key],
        })
    out = {}
    for key, value in data.items():
        if key in retired:
            continue
        spec = schema["settings"][key]
        out[key] = validate_routing(value, schema, roles, source) if key == "routing" else validate_value(value, spec, schema, source, key)
    source["data"] = out
    return source


def source_public(source):
    return {key: source[key] for key in ("layer", "path", "exists", "revision", "trusted", "authority_trusted", "ignored")}


def load_sources(cwd, schema, roles):
    limits = schema["limits"]
    global_root, global_path = global_config_path()
    repo = project_root(cwd)
    if repo is None:
        project_root_dir = None
        project_path = None
    else:
        project_root_dir = os.path.join(repo, ".compound-engineering")
        project_path = os.path.join(project_root_dir, "config.local.yaml")
    lock_paths = [global_path] + ([project_path] if project_path is not None else [])
    with read_locks(lock_paths):
        global_source = read_source("global", global_root, global_path, limits)
        if project_path is None:
            project_source = absent_source("project", None)
        else:
            project_source = read_source("project", project_root_dir, project_path, limits, repo=repo)
        global_source = validate_source(global_source, schema, roles)
        project_source = validate_source(project_source, schema, roles)
    return global_source, project_source, repo


def routing_parts(source):
    value = source["data"].get("routing") or {}
    return value.get("profiles", {}), value.get("classes", {}), value.get("roles", {})


def merge_settings(global_source, project_source, schema):
    effective = {}
    provenance = {}
    for key, spec in schema["settings"].items():
        if key == "routing":
            continue
        value = copy.deepcopy(spec.get("default"))
        layer = "builtin"
        if key in global_source["data"]:
            value = copy.deepcopy(global_source["data"][key])
            layer = "global"
        if key in project_source["data"]:
            value = copy.deepcopy(project_source["data"][key])
            layer = "project"
        effective[key] = value
        source = global_source if layer == "global" else project_source if layer == "project" else None
        provenance[key] = {
            "layer": layer,
            "revision": source["revision"] if source else None,
            "authority_trusted": source["authority_trusted"] if source else False,
        }
    global_profiles, global_classes, global_roles = routing_parts(global_source)
    project_profiles, project_classes, project_roles = routing_parts(project_source)
    profiles = copy.deepcopy(global_profiles)
    profiles.update(copy.deepcopy(project_profiles))
    profile_provenance = {
        name: {
            "layer": "global",
            "revision": global_source["revision"],
            "authority_trusted": global_source["authority_trusted"],
        }
        for name in global_profiles
    }
    profile_provenance.update({
        name: {
            "layer": "project",
            "revision": project_source["revision"],
            "authority_trusted": project_source["authority_trusted"],
        }
        for name in project_profiles
    })
    classes = copy.deepcopy(global_classes)
    classes.update(copy.deepcopy(project_classes))
    role_bindings = copy.deepcopy(global_roles)
    role_bindings.update(copy.deepcopy(project_roles))
    for binding in (
        list(global_classes.values())
        + list(project_classes.values())
        + list(global_roles.values())
        + list(project_roles.values())
    ):
        if isinstance(binding, dict) and binding["profile"] not in profiles:
            raise RoutingError("REFERENCE_UNKNOWN", "unknown routing profile '{}'".format(binding["profile"]), profile=binding["profile"])
    effective["routing"] = {"profiles": profiles, "classes": classes, "roles": role_bindings}
    provenance["routing"] = {
        "layer": "merged",
        "global_revision": global_source["revision"],
        "project_revision": project_source["revision"],
        "profiles": copy.deepcopy(profile_provenance),
    }
    routing_state = {
        "profiles": copy.deepcopy(profiles),
        "profile_provenance": copy.deepcopy(profile_provenance),
        "layers": {
            "global": {
                "revision": global_source["revision"],
                "authority_trusted": global_source["authority_trusted"],
                "classes": copy.deepcopy(global_classes),
                "roles": copy.deepcopy(global_roles),
            },
            "project": {
                "revision": project_source["revision"],
                "authority_trusted": project_source["authority_trusted"],
                "classes": copy.deepcopy(project_classes),
                "roles": copy.deepcopy(project_roles),
            },
        },
    }
    feedback = effective.get("feedback_sources") or []
    authority = {"feedback_sources": "approved" if any(item.get("approved") for item in feedback) else "denied"}
    return effective, provenance, authority, routing_state


def freeze_compatibility(effective, provenance):
    return {
        "values": {key: copy.deepcopy(effective[key]) for key in COMPATIBILITY_KEYS},
        "provenance": {key: copy.deepcopy(provenance[key]) for key in COMPATIBILITY_KEYS},
    }


def validate_snapshot_compatibility(value, source_revisions, routing_state, schema):
    if not isinstance(value, dict) or set(value) != {"values", "provenance"}:
        raise RoutingError("CONTEXT_STALE", "parent snapshot compatibility state is malformed", exit_code=4)
    values = value["values"]
    provenance = value["provenance"]
    if (
        not isinstance(values, dict)
        or not isinstance(provenance, dict)
        or set(values) != set(COMPATIBILITY_KEYS)
        or set(provenance) != set(COMPATIBILITY_KEYS)
    ):
        raise RoutingError("CONTEXT_STALE", "parent snapshot compatibility fields are malformed", exit_code=4)

    normalized_values = {}
    normalized_provenance = {}
    for key in COMPATIBILITY_KEYS:
        item = provenance[key]
        if not isinstance(item, dict) or set(item) != {"layer", "revision", "authority_trusted"}:
            raise RoutingError("CONTEXT_STALE", "parent snapshot compatibility provenance is malformed", exit_code=4)
        layer = item["layer"]
        if layer == "builtin":
            if item["revision"] is not None or item["authority_trusted"] is not False:
                raise RoutingError("CONTEXT_STALE", "parent snapshot builtin provenance is inconsistent", exit_code=4)
            if values[key] != schema["settings"][key].get("default"):
                raise RoutingError("CONTEXT_STALE", "parent snapshot builtin compatibility value is inconsistent", exit_code=4)
        elif layer in ("global", "project"):
            if (
                item["revision"] != source_revisions[layer]
                or type(item["authority_trusted"]) is not bool
                or item["authority_trusted"] != routing_state["layers"][layer]["authority_trusted"]
            ):
                raise RoutingError("CONTEXT_STALE", "parent snapshot compatibility provenance is inconsistent", exit_code=4)
        else:
            raise RoutingError("CONTEXT_STALE", "parent snapshot compatibility layer is malformed", exit_code=4)
        source = {"authority_trusted": item["authority_trusted"], "diagnostics": []}
        try:
            normalized_values[key] = validate_value(
                copy.deepcopy(values[key]),
                schema["settings"][key],
                schema,
                source,
                key,
            )
        except RoutingError as exc:
            raise RoutingError("CONTEXT_STALE", "parent snapshot compatibility value is invalid", exit_code=4) from exc
        normalized_provenance[key] = copy.deepcopy(item)
    return {"values": normalized_values, "provenance": normalized_provenance}


def compatibility_metadata(role, compatibility):
    role_spec = COMPATIBILITY_ROLE_SPECS.get(role)
    if role_spec is None:
        return None
    kind, keys = role_spec
    return {
        "kind": kind,
        "applied": False,
        "reason": "inactive",
        "values": {key: copy.deepcopy(compatibility["values"][key]) for key in keys},
        "provenance": {key: copy.deepcopy(compatibility["provenance"][key]) for key in keys},
    }


def compatibility_layer(keys, compatibility):
    layers = {compatibility["provenance"][key]["layer"] for key in keys}
    if "project" in layers:
        return "project"
    if "global" in layers:
        return "global"
    return None


def require_compatibility_authority(role, keys, compatibility):
    for key in keys:
        provenance = compatibility["provenance"][key]
        if provenance["layer"] == "project" and not provenance["authority_trusted"]:
            raise RoutingError(
                "AUTHORITY_UNTRUSTED",
                "recipient-bearing compatibility setting requires trusted project provenance",
                exit_code=4,
                role=role,
                setting=key,
            )


def append_unique_candidate(candidates, candidate):
    if not any(canonical_json(item) == canonical_json(candidate) for item in candidates):
        candidates.append(candidate)


def materialize_candidates(candidates):
    normalized = []
    for ordinal, candidate in enumerate(candidates):
        if candidate == "ce-default":
            normalized.append({"kind": "ce-default", "ordinal": ordinal})
        else:
            current = copy.deepcopy(candidate)
            current["ordinal"] = ordinal
            normalized.append(current)
    return normalized


def elevation_compatibility_candidates(model, host, schema):
    candidates = []
    allowed_harnesses = set(schema["structured_types"]["execution_candidate"]["fields"]["harness"]["values"])
    host_harness = host.get("harness") if isinstance(host, dict) else None
    if host_harness in allowed_harnesses:
        append_unique_candidate(candidates, {"harness": host_harness, "model": model})
    append_unique_candidate(candidates, {"harness": "claude", "model": model, "effort": "high"})
    candidates.append("ce-default")
    return candidates


def peer_compatibility_candidates(target):
    order = [target] + [item for item in ("codex", "claude", "grok", "composer") if item != target]
    candidates = []
    for harness in order:
        append_unique_candidate(candidates, {"harness": harness})
    candidates.append("ce-default")
    return candidates


def compatibility_binding(role, class_name, compatibility, host, schema):
    kind, keys = COMPATIBILITY_ROLE_SPECS[role]
    values = compatibility["values"]
    policy = "prefer"
    profile = "legacy-{}".format(kind)
    candidates = None
    if kind == "plan-model":
        model = values["plan_model"]
        if model is not None:
            candidates = elevation_compatibility_candidates(model, host, schema)
    elif kind == "brainstorm-model":
        model = values["brainstorm_model"]
        if model is not None:
            candidates = elevation_compatibility_candidates(model, host, schema)
    elif kind == "cross-model-peer":
        target = values["cross_model_peer"]
        if target is not None:
            candidates = peer_compatibility_candidates(target)
    else:
        mode = values["work_engine_mode"]
        preferences = values["work_engine_preferences"]
        if mode in ("prefer", "require") and isinstance(preferences, list) and preferences:
            policy = mode
            candidates = copy.deepcopy(preferences)
            if mode == "prefer":
                candidates.append("ce-default")
    if candidates is None:
        return None

    layer = compatibility_layer(keys, compatibility)
    if layer is None:
        return None
    require_compatibility_authority(role, keys, compatibility)
    authority = all(
        compatibility["provenance"][key]["authority_trusted"]
        for key in keys
        if compatibility["provenance"][key]["layer"] != "builtin"
    )
    binding = {
        "kind": "profile",
        "explicit_reset": False,
        "source_layer": "{}-legacy-{}".format(layer, kind),
        "source_authority": authority,
        "source": "compatibility:{}".format(kind),
        "role": role,
        "class": class_name,
        "profile": profile,
        "profile_source_layer": layer,
        "profile_source_authority": authority,
        "policy": policy,
        "candidates": materialize_candidates(candidates),
    }
    return binding


def bind_from_layer(value, source_layer, role, class_name, routing_state, binding_provenance):
    if value in (None, "inherit"):
        return None
    binding_authority = binding_provenance["authority_trusted"]
    if value == "ce-default":
        return {
            "kind": "ce-default",
            "explicit_reset": True,
            "source_layer": source_layer,
            "source_authority": binding_authority,
            "role": role,
            "class": class_name,
            "profile": None,
            "profile_source_layer": None,
            "profile_source_authority": None,
            "policy": None,
            "candidates": [],
        }
    if source_layer == "task" and set(value) == {"policy", "candidates"}:
        return {
            "kind": "profile",
            "explicit_reset": False,
            "source_layer": "task",
            "source_authority": True,
            "role": role,
            "class": class_name,
            "profile": "current-task",
            "profile_source_layer": "task",
            "profile_source_authority": True,
            "policy": value["policy"],
            "candidates": materialize_candidates(value["candidates"]),
        }
    profile_name = value["profile"]
    profiles = routing_state["profiles"]
    if profile_name not in profiles:
        raise RoutingError(
            "REFERENCE_UNKNOWN",
            "unknown routing profile '{}'".format(profile_name),
            exit_code=4,
            role=role,
            profile=profile_name,
        )
    profile_provenance = routing_state["profile_provenance"][profile_name]
    recipient_bearing = any(candidate != "ce-default" for candidate in profiles[profile_name]["candidates"])
    if recipient_bearing and (not binding_authority or not profile_provenance["authority_trusted"]):
        raise RoutingError(
            "AUTHORITY_UNTRUSTED",
            "recipient-bearing routing requires trusted binding and profile provenance",
            exit_code=4,
            role=role,
            profile=profile_name,
            binding_source=source_layer,
            profile_source=profile_provenance["layer"],
        )
    return {
        "kind": "profile",
        "explicit_reset": False,
        "source_layer": source_layer,
        "source_authority": binding_authority,
        "role": role,
        "class": class_name,
        "profile": profile_name,
        "profile_source_layer": profile_provenance["layer"],
        "profile_source_authority": profile_provenance["authority_trusted"],
        "policy": value["policy"],
        "candidates": materialize_candidates(profiles[profile_name]["candidates"]),
    }


def validate_opencode_intent_authority(intent):
    provenance = intent.get("provenance")
    fields = {"protocol", "session_id", "message_id", "carrier_digest"}
    if (
        intent.get("source") != "opencode-direct-input"
        or not isinstance(provenance, dict)
        or set(provenance) != fields
        or provenance.get("protocol") != "ce-routing-intent/v1"
        or not isinstance(provenance.get("session_id"), str)
        or not MODEL_TOKEN.fullmatch(provenance["session_id"])
        or not isinstance(provenance.get("message_id"), str)
        or not MODEL_TOKEN.fullmatch(provenance["message_id"])
        or not isinstance(provenance.get("carrier_digest"), str)
        or not SNAPSHOT_MAC.fullmatch(provenance["carrier_digest"])
    ):
        raise RoutingError(
            "AUTHORITY_UNTRUSTED",
            "OpenCode task routing requires a host-captured direct-input carrier",
            exit_code=4,
        )


def intent_binding(intents, role, class_name, schema, host):
    matched = []
    for intent in intents:
        if not isinstance(intent, dict):
            raise RoutingError("REQUEST_INVALID", "routing intents must be objects", exit_code=2)
        target_role = intent.get("role")
        target_class = intent.get("class")
        if target_role not in (None, role) or target_class not in (None, class_name):
            continue
        if "binding" not in intent:
            raise RoutingError("REQUEST_INVALID", "matching routing intent lacks binding", exit_code=2)
        if isinstance(host, dict) and host.get("harness") == "opencode":
            validate_opencode_intent_authority(intent)
        matched.append(intent)
    if len(matched) > 1:
        first = canonical_json(matched[0].get("binding"))
        if any(canonical_json(item.get("binding")) != first for item in matched[1:]):
            raise RoutingError("CONTEXT_CONFLICT", "equal-authority task routing intents conflict", exit_code=4)
    if not matched:
        return None
    return validate_intent_binding(matched[0]["binding"], schema), matched[0].get("source", "current-task")


def normalize_role_request(role_request):
    if (
        not isinstance(role_request, dict)
        or set(role_request) - {"role", "instance"}
        or not isinstance(role_request.get("role"), str)
    ):
        raise RoutingError("REQUEST_INVALID", "each role request must name only a role and instance", exit_code=2)
    instance = role_request.get("instance", {})
    if not isinstance(instance, dict):
        raise RoutingError("REQUEST_INVALID", "role instance metadata must be an object", exit_code=2)
    return {"role": role_request["role"], "instance": copy.deepcopy(instance)}


def resolved_role(role, class_name, instance, binding, compatibility, reason):
    result = {
        "role": role,
        "class": class_name,
        "instance": copy.deepcopy(instance),
        "binding": binding,
    }
    if compatibility is not None:
        compatibility = copy.deepcopy(compatibility)
        compatibility["applied"] = reason == "applied"
        compatibility["reason"] = reason
        result["compatibility"] = compatibility
    return result


def resolve_role(role_request, intents, routing_state, compatibility_state, host, roles, schema):
    role_request = normalize_role_request(role_request)
    role = role_request["role"]
    instance = role_request["instance"]
    catalog = roles["roles"].get(role)
    if catalog is None:
        raise RoutingError("ROLE_UNKNOWN", "unknown dispatch role '{}'".format(role), exit_code=4, role=role)
    class_name = catalog.get("class")
    if class_name not in roles["classes"]:
        raise RoutingError("ROLE_UNCLASSIFIED", "dispatch role lacks a valid class", exit_code=4, role=role)
    compatibility = compatibility_metadata(role, compatibility_state)
    task = intent_binding(intents, role, class_name, schema, host)
    if task is not None:
        binding, source_name = task
        resolved = bind_from_layer(
            binding,
            "task",
            role,
            class_name,
            routing_state,
            {"authority_trusted": True},
        )
        if resolved is not None:
            resolved["source"] = source_name
            return resolved_role(role, class_name, instance, resolved, compatibility, "higher-route")
    global_layer = routing_state["layers"]["global"]
    project_layer = routing_state["layers"]["project"]
    compatibility_spec = COMPATIBILITY_ROLE_SPECS.get(role)
    compatibility_source = (
        compatibility_layer(compatibility_spec[1], compatibility_state)
        if compatibility_spec is not None
        else None
    )
    ordered = (
        ("binding", project_layer["roles"].get(role), "project-role", project_layer),
        ("compatibility", None, "project", None),
        ("binding", project_layer["classes"].get(class_name), "project-class", project_layer),
        ("binding", global_layer["roles"].get(role), "global-role", global_layer),
        ("compatibility", None, "global", None),
        ("binding", global_layer["classes"].get(class_name), "global-class", global_layer),
    )
    for entry_kind, value, source_layer, provenance in ordered:
        if entry_kind == "compatibility":
            if compatibility_source != source_layer:
                continue
            resolved = compatibility_binding(
                role,
                class_name,
                compatibility_state,
                host,
                schema,
            )
            if resolved is not None:
                return resolved_role(role, class_name, instance, resolved, compatibility, "applied")
            continue
        resolved = bind_from_layer(value, source_layer, role, class_name, routing_state, provenance)
        if resolved is not None:
            return resolved_role(role, class_name, instance, resolved, compatibility, "higher-route")
    binding = {
        "kind": "ce-default",
        "explicit_reset": False,
        "source_layer": "builtin",
        "source_authority": True,
        "role": role,
        "class": class_name,
        "profile": None,
        "profile_source_layer": None,
        "profile_source_authority": None,
        "policy": None,
        "candidates": [],
    }
    return resolved_role(role, class_name, instance, binding, compatibility, "inactive")


def base_state(request, schema, roles):
    cwd = request.get("cwd")
    if not isinstance(cwd, str) or not os.path.isabs(cwd):
        raise RoutingError("REQUEST_INVALID", "cwd must be an absolute path", exit_code=2)
    global_source, project_source, repo = load_sources(cwd, schema, roles)
    effective, provenance, authority, routing_state = merge_settings(global_source, project_source, schema)
    compatibility = freeze_compatibility(effective, provenance)
    return {
        "cwd": cwd,
        "repo": repo,
        "global": global_source,
        "project": project_source,
        "effective": effective,
        "provenance": provenance,
        "authority": authority,
        "routing_state": routing_state,
        "compatibility": compatibility,
    }


def inspect_op(request, schema, roles):
    state = base_state(request, schema, roles)
    diagnostics = state["global"]["diagnostics"] + state["project"]["diagnostics"]
    return {
        "ok": True,
        "protocol": PROTOCOL,
        "op": "inspect",
        "sources": {
            "global": source_public(state["global"]),
            "project": source_public(state["project"]),
        },
        "settings": {
            "effective": state["effective"],
            "provenance": state["provenance"],
            "authority": state["authority"],
        },
        "diagnostics": diagnostics,
        "role_coverage": {
            "registered": len(roles["roles"]),
            "unclassified": sorted(
                role
                for role, metadata in roles["roles"].items()
                if metadata["class"] not in roles["classes"]
            ),
        },
    }, 0


def effective_routing_from_state(routing_state):
    classes = copy.deepcopy(routing_state["layers"]["global"]["classes"])
    classes.update(copy.deepcopy(routing_state["layers"]["project"]["classes"]))
    role_bindings = copy.deepcopy(routing_state["layers"]["global"]["roles"])
    role_bindings.update(copy.deepcopy(routing_state["layers"]["project"]["roles"]))
    return {
        "profiles": copy.deepcopy(routing_state["profiles"]),
        "classes": classes,
        "roles": role_bindings,
    }


def snapshot_payload(context, source_revisions, intents, routing_state, compatibility, role_requests, parent_snapshot_id):
    return {
        "protocol": PROTOCOL,
        "context": copy.deepcopy(context),
        "source_revisions": copy.deepcopy(source_revisions),
        "intents": copy.deepcopy(intents),
        "routing": copy.deepcopy(routing_state),
        "compatibility": copy.deepcopy(compatibility),
        "roles": copy.deepcopy(role_requests),
        "parent_snapshot_id": parent_snapshot_id,
    }


@contextlib.contextmanager
def snapshot_state_directory():
    uid = current_uid()
    if uid is None:
        raise RoutingError("RUNTIME_UNSUPPORTED", "snapshot authentication requires an effective user ID")
    anchor = SNAPSHOT_STATE_ROOT or "/tmp/compound-engineering-{}".format(uid)
    if not os.path.isabs(anchor):
        raise RoutingError("CONFIG_PATH_INVALID", "snapshot authentication state root must be absolute")
    anchor = os.path.abspath(anchor)
    try:
        os.mkdir(anchor, 0o700)
    except FileExistsError:
        pass
    except OSError as exc:
        raise RoutingError("CONFIG_UNSAFE", "cannot create routing state root", reason="state_root", path=anchor) from exc
    anchor_state = validate_owned_path_component(anchor, True)
    if anchor_state is None or mode_bits(anchor_state) != 0o700:
        raise RoutingError("CONFIG_UNSAFE", "routing state root is not private", reason="mode", path=anchor)
    components = ("routing", "snapshot-auth")
    try:
        current_fd = os.open(anchor, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW)
    except OSError as exc:
        raise RoutingError("CONFIG_UNSAFE", "cannot open routing state root", reason="state_root", path=anchor) from exc
    try:
        for component_index, component in enumerate(components):
            try:
                os.mkdir(component, 0o700, dir_fd=current_fd)
            except FileExistsError:
                pass
            except OSError as exc:
                raise RoutingError("CONFIG_UNSAFE", "cannot create routing state directory", reason="state_create") from exc
            try:
                next_fd = os.open(component, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=current_fd)
            except OSError as exc:
                raise RoutingError("CONFIG_UNSAFE", "cannot open routing state directory", reason="state_open") from exc
            st = os.fstat(next_fd)
            if current_uid() is not None and st.st_uid != current_uid():
                os.close(next_fd)
                raise RoutingError("CONFIG_UNSAFE", "routing state directory is not user-owned", reason="owner")
            private_component = component_index >= len(components) - 2
            if mode_bits(st) & 0o022 or (private_component and mode_bits(st) & 0o077):
                os.close(next_fd)
                raise RoutingError("CONFIG_UNSAFE", "routing state directory is not private", reason="mode")
            os.close(current_fd)
            current_fd = next_fd
        yield current_fd
    finally:
        os.close(current_fd)


def snapshot_auth_key():
    name = "snapshot-auth-v1.key"
    with snapshot_state_directory() as state_fd:
        while True:
            try:
                fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=state_fd)
                break
            except FileNotFoundError:
                try:
                    fd = os.open(
                        name,
                        os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW,
                        0o600,
                        dir_fd=state_fd,
                    )
                except FileExistsError:
                    continue
                except OSError as exc:
                    raise RoutingError("CONFIG_UNSAFE", "cannot create snapshot authentication state", reason="state_key") from exc
                try:
                    key = os.urandom(32)
                    os.fchmod(fd, 0o600)
                    view = memoryview(key)
                    while view:
                        written = os.write(fd, view)
                        view = view[written:]
                    os.fsync(fd)
                    os.fsync(state_fd)
                finally:
                    os.close(fd)
                return key
            except OSError as exc:
                raise RoutingError("CONFIG_UNSAFE", "cannot open snapshot authentication state", reason="state_key") from exc
        try:
            before = os.fstat(fd)
            if not stat.S_ISREG(before.st_mode):
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication state is not a regular file", reason="not_regular")
            if current_uid() is not None and before.st_uid != current_uid():
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication state is not user-owned", reason="owner")
            if mode_bits(before) != 0o600:
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication state is not private", reason="mode")
            key = os.read(fd, 33)
            after = os.fstat(fd)
            try:
                current = os.stat(name, dir_fd=state_fd, follow_symlinks=False)
            except OSError as exc:
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication state changed", reason="state_key") from exc
        finally:
            os.close(fd)
        if len(key) != 32 or file_identity(before) != file_identity(after) or file_identity(after) != file_identity(current):
            raise RoutingError("CONFIG_UNSAFE", "snapshot authentication state is malformed", reason="state_key")
        return key


@contextlib.contextmanager
def snapshot_records_directory():
    with snapshot_state_directory() as state_fd:
        try:
            os.mkdir("snapshots", 0o700, dir_fd=state_fd)
        except FileExistsError:
            pass
        except OSError as exc:
            raise RoutingError("CONFIG_UNSAFE", "cannot create snapshot authentication records", reason="state_create") from exc
        try:
            records_fd = os.open("snapshots", os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=state_fd)
        except OSError as exc:
            raise RoutingError("CONFIG_UNSAFE", "cannot open snapshot authentication records", reason="state_open") from exc
        try:
            st = os.fstat(records_fd)
            if current_uid() is not None and st.st_uid != current_uid():
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication records are not user-owned", reason="owner")
            if mode_bits(st) != 0o700:
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication records are not private", reason="mode")
            yield records_fd
        finally:
            os.close(records_fd)


def snapshot_record_name(snapshot):
    return snapshot["id"].split(":", 1)[1] + ".mac"


def snapshot_mac(snapshot, key):
    material = {"protocol": SNAPSHOT_AUTH_PROTOCOL, "snapshot": snapshot}
    return hmac.new(key, canonical_json(material).encode("ascii"), hashlib.sha256).hexdigest()


def prune_snapshot_records(records_fd, keep_name):
    now = time.time()
    retained = []
    try:
        names = os.listdir(records_fd)
    except OSError as exc:
        raise RoutingError("CONFIG_UNSAFE", "cannot enumerate snapshot authentication records", reason="state_record") from exc
    for name in names:
        is_record = re.fullmatch(r"[0-9a-f]{64}\.mac", name) is not None
        is_temporary = re.fullmatch(r"\.ce-config-[0-9]+-[0-9a-f]{24}", name) is not None
        if not is_record and not is_temporary:
            raise RoutingError("CONFIG_UNSAFE", "snapshot authentication record name is unsafe", reason="state_record")
        try:
            st = os.stat(name, dir_fd=records_fd, follow_symlinks=False)
        except FileNotFoundError:
            continue
        except OSError as exc:
            raise RoutingError("CONFIG_UNSAFE", "cannot inspect snapshot authentication record", reason="state_record") from exc
        if (
            not stat.S_ISREG(st.st_mode)
            or (current_uid() is not None and st.st_uid != current_uid())
            or mode_bits(st) != 0o600
        ):
            raise RoutingError("CONFIG_UNSAFE", "snapshot authentication record is unsafe", reason="state_record")
        if is_temporary:
            if now - st.st_mtime > SNAPSHOT_CLOCK_SKEW_SECONDS:
                os.unlink(name, dir_fd=records_fd)
            continue
        if name != keep_name and (st.st_mtime > now + SNAPSHOT_CLOCK_SKEW_SECONDS or now - st.st_mtime > SNAPSHOT_LIFETIME_SECONDS):
            os.unlink(name, dir_fd=records_fd)
        else:
            retained.append((st.st_mtime, name))
    retained.sort(reverse=True)
    for _mtime, name in retained[MAX_SNAPSHOT_RECORDS:]:
        if name != keep_name:
            os.unlink(name, dir_fd=records_fd)


def authenticate_snapshot(snapshot):
    data = (snapshot_mac(snapshot, snapshot_auth_key()) + "\n").encode("ascii")
    with snapshot_records_directory() as records_fd:
        name = snapshot_record_name(snapshot)
        try:
            current = os.stat(name, dir_fd=records_fd, follow_symlinks=False)
        except FileNotFoundError:
            pass
        except OSError as exc:
            raise RoutingError("CONFIG_UNSAFE", "cannot inspect snapshot authentication record", reason="state_record") from exc
        else:
            if (
                not stat.S_ISREG(current.st_mode)
                or (current_uid() is not None and current.st_uid != current_uid())
                or mode_bits(current) != 0o600
            ):
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication record is unsafe", reason="state_record")
        fd, tmp_name = create_temp_at(records_fd)
        try:
            try:
                os.fchmod(fd, 0o600)
                view = memoryview(data)
                while view:
                    written = os.write(fd, view)
                    view = view[written:]
                os.fsync(fd)
            finally:
                os.close(fd)
            os.replace(tmp_name, name, src_dir_fd=records_fd, dst_dir_fd=records_fd)
            tmp_name = None
            prune_snapshot_records(records_fd, name)
            os.fsync(records_fd)
        finally:
            if tmp_name is not None:
                with contextlib.suppress(OSError):
                    os.unlink(tmp_name, dir_fd=records_fd)
    return snapshot


def validate_snapshot_auth(snapshot):
    with snapshot_records_directory() as records_fd:
        name = snapshot_record_name(snapshot)
        try:
            fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=records_fd)
        except FileNotFoundError as exc:
            raise RoutingError("CONTEXT_STALE", "snapshot authentication record is missing", exit_code=4) from exc
        except OSError as exc:
            raise RoutingError("CONFIG_UNSAFE", "cannot open snapshot authentication record", reason="state_record") from exc
        try:
            before = os.fstat(fd)
            if (
                not stat.S_ISREG(before.st_mode)
                or (current_uid() is not None and before.st_uid != current_uid())
                or mode_bits(before) != 0o600
            ):
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication record is unsafe", reason="state_record")
            data = os.read(fd, 66)
            after = os.fstat(fd)
            try:
                current = os.stat(name, dir_fd=records_fd, follow_symlinks=False)
            except OSError as exc:
                raise RoutingError("CONFIG_UNSAFE", "snapshot authentication record changed", reason="state_record") from exc
        finally:
            os.close(fd)
    now = time.time()
    if after.st_mtime > now + SNAPSHOT_CLOCK_SKEW_SECONDS or now - after.st_mtime > SNAPSHOT_LIFETIME_SECONDS:
        raise RoutingError("CONTEXT_STALE", "snapshot authentication has expired", exit_code=4)
    if file_identity(before) != file_identity(after) or file_identity(after) != file_identity(current):
        raise RoutingError("CONFIG_UNSAFE", "snapshot authentication record changed", reason="state_record")
    try:
        mac = data.decode("ascii").strip()
    except UnicodeDecodeError as exc:
        raise RoutingError("CONTEXT_STALE", "snapshot authentication is malformed", exit_code=4) from exc
    expected = snapshot_mac(snapshot, snapshot_auth_key())
    if not SNAPSHOT_MAC.fullmatch(mac) or not hmac.compare_digest(mac, expected):
        raise RoutingError("CONTEXT_STALE", "snapshot authentication does not match", exit_code=4)


def make_snapshot(
    context,
    source_revisions,
    intents,
    routing_state,
    compatibility,
    role_requests,
    parent_snapshot_id=None,
):
    payload = snapshot_payload(
        context,
        source_revisions,
        intents,
        routing_state,
        compatibility,
        role_requests,
        parent_snapshot_id,
    )
    return authenticate_snapshot({"id": digest("cesnap-v1", payload), **payload})


def validate_snapshot_routing(value, source_revisions, schema, roles):
    if not isinstance(value, dict) or set(value) != {"profiles", "profile_provenance", "layers"}:
        raise RoutingError("CONTEXT_STALE", "parent snapshot routing state is malformed", exit_code=4)
    profiles = value["profiles"]
    profile_provenance = value["profile_provenance"]
    layers = value["layers"]
    if not isinstance(profiles, dict) or not isinstance(profile_provenance, dict) or set(profile_provenance) != set(profiles):
        raise RoutingError("CONTEXT_STALE", "parent snapshot profile provenance is malformed", exit_code=4)
    if not isinstance(layers, dict) or set(layers) != {"global", "project"}:
        raise RoutingError("CONTEXT_STALE", "parent snapshot routing layers are malformed", exit_code=4)
    try:
        normalized_profiles = validate_routing(
            {"profiles": copy.deepcopy(profiles)},
            schema,
            roles,
            {"authority_trusted": True, "diagnostics": []},
        )["profiles"]
    except RoutingError as exc:
        raise RoutingError("CONTEXT_STALE", "parent snapshot profiles are invalid", exit_code=4) from exc

    normalized_layers = {}
    for layer in ("global", "project"):
        layer_value = layers[layer]
        if not isinstance(layer_value, dict) or set(layer_value) != {"revision", "authority_trusted", "classes", "roles"}:
            raise RoutingError("CONTEXT_STALE", "parent snapshot routing layer is malformed", exit_code=4)
        if layer_value["revision"] != source_revisions[layer] or type(layer_value["authority_trusted"]) is not bool:
            raise RoutingError("CONTEXT_STALE", "parent snapshot routing provenance is inconsistent", exit_code=4)
        try:
            normalized = validate_routing(
                {
                    "classes": copy.deepcopy(layer_value["classes"]),
                    "roles": copy.deepcopy(layer_value["roles"]),
                },
                schema,
                roles,
                {"authority_trusted": layer_value["authority_trusted"], "diagnostics": []},
            )
        except RoutingError as exc:
            raise RoutingError("CONTEXT_STALE", "parent snapshot bindings are invalid", exit_code=4) from exc
        normalized_layers[layer] = {
            "revision": layer_value["revision"],
            "authority_trusted": layer_value["authority_trusted"],
            "classes": normalized["classes"],
            "roles": normalized["roles"],
        }

    normalized_provenance = {}
    for name, provenance in profile_provenance.items():
        if not isinstance(provenance, dict) or set(provenance) != {"layer", "revision", "authority_trusted"}:
            raise RoutingError("CONTEXT_STALE", "parent snapshot profile provenance is malformed", exit_code=4)
        layer = provenance["layer"]
        if layer not in ("global", "project") or type(provenance["authority_trusted"]) is not bool:
            raise RoutingError("CONTEXT_STALE", "parent snapshot profile provenance is malformed", exit_code=4)
        layer_state = normalized_layers[layer]
        if (
            provenance["revision"] != source_revisions[layer]
            or provenance["authority_trusted"] != layer_state["authority_trusted"]
        ):
            raise RoutingError("CONTEXT_STALE", "parent snapshot profile provenance is inconsistent", exit_code=4)
        normalized_provenance[name] = copy.deepcopy(provenance)

    for layer_state in normalized_layers.values():
        for binding in list(layer_state["classes"].values()) + list(layer_state["roles"].values()):
            if isinstance(binding, dict) and binding["profile"] not in normalized_profiles:
                raise RoutingError("CONTEXT_STALE", "parent snapshot references an unknown profile", exit_code=4)
    return {
        "profiles": normalized_profiles,
        "profile_provenance": normalized_provenance,
        "layers": normalized_layers,
    }


def validate_parent_snapshot(value, schema, roles):
    fields = {
        "id",
        "protocol",
        "context",
        "source_revisions",
        "intents",
        "routing",
        "compatibility",
        "roles",
        "parent_snapshot_id",
    }
    if not isinstance(value, dict) or set(value) != fields:
        raise RoutingError("CONTEXT_STALE", "parent snapshot envelope is malformed", exit_code=4)
    if value["protocol"] != PROTOCOL:
        raise RoutingError("CONTEXT_STALE", "parent snapshot protocol does not match", exit_code=4)
    if not isinstance(value["id"], str) or not SNAPSHOT_ID.fullmatch(value["id"]):
        raise RoutingError("CONTEXT_STALE", "parent snapshot ID is malformed", exit_code=4)
    validate_snapshot_auth(value)
    parent_id = value["parent_snapshot_id"]
    if parent_id is not None and (not isinstance(parent_id, str) or not SNAPSHOT_ID.fullmatch(parent_id)):
        raise RoutingError("CONTEXT_STALE", "parent snapshot lineage is malformed", exit_code=4)
    context = value["context"]
    if not isinstance(context, dict) or set(context) != {"cwd", "repo", "host"}:
        raise RoutingError("CONTEXT_STALE", "parent snapshot context is malformed", exit_code=4)
    if not isinstance(context["cwd"], str) or not os.path.isabs(context["cwd"]):
        raise RoutingError("CONTEXT_STALE", "parent snapshot cwd is malformed", exit_code=4)
    if context["repo"] is not None and (not isinstance(context["repo"], str) or not os.path.isabs(context["repo"])):
        raise RoutingError("CONTEXT_STALE", "parent snapshot repository context is malformed", exit_code=4)
    if context["host"] is not None and not valid_host_context(context["host"]):
        raise RoutingError("CONTEXT_STALE", "parent snapshot host context is malformed", exit_code=4)
    source_revisions = value["source_revisions"]
    if not isinstance(source_revisions, dict) or set(source_revisions) != {"global", "project"}:
        raise RoutingError("CONTEXT_STALE", "parent snapshot source revisions are malformed", exit_code=4)
    if any(not isinstance(revision, str) or not CONFIG_REVISION.fullmatch(revision) for revision in source_revisions.values()):
        raise RoutingError("CONTEXT_STALE", "parent snapshot source revision is malformed", exit_code=4)
    intents = value["intents"]
    if not isinstance(intents, list) or any(not isinstance(intent, dict) for intent in intents):
        raise RoutingError("CONTEXT_STALE", "parent snapshot intents are malformed", exit_code=4)
    routing_state = validate_snapshot_routing(value["routing"], source_revisions, schema, roles)
    compatibility = validate_snapshot_compatibility(
        value["compatibility"],
        source_revisions,
        routing_state,
        schema,
    )
    role_requests = value["roles"]
    if not isinstance(role_requests, list) or not role_requests:
        raise RoutingError("CONTEXT_STALE", "parent snapshot roles are malformed", exit_code=4)
    try:
        normalized_roles = [normalize_role_request(item) for item in role_requests]
        for item in normalized_roles:
            resolve_role(item, intents, routing_state, compatibility, context["host"], roles, schema)
    except RoutingError as exc:
        raise RoutingError("CONTEXT_STALE", "parent snapshot role resolution is invalid", exit_code=4) from exc
    normalized_payload = snapshot_payload(
        context,
        source_revisions,
        intents,
        routing_state,
        compatibility,
        normalized_roles,
        parent_id,
    )
    expected_id = digest("cesnap-v1", normalized_payload)
    if not isinstance(value["id"], str) or value["id"] != expected_id:
        raise RoutingError("CONTEXT_STALE", "parent snapshot ID does not match its contents", exit_code=4)
    return {"id": expected_id, **normalized_payload}


def request_cwd(request):
    cwd = request.get("cwd")
    if not isinstance(cwd, str) or not os.path.isabs(cwd):
        raise RoutingError("REQUEST_INVALID", "cwd must be an absolute path", exit_code=2)
    return os.path.realpath(cwd)


def valid_host_context(value):
    return isinstance(value, dict) and all(
        field not in value or isinstance(value[field], str)
        for field in ("harness", "serving_family")
    )


def resolution_binding_digest(resolution):
    return digest(
        "cebind-v1",
        {
            "role": resolution["role"],
            "class": resolution["class"],
            "instance": resolution["instance"],
            "binding": resolution["binding"],
        },
    )


def make_attempt_lock(snapshot, resolution, resolution_ordinal, candidate):
    material = {
        "protocol": ATTEMPT_LOCK_PROTOCOL,
        "snapshot_id": snapshot["id"],
        "resolution_ordinal": resolution_ordinal,
        "role": resolution["role"],
        "class": resolution["class"],
        "instance": copy.deepcopy(resolution["instance"]),
        "binding_digest": resolution_binding_digest(resolution),
        "policy": resolution["binding"].get("policy"),
        "candidate_ordinal": candidate["ordinal"],
        "candidate": copy.deepcopy(candidate),
    }
    return {**material, "lock_digest": digest("ceattempt-v1", material)}


def decorate_resolutions(snapshot, resolutions):
    decorated = []
    for resolution_ordinal, resolution in enumerate(resolutions):
        current = copy.deepcopy(resolution)
        current["resolution_ordinal"] = resolution_ordinal
        current["binding_digest"] = resolution_binding_digest(resolution)
        candidates = resolution["binding"].get("candidates", [])
        current["attempt_locks"] = [
            make_attempt_lock(snapshot, resolution, resolution_ordinal, candidate)
            for candidate in candidates
        ]
        decorated.append(current)
    return decorated


def frozen_settings(routing_state, compatibility):
    effective = {"routing": effective_routing_from_state(routing_state)}
    effective.update(copy.deepcopy(compatibility["values"]))
    provenance = {
        "routing": {
            "layer": "frozen",
            "global_revision": routing_state["layers"]["global"]["revision"],
            "project_revision": routing_state["layers"]["project"]["revision"],
            "profiles": copy.deepcopy(routing_state["profile_provenance"]),
        },
    }
    provenance.update(copy.deepcopy(compatibility["provenance"]))
    return {"effective": effective, "provenance": provenance, "authority": {}}


def resolve_batch_op(request, schema, roles):
    role_requests = request.get("roles")
    if not isinstance(role_requests, list) or not role_requests:
        raise RoutingError("REQUEST_INVALID", "resolve_batch requires intents and a non-empty roles list", exit_code=2)
    role_requests = [normalize_role_request(item) for item in role_requests]
    cwd = request_cwd(request)
    parent_value = request.get("parent_snapshot")
    requested_parent_id = request.get("parent_snapshot_id")
    if parent_value is None and requested_parent_id is not None:
        raise RoutingError(
            "CONTEXT_STALE",
            "parent_snapshot_id requires the full parent_snapshot envelope",
            exit_code=4,
        )

    if parent_value is not None:
        parent = validate_parent_snapshot(parent_value, schema, roles)
        if requested_parent_id is not None and requested_parent_id != parent["id"]:
            raise RoutingError("CONTEXT_STALE", "parent snapshot ID does not match the envelope", exit_code=4)
        if cwd != parent["context"]["cwd"]:
            raise RoutingError("CONTEXT_STALE", "request cwd does not match the parent snapshot", exit_code=4)
        if "host" in request and canonical_json(request["host"]) != canonical_json(parent["context"]["host"]):
            raise RoutingError("CONTEXT_STALE", "request host does not match the parent snapshot", exit_code=4)
        if "intents" in request and canonical_json(request["intents"]) != canonical_json(parent["intents"]):
            raise RoutingError("CONTEXT_STALE", "request intents do not match the parent snapshot", exit_code=4)
        if "source_revisions" in request and request["source_revisions"] != parent["source_revisions"]:
            raise RoutingError("CONTEXT_STALE", "request source revisions do not match the parent snapshot", exit_code=4)
        intents = parent["intents"]
        routing_state = parent["routing"]
        compatibility = parent["compatibility"]
        resolutions = [
            resolve_role(
                item,
                intents,
                routing_state,
                compatibility,
                parent["context"]["host"],
                roles,
                schema,
            )
            for item in role_requests
        ]
        snapshot = make_snapshot(
            parent["context"],
            parent["source_revisions"],
            intents,
            routing_state,
            compatibility,
            role_requests,
            parent_snapshot_id=parent["id"],
        )
        frozen_sources = {
            layer: {
                "layer": layer,
                "revision": parent["source_revisions"][layer],
                "authority_trusted": routing_state["layers"][layer]["authority_trusted"],
                "frozen": True,
            }
            for layer in ("global", "project")
        }
        return {
            "ok": True,
            "protocol": PROTOCOL,
            "op": "resolve_batch",
            "snapshot": snapshot,
            "sources": frozen_sources,
            "settings": frozen_settings(routing_state, compatibility),
            "resolutions": decorate_resolutions(snapshot, resolutions),
            "diagnostics": [],
        }, 0

    intents = request.get("intents", [])
    if not isinstance(intents, list):
        raise RoutingError("REQUEST_INVALID", "resolve_batch intents must be a list", exit_code=2)
    host = request.get("host")
    if host is not None and not valid_host_context(host):
        raise RoutingError(
            "REQUEST_INVALID",
            "resolve_batch host must be an object with string harness and serving_family fields",
            exit_code=2,
        )
    state = base_state(request, schema, roles)
    resolutions = [
        resolve_role(
            item,
            intents,
            state["routing_state"],
            state["compatibility"],
            host,
            roles,
            schema,
        )
        for item in role_requests
    ]
    source_revisions = {
        "global": state["global"]["revision"],
        "project": state["project"]["revision"],
    }
    snapshot = make_snapshot(
        {"cwd": cwd, "repo": state["repo"], "host": copy.deepcopy(host)},
        source_revisions,
        intents,
        state["routing_state"],
        state["compatibility"],
        role_requests,
    )
    return {
        "ok": True,
        "protocol": PROTOCOL,
        "op": "resolve_batch",
        "snapshot": snapshot,
        "sources": {
            "global": source_public(state["global"]),
            "project": source_public(state["project"]),
        },
        "settings": {
            "effective": state["effective"],
            "provenance": state["provenance"],
            "authority": state["authority"],
        },
        "resolutions": decorate_resolutions(snapshot, resolutions),
        "diagnostics": state["global"]["diagnostics"] + state["project"]["diagnostics"],
    }, 0


def identity_status(candidate, report):
    requested_model = candidate.get("model")
    requested_effort = candidate.get("effort")
    actual_provider = report.get("provider_actual")
    actual_model = report.get("model_actual")
    actual_effort = report.get("effort_actual")
    if requested_model is not None and "/" in requested_model and actual_model is not None and actual_provider is None:
        return "unverified"
    if requested_model is not None and actual_model is not None:
        served_model = (
            "{}/{}".format(actual_provider, actual_model)
            if "/" in requested_model and actual_provider is not None
            else str(actual_model)
        )
        if requested_model.lower() != served_model.lower():
            return "mismatched"
    if requested_effort is not None and actual_effort is not None and requested_effort.lower() != str(actual_effort).lower():
        return "mismatched"
    if (requested_model is not None and actual_model is None) or (requested_effort is not None and actual_effort is None):
        return "unverified"
    return "verified"


def validate_serving_report(value):
    fields = {"provider_actual", "model_actual", "variant_actual", "effort_actual"}
    if not isinstance(value, dict) or set(value) - fields:
        raise RoutingError("REQUEST_INVALID", "finalize_attempt report fields are invalid", exit_code=2)
    for field, pattern in (
        ("provider_actual", MODEL_TOKEN),
        ("model_actual", MODEL_TOKEN),
        ("variant_actual", EFFORT_TOKEN),
        ("effort_actual", EFFORT_TOKEN),
    ):
        if field in value and (not isinstance(value[field], str) or not pattern.fullmatch(value[field])):
            raise RoutingError("REQUEST_INVALID", "finalize_attempt {} is invalid".format(field), exit_code=2)
    if "variant_actual" in value and "effort_actual" in value and value["variant_actual"] != value["effort_actual"]:
        raise RoutingError("REQUEST_INVALID", "OpenCode variant and effort evidence disagree", exit_code=2)
    return copy.deepcopy(value)


def validate_finalize_lock(request, schema, roles):
    if "binding" in request:
        raise RoutingError(
            "REQUEST_INVALID",
            "finalize_attempt derives its binding from the frozen snapshot",
            exit_code=2,
        )
    snapshot = validate_parent_snapshot(request.get("snapshot"), schema, roles)
    cwd = request.get("cwd")
    if cwd is not None and (
        not isinstance(cwd, str)
        or not os.path.isabs(cwd)
        or os.path.realpath(cwd) != snapshot["context"]["cwd"]
    ):
        raise RoutingError("CONTEXT_STALE", "finalize cwd does not match the frozen snapshot", exit_code=4)
    lock = request.get("attempt_lock")
    lock_fields = {
        "protocol",
        "snapshot_id",
        "resolution_ordinal",
        "role",
        "class",
        "instance",
        "binding_digest",
        "policy",
        "candidate_ordinal",
        "candidate",
        "lock_digest",
    }
    if not isinstance(lock, dict) or set(lock) != lock_fields:
        raise RoutingError("ATTEMPT_LOCK_INVALID", "finalize attempt lock is malformed", exit_code=4)
    resolution_ordinal = lock["resolution_ordinal"]
    if (
        lock.get("protocol") != ATTEMPT_LOCK_PROTOCOL
        or lock.get("snapshot_id") != snapshot["id"]
        or type(resolution_ordinal) is not int
        or resolution_ordinal < 0
        or resolution_ordinal >= len(snapshot["roles"])
    ):
        raise RoutingError("ATTEMPT_LOCK_INVALID", "attempt lock does not belong to this snapshot", exit_code=4)
    resolution = resolve_role(
        snapshot["roles"][resolution_ordinal],
        snapshot["intents"],
        snapshot["routing"],
        snapshot["compatibility"],
        snapshot["context"]["host"],
        roles,
        schema,
    )
    ordinal = lock["candidate_ordinal"]
    candidates = resolution["binding"].get("candidates")
    if type(ordinal) is not int or not isinstance(candidates, list) or ordinal < 0 or ordinal >= len(candidates):
        raise RoutingError("ATTEMPT_LOCK_INVALID", "attempt lock candidate ordinal is invalid", exit_code=4)
    expected = make_attempt_lock(snapshot, resolution, resolution_ordinal, candidates[ordinal])
    if lock != expected:
        raise RoutingError(
            "ATTEMPT_LOCK_INVALID",
            "attempt lock role, instance, policy, candidate, binding, or digest was changed",
            exit_code=4,
        )
    return snapshot, resolution, candidates[ordinal], expected


def validate_prior_attempts(value, ordinal, attempt_locks):
    if value is None:
        value = []
    if not isinstance(value, list) or len(value) > MAX_ATTEMPT_HISTORY or len(value) != ordinal:
        raise RoutingError(
            "REQUEST_INVALID",
            "prior_attempts must contain one bounded entry for every prior ordinal",
            exit_code=2,
        )
    normalized = []
    fields = {
        "ordinal",
        "outcome",
        "identity_status",
        "terminal",
        "integrated",
        "fallback_reason",
        "terminal_status",
        "attempt_lock_digest",
    }
    for expected_ordinal, item in enumerate(value):
        if not isinstance(item, dict) or set(item) != fields:
            raise RoutingError("REQUEST_INVALID", "prior attempt history entry is malformed", exit_code=2)
        prior_ordinal = item["ordinal"]
        if type(prior_ordinal) is not int or prior_ordinal != expected_ordinal or prior_ordinal >= len(attempt_locks):
            raise RoutingError("REQUEST_INVALID", "prior attempt history ordinal is invalid", exit_code=2)
        if type(item["terminal"]) is not bool or type(item["integrated"]) is not bool:
            raise RoutingError("REQUEST_INVALID", "prior attempt booleans must be true or false", exit_code=2)
        if not item["terminal"] or item["integrated"] or item["terminal_status"] != "next_candidate":
            raise RoutingError("REQUEST_INVALID", "prior attempt history is not retry-safe", exit_code=2)
        outcome = item["outcome"]
        expected = {
            "ok": ("mismatched", "identity_mismatch"),
            "unavailable": ("unavailable", "route_unavailable"),
            "failed": ("failed", "attempt_failed"),
        }.get(outcome)
        if expected is None or item["identity_status"] != expected[0]:
            raise RoutingError("REQUEST_INVALID", "prior attempt outcome or identity status is invalid", exit_code=2)
        reason = item["fallback_reason"]
        if not isinstance(reason, str) or not FALLBACK_TOKEN.fullmatch(reason) or reason != expected[1]:
            raise RoutingError("REQUEST_INVALID", "prior attempt fallback reason is invalid", exit_code=2)
        expected_lock_digest = attempt_locks[expected_ordinal]["lock_digest"]
        if item["attempt_lock_digest"] != expected_lock_digest:
            raise RoutingError("REQUEST_INVALID", "prior attempt history belongs to another route lock", exit_code=2)
        normalized.append(copy.deepcopy(item))
    return normalized


def fallback_reason(outcome, status, action):
    if action != "next_candidate":
        return None
    if outcome == "unavailable":
        return "route_unavailable"
    if outcome == "failed":
        return "attempt_failed"
    if status == "mismatched":
        return "identity_mismatch"
    return None


def receipt(snapshot, resolution, lock, candidate, outcome, report, status, action, attempt, prior_attempts):
    binding = resolution["binding"]
    current_fallback = fallback_reason(outcome, status, action)
    attempts = prior_attempts + [{
        "ordinal": attempt["ordinal"],
        "outcome": outcome,
        "identity_status": status,
        "terminal": attempt["terminal"],
        "integrated": attempt["integrated"],
        "fallback_reason": current_fallback,
        "terminal_status": action,
        "attempt_lock_digest": lock["lock_digest"],
    }]
    cumulative_fallback = next(
        (item["fallback_reason"] for item in reversed(attempts) if item["fallback_reason"] is not None),
        None,
    )
    return {
        "snapshot_id": snapshot["id"],
        "binding_digest": lock["binding_digest"],
        "attempt_lock_digest": lock["lock_digest"],
        "role": resolution["role"],
        "class": resolution["class"],
        "profile": binding.get("profile"),
        "source_layer": binding.get("source_layer"),
        "source_authority": binding.get("source_authority"),
        "profile_source_layer": binding.get("profile_source_layer"),
        "profile_source_authority": binding.get("profile_source_authority"),
        "policy": binding.get("policy"),
        "harness_requested": candidate.get("harness"),
        "route_requested": candidate.get("route"),
        "provider_actual": report.get("provider_actual"),
        "model_requested": candidate.get("model"),
        "model_actual": report.get("model_actual"),
        "effort_requested": candidate.get("effort"),
        "effort_actual": report.get("effort_actual"),
        "variant_actual": report.get("variant_actual"),
        "adapter_outcome": outcome,
        "identity_status": "accepted_unverified" if status == "unverified" and action == "accept" else status,
        "attempts": attempts,
        "fallback_reason": cumulative_fallback,
        "terminal_status": action,
    }


def finalize_attempt_op(request, schema, roles):
    attempt = request.get("attempt")
    outcome = request.get("outcome")
    if not isinstance(attempt, dict) or set(attempt) != {"ordinal", "terminal", "integrated"}:
        raise RoutingError("REQUEST_INVALID", "finalize_attempt requires exact attempt and report objects", exit_code=2)
    report = validate_serving_report(request.get("report", {}))
    if outcome not in ADAPTER_OUTCOMES:
        raise RoutingError("REQUEST_INVALID", "finalize_attempt outcome must be ok, unavailable, or failed", exit_code=2)
    snapshot, resolution, candidate, lock = validate_finalize_lock(request, schema, roles)
    binding = resolution["binding"]
    candidates = binding.get("candidates")
    ordinal = attempt.get("ordinal")
    if type(ordinal) is not int or ordinal != lock["candidate_ordinal"]:
        raise RoutingError("ATTEMPT_LOCK_INVALID", "attempt ordinal does not match its immutable lock", exit_code=4)
    terminal = attempt.get("terminal")
    integrated = attempt.get("integrated")
    if type(terminal) is not bool or type(integrated) is not bool:
        raise RoutingError("REQUEST_INVALID", "attempt terminal and integrated must be booleans", exit_code=2)
    if not terminal or integrated:
        raise RoutingError("RETRY_UNSAFE", "cannot finalize an in-flight or integrated attempt", exit_code=4)
    attempt_locks = [
        make_attempt_lock(snapshot, resolution, lock["resolution_ordinal"], item)
        for item in candidates
    ]
    prior_attempts = validate_prior_attempts(request.get("prior_attempts"), ordinal, attempt_locks)
    policy = binding.get("policy")
    if policy not in ("prefer", "require"):
        raise RoutingError("REQUEST_INVALID", "frozen binding policy must be prefer or require", exit_code=2)
    if outcome != "ok":
        status = outcome
        action = "next_candidate" if policy == "prefer" and ordinal + 1 < len(candidates) else "block"
    elif candidate.get("kind") == "ce-default":
        status = "ce-default"
        action = "accept"
    else:
        status = identity_status(candidate, report)
        if policy == "require" and status != "verified":
            action = "block"
        elif policy == "prefer" and status == "mismatched":
            action = "next_candidate" if ordinal + 1 < len(candidates) else "block"
        else:
            action = "accept"
    result = {
        "ok": action != "block",
        "protocol": PROTOCOL,
        "op": "finalize_attempt",
        "action": action,
        "receipt": receipt(
            snapshot,
            resolution,
            lock,
            candidate,
            outcome,
            report,
            status,
            action,
            attempt,
            prior_attempts,
        ),
    }
    if action == "next_candidate":
        result["next_candidate"] = candidates[ordinal + 1]
        result["next_attempt_lock"] = attempt_locks[ordinal + 1]
    if action == "block":
        error_code = {
            "mismatched": "IDENTITY_MISMATCH",
            "unverified": "IDENTITY_REQUIRED",
            "unavailable": "ROUTE_UNAVAILABLE",
            "failed": "ATTEMPT_FAILED",
        }.get(status, "IDENTITY_REQUIRED")
        result["error"] = {
            "code": error_code,
            "message": "adapter outcome or serving identity did not satisfy the frozen route policy",
        }
    return result, 4 if action == "block" else 0


def ensure_private_dir(path):
    try:
        os.mkdir(path, 0o700)
    except FileExistsError:
        pass
    st = validate_owned_path_component(path, True)
    if st is None:
        raise RoutingError("WRITE_UNSAFE", "cannot create private routing directory", exit_code=5, path=path)
    if mode_bits(st) != 0o700:
        try:
            os.chmod(path, 0o700)
        except OSError as exc:
            raise RoutingError("WRITE_UNSAFE", "cannot secure routing directory", exit_code=5, path=path) from exc


@contextlib.contextmanager
def routing_lock(path, operation):
    writing = operation == fcntl.LOCK_EX
    error_code = "WRITE_UNSAFE" if writing else "CONFIG_UNSAFE"
    exit_code = 5 if writing else 3
    scratch = "/tmp/compound-engineering-{}".format(current_uid() if current_uid() is not None else "user")
    ensure_private_dir(scratch)
    routing_dir = os.path.join(scratch, "routing")
    locks_dir = os.path.join(routing_dir, "locks")
    ensure_private_dir(routing_dir)
    ensure_private_dir(locks_dir)
    lock_name = hashlib.sha256(os.path.abspath(path).encode("utf-8")).hexdigest() + ".lock"
    lock_path = os.path.join(locks_dir, lock_name)
    try:
        fd = os.open(lock_path, os.O_RDWR | os.O_CREAT | O_NOFOLLOW, 0o600)
    except OSError as exc:
        raise RoutingError(error_code, "cannot safely open routing source lock", exit_code=exit_code) from exc
    acquired = False
    try:
        st = os.fstat(fd)
        if not stat.S_ISREG(st.st_mode) or (current_uid() is not None and st.st_uid != current_uid()) or mode_bits(st) != 0o600:
            raise RoutingError(error_code, "routing lock owner/type/mode validation failed", exit_code=exit_code)
        try:
            fcntl.flock(fd, fcntl.LOCK_EX)
            acquired = True
        except OSError as exc:
            raise RoutingError(error_code, "cannot acquire routing source lock", exit_code=exit_code) from exc
        try:
            current = os.stat(lock_path, follow_symlinks=False)
        except OSError as exc:
            raise RoutingError(error_code, "routing lock changed while acquiring it", exit_code=exit_code) from exc
        if (
            not stat.S_ISREG(current.st_mode)
            or (current_uid() is not None and current.st_uid != current_uid())
            or mode_bits(current) != 0o600
            or (st.st_dev, st.st_ino) != (current.st_dev, current.st_ino)
        ):
            raise RoutingError(error_code, "routing lock changed while acquiring it", exit_code=exit_code)
        recover_source_transaction(path, writing)
        if not writing:
            try:
                fcntl.flock(fd, fcntl.LOCK_SH)
            except OSError as exc:
                raise RoutingError(error_code, "cannot downgrade routing source lock", exit_code=exit_code) from exc
        yield
    finally:
        if acquired:
            with contextlib.suppress(OSError):
                fcntl.flock(fd, fcntl.LOCK_UN)
        os.close(fd)


@contextlib.contextmanager
def read_locks(paths):
    with contextlib.ExitStack() as stack:
        for path in sorted({os.path.abspath(path) for path in paths}):
            stack.enter_context(routing_lock(path, fcntl.LOCK_SH))
        yield


@contextlib.contextmanager
def write_lock(path):
    with routing_lock(path, fcntl.LOCK_EX):
        yield


def emit_scalar(value):
    if value is None:
        return "null"
    if value is True:
        return "true"
    if value is False:
        return "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, (dict, list)):
        return json.dumps(value, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
    return json.dumps(value, ensure_ascii=True)


def emit_config(data, schema):
    ordered = [key for key in schema["settings"] if key in data]
    return "".join("{}: {}\n".format(json.dumps(key), emit_scalar(data[key])) for key in ordered).encode("utf-8")


@contextlib.contextmanager
def secure_directory_fd(path, create=False):
    absolute = os.path.abspath(path)
    parts = [part for part in absolute.split(os.sep) if part]
    try:
        fd = os.open(os.sep, os.O_RDONLY | O_DIRECTORY)
    except OSError as exc:
        raise RoutingError("WRITE_UNSAFE", "cannot anchor configuration directory", exit_code=5, path=path) from exc
    current = os.sep
    try:
        for part in parts:
            current = os.path.join(current, part)
            created = False
            try:
                before = os.stat(part, dir_fd=fd, follow_symlinks=False)
            except FileNotFoundError:
                if not create:
                    raise RoutingError("WRITE_UNSAFE", "configuration directory is missing", exit_code=5, path=current)
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                    created = True
                except FileExistsError:
                    pass
                except OSError as exc:
                    raise RoutingError("WRITE_UNSAFE", "cannot create configuration directory", exit_code=5, path=current) from exc
                try:
                    before = os.stat(part, dir_fd=fd, follow_symlinks=False)
                except OSError as exc:
                    raise RoutingError("WRITE_UNSAFE", "cannot inspect created configuration directory", exit_code=5, path=current) from exc
            except OSError as exc:
                raise RoutingError("WRITE_UNSAFE", "cannot inspect configuration directory", exit_code=5, path=current) from exc
            if stat.S_ISLNK(before.st_mode) or not stat.S_ISDIR(before.st_mode):
                raise RoutingError("WRITE_UNSAFE", "configuration directory chain is unsafe", exit_code=5, path=current)
            try:
                child = os.open(part, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=fd)
            except OSError as exc:
                raise RoutingError("WRITE_UNSAFE", "cannot safely open configuration directory", exit_code=5, path=current) from exc
            after = os.fstat(child)
            if not stat.S_ISDIR(after.st_mode) or (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino):
                os.close(child)
                raise RoutingError("WRITE_UNSAFE", "configuration directory changed during traversal", exit_code=5, path=current)
            if created:
                try:
                    os.fchmod(child, 0o700)
                except OSError as exc:
                    os.close(child)
                    raise RoutingError("WRITE_UNSAFE", "cannot secure configuration directory", exit_code=5, path=current) from exc
            os.close(fd)
            fd = child
        final = os.fstat(fd)
        if current_uid() is not None and final.st_uid != current_uid():
            raise RoutingError("WRITE_UNSAFE", "configuration directory is not user-owned", exit_code=5, path=path)
        if mode_bits(final) & 0o022:
            raise RoutingError("WRITE_UNSAFE", "configuration directory is group/world writable", exit_code=5, path=path)
        yield fd
    finally:
        os.close(fd)


def create_parent_for_write(layer, repo):
    if layer == "global":
        root, path = global_config_path()
        parent = root
    else:
        if repo is None:
            raise RoutingError("WRITE_UNSAFE", "project writes require a Git repository", exit_code=5)
        parent = os.path.join(repo, ".compound-engineering")
        path = os.path.join(parent, "config.local.yaml")
    if layer == "global":
        with secure_directory_fd(parent, create=True):
            pass
    else:
        try:
            os.mkdir(parent, 0o700)
        except FileExistsError:
            pass
        except OSError as exc:
            raise RoutingError("WRITE_UNSAFE", "cannot create configuration directory", exit_code=5, path=parent) from exc
    validate_owned_path_component(parent, True)
    return parent, path


def read_commit_source(parent_fd, name, path, cap):
    try:
        fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=parent_fd)
    except OSError as exc:
        if exc.errno == errno.ENOENT:
            raise RoutingError("WRITE_CONFLICT", "configuration disappeared before replacement", exit_code=5) from exc
        reason = "symlink" if exc.errno == errno.ELOOP else "open"
        raise RoutingError("WRITE_UNSAFE", "cannot safely reopen configuration", exit_code=5, reason=reason, path=path) from exc
    try:
        before = os.fstat(fd)
        if not stat.S_ISREG(before.st_mode):
            raise RoutingError("WRITE_UNSAFE", "configuration is not a regular file", exit_code=5, path=path)
        if current_uid() is not None and before.st_uid != current_uid():
            raise RoutingError("WRITE_UNSAFE", "configuration is not user-owned", exit_code=5, path=path)
        if mode_bits(before) & 0o022:
            raise RoutingError("WRITE_UNSAFE", "configuration is group/world writable", exit_code=5, path=path)
        chunks = []
        total = 0
        while total <= cap:
            part = os.read(fd, min(65536, cap + 1 - total))
            if not part:
                break
            chunks.append(part)
            total += len(part)
        if total > cap:
            raise RoutingError("WRITE_CONFLICT", "configuration grew before replacement", exit_code=5)
        after = os.fstat(fd)
    finally:
        os.close(fd)
    try:
        current = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
    except OSError as exc:
        raise RoutingError("WRITE_CONFLICT", "configuration changed before replacement", exit_code=5) from exc
    identity = file_identity(before)
    if identity != file_identity(after) or identity != file_identity(current):
        raise RoutingError("WRITE_CONFLICT", "configuration changed before replacement", exit_code=5)
    return b"".join(chunks), identity


def create_temp_at(parent_fd):
    for _ in range(128):
        name = ".ce-config-{}-{}".format(os.getpid(), os.urandom(12).hex())
        try:
            fd = os.open(
                name,
                os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW,
                0o600,
                dir_fd=parent_fd,
            )
            return fd, name
        except FileExistsError:
            continue
        except OSError as exc:
            raise RoutingError("WRITE_UNSAFE", "cannot create configuration temporary file", exit_code=5) from exc
    raise RoutingError("WRITE_UNSAFE", "cannot reserve configuration temporary file", exit_code=5)


def create_replacement_directory(parent_fd):
    for _ in range(128):
        name = ".ce-replace-{}-{}".format(os.getpid(), os.urandom(12).hex())
        try:
            os.mkdir(name, 0o700, dir_fd=parent_fd)
            fd = os.open(name, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=parent_fd)
            return fd, name
        except FileExistsError:
            continue
        except OSError as exc:
            raise RoutingError("WRITE_UNSAFE", "cannot create replacement state directory", exit_code=5) from exc
    raise RoutingError("WRITE_UNSAFE", "cannot reserve replacement state directory", exit_code=5)


def write_private_file(directory_fd, name, data):
    try:
        fd = os.open(
            name,
            os.O_WRONLY | os.O_CREAT | os.O_EXCL | O_NOFOLLOW,
            0o600,
            dir_fd=directory_fd,
        )
    except OSError as exc:
        raise RoutingError("WRITE_UNSAFE", "cannot create replacement transaction state", exit_code=5) from exc
    try:
        view = memoryview(data)
        while view:
            written = os.write(fd, view)
            view = view[written:]
        os.fsync(fd)
    finally:
        os.close(fd)


def replacement_error(writing, parent, names, message="configuration replacement requires manual recovery"):
    raise RoutingError(
        "CONFIG_RECOVERY_REQUIRED",
        message,
        exit_code=5 if writing else 3,
        reason="replacement_ambiguous",
        transaction_paths=[os.path.join(parent, name) for name in names],
    )


def open_replacement_directory(parent_fd, parent, transaction_name, writing):
    fd = None
    try:
        before = os.stat(transaction_name, dir_fd=parent_fd, follow_symlinks=False)
        fd = os.open(transaction_name, os.O_RDONLY | O_DIRECTORY | O_NOFOLLOW, dir_fd=parent_fd)
        after = os.fstat(fd)
    except OSError:
        if fd is not None:
            os.close(fd)
        replacement_error(writing, parent, [transaction_name])
    if (
        not stat.S_ISDIR(before.st_mode)
        or not stat.S_ISDIR(after.st_mode)
        or (current_uid() is not None and (before.st_uid != current_uid() or after.st_uid != current_uid()))
        or mode_bits(before) != 0o700
        or mode_bits(after) != 0o700
        or (before.st_dev, before.st_ino) != (after.st_dev, after.st_ino)
    ):
        os.close(fd)
        replacement_error(writing, parent, [transaction_name])
    return fd


def read_recovery_file(
    directory_fd,
    name,
    cap,
    writing,
    parent,
    transaction_name,
    required=False,
    private=False,
):
    try:
        fd = os.open(name, os.O_RDONLY | O_NOFOLLOW, dir_fd=directory_fd)
    except FileNotFoundError:
        if required:
            replacement_error(writing, parent, [transaction_name])
        return None
    except OSError:
        replacement_error(writing, parent, [transaction_name])
    try:
        before = os.fstat(fd)
        if (
            not stat.S_ISREG(before.st_mode)
            or (current_uid() is not None and before.st_uid != current_uid())
            or (mode_bits(before) != 0o600 if private else mode_bits(before) & 0o022)
            or before.st_size > cap
        ):
            replacement_error(writing, parent, [transaction_name])
        chunks = []
        total = 0
        while total <= cap:
            part = os.read(fd, min(65536, cap + 1 - total))
            if not part:
                break
            chunks.append(part)
            total += len(part)
        after = os.fstat(fd)
        try:
            current = os.stat(name, dir_fd=directory_fd, follow_symlinks=False)
        except OSError:
            replacement_error(writing, parent, [transaction_name])
    finally:
        os.close(fd)
    if total > cap or file_identity(before) != file_identity(after) or file_identity(after) != file_identity(current):
        replacement_error(writing, parent, [transaction_name])
    return b"".join(chunks), file_identity(after)


def read_recovery_destination(parent_fd, name, cap, writing, parent, transaction_name):
    return read_recovery_file(parent_fd, name, cap, writing, parent, transaction_name)


def parse_replacement_metadata(raw, writing, parent, transaction_name):
    try:
        value = json.loads(raw.decode("ascii"))
    except (UnicodeDecodeError, ValueError):
        replacement_error(writing, parent, [transaction_name])
    if (
        not isinstance(value, dict)
        or set(value) != {"protocol", "destination", "old_revision", "candidate_revision"}
        or value.get("protocol") != CONFIG_REPLACE_PROTOCOL
        or not isinstance(value.get("destination"), str)
        or not isinstance(value.get("old_revision"), str)
        or not CONFIG_REVISION.fullmatch(value["old_revision"])
        or value["old_revision"] == "cecfg-v1:absent"
        or not isinstance(value.get("candidate_revision"), str)
        or not CONFIG_REVISION.fullmatch(value["candidate_revision"])
        or value["candidate_revision"] == "cecfg-v1:absent"
    ):
        replacement_error(writing, parent, [transaction_name])
    return value


def replacement_metadata(transaction_fd, writing, parent, transaction_name):
    record = read_recovery_file(
        transaction_fd,
        "transaction.json",
        4096,
        writing,
        parent,
        transaction_name,
        required=True,
        private=True,
    )
    return parse_replacement_metadata(record[0], writing, parent, transaction_name)


def preserve_replacement_candidate(parent_fd, parent, transaction_fd, transaction_name):
    suffix = transaction_name[len(".ce-replace-"):]
    candidate_name = ".ce-candidate-{}".format(suffix)
    try:
        os.rename("candidate", candidate_name, src_dir_fd=transaction_fd, dst_dir_fd=parent_fd)
    except OSError:
        replacement_error(True, parent, [transaction_name])
    os.fsync(transaction_fd)
    os.fsync(parent_fd)
    return os.path.join(parent, candidate_name)


def retire_replacement_transaction(parent_fd, transaction_fd, transaction_name):
    suffix = transaction_name[len(".ce-replace-"):]
    cleanup_name = ".ce-cleanup-{}".format(suffix)
    try:
        os.rename(transaction_name, cleanup_name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd)
    except OSError as exc:
        raise RoutingError("WRITE_UNSAFE", "cannot retire replacement transaction", exit_code=5) from exc
    os.fsync(parent_fd)
    transaction_boundary("retired")
    for name in ("committed", "transaction.json"):
        with contextlib.suppress(FileNotFoundError):
            os.unlink(name, dir_fd=transaction_fd)
    os.fsync(transaction_fd)
    os.rmdir(cleanup_name, dir_fd=parent_fd)
    os.fsync(parent_fd)
    transaction_boundary("cleaned")


def create_commit_marker(transaction_fd):
    try:
        write_private_file(transaction_fd, "committed", b"ce-config-replace-commit/v1\n")
    except RoutingError:
        try:
            current = read_recovery_file(transaction_fd, "committed", 64, True, "", "", private=True)
        except RoutingError:
            raise
        if current is None or current[0] != b"ce-config-replace-commit/v1\n":
            raise
    os.fsync(transaction_fd)


def restore_cleanup_control(parent_fd, parent, name, records, writing):
    try:
        try:
            os.mkdir(name, 0o700, dir_fd=parent_fd)
        except FileExistsError:
            pass
        fd = open_replacement_directory(parent_fd, parent, name, writing)
        try:
            entries = set(os.listdir(fd))
            for entry, raw in records.items():
                if entry in entries:
                    current = read_recovery_file(fd, entry, 4096, writing, parent, name, required=True, private=True)
                    if current[0] != raw:
                        replacement_error(writing, parent, [name])
                else:
                    write_private_file(fd, entry, raw)
            os.fsync(fd)
        finally:
            os.close(fd)
        os.fsync(parent_fd)
    except OSError:
        replacement_error(writing, parent, [name])


def cleanup_stale_replacement_controls(parent_fd, parent, destination_name, names, writing):
    cleanup_names = sorted(name for name in names if name.startswith(".ce-cleanup-"))
    if not cleanup_names:
        return
    controls = []
    try:
        for name in cleanup_names:
            if re.fullmatch(r"\.ce-cleanup-[0-9]+-[0-9a-f]{24}", name) is None:
                replacement_error(writing, parent, cleanup_names)
            fd = open_replacement_directory(parent_fd, parent, name, writing)
            controls.append({"name": name, "fd": fd, "records": {}, "candidate_revision": None})
            try:
                entries = set(os.listdir(fd))
            except OSError:
                replacement_error(writing, parent, [name])
            if entries not in (set(), {"transaction.json"}, {"transaction.json", "committed"}):
                replacement_error(writing, parent, [name])
            records = controls[-1]["records"]
            if "transaction.json" in entries:
                metadata_record = read_recovery_file(
                    fd,
                    "transaction.json",
                    4096,
                    writing,
                    parent,
                    name,
                    required=True,
                    private=True,
                )
                metadata = parse_replacement_metadata(metadata_record[0], writing, parent, name)
                if metadata["destination"] != destination_name:
                    replacement_error(writing, parent, [name])
                records["transaction.json"] = metadata_record[0]
                controls[-1]["candidate_revision"] = metadata["candidate_revision"]
            if "committed" in entries:
                marker = read_recovery_file(
                    fd,
                    "committed",
                    64,
                    writing,
                    parent,
                    name,
                    required=True,
                    private=True,
                )
                if marker[0] != b"ce-config-replace-commit/v1\n":
                    replacement_error(writing, parent, [name])
                records["committed"] = marker[0]
            try:
                os.fsync(fd)
            except OSError:
                replacement_error(writing, parent, [name])
        destination = read_recovery_destination(
            parent_fd,
            destination_name,
            1024 * 1024,
            writing,
            parent,
            cleanup_names[0],
        )
        if destination is None:
            replacement_error(writing, parent, cleanup_names)
        destination_revision = digest("cecfg-v1", destination[0])
        if any(
            control["candidate_revision"] is not None
            and control["candidate_revision"] != destination_revision
            for control in controls
        ):
            replacement_error(writing, parent, cleanup_names)
        try:
            os.fsync(parent_fd)
        except OSError:
            replacement_error(writing, parent, cleanup_names)

        removed = []
        for control in controls:
            name = control["name"]
            fd = control["fd"]
            records = control["records"]
            try:
                current_destination = os.stat(destination_name, dir_fd=parent_fd, follow_symlinks=False)
                if (
                    not stat.S_ISREG(current_destination.st_mode)
                    or (current_uid() is not None and current_destination.st_uid != current_uid())
                    or mode_bits(current_destination) & 0o022
                    or file_identity(current_destination) != destination[1]
                ):
                    raise OSError(errno.ESTALE, "configuration changed before cleanup retirement")
                before = os.fstat(fd)
                current = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                if (before.st_dev, before.st_ino) != (current.st_dev, current.st_ino):
                    replacement_error(writing, parent, [name])
                for entry in ("committed", "transaction.json"):
                    if entry in records:
                        os.unlink(entry, dir_fd=fd)
                os.fsync(fd)
                os.rmdir(name, dir_fd=parent_fd)
                os.fsync(parent_fd)
                removed.append(control)
            except OSError:
                for restore in removed + [control]:
                    restore_cleanup_control(
                        parent_fd,
                        parent,
                        restore["name"],
                        restore["records"],
                        writing,
                    )
                replacement_error(writing, parent, cleanup_names)
    finally:
        for control in controls:
            os.close(control["fd"])


def recover_replacement_transaction(parent_fd, parent, name, transaction_name, cap, writing):
    transaction_fd = open_replacement_directory(parent_fd, parent, transaction_name, writing)
    try:
        try:
            entries = set(os.listdir(transaction_fd))
        except OSError:
            replacement_error(writing, parent, [transaction_name])
        if not entries.issubset({"transaction.json", "candidate", "source", "committed"}):
            replacement_error(writing, parent, [transaction_name])
        metadata = replacement_metadata(transaction_fd, writing, parent, transaction_name)
        if metadata["destination"] != name:
            replacement_error(writing, parent, [transaction_name])
        candidate = read_recovery_file(transaction_fd, "candidate", cap, writing, parent, transaction_name, private=True)
        source = read_recovery_file(transaction_fd, "source", cap, writing, parent, transaction_name)
        marker = read_recovery_file(transaction_fd, "committed", 64, writing, parent, transaction_name, private=True)
        destination = read_recovery_destination(parent_fd, name, cap, writing, parent, transaction_name)
        if candidate is not None and digest("cecfg-v1", candidate[0]) != metadata["candidate_revision"]:
            replacement_error(writing, parent, [transaction_name])
        if source is not None and digest("cecfg-v1", source[0]) != metadata["old_revision"]:
            replacement_error(writing, parent, [transaction_name])
        if marker is not None and marker[0] != b"ce-config-replace-commit/v1\n":
            replacement_error(writing, parent, [transaction_name])
        destination_revision = digest("cecfg-v1", destination[0]) if destination is not None else None
        destination_is_candidate = (
            destination is not None
            and candidate is not None
            and destination[1][:2] == candidate[1][:2]
            and destination_revision == metadata["candidate_revision"]
        )
        destination_is_source = (
            destination is not None
            and source is not None
            and destination[1][:2] == source[1][:2]
            and destination_revision == metadata["old_revision"]
        )

        if marker is not None:
            if destination is None:
                if candidate is None:
                    replacement_error(writing, parent, [transaction_name])
                os.link("candidate", name, src_dir_fd=transaction_fd, dst_dir_fd=parent_fd, follow_symlinks=False)
                os.fsync(parent_fd)
            elif destination_revision != metadata["candidate_revision"]:
                replacement_error(writing, parent, [transaction_name])
            if source is not None:
                os.unlink("source", dir_fd=transaction_fd)
            if candidate is not None:
                os.unlink("candidate", dir_fd=transaction_fd)
            os.fsync(transaction_fd)
            retire_replacement_transaction(parent_fd, transaction_fd, transaction_name)
            return

        if source is None and candidate is not None and destination_revision == metadata["old_revision"]:
            preserve_replacement_candidate(parent_fd, parent, transaction_fd, transaction_name)
            retire_replacement_transaction(parent_fd, transaction_fd, transaction_name)
            return

        if source is not None and candidate is not None and destination_is_candidate:
            create_commit_marker(transaction_fd)
            os.unlink("source", dir_fd=transaction_fd)
            os.unlink("candidate", dir_fd=transaction_fd)
            os.fsync(transaction_fd)
            retire_replacement_transaction(parent_fd, transaction_fd, transaction_name)
            return

        if source is not None and candidate is not None and (destination is None or destination_is_source):
            if destination is None:
                os.link("source", name, src_dir_fd=transaction_fd, dst_dir_fd=parent_fd, follow_symlinks=False)
                os.fsync(parent_fd)
            preserve_replacement_candidate(parent_fd, parent, transaction_fd, transaction_name)
            os.unlink("source", dir_fd=transaction_fd)
            os.fsync(transaction_fd)
            retire_replacement_transaction(parent_fd, transaction_fd, transaction_name)
            return
        replacement_error(writing, parent, [transaction_name])
    except OSError:
        replacement_error(writing, parent, [transaction_name])
    finally:
        os.close(transaction_fd)


def recover_source_transaction(path, writing):
    parent = os.path.dirname(path)
    name = os.path.basename(path)
    try:
        parent_state = os.lstat(parent)
    except FileNotFoundError:
        return
    except OSError:
        replacement_error(writing, parent, [])
    if stat.S_ISLNK(parent_state.st_mode) or not stat.S_ISDIR(parent_state.st_mode):
        replacement_error(writing, parent, [])
    try:
        with secure_directory_fd(parent) as parent_fd:
            try:
                names = os.listdir(parent_fd)
            except OSError:
                replacement_error(writing, parent, [])
            cleanup_stale_replacement_controls(parent_fd, parent, name, names, writing)
            transactions = sorted(name for name in names if name.startswith(".ce-replace-"))
            if not transactions:
                return
            if len(transactions) != 1 or re.fullmatch(r"\.ce-replace-[0-9]+-[0-9a-f]{24}", transactions[0]) is None:
                replacement_error(writing, parent, transactions)
            recover_replacement_transaction(parent_fd, parent, name, transactions[0], 1024 * 1024, writing)
    except RoutingError as exc:
        if exc.code == "CONFIG_RECOVERY_REQUIRED" or writing:
            raise
        raise RoutingError(
            "CONFIG_RECOVERY_REQUIRED",
            "configuration replacement cannot be recovered safely",
            reason="replacement_ambiguous",
            transaction_paths=exc.details.get("transaction_paths", []),
        ) from exc


def abort_replacement(parent_fd, parent, name, transaction_fd, transaction_name, metadata, cap, message):
    candidate = read_recovery_file(
        transaction_fd,
        "candidate",
        cap,
        True,
        parent,
        transaction_name,
        required=True,
        private=True,
    )
    source = read_recovery_file(transaction_fd, "source", cap, True, parent, transaction_name)
    destination = read_recovery_destination(parent_fd, name, cap, True, parent, transaction_name)
    candidate_path = os.path.join(parent, transaction_name, "candidate")
    if source is None:
        if destination is None or digest("cecfg-v1", destination[0]) != metadata["old_revision"]:
            replacement_error(True, parent, [transaction_name])
    else:
        source_revision = digest("cecfg-v1", source[0])
        destination_is_candidate = (
            destination is not None
            and destination[1][:2] == candidate[1][:2]
            and digest("cecfg-v1", destination[0]) == metadata["candidate_revision"]
        )
        if source_revision == metadata["old_revision"]:
            if destination_is_candidate:
                os.unlink(name, dir_fd=parent_fd)
                os.fsync(parent_fd)
                destination = None
            if destination is None:
                os.link("source", name, src_dir_fd=transaction_fd, dst_dir_fd=parent_fd, follow_symlinks=False)
                os.fsync(parent_fd)
            elif destination[1][:2] != source[1][:2]:
                replacement_error(True, parent, [transaction_name])
        elif destination is None:
            os.link("source", name, src_dir_fd=transaction_fd, dst_dir_fd=parent_fd, follow_symlinks=False)
            os.fsync(parent_fd)
        else:
            replacement_error(True, parent, [transaction_name])
        os.unlink("source", dir_fd=transaction_fd)
        os.fsync(transaction_fd)
    candidate_path = preserve_replacement_candidate(parent_fd, parent, transaction_fd, transaction_name)
    retire_replacement_transaction(parent_fd, transaction_fd, transaction_name)
    raise RoutingError(
        "WRITE_CONFLICT",
        message,
        exit_code=5,
        candidate_path=candidate_path,
        _replacement_resolved=True,
    )


def atomic_write(path, data, source, cap):
    parent = os.path.dirname(path)
    name = os.path.basename(path)
    with secure_directory_fd(parent) as parent_fd:
        replacement_fd = None
        replacement_name = None
        try:
            if source["exists"]:
                current_raw, current_identity = read_commit_source(parent_fd, name, path, cap)
                if current_identity != source["identity"] or digest("cecfg-v1", current_raw) != source["revision"]:
                    raise RoutingError("WRITE_CONFLICT", "configuration changed before replacement", exit_code=5)
                try:
                    final = os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                except OSError as exc:
                    raise RoutingError("WRITE_CONFLICT", "configuration changed before replacement", exit_code=5) from exc
                if file_identity(final) != source["identity"]:
                    raise RoutingError("WRITE_CONFLICT", "configuration changed before replacement", exit_code=5)
                replacement_fd, replacement_name = create_replacement_directory(parent_fd)
                os.fsync(parent_fd)
                transaction_boundary("transaction-created")
                write_private_file(replacement_fd, "candidate", data)
                os.fsync(replacement_fd)
                transaction_boundary("candidate-durable")
                metadata = {
                    "protocol": CONFIG_REPLACE_PROTOCOL,
                    "destination": name,
                    "old_revision": source["revision"],
                    "candidate_revision": digest("cecfg-v1", data),
                }
                write_private_file(
                    replacement_fd,
                    "transaction.json",
                    (canonical_json(metadata) + "\n").encode("ascii"),
                )
                os.fsync(replacement_fd)
                os.fsync(parent_fd)
                transaction_boundary("metadata-durable")
                try:
                    os.rename(name, "source", src_dir_fd=parent_fd, dst_dir_fd=replacement_fd)
                except OSError as exc:
                    raise RoutingError(
                        "WRITE_CONFLICT",
                        "configuration changed at the replacement boundary",
                        exit_code=5,
                        candidate_path=os.path.join(parent, replacement_name, "candidate"),
                    ) from exc
                os.fsync(replacement_fd)
                os.fsync(parent_fd)
                transaction_boundary("displaced")
                displaced_raw, displaced_identity = read_commit_source(replacement_fd, "source", path, cap)
                if displaced_identity[:4] != source["identity"][:4] or digest("cecfg-v1", displaced_raw) != source["revision"]:
                    abort_replacement(
                        parent_fd,
                        parent,
                        name,
                        replacement_fd,
                        replacement_name,
                        metadata,
                        cap,
                        "configuration changed at the replacement boundary",
                    )
                try:
                    os.link(
                        "candidate",
                        name,
                        src_dir_fd=replacement_fd,
                        dst_dir_fd=parent_fd,
                        follow_symlinks=False,
                    )
                except FileExistsError:
                    replacement_error(
                        True,
                        parent,
                        [replacement_name],
                        "configuration reappeared during replacement; all versions were preserved",
                    )
                os.fsync(parent_fd)
                transaction_boundary("installed")
                installed_raw, installed_identity = read_commit_source(parent_fd, name, path, cap)
                candidate_identity = file_identity(os.stat("candidate", dir_fd=replacement_fd, follow_symlinks=False))
                if installed_identity != candidate_identity or installed_raw != data:
                    replacement_error(
                        True,
                        parent,
                        [replacement_name],
                        "configuration changed while completing replacement; all versions were preserved",
                    )
                create_commit_marker(replacement_fd)
                transaction_boundary("committed")
                os.unlink("source", dir_fd=replacement_fd)
                os.fsync(replacement_fd)
                transaction_boundary("source-cleaned")
                os.unlink("candidate", dir_fd=replacement_fd)
                os.fsync(replacement_fd)
                transaction_boundary("candidate-cleaned")
                retire_replacement_transaction(parent_fd, replacement_fd, replacement_name)
                os.close(replacement_fd)
                replacement_fd = None
                replacement_name = None
            else:
                fd, tmp_name = create_temp_at(parent_fd)
                try:
                    try:
                        view = memoryview(data)
                        while view:
                            written = os.write(fd, view)
                            view = view[written:]
                        os.fsync(fd)
                    finally:
                        os.close(fd)
                    try:
                        os.stat(name, dir_fd=parent_fd, follow_symlinks=False)
                    except FileNotFoundError:
                        pass
                    except OSError as exc:
                        raise RoutingError("WRITE_UNSAFE", "cannot inspect configuration destination", exit_code=5) from exc
                    else:
                        raise RoutingError("WRITE_CONFLICT", "configuration appeared during create", exit_code=5)
                    try:
                        os.link(tmp_name, name, src_dir_fd=parent_fd, dst_dir_fd=parent_fd, follow_symlinks=False)
                    except FileExistsError as exc:
                        raise RoutingError("WRITE_CONFLICT", "configuration appeared during create", exit_code=5) from exc
                    os.unlink(tmp_name, dir_fd=parent_fd)
                    tmp_name = None
                finally:
                    if tmp_name is not None:
                        with contextlib.suppress(OSError):
                            os.unlink(tmp_name, dir_fd=parent_fd)
            os.fsync(parent_fd)
        except BaseException as exc:
            if isinstance(exc, RoutingError) and exc.details.pop("_replacement_resolved", False):
                raise
            if isinstance(exc, RoutingError) and exc.code == "CONFIG_RECOVERY_REQUIRED":
                raise
            if replacement_fd is not None and replacement_name is not None:
                try:
                    metadata
                except UnboundLocalError:
                    pass
                else:
                    abort_replacement(
                        parent_fd,
                        parent,
                        name,
                        replacement_fd,
                        replacement_name,
                        metadata,
                        cap,
                        "configuration could not be replaced without losing concurrent data",
                    )
            raise
        finally:
            if replacement_fd is not None:
                with contextlib.suppress(OSError):
                    os.close(replacement_fd)


def validate_patch_writer(writer, consumer, layer, updates, removals, schema):
    if not isinstance(writer, str) or not NAME_TOKEN.fullmatch(writer):
        raise RoutingError("REQUEST_INVALID", "patch_source requires a stable writer", exit_code=2)
    known_writers = {
        name
        for spec in schema["settings"].values()
        for name in spec.get("writers", [])
    }
    if writer not in known_writers:
        raise RoutingError("REQUEST_INVALID", "patch_source writer is unknown", exit_code=2)
    if writer != consumer:
        raise RoutingError(
            "WRITE_UNSAFE",
            "patch_source writer does not match the executing skill",
            exit_code=5,
            writer=writer,
            consumer=consumer,
        )
    if layer == "global" and writer != "ce-setup":
        raise RoutingError("WRITE_UNSAFE", "only ce-setup may write global configuration", exit_code=5, writer=writer)
    if set(updates) & set(removals):
        raise RoutingError("REQUEST_INVALID", "patch_source cannot set and remove the same key", exit_code=2)
    for key in list(updates) + list(removals):
        if key in schema.get("retired", {}):
            if writer == "ce-setup" and key in removals:
                continue
            raise RoutingError("WRITE_UNSAFE", "only ce-setup may remove retired settings", exit_code=5, writer=writer, setting=key)
        spec = schema["settings"].get(key)
        if spec is None:
            raise RoutingError("REQUEST_INVALID", "patch_source references an unknown setting", exit_code=2, setting=key)
        if writer not in spec.get("writers", []):
            raise RoutingError(
                "WRITE_UNSAFE",
                "patch_source writer does not own the requested setting",
                exit_code=5,
                writer=writer,
                setting=key,
            )


def patch_source_op(request, schema, roles, consumer):
    layer = request.get("layer")
    if layer not in ("global", "project"):
        raise RoutingError("REQUEST_INVALID", "patch_source layer must be global or project", exit_code=2)
    expected = request.get("expected_revision")
    writer = request.get("writer")
    updates = request.get("set", {})
    removals = request.get("remove", [])
    if (
        not isinstance(expected, str)
        or not CONFIG_REVISION.fullmatch(expected)
        or not isinstance(updates, dict)
        or not isinstance(removals, list)
        or not all(isinstance(item, str) for item in removals)
        or len(removals) != len(set(removals))
    ):
        raise RoutingError("REQUEST_INVALID", "patch_source request is malformed", exit_code=2)
    validate_patch_writer(writer, consumer, layer, updates, removals, schema)
    cwd = request.get("cwd")
    if not isinstance(cwd, str) or not os.path.isabs(cwd):
        raise RoutingError("REQUEST_INVALID", "cwd must be an absolute path", exit_code=2)
    repo = project_root(cwd)
    parent, path = create_parent_for_write(layer, repo)
    limits = schema["limits"]
    with write_lock(path):
        source = read_source(layer, parent, path, limits, repo=repo if layer == "project" else None)
        if writer != "ce-setup" and isinstance(source["data"], dict) and set(source["data"]) & set(schema.get("retired", {})):
            raise RoutingError(
                "WRITE_UNSAFE",
                "source contains retired settings outside this writer's ownership",
                exit_code=5,
                writer=writer,
            )
        validate_source(source, schema, roles)
        if source["revision"] != expected:
            raise RoutingError("WRITE_CONFLICT", "configuration revision changed", exit_code=5, current_revision=source["revision"])
        data = copy.deepcopy(source["data"])
        for key in removals:
            data.pop(key, None)
        for key, value in updates.items():
            data[key] = value
        candidate_source = dict(source)
        candidate_source["data"] = data
        candidate_source["diagnostics"] = []
        validated = validate_source(candidate_source, schema, roles)["data"]
        output = emit_config(validated, schema)
        atomic_write(path, output, source, limits["config_bytes"])
    return {
        "ok": True,
        "protocol": PROTOCOL,
        "op": "patch_source",
        "writer": writer,
        "consumer": consumer,
        "layer": layer,
        "path": path,
        "previous_revision": expected,
        "revision": digest("cecfg-v1", output),
    }, 0


def parse_request(limit, request_file):
    try:
        if request_file:
            fd = os.open(request_file, os.O_RDONLY | O_NOFOLLOW)
            try:
                data = os.read(fd, limit + 1)
            finally:
                os.close(fd)
        else:
            data = sys.stdin.buffer.read(limit + 1)
    except OSError as exc:
        raise RoutingError("REQUEST_INVALID", "cannot read routing request", exit_code=2) from exc
    if len(data) > limit:
        raise RoutingError("REQUEST_INVALID", "routing request exceeds size limit", exit_code=2)
    try:
        request = json.loads(data.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as exc:
        raise RoutingError("REQUEST_INVALID", "routing request must be UTF-8 JSON", exit_code=2) from exc
    if not isinstance(request, dict):
        raise RoutingError("REQUEST_INVALID", "routing request root must be an object", exit_code=2)
    if request.get("protocol") != PROTOCOL:
        raise RoutingError("PROTOCOL_UNSUPPORTED", "unsupported routing protocol", exit_code=2)
    return request


def execute(request, schema, roles, consumer):
    op = request.get("op")
    if op == "inspect":
        return inspect_op(request, schema, roles)
    if op == "resolve_batch":
        return resolve_batch_op(request, schema, roles)
    if op == "finalize_attempt":
        return finalize_attempt_op(request, schema, roles)
    if op == "patch_source":
        return patch_source_op(request, schema, roles, consumer)
    raise RoutingError("REQUEST_INVALID", "unknown routing operation", exit_code=2)


def main():
    parser = argparse.ArgumentParser(add_help=True)
    parser.add_argument("--request-file")
    args = parser.parse_args()
    exit_code = 0
    try:
        require_runtime()
        schema = load_json_asset("settings-schema.json", "ce-routing-schema.json")
        roles = validate_role_catalog(load_json_asset("dispatch-roles.json", "dispatch-roles.json"))
        consumer = load_consumer_identity()
        if schema.get("protocol") != PROTOCOL:
            raise RoutingError("ASSET_INVALID", "routing asset version mismatch")
        request = parse_request(schema["limits"]["request_bytes"], args.request_file)
        response, exit_code = execute(request, schema, roles, consumer)
    except RoutingError as exc:
        response = exc.response()
        exit_code = exc.exit_code
    except BaseException:
        response = {
            "ok": False,
            "protocol": PROTOCOL,
            "error": {"code": "INTERNAL", "message": "unexpected routing resolver failure"},
        }
        exit_code = 70
    sys.stdout.write(canonical_json(response) + "\n")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
