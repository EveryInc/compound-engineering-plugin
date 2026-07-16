#!/usr/bin/env python3
"""Resolve and create Compound Engineering scratch paths safely.

This file is byte-duplicated into every skill that creates or reads shared
scratch. Keep all copies identical; tests enforce parity.
"""

from __future__ import annotations

import argparse
import errno
import os
import shutil
import stat
import sys
import tempfile
import uuid
from pathlib import Path


class ScratchRootError(RuntimeError):
    pass


def _uid() -> int:
    getuid = getattr(os, "getuid", None)
    if getuid is None:
        raise ScratchRootError("owner-scoped scratch requires a POSIX user id")
    return int(getuid())


_DIRECTORY_FLAGS = (
    os.O_RDONLY
    | getattr(os, "O_DIRECTORY", 0)
    | getattr(os, "O_NOFOLLOW", 0)
)


def _canonical_system_tmp(raw: Path = Path("/tmp")) -> Path:
    """Return the canonical system temp directory without traversing it later.

    macOS exposes `/tmp` as a root-owned symlink to `/private/tmp`. We accept
    that platform link only when the link itself is root-owned, then validate
    every component of the canonical target with the ordinary no-follow walk.
    """
    try:
        info = os.lstat(raw)
    except OSError as exc:
        raise ScratchRootError(f"cannot inspect system temp path {raw}: {exc}") from exc
    if stat.S_ISLNK(info.st_mode) and info.st_uid != 0:
        raise ScratchRootError(f"system temp symlink is not root-owned: {raw}")
    resolved = Path(os.path.realpath(raw))
    if not resolved.is_absolute():
        raise ScratchRootError(f"system temp path did not resolve absolutely: {raw}")
    return resolved


def _validate_fd(
    fd: int,
    path: Path,
    *,
    final: bool,
    private: bool,
) -> None:
    """Validate the directory that is already open without following links."""
    info = os.fstat(fd)
    mode = stat.S_IMODE(info.st_mode)
    uid = _uid()
    if not stat.S_ISDIR(info.st_mode):
        raise ScratchRootError(f"scratch path is not a directory: {path}")

    # Root-owned sticky system temp directories are safe *ancestors* despite
    # their deliberate world writability. They are never valid lifecycle roots.
    if not final and info.st_uid == 0 and mode & 0o1000 and mode & 0o003 == 0o003:
        return

    allowed_owners = {uid} if final else {0, uid}
    if info.st_uid not in allowed_owners:
        raise ScratchRootError(
            f"scratch path is owned by uid {info.st_uid}, expected root or uid {uid}: {path}"
        )
    if mode & 0o022:
        raise ScratchRootError(
            f"scratch ancestor is group/other-writable ({mode:04o}): {path}"
        )
    if private and mode & 0o077:
        raise ScratchRootError(
            f"scratch path must be owner-private (0700), found {mode:04o}: {path}"
        )


def _open_secure_path(
    path: Path,
    *,
    create: bool,
    private_final: bool,
    tighten_final: bool,
) -> Path:
    """Open every absolute-path component with O_NOFOLLOW and validate it.

    Root-owned, non-writable system ancestors are accepted. From the first
    user-owned component onward, group/other write access is rejected. The
    final lifecycle root must always belong to the current UID.
    """
    path = path.expanduser()
    if not path.is_absolute():
        raise ScratchRootError(f"scratch root must be absolute: {path}")
    parts = path.parts
    if any(part in {"", ".", ".."} or "\0" in part for part in parts[1:]):
        raise ScratchRootError(f"invalid scratch path: {path}")

    fd = os.open("/", _DIRECTORY_FLAGS)
    current = Path("/")
    try:
        for index, part in enumerate(parts[1:]):
            final = index == len(parts[1:]) - 1
            current = current / part
            created = False
            try:
                child_fd = os.open(part, _DIRECTORY_FLAGS, dir_fd=fd)
            except FileNotFoundError:
                if not create:
                    raise ScratchRootError(f"scratch path does not exist: {current}")
                try:
                    os.mkdir(part, 0o700, dir_fd=fd)
                    created = True
                except FileExistsError:
                    pass
                except OSError as exc:
                    raise ScratchRootError(f"cannot create scratch path {current}: {exc}") from exc
                try:
                    child_fd = os.open(part, _DIRECTORY_FLAGS, dir_fd=fd)
                except OSError as exc:
                    raise ScratchRootError(
                        f"scratch path became unsafe during creation: {current}: {exc}"
                    ) from exc
            except OSError as exc:
                if exc.errno in {errno.ELOOP, errno.ENOTDIR}:
                    raise ScratchRootError(
                        f"scratch path is symlinked or not a directory: {current}"
                    ) from exc
                raise ScratchRootError(f"cannot open scratch path {current}: {exc}") from exc

            try:
                if final and tighten_final:
                    info = os.fstat(child_fd)
                    if info.st_uid != _uid():
                        raise ScratchRootError(
                            f"scratch path is owned by uid {info.st_uid}, expected uid {_uid()}: {current}"
                        )
                    os.fchmod(child_fd, 0o700)
                _validate_fd(
                    child_fd,
                    current,
                    final=final,
                    private=private_final if final else False,
                )
            except BaseException:
                os.close(child_fd)
                raise
            os.close(fd)
            fd = child_fd

        if not parts[1:]:
            raise ScratchRootError("filesystem root cannot be used as a lifecycle root")
    finally:
        os.close(fd)

    if not os.access(path, os.R_OK | os.W_OK | os.X_OK):
        raise ScratchRootError(f"scratch path is not readable/writable/searchable: {path}")
    return path


