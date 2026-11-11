#!/usr/bin/env python3
"""Argv-dispatching fake `gh` for the ce-babysit-pr stale-intake eval pack.

Installed as <scenario>/bin/gh by build-fixtures.ts. Serves canned PR metadata from
<scenario>/gh-data.json and live git facts (head OID, mergeability, diffs) from
<scenario>/remote.git, so a push by the agent shows up on the next call. Every call is
appended to <scenario>/gh-calls.jsonl; mutating calls also go to mutations.jsonl and
succeed without doing anything.
"""
import hashlib
import json
import os
import shutil
import subprocess
import sys
import time
from urllib.parse import urlsplit

SCENARIO = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
REMOTE = os.path.join(SCENARIO, "remote.git")
DATA = json.load(open(os.path.join(SCENARIO, "gh-data.json"), encoding="utf-8"))
OWNER, REPO, HOST = DATA["owner"], DATA["repo"], DATA.get("host", "github.com")
SLUG = f"{OWNER}/{REPO}"


def log(argv, mutation):
    entry = json.dumps({"ts": time.time(), "argv": argv, "cwd": os.getcwd(), "mutation": mutation})
    with open(os.path.join(SCENARIO, "gh-calls.jsonl"), "a", encoding="utf-8") as f:
        f.write(entry + "\n")
    if mutation:
        with open(os.path.join(SCENARIO, "mutations.jsonl"), "a", encoding="utf-8") as f:
            f.write(entry + "\n")


def git(*args, check=True):
    r = subprocess.run(["git", "--git-dir", REMOTE, *args], capture_output=True, text=True)
    if check and r.returncode != 0:
        raise RuntimeError(r.stderr.strip())
    return r


def rev(ref):
    r = git("rev-parse", "--verify", "--quiet", f"{ref}^{{commit}}", check=False)
    return r.stdout.strip() or None


def fail(msg, code=1):
    sys.stderr.write(msg + "\n")
    sys.exit(code)


def emit(value, jq=None):
    text = json.dumps(value, indent=2)
    if jq and shutil.which("jq"):
        r = subprocess.run(["jq", "-r", jq], input=text, capture_output=True, text=True)
        if r.returncode != 0:
            fail(f"failed to parse jq expression: {r.stderr.strip()}")
        sys.stdout.write(r.stdout)
        return
    print(text)


def fake_oid(*parts):
    return hashlib.sha1("\0".join(parts).encode()).hexdigest()



def all_prs():
    return [DATA["pr"], *DATA.get("prs", [])]


def find_pr(number):
    for p in all_prs():
        if p["number"] == number:
            return p
    return None


def pr_range(p):
    """(base_oid, head_oid) for the PR's diff: merge-base..head for open PRs, first-parent for merged."""
    if p.get("state") == "MERGED":
        mc = p["mergeCommit"]
        return rev(f"{mc}^1"), mc
    head = rev(f"refs/heads/{p['headRefName']}")
    base = rev(f"refs/heads/{p.get('baseRefName', 'main')}")
    if not head or not base:
        return base, head
    mb = git("merge-base", base, head, check=False).stdout.strip() or base
    return mb, head


def mergeability(p):
    base = rev(f"refs/heads/{p.get('baseRefName', 'main')}")
    head = rev(f"refs/heads/{p['headRefName']}")
    if not base or not head:
        return "UNKNOWN", "UNKNOWN"
    r = git("merge-tree", "--write-tree", base, head, check=False)
    return ("MERGEABLE", "CLEAN") if r.returncode == 0 else ("CONFLICTING", "DIRTY")


def numstat(a, b):
    files = []
    out = git("diff", "--numstat", "-M", a, b).stdout
    for line in out.splitlines():
        add, dele, path = line.split("\t", 2)
        files.append({"path": path, "additions": int(add) if add != "-" else 0,
                      "deletions": int(dele) if dele != "-" else 0})
    return files


