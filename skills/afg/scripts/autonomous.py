#!/usr/bin/env python3
"""Policy, state and landing gate for afg.

This script is the only writer of autonomous-mode state and the only path through which
autonomous mode merges, pushes to the default branch, updates a PR branch, or closes
an item. It reads policy and GitHub facts itself; a caller supplies only what to
act on and receipts the script checks.

Every subcommand prints one JSON object. Exit statuses:
  0  done, or allowed
  1  denied (the object carries "reasons")
  2  command-line misuse
  3  the repository, GitHub, or the store could not be read or written
Anything unreadable denies. --dry-run evaluates and writes nothing.

Store: <main checkout>/.context/compound-engineering/afg/, shared by every
linked worktree; a bare repository uses <git common dir>/compound-engineering/afg/.
  state.json    the run lease
  ledger.jsonl  append-only events: run, job, job-end, worker, worker-end, adopt, receipt, rule,
                park, answer, retire, land-intent, land, rejected, close, update
  allowance.json  optional, written by whatever shares this machine's capacity
                across repositories: {"version": 1, "jobs": <at once>, "expires_at": <UTC>}.
                Present, it bounds every new job; this script only reads it.
"""
import argparse
import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import stat
import subprocess
import sys
import tempfile
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

try:
    import fcntl
except ImportError:
    fcntl = None

LEASE_TTL = timedelta(hours=3)
EARN_AFTER = 5
LEVELS = ["report", "pr", "babysit", "merge"]
PROFILES = ["cautious", "balanced", "hands-off"]
MOTIONS = ["main-red", "bugs", "security", "backlog", "stack", "climb", "create"]
DEFAULT_MOTIONS = ["main-red", "bugs", "backlog", "stack"]
# motion -> (start, ceiling) per profile
_REPAIR = [("pr", "pr"), ("babysit", "merge"), ("merge", "merge")]
TABLE = {
    "main-red": _REPAIR,
    "bugs": _REPAIR,
    "backlog": _REPAIR,
    "stack": _REPAIR,
    "security": [("pr", "pr"), ("pr", "pr"), ("pr", "merge")],
    "climb": [("report", "report"), ("pr", "merge"), ("merge", "merge")],
    "create": [("report", "report"), ("pr", "pr"), ("pr", "merge")],
}
# The skill a job's work must have gone through. lfg is how work gets done; a measured search is the exception.
CALLEES = {"climb": ["ce-optimize", "lfg"]}
# A job that answers someone's request records who asked.
ORIGIN_REQUIRED = {"bugs", "security", "backlog"}
DEFAULTS = {"autonomous_motions": DEFAULT_MOTIONS, "autonomous_jobs_per_hour": None, "autonomous_open_pr_cap": 5,
            "autonomous_overrides": [], "autonomous_trusted_authors": [], "autonomous_babysit_authors": [],
            "autonomous_rules": [], "autonomous_landing_steps": [], "autonomous_judges": [], "autonomous_checks": [],
            "autonomous_landing": "pull-request", "autonomous_ci": "required", "autonomous_merge_method": None}
CHOICES = {"autonomous_landing": ["pull-request", "direct"], "autonomous_ci": ["required", "ignored"],
           "autonomous_merge_method": ["squash", "rebase", "merge"]}
# How work lands is the repository's own rule; a local file may repeat it, never replace it.
FIXED = ["autonomous_landing", "autonomous_ci", "autonomous_merge_method", "autonomous_checks"]
PARK_DAYS = 7
JOBS_AT_ONCE = 2
BUSY_PER_CPU = 4
MACHINE_WAIT = 2 * 3600
KEYS = {
    "autonomous_profile": "str",
    "autonomous_motions": "list",
    "autonomous_overrides": "maps",
    "autonomous_trusted_authors": "list",
    "autonomous_babysit_authors": "list",
    "autonomous_rules": "list",
    "autonomous_jobs_per_hour": "int",
    "autonomous_open_pr_cap": "int",
    "autonomous_landing": "str",
    "autonomous_ci": "str",
    "autonomous_merge_method": "str",
    "autonomous_checks": "maps",
    "autonomous_landing_steps": "list",
    "autonomous_judges": "list",
}
OK_CONCLUSIONS = {"success", "neutral", "skipped"}
NOT_CI = {"issues", "issue_comment", "schedule", "workflow_dispatch", "discussion", "discussion_comment", "label",
          "milestone", "watch", "fork", "gollum", "public", "page_build", "pull_request_review_comment"}
SHA = re.compile(r"^[0-9a-f]{40}$")

# Changes a human always lands. Matched against old and new paths, lowercased.
HARD_PATHS = [
    ("judge", r"(^|/)\.(github|gitlab|circleci|buildkite|husky|compound-engineering|claude|codex|cursor|agents|vscode|devcontainer)/"),
    ("judge", r"(^|/)(\.gitlab-ci\.ya?ml|\.travis\.yml|azure-pipelines\.ya?ml|bitbucket-pipelines\.ya?ml|jenkinsfile|appveyor\.yml|\.drone\.yml)$|(^|/)\.githooks/"),
    ("judge", r"(^|/)(karma\.conf\.[^/]+|\.mocharc[^/]*|\.eslintrc[^/]*|phpunit\.xml[^/]*|[^/]*\.workspace\.[^/]+|jest\.setup\.[^/]+|tsconfig[^/]*\.json|turbo\.json|nx\.json|build\.gradle[^/]*|\.swcrc|biome\.jsonc?)$"),
    ("judge", r"(^|/)(\.pnpmfile\.c?js|pnpm-workspace\.yaml|build\.rs|gradlew[^/]*|pom\.xml|noxfile\.py|cmakelists\.txt|taskfile\.ya?ml|deno\.jsonc?|\.?mise\.toml|\.envrc|\.cursorrules|claude\.local\.md|action\.ya?ml|\.releaserc[^/]*)$|(^|/)(\.yarn|\.cargo|\.mvn)/"),
    # Installed packages are never source, and a tool's own settings decide what it reports.
    ("judge", r"(^|/)(node_modules|\.venv|venv|site-packages|vendor/bundle)/|\.env$"),
    ("judge", r"(^|/)\.[^/]+(rc|\.ya?ml|\.jsonc?|\.toml|\.c?js|\.ini|ignore)$|\.config\.[^/]+$"),
    ("judge", r"(^|/)(agents|claude|gemini|coding_standards|review)\.md$"),
    ("judge", r"(^|/)(\.mcp\.json|\.gitattributes|\.gitmodules|codeowners|makefile|rakefile|justfile|dockerfile[^/]*|docker-compose[^/]*|conftest\.py|pytest\.ini|tox\.ini|setup\.(py|cfg)|lefthook\.ya?ml|\.pre-commit-config\.ya?ml|\.npmrc|\.yarnrc[^/]*|bunfig\.toml|\.bundle/config|\.rspec)$"),
    ("judge", r"(^|/)(jest|vitest|vite|playwright|cypress|babel|webpack|rollup|eslint|karma|metro)[^/]*\.config\.[^/]+$"),
    ("judge", r"(^|/)(spec|test|tests)/(.*_helper\.rb|setup\.[^/]+|rails_helper\.rb)$"),
    ("judge", r"(^|/)(bin|script|scripts)/"),
    ("migration", r"(^|/)(migrations?|migrate)/|(^|/)(schema|structure)\.(rb|sql|prisma)$|\.sql$"),
    ("permissions", r"(^|[/_.-])(auth|oauth|sso|saml|authn|authz|authentication|authorization|permissions?|policies|policy|roles?|acl|rbac|sessions?|login|passwords?|iam)([/_.-]|$)"),
    ("billing", r"(^|[/_.-])(billing|payments?|stripe|subscriptions?|invoices?|checkout|pricing|charges?|refunds?)([/_.-]|$)"),
    ("secrets", r"(^|/)\.env([.]|$)|\.(pem|key|p12|pfx|keystore)$|(^|[/_.-])(secrets?|credentials?)([/_.-]|$)"),
    ("release", r"(^|/)(version|\.goreleaser[^/]*|release[^/]*|changelog\.md|.*\.gemspec|fastlane/.*)$|(^|/)(terraform|k8s|helm|deploy)/|\.tf$"),
]
HARD_LINES = [
    ("data-deletion", r"\b(drop\s+(table|column|database)|truncate\s+table|delete\s+from)\b|\b(delete_all|destroy_all|deleteMany|drop_table|remove_column)\b"),
    ("secrets", r"BEGIN [A-Z ]*PRIVATE KEY|(api[_-]?key|secret|password|access[_-]?token)['\"]?\s*[:=]\s*['\"][^'\"]{8,}"),
]
TEST_FILE = re.compile(r"(^|/)(tests?|specs?|__tests__|e2e|cypress)/|[._-](test|spec)\.[^/]+$|(^|/)test_[^/]+\.py$")
NOT_A_TEST = re.compile(r"^\s*($|//|#\s|import\s[^'\"]*\sfrom\s*['\"][^'\"]+['\"];?\s*$|from\s+\S+\s+import\s+[\w, ]+$)")
# What decides only what a check reports. Anything else that judges a change can also run, grant or publish.
GUARD = re.compile(
    r"(^|/)(\.rubocop[^/]*\.ya?ml|\.eslintrc(\.json|\.ya?ml)?|\.eslintignore|\.prettierrc(\.json|\.ya?ml)?|\.prettierignore|"
    r"\.stylelintrc(\.json|\.ya?ml)?|\.stylelintignore|\.oxlintrc\.json|biome\.jsonc?|\.markdownlint(\.json|\.ya?ml)?|\.golangci\.ya?ml|\.flake8|\.pylintrc|"
    r"\.?ruff\.toml|\.erb[-_]lint\.ya?ml|\.reek\.ya?ml|\.standard\.ya?ml|\.editorconfig|brakeman\.ignore)$")
# The project's own test folder, which nothing ships from.
OWN_TEST = re.compile(r"^((desktop|demo|frontend|sync|bridge|live|web)/)?(test|tests|spec)/")
# Dependency manifests pass only when nothing but version numbers changed.
MANIFEST = re.compile(r"(^|/)(package\.json|gemfile|cargo\.toml|pyproject\.toml|go\.mod|requirements[^/]*\.txt|composer\.json)$")
LOCKFILE = re.compile(r"(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|gemfile\.lock|cargo\.lock|poetry\.lock|uv\.lock|go\.sum|composer\.lock)$")
VERSION = re.compile(r"v?\d+(?:\.\d+)+(?:[-+.][0-9A-Za-z.-]+)?")


class Failure(Exception):
    pass


def emit(obj, code=0):
    sys.stdout.write(json.dumps(obj, indent=2, sort_keys=True) + "\n")
    return code


def deny(*reasons, **extra):
    return emit({"allowed": False, "reasons": list(dict.fromkeys(reasons)), **extra}, 1)


def now():
    return datetime.now(timezone.utc)


def iso(t):
    return t.isoformat(timespec="seconds").replace("+00:00", "Z")


def parse_iso(s):
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# --- processes ---------------------------------------------------------------

def _env():
    env = dict(os.environ)
    for k in ("GH_REPO", "GH_FORCE_TTY", "CLICOLOR_FORCE", "FORCE_COLOR"):
        env.pop(k, None)
    env.update(NO_COLOR="1", GIT_TERMINAL_PROMPT="0", GH_PROMPT_DISABLED="1")
    return env


def run(args, cwd=None, timeout=180):
    try:
        p = subprocess.run(args, cwd=cwd, env=_env(), capture_output=True, timeout=timeout)
        # Decoded here so a carriage return inside a line is kept, not turned into a line end.
        p.stdout, p.stderr = (x.decode("utf-8", "surrogateescape") for x in (p.stdout, p.stderr))
        return p
    except (OSError, subprocess.TimeoutExpired) as e:
        raise Failure(f"{args[0]} could not run: {e}")


def git(*args, cwd=None, check=True):
    r = run(["git", *args], cwd=cwd)
    if check and r.returncode != 0:
        raise Failure(f"git {' '.join(args[:3])}: {r.stderr.strip()}")
    return r


def gh(*args):
    r = run(["gh", *args])
    if r.returncode != 0:
        raise Failure(f"gh {' '.join(args[:4])}: {(r.stderr or r.stdout).strip()}")
    return r.stdout


def gh_json(*args):
    out = gh(*args)
    try:
        return json.loads(out)
    except ValueError as e:
        raise Failure(f"gh {' '.join(args[:3])} returned invalid JSON: {e}")


def gh_list(repo, kind, number, what):
    """A complete listing, or a Failure when it cannot be read completely."""
    out = []
    for page in range(1, 11):
        rows = gh_json("api", f"repos/{repo}/{kind}/{number}/{what}?per_page=100&page={page}")
        if not isinstance(rows, list):
            break
        out += rows
        if len(rows) < 100:
            return out
    raise Failure(f"too many {what} on {kind} {number} to read completely")


# --- repository --------------------------------------------------------------

