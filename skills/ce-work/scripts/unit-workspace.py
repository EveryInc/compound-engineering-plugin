#!/usr/bin/env python3
"""CLI entrypoint for the ce-work crash-recoverable workspace controller."""

from __future__ import annotations

import argparse
import json
import os
import sys

from unit_workspace_state import Operational, TrustFailure, cmd_checkpoint_plan, cmd_init
from unit_workspace_jobs import cmd_authorize_dispatch, cmd_prepare, cmd_record_job, cmd_sync_job, cmd_terminalize
from unit_workspace_integration import (
    cmd_integration_acquire,
    cmd_integration_release,
    cmd_mark_applied,
    cmd_mark_committed,
    cmd_mark_verified,
    cmd_preflight,
    cmd_restore,
    cmd_wave_advance,
)
from unit_workspace_lifecycle import cmd_claim_fallback, cmd_cleanup, cmd_reap, cmd_resume, cmd_status
from unit_workspace_transaction import cmd_integrate, cmd_verify_run


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="unit-workspace.py")
    sub = parser.add_subparsers(dest="command", required=True)

    p = sub.add_parser("init")
    p.add_argument("--run-id", required=True)
    p.add_argument("--repo", required=True)
    p.add_argument("--plan", required=True)
    p.add_argument("--plan-digest", required=True)
    p.add_argument("--binding-json", default="{}")
    p.add_argument("--egress-json", default="{}")

    p = sub.add_parser("checkpoint-plan")
    p.add_argument("--run-id", required=True)

    p = sub.add_parser("prepare")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--base", required=True)
    p.add_argument("--packet", required=True)
    p.add_argument("--attempt-id", default="attempt-1")
    p.add_argument("--activity-posture", choices=("incremental", "hard-only"), default="hard-only")
    p.add_argument("--dependency", action="append", default=[])
    p.add_argument("--wave-id")
    p.add_argument("--wave-position", type=int, default=0)

    p = sub.add_parser("record-job")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--attempt-id", required=True)
    p.add_argument("--job-id", required=True)

    p = sub.add_parser("authorize-dispatch")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--attempt-id", required=True)
    p.add_argument("--job-id", required=True)
    p.add_argument("--authorization", required=True)
    p.add_argument("--authorization-digest", required=True)
    p.add_argument("--workspace", required=True)
    p.add_argument("--packet", required=True)
    p.add_argument("--packet-digest", required=True)
    p.add_argument("--result-dir", required=True)

    for name in ("sync-job", "terminalize", "reap"):
        p = sub.add_parser(name)
        p.add_argument("--run-id", required=True)
        p.add_argument("--unit-id", required=True)

    p = sub.add_parser("integration-acquire")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--resume", action="store_true")

    p = sub.add_parser("preflight")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)
    p.add_argument("--allowed-head", action="append", default=[])

    p = sub.add_parser("mark-applied")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)

    p = sub.add_parser("mark-verified")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)
    p.add_argument("--evidence-digest", required=True)
    p.add_argument("--summary", default="authoritative verification passed")

    p = sub.add_parser("mark-committed")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)

    p = sub.add_parser("integrate")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--commit-message", required=True)
    p.add_argument("--verification-summary", default="authoritative verification passed")
    p.add_argument("--allowed-head", action="append", default=[])
    p.add_argument("verification_command", nargs=argparse.REMAINDER)

    p = sub.add_parser("verify-run")
    p.add_argument("--run-id", required=True)
    p.add_argument("--verification-summary", default="plan-wide authoritative verification passed")
    p.add_argument("verification_command", nargs=argparse.REMAINDER)

    p = sub.add_parser("wave-advance")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)
    p.add_argument("--canonical-commit", required=True)

    p = sub.add_parser("restore")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)

    p = sub.add_parser("status")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id")

    p = sub.add_parser("resume")
    p.add_argument("--run-id")
    p.add_argument("--repo")
    p.add_argument("--plan-digest")

    p = sub.add_parser("claim-fallback")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--caller-mode", choices=("interactive", "headless"), required=True)
    p.add_argument("--confirm-native", action="store_true")

    p = sub.add_parser("cleanup")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--abandon", action="store_true")
    p.add_argument("--expect-transport")
    p.add_argument("--expect-job")

    p = sub.add_parser("integration-release")
    p.add_argument("--run-id", required=True)
    p.add_argument("--unit-id", required=True)
    p.add_argument("--lock-token", required=True)
    return parser


COMMANDS = {
    "init": cmd_init,
    "checkpoint-plan": cmd_checkpoint_plan,
    "prepare": cmd_prepare,
    "authorize-dispatch": cmd_authorize_dispatch,
    "record-job": cmd_record_job,
    "sync-job": cmd_sync_job,
    "terminalize": cmd_terminalize,
    "integration-acquire": cmd_integration_acquire,
    "preflight": cmd_preflight,
    "mark-applied": cmd_mark_applied,
    "mark-verified": cmd_mark_verified,
    "mark-committed": cmd_mark_committed,
    "integrate": cmd_integrate,
    "verify-run": cmd_verify_run,
    "wave-advance": cmd_wave_advance,
    "restore": cmd_restore,
    "status": cmd_status,
    "resume": cmd_resume,
    "claim-fallback": cmd_claim_fallback,
    "reap": cmd_reap,
    "cleanup": cmd_cleanup,
    "integration-release": cmd_integration_release,
}


def main(argv: list[str]) -> int:
    os.umask(0o077)
    args = build_parser().parse_args(argv)
    try:
        word, body = COMMANDS[args.command](args)
        print(word)
        print(json.dumps(body, sort_keys=True, separators=(",", ":")))
        return 0
    except TrustFailure as exc:
        print("UNREADABLE")
        sys.stderr.write(f"unit-workspace: {exc}\n")
        return 4
    except Operational as exc:
        print(exc.word)
        if exc.detail:
            print(json.dumps(exc.detail, sort_keys=True, separators=(",", ":")))
        sys.stderr.write(f"unit-workspace: {exc}\n")
        return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
