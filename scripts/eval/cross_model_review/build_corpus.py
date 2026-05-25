#!/usr/bin/env python3
"""Known-bug corpus builder for the code-review breakpoint.

Mines a git repository for changes the project itself later judged wrong, so the
cross-model review eval can score arms against *validated* outcomes instead of
only forward-rated actionability (the R7 known-post-hoc-failure subset, ported
from plan review to code review).

Attribution tiers, in descending strength:
  - revert            -- the team reverted the change; the verdict is the repo's,
                         not a model's or a reviewer's. Highest trust.
  - named_regression  -- a fix commit whose message names what broke. Strong.
  - blame             -- a fix whose touched lines blame back to a recent change.
                         Inferred; flagged `needs_confirmation` for the human (R6).

Shape mirrors arms.py / run_arms.py: the rigor-bearing parsers are pure and
unit-tested (parse_revert_sha, parse_pr_numbers, parse_hunk_ranges,
is_regression_subject, validate_entry); the live `git` walk in `scan` /
`attribute_fix` is integration-level, validated against a constructed repo in the
test suite and against the real target repo at corpus-build time.

Each emitted entry extends the corpus manifest's known_failure shape with a
`ground_truth` block (the bug a reviewer should have caught) so run_arms.py /
the judge can do a targeted hit/miss match per document.
"""

import argparse
import json
import re
import subprocess
import sys
from datetime import datetime
from pathlib import Path

ATTRIBUTIONS = ["revert", "named_regression", "blame"]
TRUST_LEVELS = ["high", "needs_confirmation"]

# "This reverts commit <sha>." — the body git writes for a generated revert.
REVERT_SHA = re.compile(r"reverts commit ([0-9a-f]{7,40})", re.IGNORECASE)
PR_REF = re.compile(r"#(\d+)")
# Unified-diff hunk header: @@ -old_start[,old_count] +new_start[,new_count] @@
HUNK = re.compile(r"^@@ -(\d+)(?:,(\d+))? \+\d+(?:,\d+)? @@")
DIFF_GIT = re.compile(r"^diff --git a/(.+) b/(.+)$")
# Terms that name a regression in a fix subject. "introduced" is deliberately
# excluded: feature commits routinely say "introduced" and would false-positive.
REGRESSION_TERMS = ["broke", "broken", "regression", "reintroduce", "reintroduced"]
REGRESSION_RE = {t: re.compile(rf"\b{t}\b", re.IGNORECASE) for t in REGRESSION_TERMS}
# A fix commit subject (conventional): `fix:` or `fix(scope):` or `fix!:`.
FIX_SUBJECT = re.compile(r"^fix[(:!]", re.IGNORECASE)
# Paths that are documentation, not reviewable code — excluded from a code-review corpus.
NON_CODE_SUFFIXES = (".md", ".markdown", ".rst", ".txt")
NON_CODE_NAMES = ("changelog", "license", "notice", "authors", "codeowners")


# --- pure parsers (unit-tested) ------------------------------------------------


def parse_revert_sha(body):
    """Extract the culprit SHA from a git-generated revert body, or None."""
    m = REVERT_SHA.search(body or "")
    return m.group(1) if m else None


def parse_pr_numbers(text):
    """All `#NNN` references in order. `last` is the conventional reverted-PR slot."""
    prs = [int(n) for n in PR_REF.findall(text or "")]
    return {"prs": prs, "last": prs[-1] if prs else None}


def parse_hunk_ranges(diff):
    """Per-file pre-image (old-side) line ranges a diff touches.

    These are the ranges to `git blame` at the fix's parent to find the commit
    that last wrote them (blame attribution). Pure-addition hunks (old count 0)
    contribute no blameable range and are dropped.
    """
    files = []
    current = None
    for line in (diff or "").splitlines():
        mg = DIFF_GIT.match(line)
        if mg:
            current = {"file": mg.group(2), "old_ranges": []}
            files.append(current)
            continue
        mh = HUNK.match(line)
        if mh and current is not None:
            start = int(mh.group(1))
            count = int(mh.group(2)) if mh.group(2) is not None else 1
            if count > 0:
                current["old_ranges"].append([start, count])
    return {"files": files}


def is_regression_subject(text):
    """Detect a fix subject that names a break; return matched terms (Tier-2)."""
    matched = [t for t, rx in REGRESSION_RE.items() if rx.search(text or "")]
    return {"is_regression": bool(matched), "matched": matched}


