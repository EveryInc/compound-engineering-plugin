#!/usr/bin/env python3
"""Pass-through `git` wrapper for the ce-babysit-pr stale-intake eval pack.

Installed as <scenario>/bin/git. Every command except `push` execs the real git
unchanged. A push is logged to <scenario>/git-pushes.jsonl with its exit code. In the
lease-race scenario (<scenario>/lease-race.json present), the first non-dry-run push
first advances the PR branch in remote.git with a pre-built "author" commit, so the
agent's lease, taken on the old head, is refused by real git.
"""
import json
import os
import subprocess
import sys
import time

SHIM_DIR = os.path.dirname(os.path.realpath(__file__))
SCENARIO = os.path.dirname(SHIM_DIR)
REMOTE = os.path.join(SCENARIO, "remote.git")

GLOBAL_VALUE_OPTS = {"-C", "-c", "--git-dir", "--work-tree", "--namespace", "--exec-path", "--config-env"}


def real_git():
    for d in os.environ.get("PATH", "").split(os.pathsep):
        if not d or os.path.realpath(d) == SHIM_DIR:
            continue
        cand = os.path.join(d, "git")
        if os.path.isfile(cand) and os.access(cand, os.X_OK) and os.path.realpath(cand) != os.path.realpath(__file__):
            return cand
    sys.stderr.write("fake git: no real git on PATH\n")
    sys.exit(127)


def subcommand(args):
    i = 0
    while i < len(args):
        a = args[i]
        if a in GLOBAL_VALUE_OPTS:
            i += 2
            continue
        if a.startswith("-"):
            i += 1
            continue
        return a
    return None


def remote_ref(git, ref):
    r = subprocess.run([git, "--git-dir", REMOTE, "rev-parse", "--verify", "--quiet", ref],
                       capture_output=True, text=True)
    return r.stdout.strip() or None


def inject_author_push(git):
    """Simulate the PR author pushing one commit. Returns what was done, or None."""
    path = os.path.join(SCENARIO, "lease-race.json")
    if not os.path.exists(path):
        return None
    race = json.load(open(path, encoding="utf-8"))
    if race.get("fired_at"):
        return None
    ref = f"refs/heads/{race['branch']}"
    old = remote_ref(git, ref)
    if old != race["expected_old"]:
        # The branch already moved (a push got through first); there is no race left to stage.
        race["fired_at"] = time.time()
        race["skipped"] = f"branch was at {old}, not {race['expected_old']}"
    else:
        subprocess.run([git, "--git-dir", REMOTE, "update-ref", "-m", "push (simulated PR author)",
                        ref, race["author_commit"], old], check=True)
        subprocess.run([git, "--git-dir", REMOTE, "update-ref", "-m", "pull ref sync",
                        f"refs/pull/{race['pr']}/head", race["author_commit"]], check=True)
        race["fired_at"] = time.time()
    with open(path, "w", encoding="utf-8") as f:
        json.dump(race, f, indent=2)
    return {"injected_author_commit": race["author_commit"]} if "skipped" not in race else {"skipped": race["skipped"]}


def main():
    git = real_git()
    args = sys.argv[1:]
    if subcommand(args) != "push":
        os.execv(git, [git, *args])
    dry = "--dry-run" in args or "-n" in args
    injected = None if dry else inject_author_push(git)
    started = time.time()
    r = subprocess.run([git, *args])
    entry = {"ts": started, "argv": ["git", *args], "cwd": os.getcwd(), "exit": r.returncode,
             "dry_run": dry, "lease": any(a.startswith("--force-with-lease") for a in args),
             "force": any(a in ("-f", "--force") or a.startswith("+") for a in args)}
    if injected:
        entry["race"] = injected
    with open(os.path.join(SCENARIO, "git-pushes.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")
    sys.exit(r.returncode)


if __name__ == "__main__":
    main()
