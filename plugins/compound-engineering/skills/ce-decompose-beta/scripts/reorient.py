#!/usr/bin/env python3
"""Derive live status for every node in a ce-decompose task-graph.

Usage:
    python3 reorient.py <project-dir>                 # collect facts from git + gh
    python3 reorient.py <project-dir> --facts <json>  # derive from pre-collected facts (testing)

Reads <project-dir>/index.md. For each node, derives a status in
{not-started, in-progress, in-review, done, blocked} per the 1:N state machine,
honoring a manual_status pin and the no_pr ops-node rule, then adds the
"merged, awaiting activation by nX" annotation (dry-run F1). Emits one JSON
object to stdout. Exit 0 normally; 2 on usage/parse error.

The derivation (derive_status) is a pure function of (node, facts) so it is
testable in isolation; git/gh I/O lives in collect_facts and is never trusted
to crash the run (subprocess check=False, "no PR" is an expected state).

Pure Python 3 standard library.
"""

import json
import os
import re
import subprocess
import sys

LIST_COLUMNS = {"depends_on", "pr_refs"}


def fail(msg):
    sys.stderr.write(msg.rstrip() + "\n")
    sys.exit(2)


# --------------------------------------------------------------------------- #
# Index parsing (kept standalone — mirrors task-graph-schema.md)
# --------------------------------------------------------------------------- #
def parse_index(index_path):
    with open(index_path, encoding="utf-8") as fh:
        lines = fh.read().splitlines()
    table = [ln for ln in lines if ln.lstrip().startswith("|")]
    if len(table) < 2:
        fail(f"No markdown table found in {index_path}")
    header = _split_row(table[0])
    nodes = []
    for raw in table[2:]:
        cells = _split_row(raw)
        if not any(cells):
            continue
        row = {}
        for col, val in zip(header, cells):
            row[col] = ([x.strip() for x in val.split(",") if x.strip()]
                        if col in LIST_COLUMNS else val)
        if row.get("id"):
            nodes.append(row)
    return nodes


def _split_row(line):
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    parts = re.split(r"(?<!\\)\|", line)
    return [p.replace("\\|", "|").strip() for p in parts]


# --------------------------------------------------------------------------- #
# Pure state machine
# --------------------------------------------------------------------------- #
def derive_status(node, facts):
    """Return (status, annotation). Pure: no I/O. `facts` per the collect_facts shape."""
    manual = (node.get("manual_status") or "").strip()
    if manual:
        return manual, "manual pin"
    if (node.get("no_pr") or "").lower() == "true":
        return "not-started", "awaiting manual completion (no_pr ops node)"
    if facts.get("token_ambiguous"):
        return "not-started", "ambiguous branch/PR match — resolve manually"

    prs = facts.get("prs", [])
    if prs:
        states = [(p.get("state") or "").lower() for p in prs]
        if states and all(s == "merged" for s in states):
            return "done", None
        if any(s == "open" for s in states):
            return "in-review", None
        # PRs exist but none open and not all merged (some closed/abandoned)
        return "in-progress", None

    if facts.get("branch_exists") and facts.get("commits_ahead", 0) > 0:
        return "in-progress", None
    return "not-started", None


def add_activation_annotations(nodes_by_id, statuses):
    """A `done` node with a not-done no_pr dependent is 'merged, awaiting activation by nX'."""
    dependents = {}
    for nid, n in nodes_by_id.items():
        for dep in n.get("depends_on", []):
            dependents.setdefault(dep, []).append(nid)
    for nid, info in statuses.items():
        if info["status"] != "done":
            continue
        for dep_id in sorted(dependents.get(nid, [])):
            dnode = nodes_by_id.get(dep_id, {})
            if (dnode.get("no_pr") or "").lower() == "true" and statuses[dep_id]["status"] != "done":
                info["annotation"] = f"merged, awaiting activation by {dep_id}"
                break


