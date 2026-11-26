#!/usr/bin/env python3
"""Everything in flight, in every repository afg has run in on this machine.

Derived each time from GitHub and each repository's ledger, so nothing has to be
remembered to be found. Reads only; writes the registry and the board:
  ~/.compound-engineering/afg/repos.json   where afg has run
  ~/.compound-engineering/afg/board.json   the board
  ~/.compound-engineering/afg/board.md     the same, for a person

  board.py              register this repository, rebuild, print what needs a next step here
  board.py --all        rebuild and print every repository
  board.py --forget P   stop following a repository
Python 3.9, no dependencies.
"""
import argparse
import json
import os
import subprocess
import sys
import tempfile
from datetime import datetime, timezone

HOME = os.path.join(os.environ.get("COMPOUND_ENGINEERING_HOME") or os.path.expanduser("~/.compound-engineering"), "afg")
STALE_HOURS = 6


def run(args, cwd):
    try:
        p = subprocess.run(args, cwd=cwd, capture_output=True, text=True, timeout=60)
    except (OSError, subprocess.SubprocessError):
        return None
    return p.stdout if p.returncode == 0 else None


def read(path, default):
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except (OSError, ValueError):
        return default


def write(path, text):
    os.makedirs(os.path.dirname(path), mode=0o700, exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path))
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.replace(tmp, path)


def main_checkout(cwd):
    out = run(["git", "worktree", "list", "--porcelain"], cwd)
    first = (out or "").split("\n")[0]
    return os.path.realpath(first[len("worktree "):]) if first.startswith("worktree ") else None


def origin(path):
    url = (run(["git", "config", "--get", "remote.origin.url"], path) or "").strip()
    name = url.split("github.com", 1)[-1].lstrip(":/") if "github.com" in url else ""
    return name[:-4] if name.endswith(".git") else name.rstrip("/") or None


def hours(iso):
    try:
        t = datetime.fromisoformat(iso.replace("Z", "+00:00"))
    except (ValueError, AttributeError):
        return None
    return round((datetime.now(timezone.utc) - t).total_seconds() / 3600, 1)


def ledger(path):
    rows = []
    try:
        with open(os.path.join(path, ".context", "compound-engineering", "afg", "ledger.jsonl"), encoding="utf-8") as f:
            for line in f:
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    continue
    except OSError:
        pass
    return rows


def ignored_checks(path, default):
    """The checks the repository's own settings say do not count, in the script's one-line or list form."""
    text = run(["git", "show", f"origin/{default}:.compound-engineering/config.yaml"], path) or ""
    out, inside = set(), False
    for raw in text.splitlines():
        if raw.startswith("autonomous_ignored_checks:"):
            inside = True
            raw = raw.partition(":")[2]
            out |= {x.strip().strip("'\"") for x in raw.strip().strip("[]").split(",") if x.strip()}
        elif inside and raw.strip().startswith("- "):
            out.add(raw.strip()[2:].strip().strip("'\""))
        elif raw.strip() and not raw.startswith((" ", "#")):
            inside = False
    return out


def next_step(pr, parks, on_default, ignored=()):
    """One next step, and who takes it. 'run' is afg's own; 'owner' is a person's."""
    p = parks.get(f"pr:{pr['number']}")
    if p and p.get("needs") in ("authority", "access", "fact"):
        return "owner", f"{p['recommend']} (parked: {p['why']})"
    if pr["mergeable"] == "CONFLICTING":
        return "run", "resolve the conflict"
    failing = sorted({c.get("name") or c.get("context") or "?" for c in pr.get("statusCheckRollup") or []
                      if (c.get("name") or c.get("context")) not in ignored and (c.get("conclusion") or c.get("state")) in ("FAILURE", "ERROR", "TIMED_OUT", "STARTUP_FAILURE")})
    if failing:
        return "run", "fix or explain " + ", ".join(failing[:4])
    if pr["reviewDecision"] == "CHANGES_REQUESTED":
        return "run", "answer the review"
    if any((c.get("status") or "COMPLETED") != "COMPLETED" or c.get("state") == "PENDING" for c in pr.get("statusCheckRollup") or []):
        return "run", "wait for its checks, then land it"
    if pr["isDraft"]:
        return "run", "finish it and mark it ready, or close it"
    return "run", "test, review and land it" if on_default else "land what it is stacked on"


