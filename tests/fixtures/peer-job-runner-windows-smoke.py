#!/usr/bin/env python3
"""Native Windows smoke for peer-job-runner.py (real Win32 APIs, no mocks).

Exercises the detach / wait / result / reap path and the orphan-grandchild
teardown that only Job Objects + Toolhelp32 can prove. Intended for
`windows-latest` CI — skip on non-Windows hosts.

Uses a Python worker (sys.executable), not a .sh adapter, so the core runner
path does not depend on Git Bash. A separate case checks bare-.sh preflight
wrapping when bash is on PATH.
"""

from __future__ import annotations

import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import types
import unittest
import unittest.mock

IS_WINDOWS = sys.platform == "win32"

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RUNNER = os.path.join(
    REPO_ROOT, "skills", "ce-doc-review", "scripts", "peer-job-runner.py"
)

_spec = importlib.util.spec_from_file_location("peer_job_runner_smoke", RUNNER)
MOD = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(MOD)

FAST = {
    "CE_PEER_POLL_SECS": "0.2",
    "CE_PEER_GRACE_SECS": "2",
    "CE_PEER_IDLE_SECS": "30",
    "CE_PEER_HARD_SECS": "60",
}


def _pid_alive(pid: int) -> bool:
    if pid <= 0:
        return False
    if IS_WINDOWS:
        # OpenProcess + wait with timeout 0: alive iff WAIT_TIMEOUT.
        import ctypes

        PROCESS_QUERY_LIMITED_INFORMATION = 0x1000
        SYNCHRONIZE = 0x00100000
        WAIT_TIMEOUT = 0x00000102
        handle = ctypes.windll.kernel32.OpenProcess(
            PROCESS_QUERY_LIMITED_INFORMATION | SYNCHRONIZE, False, pid
        )
        if not handle:
            return False
        try:
            return ctypes.windll.kernel32.WaitForSingleObject(handle, 0) == WAIT_TIMEOUT
        finally:
            ctypes.windll.kernel32.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except OSError:
        return False