def validate_private_root(value: str | Path) -> Path:
    """Validate or create an explicit owner-private lifecycle root."""
    return _open_secure_path(
        Path(value), create=True, private_final=True, tighten_final=False
    )


def validate_existing_private_root(value: str | Path) -> Path:
    """Validate an existing owner-private lifecycle root without creating it."""
    return _open_secure_path(
        Path(value), create=False, private_final=True, tighten_final=False
    )


def _create_under(parent: Path, relative_parts: tuple[str, ...]) -> Path:
    current = parent
    for part in relative_parts:
        if not part or part in {".", ".."} or "/" in part or "\0" in part:
            raise ScratchRootError(f"invalid scratch path component: {part!r}")
        current = current / part
        try:
            current.mkdir(mode=0o700)
        except FileExistsError:
            pass
        _open_secure_path(
            current, create=False, private_final=True, tighten_final=True
        )
    return current


def resolve_root() -> Path:
    os.umask(0o077)
    uid = _uid()

    override = os.environ.get("COMPOUND_ENGINEERING_SCRATCH_ROOT")
    if override:
        try:
            return validate_private_root(override)
        except ScratchRootError:
            pass

    xdg = os.environ.get("XDG_RUNTIME_DIR")
    if xdg:
        xdg_root = Path(xdg).expanduser()
        try:
            if xdg_root.is_absolute():
                _open_secure_path(
                    xdg_root, create=False, private_final=True, tighten_final=False
                )
                return _open_secure_path(
                    xdg_root / "compound-engineering",
                    create=True,
                    private_final=True,
                    tighten_final=True,
                )
        except ScratchRootError:
            pass

    home = Path(os.environ.get("HOME", str(Path.home()))).expanduser()
    if home.is_absolute():
        try:
            _open_secure_path(
                home, create=False, private_final=False, tighten_final=False
            )
            return _open_secure_path(
                home / ".cache" / "compound-engineering" / "tmp",
                create=True,
                private_final=True,
                tighten_final=True,
            )
        except ScratchRootError:
            pass

    return _open_secure_path(
        _canonical_system_tmp() / f"compound-engineering-{uid}",
        create=True,
        private_final=True,
        tighten_final=True,
    )


def _resolve_persistent_root(
    override_name: str,
    xdg_name: str,
    home_relative: tuple[str, ...],
) -> Path:
    override = os.environ.get(override_name)
    if override:
        try:
            return validate_private_root(override)
        except ScratchRootError:
            pass

    xdg = os.environ.get(xdg_name)
    if xdg:
        candidate = Path(xdg).expanduser()
        if candidate.is_absolute():
            try:
                return _open_secure_path(
                    candidate / "compound-engineering",
                    create=True,
                    private_final=True,
                    tighten_final=True,
                )
            except ScratchRootError:
                pass

    home = Path(os.environ.get("HOME", str(Path.home()))).expanduser()
    if home.is_absolute():
        try:
            _open_secure_path(
                home, create=False, private_final=False, tighten_final=False
            )
            return _open_secure_path(
                home.joinpath(*home_relative),
                create=True,
                private_final=True,
                tighten_final=True,
            )
        except ScratchRootError:
            pass
    raise ScratchRootError(f"no safe persistent root is available for {override_name}")


