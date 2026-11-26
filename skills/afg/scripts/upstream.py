"""Work in a fork of a project this account does not maintain.

autonomous.py runs this and hands itself in as `core`. Nothing here publishes: it reads, or writes the store.
"""
import base64
import hashlib
import json
import os
import re
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import unicodedata
import urllib.parse
from datetime import timedelta

MOTIONS = ["tend", "bugs"]
LOCAL = ".compound-engineering/config.local.yaml"
STORE = ".context/compound-engineering/afg"
# Everything else is refused, so a landing command added later is refused too.
ALLOWED = {"policy", "begin", "end", "clean", "heartbeat", "observe", "job", "job-end", "adopt", "worker", "worker-end", "room", "test",
           "turn", "check", "review", "rule", "park", "answer", "retire", "decisions", "digest",
           "upstream", "rules", "search", "judge", "reproduce", "ready", "verdict"}
RULE_FILE = re.compile(
    r"^((\.github|docs)/)?(contributing|security|code_of_conduct|(ai|llm)[-_]\w+|dco|cla|governance|pull_request_template)"
    r"([-_][\w-]+)?((\.[a-z]{2}(-\w+)?)?\.(md|markdown|txt|rst|adoc))?$|"
    r"^((\.github|docs)/)?(pull_request_template|contributing)/[^/]+$|^(agents|claude|gemini)\.md$|^\.cursorrules$|^\.cursor/rules/|"
    r"^\.github/copilot-instructions\.md$|^\.(overcommit|lefthook|pre-commit-config)\.ya?ml$|^lefthook\.ya?ml$|"
    r"(^|/)(\.husky|\.githooks|hooks)/(pre-commit|pre-push|commit-msg)$", re.I)
TEMPLATE = re.compile(r"(^|[/:])pull_request_template(\.(md|txt))?$|(^|/)pull_request_template/[^/]+\.(md|txt)$", re.I)
# A reading that asks nothing of the contributor needs its reason.
LAX = {"sign_off": {"none"}, "cla": {"none"}, "ai": {"unstated", "welcome"}, "first": {"pr"}, "model": {"none"}}
VALUES = {"sign_off": {"none", "required"}, "cla": {"none", "required"},
          "ai": {"unstated", "welcome", "disclose", "forbidden"}, "first": {"pr", "issue"}, "model": {"none", "asked"}}
SECURITY = re.compile(r"\bCVE-|vulnerab|\bexploit|security (issue|bug|problem|fix|hole|flaw)|(sql|command|code|shell|html|header|log|template)[- ]injection|\bXSS\b|\bCSRF\b|\bSSRF\b|\bRCE\b|"
                      r"code execution|path traversal|privilege escalation|auth\w* bypass|buffer overflow|use[- ]after[- ]free|"
                      r"denial of service|\bleak\w* (secret|credential|token|key)|out[- ]of[- ]bounds", re.I)
PRIVATE = re.compile(r"/Users/|/home/\w|\\Users\\|/private/|/var/folders/|/tmp/|(?<!\w)~/|\.context/|config\.local|\bautonomous_\w+")
DOCS = re.compile(r"\.(md|markdown|rst|adoc)$", re.I)
# A reader's no to these is about the work, whatever commit or words it comes back in.
WORK_NO = {"is_fix", "not_a_duplicate", "security"}
MARK, OPEN = "afg.upstream", 3
SEARCH_FRESH = timedelta(hours=24)


# --- who owns what ------------------------------------------------------------

def local_text(repo):
    """The owner's local file, or None when it is there and cannot be read."""
    path = os.path.join(repo.main, LOCAL) if repo.main else ""
    if not path or not os.path.lexists(path):
        # A folder that is a broken link hides a file that may be there.
        folder = os.path.dirname(path)
        return None if path and os.path.islink(folder) and not os.path.exists(folder) else ""
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except (OSError, ValueError):
        return None


def unread(core, text):
    """The first autonomous setting here that the parser would pass over, or None. Settings run only when all of them are understood."""
    top = empty = None
    for line in map(core.strip_comment, text.lstrip("\ufeff").splitlines()):
        body = line.strip()
        if not body:
            continue
        if not line[:1].isspace() and body[0] != "-":
            m = re.match(r"(autonomous_\w+)\s*:(.*)$", line)
            top, empty = m and m[1], m and not m[2].strip() and core.KEYS.get(m[1]) not in ("list", "maps")
            if not m and re.match(r"[\W_]*autonomous|\{.*autonomous", line, re.I):
                return line
        elif top and empty or not top and re.match(r"[\W_]*autonomous", body, re.I):
            # A value the parser expected on its key's own line, or a key where it looks for none.
            return line
        elif re.match(r"autonomous_\w+\s*:", body):
            return line
    return None


def wanted(core, repo):
    """This checkout is set to upstream, has begun there once, or has settings nobody can read. Anything else malformed is inactive."""
    text = local_text(repo)
    if text is None or core.git("config", "--local", "--get", MARK, check=False).stdout.strip():
        return True
    return re.search(r"^\ufeff?autonomous_landing[ \t]*:[ \t]*['\"]?upstream\b", text, re.M) is not None


def mark(core, repo):
    """In git's own settings, which no pull, clean or commit of the project can change."""
    core.git("config", "--local", MARK, repo.upstream["parent"])
    # What this keeps in the checkout must never reach one of the project's commits.
    path = os.path.join(repo.common, "info", "exclude")
    text = ""
    if os.path.exists(path):
        with open(path, encoding="utf-8", errors="surrogateescape") as f:
            text = f.read()
    missing = [x for x in (f"/{STORE}/", f"/{LOCAL}") if x not in text.splitlines()]
    if missing:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "a", encoding="utf-8") as f:
            f.write(("\n" if text and not text.endswith("\n") else "") + "\n".join(missing) + "\n")


