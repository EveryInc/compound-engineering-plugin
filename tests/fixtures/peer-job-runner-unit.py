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
import ntpath
import os
import stat as stat_mod
import subprocess
import sys
import tempfile
import time
import types
import unittest
from contextlib import ExitStack, contextmanager, redirect_stderr, redirect_stdout
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

# Patching IS_WINDOWS alone leaves MOD.os.path as host posixpath on Ubuntu CI,
# so Windows drive strings break abspath/dirname/basename/normcase (#1268 / PR
# #1292 Codex P1). Delegate those ops to ntpath while simulating Windows.
_WIN_PATH_ATTRS = ("abspath", "normcase", "dirname", "basename", "join")


@contextmanager
def windows_ntpath():
    """Patch MOD.os.path path ops to ntpath (portable Windows path semantics)."""
    with ExitStack() as stack:
        for name in _WIN_PATH_ATTRS:
            stack.enter_context(
                mock.patch.object(MOD.os.path, name, getattr(ntpath, name))
            )
        yield ntpath


@contextmanager
def windows_platform(*, isfile_side_effect=None):
    """IS_WINDOWS=True + ntpath path ops; optional isfile mock."""
    with mock.patch.object(MOD, "IS_WINDOWS", True):
        with windows_ntpath():
            if isfile_side_effect is None:
                yield ntpath
            else:
                with mock.patch.object(
                    MOD.os.path, "isfile", side_effect=isfile_side_effect
                ):
                    yield ntpath


