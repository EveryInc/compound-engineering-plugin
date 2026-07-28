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

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

IS_WINDOWS = sys.platform == "win32"

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RUNNER = os.path.join(
    REPO_ROOT, "skills", "ce-doc-review", "scripts", "peer-job-runner.py"
)

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

    def _run(self, args, timeout=90):
        return subprocess.run(
            [sys.executable, RUNNER, *args],
            env=self.env,
            capture_output=True,
            text=True,
            timeout=timeout,
        )

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

    def test_bare_sh_worker_wraps_when_bash_present(self):
        bash = shutil.which("bash") or shutil.which("sh")
        if bash is None:
            self.skipTest("bash/sh not on PATH (unexpected on windows-latest)")
        stub = os.path.join(self.root, "stub.sh")
        with open(stub, "w", encoding="utf-8", newline="\n") as f:
            f.write("#!/usr/bin/env bash\nexit 0\n")
        started = self._run(
            ["start", "--skill", "ce-doc-review", "--run-id", "run1", "--", stub]
        )
        self.assertEqual(started.returncode, 0, started.stderr)
        job_id = started.stdout.strip()
        waited = self._run(["wait", "--max-secs", "20", job_id])
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


if __name__ == "__main__":
    if not IS_WINDOWS:
        print("skip: peer-job-runner Windows smoke is for win32 only", file=sys.stderr)
        sys.exit(0)
    unittest.main(verbosity=2)