def parse_numstat(text):
    """Sum changed lines and count files from `git show --numstat` output.

    Each line is `<added>\\t<deleted>\\t<path>`; binary files report `-` and count
    as a touched file with 0 measurable lines. Used by the culprit-size gate.
    """
    files, lines = 0, 0
    for ln in (text or "").splitlines():
        parts = ln.split("\t")
        if len(parts) < 3:
            continue
        files += 1
        a, d = parts[0], parts[1]
        if a.isdigit():
            lines += int(a)
        if d.isdigit():
            lines += int(d)
    return {"files": files, "changed_lines": lines}


def culprit_within_caps(changed_lines, files, max_lines, max_files):
    """Quality gate: reject culprits too large to review or wide enough to be a
    foundational/import commit (the failure modes a Tier-3 blame corpus collects)."""
    reasons = []
    if max_lines and changed_lines > max_lines:
        reasons.append(f"culprit diff {changed_lines} lines > {max_lines}")
    if max_files and files > max_files:
        reasons.append(f"culprit touches {files} files > {max_files} (likely foundational)")
    return {"ok": not reasons, "reasons": reasons}


def is_code_path(path):
    """True for reviewable code, False for docs/markdown — keeps the corpus code-only."""
    p = (path or "").strip().lower()
    if not p:
        return False
    if p.endswith(NON_CODE_SUFFIXES):
        return False
    if p.startswith("docs/") or "/docs/" in p:
        return False
    base = p.rsplit("/", 1)[-1].rsplit(".", 1)[0]
    return base not in NON_CODE_NAMES


def validate_entry(entry):
    """Manifest-conformance gate for a known_failure corpus entry (mirrors validate_record)."""
    errors = []
    if not isinstance(entry, dict):
        return ["entry is not a JSON object"]
    if not isinstance(entry.get("id"), str) or not entry.get("id"):
        errors.append("id must be a non-empty string")
    if not isinstance(entry.get("path"), str) or not entry.get("path"):
        errors.append("path must be a non-empty string")
    if entry.get("subset") != "known_failure":
        errors.append('subset must be "known_failure"')
    gt = entry.get("ground_truth")
    if not isinstance(gt, dict):
        errors.append("ground_truth must be an object")
        return errors
    if not isinstance(gt.get("bug"), str) or not gt.get("bug"):
        errors.append("ground_truth.bug must be a non-empty string")
    if not isinstance(gt.get("fix_commit"), str) or not gt.get("fix_commit"):
        errors.append("ground_truth.fix_commit must be a non-empty string")
    if gt.get("attribution") not in ATTRIBUTIONS:
        errors.append(f"ground_truth.attribution must be one of {ATTRIBUTIONS}")
    has_pr = isinstance(gt.get("culprit_pr"), int) and not isinstance(gt.get("culprit_pr"), bool)
    has_sha = isinstance(gt.get("culprit_sha"), str) and bool(gt.get("culprit_sha"))
    if not (has_pr or has_sha):
        errors.append("ground_truth must have a culprit_pr (int) or culprit_sha (str)")
    if gt.get("trust") not in TRUST_LEVELS:
        errors.append(f"ground_truth.trust must be one of {TRUST_LEVELS}")
    days = gt.get("surfaced_after_days")
    if days is not None and (not isinstance(days, int) or isinstance(days, bool) or days < 0):
        errors.append("ground_truth.surfaced_after_days must be an integer >= 0 when present")
    return errors


# --- git walk (integration-level) ----------------------------------------------

_REC_SEP, _FIELD_SEP = "\x1e", "\x1f"


def _git(repo, args):
    """Run `git -C <repo> ...` and return stdout; raise on nonzero exit."""
    proc = subprocess.run(
        ["git", "-C", str(repo), *args],
        capture_output=True,
        text=True,
        check=False,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"git {' '.join(args)} failed: {proc.stderr.strip()}")
    return proc.stdout


def _is_revert(subject, body):
    if parse_revert_sha(body):
        return True
    s = subject.strip()
    return bool(re.match(r"^revert[:(]", s, re.IGNORECASE) or s.startswith('Revert "'))


def _days_between(later_iso, earlier_iso):
    try:
        return (datetime.fromisoformat(later_iso) - datetime.fromisoformat(earlier_iso)).days
    except (ValueError, TypeError):
        return None


