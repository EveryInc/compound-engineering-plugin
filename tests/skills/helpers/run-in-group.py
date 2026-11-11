"""Run a command in its own process group, and on timeout kill the whole group.

usage: run-in-group.py <timeout-seconds> <command> [args...]

A plain spawnSync timeout kills only the direct child, so anything it started
(the controller's git, a stray sleep) outlives it and can keep its output pipes
open. Exits with the command's status, re-raises the signal that killed it, or
exits 124 after killing the group on timeout.
"""

import os
import signal
import subprocess
import sys

TIMEOUT_STATUS = 124


def kill_group(child: subprocess.Popen) -> None:
    try:
        os.killpg(child.pid, signal.SIGKILL)
    except ProcessLookupError:
        pass
    child.wait()


def die_of(signum: int) -> None:
    signal.signal(signum, signal.SIG_DFL)
    os.kill(os.getpid(), signum)


def main() -> int:
    timeout = float(sys.argv[1])
    child = None
    pending = []

    # The command's new session does not receive signals sent to ours, so an
    # interrupt must take its group down too. Installed before the spawn so an
    # interrupt that lands mid-spawn is held and acted on once the child exists.
    def on_interrupt(signum, _frame):
        if child is None:
            pending.append(signum)
            return
        kill_group(child)
        die_of(signum)

    for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP, signal.SIGQUIT):
        signal.signal(signum, on_interrupt)
    child = subprocess.Popen(sys.argv[2:], start_new_session=True)
    if pending:
        kill_group(child)
        die_of(pending[0])
    try:
        code = child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        kill_group(child)
        return TIMEOUT_STATUS
    # A background process the command left behind would still hold our output.
    kill_group(child)
    if code < 0:
        die_of(-code)
    return code


if __name__ == "__main__":
    sys.exit(main())
