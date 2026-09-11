#!/usr/bin/env python3
"""Data-reality dump for JSON / JSONL fixtures and packs.

Usage: pack_reality.py <file> [<file> ...] [--field a.b.c ...] [--max-distinct 12]

For every file it prints: sha256, top-level keys, array lengths, and for each array of objects
the distinct values (with counts) of every low-cardinality string/bool field plus null/absent
counts. It then cross-checks: every 64-hex string found anywhere in one file is compared with the
sha256 of every other file given, so a pack that records an identity hash for a sibling file is
verified against that sibling.

Read-only. No product code is imported. Intended to be pasted into a readiness review.

Invoke through the skill's Python execution probe, never a hardcoded interpreter name.
"""
from __future__ import annotations

import argparse
import collections
import hashlib
import json
import pathlib
import re
import sys

HEX64 = re.compile(r"^[0-9a-f]{64}$")


def load(p: pathlib.Path):
    text = p.read_text(encoding="utf-8")
    if p.suffix == ".jsonl":
        return [json.loads(l) for l in text.splitlines() if l.strip()]
    return json.loads(text)


def walk_strings(o, out):
    if isinstance(o, dict):
        for v in o.values():
            walk_strings(v, out)
    elif isinstance(o, list):
        for v in o:
            walk_strings(v, out)
    elif isinstance(o, str):
        out.append(o)


def get(o, dotted):
    for part in dotted.split("."):
        if isinstance(o, dict):
            o = o.get(part)
        else:
            return None
    return o


def profile_rows(name: str, rows: list, max_distinct: int):
    objs = [r for r in rows if isinstance(r, dict)]
    print(f"  {name}: {len(rows)} rows ({len(objs)} objects)")
    if not objs:
        return
    keys = collections.Counter()
    for r in objs:
        keys.update(r.keys())
    for k, present in sorted(keys.items()):
        vals = [r.get(k) for r in objs]
        absent = len(objs) - present
        nulls = sum(1 for v in vals if v is None)
        scalars = [
            v
            for v in vals
            if isinstance(v, (str, bool, int, float))
            and not isinstance(v, bool)
            or isinstance(v, bool)
        ]
        distinct = collections.Counter(v for v in scalars if isinstance(v, (str, bool)))
        line = f"    .{k}: present {present}/{len(objs)}"
        if absent:
            line += f", absent {absent}"
        if nulls:
            line += f", null {nulls}"
        if distinct and len(distinct) <= max_distinct:
            line += "  values=" + ", ".join(f"{v!r}×{c}" for v, c in distinct.most_common())
        elif distinct:
            line += f"  ({len(distinct)} distinct strings)"
        nums = [v for v in vals if isinstance(v, (int, float)) and not isinstance(v, bool)]
        if nums:
            line += f"  num[min {min(nums):.4g}, max {max(nums):.4g}]"
        kinds = collections.Counter(type(v).__name__ for v in vals if isinstance(v, (dict, list)))
        if kinds:
            line += "  " + ", ".join(f"{t}×{c}" for t, c in kinds.items())
        print(line)


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("files", nargs="+")
    ap.add_argument("--field", action="append", default=[], help="dotted path to print verbatim from each file")
    ap.add_argument("--max-distinct", type=int, default=12)
    a = ap.parse_args(argv)

    docs, hashes, strings = {}, {}, {}
    for f in a.files:
        p = pathlib.Path(f)
        if not p.exists():
            print(f"== {f}: MISSING")
            continue
        raw = p.read_bytes()
        hashes[f] = hashlib.sha256(raw).hexdigest()
        try:
            docs[f] = load(p)
        except Exception as exc:  # noqa: BLE001
            print(f"== {f}: unreadable ({exc})")
            continue
        s: list[str] = []
        walk_strings(docs[f], s)
        strings[f] = sorted(set(x for x in s if HEX64.match(x)))

    for f, d in docs.items():
        print(f"== {f}  sha256={hashes[f]}  bytes={pathlib.Path(f).stat().st_size}")
        if isinstance(d, list):
            profile_rows("<root>", d, a.max_distinct)
        elif isinstance(d, dict):
            print("  keys:", ", ".join(d.keys()))
            for k, v in d.items():
                if isinstance(v, list):
                    profile_rows(k, v, a.max_distinct)
                elif isinstance(v, dict) and all(not isinstance(x, (dict, list)) for x in v.values()):
                    print(f"  {k}: {json.dumps(v)[:400]}")
                elif isinstance(v, dict):
                    print(f"  {k}: dict with keys {', '.join(list(v.keys())[:20])}")
                else:
                    print(f"  {k}: {v!r}")
        for fld in a.field:
            print(f"  --field {fld}: {json.dumps(get(d, fld))[:600]}")
        print()

    print("== cross-file hash references")
    found = False
    for f, hs in strings.items():
        for h in hs:
            matches = [g for g, hg in hashes.items() if hg == h and g != f]
            if matches:
                print(f"  {f} references sha256 {h[:12]}… == {matches}  OK")
            else:
                print(f"  {f} references sha256 {h[:12]}… — matches NONE of the given files  MISMATCH")
            found = True
    if not found:
        print("  (no 64-hex strings found)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