class Repo:
    def __init__(self):
        common = git("rev-parse", "--path-format=absolute", "--git-common-dir").stdout.strip()
        self.common = os.path.realpath(common)
        first = git("worktree", "list", "--porcelain").stdout.strip().split("\n\n")[0].splitlines()
        self.main = None if "bare" in first else os.path.realpath(first[0][len("worktree "):])
        self._gh = self._tip = self._login = None

    @property
    def info(self):
        if self._gh is None:
            # Policy and code come from origin, so GitHub facts must be about origin too.
            url = git("config", "--get", "remote.origin.url", check=False).stdout.strip()
            m = re.search(r"^(?:[a-z+]+://)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/]([^/:]+/[^/]+?)(?:\.git)?/?$", url)
            if not m:
                raise Failure("origin is not a GitHub repository URL")
            d = gh_json("repo", "view", f"{m[1]}/{m[2]}", "--json", "nameWithOwner,defaultBranchRef")
            if d["nameWithOwner"].lower() != m[2].lower():
                raise Failure(f"origin is {m[2]} but GitHub answered for {d['nameWithOwner']}")
            self._gh = (d["nameWithOwner"], d["defaultBranchRef"]["name"])
        return self._gh

    @property
    def name(self):
        return self.info[0]

    @property
    def default(self):
        return self.info[1]

    @property
    def login(self):
        if self._login is None:
            self._login = gh_json("api", "user")["login"].lower()
        return self._login

    def tip(self, fresh=False):
        if fresh or self._tip is None:
            git("fetch", "--quiet", "--no-tags", "origin",
                f"+refs/heads/{self.default}:refs/remotes/origin/{self.default}")
            self._tip = git("rev-parse", f"refs/remotes/origin/{self.default}").stdout.strip()
        return self._tip

    def fetch_pr(self, number, expected):
        ref = f"refs/afg/pr-{number}"
        git("fetch", "--quiet", "--no-tags", "origin", f"+refs/pull/{number}/head:{ref}")
        got = git("rev-parse", ref).stdout.strip()
        if got != expected:
            raise Failure(f"fetched head {got[:12]} is not {expected[:12]}")


# --- policy ------------------------------------------------------------------

def strip_comment(line):
    out, quote = [], ""
    for i, ch in enumerate(line):
        prev = line[i - 1] if i else " "
        if quote:
            quote = "" if ch == quote else quote
        elif ch in "'\"" and prev in " \t[{,:":
            quote = ch
        elif ch == "#" and prev in " \t":
            break
        out.append(ch)
    return "".join(out).rstrip()


def split_flow(text):
    parts, buf, quote = [], "", ""
    for i, ch in enumerate(text):
        if quote:
            quote = "" if ch == quote else quote
        elif ch in "'\"" and (not buf.strip() or buf.rstrip().endswith(":")):
            quote = ch
        elif ch == ",":
            parts.append(buf)
            buf = ""
            continue
        buf += ch
    if buf.strip():
        parts.append(buf)
    return [p.strip() for p in parts]


def scalar(raw):
    raw = raw.strip()
    if len(raw) >= 2 and raw[0] == raw[-1] and raw[0] in "'\"":
        return raw[1:-1]
    return raw


def flow_map(text, where):
    if not (text.startswith("{") and text.endswith("}")):
        raise ValueError(f"{where}: expected {{ key: value, ... }}")
    out = {}
    for part in split_flow(text[1:-1]):
        key, sep, val = part.partition(":")
        if not sep:
            raise ValueError(f"{where}: expected key: value in {part!r}")
        out[key.strip()] = scalar(val)
    return out


def parse_policy(text, label):
    """The autonomous_* keys of one config file. Raises ValueError on anything malformed."""
    values, key = {}, None
    for n, raw in enumerate(text.lstrip("﻿").splitlines(), 1):
        line, where = strip_comment(raw), f"{label}:{n}"
        if not line.strip():
            continue
        body = line.strip()
        if body[0] == "-" and key is not None:
            item = body[1:].strip()
            if KEYS[key] == "maps":
                values[key].append(flow_map(item, where) if item.startswith("{") else dict([pair(item, where)]))
            elif KEYS[key] == "list" and item:
                values[key].append(scalar(item))
            else:
                raise ValueError(f"{where}: {key} does not take a list item here")
            continue
        if line[0] in " \t":
            if key is None:
                continue
            if KEYS[key] == "maps" and values[key]:
                k, v = pair(body, where)
                values[key][-1][k] = v
                continue
            raise ValueError(f"{where}: unexpected line under {key}")
        name, sep, rest = line.partition(":")
        name, rest, key = name.strip(), rest.strip(), None
        if not name.startswith("autonomous_"):
            continue
        if not sep or name not in KEYS:
            raise ValueError(f"{where}: unknown key {name}")
        if name in values:
            raise ValueError(f"{where}: {name} is set twice")
        kind = KEYS[name]
        if kind in ("list", "maps"):
            if rest == "":
                values[name], key = [], name
            elif rest.startswith("[") and rest.endswith("]") and (kind == "list" or rest == "[]"):
                values[name] = [scalar(p) for p in split_flow(rest[1:-1])]
            else:
                raise ValueError(f"{where}: {name} must be a list")
        elif rest == "":
            continue
        elif kind == "int":
            if not re.fullmatch(r"\d{1,3}", rest):
                raise ValueError(f"{where}: {name} must be a whole number")
            values[name] = int(rest)
        elif kind == "bool":
            if rest not in ("true", "false"):
                raise ValueError(f"{where}: {name} must be true or false")
            values[name] = rest == "true"
        else:
            values[name] = scalar(rest)
    if values.get("autonomous_profile", PROFILES[0]) not in PROFILES:
        raise ValueError(f"{label}: autonomous_profile must be one of {', '.join(PROFILES)}")
    for k, allowed in CHOICES.items():
        if values.get(k, allowed[0]) not in allowed:
            raise ValueError(f"{label}: {k} must be one of {', '.join(allowed)}")
    if values.get("autonomous_ci") == "ignored" and values.get("autonomous_landing") != "direct":
        raise ValueError(f"{label}: autonomous_ci: ignored needs autonomous_landing: direct")
    if values.get("autonomous_landing") == "direct" and values.get("autonomous_merge_method") == "rebase":
        raise ValueError(f"{label}: direct landing is one commit (squash), or the merge of one (merge)")
    for c in values.get("autonomous_checks", []):
        if set(c) - {"run", "paths"} or not c.get("run"):
            raise ValueError(f"{label}: a check needs run, and may have paths")
        globs(c.get("paths", ""), label)
    for g in values.get("autonomous_judges", []):
        globs(g, label)
    for m in values.get("autonomous_motions", []):
        if m not in MOTIONS:
            raise ValueError(f"{label}: unknown motion {m}")
    for k in ("autonomous_trusted_authors", "autonomous_babysit_authors"):
        if k in values:
            values[k] = [spell(v) for v in values[k]]
    for o in values.get("autonomous_overrides", []):
        if "author" in o:
            o["author"] = spell(o["author"])
        if set(o) - {"motion", "author", "max"} or o.get("max") not in LEVELS or len(o) < 2:
            raise ValueError(f"{label}: an override needs max (one of {', '.join(LEVELS)}) and motion or author")
        if "motion" in o and o["motion"] not in MOTIONS:
            raise ValueError(f"{label}: unknown motion {o['motion']}")
    return values


def globs(text, label):
    if re.search(r"[\[\]{},!\\]", text):
        raise ValueError(f"{label}: paths take * ** and ? only, separated by spaces: {text!r}")


def spell(login):
    """The one spelling every author comparison uses."""
    return re.sub(r"^app/(.*)$", r"\1[bot]", login.strip().lstrip("@").lower())


def pair(text, where):
    k, sep, v = text.partition(":")
    if not sep:
        raise ValueError(f"{where}: expected key: value")
    return k.strip(), scalar(v)


def load_policy(repo):
    tip = repo.tip()
    path = ".compound-engineering/config.yaml"
    listed = git("ls-tree", "--full-tree", "--name-only", tip, "--", path).stdout.strip()
    team_text = git("show", f"{tip}:{path}").stdout if listed else ""
    local_text = ""
    if repo.main:
        local = os.path.join(repo.main, ".compound-engineering", "config.local.yaml")
        if os.path.isfile(local):
            with open(local, encoding="utf-8") as f:
                local_text = f.read()
    try:
        team = parse_policy(team_text, "config.yaml")
        mine = parse_policy(local_text, "config.local.yaml")
    except ValueError as e:
        return {"active": False, "reason": "policy-malformed", "detail": str(e)}
    if "autonomous_profile" in team:
        p = {**DEFAULTS, **team}
        source = "default branch, tightened by config.local.yaml" if mine else "default branch"
        if "autonomous_profile" in mine:
            p["autonomous_profile"] = min(p["autonomous_profile"], mine["autonomous_profile"], key=PROFILES.index)
        for k in ("autonomous_motions", "autonomous_trusted_authors", "autonomous_babysit_authors"):
            if k in mine:
                p[k] = [v for v in p[k] if v in mine[k]]
        for k in ("autonomous_jobs_per_hour", "autonomous_open_pr_cap"):
            if k in mine:
                p[k] = mine[k] if p[k] is None else min(p[k], mine[k])
        for k in FIXED:
            if k in mine and mine[k] != p[k]:
                return {"active": False, "reason": "policy-malformed",
                        "detail": f"config.local.yaml cannot replace the repository's {k}"}
        for k in ("autonomous_overrides", "autonomous_rules", "autonomous_landing_steps", "autonomous_judges"):
            p[k] = p[k] + mine.get(k, [])
    elif team:
        return {"active": False, "reason": "policy-malformed",
                "detail": "config.yaml sets autonomous_* keys without autonomous_profile"}
    elif "autonomous_profile" in mine:
        p, source = {**DEFAULTS, **mine}, "config.local.yaml"
    else:
        return {"active": False, "reason": "no-profile"}
    return {"active": True, "source": source, **p}


def rule_id(rule):
    return hashlib.sha256(rule.encode("utf-8")).hexdigest()[:12]


def judged(policy):
    """Everything in the owner's words that must be confirmed at the exact head before it lands."""
    return policy["autonomous_rules"] + policy["autonomous_landing_steps"]


def checks_id(policy):
    return hashlib.sha256(json.dumps(policy["autonomous_checks"], sort_keys=True).encode()).hexdigest()[:12]


def applying_checks(policy, names):
    out = []
    for c in policy["autonomous_checks"]:
        wanted = c.get("paths", "").split()
        if not wanted or any(glob_match(n, g) for n in names for g in wanted):
            out.append(c["run"])
    return out


def level_for(policy, motion, author, landed):
    if not policy["active"] or motion not in policy["autonomous_motions"]:
        return "report"
    start, ceiling = TABLE[motion][PROFILES.index(policy["autonomous_profile"])]
    level = ceiling if landed >= EARN_AFTER else start
    for o in policy["autonomous_overrides"]:
        if o.get("motion", motion) == motion and o.get("author", author) == author:
            level = min(level, o["max"], key=LEVELS.index)
    return level


# --- store -------------------------------------------------------------------

def store_dir(repo, create=True):
    base = repo.main or repo.common
    parts = ([".context"] if repo.main else []) + ["compound-engineering", "afg"]
    path = base
    for part in parts:
        path = os.path.join(path, part)
        if os.path.islink(path):
            raise Failure(f"store path is a symlink: {path}")
        if not os.path.isdir(path):
            if not create:
                return os.path.join(base, *parts)
            os.makedirs(path, mode=0o700, exist_ok=True)
    st = os.lstat(path)
    if hasattr(os, "getuid") and st.st_uid != os.getuid():
        raise Failure(f"store is not owned by the current user: {path}")
    if st.st_mode & 0o077:
        os.chmod(path, 0o700)
    return path


@contextmanager
def locked(repo):
    if fcntl is None:
        raise Failure("no file locking on this platform; autonomous mode cannot write state safely")
    fd = os.open(os.path.join(store_dir(repo), "lock"),
                 os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX)
        yield
    finally:
        os.close(fd)


def read_state(repo):
    path = os.path.join(store_dir(repo, create=False), "state.json")
    try:
        with open(path, encoding="utf-8") as f:
            data = json.load(f)
        return data if isinstance(data, dict) else {"corrupt": True}
    except FileNotFoundError:
        return {}
    except ValueError:
        return {"corrupt": True}


def write_state(repo, state):
    d = store_dir(repo)
    fd, tmp = tempfile.mkstemp(dir=d)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        json.dump(state, f)
        f.flush()
        os.fsync(f.fileno())
    os.replace(tmp, os.path.join(d, "state.json"))


def append(repo, event, **fields):
    path = os.path.join(store_dir(repo), "ledger.jsonl")
    line = (json.dumps({"event": event, "at": iso(now()), **fields}, sort_keys=True) + "\n").encode()
    fd = os.open(path, os.O_RDWR | os.O_APPEND | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0), 0o600)
    try:
        if not stat.S_ISREG(os.fstat(fd).st_mode):
            raise Failure("ledger is not a regular file")
        size = os.fstat(fd).st_size
        if size:
            os.lseek(fd, size - 1, os.SEEK_SET)
            if os.read(fd, 1) != b"\n":
                line = b"\n" + line
        while line:
            line = line[os.write(fd, line):]
    finally:
        os.close(fd)