def scan(repo, out_dir=None, all_refs=False, max_entries=None):
    """Discover Tier-1 revert-attributed known-failure entries from `repo`.

    For each revert, the reverted commit is the culprit: its diff is the document
    a reviewer should have caught a problem in, and the revert is the verdict that
    it shipped wrong. When `out_dir` is given, the culprit diff is materialized to
    `<out_dir>/<id>.diff` so an arm can review it directly.
    """
    fmt = _FIELD_SEP.join(["%H", "%s", "%b", "%aI"]) + _REC_SEP
    log_args = ["log", f"--format={fmt}"]
    if all_refs:
        log_args.append("--all")
    raw = _git(repo, log_args)

    reverts_found = 0
    entries = []
    out_path = Path(out_dir) if out_dir else None
    if out_path:
        out_path.mkdir(parents=True, exist_ok=True)

    for rec in raw.split(_REC_SEP):
        rec = rec.strip("\n")
        if not rec:
            continue
        parts = rec.split(_FIELD_SEP)
        if len(parts) < 4:
            continue
        r_sha, r_subject, r_body, r_date = parts[0], parts[1], parts[2], parts[3]
        if not _is_revert(r_subject, r_body):
            continue
        reverts_found += 1

        culprit_sha = parse_revert_sha(r_body)
        if not culprit_sha:
            # Conventional revert with no embedded SHA: we have only the reverted
            # PR. Insufficient to materialize a reviewable diff here; left for the
            # human to resolve (R6). Counted, not emitted.
            continue

        try:
            c_meta = _git(repo, ["show", "-s", "--format=%s" + _FIELD_SEP + "%aI", culprit_sha])
        except RuntimeError:
            continue
        c_subject, _, c_date = c_meta.partition(_FIELD_SEP)
        c_subject, c_date = c_subject.strip(), c_date.strip()

        culprit_pr = parse_pr_numbers(c_subject)["last"]
        short = culprit_sha[:7]
        entry_id = f"kf-{short}"

        path = f"FILL: git show {culprit_sha} in {repo}"
        if out_path:
            diff = _git(repo, ["show", culprit_sha])
            diff_file = out_path / f"{entry_id}.diff"
            diff_file.write_text(diff)
            path = str(diff_file)

        gt = {
            "bug": c_subject,  # what shipped and was reverted; the human sharpens the exact finding (R6)
            "fix_commit": r_sha,
            "culprit_sha": culprit_sha,
            "attribution": "revert",
            "trust": "high",
            "revert_subject": r_subject,
        }
        if culprit_pr is not None:
            gt["culprit_pr"] = culprit_pr
        days = _days_between(r_date, c_date)
        if days is not None and days >= 0:
            gt["surfaced_after_days"] = days

        entry = {"id": entry_id, "path": path, "subset": "known_failure", "ground_truth": gt}
        if not validate_entry(entry):
            entries.append(entry)
        if max_entries and len(entries) >= max_entries:
            break

    return {
        "repo": str(repo),
        "entries": entries,
        "stats": {"reverts_found": reverts_found, "entries_emitted": len(entries)},
    }


def blame_candidates(repo, fix_sha, code_only=False):
    """Blame the lines a fix touched (at its parent) to find candidate culprits.

    Returns [{culprit_sha, files}] ranked by how many of the fix's files each
    culprit last wrote (most first) — the heuristic best guess. When `code_only`,
    documentation files are skipped so a code-review corpus stays code-only.
    """
    diff = _git(repo, ["show", fix_sha])
    candidates = {}
    for f in parse_hunk_ranges(diff)["files"]:
        if code_only and not is_code_path(f["file"]):
            continue
        for start, count in f["old_ranges"]:
            end = start + count - 1
            try:
                # --line-porcelain emits the full 40-char SHA per line; plain `-l`
                # truncates a digit for boundary commits (the `^` alignment hack).
                blame = _git(repo, ["blame", "--line-porcelain", "-L", f"{start},{end}", f"{fix_sha}^", "--", f["file"]])
            except RuntimeError:
                continue
            for sha in re.findall(r"(?m)^([0-9a-f]{40}) \d+ \d+", blame):
                candidates.setdefault(sha, set()).add(f["file"])
    ranked = sorted(candidates.items(), key=lambda kv: len(kv[1]), reverse=True)
    return [{"culprit_sha": s, "files": sorted(fs)} for s, fs in ranked]


def attribute_fix(repo, fix_sha):
    """Tier-2/3 blame attribution for a single fix (manual tool; shows all candidates)."""
    return {"fix_commit": fix_sha, "candidates": blame_candidates(repo, fix_sha, code_only=False)}