def commits(a, b):
    fmt = "%H%x1f%s%x1f%b%x1f%aI%x1f%cI%x1f%an%x1f%ae%x1e"
    out = git("log", "--reverse", "--topo-order", f"--format={fmt}", f"{a}..{b}").stdout
    result = []
    for rec in out.split("\x1e"):
        rec = rec.strip("\n")
        if not rec:
            continue
        oid, subject, body, adate, cdate, name, email = rec.split("\x1f")
        result.append({"oid": oid, "messageHeadline": subject, "messageBody": body.strip(),
                       "authoredDate": adate, "committedDate": cdate,
                       "authors": [{"name": name, "email": email, "login": email.split("@")[0]}]})
    return result


def pr_object(p):
    base_oid, head_oid = pr_range(p)
    is_open = p.get("state", "OPEN") == "OPEN"
    files = numstat(base_oid, head_oid) if base_oid and head_oid else []
    if is_open:
        mergeable, merge_state = mergeability(p)
    else:
        mergeable, merge_state = "UNKNOWN", "UNKNOWN"
    obj = {
        "id": "PR_" + fake_oid(SLUG, str(p["number"]))[:16],
        "number": p["number"],
        "title": p["title"],
        "body": p["body"],
        "state": p.get("state", "OPEN"),
        "closed": not is_open,
        "isDraft": False,
        "url": f"https://{HOST}/{SLUG}/pull/{p['number']}",
        "baseRefName": p.get("baseRefName", "main"),
        "headRefName": p["headRefName"],
        "headRefOid": head_oid if is_open else p.get("headRefOid", head_oid),
        "baseRefOid": base_oid,
        "author": {"login": p["author"], "is_bot": False},
        "isCrossRepository": False,
        "maintainerCanModify": True,
        "headRepository": {"name": REPO},
        "headRepositoryOwner": {"login": OWNER},
        "mergeable": mergeable,
        "mergeStateStatus": merge_state,
        "reviewDecision": "",
        "statusCheckRollup": [],
        "comments": [],
        "reviews": [],
        "latestReviews": [],
        "reviewRequests": [],
        "labels": [{"name": n} for n in p.get("labels", [])],
        "assignees": [],
        "milestone": None,
        "projectItems": [],
        "closingIssuesReferences": [],
        "autoMergeRequest": None,
        "createdAt": p["createdAt"],
        "updatedAt": p.get("updatedAt", p["createdAt"]),
        "closedAt": p.get("mergedAt"),
        "mergedAt": p.get("mergedAt"),
        "mergedBy": {"login": p["mergedBy"]} if p.get("mergedBy") else None,
        "mergeCommit": {"oid": p["mergeCommit"]} if p.get("mergeCommit") else None,
        "potentialMergeCommit": None,
        "additions": sum(f["additions"] for f in files),
        "deletions": sum(f["deletions"] for f in files),
        "changedFiles": len(files),
        "files": files,
        "commits": commits(base_oid, head_oid) if base_oid and head_oid else [],
    }
    return obj


def select(obj, fields):
    if not fields:
        return obj
    return {f: obj.get(f) for f in fields.split(",") if f}



VALUE_FLAGS = {"-R", "--repo", "--json", "-q", "--jq", "-t", "--template", "-s", "--state",
               "-L", "--limit", "-H", "--head", "-B", "--base", "-A", "--author", "-S", "--search",
               "-l", "--label", "-X", "--method", "-f", "--raw-field", "-F", "--field", "--header",
               "--hostname", "--input", "--cache", "-b", "--body", "--body-file", "-c", "--comment",
               "--title", "--assignee", "--app", "--match-head-commit"}


def parse(args):
    opts, pos = {}, []
    i = 0
    while i < len(args):
        a = args[i]
        if a.startswith("--") and "=" in a:
            k, v = a.split("=", 1)
            opts.setdefault(k, []).append(v)
        elif a in VALUE_FLAGS and i + 1 < len(args):
            opts.setdefault(a, []).append(args[i + 1])
            i += 1
        elif a.startswith("-") and a != "-":
            opts.setdefault(a, []).append(True)
        else:
            pos.append(a)
        i += 1
    return opts, pos


