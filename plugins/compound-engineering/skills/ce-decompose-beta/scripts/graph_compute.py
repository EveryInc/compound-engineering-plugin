#!/usr/bin/env python3
"""Validate a ce-decompose task-graph, compute critical-path/slack, and audit granularity.

Usage:
    python3 graph_compute.py <project-dir>

<project-dir> contains index.md (the schema-versioned markdown-table index) and
the per-node markdown files it references. Emits a single JSON object to stdout.

Exit codes:
    0  clean   — no findings
    1  findings — correctness or advisory findings present (see JSON `findings`)
    2  usage / parse error — message on stderr

Pure Python 3 standard library. The index is parsed by line/cell splitting per
references/task-graph-schema.md; there is no YAML/Markdown dependency.
"""

import json
import os
import re
import sys

LIST_COLUMNS = {"depends_on", "pr_refs"}
VALID_STAGES = {"brainstorm", "plan", "work"}


def fail(msg):
    sys.stderr.write(msg.rstrip() + "\n")
    sys.exit(2)


# --------------------------------------------------------------------------- #
# Parsing
# --------------------------------------------------------------------------- #
def parse_index(index_path):
    """Return (schema_version, [node_dict, ...]) from an index.md file."""
    with open(index_path, encoding="utf-8") as fh:
        text = fh.read()

    version_match = re.search(r"schema_version:\s*(\d+)", text)
    schema_version = int(version_match.group(1)) if version_match else None

    table_lines = [ln for ln in text.splitlines() if ln.lstrip().startswith("|")]
    if len(table_lines) < 2:
        fail(f"No markdown table found in {index_path}")

    header = _split_row(table_lines[0])
    # The second line is conventionally the |---|---| separator, but detect it by
    # content rather than position so a malformed table missing the separator does
    # not silently drop its first data row.
    rest = table_lines[1:]
    if rest and _is_separator_row(rest[0]):
        rest = rest[1:]
    data_lines = rest

    nodes = []
    for raw in data_lines:
        cells = _split_row(raw)
        if not any(cells):
            continue
        row = {}
        for col, val in zip(header, cells):
            if col in LIST_COLUMNS:
                row[col] = [item.strip() for item in val.split(",") if item.strip()]
            else:
                row[col] = val
        if row.get("id"):
            nodes.append(row)
    return schema_version, nodes


def _is_separator_row(line):
    """True if a table row is a |---|:--:|---| header separator (all dash/colon cells)."""
    cells = _split_row(line)
    return bool(cells) and all(re.fullmatch(r":?-+:?", c) for c in cells if c != "") \
        and any(c for c in cells)


def _split_row(line):
    """Split a markdown table row on unescaped pipes, dropping outer empties."""
    line = line.strip()
    if line.startswith("|"):
        line = line[1:]
    if line.endswith("|"):
        line = line[:-1]
    # honor \| escapes
    parts = re.split(r"(?<!\\)\|", line)
    return [p.replace("\\|", "|").strip() for p in parts]


FILES_BULLET = re.compile(r"^\s*-\s*`([^`]+)`\s*\((create|modify)\)", re.IGNORECASE)
FIELD_LINE = re.compile(r"^\*\*([A-Za-z][A-Za-z ]*):\*\*")


def parse_node_file(node_path):
    """Return {'files': [(path, marker)], 'mirror': bool} for a node markdown file.

    Only work-stage nodes carry a Files list; briefs return an empty files list.
    """
    result = {"files": [], "mirror": False}
    if not os.path.isfile(node_path):
        return result
    with open(node_path, encoding="utf-8") as fh:
        lines = fh.readlines()

    in_files = False
    text = "".join(lines)
    if re.search(r"mirror", text, re.IGNORECASE):
        result["mirror"] = True

    for ln in lines:
        field = FIELD_LINE.match(ln.strip())
        if field:
            in_files = field.group(1).strip().lower() == "files"
            continue
        if in_files:
            m = FILES_BULLET.match(ln)
            if m:
                result["files"].append((m.group(1).strip(), m.group(2).lower()))
    return result


# --------------------------------------------------------------------------- #
# Graph algorithms
# --------------------------------------------------------------------------- #
def detect_cycles(ids, deps):
    """Return a list of node ids participating in a cycle (empty if acyclic)."""
    WHITE, GRAY, BLACK = 0, 1, 2
    color = {i: WHITE for i in ids}
    on_cycle = set()
    stack = []

    def visit(n):
        color[n] = GRAY
        stack.append(n)
        for d in deps.get(n, []):
            if d not in color:
                continue
            if color[d] == GRAY:
                # back-edge: everything from d to top of stack is on a cycle
                if d in stack:
                    on_cycle.update(stack[stack.index(d):])
            elif color[d] == WHITE:
                visit(d)
        stack.pop()
        color[n] = BLACK

    for i in ids:
        if color[i] == WHITE:
            visit(i)
    return sorted(on_cycle)