def facts(core, repo):
    """The fork and its parent, or the problem that keeps this mode off."""
    if local_text(repo) is None:
        return {"problem": "upstream-settings-unreadable", "detail": f"{LOCAL} cannot be read"}
    def opens_as(name):
        # What a file system that folds names would open it as.
        return unicodedata.normalize("NFKC", unicodedata.normalize("NFKC", name).casefold())
    tops = [os.path.dirname(LOCAL), STORE.split("/")[0]]
    listed = [(meta, opens_as(name)) for meta, _, name in (x.partition("\t") for x in core.git("ls-files", "-s", "-z", cwd=repo.main).stdout.split("\0") if x)]
    links = [x for x in (tops[0], LOCAL) if os.path.islink(os.path.join(repo.main, x))]
    if links or any(name.split("/")[0] in tops and (meta[:6] in ("120000", "160000") or name == LOCAL or (name + "/").startswith(STORE + "/")) for meta, name in listed):
        return {"problem": "upstream-settings-tracked", "detail": "the settings or the store are tracked files, so the project could write them"}
    url = core.git("config", "--get", "remote.origin.url", check=False).stdout.strip()
    m = re.search(r"^(?:[a-z+]+://)?(?:[^@/]+@)?([^/:]+)(?::\d+)?[:/]([^/:]+/[^/]+?)(?:\.git)?/?$", url)
    if not m:
        return {"problem": "upstream-origin-unreadable", "detail": "origin is not a GitHub repository URL"}
    if m[1] not in ("github.com", "ssh.github.com") and ("." in m[1] or "github" not in m[1].lower()):
        return {"problem": "upstream-origin-unreadable", "detail": f"facts come from github.com, and origin is on {m[1]}"}
    fork = core.gh_json("api", f"repos/{m[2]}")
    if fork["full_name"].lower() != m[2].lower():
        raise core.Failure(f"origin is {m[2]} but GitHub answered for {fork['full_name']}")
    if fork.get("fork") is not True or not fork.get("parent"):
        return {"problem": "upstream-not-a-fork", "detail": f"{fork['full_name']} is not a fork"}
    parent = core.gh_json("api", f"repos/{fork['parent']['full_name']}")
    if parent["full_name"].lower() != fork["parent"]["full_name"].lower():
        raise core.Failure("the parent repository moved")
    owner = fork["full_name"].split("/")[0]
    if owner.lower() != repo.login or fork["permissions"].get("push") is not True:
        return {"problem": "upstream-fork-not-yours", "detail": f"{fork['full_name']} is not {repo.login}'s own fork"}
    rights = {k: parent["permissions"].get(k) is True for k in ("admin", "maintain", "push", "triage")}
    if rights["admin"] or rights["maintain"] or rights["push"]:
        return {"problem": "upstream-is-yours", "detail": f"this account can push to {parent['full_name']}; use another landing route"}
    if parent.get("archived") is not False:
        return {"problem": "upstream-archived", "detail": f"{parent['full_name']} takes no changes"}
    return {"fork": fork["full_name"],
            "parent": parent["full_name"], "parent_default": parent["default_branch"], "permissions": rights, "has_issues": parent.get("has_issues") is not False,
            # The same transport and credentials as origin, with only the name changed.
            "parent_url": url[:m.start(2)] + parent["full_name"] + url[m.end(2):], "parent_is_fork": parent.get("fork") is True}


def readable(args):
    """A GitHub call that cannot change anything."""
    if args[:2] in (("pr", "list"), ("pr", "view"), ("issue", "list"), ("issue", "view"), ("repo", "view")):
        return True
    # An address and nothing else. A flag can make gh write, alone or bundled with another.
    return len(args) == 2 and args[0] == "api" and not args[1].startswith("-") and args[1] != "graphql"


def refuse(a):
    if a.cmd not in ALLOWED:
        return ["upstream-mode"]
    # Other people's code is never adopted, run or judged here.
    return ["upstream-mode"] if a.cmd in ("adopt", "test", "review", "rule") and a.pr is not None else []


def keep(repo):
    return {"tip": repo.tip(), "tip_of": [repo.upstream["parent"], repo.default]}


def kept_tip(core, repo):
    """The parent's tip this run began with. A busy project moves faster than its own gate runs, and nothing lands from here.

    From the run's own state: code under test can move a ref.
    """
    state = core.read_state(repo)
    tip = state.get("tip")
    if repo.beginning or not state.get("token") or state.get("tip_of") != [repo.upstream["parent"], repo.default]:
        return None
    try:
        if core.parse_iso(state["at"]) + core.LEASE_TTL < core.now():
            return None
    except (KeyError, TypeError, ValueError, AttributeError, OverflowError):
        return None
    if not isinstance(tip, str) or not core.SHA.match(tip) or core.git("cat-file", "-e", f"{tip}^{{commit}}", check=False).returncode != 0:
        return None
    # Work starts from this name.
    ref = f"refs/afg/parent/{repo.default}"
    plain(core, ref)
    if core.git("rev-parse", "--verify", "--quiet", ref, check=False).stdout.strip() != tip:
        core.git("update-ref", "--no-deref", ref, tip)
    return tip


def plain(core, ref):
    """A name that points at another name would move that one, such as the owner's branch."""
    if core.git("symbolic-ref", "--quiet", ref, check=False).returncode == 0:
        core.git("update-ref", "--no-deref", "-d", ref)


def moved(core, repo, base, sha):
    """What the parent did since makes this change empty or unable to apply."""
    live = live_tip(core, repo)
    if live == base:
        return []
    if core.git("merge-base", "--is-ancestor", base, live, check=False).returncode != 0:
        return ["parent-rewritten"]
    r = core.git("merge-tree", "--write-tree", live, sha, check=False)
    if r.returncode not in (0, 1):
        raise core.Failure(f"merge-tree: {r.stderr.strip()}")
    if r.returncode == 1:
        return ["parent-conflicts"]
    tree = r.stdout.split("\n")[0].strip()
    left = [n for n in core.git("diff", "--name-only", "--no-renames", "-z", live, tree).stdout.split("\0") if n]
    # A fix always brings a test of its own, so one the parent made itself leaves only that.
    tests_only = all(core.TEST_FILE.search(n) for n in changed_files(core, base, sha))
    return ["already-fixed"] if not left or not tests_only and all(core.TEST_FILE.search(n) for n in left) else []


