#!/usr/bin/env python3
"""Inject a valid dispatch-unavailable receipt at a controller write boundary."""

from __future__ import annotations

import contextlib
import json
import sys
from types import SimpleNamespace


scripts_dir, mode, run_id, unit_id, job_id = sys.argv[1:]
sys.path.insert(0, scripts_dir)

import unit_workspace_jobs as jobs
import unit_workspace_lifecycle as lifecycle
import unit_workspace_state as state


target = jobs if mode == "record-job" else lifecycle
real_locked_manifest = target.locked_manifest
race_fired = False


def insert_receipt() -> None:
    with state.locked_manifest(run_id, write=True) as doc:
        unit = doc["units"][unit_id]
        attempt = jobs.find_attempt(unit, "attempt-1")
        reason = jobs.DISPATCH_UNAVAILABLE_REASONS["approval-denied"]
        attempt["dispatch_unavailable_receipt"] = {"at": jobs.now_iso(), "reason": reason}
        fallback = attempt.setdefault("fallback", {})
        fallback.update({"eligible": True, "reason": reason})
        fallback.setdefault("claimed", None)
        jobs.event(doc, "dispatch-unavailable-before-start", unit_id, {
            "attempt_id": "attempt-1",
            "reason": reason,
        })


@contextlib.contextmanager
def raced_locked_manifest(selected_run_id: str, write: bool = False):
    global race_fired
    if write and not race_fired:
        race_fired = True
        insert_receipt()
    with real_locked_manifest(selected_run_id, write=write) as doc:
        yield doc


target.locked_manifest = raced_locked_manifest
try:
    if mode == "record-job":
        result = jobs.cmd_record_job(SimpleNamespace(
            run_id=run_id,
            unit_id=unit_id,
            attempt_id="attempt-1",
            job_id=job_id,
        ))
    elif mode == "resume":
        result = lifecycle.cmd_resume(SimpleNamespace(
            run_id=run_id,
            repo=None,
            plan_digest=None,
        ))
    else:
        raise AssertionError(f"unsupported race mode: {mode}")
    word, body = result
except state.Operational as exc:
    word, body = exc.word, exc.detail or None

with state.locked_manifest(run_id) as doc:
    unit = doc["units"][unit_id]
    attempt = jobs.find_attempt(unit, "attempt-1")
    events = [event["kind"] for event in doc["events"]]

print(json.dumps({
    "word": word,
    "body": body,
    "race_fired": race_fired,
    "unit_state": unit["state"],
    "attempt": attempt,
    "events": events,
}, sort_keys=True))