@unittest.skipUnless(IS_WINDOWS, "native Windows smoke only")
class WindowsPeerJobSmoke(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="peer-win-smoke-")
        self.env = {
            **os.environ,
            **FAST,
            "CE_PEER_JOBS_ROOT": self.root,
        }
        self.assertTrue(os.path.isfile(RUNNER), f"missing runner: {RUNNER}")

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    # Hosted windows-latest Python intermittently fails `_ctypes` DLL init in a
    # freshly spawned process. The runner dies at its top-level `import ctypes`,
    # before any side effect, so relaunching any subcommand is safe. Only this
    # signature is retried; real failures surface on the first attempt. The CI
    # step's whole-suite retry remains as backstop for the same flake inside the
    # detached supervisor, which this spawn site cannot observe.
    _CTYPES_FLAKE = "DLL load failed while importing _ctypes"

    def _run(self, args, timeout=90):
        for attempt in range(3):
            proc = subprocess.run(
                [sys.executable, RUNNER, *args],
                env=self.env,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if proc.returncode == 0 or self._CTYPES_FLAKE not in (proc.stderr or ""):
                return proc
            if attempt < 2:
                time.sleep(1)
        return proc

    def _job_dir(self, job_id: str, skill="ce-doc-review", run_id="run1"):
        return os.path.join(self.root, skill, run_id, "jobs", job_id)

    def _read_pid(self, job_dir: str):
        with open(os.path.join(job_dir, "pid"), encoding="utf-8") as f:
            return json.load(f)

    def _out_log(self, job_id: str, limit=2000) -> str:
        """Worker stdout+stderr, so a dead worker fails loudly, not silently."""
        path = os.path.join(self._job_dir(job_id), "out.log")
        try:
            with open(path, encoding="utf-8", errors="replace") as f:
                return f.read()[-limit:]
        except OSError as exc:
            return f"<no out.log: {exc}>"

    def test_happy_path_start_wait_result_reap(self):
        result_path = os.path.join(self.root, "artifact.json")
        worker = [
            sys.executable,
            "-c",
            (
                "import json,os,sys;"
                f"p={result_path!r};"
                "open(p,'w',encoding='utf-8').write(json.dumps({'ok':True}));"
                "sys.exit(0)"
            ),
        ]
        started = self._run(
            [
                "start",
                "--skill",
                "ce-doc-review",
                "--run-id",
                "run1",
                "--result-path",
                result_path,
                "--",
                *worker,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        self.assertTrue(job_id, started.stdout)
        job_dir = self._job_dir(job_id)
        pid_doc = self._read_pid(job_dir)
        self.assertIn("job_name", pid_doc)  # Job Object assigned

        waited = self._run(["wait", "--max-secs", "30", job_id])
        self.assertEqual(waited.returncode, 0, waited.stderr)
        self.assertEqual(waited.stdout.strip(), "done")

        got = self._run(["result", job_id])
        self.assertEqual(got.returncode, 0, got.stderr)
        self.assertEqual(json.loads(got.stdout), {"ok": True})

        reaped = self._run(["reap", job_id])
        self.assertEqual(reaped.returncode, 0, reaped.stderr)
        # Second reap is a safe no-op.
        self.assertEqual(self._run(["reap", job_id]).returncode, 0)

    def test_detach_survival_past_start_call(self):
        marker = os.path.join(self.root, "still-writing.txt")
        # A script file, not `python -c`: a loop cannot follow `;` on one line,
        # so the one-liner form dies with SyntaxError before writing anything.
        worker_py = os.path.join(self.root, "detach_worker.py")
        with open(worker_py, "w", encoding="utf-8") as f:
            f.write(
                "import time\n"
                f"p = {marker!r}\n"
                "for i in range(20):\n"
                "    with open(p, 'a', encoding='utf-8') as fh:\n"
                "        fh.write(str(i) + '\\n')\n"
                "    time.sleep(0.25)\n"
            )
        t0 = time.monotonic()
        started = self._run(
            [
                "start",
                "--skill",
                "ce-doc-review",
                "--run-id",
                "run1",
                "--",
                sys.executable,
                worker_py,
            ]
        )
        start_ms = (time.monotonic() - t0) * 1000
        self.assertEqual(started.returncode, 0, started.stderr)
        self.assertLess(start_ms, 5000, f"start took {start_ms:.0f}ms — not detached")
        job_id = started.stdout.strip()
        time.sleep(0.8)
        self.assertTrue(
            os.path.isfile(marker),
            f"worker should outlive start; out.log:\n{self._out_log(job_id)}",
        )
        with open(marker, encoding="utf-8") as f:
            lines_mid = f.readlines()
        self.assertGreaterEqual(len(lines_mid), 1)
        time.sleep(0.8)
        with open(marker, encoding="utf-8") as f:
            lines_later = f.readlines()
        self.assertGreater(
            len(lines_later), len(lines_mid), "detached worker kept writing"
        )
        self.assertEqual(self._run(["reap", job_id]).returncode, 0)

    def test_orphan_grandchild_swept_by_reap(self):
        # Mirror the POSIX lifecycle regression: kill the supervisor, let the
        # worker leader exit, leave a live grandchild, then prove cmd_reap
        # sweeps it (taskkill /T from a dead leader cannot).
        grandchild_marker = os.path.join(self.root, "grandchild.pid")
        gate = os.path.join(self.root, "gate")
        open(gate, "w").close()
        worker_py = os.path.join(self.root, "orphan_worker.py")
        with open(worker_py, "w", encoding="utf-8") as f:
            f.write(
                "import os, subprocess, sys, time\n"
                f"marker = {grandchild_marker!r}\n"
                f"gate = {gate!r}\n"
                "subprocess.Popen([\n"
                "    sys.executable, '-c',\n"
                "    (\n"
                "        'import os, time; '\n"
                "        'open(%r, \"w\", encoding=\"utf-8\").write(str(os.getpid())); '\n"
                "        'time.sleep(120)'\n"
                "    ) % marker,\n"
                "])\n"
                "while os.path.exists(gate):\n"
                "    time.sleep(0.1)\n"
            )
        started = self._run(
            [
                "start",
                "--skill",
                "ce-doc-review",
                "--run-id",
                "run1",
                "--",
                sys.executable,
                worker_py,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        job_dir = self._job_dir(job_id)
        pid_doc = self._read_pid(job_dir)

        deadline = time.monotonic() + 20
        while time.monotonic() < deadline and not os.path.isfile(grandchild_marker):
            time.sleep(0.1)
        self.assertTrue(os.path.isfile(grandchild_marker), "grandchild never started")
        with open(grandchild_marker, encoding="utf-8") as f:
            grandchild_pid = int(f.read().strip())
        self.assertTrue(_pid_alive(grandchild_pid))

        # Kill supervisor so it cannot classify; then drop the gate so the
        # worker leader exits while the grandchild keeps running.
        subprocess.run(
            ["taskkill", "/F", "/PID", str(pid_doc["supervisor_pid"])],
            capture_output=True,
            check=False,
        )
        os.remove(gate)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and _pid_alive(pid_doc["worker_pid"]):
            time.sleep(0.1)
        self.assertFalse(_pid_alive(pid_doc["worker_pid"]), "worker leader should exit")
        self.assertTrue(
            _pid_alive(grandchild_pid),
            "grandchild must survive as an orphan before reap",
        )

        reaped = self._run(["reap", job_id])
        self.assertEqual(reaped.returncode, 0, reaped.stderr)
        deadline = time.monotonic() + 10
        while time.monotonic() < deadline and _pid_alive(grandchild_pid):
            time.sleep(0.1)
        self.assertFalse(
            _pid_alive(grandchild_pid),
            "reap must sweep the orphan grandchild",
        )

    def _write_stub_sh(self):
        stub = os.path.join(self.root, "stub.sh")
        with open(stub, "w", encoding="utf-8", newline="\n") as f:
            f.write("#!/usr/bin/env bash\nexit 0\n")
        return stub

    def _require_git_bash(self):
        try:
            return MOD._resolve_windows_posix_shell()
        except MOD.RunnerError:
            bash = shutil.which("bash") or shutil.which("sh")
            if bash is None:
                self.skipTest("no usable Git Bash / bash on this host")
            return bash

    def _require_git_env(self, bash):
        env_exe = shutil.which("env") or shutil.which("env.exe")
        if env_exe is None:
            candidates = (
                os.path.join(os.path.dirname(bash), "env.exe"),
                os.path.join(
                    os.path.dirname(os.path.dirname(bash)), "usr", "bin", "env.exe"
                ),
            )
            env_exe = next((path for path in candidates if os.path.isfile(path)), None)
        if env_exe is None:
            self.skipTest("no env.exe alongside Git Bash on this host")
        return env_exe

    def test_bare_sh_worker_wraps_when_bash_present(self):
        # Prefer the runner's Git-Bash resolver (#1268) over bare which():
        # System32 WSL bash or a missing PATH entry must not skip this smoke.
        self._require_git_bash()
        stub = self._write_stub_sh()
        started = self._run(
            ["start", "--skill", "ce-doc-review", "--run-id", "run1", "--", stub]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        waited = self._run(["wait", "--max-secs", "20", job_id])
        self.assertEqual(waited.returncode, 0, waited.stderr)
        self.assertEqual(waited.stdout.strip(), "done")
        meta_path = os.path.join(
            self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", "run1", "jobs",
            job_id, "meta.json",
        )
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        self.assertIn("windows_posix_shell", meta)
        self.assertFalse(
            MOD._is_system32_wsl_bash(meta["windows_posix_shell"]),
            meta["windows_posix_shell"],
        )

    def test_bash_prefix_worker_sets_meta_shell(self):
        bash = self._require_git_bash()
        stub = self._write_stub_sh()
        started = self._run(
            [
                "start", "--skill", "ce-doc-review", "--run-id", "run-bash-prefix",
                "--", "bash", stub,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        meta_path = os.path.join(
            self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", "run-bash-prefix",
            "jobs", job_id, "meta.json",
        )
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        self.assertIn("windows_posix_shell", meta)
        self.assertFalse(
            MOD._is_system32_wsl_bash(meta["windows_posix_shell"]),
            meta["windows_posix_shell"],
        )
        self.assertFalse(
            MOD._is_system32_wsl_bash(meta["worker_argv"][0]),
            meta["worker_argv"][0],
        )
        waited = self._run(["wait", "--max-secs", "20", job_id])
        self.assertEqual(waited.returncode, 0, waited.stderr)
        self.assertEqual(waited.stdout.strip(), "done")

    def test_env_prefixed_bash_worker_sets_meta_shell(self):
        # Production cross-model shape: start -- env VAR=… bash script.sh
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        started = self._run(
            [
                "start", "--skill", "ce-doc-review", "--run-id", "run-env-bash",
                "--", env_exe, "SMOKE_PEER=1", "bash", stub,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        meta_path = os.path.join(
            self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", "run-env-bash",
            "jobs", job_id, "meta.json",
        )
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        self.assertIn("windows_posix_shell", meta)
        self.assertFalse(
            MOD._is_system32_wsl_bash(meta["windows_posix_shell"]),
            meta["windows_posix_shell"],
        )
        # bash token rewritten to absolute non-WSL shell
        self.assertTrue(
            any(
                os.path.normcase(os.path.abspath(t))
                == os.path.normcase(os.path.abspath(meta["windows_posix_shell"]))
                for t in meta["worker_argv"]
            ),
            meta["worker_argv"],
        )
        waited = self._run(["wait", "--max-secs", "20", job_id])
        self.assertEqual(waited.returncode, 0, waited.stderr)
        self.assertEqual(waited.stdout.strip(), "done")

    def test_sysnative_shell_alias_is_classified_as_wsl(self):
        system_root = os.environ.get("SystemRoot") or r"C:\Windows"
        for name in ("bash.exe", "sh.exe"):
            with self.subTest(name=name):
                path = os.path.join(system_root, "Sysnative", name)
                self.assertTrue(MOD._is_system32_wsl_bash(path), path)

    def test_env_unusual_assignment_names_rewrite_to_git_bash(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        for index, assignment in enumerate(("=x", "1=x", "a-b=x"), start=1):
            with self.subTest(assignment=assignment):
                run_id = f"run-env-assignment-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, assignment, "bash", stub,
                    ]
                )
                self.assertEqual(started.returncode, 0, started.stderr)
                job_id = started.stdout.strip()
                meta_path = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id,
                    "jobs", job_id, "meta.json",
                )
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                self.assertEqual(meta["worker_argv"][1], assignment)
                self.assertEqual(
                    os.path.normcase(os.path.abspath(meta["worker_argv"][2])),
                    os.path.normcase(os.path.abspath(meta["windows_posix_shell"])),
                )
                waited = self._run(
                    ["wait", "--skill", "ce-doc-review", "--max-secs", "20", job_id]
                )
                self.assertEqual(waited.returncode, 0, waited.stderr)
                self.assertEqual(waited.stdout.strip(), "done")

    def test_env_assignment_value_ending_in_bash_remains_unchanged(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        assignment = r"SMOKE_PEER=C:\tools\bash"
        started = self._run(
            [
                "start", "--skill", "ce-doc-review", "--run-id",
                "run-env-value-bash", "--", env_exe, assignment, "bash", stub,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        meta_path = os.path.join(
            self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", "run-env-value-bash",
            "jobs", job_id, "meta.json",
        )
        with open(meta_path, encoding="utf-8") as f:
            meta = json.load(f)
        self.assertEqual(meta["worker_argv"][1], assignment)
        self.assertEqual(
            os.path.normcase(os.path.abspath(meta["worker_argv"][2])),
            os.path.normcase(os.path.abspath(meta["windows_posix_shell"])),
        )
        waited = self._run(
            ["wait", "--skill", "ce-doc-review", "--max-secs", "20", job_id]
        )
        self.assertEqual(waited.returncode, 0, waited.stderr)
        self.assertEqual(waited.stdout.strip(), "done")

    def test_env_option_terminator_allows_hyphen_prefixed_assignments(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        cases = (
            ("--", "-S=x"),
            ("--", "--split-string=x"),
            ("-", "-S=x"),
            ("-", "--split-string=x"),
        )
        for index, (terminator, assignment) in enumerate(cases, start=1):
            with self.subTest(terminator=terminator, assignment=assignment):
                run_id = f"run-env-option-terminator-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, terminator, assignment, "bash", stub,
                    ]
                )
                self.assertEqual(started.returncode, 0, started.stderr)
                job_id = started.stdout.strip()
                meta_path = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id,
                    "jobs", job_id, "meta.json",
                )
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                self.assertEqual(meta["worker_argv"][2], assignment)
                self.assertEqual(
                    os.path.normcase(os.path.abspath(meta["worker_argv"][3])),
                    os.path.normcase(os.path.abspath(meta["windows_posix_shell"])),
                )
                waited = self._run(
                    ["wait", "--skill", "ce-doc-review", "--max-secs", "20", job_id]
                )
                self.assertEqual(waited.returncode, 0, waited.stderr)
                self.assertEqual(waited.stdout.strip(), "done")

    def test_env_assignment_phase_allows_option_shaped_assignments(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        for index, assignment in enumerate(("-S=x", "--split-string=x"), start=1):
            with self.subTest(assignment=assignment):
                run_id = f"run-env-assignment-phase-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, "A=1", assignment, "bash", stub,
                    ]
                )
                self.assertEqual(started.returncode, 0, started.stderr)
                job_id = started.stdout.strip()
                waited = self._run(
                    ["wait", "--skill", "ce-doc-review", "--max-secs", "20", job_id]
                )
                self.assertEqual(waited.returncode, 0, waited.stderr)
                self.assertEqual(waited.stdout.strip(), "done")

    def test_env_exact_no_operand_long_options_rewrite_to_git_bash(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        options = (
            "--ignore-environment",
            "--debug",
            "--block-signal",
            "--block-signal=PIPE",
            "--default-signal",
            "--default-signal=PIPE",
            "--ignore-signal",
            "--ignore-signal=PIPE",
            "--list-signal-handling",
        )
        for index, option in enumerate(options, start=1):
            with self.subTest(option=option):
                run_id = f"run-env-long-option-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, option, "bash", stub,
                    ]
                )
                self.assertEqual(started.returncode, 0, started.stderr)
                job_id = started.stdout.strip()
                meta_path = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id,
                    "jobs", job_id, "meta.json",
                )
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                self.assertEqual(meta["worker_argv"][1], option)
                self.assertEqual(
                    os.path.normcase(os.path.abspath(meta["worker_argv"][2])),
                    os.path.normcase(os.path.abspath(meta["windows_posix_shell"])),
                )
                waited = self._run(
                    ["wait", "--skill", "ce-doc-review", "--max-secs", "20", job_id]
                )
                self.assertEqual(waited.returncode, 0, waited.stderr)
                self.assertEqual(waited.stdout.strip(), "done")

    def test_env_split_string_forms_fail_before_detach(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        cases = (
            ["-S", "bash -c 'exit 0'"],
            ["--split-string", "bash -c 'exit 0'"],
            ["-Sbash -c 'exit 0'"],
            ["--split-string=bash -c 'exit 0'"],
        )
        for index, env_args in enumerate(cases, start=1):
            with self.subTest(env_args=env_args):
                run_id = f"run-env-split-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, *env_args,
                    ]
                )
                self.assertNotEqual(started.returncode, 0)
                self.assertIn("split-string", started.stderr)
                jobs_root = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id, "jobs"
                )
                job_dirs = os.listdir(jobs_root)
                self.assertEqual(len(job_dirs), 1)
                self.assertFalse(os.path.exists(os.path.join(jobs_root, job_dirs[0], "pid")))

    def test_env_abbreviated_and_unknown_long_options_fail_before_detach(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        cases = (
            ["--chd", ".", "bash"],
            ["--unse", "FOO", "bash"],
            ["--split-s", "bash -c 'exit 0'"],
            ["--unknown", "bash"],
        )
        for index, env_args in enumerate(cases, start=1):
            with self.subTest(env_args=env_args):
                run_id = f"run-env-long-option-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, *env_args,
                    ]
                )
                self.assertNotEqual(started.returncode, 0)
                self.assertIn("unsupported env long option", started.stderr)
                jobs_root = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id, "jobs"
                )
                job_dirs = os.listdir(jobs_root)
                self.assertEqual(len(job_dirs), 1)
                self.assertFalse(os.path.exists(os.path.join(jobs_root, job_dirs[0], "pid")))

    def test_env_null_options_fail_before_detach(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        cases = (
            ["-0", "bash", "-c", "exit 0"],
            ["-i0", "bash", "-c", "exit 0"],
            ["-0v", "bash", "-c", "exit 0"],
            ["--null", "bash", "-c", "exit 0"],
        )
        for index, env_args in enumerate(cases, start=1):
            with self.subTest(env_args=env_args):
                run_id = f"run-env-null-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, *env_args,
                    ]
                )
                self.assertNotEqual(started.returncode, 0)
                self.assertIn("-0/--null", started.stderr)
                jobs_root = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id, "jobs"
                )
                job_dirs = os.listdir(jobs_root)
                self.assertEqual(len(job_dirs), 1)
                self.assertFalse(os.path.exists(os.path.join(jobs_root, job_dirs[0], "pid")))

    def test_env_attached_chdir_ending_in_shell_rewrites_actual_bash(self):
        bash = self._require_git_bash()
        env_exe = self._require_git_env(bash)
        stub = self._write_stub_sh()
        workdir = os.path.join(self.root, "bash")
        os.makedirs(workdir)
        for index, option in enumerate(
            (f"--chdir={workdir}", f"-C{workdir}"), start=1
        ):
            with self.subTest(option=option):
                run_id = f"run-env-attached-chdir-{index}"
                started = self._run(
                    [
                        "start", "--skill", "ce-doc-review", "--run-id", run_id,
                        "--", env_exe, option, "bash", stub,
                    ]
                )
                self.assertEqual(started.returncode, 0, started.stderr)
                job_id = started.stdout.strip()
                meta_path = os.path.join(
                    self.env["CE_PEER_JOBS_ROOT"], "ce-doc-review", run_id,
                    "jobs", job_id, "meta.json",
                )
                with open(meta_path, encoding="utf-8") as f:
                    meta = json.load(f)
                self.assertEqual(meta["worker_argv"][1], option)
                self.assertEqual(
                    os.path.normcase(os.path.abspath(meta["worker_argv"][2])),
                    os.path.normcase(os.path.abspath(meta["windows_posix_shell"])),
                )
                waited = self._run(
                    ["wait", "--skill", "ce-doc-review", "--max-secs", "20", job_id]
                )
                self.assertEqual(waited.returncode, 0, waited.stderr)
                self.assertEqual(waited.stdout.strip(), "done")

    def test_reap_during_long_poll_classifies_timeout_not_failed(self):
        # Regression (#1248): with poll=2s, min(grace, 1.0) alone races into
        # the fallback kill path and used to record "failed" from the kill
        # exit code. Wait must cover one poll tick; classification must be
        # timeout / reaped-on-request.
        self.env = {
            **self.env,
            "CE_PEER_POLL_SECS": "2.0",
            "CE_PEER_GRACE_SECS": "5",
            "CE_PEER_HARD_SECS": "120",
            "CE_PEER_IDLE_SECS": "120",
        }
        worker_py = os.path.join(self.root, "long_poll_worker.py")
        with open(worker_py, "w", encoding="utf-8") as f:
            f.write("import time\ntime.sleep(90)\n")
        started = self._run(
            [
                "start",
                "--skill",
                "ce-doc-review",
                "--run-id",
                "run1",
                "--",
                sys.executable,
                worker_py,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        job_dir = self._job_dir(job_id)
        # Give the supervisor time to enter its first poll sleep.
        time.sleep(0.3)
        reaped = self._run(["reap", job_id], timeout=30)
        self.assertEqual(reaped.returncode, 0, reaped.stderr)

        deadline = time.monotonic() + 25
        status = ""
        while time.monotonic() < deadline:
            status_path = os.path.join(job_dir, "status")
            if os.path.isfile(status_path):
                with open(status_path, encoding="utf-8") as f:
                    status = f.read().strip()
                if status in ("timeout", "failed", "done", "died-without-result"):
                    break
            time.sleep(0.1)
        self.assertEqual(
            status,
            "timeout",
            f"expected timeout from mid-poll reap, got {status!r}; "
            f"out.log:\n{self._out_log(job_id)}",
        )
        with open(os.path.join(job_dir, "reason"), encoding="utf-8") as f:
            reason = f.read()
        self.assertIn("reaped on request", reason)

    def test_late_reap_after_natural_done_preserves_done(self):
        # Regression (#1248 Bugbot): dropping .reap after a successful exit
        # must not rewrite done -> timeout. cmd_reap on a terminal job is a
        # no-op; also prove a stale marker left beside a done status is inert
        # for wait/result.
        result_path = os.path.join(self.root, "late-reap.json")
        worker = [
            sys.executable,
            "-c",
            (
                "import json,sys;"
                f"p={result_path!r};"
                "open(p,'w',encoding='utf-8').write(json.dumps({'ok':True}));"
                "sys.exit(0)"
            ),
        ]
        started = self._run(
            [
                "start",
                "--skill",
                "ce-doc-review",
                "--run-id",
                "run1",
                "--result-path",
                result_path,
                "--",
                *worker,
            ]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        job_dir = self._job_dir(job_id)
        waited = self._run(["wait", "--max-secs", "30", job_id])
        self.assertEqual(waited.returncode, 0, waited.stderr)
        self.assertEqual(waited.stdout.strip(), "done")

        with open(os.path.join(job_dir, ".reap"), "w", encoding="utf-8") as f:
            f.write("reap\n")
        # Terminal + stale marker: reap is a no-op; status stays done.
        self.assertEqual(self._run(["reap", job_id]).returncode, 0)
        with open(os.path.join(job_dir, "status"), encoding="utf-8") as f:
            self.assertEqual(f.read().strip(), "done")
        got = self._run(["result", job_id])
        self.assertEqual(got.returncode, 0, got.stderr)
        self.assertEqual(json.loads(got.stdout), {"ok": True})


class RunRetryGateUnit(unittest.TestCase):
    """Platform-independent coverage for `_run`'s signature-gated retry.

    The smoke class only ever exercises `_run`'s success path, and it is
    win32-gated, so without this class the retry/give-up/immediate-fail
    branches would run nowhere deterministically.
    """

    def setUp(self):
        # _run only reads self.env and self._CTYPES_FLAKE, so a stand-in object
        # avoids driving the smoke class's real filesystem setUp/tearDown.
        self.case = types.SimpleNamespace(
            env={}, _CTYPES_FLAKE=WindowsPeerJobSmoke._CTYPES_FLAKE
        )
        self.sleeps = []
        sleep_patcher = unittest.mock.patch.object(time, "sleep", self.sleeps.append)
        sleep_patcher.start()
        self.addCleanup(sleep_patcher.stop)

    def _scripted_run(self, outcomes):
        """Patch subprocess.run to pop one (returncode, stderr) per call."""
        calls = []

        def fake_run(argv, **kwargs):
            calls.append(argv)
            code, stderr = outcomes.pop(0)
            return subprocess.CompletedProcess(argv, code, stdout="", stderr=stderr)

        patcher = unittest.mock.patch.object(subprocess, "run", fake_run)
        patcher.start()
        self.addCleanup(patcher.stop)
        return calls

    def _run(self, args):
        return WindowsPeerJobSmoke._run(self.case, args)

    def test_success_returns_first_attempt_without_sleep(self):
        calls = self._scripted_run([(0, "")])
        proc = self._run(["status", "job"])
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.sleeps, [])

    def test_non_flake_failure_returns_immediately(self):
        calls = self._scripted_run([(1, "RunnerError: no usable Git Bash")])
        proc = self._run(["start", "--", "bash"])
        self.assertEqual(proc.returncode, 1)
        self.assertEqual(len(calls), 1)
        self.assertEqual(self.sleeps, [])

    def test_flake_then_success_retries(self):
        flake = f"ImportError: {WindowsPeerJobSmoke._CTYPES_FLAKE}: init failed"
        calls = self._scripted_run([(1, flake), (0, "")])
        proc = self._run(["status", "job"])
        self.assertEqual(proc.returncode, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.sleeps, [1])

    def test_three_flakes_returns_last_failure(self):
        flake = f"ImportError: {WindowsPeerJobSmoke._CTYPES_FLAKE}: init failed"
        calls = self._scripted_run([(1, flake), (1, flake), (1, flake)])
        proc = self._run(["status", "job"])
        self.assertEqual(proc.returncode, 1)
        self.assertIn(WindowsPeerJobSmoke._CTYPES_FLAKE, proc.stderr)
        self.assertEqual(len(calls), 3)
        self.assertEqual(self.sleeps, [1, 1])


if __name__ == "__main__":
    if not IS_WINDOWS:
        suite = unittest.TestLoader().loadTestsFromTestCase(RunRetryGateUnit)
        result = unittest.TextTestRunner(verbosity=2).run(suite)
        sys.exit(0 if result.wasSuccessful() else 1)
    unittest.main(verbosity=2)