def live_tip(core, repo):
    """The parent's tip now, where its rules are read from."""
    if getattr(repo, "live", None) is None:
        ref = f"refs/afg/live/{repo.default}"
        plain(core, ref)
        core.git("fetch", "--quiet", "--no-tags", repo.upstream["parent_url"], f"+refs/heads/{repo.default}:{ref}")
        repo.live = core.git("rev-parse", ref).stdout.strip()
    return repo.live


def settings(core, mine):
    """This mode's policy from the local file alone, or why it is malformed."""
    if mine.get("autonomous_landing") != "upstream":
        raise ValueError("config.local.yaml: autonomous_landing: upstream is not set in plain form")
    p = {**core.DEFAULTS, "autonomous_motions": MOTIONS, "autonomous_upstream_open": OPEN, **mine}
    # Nobody else's work is run or landed here.
    p["autonomous_trusted_authors"] = p["autonomous_babysit_authors"] = []
    return p


# --- the project's own rules ----------------------------------------------------

def blob_at(core, tip, path):
    """A rule file's text at the tip. A link to a folder is the text of every file in it."""
    at = resolved(core, tip, path)
    rows = [x.partition("\t")[0].split(" ") for x in core.git("ls-tree", "-r", "-z", "--full-tree", tip, "--", f":(top,literal){at}").stdout.split("\0") if x]
    if not rows:
        raise core.Failure(f"the rule file {path} cannot be read")
    return "\n".join(core.git("cat-file", "blob", oid).stdout.replace("\r\n", "\n") for mode, kind, oid in rows if kind == "blob")


def resolved(core, tip, path, hops=20):
    """Where a path leads at the tip, through linked files and folders inside the tree."""
    at = ""
    parts = path.split("/")
    while parts:
        at = os.path.normpath(os.path.join(at, parts.pop(0)))
        row = core.git("ls-tree", "-z", "--full-tree", tip, "--", f":(top,literal){at}").stdout.split("\0")[0]
        if row.startswith("120000 "):
            to = core.git("cat-file", "blob", row.split("\t")[0].split(" ")[2]).stdout
            at = os.path.normpath(os.path.join(os.path.dirname(at), to))
            if os.path.isabs(to) or at.startswith("..") or not hops:
                raise core.Failure(f"the rule file {path} points outside the project")
            return resolved(core, tip, "/".join([at, *parts]), hops - 1)
    return at


def rule_files(core, repo):
    """[(path, text)] for every file that says how to contribute, at the parent's tip or inherited from its organization."""
    up, tip = repo.upstream, live_tip(core, repo)
    names = [n for n in core.git("ls-tree", "-r", "-z", "--full-tree", "--name-only", tip).stdout.split("\0") if n and RULE_FILE.search(n)]
    out = [(n, blob_at(core, tip, n)) for n in names]
    try:
        profile = core.gh_json("api", f"repos/{up['parent']}/community/profile").get("files") or {}
    except core.Failure as e:
        # GitHub keeps no profile for a fork.
        if not up["parent_is_fork"] or "404" not in str(e):
            raise
        profile = {}
    for key in ("contributing", "pull_request_template"):
        # GitHub sends a link, so a link outside the parent is an organization's default.
        link = (profile.get(key) or {}).get("url") or ""
        where = re.search(r"repos/([^/]+/[^/]+)/contents/([^?]+)", link)
        if where and where[1].lower() != up["parent"].lower():
            d = core.gh_json("api", f"repos/{where[1]}/contents/{where[2]}")
            out.append((f"{where[1]}:{where[2]}", base64.b64decode(d["content"]).decode("utf-8", "replace").replace("\r\n", "\n")))
    return out


def digest_of(files):
    return hashlib.sha256(json.dumps(sorted(files)).encode("utf-8", "surrogateescape")).hexdigest()


def recorded_rules(core, repo, rows):
    """The latest record, and why it does not count."""
    last = next((r for r in reversed(rows) if r["event"] == "upstream-rules"), None)
    if last is None:
        return None, ["rules-unread"]
    if last["parent"] != repo.upstream["parent"] or last["digest"] != digest_of(rule_files(core, repo)):
        return None, ["rules-stale"]
    return last, ["ai-not-welcome"] if last["ai"] == "forbidden" else []


def stdin_json(core):
    try:
        d = json.loads(sys.stdin.buffer.read().decode("utf-8"))
    except (ValueError, RecursionError):
        return None
    return d if isinstance(d, dict) else None


def active(core, repo):
    policy = core.load_policy(repo)
    return policy, ([policy["reason"]] if not policy["active"] else [] if policy["autonomous_landing"] == "upstream" else ["not-upstream"])


def cmd_upstream(core, a, repo):
    policy, why = active(core, repo)
    if why:
        return core.deny(*why, detail=policy.get("detail"))
    rows, files = core.ledger(repo), rule_files(core, repo)
    mine = own_prs(core, repo)
    return core.emit({**{k: v for k, v in repo.upstream.items() if k != "parent_url"}, "tip": repo.tip(), "rule_files": [p for p, _ in files],
                      "rules_at": live_tip(core, repo), "rules_digest": digest_of(files), "rules": recorded_rules(core, repo, rows)[1] or "recorded", "open": len(mine), "open_limit": policy["autonomous_upstream_open"],
                      "prepared": waiting(core, repo, rows), "tend_only": tend_only(core, repo, policy, rows, mine)})