def ledger(repo):
    path = os.path.join(store_dir(repo, create=False), "ledger.jsonl")
    rows = []
    try:
        with open(path, encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    parse_iso(row["at"])
                    row["event"]
                except (ValueError, KeyError, TypeError) as e:
                    raise Failure(f"ledger.jsonl has an unreadable row; a person must repair it: {e}")
                rows.append(row)
    except FileNotFoundError:
        pass
    return rows


@contextmanager
def machine_turn(repo, token, seconds):
    """One check at a time on this machine, and a second while it has processors to spare. Waiting is not failing."""
    if fcntl is None or not hasattr(os, "getuid"):
        raise Failure("file locking is unavailable")
    path = os.path.join(os.environ.get("AFG_TURN_DIR") or "/tmp", f"afg-line-{os.getuid()}.lock")
    second, fd, ticket = None, os.open(path, os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0), 0o600), None
    try:
        if os.fstat(fd).st_uid != os.getuid():
            raise Failure("the machine lock belongs to someone else")
        end, beat = now() + timedelta(seconds=seconds), now()
        second = os.open(path + ".2", os.O_RDWR | os.O_CREAT | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_CLOEXEC", 0), 0o600)
        ticket = take_ticket(path + ".d")
        while True:
            try:
                if not first_in_line(ticket):
                    raise OSError("not yet")
                try:
                    fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
                except OSError:
                    if not machine_spare():
                        raise
                    fcntl.flock(second, fcntl.LOCK_EX | fcntl.LOCK_NB)
                break
            except OSError:
                if now() > end:
                    raise Failure("other checks held this machine too long; try again later")
                time.sleep(2)
                if token and (now() - beat).total_seconds() > 300:
                    with locked(repo):
                        require_lease(repo, token)
                    beat = now()
        # The place in line is for waiting. The next one waits while this runs.
        os.unlink(ticket)
        ticket = None
        yield
    finally:
        os.close(fd)
        if second is not None:
            os.close(second)
        if ticket:
            try:
                os.unlink(ticket)
            except OSError:
                pass


def take_ticket(line):
    """First come, first served. A lock alone goes to whoever asks at the right moment."""
    os.makedirs(line, mode=0o700, exist_ok=True)
    st = os.lstat(line)
    if not stat.S_ISDIR(st.st_mode) or st.st_uid != os.getuid():
        raise Failure("the machine queue belongs to someone else")
    ticket = os.path.join(line, f"{time.time_ns():020d}-{os.getpid()}")
    os.close(os.open(ticket, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))
    return ticket


def first_in_line(ticket):
    for name in sorted(os.listdir(os.path.dirname(ticket))):
        m = re.fullmatch(r"\d{20}-(\d+)", name)
        if not m:
            continue
        if name == os.path.basename(ticket):
            return True
        try:
            os.kill(int(m.group(1)), 0)
            return False
        except ProcessLookupError:
            # Whoever held this one is gone.
            try:
                os.unlink(os.path.join(os.path.dirname(ticket), name))
            except OSError:
                pass
    return True


def load_now():
    try:
        return round(os.getloadavg()[0], 1)
    except (OSError, AttributeError):
        return None


def machine_spare():
    """Processors are still free, so another check would not slow the one running."""
    limit = os.environ.get("AFG_SPARE_LIMIT")
    try:
        return os.getloadavg()[0] < (float(limit) if limit else 0.8 * (os.cpu_count() or 1)) and not machine_busy()
    except (OSError, AttributeError, ValueError):
        return False


def machine_busy():
    """Far more is waiting for a processor than this machine can run, or the system says memory is critical."""
    limit = os.environ.get("AFG_LOAD_LIMIT")
    if sys.platform == "darwin" and not limit:
        try:
            p = subprocess.run(["/usr/sbin/sysctl", "-n", "kern.memorystatus_vm_pressure_level"], capture_output=True, text=True, timeout=5)
            if p.stdout.strip() == "4":
                return True
        except (OSError, subprocess.SubprocessError):
            pass
    try:
        return os.getloadavg()[0] > (float(limit) if limit else BUSY_PER_CPU * (os.cpu_count() or 1))
    except (OSError, AttributeError, ValueError):
        return False


def require_lease(repo, token):
    """Inside locked(): the caller still holds the run, and its lease is renewed."""
    state = read_state(repo)
    if not token or state.get("token") != token:
        raise Failure("lease-lost: another run holds or took over the lease")
    if parse_iso(state["at"]) + LEASE_TTL < now():
        raise Failure("lease-lost: the lease expired")
    state["at"] = iso(now())
    write_state(repo, state)


def allowance_path(repo):
    return os.path.join(store_dir(repo, create=False), "allowance.json")


def allowance(repo):
    """What an outside allocator permits here, or None when nothing allocates.

    A present file that cannot be trusted permits nothing: it says that something
    allocates, and not what.
    """
    nothing = {"jobs": 0, "state": "unreadable"}
    try:
        # Never waits on a pipe: the caller may hold the store lock.
        fd = os.open(allowance_path(repo), os.O_RDONLY | getattr(os, "O_NOFOLLOW", 0) | getattr(os, "O_NONBLOCK", 0))
    except FileNotFoundError:
        return None
    except OSError:
        return nothing
    try:
        regular = stat.S_ISREG(os.fstat(fd).st_mode)
        text = os.read(fd, 4096) if regular else b""
    except OSError:
        return nothing
    finally:
        os.close(fd)
    try:
        data = json.loads(text)
        jobs, expires = data["jobs"], parse_iso(data["expires_at"])
        sound = type(data["version"]) is int and data["version"] == 1 and type(jobs) is int and jobs >= 0 and expires.tzinfo is not None
        spent = sound and expires <= now()
    except (ValueError, KeyError, TypeError, AttributeError, RecursionError, OverflowError):
        return nothing
    if not sound:
        return nothing
    return {"jobs": 0 if spent else jobs, "state": "expired" if spent else "current", "expires_at": iso(expires)}


def active_work(rows):
    """Jobs not adopted or ended, and workers not ended. A worker can outlive the run that
    started it, so earlier runs' count too, until they are too old to still be going."""
    done = {r["job"] for r in rows if r["event"] in ("adopt", "job-end")} | {r["worker"] for r in rows if r["event"] == "worker-end"}
    recent = now() - 2 * LEASE_TTL
    return [r for r in rows if (r["event"] == "job" and r["job"] not in done or r["event"] == "worker" and r["worker"] not in done)
            and parse_iso(r["at"]) > recent]


def allowance_reasons(repo, rows):
    given = allowance(repo)
    if given is None:
        begun = next((r for r in reversed(rows) if r["event"] == "run"), {})
        return ["allowance-missing"] if begun.get("under_allowance", begun.get("allowed")) else []
    if given["state"] != "current":
        return [f"allowance-{given['state']}"]
    return ["allowance-spent"] if len(active_work(rows)) >= given["jobs"] else []


def deny_allowance(repo, rows, reasons):
    going = [{k: r[k] for k in ("job", "worker", "what", "at") if k in r} for r in active_work(rows)]
    return deny(*reasons, allowance={**(allowance(repo) or {}), "file": allowance_path(repo)}, going=going)


def jobs_left(policy, rows):
    """None when the owner set no hourly limit."""
    if policy["autonomous_jobs_per_hour"] is None:
        return None
    cutoff = now() - timedelta(hours=1)
    used = sum(1 for r in rows if r["event"] == "job" and parse_iso(r["at"]) > cutoff)
    return max(0, policy["autonomous_jobs_per_hour"] - used)


def landed_count(repo, rows, motion):
    """Clean landings in this motion since its last revert or rejected PR."""
    lands = [r for r in rows if r["event"] == "land" and r.get("motion") == motion]
    resets = [parse_iso(r["at"]) for r in rows if r["event"] == "rejected" and r.get("motion") == motion]
    ours = {r.get("merge_sha") for r in lands}
    numbers = {r["pr"] for r in lands if r.get("pr")}
    log = git("log", "-i", "--extended-regexp", "--grep=reverts? (commit |[A-Za-z0-9_./-]*#)", "--format=%cI%x00%B%x01", repo.tip()).stdout
    for entry in filter(None, (e.strip("\n") for e in log.split("\x01"))):
        when, _, body = entry.partition("\x00")
        if ours & set(re.findall(r"This reverts commit ([0-9a-f]{40})", body)) \
                or numbers & {int(n) for n in re.findall(r"[Rr]everts? (?:[\w.-]+/[\w.-]+)?#(\d+)", body)}:
            resets.append(parse_iso(when))
    last = max(resets, default=None)
    return sum(1 for r in lands if last is None or parse_iso(r["at"]) > last)


# --- GitHub facts ------------------------------------------------------------

def checks_at(repo, sha):
    """(state, failing names, names that succeeded). state is green, red or unknown."""
    runs = gh_json("api", f"repos/{repo.name}/commits/{sha}/check-runs?per_page=100")
    stats = gh_json("api", f"repos/{repo.name}/commits/{sha}/status?per_page=100")
    flows = gh_json("api", f"repos/{repo.name}/actions/runs?head_sha={sha}&per_page=100")
    rows, contexts, flow_rows = runs["check_runs"], stats["statuses"], flows["workflow_runs"]
    if runs["total_count"] > len(rows) or len(contexts) >= 100 or flows["total_count"] > len(flow_rows):
        return "unknown", [], []
    # Comments, schedules and manual runs attach to the same commit without testing it.
    ci = [f for f in flow_rows if f.get("event") not in NOT_CI]
    other = {f.get("check_suite_id") for f in flow_rows if f.get("event") in NOT_CI}
    rows = [c for c in rows if (c.get("check_suite") or {}).get("id") not in other - {None}]
    # A workflow between jobs shows only finished checks, so the run itself must be finished.
    pending = any(f.get("status") != "completed" for f in ci)
    failed = set()
    passed = {f["name"] for f in ci if f.get("name") and f.get("conclusion") == "success"}
    for c in rows:
        if c.get("status") != "completed":
            pending = True
        elif c.get("conclusion") not in OK_CONCLUSIONS:
            failed.add(c["name"])
        elif c["conclusion"] == "success":
            passed.add(c["name"])
    for c in contexts:
        if c.get("state") == "success":
            passed.add(c["context"])
        elif c.get("state") == "pending":
            pending = True
        else:
            failed.add(c["context"])
    passed -= failed
    failed |= {f.get("name") or "workflow run" for f in ci
               if f.get("status") == "completed" and f.get("conclusion") not in OK_CONCLUSIONS}
    if failed:
        return "red", sorted(failed), sorted(passed)
    if pending or not passed:
        return "unknown", [], sorted(passed)
    return "green", [], sorted(passed)


def rules_on_default(repo):
    """Active rule types on the default branch, or None when they cannot be read."""
    r = run(["gh", "api", f"repos/{repo.name}/rules/branches/{repo.default}?per_page=100"])
    if r.returncode != 0:
        text = r.stdout + r.stderr
        # GitHub answers this for a plan where no rules can exist.
        return [] if "403" in text and "Upgrade to GitHub" in text else None
    try:
        types = [x.get("type") for x in json.loads(r.stdout)]
        return types if len(types) < 100 else None
    except (ValueError, AttributeError):
        return None


def has_merge_queue(repo):
    """Classic branch protection can hold a queue that the rules listing never shows."""
    owner, name = repo.name.split("/")
    query = "query($o:String!,$n:String!,$b:String!){repository(owner:$o,name:$n){mergeQueue(branch:$b){id}}}"
    d = gh_json("api", "graphql", "-f", f"query={query}", "-f", f"o={owner}", "-f", f"n={name}", "-f", f"b={repo.default}")
    return d["data"]["repository"]["mergeQueue"] is not None


def canonical(author):
    """One spelling per account, so a user named like a bot never matches the bot."""
    login = author.get("login") or ""
    bot = author.get("is_bot") or author.get("type") == "Bot" or login.startswith("app/") or login.endswith("[bot]")
    login = login.lower()
    return re.sub(r"^app/|\[bot\]$", "", login) + "[bot]" if bot else login


PR_FIELDS = ("number,state,isDraft,author,headRefOid,headRefName,isCrossRepository,"
             "headRepositoryOwner,maintainerCanModify,baseRefName,mergeable,mergeStateStatus,reviewDecision,title,url,updatedAt")


def pr_view(repo, number):
    return gh_json("pr", "view", str(number), "-R", repo.name, "--json", PR_FIELDS)


def glob_match(name, glob):
    """`*` crosses directories; `**/` may match none."""
    pat = re.escape(glob).replace(r"\*\*/", "(?:.*/)?").replace(r"\*\*", ".*").replace(r"\*", ".*").replace(r"\?", ".")
    return re.fullmatch(pat, name) is not None


def judge_hits(policy, names):
    """Files the owner or a check command names as deciding whether a change passes."""
    said = {t.strip("'\"();") for c in policy.get("autonomous_checks", []) for t in c["run"].split()}
    owner = [n for n in names if any(glob_match(n, g) for g in policy.get("autonomous_judges", []))]
    run = [n for n in names if n in said or f"./{n}" in said]
    return [f"judge:{n}" for n in owner] + [f"{'guard' if is_guard(n) else 'judge'}:{n}" for n in run]


def is_guard(p):
    low = p.lower()
    named = re.search(r"(^|[_.-])(guard|lint|gate)([_.-]|$)", low.rsplit("/", 1)[-1])
    return bool(GUARD.search(low) or (named and TEST_FILE.search(low) and not low.endswith(".sh")))


def stops(policy, facts, own):
    """Hard limits that still need a person. Hands-off settles a guard in its own work by a verdict and a probe."""
    settles = own and policy["autonomous_profile"] == "hands-off"
    return [h for h in facts["hard"] if not (settles and h.startswith("guard:"))]


def guards_of(facts):
    return sorted(h.partition(":")[2] for h in facts["hard"] if h.startswith("guard:"))


def diff_facts(repo, base, head, policy=None):
    """Files changed from the merge base, and every hard limit the change matches."""
    mb = git("merge-base", base, head).stdout.strip()
    hits, files, touched, manifests = [], set(), set(), []
    raw = git("diff", "--raw", "--no-abbrev", "-M", "-z", mb, head).stdout.split("\0")
    i = 0
    while i < len(raw) and raw[i]:
        old_mode, new_mode, _, _, status = raw[i].lstrip(":").split(" ")
        paths = raw[i + 1:i + (3 if status[0] in "RC" else 2)]
        i += 1 + len(paths)
        files.add(paths[-1])
        touched |= set(paths)
        for mode in (old_mode, new_mode):
            if mode in ("120000", "160000"):
                hits.append(f"unclassified:{paths[-1]}")
        if old_mode != new_mode and "000000" not in (old_mode, new_mode):
            hits.append(f"unclassified:{paths[-1]}")
        for p in paths:
            low = p.lower()
            if MANIFEST.search(low):
                manifests.append(p)
            elif not LOCKFILE.search(low):
                # userAuth and UserAuth read as user_auth.
                spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])|(?<=[A-Z])(?=[A-Z][a-z])", "_", p).lower()
                mine = [name for name, pat in HARD_PATHS if re.search(pat, low) or re.search(pat, spaced)]
                # A changelog line releases nothing.
                if low.rsplit("/", 1)[-1] == "changelog.md" and only_grows(mb, head, p):
                    mine = [n for n in mine if n != "release"]
                if is_guard(p):
                    mine.append("guard")
                if GUARD.search(low):
                    # Its own name is what a judge pattern sees; a protected folder or subject around it still counts.
                    around = low.rsplit("/", 1)[0] + "/" if "/" in low else ""
                    mine = [n for n in mine if n != "judge"] + \
                        [n for n, pat in HARD_PATHS if n == "judge" and around and re.search(pat, around)]
                hits += [f"{name}:{p}" for name in mine]
    for row in git("diff", "--numstat", "--no-renames", "-z", mb, head).stdout.split("\0"):
        added, _, rest = row.partition("\t")
        removed, _, name = rest.partition("\t")
        if added == "-":
            hits.append("unclassified:binary change")
        elif name and TEST_FILE.search(name.lower()) and int(removed) > int(added):
            # Tests judge the change; a person decides to have fewer of them. Imports, comments and blank lines are not tests.
            counted = [s for s, t in changed_lines(mb, head, name) if not NOT_A_TEST.search(t)]
            if counted.count("-") > counted.count("+"):
                hits.append(f"fewer-tests:{name}")
    major = False
    for p in sorted(set(manifests)):
        verdict = manifest_change(changed_lines(mb, head, p))
        if verdict == "other":
            hits.append(f"judge:{p}")
        major = major or verdict == "major"
    for p in files:
        if LOCKFILE.search(p.lower()):
            lines = changed_lines(mb, head, p)
            if p.lower().endswith("gemfile.lock"):
                major = major or gem_major(git("show", f"{mb}:{p}", check=False).stdout, git("show", f"{head}:{p}", check=False).stdout)
            elif p.lower().endswith("package-lock.json"):
                was, will = (git("show", f"{x}:{p}", check=False).stdout for x in (mb, head))
                verdict = npm_change(was, will)
                major = major or verdict == "major"
                if verdict == "source":
                    hits.append(f"unclassified:{p}")
                continue
            else:
                major = major or lock_major(lines)
            if lock_source_changed(lines):
                hits.append(f"unclassified:{p}")
    for _, text in changed_lines(mb, head):
        if "\r" in text.rstrip("\r"):
            hits.append("unclassified:carriage return")
        hits += [f"{name}:changed line" for name, pat in HARD_LINES if name != "data-deletion" and re.search(pat, text, re.I)]
    for p in touched:
        # A test cleans up its own database. What ships does not.
        if not OWN_TEST.search(p.lower()):
            hits += [f"data-deletion:changed line in {p}" for _, text in changed_lines(mb, head, p)
                     if any(n == "data-deletion" and re.search(pat, text, re.I) for n, pat in HARD_LINES)]
    hits += judge_hits(policy or {}, touched)
    if re.search(r"\[(skip ci|ci skip|no ci|skip actions|actions skip)\]|^(skip-checks|release-as):",
                 git("log", "--format=%B", f"{mb}..{head}").stdout, re.I | re.M):
        hits.append("release:commit message")
    dependencies = bool(files) and all(MANIFEST.search(f.lower()) or LOCKFILE.search(f.lower()) for f in files)
    return {"merge_base": mb, "files": len(files), "hard": sorted(set(hits)), "major": major,
            "only_dependencies": dependencies, "names": sorted(touched)}


