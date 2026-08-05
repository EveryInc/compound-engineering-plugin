#!/usr/bin/env python3
"""Deterministic claim-verification gates for the compound-engineering pipeline.

Subcommands (each prints exactly one JSON result object to stdout):

  artifacts   --claims <json-file>                verify claimed artifact paths exist and are non-empty
                                                  (an empty directory is flagged like an empty file)
  diff-claims --claims <json-file> --repo <dir>   compare claimed changed files against actual git state
              [--base <ref>]                      also union committed changes since <ref> (for runs
                                                  that commit their work); a bad ref is an
                                                  infrastructure failure
  verdict     --report <json-file>                flag self-contradictory review reports
  verdict     --acceptance <json-file>            flag an acceptance record contradicted by its inputs
                                                  (inputs are enum/type-validated; required fields:
                                                  review_verdict, verdict_consistency_flagged,
                                                  verification_evidence_status, babysit_status,
                                                  fixes_applied_status, residuals_durable)
  validate    --schema <file> --envelope <file>   minimal JSON-Schema-subset validation of an envelope
  journal     --file <path> --record <json>       append one validated JSONL record (best-effort)
  journal     --file <path> --record-file <path>  same, reading the record JSON from a file

Exit-code contract (load-bearing — callers branch on it):

  exit 0   = the gate RAN and produced a result, even when every check failed
             (mirror of SSSF's "the runner did its job; the CODE is what failed").
             Read the JSON `ok` field for the check outcome.
  non-zero = infrastructure failure ONLY: bad arguments, unreadable file, malformed
             input JSON, --repo is not a git repository, or a schema keyword outside
             the supported validation subset. The gate did not produce a result.

  `journal` is the one exception: it never exits non-zero after argument parsing.
  An invalid record or an unwritable path returns {"ok": false, "note": ...} with
  exit 0 — journaling is best-effort observability and must never block a caller.

Portability: Python 3 stdlib only; no fcntl or file locking; explicit
encoding="utf-8" on all file I/O; no os.replace over open handles (Windows-safe).
"""

import argparse
import json
import os
import subprocess
import sys


class InfrastructureFailure(Exception):
    """The gate could not run; maps to a non-zero exit."""


def emit(result):
    print(json.dumps(result))
    return 0


def check(item, ok, note):
    return {"item": item, "ok": ok, "note": note}


def load_json_file(path, what):
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return json.load(fh)
    except OSError as exc:
        raise InfrastructureFailure(f"cannot read {what} file {path}: {exc}")
    except json.JSONDecodeError as exc:
        raise InfrastructureFailure(f"malformed JSON in {what} file {path}: {exc}")


# --- artifacts -----------------------------------------------------------------


def cmd_artifacts(args):
    claims = load_json_file(args.claims, "claims")
    artifacts = claims.get("artifacts") if isinstance(claims, dict) else None
    if not isinstance(artifacts, list):
        raise InfrastructureFailure('claims file must be an object with an "artifacts" list')
    checks = []
    for item in artifacts:
        if not isinstance(item, str):
            raise InfrastructureFailure(f"artifact entry is not a string: {item!r}")
        if not os.path.exists(item):
            checks.append(check(item, False, "missing: path does not exist"))
        elif os.path.isfile(item) and os.path.getsize(item) == 0:
            checks.append(check(item, False, "exists but is empty (0 bytes)"))
        elif os.path.isdir(item) and not os.listdir(item):
            checks.append(check(item, False, "exists but is an empty directory"))
        else:
            checks.append(check(item, True, "exists and is non-empty"))
    return emit({"ok": all(c["ok"] for c in checks), "checks": checks})


# --- diff-claims ---------------------------------------------------------------


def run_git(repo, *git_args):
    try:
        return subprocess.run(
            ["git", "-C", repo, *git_args],
            capture_output=True,
            text=True,
            encoding="utf-8",
        )
    except OSError as exc:
        raise InfrastructureFailure(f"cannot invoke git: {exc}")