def cmd_rules(core, a, repo):
    policy, why = active(core, repo)
    d = stdin_json(core)
    if why or d is None:
        return core.deny(*(why or ["rules-unreadable"]))
    files = rule_files(core, repo)
    if d.get("digest") != digest_of(files):
        # What was read is not what would be recorded.
        return core.deny("rules-moved")
    because = d.get("because") or {}
    if any(d.get(k) not in v for k, v in VALUES.items()) or not isinstance(because, dict) \
            or not all(isinstance(d.get(k), list) and all(isinstance(x, str) for x in d[k]) for k in ("gate", "read")) \
            or not isinstance(d.get("scope"), str):
        return core.deny("rules-unreadable")
    unread = [p for p, _ in files if p not in d["read"]]
    if unread:
        return core.deny("rules-unread", unread=unread)
    unexplained = [k for k in LAX if d[k] in LAX[k] and len(str(because.get(k) or "").strip()) < 20]
    if unexplained:
        return core.deny("rules-unexplained", keys=unexplained)
    missing = [g for g in d["gate"] if not any(proves(c["run"], g) for c in policy["autonomous_checks"])]
    if missing:
        # What the project requires is what this machine must run, so the owner saves it as a check.
        return core.deny("gate-not-a-check", missing=missing)
    with core.locked(repo):
        core.require_lease(repo, a.token)
        core.append(repo, "upstream-rules", parent=repo.upstream["parent"], digest=digest_of(files), because=because,
                    **{k: d[k] for k in (*VALUES, "gate", "read", "scope")})
    return core.emit({"recorded": repo.upstream["parent"]})


# --- counts ---------------------------------------------------------------------

def own_prs(core, repo, query="state=open", since=None):
    """This account's PRs there, from the listing that shows a PR at once. A search by author lags behind."""
    out = []
    for page in range(1, 31):
        rows = core.gh_json("api", f"repos/{repo.name}/pulls?{query}&sort=created&direction=desc&per_page=100&page={page}")
        for p in rows:
            if core.canonical(p.get("user") or {}) == repo.login:
                out.append({"number": p["number"], "title": p["title"], "url": p["html_url"], "isDraft": p["draft"], "createdAt": p["created_at"],
                            "updatedAt": p["updated_at"], "headRefOid": p["head"]["sha"], "headRefName": p["head"]["ref"], "headOwner": ((p["head"].get("user") or {}).get("login") or "").lower()})
        if len(rows) < 100 or since and core.parse_iso(rows[-1]["created_at"]) <= since:
            return [p for p in out if not since or core.parse_iso(p["createdAt"]) > since]
    raise core.Failure("too many PRs to count")


def refusal(rows, job, same=()):
    """Why a reader or a security draft refused this job, another with the same issue, or one in `same`."""
    origins = {r["job"]: r.get("origin") for r in rows if r["event"] == "job"}
    for r in rows:
        why = "verdict-no" if r["event"] == "upstream-verdict" and set(r["no"]) & WORK_NO \
            else "security-draft" if r["event"] == "upstream-ready" and r["kind"] == "security" else None
        if why and (r["job"] == job or r["job"] in same or (origins.get(job) or "").startswith("issue:") and origins[job] == origins.get(r["job"])):
            return [why]
    return []


def touching(core, rows, base, sha, same):
    """Other jobs whose commits made the same change, or touched the same files."""
    mine, names, out = core.change_of(base, sha), changed_files(core, base, sha), set()
    for r in rows:
        if r["event"] == "adopt" and r.get("sha") and core.git("cat-file", "-e", r["sha"], check=False).returncode == 0:
            if core.change_of(base, r["sha"]) == mine if same else names & changed_files(core, base, r["sha"]):
                out.add(r["job"])
    return out


def prepared(core, rows, heads=()):
    """Finished branches the owner has neither opened nor decided on."""
    last = {r["job"]: r for r in rows if r["event"] == "upstream-ready" and r["kind"] in ("fix", "docs")}
    ended = {r["job"] for r in rows if r["event"] == "job-end"}
    decided = {r["item"] for r in core.decisions(rows)}
    return [{**{k: r[k] for k in ("job", "sha", "title", "file", "at")}, "confirmed": verdict_of(rows, r) is True}
            for r in last.values() if r["job"] not in ended and r["sha"] not in heads and f"commit:{r['sha']}" not in decided
            and not refusal(rows, r["job"]) and not core.job_landed(rows, r["job"])]


def waiting(core, repo, rows):
    """The same, without those the owner has opened a PR from. Confirmed only under the project's rules as they are now."""
    first = min((core.parse_iso(p["at"]) for p in prepared(core, rows)), default=None)
    if first is None:
        return []
    fine = not recorded_rules(core, repo, rows)[1]
    out = prepared(core, rows, {p["headRefOid"] for p in own_prs(core, repo, "state=all", first)})
    base, tip = {r["sha"]: r.get("base") for r in rows if r["event"] == "upstream-ready"}, live_tip(core, repo)
    out = [{**p, "parent": moved(core, repo, base[p["sha"]], p["sha"])} for p in out]
    return [{**p, "confirmed": p["confirmed"] and fine and not p["parent"], "behind": base[p["sha"]] != tip} for p in out]


def tend_only(core, repo, policy, rows, mine=None):
    limit = policy.get("autonomous_upstream_open", OPEN)
    mine = own_prs(core, repo) if mine is None else mine
    return (["tend-only"] if len(mine) > limit else []) + (["prepared-waiting"] if len(waiting(core, repo, rows)) >= max(limit, 1) else [])


def job_reasons(core, repo, policy, rows, a):
    if a.opens_pr:
        return ["upstream-mode"]
    _, why = recorded_rules(core, repo, rows)
    origin = a.origin or "internal"
    if origin.startswith("issue:"):
        why = why + [x for r in rows if r["event"] == "job" and r.get("origin") == origin for x in refusal(rows, r["job"])][:1]
    if a.motion == "tend":
        kind, _, number = (a.origin or "").partition(":")
        return why + ([] if kind == "pr" and number in {str(p["number"]) for p in own_prs(core, repo)} else ["not-your-pr"])
    return why + tend_only(core, repo, policy, rows)


def beside(core, repo, sha):
    """Heads of this account's open PRs that this commit builds on. Their commits are published already."""
    return [p["headRefOid"] for p in own_prs(core, repo) if p["headOwner"] == repo.login
            and core.SHA.match(p["headRefOid"]) and core.git("merge-base", "--is-ancestor", p["headRefOid"], sha, check=False).returncode == 0]