def scan_fixes(repo, out_dir=None, all_refs=False, max_entries=None,
               max_culprit_lines=2000, max_culprit_files=30, dedup=True):
    """Discover Tier-3 blame-attributed known-failure entries from `fix:` commits.

    Each conventional fix commit is blamed back to the change that last wrote the
    code it repairs; that change's diff becomes the document a reviewer should have
    caught the bug in. Blame is inferred, so every entry is `attribution: "blame",
    trust: "needs_confirmation"` for the human to confirm (R6), with the runner-up
    culprits kept in `culprit_alternates`.

    Quality gate (the first-run lesson): blame on a repo that ships large feature
    commits collapses many fixes onto one giant culprit. Entries whose culprit diff
    exceeds `max_culprit_lines`/`max_culprit_files` are dropped (too large to review
    / foundational), and when `dedup`, only the first fix per distinct culprit is
    kept (so N fixes touching one feature don't become N non-independent docs).
    Tighter caps yield a smaller but cleaner, decidable corpus.
    """
    fmt = _FIELD_SEP.join(["%H", "%s", "%aI"]) + _REC_SEP
    log_args = ["log", f"--format={fmt}"]
    if all_refs:
        log_args.append("--all")
    raw = _git(repo, log_args)

    fixes_scanned = 0
    fixes_with_culprit = 0
    filtered_oversize = 0
    filtered_dup = 0
    seen_culprits = set()
    entries = []
    out_path = Path(out_dir) if out_dir else None
    if out_path:
        out_path.mkdir(parents=True, exist_ok=True)

    for rec in raw.split(_REC_SEP):
        rec = rec.strip("\n")
        if not rec:
            continue
        parts = rec.split(_FIELD_SEP)
        if len(parts) < 3:
            continue
        f_sha, f_subject, f_date = parts[0], parts[1], parts[2]
        if not FIX_SUBJECT.match(f_subject.strip()):
            continue
        fixes_scanned += 1

        try:
            cands = blame_candidates(repo, f_sha, code_only=True)
        except RuntimeError:
            continue
        if not cands:
            continue
        fixes_with_culprit += 1

        culprit_sha = cands[0]["culprit_sha"]
        alternates = [c["culprit_sha"] for c in cands[1:]]

        # quality gate: drop oversize/foundational culprits, then dedup shared ones
        try:
            size = parse_numstat(_git(repo, ["show", "--numstat", "--format=", culprit_sha]))
        except RuntimeError:
            continue
        if not culprit_within_caps(size["changed_lines"], size["files"], max_culprit_lines, max_culprit_files)["ok"]:
            filtered_oversize += 1
            continue
        if dedup and culprit_sha in seen_culprits:
            filtered_dup += 1
            continue
        seen_culprits.add(culprit_sha)
        try:
            c_meta = _git(repo, ["show", "-s", "--format=%s" + _FIELD_SEP + "%aI", culprit_sha])
        except RuntimeError:
            continue
        c_subject, _, c_date = c_meta.partition(_FIELD_SEP)
        c_subject, c_date = c_subject.strip(), c_date.strip()

        entry_id = f"kf-{f_sha[:7]}"  # keyed by the fix -> one corpus item per fix
        path = f"FILL: git show {culprit_sha} in {repo}"
        if out_path:
            diff_file = out_path / f"{entry_id}.diff"
            diff_file.write_text(_git(repo, ["show", culprit_sha]))
            path = str(diff_file)

        gt = {
            "bug": f_subject,  # the fix subject = the bug a reviewer should have caught in the culprit
            "fix_commit": f_sha,
            "culprit_sha": culprit_sha,
            "attribution": "blame",
            "trust": "needs_confirmation",
        }
        if alternates:
            gt["culprit_alternates"] = alternates
        culprit_pr = parse_pr_numbers(c_subject)["last"]
        if culprit_pr is not None:
            gt["culprit_pr"] = culprit_pr
        days = _days_between(f_date, c_date)
        if days is not None and days >= 0:
            gt["surfaced_after_days"] = days

        entry = {"id": entry_id, "path": path, "subset": "known_failure", "ground_truth": gt}
        if not validate_entry(entry):
            entries.append(entry)
        if max_entries and len(entries) >= max_entries:
            break

    return {
        "repo": str(repo),
        "entries": entries,
        "stats": {
            "fixes_scanned": fixes_scanned,
            "fixes_with_culprit": fixes_with_culprit,
            "filtered_oversize": filtered_oversize,
            "filtered_dup": filtered_dup,
            "entries_emitted": len(entries),
        },
    }


