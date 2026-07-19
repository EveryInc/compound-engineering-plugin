#!/usr/bin/env python3
"""Unit-level checks for peer-job-runner.py that need in-process monkeypatching.

Driven by tests/skills/peer-job-runner.test.ts (which hard-asserts this file
passes). Two concerns live here because they cannot be exercised from the CLI
surface:

- Ownership check (mandatory): a job-state or result file whose fstat uid does
  not match the current euid must be reported "unreadable" and its content must
  NEVER be emitted — for both the `status` and `result` paths. Simulated by
  patching os.fstat on the opened descriptor.
- Job-id collision: the atomic os.mkdir claim must regenerate the id on
  collision, with bounded retries.
"""
import importlib.util
import io
import json
import os
import stat as stat_mod
import subprocess
import tempfile
import time
import types
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

_HERE = os.path.dirname(os.path.abspath(__file__))
RUNNER_PATH = os.environ.get("PEER_JOB_RUNNER") or os.path.normpath(
    os.path.join(
        _HERE, "..", "..", "skills", "ce-doc-review", "scripts",
        "peer-job-runner.py",
    )
)


def load_runner():
    spec = importlib.util.spec_from_file_location("peer_job_runner", RUNNER_PATH)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


MOD = load_runner()
REAL_FSTAT = os.fstat


def uid_mismatch_fstat(only_devino=None):
    """A fake os.fstat reporting a foreign uid — for every fd, or only for the
    file identified by (st_dev, st_ino) when only_devino is given."""

    def fake(fd):
        st = REAL_FSTAT(fd)
        if only_devino is None or (st.st_dev, st.st_ino) == only_devino:
            return types.SimpleNamespace(
                st_uid=st.st_uid + 1, st_mode=st.st_mode, st_size=st.st_size
            )
        return st

    return fake


def make_done_job():
    """A fabricated terminal job dir (status=done) with a published result."""
    root = tempfile.mkdtemp(prefix="peer-unit-")
    job_dir = os.path.join(root, "job")
    os.mkdir(job_dir, 0o700)
    result = os.path.join(root, "result.json")
    with open(result, "w") as f:
        f.write('{"secret":"SECRET-CONTENT"}')
    meta = {
        "job_id": "job",
        "skill": "ce-doc-review",
        "run_id": "run1",
        "result_path": result,
    }
    with open(os.path.join(job_dir, "meta.json"), "w") as f:
        json.dump(meta, f)
    with open(os.path.join(job_dir, "status"), "w") as f:
        f.write("done\n")
    return job_dir, result


def run_main(argv):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        code = MOD.main(argv)
    return code, out.getvalue(), err.getvalue()


class OwnershipCheck(unittest.TestCase):
    def test_status_reports_unreadable_on_uid_mismatch(self):
        job_dir, _ = make_done_job()
        with mock.patch("os.fstat", uid_mismatch_fstat()):
            code, out, err = run_main(["status", job_dir])
        self.assertEqual(out.strip(), "unreadable")
        self.assertNotIn("done", out)
        self.assertNotIn("SECRET", out + err)

    def test_result_refuses_when_job_state_not_ours(self):
        job_dir, _ = make_done_job()
        with mock.patch("os.fstat", uid_mismatch_fstat()):
            code, out, err = run_main(["result", job_dir])
        self.assertEqual(code, 4)
        self.assertEqual(out, "")
        self.assertNotIn("SECRET", out + err)

    def test_result_refuses_when_result_file_not_ours(self):
        job_dir, result = make_done_job()
        st = os.stat(result)
        with mock.patch(
            "os.fstat", uid_mismatch_fstat((st.st_dev, st.st_ino))
        ):
            code, out, err = run_main(["result", job_dir])
        self.assertEqual(code, 4)
        self.assertEqual(out, "")
        self.assertNotIn("SECRET", out + err)

    def test_control_owned_job_emits_content(self):
        # Control: without the patch the same fabricated job succeeds, proving
        # the tests above exercise the ownership check and nothing else.
        job_dir, _ = make_done_job()
        code, out, err = run_main(["result", job_dir])
        self.assertEqual(code, 0)
        self.assertIn("SECRET-CONTENT", out)