def failing_at(core, repo, sha):
    """Checks that ran and failed. One that waits for a maintainer's approval says nothing yet."""
    runs = core.gh_json("api", f"repos/{repo.name}/commits/{sha}/check-runs?per_page=100")["check_runs"]
    stats = core.gh_json("api", f"repos/{repo.name}/commits/{sha}/status?per_page=100")["statuses"]
    return sorted({c["name"] for c in runs if c.get("conclusion") in ("failure", "timed_out", "startup_failure")}
                  | {c["context"] for c in stats if c.get("state") in ("failure", "error")})


def observe(core, repo, policy, rows):
    """Own open PRs first, each with what it waits for, then the project's open issues."""
    park, mine = core.parked(rows), own_prs(core, repo)

    def quiet(item, updated):
        p = park.get(item)
        return bool(p and p.get("needs") != "later" and p.get("updated") == updated
                    and core.parse_iso(p["at"]) > core.now() - timedelta(days=core.PARK_DAYS))
    for p in mine:
        p.update(core.gh_json("pr", "view", str(p["number"]), "-R", repo.name, "--json", "mergeable,reviewDecision"))
        p["failing"], p["parked"] = failing_at(core, repo, p["headRefOid"]), quiet(f"pr:{p['number']}", p["updatedAt"])
        p["attention"] = [x for x, on in (("conflict", p["mergeable"] == "CONFLICTING"), ("checks-failing", bool(p["failing"])),
                                          ("changes-requested", p["reviewDecision"] == "CHANGES_REQUESTED")) if on]
    issues = core.gh_json("issue", "list", "-R", repo.name, "--state", "open", "--limit", "200", "--json",
                          "number,title,author,updatedAt,labels") if repo.upstream["has_issues"] else []
    for i in issues:
        i["author"], i["parked"] = core.canonical(i["author"]), quiet(f"issue:{i['number']}", i["updatedAt"])
    return core.emit({"repo": repo.name, "default_branch": repo.default, "tip": repo.tip(), "own_prs": mine, "issues": issues,
                      "prepared": waiting(core, repo, rows), "tend_only": tend_only(core, repo, policy, rows, mine),
                      "parked_other": [r for k, r in park.items() if not k.startswith(("pr:", "issue:"))], "truncated": len(issues) >= 200})


# --- duplicates -----------------------------------------------------------------

def changed_files(core, base, sha):
    mb = core.git("merge-base", base, sha).stdout.strip()
    return {n for n in core.git("diff", "--name-only", "--no-renames", "-z", mb, sha).stdout.split("\0") if n}


def found(core, repo, terms, files):
    """Every issue and PR, open or closed, that a term finds, and every open PR that touches the same files."""
    hits = {}
    for term in terms:
        for kind in ("issue", "pr"):
            q = urllib.parse.quote(f"repo:{repo.name} is:{kind} {term}", safe="")
            d = core.gh_json("api", f"search/issues?q={q}&per_page=100")
            if d.get("incomplete_results") is not False:
                raise core.Failure("the duplicate search was incomplete")
            if d["total_count"] > len(d["items"]):
                return None, term
            for x in d["items"]:
                merged = (x.get("pull_request") or {}).get("merged_at")
                hits[x["number"]] = {"number": x["number"], "title": x["title"], "state": x["state"], "kind": "pr" if "pull_request" in x else "issue",
                                     "rejected": x["state"] == "closed" and (not merged if "pull_request" in x else x.get("state_reason") == "not_planned")}
    if files:
        prs = core.gh_json("pr", "list", "-R", repo.name, "--state", "open", "--limit", "500", "--json", "number,title,files")
        # Newest first. An older one is for the terms to find.
        for p in prs:
            # GitHub lists at most a hundred files, so a full list may hide one.
            if len(p["files"]) >= 100 or files & {f["path"] for f in p["files"]}:
                hits.setdefault(p["number"], {"number": p["number"], "title": p["title"], "state": "open", "kind": "pr", "rejected": False})
    return hits, None


def job_sha(core, rows, job):
    return next((r["sha"] for r in reversed(rows) if r["event"] == "adopt" and r["job"] == job and r.get("sha")), None)


def judged(rows, job):
    """The word on each hit. Once one is the same, that stays, and what was turned down stays so for every job."""
    out = {}
    for r in rows:
        if r["event"] == "upstream-judge" and (r["job"] == job or r["is"] == "same" and r["rejected"]) and out.get(r["number"], {}).get("is") != "same":
            out[r["number"]] = r
    return out


def duplicate_reasons(core, repo, rows, job, sha):
    last = next((r for r in reversed(rows) if r["event"] == "upstream-search" and r["job"] == job), None)
    if last is None or core.parse_iso(last["at"]) < core.now() - SEARCH_FRESH:
        return ["search-missing"], []
    hits, wide = found(core, repo, last["terms"], changed_files(core, repo.tip(), sha))
    if wide:
        return ["search-too-wide"], []
    known = judged(rows, job)
    out = {"duplicate" for n, v in known.items() if v["is"] == "same" and (v["job"] == job or n in hits)}
    origin = (core.job_of(rows, job) or {}).get("origin")
    for n, h in hits.items():
        k = known.get(n)
        if k is None:
            out.add("duplicate-unjudged")
        elif k["is"] == "answers" and (h["kind"] != "issue" or h["state"] != "open" or origin != f"issue:{n}"):
            out.add("duplicate")
    return sorted(out), [h for n, h in hits.items() if n not in known]


def cmd_search(core, a, repo):
    policy, why = active(core, repo)
    if why:
        return core.deny(*why)
    terms = sorted({t.strip() for t in a.term if t.strip()})
    # A qualifier or an operator could narrow a search until it finds nothing.
    if len(terms) < 2 or any(len(t) < 4 or re.search(r"[:\"()]|\b(NOT|OR|AND)\b|(^|\s)-", t) for t in terms):
        return core.deny("search-terms")
    rows = core.ledger(repo)
    if not core.job_of(rows, a.job):
        return core.deny("job-missing")
    sha = job_sha(core, rows, a.job)
    hits, wide = found(core, repo, terms, changed_files(core, repo.tip(), sha) if sha else set())
    if wide:
        return core.deny("search-too-wide", term=wide)
    with core.locked(repo):
        core.require_lease(repo, a.token)
        core.append(repo, "upstream-search", job=a.job, terms=terms, hits=sorted(hits), rejected=sorted(n for n, h in hits.items() if h["rejected"]))
    known = judged(rows, a.job)
    return core.emit({"hits": [{**h, "is": known.get(n, {}).get("is")} for n, h in sorted(hits.items())]})