def to_manifest(scan):
    """Wrap scan / scan-fixes output into a corpus-manifest skeleton.

    Entries become the `docs` array; pre_registration is left null so the human
    must fill the decision rule before running (R9), and confirm the
    `needs_confirmation` Tier-3 entries (R6). Accepts either the full
    `{entries, stats}` object or a bare list of entries.
    """
    entries = scan.get("entries", []) if isinstance(scan, dict) else scan
    return {
        "_schema": "Assembled from build_corpus output. FILL pre_registration before running (R9); confirm needs_confirmation entries and add negative_control + forward_rated docs (R6).",
        "pre_registration": {
            "go_threshold": None,
            "minimum_corpus_n": None,
            "trials_per_arm": 3,
            "arm_c_context_rule": None,
        },
        "arms": ["a_baseline", "b_isolated", "c_fixed_context", "d_self_critic"],
        "docs": entries,
    }


def _read(path):
    return Path(path).read_text()


def main(argv=None):
    parser = argparse.ArgumentParser(description="Known-bug corpus builder (code-review breakpoint).")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p = sub.add_parser("parse-revert-sha")
    p.add_argument("file")

    p = sub.add_parser("parse-pr-numbers")
    p.add_argument("file")

    p = sub.add_parser("parse-hunk-ranges")
    p.add_argument("file")

    p = sub.add_parser("is-regression-subject")
    p.add_argument("file")

    p = sub.add_parser("validate-entry")
    p.add_argument("file")

    p = sub.add_parser("is-code-path")
    p.add_argument("file")

    p = sub.add_parser("parse-numstat")
    p.add_argument("file")

    p = sub.add_parser("to-manifest")
    p.add_argument("file")

    p = sub.add_parser("scan")
    p.add_argument("--repo", required=True)
    p.add_argument("--out-dir")
    p.add_argument("--all", action="store_true", help="scan all refs, not just HEAD history")
    p.add_argument("--max", type=int, default=None)

    p = sub.add_parser("scan-fixes")
    p.add_argument("--repo", required=True)
    p.add_argument("--out-dir")
    p.add_argument("--all", action="store_true", help="scan all refs, not just HEAD history")
    p.add_argument("--max", type=int, default=None)
    p.add_argument("--max-culprit-lines", type=int, default=2000, help="drop culprits whose diff exceeds this (0 = no cap)")
    p.add_argument("--max-culprit-files", type=int, default=30, help="drop culprits touching more files than this (0 = no cap)")
    p.add_argument("--no-dedup", action="store_true", help="keep every fix even when fixes share a culprit")

    p = sub.add_parser("attribute-fix")
    p.add_argument("--repo", required=True)
    p.add_argument("fix_sha")

    args = parser.parse_args(argv)

    if args.cmd == "parse-revert-sha":
        print(json.dumps({"culprit_sha": parse_revert_sha(_read(args.file))}))
        return 0

    if args.cmd == "parse-pr-numbers":
        print(json.dumps(parse_pr_numbers(_read(args.file))))
        return 0

    if args.cmd == "parse-hunk-ranges":
        print(json.dumps(parse_hunk_ranges(_read(args.file))))
        return 0

    if args.cmd == "is-regression-subject":
        print(json.dumps(is_regression_subject(_read(args.file))))
        return 0

    if args.cmd == "validate-entry":
        errors = validate_entry(json.loads(_read(args.file)))
        print(json.dumps({"valid": not errors, "errors": errors}))
        return 0 if not errors else 1

    if args.cmd == "is-code-path":
        print(json.dumps({"is_code": is_code_path(_read(args.file).strip())}))
        return 0

    if args.cmd == "to-manifest":
        print(json.dumps(to_manifest(json.loads(_read(args.file))), indent=2))
        return 0

    if args.cmd == "scan":
        print(json.dumps(scan(args.repo, args.out_dir, args.all, args.max)))
        return 0

    if args.cmd == "parse-numstat":
        print(json.dumps(parse_numstat(_read(args.file))))
        return 0

    if args.cmd == "scan-fixes":
        print(json.dumps(scan_fixes(
            args.repo, args.out_dir, args.all, args.max,
            max_culprit_lines=args.max_culprit_lines,
            max_culprit_files=args.max_culprit_files,
            dedup=not args.no_dedup,
        )))
        return 0

    if args.cmd == "attribute-fix":
        print(json.dumps(attribute_fix(args.repo, args.fix_sha)))
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