def opt(opts, *names):
    for n in names:
        if n in opts:
            return opts[n][-1]
    return None


def pr_number_arg(pos):
    if pos:
        ref = pos[0].rstrip("/")
        tail = ref.split("/")[-1].lstrip("#")
        if tail.isdigit():
            return int(tail)
        for p in all_prs():
            if p["headRefName"] == ref and p.get("state", "OPEN") == "OPEN":
                return p["number"]
        fail(f"no pull requests found for branch \"{ref}\"")
    branch = subprocess.run(["git", "branch", "--show-current"], capture_output=True, text=True).stdout.strip()
    for p in all_prs():
        if p["headRefName"] == branch and p.get("state", "OPEN") == "OPEN":
            return p["number"]
    fail(f"no pull requests found for branch \"{branch}\"")



def cmd_repo(sub, opts, pos):
    if sub != "view":
        return generic()
    info = {
        "name": REPO, "owner": {"login": OWNER}, "nameWithOwner": SLUG,
        "url": f"https://{HOST}/{SLUG}", "defaultBranchRef": {"name": "main"},
        "isFork": False, "parent": None, "isPrivate": False, "visibility": "PUBLIC",
        "viewerPermission": "ADMIN", "description": DATA.get("description", ""),
        "sshUrl": f"git@{HOST}:{SLUG}.git", "hasIssuesEnabled": True,
    }
    fields = opt(opts, "--json")
    if fields:
        return emit(select(info, fields), opt(opts, "-q", "--jq"))
    print(f"name:\t{SLUG}\ndescription:\t{info['description']}\n--\n{DATA.get('readme_hint', '')}")


def pr_text(o):
    n = len(o["commits"])
    print(f"{o['title']} #{o['number']}")
    print(f"{o['state'].capitalize()} • {o['author']['login']} wants to merge {n} commit{'s' if n != 1 else ''} "
          f"into {o['baseRefName']} from {o['headRefName']} • +{o['additions']} -{o['deletions']}")
    print("\n" + (o["body"] or "No description provided") + "\n")
    print(f"View this pull request on GitHub: {o['url']}")


def cmd_pr(sub, opts, pos, argv):
    if sub == "view":
        p = find_pr(pr_number_arg(pos))
        if p is None:
            fail(f"GraphQL: Could not resolve to a PullRequest with the number of {pos[0]}. (repository.pullRequest)")
        o = pr_object(p)
        fields = opt(opts, "--json")
        if fields:
            return emit(select(o, fields), opt(opts, "-q", "--jq"))
        return pr_text(o)
    if sub == "diff":
        p = find_pr(pr_number_arg(pos))
        if p is None:
            fail("pull request not found")
        a, b = pr_range(p)
        args = ["diff", "--name-only", a, b] if "--name-only" in opts else ["diff", a, b]
        sys.stdout.write(git(*args).stdout)
        return
    if sub == "list":
        return pr_list(opts)
    if sub == "checks":
        p = find_pr(pr_number_arg(pos))
        print(f"no checks reported on the '{p['headRefName']}' branch")
        return
    if sub == "status":
        print("Relevant pull requests in " + SLUG + "\n\nCurrent branch\n  (see gh pr view)")
        return
    if sub == "checkout":
        p = find_pr(pr_number_arg(pos))
        branch = p["headRefName"]
        have = subprocess.run(["git", "rev-parse", "--verify", "--quiet", f"refs/heads/{branch}"],
                              capture_output=True).returncode == 0
        if not have:
            subprocess.run(["git", "fetch", "origin", f"refs/heads/{branch}:refs/remotes/origin/{branch}"], check=False)
            r = subprocess.run(["git", "checkout", "-b", branch, "--track", f"origin/{branch}"])
        else:
            r = subprocess.run(["git", "checkout", branch])
        sys.exit(r.returncode)
    return generic()