class CollisionClaim(unittest.TestCase):
    def test_second_claim_regenerates_id(self):
        jobs_root = tempfile.mkdtemp(prefix="peer-claim-")
        ids = iter(["fixed", "fixed", "fresh"])
        with mock.patch.object(MOD, "mint_job_id", lambda: next(ids)):
            id1, dir1 = MOD.claim_job_dir(jobs_root)
            id2, _ = MOD.claim_job_dir(jobs_root)
        self.assertEqual(id1, "fixed")
        self.assertEqual(id2, "fresh")
        self.assertEqual(stat_mod.S_IMODE(os.stat(dir1).st_mode), 0o700)

    def test_claim_is_bounded_when_ids_never_free(self):
        jobs_root = tempfile.mkdtemp(prefix="peer-claim-")
        with mock.patch.object(MOD, "mint_job_id", lambda: "stuck"):
            MOD.claim_job_dir(jobs_root)
            with self.assertRaises(MOD.RunnerError):
                MOD.claim_job_dir(jobs_root)


class SafeTokenAllDots(unittest.TestCase):
    def test_all_dot_tokens_rejected_but_dotted_names_allowed(self):
        # "." / ".." / "..." pass the charset regex yet are path components that
        # escape the jobs root; they must be rejected outright.
        self.assertFalse(MOD._is_safe_token("."))
        self.assertFalse(MOD._is_safe_token(".."))
        self.assertFalse(MOD._is_safe_token("..."))
        self.assertTrue(MOD._is_safe_token("a.b"))

    def test_resolve_job_dir_rejects_dotdot(self):
        # With a populated <root>/<skill>/<run>/jobs tree, a glob for ".." would
        # match the run dir itself — resolve must raise before globbing.
        root = tempfile.mkdtemp(prefix="peer-resolve-")
        os.makedirs(os.path.join(root, "ce-doc-review", "run1", "jobs"))
        with mock.patch.dict(os.environ, {"CE_PEER_JOBS_ROOT": root}):
            with self.assertRaises(MOD.RunnerError):
                MOD.resolve_job_dir("..")


class PosixDetachPreflight(unittest.TestCase):
    def test_returns_silently_when_fork_and_setsid_present(self):
        self.assertIsNone(MOD._require_posix_detach())

    def test_blocks_before_jobs_root_base_when_fork_setsid_missing(self):
        # Regression (#1186 review): on native Windows, os.fork/os.setsid are
        # ALSO missing alongside os.geteuid/os.getuid, so cmd_start must reject
        # via _require_posix_detach() before ever calling jobs_root_base() --
        # otherwise jobs_root_base()'s unrelated "effective user ID is
        # unavailable" error fires first and the clearer WSL/#1184 message
        # never shows on the default (no CE_PEER_JOBS_ROOT) invocation path.
        real_fork, real_setsid = os.fork, os.setsid
        del os.fork
        del os.setsid
        try:
            with mock.patch.object(
                MOD,
                "jobs_root_base",
                side_effect=AssertionError(
                    "jobs_root_base must not run before the POSIX detach check"
                ),
            ):
                with self.assertRaises(MOD.RunnerError) as cm:
                    MOD.cmd_start(None, None)
            message = str(cm.exception)
            self.assertIn("os.fork/os.setsid", message)
            self.assertIn("1184", message)
        finally:
            os.fork = real_fork
            os.setsid = real_setsid


class PidRunningZombie(unittest.TestCase):
    def test_zombie_leader_counts_as_not_running(self):
        # A just-exited leader is briefly a <defunct> zombie: os.kill(pid, 0)
        # still succeeds, but the worker is gone. _pid_running must report it
        # dead so reap classifies died-without-result, not timeout. This test
        # process is the child's parent and never reaps it until the finally,
        # so the zombie is stable (no init-reap race).
        pid = os.fork()
        if pid == 0:
            os._exit(0)  # child exits immediately -> unreaped zombie
        try:
            deadline = time.monotonic() + 3.0
            state = ""
            while time.monotonic() < deadline:
                state = subprocess.run(
                    ["ps", "-o", "state=", "-p", str(pid)],
                    capture_output=True, text=True, check=False,
                ).stdout.strip()
                if state.startswith("Z"):
                    break
                time.sleep(0.02)
            self.assertTrue(
                state.startswith("Z"), f"child never became a zombie (state={state!r})"
            )
            self.assertTrue(MOD._pid_alive(pid))  # kill -0 succeeds for a zombie
            self.assertFalse(MOD._pid_running(pid))  # ...but it is not running
        finally:
            os.waitpid(pid, 0)  # reap the zombie


if __name__ == "__main__":
    unittest.main(verbosity=2)
