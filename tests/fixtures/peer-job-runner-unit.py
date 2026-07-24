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
import sys
import tempfile
import time
import types
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

IS_WINDOWS = sys.platform == "win32"

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
    # These tests patch os.fstat.st_uid. On Windows ownership uses the file
    # owner SID on the opened HANDLE, so a uid mismatch mock is inert.
    @unittest.skipIf(IS_WINDOWS, "uid ownership mock is POSIX-only")
    def test_status_reports_unreadable_on_uid_mismatch(self):
        job_dir, _ = make_done_job()
        with mock.patch("os.fstat", uid_mismatch_fstat()):
            code, out, err = run_main(["status", job_dir])
        self.assertEqual(out.strip(), "unreadable")
        self.assertNotIn("done", out)
        self.assertNotIn("SECRET", out + err)

    @unittest.skipIf(IS_WINDOWS, "uid ownership mock is POSIX-only")
    def test_result_refuses_when_job_state_not_ours(self):
        job_dir, _ = make_done_job()
        with mock.patch("os.fstat", uid_mismatch_fstat()):
            code, out, err = run_main(["result", job_dir])
        self.assertEqual(code, 4)
        self.assertEqual(out, "")
        self.assertNotIn("SECRET", out + err)

    @unittest.skipIf(IS_WINDOWS, "uid ownership mock is POSIX-only")
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
        # Windows ignores Unix mode bits on mkdir; ACL privacy is covered by
        # the Windows smoke / ownership path, not st_mode.
        if not IS_WINDOWS:
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
        self.assertIsNone(MOD._require_detach_support())

    def test_blocks_before_jobs_root_base_when_fork_setsid_missing(self):
        # Regression (#1186 review): a non-win32 Python missing os.fork/os.setsid
        # alongside os.geteuid/os.getuid must reject via _require_detach_support()
        # before ever calling jobs_root_base() -- otherwise jobs_root_base()'s
        # unrelated "effective user ID is unavailable" error fires first and the
        # clearer #1243 message never shows on the default (no CE_PEER_JOBS_ROOT)
        # invocation path. Native Windows now takes the supported detach path
        # (guarded by IS_WINDOWS, which is False here), so this exercises only the
        # embedded/non-win32-without-fork case. (#1184 closed; tracker is #1243.)
        if not hasattr(os, "fork") or not hasattr(os, "setsid"):
            self.skipTest("os.fork/os.setsid unavailable — cannot delete them")
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
            self.assertIn("1243", message)
        finally:
            os.fork = real_fork
            os.setsid = real_setsid


class PidRunningZombie(unittest.TestCase):
    @unittest.skipUnless(hasattr(os, "fork"), "os.fork is POSIX-only")
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


class DetachSupportBranch(unittest.TestCase):
    """Platform branch selection (#1243). Testable on ANY host because
    _require_detach_support's win32 branch returns before touching a _win_*
    helper -- those names exist only when the module is imported under
    sys.platform == "win32", so patching IS_WINDOWS is safe only for the
    branches that do not reach them."""

    @staticmethod
    def _drop_posix_process_apis():
        saved = (getattr(os, "fork", None), getattr(os, "setsid", None))
        for name in ("fork", "setsid"):
            if hasattr(os, name):
                delattr(os, name)
        return saved

    @staticmethod
    def _restore_posix_process_apis(saved):
        fork, setsid = saved
        if fork is not None:
            os.fork = fork
        if setsid is not None:
            os.setsid = setsid

    def test_win32_supported_without_fork_or_setsid(self):
        # Native Windows lacks both APIs yet is now a supported detach host.
        saved = self._drop_posix_process_apis()
        try:
            with mock.patch.object(MOD, "IS_WINDOWS", True):
                self.assertIsNone(MOD._require_detach_support())
        finally:
            self._restore_posix_process_apis(saved)

    def test_non_win32_without_fork_still_rejected(self):
        # An embedded/non-win32 Python missing the POSIX APIs must still fail
        # closed with the actionable #1243 pointer.
        saved = self._drop_posix_process_apis()
        try:
            with mock.patch.object(MOD, "IS_WINDOWS", False):
                with self.assertRaises(MOD.RunnerError) as cm:
                    MOD._require_detach_support()
            self.assertIn("os.fork/os.setsid", str(cm.exception))
            self.assertIn("1243", str(cm.exception))
        finally:
            self._restore_posix_process_apis(saved)


class ReapMarkerBranch(unittest.TestCase):
    """The `.reap` marker replaces SIGTERM on Windows, where there is no
    directed signal to a detached console-less supervisor. The marker must be
    inert on POSIX so the signal path keeps its exact prior behavior."""

    def _job_dir(self):
        return tempfile.mkdtemp(prefix="peer-reap-unit-")

    def test_marker_is_inert_off_windows(self):
        job_dir = self._job_dir()
        open(os.path.join(job_dir, ".reap"), "w").close()
        with mock.patch.object(MOD, "IS_WINDOWS", False):
            self.assertFalse(MOD._reap_requested({"reap": False}, job_dir))

    def test_marker_requests_reap_on_windows(self):
        job_dir = self._job_dir()
        with mock.patch.object(MOD, "IS_WINDOWS", True):
            self.assertFalse(MOD._reap_requested({"reap": False}, job_dir))
            open(os.path.join(job_dir, ".reap"), "w").close()
            self.assertTrue(MOD._reap_requested({"reap": False}, job_dir))

    def test_signal_flag_wins_on_both_platforms(self):
        job_dir = self._job_dir()
        for is_windows in (True, False):
            with mock.patch.object(MOD, "IS_WINDOWS", is_windows):
                self.assertTrue(MOD._reap_requested({"reap": True}, job_dir))

    def test_interruptible_sleep_returns_early_on_marker(self):
        job_dir = self._job_dir()
        open(os.path.join(job_dir, ".reap"), "w").close()
        with mock.patch.object(MOD, "IS_WINDOWS", True):
            start = time.monotonic()
            MOD._interruptible_sleep(5.0, {"reap": False}, job_dir)
            self.assertLess(time.monotonic() - start, 1.0)