def pr_list(opts):
    state = (opt(opts, "-s", "--state") or "open").upper()
    head, base, author = opt(opts, "-H", "--head"), opt(opts, "-B", "--base"), opt(opts, "-A", "--author")
    search = (opt(opts, "-S", "--search") or "").lower()
    out = []
    for p in all_prs():
        s = p.get("state", "OPEN")
        # gh's `--state closed` covers merged PRs too.
        if state != "ALL" and s != state and not (state == "CLOSED" and s == "MERGED"):
            continue
        if head and p["headRefName"] != head:
            continue
        if base and p.get("baseRefName", "main") != base:
            continue
        if author and p["author"] != author:
            continue
        if "is:merged" in search and s != "MERGED":
            continue
        out.append(pr_object(p))
    out = out[: int(opt(opts, "-L", "--limit") or 30)]
    fields = opt(opts, "--json")
    if fields:
        return emit([select(o, fields) for o in out], opt(opts, "-q", "--jq"))
    if not out:
        print(f"no {state.lower()} pull requests match your search in {SLUG}")
        return
    for o in out:
        print(f"#{o['number']}\t{o['title']}\t{o['headRefName']}\t{o['state']}")


def cmd_search(sub, opts, pos):
    if sub != "prs":
        return emit([])
    state = opt(opts, "--state")
    merged = "--merged" in opts
    out = []
    for p in all_prs():
        s = p.get("state", "OPEN")
        if merged and s != "MERGED":
            continue
        if state == "open" and s != "OPEN":
            continue
        if state == "closed" and s == "OPEN":
            continue
        o = pr_object(p)
        o["repository"] = {"nameWithOwner": SLUG, "name": REPO}
        o["state"] = "open" if s == "OPEN" else "closed"
        out.append(o)
    fields = opt(opts, "--json")
    if fields:
        return emit([select(o, fields) for o in out], opt(opts, "-q", "--jq"))
    for o in out:
        print(f"{SLUG}\t#{o['number']}\t{o['title']}\t{o['state']}")


def rest_pr(o):
    return {
        "number": o["number"], "state": "open" if o["state"] == "OPEN" else "closed",
        "title": o["title"], "body": o["body"], "html_url": o["url"], "draft": False,
        "user": {"login": o["author"]["login"]}, "merged": o["state"] == "MERGED",
        "merged_at": o["mergedAt"], "created_at": o["createdAt"], "updated_at": o["updatedAt"],
        "head": {"ref": o["headRefName"], "sha": o["headRefOid"], "repo": {"full_name": SLUG}},
        "base": {"ref": o["baseRefName"], "sha": rev(f"refs/heads/{o['baseRefName']}"), "repo": {"full_name": SLUG}},
        "mergeable": o["mergeable"] == "MERGEABLE" if o["state"] == "OPEN" else None,
        "mergeable_state": o["mergeStateStatus"].lower(), "maintainer_can_modify": True,
        "merge_commit_sha": (o["mergeCommit"] or {}).get("oid"),
        "additions": o["additions"], "deletions": o["deletions"], "changed_files": o["changedFiles"],
    }


