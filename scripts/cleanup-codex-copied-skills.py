#!/usr/bin/env python3
"""Remove copied CE skill directories from ~/.codex/skills for migration to symlinked skills."""

from __future__ import annotations

import argparse
import os
import re
import shutil
from pathlib import Path


def parse_frontmatter(skill_md: Path) -> dict[str, str]:
    text = skill_md.read_text(encoding="utf-8")
    if not text.startswith("---\n"):
        return {}
    end = text.find("\n---", 4)
    if end == -1:
        return {}
    frontmatter = text[4 : end + 1]
    parsed: dict[str, str] = {}
    for line in frontmatter.splitlines():
        if ":" not in line:
            continue
        key, value = line.split(":", 1)
        parsed[key.strip()] = value.strip()
    return parsed


def parse_platforms(raw_value: str | None) -> list[str] | None:
    if not raw_value:
        return None
    text = raw_value.strip()
    if not text.startswith("[") or not text.endswith("]"):
        return None
    values = [item.strip().strip("'\"") for item in text[1:-1].split(",") if item.strip()]
    return values


def should_copy_to_codex(frontmatter: dict[str, str]) -> bool:
    platforms = parse_platforms(frontmatter.get("ce_platforms"))
    if platforms is None:
        return True
    return "codex" in platforms


def resolve_repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def collect_target_skill_dirs(source_skills_root: Path) -> list[str]:
    targets: set[str] = set()
    for skill_dir in sorted(path for path in source_skills_root.iterdir() if path.is_dir()):
        skill_md = skill_dir / "SKILL.md"
        if not skill_md.exists():
            continue

        frontmatter = parse_frontmatter(skill_md)
        if not should_copy_to_codex(frontmatter):
            continue

        # 核心规则：使用 frontmatter name（不存在时回退目录名），并与 Codex 落盘规则一致做 ":" -> "-"
        skill_name = frontmatter.get("name", skill_dir.name).strip().strip("'\"")
        target_name = re.sub(r":", "-", skill_name)
        targets.add(target_name)
    return sorted(targets)


def remove_copied_skills(target_skills_root: Path, target_names: list[str], dry_run: bool) -> int:
    removed = 0
    for name in target_names:
        target = target_skills_root / name
        if not target.exists() and not target.is_symlink():
            continue

        if dry_run:
            print(f"[dry-run] would remove {target}")
            removed += 1
            continue

        # 核心流程：仅删除计算出的 CE 复制目录，不触碰其他第三方/个人 skill
        if target.is_symlink() or target.is_file():
            target.unlink()
            print(f"removed {target}")
            removed += 1
        elif target.is_dir():
            shutil.rmtree(target)
            print(f"removed {target}")
            removed += 1
    return removed


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Remove copied Compound Engineering skill directories from ~/.codex/skills "
            "based on current plugin SKILL.md metadata."
        )
    )
    parser.add_argument(
        "--codex-home",
        default=os.environ.get("CODEX_HOME", str(Path.home() / ".codex")),
        help="Codex home directory (default: $CODEX_HOME or ~/.codex)",
    )
    parser.add_argument(
        "--source-skills-root",
        default=None,
        help="Override source skills root (default: <repo>/plugins/compound-engineering/skills)",
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print targets that would be removed without deleting files",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()

    codex_home = Path(args.codex_home).expanduser()
    repo_root = resolve_repo_root()
    source_skills_root = (
        Path(args.source_skills_root).expanduser()
        if args.source_skills_root
        else repo_root / "plugins" / "compound-engineering" / "skills"
    )
    target_skills_root = codex_home / "skills"

    if not source_skills_root.exists():
        parser.error(f"source skills directory not found: {source_skills_root}")
    if not target_skills_root.exists():
        print(f"nothing to remove: target skills root does not exist: {target_skills_root}")
        return 0

    target_names = collect_target_skill_dirs(source_skills_root)
    removed = remove_copied_skills(target_skills_root, target_names, args.dry_run)
    print(f"done: removed {removed} copied CE skill directories")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