def normalize_path(p):
    p = p.replace("\\", "/")
    while p.startswith("./"):  # never lstrip("./"): that would eat ".gitignore"
        p = p[2:]
    return p


def parse_porcelain_z(stdout):
    """Parse `git status --porcelain -z` output into a set of current paths.

    Each entry is "XY <path>"; rename/copy entries (X or Y in R/C) are followed by
    one extra NUL-terminated field holding the ORIGINAL path (the new name comes
    first per the porcelain -z spec, verified against real git output). NUL
    delimiting means no quoting/escaping ever applies, so paths with spaces,
    quotes, non-ASCII, or a literal " -> " pass through byte-exact.
    """
    fields = stdout.split("\0")
    paths = set()
    i = 0
    while i < len(fields):
        entry = fields[i]
        i += 1
        if not entry:
            continue
        status_xy, path = entry[:2], entry[3:]
        paths.add(path)
        if "R" in status_xy or "C" in status_xy:
            i += 1  # skip the original-path field of a rename/copy
    return paths


def split_z(stdout):
    return [f for f in stdout.split("\0") if f]


def is_absolute_prefix(prefix):
    p = prefix.replace("\\", "/")
    return p.startswith("/") or (len(p) >= 2 and p[1] == ":" and p[0].isalpha())


def in_scope(path_norm, scope_prefixes):
    for prefix in scope_prefixes:
        prefix = prefix.replace("\\", "/").rstrip("/")
        if prefix == ".":
            return True
        if path_norm == prefix or path_norm.startswith(prefix + "/"):
            return True
    return False


def cmd_diff_claims(args):
    claims = load_json_file(args.claims, "claims")
    if not isinstance(claims, dict) or not isinstance(claims.get("changed_files"), list):
        raise InfrastructureFailure('claims file must be an object with a "changed_files" list')
    scope = claims.get("scope")
    if scope is not None and not isinstance(scope, list):
        raise InfrastructureFailure('"scope" must be a list of path-or-directory prefixes when present')
    if scope:
        for prefix in scope:
            if not isinstance(prefix, str):
                raise InfrastructureFailure(f"scope prefix is not a string: {prefix!r}")
            if prefix == "":
                raise InfrastructureFailure(
                    'malformed scope prefix "" (use "." to mean the whole repo)'
                )
            if is_absolute_prefix(prefix):
                raise InfrastructureFailure(
                    f"malformed scope prefix {prefix!r}: absolute paths are not allowed "
                    "(use repo-relative prefixes)"
                )

    probe = run_git(args.repo, "rev-parse", "--git-dir")
    if probe.returncode != 0:
        raise InfrastructureFailure(f"{args.repo} is not a git repository: {probe.stderr.strip()}")

    status = run_git(args.repo, "status", "--porcelain", "-z")
    if status.returncode != 0:
        raise InfrastructureFailure(f"git status failed: {status.stderr.strip()}")
    actual = {normalize_path(p) for p in parse_porcelain_z(status.stdout)}
    # Include committed-but-uncommitted-to-claims drift relative to HEAD when HEAD exists
    # (a fresh repo with no commits legitimately has no HEAD; that is not an infra failure).
    head = run_git(args.repo, "rev-parse", "--verify", "--quiet", "HEAD")
    if head.returncode == 0:
        diff = run_git(args.repo, "diff", "--name-only", "-z", "HEAD")
        if diff.returncode != 0:
            raise InfrastructureFailure(f"git diff failed: {diff.stderr.strip()}")
        actual.update(normalize_path(p) for p in split_z(diff.stdout))
    # A run that committed its work leaves a clean tree; --base <ref> unions the
    # committed changes since <ref> so those claims still verify.
    if getattr(args, "base", None):
        base_probe = run_git(args.repo, "rev-parse", "--verify", "--quiet", f"{args.base}^{{commit}}")
        if base_probe.returncode != 0:
            raise InfrastructureFailure(
                f"--base {args.base!r} is not a resolvable commit in {args.repo}"
            )
        base_diff = run_git(args.repo, "diff", "--name-only", "-z", args.base)
        if base_diff.returncode != 0:
            raise InfrastructureFailure(f"git diff against --base failed: {base_diff.stderr.strip()}")
        actual.update(normalize_path(p) for p in split_z(base_diff.stdout))

    claimed = {normalize_path(p) for p in claims["changed_files"]}
    missing_claims = sorted(claimed - actual)
    unclaimed = sorted(actual - claimed)
    # Noise policy (R5): claimed-but-untouched always degrades; touched-but-unclaimed
    # degrades only OUTSIDE the declared plan scope (inside scope is informational).
    # With no declared scope there is no "outside", so unclaimed changes stay informational.
    scope_prefixes = scope if scope else None
    out_of_scope = (
        [p for p in unclaimed if not in_scope(p, scope_prefixes)] if scope_prefixes else []
    )
    checks = [
        check(
            "claimed files all touched",
            not missing_claims,
            f"claimed but untouched: {missing_claims}" if missing_claims else "all claimed files were touched",
        ),
        check(
            "no unclaimed changes outside scope",
            not out_of_scope,
            f"unclaimed changes outside scope: {out_of_scope}" if out_of_scope else "no out-of-scope unclaimed changes",
        ),
    ]
    return emit(
        {
            "ok": not missing_claims and not out_of_scope,
            "missing_claims": missing_claims,
            "unclaimed_changes": unclaimed,
            "checks": checks,
        }
    )