def cmd_judge(core, a, repo):
    policy, why = active(core, repo)
    if why:
        return core.deny(*why)
    if len(a.why.strip()) < 20:
        return core.deny("why-missing")
    with core.locked(repo):
        core.require_lease(repo, a.token)
        rows = core.ledger(repo)
        seen = [r for r in rows if r["event"] == "upstream-search" and r["job"] == a.job]
        if not set(a.number) <= {n for r in seen for n in r["hits"]}:
            return core.deny("hit-unknown")
        for n in a.number:
            core.append(repo, "upstream-judge", job=a.job, number=n, why=a.why, rejected=any(n in r["rejected"] for r in seen), **{"is": getattr(a, "is")})
    return core.emit({"judged": a.number})


# --- proof ----------------------------------------------------------------------

def proves(ran, wanted_command):
    """This command ran as part of that one, and that one could only pass if it did."""
    if ran.strip() == wanted_command.strip():
        return True
    return not re.search(r"\|\||[;|\n#]|(?<!&)&(?!&)|(^|&)\s*(cd|exit|exec)\b", ran) and wanted_command.strip() in [x.strip() for x in ran.split("&&")]


def passed_commands(core, policy, rows, sha, base):
    r = core.receipt(rows, f"direct:{sha}", sha, base, "test", checks=core.checks_id(policy))
    return [x["run"] for x in r["ran"] if x["exit"] == 0] if r and r["ok"] else []


def docs_only(core, base, sha):
    names = changed_files(core, base, sha)
    return bool(names) and all(DOCS.search(n) for n in names)


def names_model(text):
    """Crediting a tool takes neither a number nor this word. Which tools are models is for the reader to see."""
    return re.search(r"\d|\bmodels?\b", re.sub(r"<[^>]*>|https?://\S+", "", text), re.I) is not None


def message_reasons(core, base, sha, origin, but=()):
    text = core.git("log", "--format=%B", f"{base}..{sha}", *[f"^{x}" for x in but]).stdout
    out = text_reasons(text, origin)
    if re.search(r"^signed-off-by:", text, re.I | re.M):
        # Only a person can certify where a change came from.
        out.append("sign-off-is-the-owners")
    if not but and re.search(r"^(feat|refactor|perf|style)(\(.*\))?!?:", text, re.I | re.M):
        out.append("not-a-fix")
    return out


def calls_out(text, number=None):
    """Who and what a text would notify or link, whatever the formatting around it."""
    out = ["mentions-someone"] if re.search(r"(?<![A-Za-z0-9])@\w", text) else []
    refs = set(re.findall(r"#(\d+)", text)) | {"other" for _ in re.findall(
        r"[\w.-]+/[\w.-]+#\d+|(?<![A-Za-z0-9])GH-\d+|github\.com/[^\s)]+/(?:issues|pull|discussions|commit)/", text, re.I)}
    return out + (["refers-elsewhere"] if refs - {number} else [])


def text_reasons(text, origin):
    out = calls_out(text, origin.partition(":")[2] if (origin or "").startswith("issue:") else None)
    if PRIVATE.search(text) or os.path.expanduser("~") in text:
        out.append("private-text")
    if SECURITY.search(text):
        out.append("looks-like-security")
    if any(names_model(x) for x in re.findall(r"^.*\b(?:co-authored|assisted|generated|written|made|created)[- ](?:by|with|using)\b.*$", text, re.I | re.M)):
        out.append("names-a-model")
    return out


def lines_of(text):
    return [re.sub(r"\[[xX]\]", "[ ]", x.strip()) for x in text.split("\n")]


def body_reasons(body, template, told, origin):
    """Why this body may not be kept. It holds the template's headings and boxes, every box open, and says AI was used in a line of its own."""
    asked = re.sub(r"<!--.*?(-->|\Z)", "", template, flags=re.S)
    shape = r"^(#{1,6}\s|(?:>\s*)*(?:[-*+]|\d+[.)])\s+\[[ xX]\])"
    have = iter(lines_of(body))
    out = [] if all(x in have for x in lines_of(asked) if re.match(shape, x)) else ["template-missing"]
    if not isinstance(told, str) or len(told.strip()) < 10 or not told[0].isalpha() or told.strip() not in [x.strip() for x in body.split("\n")]:
        out.append("disclosure-missing")
    elif names_model(told):
        out.append("names-a-model")
    left, new = lines_of(asked), []
    for raw, line in zip(body.split("\n"), lines_of(body)):
        if line in left:
            left.remove(line)
            if raw.strip() != line:
                out.append("box-ticked")
        else:
            new.append(raw)
    new = "\n".join(new)
    if re.search(r"\[[xX]\]|[\u2611\u2612\u2705\u2713\u2714]|:(white|heavy|ballot)_check", new):
        out.append("box-ticked")
    # What a reader of the page would not see, or what becomes something else there.
    if re.search(r"<!|<[a-z/]|&#?\w+;|^\s*\[[^\]]*\]:|[\x00-\x08\x0b-\x1f\x7f-\x9f\u200b-\u200f\u2028-\u202e\u2060-\u2069]", new, re.I | re.M):
        out.append("text-hidden")
    return sorted(set(out + text_reasons(new, origin)))


def for_owner(body, template):
    """The project's own words that would notify or link someone, which only the owner can decide to send."""
    asked = set(lines_of(template))
    return calls_out("\n".join(x for x in lines_of(body) if x in asked))