# --------------------------------------------------------------------------- #
# git / gh fact collection (real mode)
# --------------------------------------------------------------------------- #
def _run(cmd):
    try:
        p = subprocess.run(cmd, capture_output=True, text=True, check=False, timeout=30)
        return p.returncode, p.stdout.strip(), p.stderr.strip()
    except (OSError, subprocess.TimeoutExpired):
        return 1, "", "command-unavailable"


def resolve_base_branch():
    rc, out, _ = _run(["git", "symbolic-ref", "refs/remotes/origin/HEAD"])
    if rc == 0 and out:
        return out.rsplit("/", 1)[-1]
    rc, out, _ = _run(["gh", "repo", "view", "--json", "defaultBranchRef", "-q", ".defaultBranchRef.name"])
    if rc == 0 and out:
        return out
    return "main"


def collect_facts(node, base_branch):
    """Best-effort git/gh facts for one node. Never raises."""
    facts = {"branch_exists": False, "commits_ahead": 0, "prs": [], "token_ambiguous": False}
    nid = node["id"]
    branch_ref = (node.get("branch_ref") or "").strip()
    pr_refs = node.get("pr_refs", [])

    # explicit PR refs win
    if pr_refs:
        for ref in pr_refs:
            num = ref.lstrip("#")
            rc, out, _ = _run(["gh", "pr", "view", num, "--json", "state", "-q", ".state"])
            state = out.lower() if rc == 0 and out else "unknown"
            facts["prs"].append({"id": ref, "state": "merged" if state == "merged" else state})
    else:
        # anchored-token PR search: [nN] in title
        rc, out, _ = _run(["gh", "pr", "list", "--search", f"[{nid}] in:title",
                           "--state", "all", "--json", "number,state"])
        if rc == 0 and out:
            try:
                prs = json.loads(out)
            except json.JSONDecodeError:
                prs = []
            if len(prs) > 1:
                facts["token_ambiguous"] = True
            for pr in prs:
                facts["prs"].append({"id": f"#{pr.get('number')}", "state": (pr.get("state") or "").lower()})

    # branch resolution
    branches = []
    if branch_ref:
        branches = [branch_ref]
    else:
        rc, out, _ = _run(["git", "for-each-ref", "--format=%(refname:short)",
                           "refs/heads", "refs/remotes"])
        if rc == 0 and out:
            token = f"{nid}/"
            branches = [b for b in out.splitlines() if token in b]
            if len(branches) > 1 and not facts["prs"]:
                facts["token_ambiguous"] = True
    if branches:
        facts["branch_exists"] = True
        rc, out, _ = _run(["git", "rev-list", "--count", f"{base_branch}..{branches[0]}"])
        if rc == 0 and out.isdigit():
            facts["commits_ahead"] = int(out)
    return facts


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main(argv):
    if len(argv) < 2:
        fail("Usage: python3 reorient.py <project-dir> [--facts <json>]")
    project_dir = argv[1]
    facts_path = None
    if "--facts" in argv:
        idx = argv.index("--facts")
        if idx + 1 >= len(argv):
            fail("--facts requires a path")
        facts_path = argv[idx + 1]

    index_path = os.path.join(project_dir, "index.md")
    if not os.path.isfile(index_path):
        fail(f"No index.md in {project_dir}")

    nodes = parse_index(index_path)
    nodes_by_id = {n["id"]: n for n in nodes}

    if facts_path:
        with open(facts_path, encoding="utf-8") as fh:
            facts_by_id = json.load(fh)
        base_branch = facts_by_id.get("__base__", "main")
    else:
        base_branch = resolve_base_branch()
        facts_by_id = {nid: collect_facts(n, base_branch) for nid, n in nodes_by_id.items()}

    statuses = {}
    for nid, n in nodes_by_id.items():
        status, annotation = derive_status(n, facts_by_id.get(nid, {}))
        statuses[nid] = {"status": status, "annotation": annotation}

    add_activation_annotations(nodes_by_id, statuses)

    print(json.dumps({"base_branch": base_branch, "nodes": statuses}, indent=2))
    sys.exit(0)


if __name__ == "__main__":
    main(sys.argv)
