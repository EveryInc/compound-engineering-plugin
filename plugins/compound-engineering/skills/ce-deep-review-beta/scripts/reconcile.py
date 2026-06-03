#!/usr/bin/env python3
"""ce-deep-review-beta — reconciliation helpers for the verified sidecar (RU5).

Two deterministic, side-effect-scoped helpers the skill calls when promoting verdict-tagged findings
into the reserved verified sidecar `<plan>.deep-review.md`:

  rotate <sidecar.md> [--now <ISO>] [--keep N]
      Rotate an existing verified sidecar out of the way before writing a fresh one, and prune old
      rotations. If <sidecar.md> exists, rename it to `<plan>.deep-review.<ISO>.md`, then keep only
      the N newest rotations (by the ISO infix in the name) and delete the rest.

  render-cross-model <verify-records.json>
      Emit the by-lens-grouped, verdict-tagged Markdown section for the cross-model findings, from
      verify-findings.py's `verify-records` output. Deterministic: same input -> same Markdown.

ROTATION SAFETY (this is the data-loss-risk surface the feasibility review flagged): the prune step
matches ONLY rotation files `<plan>.deep-review.<infix>.md`. It can never match the canonical base
`<plan>.deep-review.md` (no infix) nor the thin-slice draft `<plan>.deep-review-draft.md` (a
`-draft` infix, not a `.`-delimited one), so neither is ever deleted here.
"""

import argparse
import glob
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

LENSES = ["coherence", "feasibility", "security", "scope", "product", "adversarial"]
VERDICT_ORDER = ["CONFIRMED", "NOT-FOUND-IN-DOC", "NEEDS-HUMAN"]
_SUFFIX = ".deep-review.md"


def _utc_stamp():
    # Filesystem-safe UTC stamp, lexicographically sortable: 2026-05-29T024500Z
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H%M%SZ")


def rotate(sidecar_path, now=None, keep=5):
    """Rotate an existing verified sidecar and prune to the `keep` newest rotations.

    Returns the rotated path (or None if there was nothing to rotate). Only touches rotation files;
    never the base sidecar (just renamed away) nor the `-draft` sidecar.
    """
    if not sidecar_path.endswith(_SUFFIX):
        raise ValueError(f"expected a path ending in '{_SUFFIX}', got: {sidecar_path}")
    stamp = now or _utc_stamp()
    prefix = sidecar_path[: -len(".md")]  # "<plan>.deep-review"

    rotated = None
    if os.path.exists(sidecar_path):
        # Collision-safe: a re-run within the same second (or an explicit duplicate --now) yields the
        # same stamp. Never os.rename over an existing rotation -- that would silently drop a prior
        # snapshot before pruning runs, violating the data-loss-safe contract. Disambiguate with a
        # numeric suffix; "<stamp>-1" sorts after "<stamp>" so keep-N (newest-first) ordering holds.
        rotated = f"{prefix}.{stamp}.md"
        n = 1
        while os.path.exists(rotated):
            rotated = f"{prefix}.{stamp}-{n}.md"
            n += 1
        os.rename(sidecar_path, rotated)

    # Rotation files only: "<plan>.deep-review.<infix>.md". The glob's required "." after the prefix
    # excludes both the base ("<plan>.deep-review.md") and the draft ("<plan>.deep-review-draft.md").
    rotations = glob.glob(f"{prefix}.*.md")
    # Sort by the ISO infix (newest first); the infix is sortable as a string.
    def infix(p):
        return os.path.basename(p)[len(os.path.basename(prefix)) + 1 : -len(".md")]
    rotations.sort(key=infix, reverse=True)
    pruned = []
    for old in rotations[keep:]:
        os.remove(old)
        pruned.append(old)
    return {"rotated": rotated, "kept": rotations[:keep], "pruned": pruned}


def render_cross_model(verified):
    """Markdown for the cross-model section, grouped by lens, tagged by verdict. `verified` is the
    list under verify-records' `verified` key. Deterministic ordering: lens, then verdict, then the
    order findings appear in the input."""
    by_lens = {ln: [] for ln in LENSES}
    extra = {}
    for row in verified:
        ln = row.get("lens", "")
        (by_lens if ln in by_lens else extra).setdefault(ln, []).append(row)

    out = []
    for ln in LENSES + sorted(extra):
        rows = by_lens.get(ln) or extra.get(ln)
        if not rows:
            continue
        out.append(f"### {ln.capitalize()}")
        out.append("")
        for verdict in VERDICT_ORDER:
            group = [r for r in rows if r.get("verdict") == verdict]
            for r in group:
                model = r.get("model", "?")
                text = (r.get("text", "") or "").strip().replace("\n", " ")
                line = f"- **[{verdict}]** ({model}) {text}"
                if verdict == "CONFIRMED" and r.get("grounding_quote"):
                    line += f'  \n  ↳ grounding quote: "{r["grounding_quote"]}"'
                out.append(line)
        out.append("")
    return "\n".join(out).rstrip() + "\n"


def main(argv=None):
    p = argparse.ArgumentParser(description="ce-deep-review reconciliation helpers (RU5).")
    sub = p.add_subparsers(dest="cmd", required=True)

    r = sub.add_parser("rotate", help="rotate an existing verified sidecar; prune to N newest")
    r.add_argument("sidecar")
    r.add_argument("--now", default=None, help="ISO stamp for the rotation (default: current UTC)")
    r.add_argument("--keep", type=int, default=5)

    rc = sub.add_parser("render-cross-model", help="render the by-lens verdict-tagged section")
    rc.add_argument("verify_records_json")

    args = p.parse_args(argv)

    if args.cmd == "rotate":
        print(json.dumps(rotate(args.sidecar, now=args.now, keep=args.keep)))
        return 0

    if args.cmd == "render-cross-model":
        data = json.loads(Path(args.verify_records_json).read_text())
        sys.stdout.write(render_cross_model(data.get("verified", [])))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