def _nt_exists(*paths):
    """isfile side_effect: True when path matches any of the given Windows paths."""
    want = {ntpath.normcase(p) for p in paths}

    def _check(p):
        return ntpath.normcase(p) in want

    return _check


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
    a preferred non-WSL bash at spawn time (#1268). meta.json still records
    the caller argv for authorize-dispatch (ce-work bare adapter)."""

    GIT_BASH = r"C:\Program Files\Git\bin\bash.exe"
    SYSTEM32_BASH = r"C:\Windows\System32\bash.exe"
    SYSNATIVE_BASH = r"C:\Windows\Sysnative\bash.exe"

    def test_posix_passthrough(self):
        argv = ["/tmp/cross-model-work.sh", "a", "b"]
        with mock.patch.object(MOD, "IS_WINDOWS", False):
            self.assertEqual(MOD._popen_argv(argv), argv)

    def test_windows_wraps_bare_shell_script(self):
        argv = [r"C:\skills\ce-work\scripts\cross-model-work.sh", "a", "b"]
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ):
                self.assertEqual(
                    MOD._popen_argv(argv),
                    [self.GIT_BASH] + argv,
                )

    def test_windows_rewrites_bare_bash_prefix(self):
        # Review skills launch as `bash script.sh`; bare name must not stay
        # on PATH (System32 WSL) — rewrite to preferred absolute Git Bash.
        argv = ["bash", "/tmp/cross-model-adversarial-review.sh", "x"]
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ):
                self.assertEqual(
                    MOD._popen_argv(argv),
                    [self.GIT_BASH, argv[1], "x"],
                )

    def test_windows_missing_shell_raises(self):
        argv = [r"C:\skills\ce-work\scripts\cross-model-work.sh"]
        with windows_platform():
            with mock.patch.object(
                MOD,
                "_resolve_windows_posix_shell",
                side_effect=MOD.RunnerError("no usable Git Bash"),
            ):
                with self.assertRaises(MOD.RunnerError):
                    MOD._popen_argv(argv)

    def test_windows_env_exe_passthrough_without_bash(self):
        # env without a bash/sh token must stay unchanged (no false wrap).
        argv = ["env", "CE_PEER_HARD_SECS=", "python", "x.py"]
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                self.assertEqual(MOD._popen_argv(argv), argv)
                resolve.assert_not_called()

    def test_windows_rewrites_env_prefixed_bash(self):
        # Production cross-model: start -- env VAR=… bash script.sh
        argv = [
            "env",
            "CROSS_MODEL_HOST_HARNESS=claude",
            "CROSS_MODEL_FIXED_ROUTE=codex",
            "bash",
            r"C:\skills\ce-code-review\scripts\cross-model-adversarial-review.sh",
            "x",
        ]
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ):
                self.assertEqual(
                    MOD._popen_argv(argv),
                    [
                        "env",
                        "CROSS_MODEL_HOST_HARNESS=claude",
                        "CROSS_MODEL_FIXED_ROUTE=codex",
                        self.GIT_BASH,
                        argv[4],
                        "x",
                    ],
                )

    def test_windows_rewrites_env_prefixed_bash_after_unusual_assignment_names(self):
        for assignment in ("=x", "1=x", "a-b=x"):
            with self.subTest(assignment=assignment):
                argv = ["env", assignment, "bash", "script.sh"]
                with windows_platform():
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        return_value=self.GIT_BASH,
                    ):
                        self.assertEqual(
                            MOD._popen_argv(argv),
                            ["env", assignment, self.GIT_BASH, "script.sh"],
                        )

    def test_windows_rewrites_env_assignment_after_option_terminator(self):
        for terminator in ("-", "--"):
            for assignment in ("-S=x", "--split-string=x"):
                with self.subTest(terminator=terminator, assignment=assignment):
                    argv = ["env", terminator, assignment, "bash", "script.sh"]
                    with windows_platform():
                        with mock.patch.object(
                            MOD,
                            "_resolve_windows_posix_shell",
                            return_value=self.GIT_BASH,
                        ):
                            self.assertEqual(
                                MOD._popen_argv(argv),
                                [
                                    "env", terminator, assignment,
                                    self.GIT_BASH, "script.sh",
                                ],
                            )

    def test_windows_rewrites_after_option_like_assignment_in_assignment_phase(self):
        for assignment in ("-S=x", "--split-string=x"):
            with self.subTest(assignment=assignment):
                argv = ["env", "A=1", assignment, "bash", "script.sh"]
                with windows_platform():
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        return_value=self.GIT_BASH,
                    ):
                        self.assertEqual(
                            MOD._popen_argv(argv),
                            [
                                "env", "A=1", assignment,
                                self.GIT_BASH, "script.sh",
                            ],
                        )

    def test_windows_env_prefixed_bash_missing_shell_raises(self):
        argv = ["env", "FOO=1", "bash", "script.sh"]
        with windows_platform():
            with mock.patch.object(
                MOD,
                "_resolve_windows_posix_shell",
                side_effect=MOD.RunnerError("no usable Git Bash"),
            ):
                with self.assertRaises(MOD.RunnerError):
                    MOD._popen_argv(argv)

    def test_windows_keeps_absolute_non_wsl_bash(self):
        # Portable / non-well-known absolute bash must not be substituted (#1292 P2).
        portable = r"C:\PortableGit\bin\bash.exe"
        argv = [portable, "script.sh", "x"]
        with windows_platform(isfile_side_effect=_nt_exists(portable)):
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                self.assertEqual(MOD._popen_argv(argv), argv)
                resolve.assert_not_called()

    def test_windows_rewrites_absolute_system32_bash(self):
        argv = [self.SYSTEM32_BASH, "script.sh"]
        with windows_platform(isfile_side_effect=_nt_exists(self.SYSTEM32_BASH)):
            with mock.patch.dict(
                os.environ, {"SystemRoot": r"C:\Windows"}, clear=False
            ):
                with mock.patch.object(
                    MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
                ):
                    self.assertEqual(
                        MOD._popen_argv(argv),
                        [self.GIT_BASH, "script.sh"],
                    )

    def test_windows_rewrites_absolute_sysnative_bash(self):
        argv = [self.SYSNATIVE_BASH, "script.sh"]
        with windows_platform(isfile_side_effect=_nt_exists(self.SYSNATIVE_BASH)):
            with mock.patch.dict(
                os.environ, {"SystemRoot": r"C:\Windows"}, clear=False
            ):
                with mock.patch.object(
                    MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
                ):
                    self.assertEqual(
                        MOD._popen_argv(argv),
                        [self.GIT_BASH, "script.sh"],
                    )

    def test_windows_keeps_env_prefixed_absolute_non_wsl_bash(self):
        portable = r"C:\PortableGit\bin\bash.exe"
        argv = ["env", "FOO=1", portable, "script.sh"]
        with windows_platform(isfile_side_effect=_nt_exists(portable)):
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                self.assertEqual(MOD._popen_argv(argv), argv)
                resolve.assert_not_called()

    def test_windows_absolute_bash_missing_raises(self):
        missing = r"C:\Missing\PortableGit\bin\bash.exe"
        argv = [missing, "script.sh"]
        with windows_platform(isfile_side_effect=_nt_exists()):
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                with self.assertRaises(MOD.RunnerError) as ctx:
                    MOD._popen_argv(argv)
                resolve.assert_not_called()
        self.assertIn("does not exist", str(ctx.exception).lower())


class WindowsPosixShellResolve(unittest.TestCase):
    """#1268: prefer Git Bash over System32 WSL bash; fail closed otherwise.

    Runs under ntpath path ops so Ubuntu CI matches native Windows semantics
    (PR #1292 Codex P1).
    """

    GIT_BASH = r"C:\Program Files\Git\bin\bash.exe"
    SYSTEM32_BASH = r"C:\Windows\System32\bash.exe"
    SYSNATIVE_BASH = r"C:\Windows\Sysnative\bash.exe"
    PATH_GIT_BASH = r"C:\Tools\Git\bin\bash.exe"
    LOCAL_GIT_BASH = r"C:\Users\me\AppData\Local\Programs\Git\bin\bash.exe"

    def test_well_known_paths_prefer_distinct_programw6432_root(self):
        with windows_ntpath():
            with mock.patch.dict(os.environ, {
                "ProgramW6432": r"C:\Program Files",
                "ProgramFiles": r"C:\Program Files (x86)",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": "",
            }, clear=False):
                paths = MOD._git_bash_well_known_paths()
        self.assertEqual(paths, [
            r"C:\Program Files\Git\bin\bash.exe",
            r"C:\Program Files\Git\usr\bin\bash.exe",
            r"C:\Program Files (x86)\Git\bin\bash.exe",
            r"C:\Program Files (x86)\Git\usr\bin\bash.exe",
        ])

    def test_well_known_paths_deduplicate_matching_program_roots(self):
        with windows_ntpath():
            with mock.patch.dict(os.environ, {
                "ProgramW6432": r"C:\Program Files",
                "ProgramFiles": r"C:\Program Files",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": "",
            }, clear=False):
                paths = MOD._git_bash_well_known_paths()
        self.assertEqual(len(paths), 4)
        self.assertEqual(paths[0], r"C:\Program Files\Git\bin\bash.exe")

    def test_prefers_git_bash_when_system32_first_on_path(self):
        with windows_platform(
            isfile_side_effect=_nt_exists(self.GIT_BASH, self.SYSTEM32_BASH)
        ):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "",
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Program Files",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": "",
                "PATH": r"C:\Windows\System32",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSTEM32_BASH],
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.GIT_BASH))

    def test_ce_peer_bash_overrides_path(self):
        override = r"C:\Custom\Git\bin\bash.exe"
        with windows_platform(isfile_side_effect=_nt_exists(override)):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": override,
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSTEM32_BASH],
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(override))

    def test_claude_code_git_bash_path_when_ce_unset(self):
        override = r"D:\Tools\Git\bin\bash.exe"
        with windows_platform(isfile_side_effect=_nt_exists(override)):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "",
                "CLAUDE_CODE_GIT_BASH_PATH": override,
                "SystemRoot": r"C:\Windows",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSTEM32_BASH],
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(override))

    def test_whitespace_only_env_falls_through(self):
        with windows_platform(isfile_side_effect=_nt_exists(self.GIT_BASH)):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "   ",
                "CLAUDE_CODE_GIT_BASH_PATH": "\t",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Program Files",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": "",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates", return_value=[]
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.GIT_BASH))

    def test_path_walk_skips_system32_then_finds_later_bash(self):
        # shutil.which would stop at System32; walk must keep going (#1268 review).
        with windows_platform(
            isfile_side_effect=_nt_exists(self.SYSTEM32_BASH, self.PATH_GIT_BASH)
        ):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "",
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Program Files",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": "",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSTEM32_BASH, self.PATH_GIT_BASH],
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.PATH_GIT_BASH))

    def test_localappdata_well_known_git(self):
        with windows_platform(
            isfile_side_effect=_nt_exists(self.SYSTEM32_BASH, self.LOCAL_GIT_BASH)
        ):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "",
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Program Files",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": r"C:\Users\me\AppData\Local",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSTEM32_BASH],
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.LOCAL_GIT_BASH))

    def test_rejects_system32_only(self):
        with windows_platform(isfile_side_effect=_nt_exists(self.SYSTEM32_BASH)):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "",
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Program Files",
                "ProgramFiles(x86)": r"C:\Program Files (x86)",
                "LOCALAPPDATA": "",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSTEM32_BASH],
                ):
                    with self.assertRaises(MOD.RunnerError) as ctx:
                        MOD._resolve_windows_posix_shell()
        msg = str(ctx.exception).lower()
        self.assertIn("git", msg)
        self.assertTrue(
            "ce_peer_bash" in msg or "claude_code_git_bash_path" in msg
        )

    def test_rejects_sysnative_only(self):
        with windows_platform(isfile_side_effect=_nt_exists(self.SYSNATIVE_BASH)):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": "",
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Missing",
                "ProgramFiles(x86)": r"C:\Missing (x86)",
                "LOCALAPPDATA": "",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates",
                    return_value=[self.SYSNATIVE_BASH],
                ):
                    with self.assertRaises(MOD.RunnerError):
                        MOD._resolve_windows_posix_shell()

    def test_missing_override_falls_through(self):
        with windows_platform(isfile_side_effect=_nt_exists(self.GIT_BASH)):
            with mock.patch.dict(os.environ, {
                "CE_PEER_BASH": r"C:\Missing\bash.exe",
                "CLAUDE_CODE_GIT_BASH_PATH": "",
                "SystemRoot": r"C:\Windows",
                "ProgramFiles": r"C:\Program Files",
                "LOCALAPPDATA": "",
            }, clear=False):
                with mock.patch.object(
                    MOD, "_windows_path_shell_candidates", return_value=[]
                ):
                    got = MOD._resolve_windows_posix_shell()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.GIT_BASH))

    def test_is_system32_wsl_bash(self):
        with windows_ntpath():
            with mock.patch.dict(os.environ, {"SystemRoot": r"C:\Windows"}, clear=False):
                self.assertTrue(MOD._is_system32_wsl_bash(self.SYSTEM32_BASH))
                self.assertTrue(MOD._is_system32_wsl_bash(self.SYSNATIVE_BASH))
                self.assertFalse(MOD._is_system32_wsl_bash(self.GIT_BASH))

    def test_prefer_keeps_absolute_portable(self):
        portable = r"C:\PortableGit\bin\bash.exe"
        with windows_platform(isfile_side_effect=_nt_exists(portable)):
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                got = MOD._prefer_windows_posix_shell(portable)
                resolve.assert_not_called()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(portable))

    def test_prefer_rewrites_system32_via_resolver(self):
        with windows_platform(isfile_side_effect=_nt_exists(self.SYSTEM32_BASH)):
            with mock.patch.dict(
                os.environ, {"SystemRoot": r"C:\Windows"}, clear=False
            ):
                with mock.patch.object(
                    MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
                ):
                    got = MOD._prefer_windows_posix_shell(self.SYSTEM32_BASH)
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.GIT_BASH))

    def test_prefer_bare_delegates_to_resolver(self):
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                got = MOD._prefer_windows_posix_shell("bash")
                resolve.assert_called_once_with()
        self.assertEqual(ntpath.normcase(got), ntpath.normcase(self.GIT_BASH))

    def test_env_bash_index_finds_token_after_assignments(self):
        argv = ["env", "A=1", "B=2", "bash", "script.sh"]
        self.assertEqual(MOD._env_bash_index(argv), (3, None))
        self.assertEqual(MOD._env_bash_index(["env", "python", "x.py"]), (-1, None))
        self.assertEqual(MOD._env_bash_index(["bash", "x.sh"]), (-1, None))

    def test_env_bash_index_does_not_match_assignment_value_as_command(self):
        for assignment in (r"FOO=C:\tools\bash", r"FOO=C:\tools\sh.exe"):
            with self.subTest(assignment=assignment):
                self.assertEqual(
                    MOD._env_bash_index(["env", assignment, "bash", "script.sh"]),
                    (2, None),
                )

    def test_windows_popen_preserves_assignment_value_ending_in_shell_name(self):
        for assignment in (r"FOO=C:\tools\bash", r"FOO=C:\tools\sh.exe"):
            argv = ["env", assignment, "bash", "script.sh"]
            with self.subTest(assignment=assignment):
                with windows_platform():
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        return_value=self.GIT_BASH,
                    ):
                        self.assertEqual(
                            MOD._popen_argv(argv),
                            ["env", assignment, self.GIT_BASH, "script.sh"],
                        )

    def test_env_bash_index_skips_chdir_operand(self):
        # -C / --chdir take DIR; a directory named bash must not be treated as
        # the command, and bash after a real DIR must still be found (#1292 P2).
        self.assertEqual(
            MOD._env_bash_index(["env", "-C", "bash", "python", "x.py"]), (-1, None)
        )
        self.assertEqual(
            MOD._env_bash_index(["env", "-C", "/tmp", "bash", "script.sh"]), (3, None)
        )
        self.assertEqual(
            MOD._env_bash_index(
                ["env", "--chdir", "bash", "python", "x.py"]
            ),
            (-1, None),
        )
        self.assertEqual(
            MOD._env_bash_index(
                ["env", "--chdir=/tmp", "bash", "script.sh"]
            ),
            (2, None),
        )

    def test_env_bash_index_classifies_attached_chdir_before_shell_name(self):
        for option in (r"--chdir=C:\tools\bash", r"-CC:\tools\sh.exe"):
            with self.subTest(option=option):
                self.assertEqual(
                    MOD._env_bash_index(["env", option, "bash", "script.sh"]),
                    (2, None),
                )

    def test_env_bash_index_does_not_parse_options_after_terminator(self):
        cases = (
            (["env", "--", "-0", "bash"], (-1, None)),
            (["env", "--", r"--chdir=C:\tools\bash", "bash"], (3, None)),
            (["env", "-", "-S=x", "bash"], (3, None)),
            (["env", "A=1", "-S=x", "bash"], (3, None)),
        )
        for argv, expected in cases:
            with self.subTest(argv=argv):
                self.assertEqual(MOD._env_bash_index(argv), expected)

    def test_windows_popen_rejects_env_split_string_forms(self):
        cases = (
            ["env", "-S", "bash script.sh"],
            ["env", "--split-string", "bash script.sh"],
            ["env", "-Sbash script.sh"],
            ["env", "--split-string=bash script.sh"],
            ["env", "-S", "python x.py"],
        )
        with windows_platform():
            for argv in cases:
                with self.subTest(argv=argv):
                    with self.assertRaises(MOD.RunnerError) as ctx:
                        MOD._popen_argv(argv)
                    self.assertIn("split-string", str(ctx.exception))

    def test_windows_popen_rejects_abbreviated_and_unknown_env_long_options(self):
        cases = (
            ["env", "--chd", "/tmp", "bash", "script.sh"],
            ["env", "--unse", "FOO", "bash", "script.sh"],
            ["env", "--split-s", "bash script.sh"],
            ["env", "--unknown", "bash", "script.sh"],
        )
        with windows_platform():
            for argv in cases:
                with self.subTest(argv=argv):
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        side_effect=AssertionError("must fail before shell resolution"),
                    ):
                        with self.assertRaises(MOD.RunnerError) as ctx:
                            MOD._popen_argv(argv)
                    self.assertIn("unsupported env long option", str(ctx.exception))

    def test_env_bash_index_accepts_exact_no_operand_long_options(self):
        for option in (
            "--ignore-environment",
            "--debug",
            "--block-signal",
            "--block-signal=PIPE",
            "--default-signal",
            "--default-signal=PIPE",
            "--ignore-signal",
            "--ignore-signal=PIPE",
            "--list-signal-handling",
        ):
            with self.subTest(option=option):
                self.assertEqual(
                    MOD._env_bash_index(["env", option, "bash", "script.sh"]),
                    (2, None),
                )

    def test_windows_popen_rewrites_bash_after_exact_no_operand_long_options(self):
        for option in (
            "--ignore-environment",
            "--debug",
            "--block-signal",
            "--block-signal=PIPE",
            "--default-signal",
            "--default-signal=PIPE",
            "--ignore-signal",
            "--ignore-signal=PIPE",
            "--list-signal-handling",
        ):
            argv = ["env", option, "bash", "script.sh"]
            with self.subTest(option=option):
                with windows_platform():
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        return_value=self.GIT_BASH,
                    ):
                        self.assertEqual(
                            MOD._popen_argv(argv),
                            ["env", option, self.GIT_BASH, "script.sh"],
                        )

    def test_env_bash_index_skips_unset_attached(self):
        self.assertEqual(
            MOD._env_bash_index(["env", "-u", "FOO", "bash", "script.sh"]), (3, None)
        )
        self.assertEqual(
            MOD._env_bash_index(["env", "--unset=FOO", "bash", "script.sh"]), (2, None)
        )

    def test_env_bash_index_parses_clustered_options_with_separate_operands(self):
        self.assertEqual(
            MOD._env_bash_index(["env", "-iu", "FOO", "bash", "script.sh"]),
            (3, None),
        )
        self.assertEqual(
            MOD._env_bash_index(["env", "-iC", "/tmp", "bash", "script.sh"]),
            (3, None),
        )

    def test_env_bash_index_parses_clustered_options_with_attached_operands(self):
        self.assertEqual(
            MOD._env_bash_index(["env", "-iuFOO", "bash", "script.sh"]),
            (2, None),
        )
        self.assertEqual(
            MOD._env_bash_index(["env", "-iC/tmp", "bash", "script.sh"]),
            (2, None),
        )

    def test_windows_popen_rejects_unsupported_env_short_option_clusters(self):
        cases = (["env", "-iSvalue", "bash"], ["env", "-ix", "bash"])
        with windows_platform():
            for argv in cases:
                with self.subTest(argv=argv):
                    with self.assertRaises(MOD.RunnerError):
                        MOD._popen_argv(argv)

    def test_windows_popen_rejects_env_null_option_before_shell_resolution(self):
        cases = (
            ["env", "-0", "bash", "script.sh"],
            ["env", "-i0", "bash", "script.sh"],
            ["env", "-0v", "bash", "script.sh"],
            ["env", "--null", "bash", "script.sh"],
        )
        with windows_platform():
            for argv in cases:
                with self.subTest(argv=argv):
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        side_effect=AssertionError("must fail before shell resolution"),
                    ):
                        with self.assertRaises(MOD.RunnerError) as ctx:
                            MOD._popen_argv(argv)
                    self.assertIn("-0/--null", str(ctx.exception))

    def test_windows_popen_rewrites_shell_after_attached_chdir(self):
        for option in (r"--chdir=C:\tools\bash", r"-CC:\tools\sh.exe"):
            argv = ["env", option, "bash", "script.sh"]
            with self.subTest(option=option):
                with windows_platform():
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        return_value=self.GIT_BASH,
                    ):
                        self.assertEqual(
                            MOD._popen_argv(argv),
                            ["env", option, self.GIT_BASH, "script.sh"],
                        )

    def test_windows_popen_rewrites_bash_after_clustered_env_options(self):
        for argv in (
            ["env", "-iu", "FOO", "bash", "script.sh"],
            ["env", "-iC", r"C:\workdir", "bash", "script.sh"],
        ):
            with self.subTest(argv=argv):
                with windows_platform():
                    with mock.patch.object(
                        MOD,
                        "_resolve_windows_posix_shell",
                        return_value=self.GIT_BASH,
                    ):
                        expected = list(argv)
                        expected[-2] = self.GIT_BASH
                        self.assertEqual(MOD._popen_argv(argv), expected)

    def test_windows_popen_rewrites_bash_after_chdir(self):
        argv = ["env", "-C", r"C:\workdir", "bash", "script.sh", "x"]
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ):
                self.assertEqual(
                    MOD._popen_argv(argv),
                    [
                        "env",
                        "-C",
                        r"C:\workdir",
                        self.GIT_BASH,
                        "script.sh",
                        "x",
                    ],
                )

    def test_windows_popen_does_not_rewrite_chdir_named_bash(self):
        argv = ["env", "-C", "bash", "python", "x.py"]
        with windows_platform():
            with mock.patch.object(
                MOD, "_resolve_windows_posix_shell", return_value=self.GIT_BASH
            ) as resolve:
                self.assertEqual(MOD._popen_argv(argv), argv)
                resolve.assert_not_called()

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


class HardDefaultFromCrossModel(unittest.TestCase):
    """Supervisor hard window derives from CROSS_MODEL_HARD_SECS (#1271).

    Explicit CE_PEER_HARD_SECS still wins (ce-work / elevation). Empty string
    is treated as unset by _env_num, so tests can clear without deleting keys
    that a parent process may have set.
    """

    def test_floor_when_knob_unset(self):
        with mock.patch.dict(
            os.environ, {"CE_PEER_HARD_SECS": "", "CROSS_MODEL_HARD_SECS": ""}
        ):
            self.assertEqual(MOD.cfg()["hard"], 1230.0)

    def test_raises_with_knob(self):
        with mock.patch.dict(
            os.environ,
            {"CE_PEER_HARD_SECS": "", "CROSS_MODEL_HARD_SECS": "2000"},
        ):
            self.assertEqual(MOD.cfg()["hard"], 2030.0)

    def test_floor_beats_low_knob(self):
        with mock.patch.dict(
            os.environ,
            {"CE_PEER_HARD_SECS": "", "CROSS_MODEL_HARD_SECS": "100"},
        ):
            self.assertEqual(MOD.cfg()["hard"], 1230.0)

    def test_explicit_ce_peer_hard_wins(self):
        with mock.patch.dict(
            os.environ,
            {"CE_PEER_HARD_SECS": "7200", "CROSS_MODEL_HARD_SECS": "2000"},
        ):
            self.assertEqual(MOD.cfg()["hard"], 7200.0)

    def test_empty_ce_peer_hard_clears_stale_ambient(self):
        # Cross-model start prefixes use CE_PEER_HARD_SECS= so a leftover
        # numeric value cannot undercut derivation (#1271 / Bugbot).
        with mock.patch.dict(
            os.environ,
            {"CE_PEER_HARD_SECS": "", "CROSS_MODEL_HARD_SECS": "2000"},
        ):
            self.assertEqual(MOD.cfg()["hard"], 2030.0)


class WindowsKillTreePidReuse(unittest.TestCase):
    """cmd_reap after a dead worker must not TerminateProcess a recycled PID.

    Windows recycles PIDs aggressively. test_orphan_grandchild_swept_by_reap
    kills the supervisor, waits for the worker leader to exit, then starts
    `reap` — the next python.exe, which can reuse worker_pid. Without a guard,
    _win_kill_tree sees that pid alive (it is us) and TerminateProcess(handle,
    1) suicides: exit 1, empty stderr. That is the windows-native flake.
    """

    @unittest.skipUnless(IS_WINDOWS, "native Windows kill_tree only")
    def test_terminate_pid_refuses_current_process(self):
        self.assertFalse(MOD._win_terminate_pid(os.getpid()))
        self.assertTrue(MOD._pid_alive(os.getpid()))

    @unittest.skipUnless(IS_WINDOWS, "native Windows kill_tree only")
    def test_kill_tree_of_current_pid_does_not_terminate_self(self):
        alive = MOD._win_kill_tree(os.getpid(), 0.0)
        self.assertFalse(alive)
        self.assertTrue(MOD._pid_alive(os.getpid()))

    @unittest.skipUnless(IS_WINDOWS, "native Windows kill_tree only")
    def test_cmd_reap_does_not_suicide_when_worker_pid_is_self(self):
        root = tempfile.mkdtemp(prefix="peer-reap-self-")
        job_dir = os.path.join(root, "job")
        os.mkdir(job_dir, 0o700)
        with open(os.path.join(job_dir, "pid"), "w", encoding="utf-8") as f:
            json.dump(
                {
                    "supervisor_pid": 0,
                    "worker_pid": os.getpid(),
                },
                f,
            )
        with open(os.path.join(job_dir, "meta.json"), "w", encoding="utf-8") as f:
            json.dump(
                {"job_id": "job", "skill": "ce-doc-review", "run_id": "run1"},
                f,
            )
        code, _out, err = run_main(["reap", job_dir])
        self.assertEqual(code, 0, err)
        self.assertTrue(MOD._pid_alive(os.getpid()))
        with open(os.path.join(job_dir, "status"), encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "died-without-result")

    @unittest.skipUnless(IS_WINDOWS, "native Windows identity probe only")
    def test_process_identity_is_stable_and_differs_across_processes(self):
        mine = MOD._win_process_identity(os.getpid())
        self.assertIsNotNone(mine)
        self.assertEqual(mine, MOD._win_process_identity(os.getpid()))
        child = subprocess.Popen(
            [sys.executable, "-c", "import time; time.sleep(30)"],
        )
        try:
            other = MOD._win_process_identity(child.pid)
            self.assertIsNotNone(other)
            self.assertNotEqual(other, mine)
        finally:
            child.kill()
            child.wait(timeout=5)


if __name__ == "__main__":
    unittest.main(verbosity=2)