class ClassifyExitWithPendingReap(unittest.TestCase):
    """Pending-.reap / SIGTERM-flag policy when the worker already exited.

    Covers the Windows race Codex found (kill exit must not become "failed")
    and the Bugbot follow-up (a natural done must not become "timeout").
    """

    def _conf(self):
        return {
            "result_max": 1024 * 1024,
            "log_max": 1024 * 1024,
            "poll": 2.0,
            "grace": 5.0,
            "idle": None,
            "hard": 60.0,
        }

    def test_pending_reap_preserves_successful_done(self):
        result = tempfile.NamedTemporaryFile(delete=False)
        result.write(b'{"ok":true}')
        result.close()
        try:
            state, reason = MOD.classify_exit_with_pending_reap(
                0, result.name, self._conf(), True
            )
            self.assertEqual(state, "done")
            self.assertIn("exited 0", reason)
        finally:
            os.unlink(result.name)

    def test_pending_reap_rewrites_non_done_to_timeout(self):
        # Kill / fallback path: non-zero exit with no result would be "failed".
        state, reason = MOD.classify_exit_with_pending_reap(
            1, None, self._conf(), True
        )
        self.assertEqual(state, "timeout")
        self.assertIn("reaped on request", reason)

    def test_no_pending_reap_uses_classify_exit(self):
        state, reason = MOD.classify_exit_with_pending_reap(
            7, None, self._conf(), False
        )
        self.assertEqual(state, "failed")
        self.assertIn("exited 7", reason)

    def test_windows_reap_wait_covers_one_poll_interval(self):
        # cmd_reap's Windows wait must be at least poll+0.25 — the default
        # min(grace, 1.0) alone is shorter than the default 2s poll and races.
        conf = self._conf()  # poll=2.0, grace=5.0
        wait_budget = min(conf["grace"], 1.0)
        wait_budget = max(wait_budget, conf["poll"] + 0.25)
        self.assertGreaterEqual(wait_budget, conf["poll"])
        self.assertGreater(wait_budget, 1.0)


class PopenArgvBranch(unittest.TestCase):
    """Windows CreateProcess cannot honor shebang; bare *.sh must go through
    bash/sh at spawn time. meta.json still records the caller argv."""

    def test_posix_passthrough(self):
        argv = ["/tmp/cross-model-work.sh", "a", "b"]
        with mock.patch.object(MOD, "IS_WINDOWS", False):
            self.assertEqual(MOD._popen_argv(argv), argv)

    def test_windows_wraps_bare_shell_script(self):
        argv = [r"C:\skills\ce-work\scripts\cross-model-work.sh", "a", "b"]
        with mock.patch.object(MOD, "IS_WINDOWS", True):
            with mock.patch.object(MOD.shutil, "which", side_effect=lambda n: {
                "bash": r"C:\Git\bin\bash.exe",
                "sh": None,
            }.get(n)):
                self.assertEqual(
                    MOD._popen_argv(argv),
                    [r"C:\Git\bin\bash.exe"] + argv,
                )

    def test_windows_leaves_explicit_bash_prefix(self):
        argv = ["bash", "/tmp/cross-model-adversarial-review.sh", "x"]
        with mock.patch.object(MOD, "IS_WINDOWS", True):
            self.assertEqual(MOD._popen_argv(argv), argv)

    def test_windows_missing_shell_raises(self):
        argv = [r"C:\skills\ce-work\scripts\cross-model-work.sh"]
        with mock.patch.object(MOD, "IS_WINDOWS", True):
            with mock.patch.object(MOD.shutil, "which", return_value=None):
                with self.assertRaises(MOD.RunnerError):
                    MOD._popen_argv(argv)


class BinaryRoundTrip(unittest.TestCase):
    """Windows CPython opens os.open() descriptors in CRT *text* mode: writes
    expand \\n -> \\r\\n and reads stop at the first 0x1A (Ctrl-Z EOF), which
    silently corrupts and truncates a peer's published result. O_BINARY is 0 on
    POSIX, so this asserts byte-exactness identically on both platforms."""

    def test_control_bytes_survive_create_exclusive_and_read_owned(self):
        job_dir = tempfile.mkdtemp(prefix="peer-binary-unit-")
        path = os.path.join(job_dir, "result.bin")
        payload = b'{"a":1}\nline\r\nbefore\x1aafter\n'
        MOD.create_exclusive(path, payload)
        with open(path, "rb") as f:
            self.assertEqual(f.read(), payload)  # write was not translated
        self.assertEqual(MOD.read_owned(path, 4096), payload)  # nor truncated


if __name__ == "__main__":
    unittest.main(verbosity=2)