def topo_order(ids, deps):
    """Kahn's algorithm. Assumes acyclic. deps[n] = upstream nodes."""
    successors = {i: [] for i in ids}
    indeg = {i: 0 for i in ids}
    for n in ids:
        for d in deps.get(n, []):
            if d in successors:
                successors[d].append(n)
                indeg[n] += 1
    queue = sorted([i for i in ids if indeg[i] == 0])
    order = []
    while queue:
        n = queue.pop(0)
        order.append(n)
        for s in sorted(successors[n]):
            indeg[s] -= 1
            if indeg[s] == 0:
                queue.append(s)
    return order, successors


def critical_path(ids, deps):
    """Unit-weight longest-path. Returns per-node {es, ef, ls, lf, slack, critical}
    and the critical path (one longest chain). Forest-aware (multiple roots)."""
    order, successors = topo_order(ids, deps)
    es = {i: 0 for i in ids}
    for n in order:
        ds = [d for d in deps.get(n, []) if d in es]
        es[n] = max((es[d] + 1 for d in ds), default=0)
    ef = {i: es[i] + 1 for i in ids}
    project = max(ef.values(), default=0)

    lf = {i: project for i in ids}
    for n in reversed(order):
        succ = successors[n]
        if succ:
            lf[n] = min(lf[s] - 1 for s in succ)
    ls = {i: lf[i] - 1 for i in ids}
    slack = {i: ls[i] - es[i] for i in ids}
    critical = {i: slack[i] == 0 for i in ids}

    # reconstruct one longest chain among critical nodes
    chain = []
    crit_ids = [i for i in order if critical[i]]
    if crit_ids:
        end = max(crit_ids, key=lambda i: ef[i])
        cur = end
        chain = [cur]
        while True:
            preds = [d for d in deps.get(cur, []) if critical.get(d) and ef[d] == es[cur]]
            if not preds:
                break
            cur = preds[0]
            chain.append(cur)
        chain.reverse()
    return {i: {"es": es[i], "slack": slack[i], "critical": critical[i]} for i in ids}, chain


# --------------------------------------------------------------------------- #
# Audits
# --------------------------------------------------------------------------- #
def reachable_upstream(node, deps):
    """All transitive dependencies of `node`."""
    seen, stack = set(), list(deps.get(node, []))
    while stack:
        d = stack.pop()
        if d in seen:
            continue
        seen.add(d)
        stack.extend(deps.get(d, []))
    return seen