def look(path):
    name, rows = origin(path), ledger(path)
    out = {"path": path, "repo": name, "items": [], "unreadable": []}
    parks, landed, adopted, ended = {}, set(), {}, set()
    jobs = {}
    for r in rows:
        e = r.get("event")
        if e == "park":
            parks[r["item"]] = r
        elif e == "answer":
            parks.pop(r.get("item"), None)
        elif e in ("land", "rejected"):
            landed.add(r.get("sha") or r.get("pr"))
            parks.pop(f"pr:{r.get('pr')}", None)
            parks.pop(f"commit:{r.get('sha')}", None)
        elif e == "close":
            parks.pop(r["item"], None)
        elif e == "job":
            jobs[r["job"]] = r
        elif e == "job-end":
            ended.add(r["job"])
        elif e == "adopt":
            adopted.setdefault(r["job"], []).append(r)
    me = (run(["gh", "api", "user", "--jq", ".login"], path) or "").strip()
    fields = "number,title,url,isDraft,headRefName,baseRefName,mergeable,reviewDecision,statusCheckRollup,createdAt,updatedAt"
    raw = run(["gh", "pr", "list", "-R", name, "--author", me, "--state", "open", "--limit", "100", "--json", fields], path) if name and me else None
    ours = {r.get("pr"): j for j, rs in adopted.items() for r in rs if r.get("pr")}
    raw_repo = run(["gh", "repo", "view", name, "--json", "defaultBranchRef"], path) if name else None
    default = ((json.loads(raw_repo) if raw_repo else {}).get("defaultBranchRef") or {}).get("name") or ""
    if raw is None:
        out["unreadable"].append("open pull requests")
    open_prs = set()
    ignored = ignored_checks(path, default) if default else ()
    for pr in json.loads(raw) if raw else []:
        open_prs.add(pr["number"])
        who, step = next_step(pr, parks, pr["baseRefName"] == default, ignored)
        out["items"].append({"kind": "pr", "id": f"#{pr['number']}", "title": pr["title"], "url": pr["url"], "by": "afg" if pr["number"] in ours else "owner",
                             "who": who if pr["number"] in ours or f"pr:{pr['number']}" in parks else "owner",
                             "step": step, "idle_hours": hours(pr["updatedAt"])})
    for job, j in jobs.items():
        heads = adopted.get(job, [])
        if job in ended or any((r.get("sha") or r.get("pr")) in landed for r in heads):
            continue
        if heads and heads[-1].get("pr"):
            continue
        if heads:
            sha = heads[-1]["sha"]
            p = parks.get(f"commit:{sha}")
            owner = p and p.get("needs") in ("authority", "access", "fact")
            out["items"].append({"kind": "commit", "id": sha[:10], "title": j["what"], "by": "afg", "who": "owner" if owner else "run",
                                 "step": p["recommend"] if p else "test, review and land it", "idle_hours": hours(heads[-1]["at"])})
        else:
            out["items"].append({"kind": "job", "id": job, "title": j["what"], "by": "afg", "who": "run",
                                 "step": "finish it, or end it when its worker is gone", "idle_hours": hours(j["at"])})
    for item, p in parks.items():
        kind = item.partition(":")[0]
        if kind == "pr" or kind == "commit" and any(i["id"] == item[7:17] for i in out["items"]):
            continue
        out["items"].append({"kind": "parked", "id": item, "title": p["why"], "by": "afg", "who": "run" if p.get("needs") == "later" else "owner",
                             "step": p["recommend"], "idle_hours": hours(p["at"])})
    state = read(os.path.join(path, ".context", "compound-engineering", "afg", "state.json"), {})
    age = hours(state.get("at"))
    out["running"] = bool(state.get("token")) and age is not None and age < 3
    return out


def line(i):
    late = "" if i["who"] != "run" or (i["idle_hours"] or 0) < STALE_HOURS else f" **idle {i['idle_hours']:.0f} h**"
    label = f"[{i['id']}]({i['url']})" if i.get("url") else f"`{i['id']}`"
    return f"- {label} {' '.join(i['title'].split())[:110]}: {' '.join(i['step'].split())[:200]}{late}"


def render(board):
    out = [f"# In flight\n\nRebuilt {board['at']} from GitHub and each repository's ledger.\n"]
    for r in board["repos"]:
        mine = [i for i in r["items"] if i["who"] == "run"]
        owner = [i for i in r["items"] if i["who"] == "owner" and i["by"] == "afg"]
        yours = [i for i in r["items"] if i["by"] == "owner"]
        out.append(f"\n## {r['repo'] or r['path']}{'' if r['running'] else ' (no run now)'}\n")
        for title, items in (("The run's", mine), ("Yours to decide", owner), ("Your own pull requests", yours)):
            if items:
                out.append(f"\n{title}:\n" + "\n".join(line(i) for i in items) + "\n")
        for u in r["unreadable"]:
            out.append(f"\nCould not read {u}.\n")
        if not r["items"] and not r["unreadable"]:
            out.append("\nNothing in flight.\n")
    return "".join(out)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--forget")
    a = ap.parse_args()
    registry = os.path.join(HOME, "repos.json")
    repos = [p for p in read(registry, []) if isinstance(p, str)]
    here = main_checkout(os.getcwd())
    if a.forget:
        repos = [p for p in repos if p != os.path.realpath(a.forget)]
    elif here and here not in repos and os.path.isdir(os.path.join(here, ".context", "compound-engineering", "afg")):
        repos.append(here)
    write(registry, json.dumps(repos, indent=1) + "\n")
    old = {r["path"]: r for r in read(os.path.join(HOME, "board.json"), {}).get("repos", [])}
    wanted = [p for p in repos if a.all or p == here]
    seen = {p: look(p) for p in wanted if os.path.isdir(p)}
    board = {"at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
             "repos": [seen.get(p) or old.get(p) or {"path": p, "repo": None, "items": [], "unreadable": ["the checkout"], "running": False} for p in repos]}
    write(os.path.join(HOME, "board.json"), json.dumps(board, indent=1) + "\n")
    write(os.path.join(HOME, "board.md"), render(board))
    shown = board["repos"] if a.all else [r for r in board["repos"] if r["path"] == here]
    print(json.dumps({"board": os.path.join(HOME, "board.md"), "repos": [
        {"repo": r["repo"], "running": r["running"], "unreadable": r["unreadable"], "run": [i for i in r["items"] if i["who"] == "run"],
         "owner": sum(i["who"] == "owner" for i in r["items"])} for r in shown]}))
    return 0


if __name__ == "__main__":
    sys.exit(main())
