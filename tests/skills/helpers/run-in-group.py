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


def main() -> int:
    timeout = float(sys.argv[1])
    child = subprocess.Popen(sys.argv[2:], start_new_session=True)
    try:
        code = child.wait(timeout=timeout)
    except subprocess.TimeoutExpired:
        try:
            os.killpg(child.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        child.wait()
        return TIMEOUT_STATUS
    if code < 0:
        signal.signal(-code, signal.SIG_DFL)
        os.kill(os.getpid(), -code)
    return code


if __name__ == "__main__":
    sys.exit(main())