def only_grows(base, head, path):
    return not any(s == "-" for s, _ in changed_lines(base, head, path))


def changed_lines(base, head, path=None):
    """[(sign, text)] for every changed line. File headers end at the first hunk."""
    args = ["diff", "-U0", "--no-color", "--no-ext-diff", "--no-textconv", "--no-renames", base, head]
    if path is not None:
        args += ["--", f":(top,literal){path}"]
    out, in_hunk = [], False
    for line in git(*args).stdout.split("\n"):
        if line.startswith("diff --git "):
            in_hunk = False
        elif line.startswith("@@"):
            in_hunk = True
        elif in_hunk and line[:1] in ("+", "-"):
            out.append((line[0], line[1:]))
    return out


def major_pair(x, y):
    xs, ys = [v.lstrip("v").split(".") for v in (x, y)]
    return xs[0] != ys[0] or (xs[0] == "0" and xs[1] != ys[1])


def lock_source_changed(lines):
    """Where a dependency comes from changed, or its contents did without its version."""
    def hosts(sign):
        return {h for s, t in lines if s == sign for h in re.findall(r"[a-z+]+://([^/\s\"']+)", t)}

    def versions(sign):
        return sorted(v for s, t in lines if s == sign for v in VERSION.findall(re.sub(r"\S+://\S+", "", t)))
    git_source = any(s == "+" and re.search(r"git\+|git@|github:|\.git\b|file:|link:", t) for s, t in lines)
    return bool(hosts("+") - hosts("-")) or git_source or versions("+") == versions("-")


def lock_major(lines):
    old = [v for sign, t in lines if sign == "-" for v in VERSION.findall(t)]
    new = [v for sign, t in lines if sign == "+" for v in VERSION.findall(t)]
    return not old or len(old) != len(new) or any(major_pair(x, y) for x, y in zip(old, new))


def npm_change(old, new):
    """By package name: a direct dependency that is new, or any that changed majorly, is major. Where it comes from may not change."""
    try:
        docs = [json.loads(x) for x in (old, new)]
        a, b = (d["packages"] for d in docs)
    except (ValueError, KeyError, TypeError, RecursionError):
        return "source"
    # An older format lists every package twice, and only one copy is read here.
    if any(d.get("lockfileVersion") != 3 or "dependencies" in d for d in docs) \
            or any(not isinstance(p, dict) or not all(isinstance(v, dict) for v in p.values()) for p in (a, b)):
        return "source"
    host = "https://registry.npmjs.org/"

    def own(p):
        return {k for f in ("dependencies", "devDependencies", "optionalDependencies") for k in (p.get("", {}).get(f) or {})}
    if own(b) - own(a):
        return "major"
    verdict = "same"
    for k, v in b.items():
        if not k:
            continue
        o = a.get(k)
        name = k.split("node_modules/")[-1]
        # The package at this path, from the public registry, under its own name.
        here = "name" not in v and str(v.get("resolved", "")).startswith(f"{host}{name}/-/")
        if v.get("inBundle") and "resolved" not in v and not v.get("link"):
            # Shipped inside the package above it, whose own entry is checked.
            up = k
            while up in b and b[up].get("inBundle"):
                up = up.rsplit("/node_modules/", 1)[0] if "/node_modules/" in up else ""
            holder = b.get(up) or {}
            own_name = up.split("node_modules/")[-1]
            held = up and str(holder.get("resolved", "")).startswith(f"{host}{own_name}/-/") and holder.get("integrity")
            if o == v or held and holder != a.get(up) and (o is None or o.get("inBundle")):
                continue
            return "source"
        if o is not None and here and not str(o.get("resolved", "")).startswith(f"{host}{name}/-/"):
            return "source"
        if v.get("link") or not here or not v.get("integrity"):
            if o != v:
                return "source"
            continue
        if o is None:
            if v.get("hasInstallScript"):
                return "source"
            continue
        if o.get("version") == v.get("version"):
            if o.get("integrity") != v.get("integrity") or o.get("resolved") != v.get("resolved"):
                return "source"
        elif v.get("hasInstallScript") and not o.get("hasInstallScript"):
            return "source"
        else:
            x, y = (str(e.get("version", "0.0")) + ".0" for e in (o, v))
            # Below 1.0 a minor may break whoever asked for it directly; a transitive one is its parent's business.
            direct = k == f"node_modules/{name}" and name in own(b)
            if major_pair(x, y) and (direct or x.split(".")[0] != y.split(".")[0]):
                verdict = "major"
    return verdict


def gem_major(old, new):
    """A gem that is new, or whose own version changed majorly. What one gem asks of another is not an install."""
    def gems(text):
        out = {}
        for name, v in re.findall(r"^ {4}(\S+) \(([^)]+)\)\r?$", text, re.M):
            out.setdefault(name, set()).add(v.split("-")[0])
        return out
    was, now_ = gems(old), gems(new)
    rest = [re.search(r"^(?:RUBY VERSION|BUNDLED WITH)\r?\n\s+(.+)$", t, re.M | re.S) for t in (old, new)]
    tools = [VERSION.findall(r.group(1)) if r else [] for r in rest]
    return not was or not set(now_) <= set(was) or len(tools[0]) != len(tools[1]) \
        or any(major_pair(x, y) for x, y in zip(*tools)) \
        or any(major_pair(x, y) for n in now_ for x in was[n] for y in now_[n])


def manifest_change(lines):
    minus = [t for sign, t in lines if sign == "-"]
    plus = [t for sign, t in lines if sign == "+"]
    if not minus or len(minus) != len(plus):
        return "other"
    kind = "versions"
    for a, b in zip(minus, plus):
        own = re.match(r"""\s*["']?version["']?\s*[:=]""", b)
        if own or VERSION.sub("V", a) != VERSION.sub("V", b) or not VERSION.search(b):
            return "other"
        if any(major_pair(x, y) for x, y in zip(VERSION.findall(a), VERSION.findall(b))):
            kind = "major"
    return kind


def adopted(rows, number):
    return [r for r in rows if r["event"] == "adopt" and r.get("pr") == number]


def commits_attributed(repo, pr, allowed):
    """Every commit up to this exact head belongs to an allowed account GitHub can vouch for."""
    commits = gh_list(repo.name, "pulls", pr["number"], "commits")
    if not commits or len(commits) >= 250 or commits[-1].get("sha") != pr["headRefOid"]:
        return False
    owner = ((pr.get("headRepositoryOwner") or {}).get("login") or "").lower()
    for c in commits:
        who = canonical(c.get("author") or {})
        verified = (c.get("commit", {}).get("verification") or {}).get("verified") is True
        # The address on an unsigned commit can be anyone's, unless only that person can push there.
        alone = pr.get("isCrossRepository") is True and pr.get("maintainerCanModify") is False
        if who not in allowed or (not verified and not (alone and who == owner and who != repo.login)):
            return False
    return True


def author_facts(repo, policy, rows, pr):
    """Who this PR may be trusted as: own, own-unrecorded, trusted, babysit or unlisted."""
    author = canonical(pr["author"])
    if author == repo.login:
        mine = [r for r in adopted(rows, pr["number"]) if r.get("head") == pr["headRefOid"]]
        if mine and not pr["isCrossRepository"]:
            return "own", author, mine[-1]
        # The same account's other PRs are a person's, and a person lands them.
        return "own-unrecorded", author, None
    trusted = set(policy.get("autonomous_trusted_authors", []))
    babysit = set(policy.get("autonomous_babysit_authors", []))
    if author in trusted and commits_attributed(repo, pr, trusted | {repo.login}):
        return "trusted", author, None
    if author in babysit and commits_attributed(repo, pr, trusted | babysit | {repo.login}):
        return "babysit", author, None
    return "unlisted", author, None


def people_on(repo, kind, number):
    """Everyone whose text or code is part of an issue or PR."""
    item = gh_json("api", f"repos/{repo.name}/issues/{number}")
    people = [item.get("user")] + [c.get("user") for c in gh_list(repo.name, "issues", number, "comments")]
    if kind == "pr":
        for what in ("comments", "reviews"):
            people += [c.get("user") for c in gh_list(repo.name, "pulls", number, what)]
        people += [c.get("author") for c in gh_list(repo.name, "pulls", number, "commits")]
    return {canonical(p or {}) for p in people}


def origin_trusted(repo, policy, origin):
    if origin in ("internal", "external"):
        return origin == "internal"
    kind, _, number = origin.partition(":")
    if kind not in ("issue", "pr") or not number.isdigit():
        raise Failure(f"origin must be internal, external, issue:N or pr:N, not {origin!r}")
    return people_on(repo, kind, number) <= set(policy["autonomous_trusted_authors"]) | {repo.login}


def work_trusted(repo, policy, rows, number):
    """Asked again at landing: every job behind this PR, and everyone who has since spoken on either."""
    jobs = [job_of(rows, r["job"]) for r in adopted(rows, number)]
    return all(j and j.get("origin_trusted") and origin_trusted(repo, policy, j["origin"]) for j in jobs) \
        and origin_trusted(repo, policy, f"pr:{number}")


def receipt(rows, subject, head, base, kind, **match):
    for r in reversed(rows):
        if (r["event"] == "receipt" and r.get("subject") == subject and r.get("kind") == kind
                and all(r.get(k) == v for k, v in match.items())):
            return r if r.get("head") == head and r.get("base") == base else None
    return None


def change_of(base, head):
    """The exact change: each path with the content it had and has. The same only on files nobody else touched."""
    mb = git("merge-base", base, head).stdout.strip()
    raw = git("diff", "--raw", "--no-abbrev", "--no-renames", "-z", mb, head).stdout
    return hashlib.sha256(raw.encode("utf-8", "surrogateescape")).hexdigest() if raw else None