# --- verdict -------------------------------------------------------------------

VERDICTS = ("Ready to merge", "Ready with fixes", "Not ready")
NOT_READY = VERDICTS[2]
BLOCKING_SEVERITIES = ("P0", "P1")
RESOLVED_STATUSES = ("resolved", "fixed", "applied", "closed")


def cmd_verdict_report(path):
    report = load_json_file(path, "report")
    if not isinstance(report, dict):
        raise InfrastructureFailure("report file must be a JSON object")
    verdict = report.get("verdict")
    if verdict not in VERDICTS:
        raise InfrastructureFailure(
            f"report verdict must be one of {list(VERDICTS)}, got {verdict!r}"
        )
    findings = report.get("actionable_findings")
    if not isinstance(findings, list):
        raise InfrastructureFailure('report must contain an "actionable_findings" list')
    for f in findings:
        if not isinstance(f, dict) or not isinstance(f.get("severity"), str):
            raise InfrastructureFailure(f'each actionable finding needs a string "severity": {f!r}')

    contradictions = []
    open_blocking = [
        f
        for f in findings
        if f["severity"] in BLOCKING_SEVERITIES
        and str(f.get("status", "open")).lower() not in RESOLVED_STATUSES
    ]
    if verdict == "Ready to merge" and open_blocking:
        sev = sorted({f["severity"] for f in open_blocking})
        contradictions.append(
            f"verdict 'Ready to merge' with {len(open_blocking)} open {'/'.join(sev)} actionable finding(s)"
        )
    if (
        verdict == "Not ready"
        and not findings
        and not report.get("residual_risks")
        and not report.get("not_ready_reason")
    ):
        contradictions.append(
            "verdict 'Not ready' with zero actionable findings, no residual_risks, and no not_ready_reason"
        )
    if verdict == "Ready with fixes" and not any(f.get("suggested_fix") for f in findings):
        contradictions.append(
            "verdict 'Ready with fixes' with zero findings carrying a suggested_fix"
        )
    return emit({"ok": not contradictions, "contradictions": contradictions})


REQUIRED_ACCEPTANCE_INPUTS = (
    "review_verdict",
    "verdict_consistency_flagged",
    "verification_evidence_status",
    "babysit_status",
    "fixes_applied_status",
    "residuals_durable",
)
VERIFICATION_EVIDENCE_STATUSES = ("green", "red", "unverified")
FIXES_APPLIED_STATUSES = ("applied", "partial", "none-eligible", "not-applied")