def resolve_cache_root() -> Path:
    try:
        return _resolve_persistent_root(
            "COMPOUND_ENGINEERING_CACHE_ROOT",
            "XDG_CACHE_HOME",
            (".cache", "compound-engineering"),
        )
    except ScratchRootError:
        return _create_under(resolve_root(), ("cache",))


def resolve_state_root() -> Path:
    return _resolve_persistent_root(
        "COMPOUND_ENGINEERING_STATE_ROOT",
        "XDG_STATE_HOME",
        (".local", "state", "compound-engineering"),
    )


def resolve_data_root() -> Path:
    return _resolve_persistent_root(
        "COMPOUND_ENGINEERING_DATA_ROOT",
        "XDG_DATA_HOME",
        (".local", "share", "compound-engineering"),
    )


def ensure_subdir(relative: str) -> Path:
    parts = tuple(Path(relative).parts)
    return _create_under(resolve_root(), parts)


def ensure_cache_subdir(relative: str) -> Path:
    return _create_under(resolve_cache_root(), tuple(Path(relative).parts))


def ensure_state_subdir(relative: str) -> Path:
    return _create_under(resolve_state_root(), tuple(Path(relative).parts))


def ensure_data_subdir(relative: str) -> Path:
    return _create_under(resolve_data_root(), tuple(Path(relative).parts))


def create_run_dir(skill: str, run_id: str | None) -> Path:
    safe_skill = skill.strip()
    if not safe_skill or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in safe_skill):
        raise ScratchRootError(f"invalid skill name: {skill!r}")
    run_parent = ensure_subdir(f"{safe_skill}/runs")
    identity = run_id or str(uuid.uuid4())
    if any(ch not in "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789._-" for ch in identity):
        raise ScratchRootError(f"invalid run id: {identity!r}")
    path = Path(tempfile.mkdtemp(prefix=f"{identity}-", dir=run_parent))
    os.chmod(path, 0o700)
    _open_secure_path(path, create=False, private_final=True, tighten_final=False)
    return path


def remove_run_dir(skill: str, value: str | Path) -> None:
    safe_skill = skill.strip()
    if not safe_skill or any(ch not in "abcdefghijklmnopqrstuvwxyz0123456789-" for ch in safe_skill):
        raise ScratchRootError(f"invalid skill name: {skill!r}")
    path = Path(value).expanduser()
    parent = _create_under(resolve_root(), (safe_skill, "runs"))
    if not path.is_absolute() or path.parent != parent:
        raise ScratchRootError(f"run directory is outside {parent}: {path}")
    _open_secure_path(path, create=False, private_final=True, tighten_final=False)
    shutil.rmtree(path)


def main(argv: list[str]) -> int:
    parser = argparse.ArgumentParser()
    subcommands = parser.add_subparsers(dest="command", required=True)
    subcommands.add_parser("root")
    subdir = subcommands.add_parser("subdir")
    subdir.add_argument("relative")
    cache_subdir = subcommands.add_parser("cache-subdir")
    cache_subdir.add_argument("relative")
    state_subdir = subcommands.add_parser("state-subdir")
    state_subdir.add_argument("relative")
    data_subdir = subcommands.add_parser("data-subdir")
    data_subdir.add_argument("relative")
    run = subcommands.add_parser("run-dir")
    run.add_argument("--skill", required=True)
    run.add_argument("--run-id")
    remove = subcommands.add_parser("remove-run-dir")
    remove.add_argument("--skill", required=True)
    remove.add_argument("path")
    args = parser.parse_args(argv)

    try:
        if args.command == "root":
            path = resolve_root()
        elif args.command == "subdir":
            path = ensure_subdir(args.relative)
        elif args.command == "cache-subdir":
            path = ensure_cache_subdir(args.relative)
        elif args.command == "state-subdir":
            path = ensure_state_subdir(args.relative)
        elif args.command == "data-subdir":
            path = ensure_data_subdir(args.relative)
        elif args.command == "run-dir":
            path = create_run_dir(args.skill, args.run_id)
        else:
            remove_run_dir(args.skill, args.path)
            return 0
    except ScratchRootError as exc:
        print(f"scratch-root: {exc}", file=sys.stderr)
        return 1
    print(path)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
