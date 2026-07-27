#!/usr/bin/python3
"""Launch this skill's sole model adapter under a bounded clean environment."""

import os
import re
import stat
import sys


TRUSTED_PATH = "/usr/bin:/bin"
ADAPTER_NAMES = ("elevation-dispatch.sh", "cross-model-pov.sh")
TOKEN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$")
EFFORT = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$")
LOCALE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.@-]{0,127}$")
CSV = re.compile(r"^[A-Za-z0-9._:/-]+(?:,[A-Za-z0-9._:/-]+)*$")
NUMBER = re.compile(r"^[0-9]{1,10}(?:\.[0-9]{1,3})?$")


def fail(message):
    print(f"clean adapter launch refused: {message}", file=sys.stderr)
    raise SystemExit(2)


def bounded(name, limit, pattern=None, absolute=False):
    value = os.environ.get(name)
    if value is None:
        return None
    if len(value) > limit or any(ord(char) < 32 or ord(char) == 127 for char in value):
        fail(f"{name} is malformed or oversized")
    if pattern is not None and value and pattern.fullmatch(value) is None:
        fail(f"{name} has an unsafe value")
    if absolute and value and not os.path.isabs(value):
        fail(f"{name} must be absolute")
    return value


def validate_ancestry(path, executable=False):
    uid = os.geteuid()
    current = os.sep
    parts = os.path.abspath(path).split(os.sep)
    for part in parts[1:]:
        if not part:
            continue
        current = os.path.join(current, part)
        info = os.lstat(current)
        if stat.S_ISLNK(info.st_mode):
            fail(f"trusted adapter path contains a symlink: {current}")
        if info.st_uid not in (0, uid):
            fail(f"trusted adapter path has an unsafe owner: {current}")
        permissions = stat.S_IMODE(info.st_mode)
        if permissions & 0o022:
            if not (stat.S_ISDIR(info.st_mode) and info.st_uid == 0 and permissions & stat.S_ISVTX):
                fail(f"trusted adapter path is group/other writable: {current}")
    leaf = os.stat(path, follow_symlinks=False)
    if not stat.S_ISREG(leaf.st_mode) or (executable and not stat.S_IMODE(leaf.st_mode) & 0o111):
        fail("co-located adapter is not a regular executable")


script_dir = os.path.realpath(os.path.dirname(__file__))
adapters = [os.path.join(script_dir, name) for name in ADAPTER_NAMES if os.path.lexists(os.path.join(script_dir, name))]
if len(adapters) != 1:
    fail("skill must contain exactly one supported co-located adapter")
adapter = adapters[0]
validate_ancestry(adapter, executable=True)

caller_path = bounded("PATH", 65536)
if not caller_path:
    fail("caller PATH is missing")

cwd = os.path.realpath(os.getcwd())
if adapter.endswith("cross-model-pov.sh"):
    declared_root = os.environ.get("CROSS_MODEL_REPO_ROOT") or os.environ.get("REPO_ROOT") or os.environ.get("CE_PROJECT_ROOT") or cwd
else:
    declared_root = os.environ.get("CE_PROJECT_ROOT") or cwd
if len(declared_root) > 4096 or any(ord(char) < 32 or ord(char) == 127 for char in declared_root):
    fail("declared project root is malformed or oversized")
if not os.path.isabs(declared_root) or not os.path.isdir(declared_root):
    fail("declared project root must be an existing absolute directory")
project_root = os.path.realpath(declared_root)
if cwd != project_root:
    fail("adapter must be launched from the declared project root")

clean = {
    "PATH": TRUSTED_PATH,
    "PYTHONDONTWRITEBYTECODE": "1",
    "CE_ADAPTER_CLEAN_LAUNCH": "v1",
    "CE_PROVIDER_DISCOVERY_PATH": caller_path,
    "CE_PROJECT_ROOT": project_root,
    "CE_ADAPTER_SKILL_ROOT": os.path.dirname(script_dir),
}

root_names = ["CROSS_MODEL_READ_ROOT", "CROSS_MODEL_SCRATCH_PARENT"]
if not adapter.endswith("cross-model-pov.sh"):
    root_names.extend(("HOME", "TMPDIR", "XDG_CONFIG_HOME"))
for name in root_names:
    value = bounded(name, 4096, absolute=True)
    if value is not None:
        clean[name] = value
for name in ("USER",):
    value = bounded(name, 256)
    if value is not None:
        clean[name] = value
for name in ("LANG", "LC_ALL"):
    value = bounded(name, 128, LOCALE)
    if value is not None:
        clean[name] = value
for name in ("CE_ROUTING_CANDIDATE_HARNESS", "CE_ROUTING_CANDIDATE_ROUTE", "CE_ROUTING_CANDIDATE_MODEL", "CROSS_MODEL_HOST_HARNESS", "CROSS_MODEL_MODEL_OVERRIDE", "CROSS_MODEL_MODEL_OVERRIDE_TARGET"):
    value = bounded(name, 128, TOKEN)
    if value is not None:
        clean[name] = value
value = bounded("CE_ROUTING_CANDIDATE_EFFORT", 64, EFFORT)
if value is not None:
    clean["CE_ROUTING_CANDIDATE_EFFORT"] = value
value = bounded("CROSS_MODEL_PEERS", 1024, CSV)
if value is not None:
    clean["CROSS_MODEL_PEERS"] = value
for name in ("CROSS_MODEL_INCLUDE_PATHS", "CROSS_MODEL_EXCLUDE_PATHS"):
    value = bounded(name, 32768)
    if value is not None:
        clean[name] = value
for name in ("ELEVATION_MAX_TURNS", "CE_ELEVATION_IDLE_SECS", "CE_ELEVATION_HARD_SECS", "CE_ELEVATION_POLL_SECS", "CROSS_MODEL_HEARTBEAT_SECS", "CROSS_MODEL_IDLE_SECS", "CROSS_MODEL_HARD_SECS", "CROSS_MODEL_MAX_PAYLOAD_CHARS"):
    value = bounded(name, 16, NUMBER)
    if value is not None:
        clean[name] = value
if adapter.endswith("cross-model-pov.sh"):
    clean["CROSS_MODEL_REPO_ROOT"] = project_root
    clean["REPO_ROOT"] = project_root

flags = os.O_RDONLY | getattr(os, "O_CLOEXEC", 0) | getattr(os, "O_NOFOLLOW", 0)
try:
    adapter_fd = os.open(adapter, flags)
except OSError as exc:
    fail(f"cannot open co-located adapter safely: {exc}")
opened = os.fstat(adapter_fd)
current = os.stat(adapter, follow_symlinks=False)
binding = lambda value: (value.st_dev, value.st_ino, value.st_uid, stat.S_IMODE(value.st_mode), value.st_size, value.st_mtime_ns)
if binding(opened) != binding(current) or not stat.S_ISREG(opened.st_mode):
    fail("co-located adapter changed during launch")
os.set_inheritable(adapter_fd, True)
clean["CE_ADAPTER_SCRIPT_FD"] = str(adapter_fd)
os.execve(
    "/bin/bash",
    ["/bin/bash", "--noprofile", "--norc", f"/dev/fd/{adapter_fd}", *sys.argv[1:]],
    clean,
)