def validate_acceptance_inputs(inputs):
    """Enum/type-validate every input BEFORE contradiction checks.

    A mis-typed or mis-cased value (e.g. "GREEN", 1 for a bool) must be an
    infrastructure failure, never a silent green: equality checks against the
    red values would quietly pass an invalid record.
    """
    if inputs["review_verdict"] not in VERDICTS:
        raise InfrastructureFailure(
            f"review_verdict must be one of {list(VERDICTS)}, got {inputs['review_verdict']!r}"
        )
    if not isinstance(inputs["verdict_consistency_flagged"], bool):
        raise InfrastructureFailure(
            f"verdict_consistency_flagged must be a boolean, got {inputs['verdict_consistency_flagged']!r}"
        )
    if inputs["verification_evidence_status"] not in VERIFICATION_EVIDENCE_STATUSES:
        raise InfrastructureFailure(
            f"verification_evidence_status must be one of {list(VERIFICATION_EVIDENCE_STATUSES)}, "
            f"got {inputs['verification_evidence_status']!r}"
        )
    if inputs["babysit_status"] is not None and not isinstance(inputs["babysit_status"], str):
        raise InfrastructureFailure(
            f"babysit_status must be a string or null, got {inputs['babysit_status']!r}"
        )
    if inputs["fixes_applied_status"] not in FIXES_APPLIED_STATUSES:
        raise InfrastructureFailure(
            f"fixes_applied_status must be one of {list(FIXES_APPLIED_STATUSES)}, "
            f"got {inputs['fixes_applied_status']!r}"
        )
    if inputs["residuals_durable"] is not None and not isinstance(inputs["residuals_durable"], bool):
        raise InfrastructureFailure(
            f"residuals_durable must be true, false, or null, got {inputs['residuals_durable']!r}"
        )


def cmd_verdict_acceptance(path):
    record = load_json_file(path, "acceptance")
    if not isinstance(record, dict) or not isinstance(record.get("accepted"), bool):
        raise InfrastructureFailure('acceptance record must be an object with a boolean "accepted"')
    inputs = record.get("inputs")
    if not isinstance(inputs, dict):
        raise InfrastructureFailure('acceptance record must contain an "inputs" object')
    missing = [k for k in REQUIRED_ACCEPTANCE_INPUTS if k not in inputs]
    if missing:
        raise InfrastructureFailure(f"acceptance inputs missing required field(s): {missing}")
    validate_acceptance_inputs(inputs)

    red = []
    if inputs["review_verdict"] == NOT_READY:
        red.append(f"review_verdict is '{NOT_READY}'")
    if inputs["verdict_consistency_flagged"] is True:
        red.append("verdict_consistency_flagged is true")
    if inputs["verification_evidence_status"] == "red":
        red.append("verification_evidence_status is 'red'")
    babysit = inputs["babysit_status"]
    if isinstance(babysit, str) and babysit.lower() == "failed":
        red.append("babysit_status is 'failed'")
    if inputs["fixes_applied_status"] == "not-applied":
        red.append("fixes_applied_status is 'not-applied'")
    if inputs["residuals_durable"] is False:
        red.append("residuals_durable is false")

    contradictions = []
    # Conservative acceptance (accepted:false with green inputs) is never a contradiction.
    if record["accepted"] and red:
        contradictions = [f"accepted:true despite red input: {reason}" for reason in red]
    return emit({"ok": not contradictions, "contradictions": contradictions})


# --- validate ------------------------------------------------------------------

SUPPORTED_KEYWORDS = {
    "type", "required", "properties", "additionalProperties", "enum", "items", "oneOf",
}
IGNORED_KEYWORDS = {"$schema", "title", "description", "default"}