def carried_review(rows, subject, head, base):
    """A review of this exact change on an earlier base, when nothing in the folders it touches has moved since."""
    jobs = {r["job"] for r in rows if r["event"] == "adopt" and (r.get("sha") == head or f"pr:{r.get('pr')}" == subject)}
    mine = {f"direct:{r['sha']}" if r.get("sha") else f"pr:{r.get('pr')}" for r in rows if r["event"] == "adopt" and r["job"] in jobs}
    # The latest word on this job's work, whatever it was about.
    last = next((r for r in reversed(rows) if r["event"] == "receipt" and r.get("kind") == "review" and r.get("subject") in mine), None)
    if not last or not last.get("ok") or not last.get("change") or last["change"] != change_of(base, head):
        return None
    if git("merge-base", "--is-ancestor", last["from"], base, check=False).returncode != 0:
        return None
    mb = git("merge-base", base, head).stdout.strip()
    folders = {os.path.dirname(n) for n in git("diff", "--name-only", "--no-renames", "-z", mb, head).stdout.split("\0") if n}
    # Every commit between, so a change and its revert both count.
    moved = git("log", "--no-show-signature", "--format=", "--name-only", "--no-renames", "-m", "-z", f"{last['from']}..{base}").stdout.split("\0")
    def near(n):
        at = os.path.dirname(n)
        return at in folders or any(f and at.startswith(f + "/") for f in folders)
    return None if any(n.strip() and near(n.strip()) for n in moved) else last


def receipt_reasons(policy, rows, subject, head, base, guards=()):
    out = []
    for g in guards:
        r = receipt(rows, subject, head, base, "guard", file=g, checks=checks_id(policy))
        if r is None:
            out.append("guard-missing")
        elif not r.get("ok"):
            out.append("guard-failed")
    for kind in ("test", "review"):
        # A test under different checks is not a test under these.
        match = {"checks": checks_id(policy)} if kind == "test" else {}
        r = receipt(rows, subject, head, base, kind, **match)
        if r is None and kind == "review":
            r = carried_review(rows, subject, head, base)
        if r is None:
            out.append(f"{kind}-missing")
        elif not r.get("ok"):
            out.append(f"{kind}-failed")
    for rule in judged(policy):
        r = receipt(rows, subject, head, base, "rule", rule=rule_id(rule))
        if r is None:
            out.append("rule-unjudged")
        elif not r.get("ok"):
            out.append("rule-denied")
    return out


def main_reasons(repo, motion, job, passed):
    state, failing, _ = checks_at(repo, repo.tip())
    if state == "green":
        return []
    if state == "red" and motion == "main-red" and job and job.get("red_tip") == repo.tip() \
            and set(failing) <= set(passed):
        return []
    return ["main-not-green"]


def job_landed(rows, job_id):
    work = {r.get("sha") or r.get("pr") for r in rows if r["event"] == "adopt" and r["job"] == job_id}
    return any(r["event"] == "land" and (r.get("sha") or r.get("pr")) in work for r in rows)


def job_of(rows, job_id):
    return next((r for r in rows if r["event"] == "job" and r.get("job") == job_id), None)


def motion_of(job, facts):
    """The caller never picks the motion: it is the recorded job's, or what the diff is."""
    return job["motion"] if job else "stack" if facts["only_dependencies"] else "backlog"


def gate(repo, policy, rows, number):
    """Everything that decides whether this PR may merge now."""
    if not policy["active"]:
        return [policy["reason"]], {}
    pr = pr_view(repo, number)
    head, base, reasons = pr["headRefOid"], repo.tip(), []
    if pr["state"] != "OPEN":
        return ["not-open"], {"pr": pr}
    trust, author, adoption = author_facts(repo, policy, rows, pr)
    job = job_of(rows, adoption["job"]) if adoption else None
    repo.fetch_pr(number, head)
    facts = diff_facts(repo, base, head, policy)
    motion = motion_of(job, facts)
    level = level_for(policy, motion, author, landed_count(repo, rows, motion))
    if policy["autonomous_landing"] == "direct":
        reasons.append("lands-directly")
    if trust not in ("own", "trusted"):
        reasons.append("author-not-trusted")
    if trust == "own" and not job:
        reasons.append("job-missing")
    if job and not work_trusted(repo, policy, rows, number):
        reasons.append("origin-not-trusted")
    if level != "merge":
        reasons.append(f"level-{level}")
    if pr["isDraft"]:
        reasons.append("draft")
    if pr["baseRefName"] != repo.default:
        reasons.append("not-default-base")
    if gh_json("pr", "list", "-R", repo.name, "--base", pr["headRefName"], "--state", "open", "--json", "number"):
        reasons.append("stack-member")
    if pr["reviewDecision"] in ("CHANGES_REQUESTED", "REVIEW_REQUIRED"):
        reasons.append("review-required")
    if pr["mergeable"] != "MERGEABLE":
        reasons.append("not-mergeable")
    if pr["mergeStateStatus"] not in ("CLEAN", "HAS_HOOKS", "BEHIND"):
        reasons.append(f"merge-state-{pr['mergeStateStatus'].lower()}")
    rules = rules_on_default(repo)
    if rules is None:
        reasons.append("rules-unreadable")
    elif "merge_queue" in rules or has_merge_queue(repo):
        reasons.append("merge-queue")
    state, _, passed = checks_at(repo, head)
    if state != "green":
        reasons.append(f"checks-{state}")
    _, main_failing, main_passed = checks_at(repo, base)
    judges = set(main_passed) | set(main_failing)
    if judges and not set(passed) & judges:
        # Something passed, but nothing that also judges the default branch.
        reasons.append("checks-unrelated")
    reasons += main_reasons(repo, motion, job, passed)
    if git("merge-base", "--is-ancestor", base, head, check=False).returncode != 0:
        reasons.append("behind")
    stopped = stops(policy, facts, trust == "own")
    if stopped:
        reasons.append("hard-limit")
    if facts["major"]:
        reasons.append("major-update")
    reasons += receipt_reasons(policy, rows, f"pr:{number}", head, base, () if stopped else guards_of(facts))
    return reasons, {"pr": number, "url": pr["url"], "head": head, "base": base, "level": level, "motion": motion,
                     "author": author, "trust": trust, "hard_limits": stopped, "guards": guards_of(facts), "branch": pr["headRefName"]}


# --- commands ----------------------------------------------------------------

def cmd_policy(a, repo):
    p = load_policy(repo)
    if p["active"]:
        rows = ledger(repo)
        p["levels"] = {m: level_for(p, m, None, landed_count(repo, rows, m)) for m in p["autonomous_motions"]}
        p["rules"] = [{"id": rule_id(r), "text": r} for r in judged(p)]
        p["jobs_left"] = jobs_left(p, rows)
        p["landing"] = p["autonomous_landing"]
        p["allowance"] = {"enforced": True, **(allowance(repo) or {"state": "none"})}
    return emit(p)


def settle(repo, rows):
    """Record how PRs ended: a merge this script asked for, or a person's verdict on an own PR."""
    ended = {(r.get("pr"), r.get("head")) for r in rows if r["event"] in ("land", "rejected") and r.get("pr")}
    heads = {}
    for r in rows:
        if r["event"] in ("land-intent", "adopt") and r.get("pr"):
            motion = r.get("motion") or (job_of(rows, r["job"]) or {}).get("motion")
            heads[r["pr"]] = {"head": r["head"], "motion": motion, "by": r["event"]}
    closed = {r["item"] for r in rows if r["event"] == "close"}
    recorded = {r["pr"] for r in rows if r["event"] == "adopt" and r.get("pr") and f"pr:{r['pr']}" not in closed}
    tip = repo.tip(fresh=True)
    for sha in {r["sha"] for r in rows if r["event"] in ("land-intent", "adopt") and r.get("sha")}:
        intent = next((r for r in reversed(rows) if r["event"] == "land-intent" and r.get("sha") == sha), None)
        job = job_of(rows, next((r["job"] for r in rows if r["event"] == "adopt" and r.get("sha") == sha), None))
        motion, by = (intent["motion"], "script") if intent else ((job or {}).get("motion"), "person")
        if not any(r["event"] == "land" and r.get("merge_sha") == sha for r in rows) \
                and git("merge-base", "--is-ancestor", sha, tip, check=False).returncode == 0:
            append(repo, "land", sha=sha, motion=motion, head=sha, by=by, merge_sha=sha)
    for number, h in heads.items():
        if (number, h["head"]) in ended:
            continue
        try:
            pr = gh_json("pr", "view", str(number), "-R", repo.name, "--json", "state,mergeCommit,headRefOid")
        except Failure:
            continue  # one unreadable PR never stops a run; asked again next time
        if pr["state"] == "MERGED" and pr["headRefOid"] == h["head"]:
            sha = (pr.get("mergeCommit") or {}).get("oid") or ""
            if not SHA.match(sha) or git("merge-base", "--is-ancestor", sha, tip, check=False).returncode != 0:
                continue  # merged, but not visible on the default branch; asked again next run
            append(repo, "land", pr=number, motion=h["motion"], head=h["head"],
                   by="script" if h["by"] == "land-intent" else "person", merge_sha=sha)
        elif pr["state"] in ("MERGED", "CLOSED") and number in recorded:
            # Closed, or merged only after a person changed it: not a clean landing.
            append(repo, "rejected", pr=number, motion=h["motion"], head=h["head"])


def cmd_begin(a, repo):
    policy = load_policy(repo)
    if not policy["active"] or a.dry_run:
        return emit({"token": None, "mode": "report-only", "reason": policy.get("reason", "dry-run"),
                     "detail": policy.get("detail")})
    with locked(repo):
        state = read_state(repo)
        if state.get("corrupt"):
            return deny("state-corrupt")
        reclaimed = False
        if state.get("token"):
            if parse_iso(state["at"]) + LEASE_TTL >= now():
                return deny("locked", last_renewed=state["at"])
            reclaimed = True
        token = secrets.token_hex(8)
        settle(repo, ledger(repo))
        append(repo, "run", token=token, reclaimed=reclaimed, under_allowance=allowance(repo) is not None)
        write_state(repo, {"token": token, "at": iso(now())})
    for block in git("worktree", "list", "--porcelain").stdout.split("\n\n"):
        tree = block.split("\n")[0][len("worktree "):]
        if os.path.basename(os.path.dirname(tree)).startswith("afg-test-"):
            git("worktree", "remove", "--force", tree, check=False)
    return emit({"token": token, "mode": "act", "reclaimed": reclaimed, "jobs_left": jobs_left(policy, ledger(repo))})


def cmd_end(a, repo):
    with locked(repo):
        require_lease(repo, a.token)
        write_state(repo, {})
    return emit({"ended": True})


def cmd_heartbeat(a, repo):
    with locked(repo):
        require_lease(repo, a.token)
    return emit({"held": True})


def parked(rows):
    out = {}
    for r in rows:
        if r["event"] == "park":
            out[r["item"]] = r
        elif r["event"] == "answer":
            out.pop(r["item"], None)
        elif r["event"] in ("land", "rejected"):
            out.pop(f"pr:{r.get('pr')}", None)
            # Earlier attempts at the same job are settled with it.
            jobs = {x["job"] for x in rows if x["event"] == "adopt" and r.get("sha") and x.get("sha") == r["sha"]}
            for x in rows:
                if x["event"] == "adopt" and x.get("sha") and (x["job"] in jobs or x["sha"] == r.get("sha")):
                    out.pop(f"commit:{x['sha']}", None)
        elif r["event"] == "close":
            out.pop(r["item"], None)
        elif r["event"] == "adopt":
            # Work on it exists now; a job that only started may end with nothing.
            out.pop((job_of(rows, r["job"]) or {}).get("origin"), None)
    return out


def cmd_observe(a, repo):
    policy, rows = load_policy(repo), ledger(repo)
    state, failing, _ = checks_at(repo, repo.tip())
    prs = gh_json("pr", "list", "-R", repo.name, "--state", "open", "--limit", "200", "--json",
                  "number,title,author,isDraft,headRefOid,headRefName,headRepositoryOwner,maintainerCanModify,baseRefName,isCrossRepository,updatedAt,mergeStateStatus,labels")
    issues = gh_json("issue", "list", "-R", repo.name, "--state", "open", "--limit", "200", "--json",
                     "number,title,author,updatedAt,labels")
    park = parked(rows)

    def is_parked(item, updated):
        p = park.get(item)
        return bool(p and p.get("needs") != "later" and p.get("updated") == updated and p.get("main") == state
                    and parse_iso(p["at"]) > now() - timedelta(days=PARK_DAYS))

    for p in prs:
        p["parked"] = is_parked(f"pr:{p['number']}", p["updatedAt"])
        p["job"] = next((r["job"] for r in reversed(adopted(rows, p["number"]))), None)
        try:
            p["handling"], error = handling(repo, policy, rows, p), None
        except (Failure, KeyError, TypeError, ValueError) as e:
            p["handling"], error = "diff-only", str(e)
        p["author"] = canonical(p["author"])
        if error:
            p["error"] = error
    for i in issues:
        i["author"], i["parked"] = canonical(i["author"]), is_parked(f"issue:{i['number']}", i["updatedAt"])
    return emit({"repo": repo.name, "default_branch": repo.default, "tip": repo.tip(), "main": state,
                 "main_failing": failing, "prs": prs, "issues": issues, "unfinished_jobs": unfinished(rows),
                 "parked_other": [r for k, r in park.items() if not k.startswith(("pr:", "issue:"))],
                 "truncated": len(prs) >= 200 or len(issues) >= 200})