def granularity_audit(nodes_by_id, deps, node_meta):
    """Returns list of findings. node_meta[id] = parse_node_file result."""
    findings = []

    work_ids = [i for i, n in nodes_by_id.items()
                if n.get("stage") == "work" and n.get("no_pr", "").lower() != "true"]

    # map each created file -> creating node
    creators = {}
    for i in work_ids:
        for path, marker in node_meta[i]["files"]:
            if marker == "create":
                creators.setdefault(path, []).append(i)

    # missing dependency: a node modifies a file another node creates, with no edge
    for i in work_ids:
        ups = reachable_upstream(i, deps)
        for path, marker in node_meta[i]["files"]:
            if marker != "modify":
                continue
            for creator in creators.get(path, []):
                if creator != i and creator not in ups:
                    findings.append({
                        "kind": "missing_dependency",
                        "severity": "correctness",
                        "node": i,
                        "detail": f"{i} modifies `{path}` created by {creator}, but {creator} is not an upstream dependency of {i}.",
                    })

    # spurious dependency (advisory): edge between two work nodes with no shared file
    for i in work_ids:
        i_files = {p for p, _ in node_meta[i]["files"]}
        for d in deps.get(i, []):
            if d not in work_ids:
                continue
            d_creates = {p for p, m in node_meta[d]["files"] if m == "create"}
            if i_files and d_creates and not (i_files & d_creates):
                findings.append({
                    "kind": "possibly_spurious_dependency",
                    "severity": "advisory",
                    "node": i,
                    "detail": f"edge {d} -> {i}: {i}'s files don't touch anything {d} creates; verify the dependency is real.",
                })

    # over-decomposition (advisory): high distinct-concern count, no mirror suppression
    concern_counts = {}
    for i in work_ids:
        dirs = {os.path.dirname(p) or "." for p, _ in node_meta[i]["files"]}
        concern_counts[i] = len(dirs)
    if concern_counts:
        vals = sorted(concern_counts.values())
        median = vals[len(vals) // 2]
        threshold = max(median * 2, median + 2)
        for i, c in concern_counts.items():
            if c >= threshold and not node_meta[i]["mirror"]:
                findings.append({
                    "kind": "possible_over_decomposition",
                    "severity": "advisory",
                    "node": i,
                    "detail": f"{i} spans {c} distinct directories (median {median}); confirm it is one coherent unit or split it.",
                })
    return findings


# --------------------------------------------------------------------------- #
# Main
# --------------------------------------------------------------------------- #
def main(argv):
    if len(argv) != 2:
        fail("Usage: python3 graph_compute.py <project-dir>")
    project_dir = argv[1]
    index_path = os.path.join(project_dir, "index.md")
    if not os.path.isfile(index_path):
        fail(f"No index.md in {project_dir}")

    schema_version, nodes = parse_index(index_path)
    nodes_by_id = {}
    findings = []

    for n in nodes:
        nid = n["id"]
        if nid in nodes_by_id:
            findings.append({"kind": "duplicate_id", "severity": "correctness",
                             "node": nid, "detail": f"duplicate node id {nid}"})
        nodes_by_id[nid] = n
        if n.get("stage") and n["stage"] not in VALID_STAGES:
            findings.append({"kind": "invalid_stage", "severity": "correctness", "node": nid,
                             "detail": f"{nid} has stage '{n['stage']}' (expected one of {sorted(VALID_STAGES)})"})

    ids = list(nodes_by_id.keys())
    deps = {i: [d for d in nodes_by_id[i].get("depends_on", [])] for i in ids}

    # unknown dependency targets
    for i in ids:
        for d in deps[i]:
            if d not in nodes_by_id:
                findings.append({"kind": "unknown_dependency", "severity": "correctness",
                                 "node": i, "detail": f"{i} depends on unknown node {d}"})
    # strip unknown deps so downstream algorithms stay well-formed
    deps = {i: [d for d in deps[i] if d in nodes_by_id] for i in ids}

    # orphans: referenced node files that don't exist, and node files with no row
    referenced = set()
    for i in ids:
        nf = nodes_by_id[i].get("node_file", "")
        if nf:
            referenced.add(nf)
            if not os.path.isfile(os.path.join(project_dir, nf)):
                findings.append({"kind": "orphan_index_entry", "severity": "correctness",
                                 "node": i, "detail": f"{i} references missing node file {nf}"})
    for fname in os.listdir(project_dir):
        if fname == "index.md" or not fname.endswith(".md"):
            continue
        if fname not in referenced:
            findings.append({"kind": "orphan_node_file", "severity": "correctness",
                             "node": None, "detail": f"node file {fname} is not referenced by any index row"})

    # node metadata (files / mirror)
    node_meta = {i: parse_node_file(os.path.join(project_dir, nodes_by_id[i].get("node_file", "")))
                 for i in ids}

    # skipped dependency checks (brief-stage and no_pr) reported, not silently passed
    dep_check = {}
    for i in ids:
        n = nodes_by_id[i]
        if n.get("no_pr", "").lower() == "true":
            dep_check[i] = "skipped (no_pr ops node)"
        elif n.get("stage") != "work":
            dep_check[i] = "skipped (no file list — brief stage)"
        else:
            dep_check[i] = "checked"

    # cycles short-circuit topo/critical-path
    cycle_nodes = detect_cycles(ids, deps)
    if cycle_nodes:
        findings.append({"kind": "cycle", "severity": "correctness", "node": None,
                         "detail": f"dependency cycle among: {', '.join(cycle_nodes)}"})
        per_node, chain = {}, []
    else:
        per_node, chain = critical_path(ids, deps)
        findings.extend(granularity_audit(nodes_by_id, deps, node_meta))

    roots = sorted([i for i in ids if not deps[i]])
    result = {
        "schema_version": schema_version,
        "node_count": len(ids),
        "roots": roots,
        "is_forest": len(roots) > 1,
        "critical_path": chain,
        "dependency_checks": dep_check,
        "per_node": per_node,
        "findings": findings,
        "summary": {
            "correctness": sum(1 for f in findings if f["severity"] == "correctness"),
            "advisory": sum(1 for f in findings if f["severity"] == "advisory"),
        },
    }
    print(json.dumps(result, indent=2))
    sys.exit(1 if findings else 0)


if __name__ == "__main__":
    main(sys.argv)