def check_supported_keywords(schema, at="#"):
    """Reject any keyword outside the supported subset, anywhere in the schema.

    A silent no-op on an unknown keyword would let schemas quietly stop being
    enforced as they evolve — so this is an infrastructure failure, not a skip.
    """
    if not isinstance(schema, dict):
        raise InfrastructureFailure(f"schema at {at} must be an object")
    for key, value in schema.items():
        if key in IGNORED_KEYWORDS:
            continue
        if key not in SUPPORTED_KEYWORDS:
            raise InfrastructureFailure(
                f"unsupported schema keyword '{key}' at {at} "
                f"(supported: {sorted(SUPPORTED_KEYWORDS)})"
            )
        if key == "properties":
            for name, sub in value.items():
                check_supported_keywords(sub, f"{at}/properties/{name}")
        elif key == "items":
            check_supported_keywords(value, f"{at}/items")
        elif key == "additionalProperties":
            if isinstance(value, dict):
                check_supported_keywords(value, f"{at}/additionalProperties")
            elif not isinstance(value, bool):
                raise InfrastructureFailure(
                    f"additionalProperties at {at} must be a boolean or a schema object, "
                    f"got {value!r}"
                )
        elif key == "oneOf":
            for i, sub in enumerate(value):
                check_supported_keywords(sub, f"{at}/oneOf/{i}")


SUPPORTED_TYPE_NAMES = ("null", "boolean", "object", "array", "string", "integer", "number")


def type_matches(value, type_name):
    if type_name == "null":
        return value is None
    if type_name == "boolean":
        return isinstance(value, bool)
    if type_name == "object":
        return isinstance(value, dict)
    if type_name == "array":
        return isinstance(value, list)
    if type_name == "string":
        return isinstance(value, str)
    if type_name == "integer":
        return isinstance(value, int) and not isinstance(value, bool)
    if type_name == "number":
        return isinstance(value, (int, float)) and not isinstance(value, bool)
    raise InfrastructureFailure(f"unsupported type name in schema: {type_name!r}")


def validate_value(value, schema, at, errors):
    if "type" in schema:
        allowed = schema["type"] if isinstance(schema["type"], list) else [schema["type"]]
        # Validate every type name BEFORE matching: any() short-circuits on the first
        # match, which would let an unsupported name later in the array pass silently.
        for t in allowed:
            if t not in SUPPORTED_TYPE_NAMES:
                raise InfrastructureFailure(f"unsupported type name in schema: {t!r}")
        if not any(type_matches(value, t) for t in allowed):
            errors.append(f"{at}: expected type {allowed}, got {type(value).__name__}")
            return
    if "enum" in schema and value not in schema["enum"]:
        errors.append(f"{at}: value {value!r} not in enum {schema['enum']}")
    if "oneOf" in schema:
        matched = 0
        for sub in schema["oneOf"]:
            trial = []
            validate_value(value, sub, at, trial)
            if not trial:
                matched += 1
        if matched != 1:
            errors.append(f"{at}: matched {matched} oneOf branches, expected exactly 1")
    if isinstance(value, dict):
        for name in schema.get("required", []):
            if name not in value:
                errors.append(f"{at}: missing required property '{name}'")
        properties = schema.get("properties", {})
        additional = schema.get("additionalProperties", True)
        for name, item in value.items():
            child_at = f"{at}/{name}"
            if name in properties:
                validate_value(item, properties[name], child_at, errors)
            elif additional is False:
                errors.append(f"{at}: unexpected additional property '{name}'")
            elif isinstance(additional, dict):
                validate_value(item, additional, child_at, errors)
    if isinstance(value, list) and "items" in schema:
        for i, item in enumerate(value):
            validate_value(item, schema["items"], f"{at}/{i}", errors)


def cmd_validate(args):
    schema = load_json_file(args.schema, "schema")
    envelope = load_json_file(args.envelope, "envelope")
    check_supported_keywords(schema)
    errors = []
    validate_value(envelope, schema, "#", errors)
    return emit({"ok": not errors, "errors": errors})


# --- journal -------------------------------------------------------------------