def graphql_read():
    p = DATA["pr"]
    o = pr_object(p)
    base = rev(f"refs/heads/{o['baseRefName']}")
    head = o["headRefOid"]
    parents = git("rev-list", "--parents", "-n", "1", head).stdout.split()[1:] if head else []
    potential = None
    if o["mergeable"] == "MERGEABLE":
        potential = {"oid": fake_oid("merge", base, head), "parents": {"nodes": [{"oid": base}, {"oid": head}]}}
    pr = {
        **{k: o[k] for k in ("number", "title", "body", "url", "state", "isDraft", "headRefName",
                             "baseRefName", "mergeable", "mergeStateStatus", "headRefOid")},
        "baseRefOid": o["baseRefOid"],
        "viewerCanUpdateBranch": True,
        "baseRef": {"name": o["baseRefName"], "target": {"oid": base}},
        "headRef": {"name": o["headRefName"], "target": {"oid": head, "parents": {"nodes": [{"oid": x} for x in parents]}}},
        "potentialMergeCommit": potential,
        "stack": None,
        "stackEntry": None,
        "reviewThreads": {"nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}, "totalCount": 0},
        "comments": {"nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}, "totalCount": 0},
        "reviews": {"nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}, "totalCount": 0},
        "timelineItems": {"nodes": [], "pageInfo": {"hasNextPage": False, "endCursor": None}},
        "author": o["author"],
    }
    return {"data": {"repository": {"defaultBranchRef": {"name": "main"}, "nameWithOwner": SLUG,
                                    "pullRequest": pr},
                     "viewer": {"login": DATA.get("viewer", "eval-maintainer")}}}


def cmd_api(argv_rest):
    opts, pos = parse(argv_rest)
    endpoint = (pos[0] if pos else "").replace("{owner}", OWNER).replace("{repo}", REPO).lstrip("/")
    fields = [*opts.get("-f", []), *opts.get("--raw-field", []), *opts.get("-F", []), *opts.get("--field", [])]
    method = (opt(opts, "-X", "--method") or ("POST" if fields or "--input" in opts else "GET")).upper()
    jq = opt(opts, "-q", "--jq")

    if endpoint == "graphql":
        query = ""
        for f in fields:
            if isinstance(f, str) and f.startswith("query="):
                query = f[len("query="):]
                if query.startswith("@"):
                    query = open(query[1:], encoding="utf-8").read()
        is_mutation = query.lstrip().startswith("mutation")
        log(["gh", "api", *argv_rest], is_mutation)
        if is_mutation:
            return emit({"data": {}}, jq)
        return emit(graphql_read(), jq)

    is_mutation = method != "GET"
    log(["gh", "api", *argv_rest], is_mutation)
    if is_mutation:
        return emit({}, jq)

    path = urlsplit(endpoint).path
    parts = path.split("/")
    prefix = f"repos/{SLUG}"
    if path == "user":
        return emit({"login": DATA.get("viewer", "eval-maintainer"), "type": "User"}, jq)
    if path.startswith("search/issues"):
        items = [rest_pr(pr_object(p)) for p in all_prs()]
        return emit({"total_count": len(items), "incomplete_results": False, "items": items}, jq)
    if not path.startswith(prefix):
        return emit({}, jq)
    rest = parts[3:]
    if not rest:
        return emit({"name": REPO, "full_name": SLUG, "owner": {"login": OWNER}, "default_branch": "main",
                     "allow_auto_merge": True, "allow_squash_merge": True, "allow_merge_commit": True,
                     "allow_rebase_merge": True, "delete_branch_on_merge": False, "private": False,
                     "html_url": f"https://{HOST}/{SLUG}"}, jq)
    if rest[0] == "git" and len(rest) >= 3 and rest[1] in ("ref", "refs"):
        ref = "/".join(rest[2:])
        sha = rev(f"refs/{ref}")
        if not sha:
            fail("gh: Not Found (HTTP 404)")
        return emit({"ref": f"refs/{ref}", "object": {"sha": sha, "type": "commit"}}, jq)
    if rest[0] == "branches" and len(rest) >= 2:
        name = rest[1]
        if len(rest) >= 3 and rest[2] == "protection":
            fail("gh: Branch not protected (HTTP 404)")
        sha = rev(f"refs/heads/{name}")
        if not sha:
            fail("gh: Branch not found (HTTP 404)")
        return emit({"name": name, "commit": {"sha": sha}, "protected": False}, jq)
    if rest[0] == "pulls":
        if len(rest) == 1:
            return emit([rest_pr(pr_object(p)) for p in all_prs() if p.get("state", "OPEN") == "OPEN"], jq)
        p = find_pr(int(rest[1])) if rest[1].isdigit() else None
        if p is None:
            fail("gh: Not Found (HTTP 404)")
        o = pr_object(p)
        if len(rest) == 2:
            return emit(rest_pr(o), jq)
        if rest[2] == "files":
            return emit([{"filename": f["path"], "additions": f["additions"], "deletions": f["deletions"],
                          "status": "modified"} for f in o["files"]], jq)
        if rest[2] == "commits":
            return emit([{"sha": c["oid"], "commit": {"message": (c["messageHeadline"] + "\n\n" + c["messageBody"]).strip(),
                                                       "author": {"name": c["authors"][0]["name"], "date": c["authoredDate"]}}}
                         for c in o["commits"]], jq)
        return emit([], jq)
    if rest[0] == "issues":
        return emit([], jq)
    if rest[0] == "commits" and len(rest) >= 3:
        if rest[2] == "check-runs":
            return emit({"total_count": 0, "check_runs": []}, jq)
        if rest[2] == "status":
            return emit({"state": "pending", "statuses": [], "total_count": 0}, jq)
        if rest[2] == "pulls":
            return emit([], jq)
    if rest[0] == "actions":
        return emit({"total_count": 0, "workflow_runs": [], "jobs": []}, jq)
    return emit({}, jq)


def generic():
    print("{}")


MUTATING = {
    "pr": {"close", "comment", "merge", "edit", "create", "review", "ready", "reopen", "update-branch", "lock", "unlock"},
    "issue": {"create", "comment", "close", "edit", "reopen", "delete", "lock", "transfer", "pin"},
    "run": {"rerun", "cancel", "delete"},
    "workflow": {"run", "enable", "disable"},
    "label": {"create", "edit", "delete", "clone"},
    "release": {"create", "edit", "delete", "upload"},
    "repo": {"edit", "delete", "rename", "archive", "create", "fork", "sync"},
}


def main():
    argv = sys.argv[1:]
    if not argv or argv[0] in ("--version", "version"):
        print("gh version 2.83.0 (2026-09-30)")
        return
    group = argv[0]
    if group == "api":
        return cmd_api(argv[1:])
    sub = argv[1] if len(argv) > 1 else ""
    mutation = sub in MUTATING.get(group, set())
    log(["gh", *argv], mutation)
    if mutation:
        if group == "pr" and sub == "comment":
            print(f"https://{HOST}/{SLUG}/pull/{argv[2] if len(argv) > 2 else ''}#issuecomment-1")
        elif group == "pr" and sub == "close":
            print(f"✓ Closed pull request {SLUG}#{argv[2] if len(argv) > 2 else ''}")
        return
    opts, pos = parse(argv[2:])
    if group == "repo":
        return cmd_repo(sub, opts, pos)
    if group == "pr":
        return cmd_pr(sub, opts, pos, argv)
    if group == "search":
        return cmd_search(sub, opts, pos)
    if group == "auth":
        if sub == "status":
            sys.stderr.write(f"{HOST}\n  ✓ Logged in to {HOST} account {DATA.get('viewer', 'eval-maintainer')}\n")
            return
        if sub == "token":
            print("gho_fake_eval_token")
            return
        if sub == "git-credential":
            return
    if group == "stack":
        fail(f"unknown command \"stack\" for \"gh\"")
    if group in ("run", "workflow", "issue", "label", "release"):
        fields = opt(opts, "--json")
        if sub == "list":
            return emit([], opt(opts, "-q", "--jq")) if fields else None
        if fields:
            return emit({}, opt(opts, "-q", "--jq"))
        return
    if group == "config":
        return
    generic()


if __name__ == "__main__":
    try:
        main()
    except RuntimeError as e:
        fail(f"fake gh: {e}")