def proof_reasons(core, repo, policy, rows, job_id, sha):
    """Everything a finished change needs before anyone else reads it."""
    job, base = core.job_of(rows, job_id), repo.tip()
    if not job or job["motion"] != "bugs":
        return ["job-missing"], None
    if not any(r["event"] == "adopt" and r["job"] == job_id and r.get("sha") == sha for r in rows):
        return ["job-mismatch"], None
    rules, out = recorded_rules(core, repo, rows)
    if not changed_files(core, base, sha):
        return ["no-change"], None
    out = refusal(rows, job_id, touching(core, rows, base, sha, True)) + out
    if os.path.expanduser("~") in "\n".join(t for s, t in core.changed_lines(base, sha) if s == "+"):
        out.append("private-text")
    if not core.local_commits_own(repo, sha):
        out.append("author-not-trusted")
    change = core.diff_facts(repo, base, sha, policy)
    if change["hard"] or change["major"]:
        out.append("hard-limit")
    if any(re.match(r"(?i)\.(context|compound-engineering)/|docs/(solutions|plans|brainstorms)/", n) for n in change["names"]):
        # What a run plans or learns is not the project's.
        out.append("private-text")
    out += moved(core, repo, base, sha)
    out += core.receipt_reasons(policy, rows, f"direct:{sha}", sha, base)
    passed = passed_commands(core, policy, rows, sha, base)
    if rules and not all(any(proves(p, g) for p in passed) for g in rules["gate"]):
        out.append("gate-not-passed")
    if not docs_only(core, base, sha):
        r = core.receipt(rows, f"direct:{sha}", sha, base, "reproduce")
        out += ["reproduce-missing"] if r is None else [] if r["ok"] else ["reproduce-failed"]
    if rules and rules["first"] == "issue" and not job["origin"].startswith("issue:"):
        out.append("issue-first")
    if job["origin"].startswith("issue:"):
        n = job["origin"].partition(":")[2]
        d = core.gh_json("api", f"repos/{repo.name}/issues/{n}")
        if d.get("state") != "open" or "pull_request" in d or d.get("locked"):
            out.append("issue-not-open")
    out += message_reasons(core, base, sha, job["origin"]) + [f for f in duplicate_reasons(core, repo, rows, job_id, sha)[0]]
    return list(dict.fromkeys(out)), rules


def cmd_reproduce(core, a, repo):
    """The command on the tip, then with the change's tests alone, then with all of it. Only the tests may show the failure."""
    policy, why = active(core, repo)
    if why:
        return core.deny(*why)
    rows, base, sha = core.ledger(repo), repo.tip(), a.sha
    _, head, why = core.subject_of(a, repo, policy, rows)
    if why:
        return core.deny(*why)
    if core.stops(policy, core.diff_facts(repo, base, sha, policy), False):
        return core.deny("hard-limit")
    names = changed_files(core, base, sha)
    gone = set(core.git("diff", "--name-only", "--no-renames", "--diff-filter=D", "-z", base, sha).stdout.split("\0"))
    tests = sorted(n for n in names - gone if core.TEST_FILE.search(n.lower()))
    if not tests or len(tests) == len(names):
        return core.deny("no-test-in-change" if not tests else "no-fix-in-change")
    if len(a.expect.strip()) < 4:
        return core.deny("expect-missing")
    for sig in (signal.SIGTERM, signal.SIGHUP):
        signal.signal(sig, core.interrupted)
    tmp, proc = tempfile.mkdtemp(prefix="afg-check-"), None
    tree, ran = os.path.join(tmp, "tree"), []
    env = core.scrubbed_env(tmp)

    def at(cwd, *args):
        p = subprocess.run(["git", "-c", "core.hooksPath=/dev/null", *args], cwd=cwd, env=env, capture_output=True, text=True)
        if p.returncode != 0:
            raise core.Failure(f"git {args[0]}: {p.stderr.strip()}")
    try:
        with core.machine_turn(repo, a.token, core.MACHINE_WAIT):
            at(repo.main, "worktree", "add", "--quiet", "--detach", tree, base)
            for step in ("tip", "tests", "all"):
                if step == "all":
                    at(tree, "reset", "--quiet", "--hard", sha)
                elif step == "tests":
                    at(tree, "checkout", "--quiet", sha, "--", *[f":(top,literal){t}" for t in tests])
                out = os.path.join(tmp, f"log-{step}")
                with open(out, "wb") as log:
                    proc = subprocess.Popen(a.run, shell=True, cwd=tree, env=env, stdin=subprocess.DEVNULL, stdout=log,
                                            stderr=subprocess.STDOUT, start_new_session=True)
                    try:
                        code = proc.wait(timeout=a.timeout)
                    except subprocess.TimeoutExpired:
                        code = "timeout"
                    core.kill_group(proc)
                with open(out, encoding="utf-8", errors="replace") as log:
                    ran.append((code, log.read()))
    finally:
        if proc is not None:
            core.kill_group(proc)
        core.git("worktree", "remove", "--force", tree, cwd=repo.main, check=False)
        shutil.rmtree(tmp, ignore_errors=True)
    (_, bare), (before, then), (after, now_) = ran
    bad = [r for r, on in (("not-the-tests", a.expect in bare), ("does-not-fail-first", before in (0, "timeout") or a.expect not in then),
                           ("does-not-pass-after", after != 0 or a.expect in now_)) if on]
    with core.locked(repo):
        core.require_lease(repo, a.token)
        core.append(repo, "receipt", kind="reproduce", subject=f"direct:{sha}", head=sha, base=base, ok=not bad, run=a.run,
                    expect=a.expect, tests=tests)
    return core.deny(*bad, before=then[-1500:], after=now_[-1500:]) if bad else core.emit({"ok": True, "tests": tests, "before": then[-1500:]})