def handling(repo, policy, rows, p):
    trust, who, adoption = author_facts(repo, policy, rows, p)
    if trust == "own":
        return "own"
    if trust == "own-unrecorded":
        return "own-moved" if p["job"] else "diff-only"
    if trust == "unlisted":
        return "diff-only"
    repo.fetch_pr(p["number"], p["headRefOid"])
    motion = motion_of(None, diff_facts(repo, repo.tip(), p["headRefOid"], policy))
    level = level_for(policy, motion, who, landed_count(repo, rows, motion))
    if LEVELS.index(level) < LEVELS.index("babysit"):
        return "diff-only"
    return "land" if trust == "trusted" and level == "merge" else "babysit"


def unfinished(rows):
    """Recent PR jobs whose PR was never recorded, such as after a crash."""
    done = {r["job"] for r in rows if r["event"] in ("adopt", "job-end")}
    recent = now() - timedelta(days=1)
    return [r for r in rows if r["event"] == "job" and r.get("opens_pr") and r["job"] not in done
            and parse_iso(r["at"]) > recent]


def open_own_prs(repo, rows):
    numbers = {r["pr"] for r in rows if r["event"] == "adopt" and r.get("pr")}
    live = gh_json("pr", "list", "-R", repo.name, "--state", "open", "--author", "@me", "--limit", "200", "--json", "number,author")
    if len(live) >= 200:
        raise Failure("too many open PRs to count")
    return [p["number"] for p in live if p["number"] in numbers and canonical(p["author"]) == repo.login]


def cmd_job(a, repo):
    policy = load_policy(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    if a.motion not in policy["autonomous_motions"]:
        return deny("motion-off")
    if a.motion in ORIGIN_REQUIRED and (not a.origin or a.motion == "bugs" and a.origin == "internal"):
        return deny("origin-missing")
    origin = a.origin or "internal"
    trusted = origin_trusted(repo, policy, origin)
    state, _, _ = checks_at(repo, repo.tip())
    if machine_busy() and a.motion != "main-red":
        # Asked before the lease, so waiting here does not keep it.
        return deny("machine-busy")
    with locked(repo):
        require_lease(repo, a.token)
        rows = ledger(repo)
        if origin not in ("internal", "external") and any(r["origin"] == origin for r in unfinished(rows)):
            return deny("job-unfinished")
        if jobs_left(policy, rows) == 0:
            return deny("hourly-cap")
        reasons = allowance_reasons(repo, rows)
        if reasons:
            return deny_allowance(repo, rows, reasons)
        # A repair everything else waits for takes one place beyond the limit.
        spare = a.motion == "main-red" and not any(r.get("motion") == "main-red" for r in active_work(rows))
        if allowance(repo) is None and len(active_work(rows)) >= JOBS_AT_ONCE + spare:
            # Without an allocator nothing else shares this machine out.
            return deny("jobs-at-once", going=[{k: r[k] for k in ("job", "worker", "what", "at") if k in r} for r in active_work(rows)])
        # With CI ignored the checks here say whether main is broken, and a repair gets no exception from them.
        local = policy["autonomous_landing"] == "direct" and policy["autonomous_ci"] == "ignored"
        if a.motion == "main-red" and state != "red" and not local:
            return deny("main-not-red")
        if a.opens_pr:
            if level_for(policy, a.motion, repo.login, landed_count(repo, rows, a.motion)) == "report":
                return deny("level-report")
            live = open_own_prs(repo, rows)
            if len(live) + len(unfinished(rows)) >= policy["autonomous_open_pr_cap"]:
                repairs = [r for r in rows if r["event"] == "adopt" and r.get("pr") in live
                           and (job_of(rows, r["job"]) or {}).get("motion") == "main-red"]
                repairs += [r for r in unfinished(rows) if r["motion"] == "main-red"]
                if a.motion != "main-red" or repairs:
                    return deny("open-pr-cap")
        job = secrets.token_hex(6)
        append(repo, "job", job=job, motion=a.motion, origin=origin, origin_trusted=trusted,
               red_tip=repo.tip() if a.motion == "main-red" else None, what=a.what,
               opens_pr=a.opens_pr)
    return emit({"job": job, "motion": a.motion, "origin_trusted": trusted})


def cmd_job_end(a, repo):
    """A job that will produce no PR stops counting toward the open PR cap."""
    with locked(repo):
        require_lease(repo, a.token)
        append(repo, "job-end", job=a.job, why=a.why)
    return emit({"ended": a.job})


def cmd_worker(a, repo):
    """A worker on work already in flight, such as a fix or babysitting, takes a place like a job."""
    with locked(repo):
        require_lease(repo, a.token)
        rows = ledger(repo)
        reasons = allowance_reasons(repo, rows)
        if reasons:
            return deny_allowance(repo, rows, reasons)
        worker = secrets.token_hex(6)
        append(repo, "worker", worker=worker, what=a.what)
    return emit({"worker": worker})


def cmd_worker_end(a, repo):
    with locked(repo):
        require_lease(repo, a.token)
        append(repo, "worker-end", worker=a.worker)
    return emit({"ended": a.worker})


def local_commits_own(repo, sha):
    """A local commit on top of the tip, made by this account and published by nobody."""
    base = repo.tip()
    if git("merge-base", "--is-ancestor", base, sha, check=False).returncode != 0 or sha == base:
        return False
    me = git("config", "user.email").stdout.strip().lower()
    lines = git("log", "--format=%H %ae %ce", f"{base}..{sha}").stdout.lower().split("\n")
    commits = [x.split(" ") for x in lines if x]
    if not me or any(c[1:] != [me, me] for c in commits):
        return False
    return all(unpublished(repo, c[0]) for c in commits)


def unpublished(repo, sha):
    """GitHub says it has never seen this commit. Any other answer is a no."""
    p = run(["gh", "api", f"repos/{repo.name}/commits/{sha}"])
    return p.returncode != 0 and re.search(r"HTTP (404|422)|No commit found", p.stdout + p.stderr) is not None


def cmd_adopt(a, repo):
    """Record exactly what a worker produced for a job."""
    if a.sha:
        if not SHA.match(a.sha) or not local_commits_own(repo, a.sha):
            return deny("author-not-trusted")
        what = {"sha": a.sha, "head": a.sha}
    else:
        pr = pr_view(repo, a.pr)
        for _ in range(5):
            if pr["headRefOid"] == a.head or os.environ.get("AFG_NO_WAIT"):
                break
            # GitHub can lag a push by a few seconds.
            time.sleep(3)
            pr = pr_view(repo, a.pr)
        if pr["headRefOid"] != a.head:
            return deny("head-moved")
        if canonical(pr["author"]) != repo.login or pr["isCrossRepository"]:
            return deny("author-not-trusted")
        commits = gh_list(repo.name, "pulls", a.pr, "commits")
        if not commits or len(commits) >= 250 or commits[-1].get("sha") != a.head:
            return deny("head-moved")
        who = {canonical(c.get("author") or {}) for c in commits}
        if who != {repo.login}:
            return deny("commit-not-attributed", authors=sorted(who))
        what = {"pr": a.pr, "head": a.head}
    with locked(repo):
        require_lease(repo, a.token)
        rows = ledger(repo)
        job = job_of(rows, a.job)
        if not job:
            return deny("job-missing")
        mine = [r for r in rows if r["event"] == "adopt" and r["job"] == a.job]
        callees = CALLEES.get(job["motion"], ["lfg"])
        via = sorted(set(a.via))
        if not mine and not set(via) & set(callees):
            # Asked once per job: a later head is a fix or a rebase of the same work.
            return deny("callee-missing", callees=callees)
        if any(r.get("pr") != what.get("pr") for r in mine) or job_landed(rows, a.job):
            return deny("job-already-used")
        if a.sha and any(r["event"] == "adopt" and r.get("sha") == a.sha and r["job"] != a.job for r in rows):
            return deny("commit-already-used")
        append(repo, "adopt", job=a.job, via=via, **what)
    return emit({"job": a.job, **what})


def subject_of(a, repo, policy, rows):
    """(subject, head, why not) for a PR or a direct-landing commit."""
    if a.pr is not None:
        pr = pr_view(repo, a.pr)
        trust, _, _ = author_facts(repo, policy, rows, pr)
        repo.fetch_pr(a.pr, pr["headRefOid"])
        return f"pr:{a.pr}", pr["headRefOid"], [] if trust in ("own", "trusted") else ["author-not-trusted"]
    if not SHA.match(a.sha or ""):
        return None, None, ["sha-invalid"]
    recorded = any(r["event"] == "adopt" and r.get("sha") == a.sha for r in rows)
    if not recorded or not local_commits_own(repo, a.sha):
        return None, None, ["author-not-trusted"]
    return f"direct:{a.sha}", a.sha, []


def is_own(a, repo, policy, rows):
    return a.pr is None or author_facts(repo, policy, rows, pr_view(repo, a.pr))[0] == "own"


def scrubbed_env(tmp):
    env = {k: v for k, v in os.environ.items()
           if not re.search(r"TOKEN|SECRET|PASSWORD|CREDENTIAL|API_?KEY|^GH_|^GITHUB_|^SSH_", k, re.I)
           # Nor anything that could point a test at a service in use or at its environment.
           and not re.search(r"DATABASE|REDIS|MONGO|(^|_)(DB|DSN)(_|$)|^PG[A-Z]+$|^MYSQL_|^(RAILS|RACK|NODE|APP)_ENV$|_(URL|URI)$", k, re.I)}
    env.update(GH_CONFIG_DIR=os.path.join(tmp, "no-gh"), GIT_TERMINAL_PROMPT="0", GIT_ASKPASS="true",
               GIT_SSH_COMMAND="false", GIT_CONFIG_GLOBAL=os.devnull, GIT_CONFIG_NOSYSTEM="1", CI="1")
    return env


def still_at(tree, head):
    """The checked-out files are still exactly the commit under test."""
    at = git("rev-parse", "HEAD", cwd=tree, check=False).stdout.strip()
    hidden = git("ls-files", "-v", cwd=tree, check=False).stdout
    dirty = git("status", "--porcelain", "--untracked-files=no", cwd=tree, check=False)
    return at == head and dirty.returncode == 0 and not dirty.stdout.strip() \
        and not any(x[:1].islower() or x[:1] == "S" for x in hidden.split("\n") if x)


def kill_group(proc):
    """End whatever the command left running."""
    try:
        os.killpg(proc.pid, signal.SIGKILL)
    except (ProcessLookupError, PermissionError):
        pass
    proc.wait()


def cmd_test(a, repo):
    policy = load_policy(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    rows, base = ledger(repo), repo.tip()
    subject, head, why = subject_of(a, repo, policy, rows)
    if why:
        return deny(*why)
    facts = diff_facts(repo, base, head, policy)
    stopped = stops(policy, facts, is_own(a, repo, policy, rows))
    if stopped:
        # Code that could rewrite its own judge is not run unattended.
        return deny("hard-limit", hard_limits=stopped)
    if a.pr is not None:
        pr = pr_view(repo, a.pr)
        if handling(repo, policy, rows, {**pr, "job": None}) == "diff-only" or pr["headRefOid"] != head:
            return deny("level-below-babysit")
    commands = applying_checks(policy, facts["names"])
    if not commands:
        return deny("no-check-applies")
    if a.dry_run:
        return emit({"would_run": commands, "head": head, "base": base})
    with locked(repo):
        require_lease(repo, a.token)
    with machine_turn(repo, a.token, MACHINE_WAIT):
        if repo.tip(fresh=True) != base:
            # Nothing tested on the old tip could land.
            return deny("base-moved", base=base)
        tmp = tempfile.mkdtemp(prefix="afg-test-")
        tree, log, proc, code = os.path.join(tmp, "tree"), os.path.join(store_dir(repo), f"test-{head[:12]}.log"), None, "interrupted"
        ran = []
        for sig in (signal.SIGTERM, signal.SIGHUP):
            signal.signal(sig, interrupted)
        try:
            env = scrubbed_env(tmp)
            add = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "worktree", "add", "--quiet", "--detach", tree, head],
                                 cwd=repo.main or repo.common, env=env, capture_output=True, text=True)
            if add.returncode != 0:
                raise Failure(f"worktree: {add.stderr.strip()}")
            print(f"log: {log}", file=sys.stderr, flush=True)
            with open(log, "wb") as out:
                deadline = now() + timedelta(seconds=a.timeout)
                code, failed_at = 0, None
                for command in commands:
                    # Every check runs, so one failure never hides another. A failure is tried once more and recorded.
                    for attempt in (1, 2):
                        calm = now() + timedelta(seconds=600)
                        while attempt == 2 and machine_busy() and now() < min(calm, deadline):
                            # The one retry is not spent on a machine that may be the cause.
                            time.sleep(5)
                        for clean in (["reset", "--quiet", "--hard", head], ["clean", "-ffdxq"]) if attempt == 2 else ():
                            subprocess.run(["git", "-c", "core.hooksPath=/dev/null", *clean], cwd=tree, env=env, capture_output=True)
                        out.write(f"\n$ {command}  (attempt {attempt})\n".encode())
                        out.flush()
                        proc = subprocess.Popen(command, shell=True, cwd=tree, env=env, stdin=subprocess.DEVNULL, stdout=out,
                                                stderr=subprocess.STDOUT, start_new_session=True)
                        try:
                            one = proc.wait(timeout=max(1, (deadline - now()).total_seconds()))
                        except subprocess.TimeoutExpired:
                            one = "timeout"
                        kill_group(proc)
                        if one == 0 and not still_at(tree, head):
                            one = "changed-the-tree"
                        if one in (0, "timeout", "changed-the-tree"):
                            break
                    ran.append({"run": command, "exit": one, "attempts": attempt, "load": load_now()})
                    out.seek(0, os.SEEK_END)
                    if one != 0 and failed_at is None:
                        # What failed first is what the caller needs to see.
                        failed_at = out.tell()
                    if one != 0 and code == 0:
                        code = one
            with open(log, "rb") as f:
                f.seek(max(0, (failed_at or 0) - 3000))
                tail = f.read(3000 if failed_at is None else min(3000, failed_at)).decode("utf-8", "replace")
        finally:
            if proc is not None:
                kill_group(proc)
            git("worktree", "remove", "--force", tree, cwd=repo.main or repo.common, check=False)
            shutil.rmtree(tmp, ignore_errors=True)
    with locked(repo):
        require_lease(repo, a.token)
        append(repo, "receipt", kind="test", subject=subject, head=head, base=base, ok=code == 0, exit=code,
               checks=checks_id(policy), ran=ran)
    return emit({"ok": code == 0, "exit": code, "ran": ran, "log": log, "guards": guards_of(facts), "flaky": [x["run"] for x in ran if x["exit"] == 0 and x["attempts"] > 1], "head": head, "base": base, "tail": tail if code != 0 else ""}, 0 if code == 0 else 1)


