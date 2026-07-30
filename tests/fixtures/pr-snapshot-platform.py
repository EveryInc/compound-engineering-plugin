#!/usr/bin/env python3
"""Platform-primitive checks for ce-babysit-pr's pr-snapshot (issue #1280).

pr-snapshot needs three facilities that native Windows Python does not provide:
an advisory file lock, a process-identity probe for the PID-reuse guard, and a
rename that survives a concurrent reader. Each has a Windows analog with
different semantics, so this fixture exercises the *observable* contract each
one exists to uphold, and asserts the same thing on every platform:

  - a lock actually serializes concurrent writers (state.json is never a torn
    read, and no writer crashes)
  - process identity distinguishes this process from a dead/foreign pid, which
    is what makes replacing a watcher safe against pid reuse
  - a replaced watcher is retired and only the new owner wakes

Cross-platform on purpose. The POSIX run is the regression guard for the
Windows branches' *contract*; the windows-latest CI job is what proves the
Windows implementations satisfy it. Run directly:  python <this file>
"""

from __future__ import annotations

import errno
import json
import os
import signal
import subprocess
import sys
import tempfile
import threading
import time
import unittest
import importlib.util
from importlib.machinery import SourceFileLoader

IS_WINDOWS = sys.platform == "win32"
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
SCRIPT = os.path.join(REPO_ROOT, "skills", "ce-babysit-pr", "scripts", "pr-snapshot")
BUDGET = "28800"

# One failing check plus one unresolved thread: a stable "there is work" fetch.
ACTIONABLE = {
    "pr_state": "OPEN",
    "mergeable": "MERGEABLE",
    "merge_state_status": "BLOCKED",
    "review_decision": "REVIEW_REQUIRED",
    "head_sha": "s1",
    "base": {
        "host": "github.com", "repository": "o/r", "ref": "main",
        "oid": "base-1", "pr_oid": "base-1", "freshness": "current",
    },
    "url": "http://x/1",
    "checks": [{"key": "CI/test", "name": "test", "status": "COMPLETED",
                "conclusion": "FAILURE", "details_url": "u"}],
    "threads": [{"thread_id": "T1", "last_comment_id": "C1", "last_comment_at": "t1"}],
}

# Same PR with nothing to act on, so a watcher keeps polling instead of waking.
QUIET = dict(
    ACTIONABLE,
    checks=[{"key": "CI/test", "name": "test", "status": "IN_PROGRESS",
             "conclusion": None, "details_url": "u"}],
    threads=[],
)