JOURNAL_REQUIRED = ("ts", "run_id", "skill", "phase", "status")
JOURNAL_OPTIONAL = ("detail", "artifacts")
JOURNAL_STATUSES = ("started", "completed", "failed", "skipped", "accepted", "not-accepted")


def journal_validate(record):
    if not isinstance(record, dict):
        return "record must be a JSON object"
    missing = [k for k in JOURNAL_REQUIRED if k not in record]
    if missing:
        return f"record missing required field(s): {missing} (required: {list(JOURNAL_REQUIRED)})"
    for key in JOURNAL_REQUIRED:
        if not isinstance(record[key], str):
            return f"record field '{key}' must be a string"
    if record["status"] not in JOURNAL_STATUSES:
        return f"record status {record['status']!r} not in {list(JOURNAL_STATUSES)}"
    unknown = [k for k in record if k not in JOURNAL_REQUIRED + JOURNAL_OPTIONAL]
    if unknown:
        return f"record has unknown field(s): {unknown}"
    return None


def cmd_journal(args):
    # Journaling never blocks the caller: every failure below is ok:false + exit 0.
    raw = args.record
    if raw is None:
        try:
            with open(args.record_file, "r", encoding="utf-8") as fh:
                raw = fh.read()
        except OSError as exc:
            return emit({"ok": False, "note": f"cannot read record file {args.record_file}: {exc}"})
    try:
        record = json.loads(raw)
    except json.JSONDecodeError as exc:
        return emit({"ok": False, "note": f"record is not valid JSON: {exc}"})
    problem = journal_validate(record)
    if problem:
        return emit({"ok": False, "note": problem})
    line = json.dumps(record) + "\n"
    last_error = None
    for _attempt in range(2):  # one retry on a transient write failure
        try:
            parent = os.path.dirname(os.path.abspath(args.file))
            if parent:
                os.makedirs(parent, mode=0o700, exist_ok=True)
            with open(args.file, "a", encoding="utf-8") as fh:
                fh.write(line)
            return emit({"ok": True, "note": f"appended 1 record to {args.file}"})
        except OSError as exc:
            last_error = exc
    return emit({"ok": False, "note": f"append failed after retry: {last_error}"})


# --- entry point ---------------------------------------------------------------


def build_parser():
    parser = argparse.ArgumentParser(
        prog="factory-gates.py",
        description="Deterministic claim-verification gates (see module docstring for the exit-code contract).",
    )
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("artifacts", help="verify claimed artifact paths exist and are non-empty")
    p.add_argument("--claims", required=True)
    p.set_defaults(func=cmd_artifacts)

    p = sub.add_parser("diff-claims", help="compare claimed changed files against actual git state")
    p.add_argument("--claims", required=True)
    p.add_argument("--repo", required=True)
    p.add_argument("--base", help="also count committed changes since this ref (for runs that commit)")
    p.set_defaults(func=cmd_diff_claims)

    p = sub.add_parser("verdict", help="flag self-contradictory review reports or acceptance records")
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--report")
    group.add_argument("--acceptance")
    p.set_defaults(
        func=lambda a: cmd_verdict_report(a.report) if a.report else cmd_verdict_acceptance(a.acceptance)
    )

    p = sub.add_parser("validate", help="validate an envelope file against a JSON-Schema-subset file")
    p.add_argument("--schema", required=True)
    p.add_argument("--envelope", required=True)
    p.set_defaults(func=cmd_validate)

    p = sub.add_parser("journal", help="append one validated JSONL record (best-effort, never fails the caller)")
    p.add_argument("--file", required=True)
    group = p.add_mutually_exclusive_group(required=True)
    group.add_argument("--record")
    group.add_argument("--record-file")
    p.set_defaults(func=cmd_journal)

    return parser


def main(argv=None):
    args = build_parser().parse_args(argv)
    try:
        return args.func(args)
    except InfrastructureFailure as exc:
        print(f"factory-gates: infrastructure failure: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