def draft_file(core, repo, text):
    folder = os.path.join(core.store_dir(repo), "drafts")
    if os.path.islink(folder):
        raise core.Failure("the drafts folder is a symlink")
    os.makedirs(folder, mode=0o700, exist_ok=True)
    path = os.path.join(folder, f"{secrets.token_hex(6)}.md")
    fd = os.open(path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as f:
        f.write(text)
    return path


def sha_of(text):
    return hashlib.sha256(text.encode("utf-8", "surrogateescape")).hexdigest()


def template_for(core, repo, chosen):
    found_ = [(p, t) for p, t in rule_files(core, repo) if TEMPLATE.search(p)]
    if chosen:
        found_ = [x for x in found_ if x[0] == chosen]
        return found_[0][1] if found_ else None
    return "" if not found_ else found_[0][1] if len(found_) == 1 else None


def cmd_ready(core, a, repo):
    """Keep a finished change's title and body, or a private draft, in the store."""
    policy, why = active(core, repo)
    d = stdin_json(core)
    if why or d is None or d.get("kind") not in ("fix", "docs", "reply", "security") \
            or not all(isinstance(d.get(k), str) and d[k].strip() for k in ("title", "body")):
        return core.deny(*(why or ["ready-unreadable"]))
    rows, sha = core.ledger(repo), a.sha
    job = core.job_of(rows, a.job)
    if not job:
        return core.deny("job-missing")
    why, owner, before = [], [], []
    if d["kind"] in ("fix", "docs"):
        if not sha or not core.SHA.match(sha):
            return core.deny("sha-invalid")
        why, _ = proof_reasons(core, repo, policy, rows, a.job, sha)
        template = template_for(core, repo, d.get("template"))
        if template is None:
            return core.deny(*why, "template-unknown")
        why += body_reasons(d["body"], template, d.get("disclosure"), job.get("origin")) + text_reasons(d["title"], job.get("origin"))
        if re.search(r"[\x00-\x1f\x7f-\x9f&<]", d["title"]) or len(d["title"]) > 120:
            why.append("title-invalid")
        if re.match(r"(feat|refactor|perf|style)\b", d["title"], re.I):
            why.append("not-a-fix")
        if d["kind"] == "docs" and not docs_only(core, repo.tip(), sha):
            why.append("not-docs")
        if not why:
            owner = for_owner(d["body"], template)
            before = sorted(j for j in touching(core, rows, repo.tip(), sha, False) if refusal(rows, j))
    elif d["kind"] == "reply":
        sha = None
        why = body_reasons(d["body"], "", d.get("disclosure"), None) + text_reasons(d["title"], None) + ([] if job["motion"] == "tend" else ["not-your-pr"])
    if why:
        return core.deny(*why)
    with core.locked(repo):
        core.require_lease(repo, a.token)
        path = draft_file(core, repo, d["body"])
        core.append(repo, "upstream-ready", job=a.job, sha=sha, kind=d["kind"], title=d["title"], file=path, body=sha_of(d["body"]), base=repo.tip())
    return core.emit({"ready": a.job, "kind": d["kind"], "file": path, "body_sha": sha_of(d["body"]), "template_calls_out": owner, "refused_before": before})


def verdict_of(rows, ready):
    mine = [r for r in rows if r["event"] == "upstream-verdict" and r["sha"] == ready["sha"] and r["job"] == ready["job"]]
    if any(set(r["no"]) - {"truthful", "names_a_model"} for r in mine):
        # New words do not change what the commit is.
        return False
    mine = [r for r in mine if r["body"] == ready["body"] and r["title"] == ready["title"]]
    return all(r["ok"] for r in mine) if mine else None


def cmd_verdict(core, a, repo):
    """An independent reader's word on the exact change and text. A no, once said, stands for that text."""
    policy, why = active(core, repo)
    d = stdin_json(core)
    if why or d is None:
        return core.deny(*(why or ["verdict-unreadable"]))
    asked = {"truthful": True, "is_fix": True, "within_rules": True, "not_a_duplicate": True, "security": False, "names_a_model": False}
    if not all(isinstance(d.get(k), bool) for k in asked) or not all(isinstance(d.get(k), str) and d[k].strip() for k in ("reviewer", "reason")):
        return core.deny("verdict-unreadable")
    rows = core.ledger(repo)
    ready = next((r for r in reversed(rows) if r["event"] == "upstream-ready" and r["job"] == a.job and r["kind"] != "security"), None)
    if ready is None:
        return core.deny("ready-missing")
    if d.get("head_sha") != ready["sha"] or d.get("body_sha") != ready["body"] or d.get("title") != ready["title"]:
        return core.deny("head-moved")
    no = [k for k, v in asked.items() if d[k] is not v]
    # A no is kept whatever the parent did.
    late = moved(core, repo, ready["base"], ready["sha"]) if ready["sha"] and not no else []
    if late:
        return core.deny(*late)
    with core.locked(repo):
        core.require_lease(repo, a.token)
        ok = not no and verdict_of(rows, ready) is not False
        core.append(repo, "upstream-verdict", job=a.job, sha=ready["sha"], body=ready["body"], title=ready["title"], ok=ok, no=no,
                    reviewer=d["reviewer"], why=d["reason"])
    return core.emit({"ok": True}) if ok else core.deny("verdict-no", no=no)


def add_commands(core, add):
    def bind(fn):
        return lambda a, repo: fn(core, a, repo)
    add("upstream", bind(cmd_upstream), token=False)
    add("rules", bind(cmd_rules))
    p = add("search", bind(cmd_search))
    p.add_argument("--job", required=True)
    p.add_argument("--term", action="append", required=True)
    p = add("judge", bind(cmd_judge))
    p.add_argument("--job", required=True)
    p.add_argument("--number", type=int, action="append", required=True)
    p.add_argument("--is", required=True, choices=["different", "same", "answers"])
    p.add_argument("--why", required=True)
    p = add("reproduce", bind(cmd_reproduce))
    p.set_defaults(pr=None)
    p.add_argument("--sha", required=True)
    p.add_argument("--run", required=True)
    p.add_argument("--expect", required=True, help="what the failing test prints before the fix and not after")
    p.add_argument("--timeout", type=int, default=3600)
    p = add("ready", bind(cmd_ready))
    p.add_argument("--job", required=True)
    p.add_argument("--sha")
    add("verdict", bind(cmd_verdict)).add_argument("--job", required=True)