def load_script():
    """Import pr-snapshot as a module for direct helper calls.

    It ships without a .py suffix, so the loader has to be named explicitly —
    spec_from_file_location infers nothing from an extensionless path."""
    spec = importlib.util.spec_from_loader(
        "pr_snapshot", SourceFileLoader("pr_snapshot", SCRIPT))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class PlatformPrimitives(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="pr-snapshot-platform-")
        self.state = os.path.join(self.dir, "state")

    def write_fetch(self, name, payload):
        path = os.path.join(self.dir, name)
        with open(path, "w") as f:
            json.dump(payload, f)
        return path

    def snapshot_argv(self, fetch, extra):
        return [sys.executable, SCRIPT, "snapshot", "--pr", "1", "--repo", "o/r",
                "--state-dir", self.state, "--fetch-file", fetch] + extra

    def start_invocation(self, fetch):
        r = subprocess.run(
            self.snapshot_argv(fetch, ["--start-invocation", "--invocation-budget-seconds", BUDGET]),
            capture_output=True, text=True)
        self.assertEqual(r.returncode, 0, r.stderr)
        return json.loads(r.stdout)

    def invocation_args(self, started):
        return ["--invocation-id", started["invocation_id"],
                "--session-started-at", started["invocation_started_at"],
                "--invocation-budget-seconds", str(started["invocation_budget_seconds"])]

    def read_state(self):
        with open(os.path.join(self.state, "state.json")) as f:
            return json.load(f)

    # --- the lock -------------------------------------------------------------

    def test_concurrent_snapshots_serialize_without_tearing_state(self):
        """Every writer must complete and state.json must never be a partial read.

        Without a working lock this fails loudly on Windows in two different ways: the
        import of fcntl raises, and (once imported) concurrent os.replace onto an open
        state.json raises PermissionError in whichever writer loses the race."""
        fetch = self.write_fetch("actionable.json", ACTIONABLE)
        started = self.start_invocation(fetch)
        argv = self.snapshot_argv(fetch, self.invocation_args(started))

        procs = [subprocess.Popen(argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                  text=True) for _ in range(6)]
        for p in procs:
            out, err = p.communicate(timeout=60)
            self.assertEqual(p.returncode, 0, err)
            json.loads(out)   # each writer emitted complete JSON

        state = self.read_state()
        self.assertEqual(state["invocation_id"], started["invocation_id"])
        self.assertTrue(os.path.exists(os.path.join(self.state, "lock")))

    def test_lock_can_be_reacquired_after_release(self):
        """Release must actually release: a second acquisition in the same process must not hang.

        This is the msvcrt trap — its lock is a byte range from the current file offset, so an
        unlock at a different offset than the lock silently leaves the range held."""
        module = load_script()
        with module._state_lock(self.state):
            pass
        with module._state_lock(self.state, exclusive=False):
            pass
        # Re-acquire after full release, exclusive this time.
        with module._state_lock(self.state):
            self.assertTrue(os.path.exists(os.path.join(self.state, "lock")))

    @staticmethod
    def _settled(call, timeout=10.0):
        """Run `call` off-thread. Returns ('raised', exc) / ('returned', value), or None if it hung.

        A regression here is an infinite loop, so it must be observed as a timeout rather than
        allowed to wedge the suite."""
        box = []

        def run():
            try:
                box.append(("returned", call()))
            except BaseException as exc:   # noqa: BLE001 - a hang and a raise are both outcomes here
                box.append(("raised", exc))

        t = threading.Thread(target=run, daemon=True)
        t.start()
        t.join(timeout=timeout)
        return box[0] if box else None

    def test_lock_acquire_retries_only_on_contention(self):
        """The unbounded wait must retry on "someone holds this" and nothing else (#1285).

        msvcrt reports a held range as EACCES and a genuine defect (bad descriptor, bad range) as
        EBADF/EINVAL. All are OSError, so a bare `except OSError` cannot tell them apart: it spins
        at the retry interval forever, silently. For a watcher that is observably identical to not
        running at all — exactly the failure this port set out to fix.

        The primitive is patched rather than provoked with a real bad descriptor, because
        `os.lseek` rejects one before the retry loop is ever entered — so the natural-looking
        version of this test passes against both the fixed and the broken loop."""
        module = load_script()
        if not IS_WINDOWS:
            # POSIX has no retry loop; flock surfaces errors directly. Pin that contract so the
            # platforms cannot silently diverge.
            fd = os.open(os.path.join(self.dir, "posix-lock"), os.O_RDWR | os.O_CREAT, 0o600)
            os.close(fd)
            outcome = self._settled(lambda: module._lock_acquire(fd, True))
            self.assertIsNotNone(outcome, "_lock_acquire hung on POSIX")
            self.assertEqual(outcome[0], "raised")
            return

        fd = os.open(os.path.join(self.dir, "win-lock"), os.O_RDWR | os.O_CREAT, 0o600)
        real = module.msvcrt.locking
        try:
            attempts = []

            def unfixable(handle, mode, nbytes):
                attempts.append(mode)
                raise OSError(errno.EINVAL, "not contention")

            module.msvcrt.locking = unfixable
            outcome = self._settled(lambda: module._lock_acquire(fd, True))
            self.assertIsNotNone(
                outcome, "_lock_acquire spun on a non-contention error instead of raising")
            self.assertEqual(outcome[0], "raised")
            self.assertEqual(outcome[1].errno, errno.EINVAL)
            self.assertEqual(len(attempts), 1, "a non-contention error must not be retried")

            # ...and real contention must still be waited out rather than raised.
            held = []

            def busy_then_free(handle, mode, nbytes):
                held.append(mode)
                if len(held) < 3:
                    raise OSError(errno.EACCES, "range held by another process")

            module.msvcrt.locking = busy_then_free
            outcome = self._settled(lambda: module._lock_acquire(fd, True))
            self.assertIsNotNone(outcome, "_lock_acquire failed to finish waiting out contention")
            self.assertEqual(outcome[0], "returned", outcome)
            self.assertEqual(len(held), 3, "contention must be retried until it clears")
        finally:
            module.msvcrt.locking = real
            os.close(fd)

    def test_replace_atomic_overwrites_an_existing_file(self):
        module = load_script()
        dst = os.path.join(self.dir, "dst.json")
        with open(dst, "w") as f:
            f.write('{"v": 1}')
        src = os.path.join(self.dir, "src.json")
        with open(src, "w") as f:
            f.write('{"v": 2}')
        module._replace_atomic(src, dst)
        with open(dst) as f:
            self.assertEqual(json.load(f)["v"], 2)
        self.assertFalse(os.path.exists(src))

    # --- process identity -----------------------------------------------------

    def test_process_identity_is_stable_for_a_live_process(self):
        module = load_script()
        mine = module._process_identity(os.getpid())
        self.assertIsInstance(mine, str)
        self.assertTrue(mine.strip())
        self.assertEqual(mine, module._process_identity(os.getpid()))

    def test_process_identity_distinguishes_a_different_process(self):
        """The guard exists to refuse killing a pid that is no longer the watcher we recorded."""
        module = load_script()
        child = subprocess.Popen([sys.executable, "-c", "import time; time.sleep(30)"])
        try:
            other = module._process_identity(child.pid)
            self.assertIsInstance(other, str)
            self.assertNotEqual(other, module._process_identity(os.getpid()))
        finally:
            child.kill()
            child.wait(timeout=30)

    def test_process_identity_is_unproven_for_a_dead_process(self):
        module = load_script()
        child = subprocess.Popen([sys.executable, "-c", "pass"])
        child.wait(timeout=30)
        # A reaped pid is either gone (None) or, if the pid was recycled, a different
        # identity than the process we are checking against. Either outcome declines the kill.
        self.assertNotEqual(module._process_identity(child.pid),
                            module._process_identity(os.getpid()))

    # --- watcher replacement --------------------------------------------------

    def test_replaced_watcher_is_retired_and_only_the_new_owner_wakes(self):
        """End-to-end proof that supersession works without POSIX signal delivery."""
        quiet = self.write_fetch("quiet.json", QUIET)
        started = self.start_invocation(quiet)
        watch_argv = [sys.executable, SCRIPT, "watch", "--pr", "1", "--repo", "o/r",
                      "--state-dir", self.state, "--fetch-file", quiet,
                      "--interval", "0.2"] + self.invocation_args(started)

        old = subprocess.Popen(watch_argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        first = self.wait_for_generation(None)
        new = subprocess.Popen(watch_argv, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
        self.wait_for_generation(first)

        # The superseded watcher must go away without claiming the wake, whichever
        # mechanism retires it.
        old_out, old_err = old.communicate(timeout=60)
        self.assertEqual(old_out.strip(), "", "a superseded watcher must not emit a wake")
        # POSIX retires it with a SIGTERM its handler unwinds, so it exits 0. Windows never
        # delivers that signal across processes: os.kill is TerminateProcess, and the exit
        # code is the signal number it was handed — unless the watcher happened to notice the
        # new generation first and returned 0 on its own.
        self.assertIn(old.returncode, (0, int(signal.SIGTERM)) if IS_WINDOWS else (0,), old_err)

        # Give the surviving owner something to wake on.
        with open(quiet, "w") as f:
            json.dump(ACTIONABLE, f)
        new_out, new_err = new.communicate(timeout=60)
        self.assertEqual(new.returncode, 0, new_err)
        wakes = [json.loads(line) for line in new_out.strip().splitlines() if line.strip()]
        self.assertEqual(len(wakes), 1, new_out)
        self.assertEqual(wakes[0]["event"], "BABYSIT_WAKE")
        self.assertEqual(wakes[0]["watch_generation"], self.read_state()["watch_generation"])

    def wait_for_generation(self, previous, timeout=30.0):
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            try:
                generation = self.read_state().get("watch_generation")
            except (OSError, ValueError):
                generation = None   # the first watcher may still be creating state.json
            if isinstance(generation, str) and generation and generation != previous:
                return generation
            time.sleep(0.05)
        raise AssertionError("watch generation did not advance from %r" % (previous,))


if __name__ == "__main__":
    unittest.main(verbosity=2)