def cmd_turn(a, repo):
    """Run one heavy command here, in this machine's turn, without credentials. For a worker's own checks."""
    tmp, proc = tempfile.mkdtemp(prefix="afg-turn-"), None
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        with machine_turn(repo, None, MACHINE_WAIT):
            proc = subprocess.Popen(a.run, shell=True, env=scrubbed_env(tmp), stdin=subprocess.DEVNULL, stdout=sys.stderr,
                                    start_new_session=True)
            try:
                code = proc.wait(timeout=a.timeout)
            except subprocess.TimeoutExpired:
                code = "timeout"
    finally:
        if proc is not None:
            kill_group(proc)
        shutil.rmtree(tmp, ignore_errors=True)
    return emit({"ok": code == 0, "exit": code}, 0 if code == 0 else 1)


def cmd_check(a, repo):
    """Run candidate checks on the default branch tip exactly as `test` would. Records nothing."""
    head, tmp, proc, ran = repo.tip(), tempfile.mkdtemp(prefix="afg-check-"), None, []
    tree, log = os.path.join(tmp, "tree"), os.path.join(tmp, "log")
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    try:
        with machine_turn(repo, None, MACHINE_WAIT):
            env = scrubbed_env(tmp)
            add = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "worktree", "add", "--quiet", "--detach", tree, head],
                                 cwd=repo.main or repo.common, env=env, capture_output=True, text=True)
            if add.returncode != 0:
                raise Failure(f"worktree: {add.stderr.strip()}")
            for command in a.run:
                with open(log, "wb") as out:
                    proc = subprocess.Popen(command, shell=True, cwd=tree, env=env, stdin=subprocess.DEVNULL, stdout=out,
                                            stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        code = proc.wait(timeout=a.timeout)
                    except subprocess.TimeoutExpired:
                        code = "timeout"
                    kill_group(proc)
                if code == 0 and not still_at(tree, head):
                    code = "changed-the-tree"
                with open(log, encoding="utf-8", errors="replace") as f:
                    ran.append({"run": command, "exit": code, "tail": "" if code == 0 else f.read()[-1500:]})
    finally:
        if proc is not None:
            kill_group(proc)
        git("worktree", "remove", "--force", tree, cwd=repo.main or repo.common, check=False)
        shutil.rmtree(tmp, ignore_errors=True)
    ok = all(x["exit"] == 0 for x in ran)
    return emit({"ok": ok, "head": head, "ran": ran}, 0 if ok else 1)


def cmd_review(a, repo):
    policy = load_policy(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    try:
        review = json.load(sys.stdin)
        scope = review["scope"]
        severities = [f.get("severity") for f in review["findings"]]
    except (ValueError, KeyError, TypeError, AttributeError):
        return deny("review-unreadable")
    rows, base = ledger(repo), repo.tip()
    subject, head, why = subject_of(a, repo, policy, rows)
    facts = diff_facts(repo, base, head, policy) if head else None
    if review.get("status") != "complete":
        why.append("review-not-complete")
    if review.get("verdict") != "Ready to merge":
        why.append("review-not-ready")
    if "P0" in severities or "P1" in severities:
        why.append("review-open-findings")
    if scope.get("head_sha") != head:
        why.append("head-moved")
    if facts and (scope.get("base") not in (facts["merge_base"], f"base:{base}", base)
                  or scope.get("files_changed") != facts["files"]):
        why.append("review-scope-mismatch")
    recordable = head is not None and "head-moved" not in why and "author-not-trusted" not in why
    if recordable and not a.dry_run:
        with locked(repo):
            require_lease(repo, a.token)
            append(repo, "receipt", kind="review", subject=subject, head=head, base=base, ok=not why,
                   change=change_of(base, head), **{"from": facts["merge_base"]},
                   run_id=str(review.get("run_id")))
    return deny(*why) if why else emit({"ok": True, "head": head, "base": base})


def cmd_guard(a, repo):
    """Record an independent verdict on one guard file, and prove the check still catches a planted violation."""
    policy = load_policy(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    try:
        v = json.load(sys.stdin)
        said = all(isinstance(v[k], str) and v[k].strip() for k in ("reviewer", "reason", "probe", "expect")) and \
            isinstance(v["narrow"], bool) and isinstance(v["probe_is_real"], bool)
    except (ValueError, KeyError, TypeError):
        said = False
    if not said:
        return deny("guard-unreadable")
    rows, base = ledger(repo), repo.tip()
    subject, head, why = subject_of(a, repo, policy, rows)
    if why:
        return deny(*why)
    facts = diff_facts(repo, base, head, policy)
    if a.file not in guards_of(facts):
        return deny("not-a-guard", guards=guards_of(facts))
    stopped = stops(policy, facts, is_own(a, repo, policy, rows))
    if stopped:
        return deny("hard-limit", hard_limits=stopped)
    if v.get("head_sha") != head:
        return deny("head-moved")
    reasons = [r for k, r in (("narrow", "guard-not-narrow"), ("probe_is_real", "probe-not-real")) if not v[k]]

    def record(*more, **extra):
        why = reasons + list(more)
        with locked(repo):
            require_lease(repo, a.token)
            append(repo, "receipt", kind="guard", subject=subject, head=head, base=base, file=a.file, ok=not why,
                   checks=checks_id(policy), reviewer=v["reviewer"], why=v["reason"], probe=v["probe"],
                   expect=v["expect"], reasons=why)
        return deny(*why, **extra) if why else emit({"ok": True, "file": a.file, **extra})
    if reasons:
        return record()
    if v.get("check") not in applying_checks(policy, facts["names"]):
        return deny("check-unknown", checks=applying_checks(policy, facts["names"]))
    passed = receipt(rows, subject, head, base, "test", checks=checks_id(policy))
    if not passed or not passed["ok"]:
        return deny("test-missing")
    with locked(repo):
        require_lease(repo, a.token)
    log = os.path.join(store_dir(repo), f"test-{head[:12]}.log")
    with open(log, encoding="utf-8", errors="replace") as f:
        # The log also names each command, which is not what it printed.
        if v["expect"] in "\n".join(x for x in f.read().split("\n") if not re.match(r"\$ .*\(attempt \d\)$", x)):
            return record("probe-text-not-new")
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, interrupted)
    tmp, proc = tempfile.mkdtemp(prefix="afg-guard-"), None
    tree, patch, out_path = (os.path.join(tmp, n) for n in ("tree", "patch", "log"))
    missed = []
    try:
        env = scrubbed_env(tmp)
        add = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "worktree", "add", "--quiet", "--detach", tree, head],
                             cwd=repo.main or repo.common, env=env, capture_output=True, text=True)
        if add.returncode != 0:
            raise Failure(f"worktree: {add.stderr.strip()}")
        with open(patch, "w", encoding="utf-8", newline="") as f:
            f.write(v["probe"])
        put = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", "apply", "--index", patch], cwd=tree, env=env,
                             capture_output=True, text=True)
        if put.returncode != 0:
            return record("probe-does-not-apply", error=put.stderr.strip())
        names = git("diff", "--cached", "--name-only", "--no-renames", "-z", head, cwd=tree).stdout.split("\0")
        modes = [row.split(" ")[:2] for row in git("diff", "--cached", "--raw", "--no-renames", "-z", head, cwd=tree).stdout.split("\0") if row.startswith(":")]
        if any(new != "100644" and (new != "100755" or old != ":100755") and new != "000000" for old, new in modes):
            return record("probe-changes-a-mode")
        bad = [n for n in names if n and (TEST_FILE.search(n.lower()) or n == a.file or judge_hits(policy, [n]) or is_guard(n)
                                          or any(re.search(p, n.lower()) for k, p in HARD_PATHS if k == "judge")
                                          or MANIFEST.search(n.lower()) or LOCKFILE.search(n.lower()))]
        if bad:
            # The violation goes where work goes. Editing a check to fail proves nothing about it.
            return record("probe-touches-a-judge", files=bad)
        with machine_turn(repo, a.token, MACHINE_WAIT), open(out_path, "wb") as out:
            proc = subprocess.Popen(v["check"], shell=True, cwd=tree, env=env, stdin=subprocess.DEVNULL, stdout=out,
                                    stderr=subprocess.STDOUT, start_new_session=True)
            try:
                code = proc.wait(timeout=a.timeout)
            except subprocess.TimeoutExpired:
                code = "timeout"
            kill_group(proc)
        with open(out_path, encoding="utf-8", errors="replace") as f:
            text = f.read()
        if code in (0, "timeout") or v["expect"] not in text:
            missed.append("probe-not-caught")
    finally:
        if proc is not None:
            kill_group(proc)
        git("worktree", "remove", "--force", tree, cwd=repo.main or repo.common, check=False)
        shutil.rmtree(tmp, ignore_errors=True)
    return record(*missed, exit=code, tail=text[-3000:])


def interrupted(*_):
    raise Failure("the test run was interrupted")


def cmd_rule(a, repo):
    policy = load_policy(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    if not set(a.rule) <= {rule_id(r) for r in judged(policy)}:
        return deny("rule-unknown")
    rows, base = ledger(repo), repo.tip()
    subject, head, why = subject_of(a, repo, policy, rows)
    if why:
        return deny(*why)
    if a.head != head:
        return deny("head-moved")
    with locked(repo):
        require_lease(repo, a.token)
        for rule in a.rule:
            append(repo, "receipt", kind="rule", subject=subject, head=head, base=base, rule=rule,
                   ok=a.verdict == "pass", why=a.why)
    return emit({"recorded": a.verdict, "head": head})


def cmd_gate(a, repo):
    reasons, facts = gate(repo, load_policy(repo), ledger(repo), a.pr)
    return deny(*reasons, **facts) if reasons else emit({"allowed": True, **facts})


def cmd_update(a, repo):
    """Bring a PR that is otherwise next to land up to date, voiding its receipts."""
    policy, rows = load_policy(repo), ledger(repo)
    reasons, facts = gate(repo, policy, rows, a.pr)
    remade = {"behind", "checks-unknown", "checks-red", "checks-unrelated", "merge-state-unstable"}
    if {"checks-red", "checks-unknown"} & set(reasons) and "review-required" not in reasons:
        remade.add("merge-state-blocked")
    if facts.get("motion") == "main-red" and checks_at(repo, repo.tip())[0] == "red":
        # The repair is rebound to the new tip once it is up to date.
        remade.add("main-not-green")
    blocking = [r for r in reasons if r not in remade and not r.startswith(("test-", "review-missing", "review-failed", "rule-", "guard-"))]
    if blocking or "behind" not in reasons:
        return deny(*(blocking or ["not-behind"]), **facts)
    if a.dry_run:
        return emit({"would_update": a.pr, **facts})
    with locked(repo):
        require_lease(repo, a.token)
        gh("api", "-X", "PUT", f"repos/{repo.name}/pulls/{a.pr}/update-branch", "-f", f"expected_head_sha={facts['head']}")
        append(repo, "update", pr=a.pr, head=facts["head"])
    return emit({"updated": a.pr, "was": facts["head"]})


def merge_method(repo, policy):
    if policy["autonomous_merge_method"]:
        return "--" + policy["autonomous_merge_method"]
    d = gh_json("api", f"repos/{repo.name}")
    for flag, key in (("--squash", "allow_squash_merge"), ("--rebase", "allow_rebase_merge"), ("--merge", "allow_merge_commit")):
        if d.get(key):
            return flag
    raise Failure("no readable merge method")


def cmd_land(a, repo):
    policy = load_policy(repo)
    reasons, facts = gate(repo, policy, ledger(repo), a.pr)
    if facts.get("head") and facts["head"] != a.head:
        reasons.append("head-moved")
    if reasons:
        return deny(*reasons, **facts)
    if a.dry_run:
        return emit({"would_merge": a.pr, **facts})
    method = merge_method(repo, policy)
    with locked(repo):
        require_lease(repo, a.token)
        if repo.tip(fresh=True) != facts["base"]:
            return deny("base-moved", **facts)
        append(repo, "land-intent", pr=a.pr, motion=facts["motion"], head=a.head, base=facts["base"])
        gh("pr", "merge", str(a.pr), "-R", repo.name, method, "--match-head-commit", a.head)
        settle(repo, ledger(repo))
        done = [r for r in ledger(repo) if r["event"] == "land" and r.get("pr") == a.pr and r["head"] == a.head]
    if not done:
        return deny("not-confirmed-merged", **facts)
    return emit({"landed": a.pr, "merge_sha": done[-1]["merge_sha"]})


def cmd_direct(a, repo):
    """Fast-forward the default branch to one tested, reviewed commit of its own."""
    policy, rows = load_policy(repo), ledger(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    subject, head, why = subject_of(argparse.Namespace(pr=None, sha=a.sha), repo, policy, rows)
    if why:
        return deny(*why)
    job, base, reasons = job_of(rows, a.job), repo.tip(), []
    if policy["autonomous_landing"] != "direct":
        reasons.append("direct-off")
    if not job:
        return deny(*reasons, "job-missing")
    if not any(r["event"] == "adopt" and r["job"] == a.job and r.get("sha") == head for r in rows):
        reasons.append("job-mismatch")
    if job_landed(rows, a.job):
        reasons.append("job-already-used")
    if {r["job"] for r in rows if r["event"] == "adopt" and r.get("sha") == head} != {a.job}:
        reasons.append("commit-already-used")
    if not job.get("origin_trusted") or not origin_trusted(repo, policy, job["origin"]):
        reasons.append("origin-not-trusted")
    if level_for(policy, job["motion"], repo.login, landed_count(repo, rows, job["motion"])) != "merge":
        reasons.append("level-below-merge")
    branch = gh_json("api", f"repos/{repo.name}/branches/{repo.default}")
    if branch.get("protected") is not False or rules_on_default(repo) != []:
        reasons.append("default-branch-protected")
    if git("merge-base", "--is-ancestor", base, head, check=False).returncode != 0 or head == base:
        reasons.append("not-fast-forward")
    elif policy["autonomous_merge_method"] == "merge":
        # One commit, joined by a merge that adds nothing of its own.
        parents = git("log", "-1", "--format=%P", head).stdout.split()
        if len(parents) != 2 or parents[0] != base or git("log", "-1", "--format=%P", parents[1]).stdout.split() != [base] \
                or git("rev-parse", f"{head}^{{tree}}").stdout != git("rev-parse", f"{parents[1]}^{{tree}}").stdout:
            reasons.append("not-one-merged-commit")
    elif git("rev-list", "--count", f"{base}..{head}").stdout.strip() != "1":
        reasons.append("not-one-commit")
    facts = diff_facts(repo, base, head, policy)
    stopped = stops(policy, facts, True)
    if stopped:
        reasons.append("hard-limit")
    if facts["major"]:
        reasons.append("major-update")
    if policy["autonomous_ci"] == "required":
        state = checks_at(repo, base)[0]
        if state != "green" and not (state == "red" and job["motion"] == "main-red" and job.get("red_tip") == base):
            # An unpublished repair has no hosted checks; its test on this tip stands for them.
            reasons.append("main-not-green")
    # With CI ignored the checks here are the gate: the test receipt is for this commit on this tip, which is what the default
    # branch becomes. So a red main neither blocks a tested commit nor excuses an untested one.
    reasons += receipt_reasons(policy, rows, subject, head, base, () if stopped else guards_of(facts))
    if reasons:
        return deny(*reasons, hard_limits=stopped, guards=guards_of(facts))
    if a.dry_run:
        return emit({"would_push": head, "base": base})
    with locked(repo):
        require_lease(repo, a.token)
        if repo.tip(fresh=True) != base:
            return deny("base-moved")
        append(repo, "land-intent", sha=head, motion=job["motion"], head=head, base=base)
        git("-c", "core.hooksPath=/dev/null", "push", "--quiet", "--no-follow-tags", "--recurse-submodules=no", "origin", f"{head}:refs/heads/{repo.default}")
        settle(repo, ledger(repo))
        if not any(r["event"] == "land" and r.get("merge_sha") == head for r in ledger(repo)):
            return deny("not-confirmed-landed")
    return emit({"landed": head})


def evidence_reasons(repo, item, how, ref):
    kind, _, value = ref.partition(":")
    if how in ("fixed", "replaced") and kind == "commit" and SHA.match(value):
        known = git("cat-file", "-e", f"{value}^{{commit}}", check=False).returncode == 0
        if known and git("merge-base", "--is-ancestor", value, repo.tip(), check=False).returncode == 0:
            return []
    elif how in ("fixed", "replaced") and kind == "pr" and value.isdigit() and int(value) != item["number"]:
        pr = gh_json("pr", "view", value, "-R", repo.name, "--json", "state,baseRefName")
        if pr["state"] == "MERGED" and pr["baseRefName"] == repo.default:
            return []
    elif how == "duplicate" and kind == "issue" and value.isdigit() and int(value) < item["number"]:
        other = gh_json("api", f"repos/{repo.name}/issues/{value}")
        if other.get("state_reason") not in ("duplicate", "not_planned") and "pull_request" not in other:
            return []
    return ["evidence-unproven"]


def cmd_close(a, repo):
    policy, rows = load_policy(repo), ledger(repo)
    if not policy["active"]:
        return deny(policy["reason"])
    item = gh_json("api", f"repos/{repo.name}/issues/{a.number}")
    reasons = []
    level = level_for(policy, "backlog", canonical(item.get("user") or {}), landed_count(repo, rows, "backlog"))
    if LEVELS.index(level) < LEVELS.index("babysit"):
        reasons.append(f"level-{level}")
    if item.get("state") != "open":
        reasons.append("not-open")
    is_pr = "pull_request" in item
    if is_pr != (a.kind == "pr"):
        reasons.append("wrong-kind")
    if len(a.comment.strip()) < 20:
        reasons.append("comment-missing")
    reasons += evidence_reasons(repo, item, getattr(a, "as"), a.evidence)
    if reasons:
        return deny(*reasons)
    if a.dry_run:
        return emit({"would_close": f"{a.kind}:{a.number}", "evidence": a.evidence})
    with locked(repo):
        require_lease(repo, a.token)
        gh(a.kind, "close", str(a.number), "-R", repo.name)
        if gh_json("api", f"repos/{repo.name}/issues/{a.number}").get("state") != "closed":
            return deny("not-confirmed-closed")
        gh(a.kind, "comment", str(a.number), "-R", repo.name, "--body", f"{a.comment.strip()}\n\nEvidence: {a.evidence}")
        append(repo, "close", item=f"{a.kind}:{a.number}", how=getattr(a, "as"), evidence=a.evidence)
    return emit({"closed": f"{a.kind}:{a.number}"})


def cmd_park(a, repo):
    if not a.tried.strip():
        return deny("nothing-tried")
    kind, _, number = a.item.partition(":")
    if kind not in ("pr", "issue", "main", "idea", "security", "commit", "sweep", "setting"):
        return deny("item-invalid")
    updated = None
    if kind in ("pr", "issue"):
        updated = gh_json("api", f"repos/{repo.name}/issues/{number}")["updated_at"]
    if updated is not None and a.updated != updated:
        return deny("item-moved", updated=updated)
    state, _, _ = checks_at(repo, repo.tip())
    with locked(repo):
        require_lease(repo, a.token)
        append(repo, "park", item=a.item, updated=updated, main=state, why=a.why, recommend=a.recommend,
               needs=a.needs, tried=a.tried)
    return emit({"parked": a.item})


def decisions(rows):
    """Answers that still apply. A retired or replaced one stops applying."""
    gone = {r["id"] for r in rows if r["event"] == "retire"}
    gone |= {r["replaces"] for r in rows if r["event"] == "answer" and r.get("replaces")}
    return [r for r in rows if r["event"] == "answer" and r["id"] not in gone]


def cmd_answer(a, repo):
    """Record what a person decided. Nothing that allows or denies a landing reads this."""
    if a.reason_from != "none" and not (a.reason or "").strip():
        return deny("reason-missing")
    with locked(repo):
        rows = ledger(repo)
        if a.replaces and a.replaces not in [r["id"] for r in decisions(rows)]:
            return deny("decision-unknown")
        key = secrets.token_hex(4)
        append(repo, "answer", id=key, item=a.item, situation=a.situation, options=a.option, choice=a.choice,
               reason=a.reason if a.reason_from != "none" else None, reason_from=a.reason_from,
               scope=a.scope, replaces=a.replaces)
    return emit({"id": key, "item": a.item})


def cmd_retire(a, repo):
    with locked(repo):
        if a.id not in [r["id"] for r in decisions(ledger(repo))]:
            return deny("decision-unknown")
        append(repo, "retire", id=a.id, why=a.why)
    return emit({"retired": a.id})


def cmd_decisions(a, repo):
    # A one-time answer settled its own item and is not a precedent.
    return emit({"decisions": [r for r in decisions(ledger(repo)) if r["scope"] == "future"]})


def cmd_digest(a, repo):
    cutoff = now() - timedelta(hours=a.hours)
    rows = [r for r in ledger(repo) if parse_iso(r["at"]) > cutoff]
    return emit({"since": iso(cutoff),
                 **{k: [r for r in rows if r["event"] == k] for k in ("run", "job", "land", "rejected", "close", "update", "answer")},
                 "skills": {r["job"]: r["via"] for r in rows if r["event"] == "adopt" and r.get("via")},
                 # Guards changed without a person, told afterward.
                 "guards": [r for r in rows if r["event"] == "receipt" and r.get("kind") == "guard" and r["ok"]],
                 "parked": sorted(parked(rows).values(), key=lambda r: r["at"])})


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)

    def add(name, fn, token=True, dry=False):
        p = sub.add_parser(name)
        p.set_defaults(fn=fn, dry_run=False, token=None)
        if token:
            p.add_argument("--token")
        if dry:
            p.add_argument("--dry-run", action="store_true")
        return p

    def subject(p):
        g = p.add_mutually_exclusive_group(required=True)
        g.add_argument("--pr", type=int)
        g.add_argument("--sha")

    add("policy", cmd_policy, token=False)
    add("begin", cmd_begin, token=False, dry=True)
    add("end", cmd_end)
    add("heartbeat", cmd_heartbeat)
    add("observe", cmd_observe, token=False)
    p = add("job", cmd_job)
    p.add_argument("--motion", required=True, choices=MOTIONS)
    p.add_argument("--origin")
    p.add_argument("--what", required=True)
    p.add_argument("--opens-pr", action="store_true")
    p = add("adopt", cmd_adopt)
    p.add_argument("--job", required=True)
    subject(p)
    p.add_argument("--head", help="the PR head the worker reported; required with --pr")
    p.add_argument("--via", action="append", default=[], help="each skill the work went through, from the session that ran it")
    p = add("job-end", cmd_job_end)
    p.add_argument("--job", required=True)
    p.add_argument("--why", required=True)
    add("worker", cmd_worker).add_argument("--what", required=True)
    add("worker-end", cmd_worker_end).add_argument("--worker", required=True)
    p = add("test", cmd_test, dry=True)
    subject(p)
    p.add_argument("--timeout", type=int, default=3600)
    p = add("turn", cmd_turn, token=False)
    p.add_argument("--run", required=True)
    p.add_argument("--timeout", type=int, default=1200)
    p = add("check", cmd_check, token=False)
    p.add_argument("--run", action="append", required=True)
    p.add_argument("--timeout", type=int, default=3600)
    subject(add("review", cmd_review, dry=True))
    p = add("guard", cmd_guard)
    subject(p)
    p.add_argument("--file", required=True)
    p.add_argument("--timeout", type=int, default=3600)
    p = add("rule", cmd_rule)
    subject(p)
    p.add_argument("--rule", required=True, action="append", help="repeat for rules that one reason covers")
    p.add_argument("--head", required=True)
    p.add_argument("--verdict", required=True, choices=["pass", "fail"])
    p.add_argument("--why", required=True)
    for name, fn in (("gate", cmd_gate), ("update", cmd_update), ("land", cmd_land)):
        p = add(name, fn, token=name != "gate", dry=name != "gate")
        p.add_argument("--pr", type=int, required=True)
        if name == "land":
            p.add_argument("--head", required=True)
    p = add("direct", cmd_direct, dry=True)
    p.add_argument("--sha", required=True)
    p.add_argument("--job", required=True)
    p = add("close", cmd_close, dry=True)
    p.add_argument("--kind", required=True, choices=["issue", "pr"])
    p.add_argument("--number", type=int, required=True)
    p.add_argument("--as", required=True, choices=["fixed", "duplicate", "replaced"])
    p.add_argument("--evidence", required=True, help="commit:<sha>, pr:<n> or issue:<n>")
    p.add_argument("--comment", required=True)
    p = add("park", cmd_park)
    p.add_argument("--item", required=True)
    p.add_argument("--updated", help="updatedAt of the pr or issue as this run read it")
    p.add_argument("--why", required=True)
    p.add_argument("--recommend", required=True)
    p.add_argument("--needs", required=True, choices=["authority", "access", "fact", "later"],
                   help="what only a person can supply; later: unfinished work the next run continues")
    p.add_argument("--tried", required=True, help="how this run tried to settle it, and what that showed")
    p = add("answer", cmd_answer, token=False)
    p.add_argument("--item", required=True)
    p.add_argument("--situation", required=True)
    p.add_argument("--option", action="append", default=[])
    p.add_argument("--choice", required=True)
    p.add_argument("--reason")
    p.add_argument("--reason-from", required=True, choices=["stated", "confirmed", "none"])
    p.add_argument("--scope", required=True, choices=["once", "future"])
    p.add_argument("--replaces")
    p = add("retire", cmd_retire, token=False)
    p.add_argument("--id", required=True)
    p.add_argument("--why", required=True)
    add("decisions", cmd_decisions, token=False)
    add("digest", cmd_digest, token=False).add_argument("--hours", type=int, default=24)

    a = ap.parse_args()
    try:
        return a.fn(a, Repo())
    except (Failure, OSError, KeyError, TypeError, ValueError, AttributeError) as e:
        return emit({"allowed": False, "reasons": ["unreadable"], "error": f"{type(e).__name__}: {e}"}, 3)


if __name__ == "__main__":
    sys.exit(main())
