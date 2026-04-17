#!/usr/bin/env python3
"""Remove copied CE skill directories from ~/.codex/skills for migration to symlinked skills."""

from __future__ import annotations

import argparse
import os
import re
import shutil
from dataclasses import dataclass
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


@dataclass(frozen=True)
class TargetSkill:
    expected_skill_name: str
    target_dir_name: str
    source_skill_md: Path


def collect_target_skill_dirs(source_skills_root: Path) -> list[TargetSkill]:
    targets: dict[str, TargetSkill] = {}
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
        targets[target_name] = TargetSkill(
            expected_skill_name=skill_name,
            target_dir_name=target_name,
            source_skill_md=skill_md,
        )
    return [targets[key] for key in sorted(targets.keys())]


def verify_target_ownership(
    target: Path,
    expected_skill_name: str,
    source_skill_md: Path,
) -> tuple[bool, str]:
    """
    Verify ownership before deletion.
    A target is considered CE-owned when it contains SKILL.md and that file's
    frontmatter `name` matches the expected CE skill name.
    """
    skill_md = target / "SKILL.md"
    if not skill_md.is_file():
        return False, "missing SKILL.md"
    frontmatter = parse_frontmatter(skill_md)
    actual_name = frontmatter.get("name", "").strip().strip("'\"")
    if not actual_name:
        return False, "missing frontmatter name"
    if actual_name != expected_skill_name:
        return False, f"name mismatch (actual={actual_name}, expected={expected_skill_name})"
    expected_content = source_skill_md.read_text(encoding="utf-8")
    actual_content = skill_md.read_text(encoding="utf-8")
    if actual_content != expected_content:
        return False, "SKILL.md content differs from current CE source"
    return True, "verified"


def remove_copied_skills(
    target_skills_root: Path,
    targets: list[TargetSkill],
    apply: bool,
    force_unverified: bool,
) -> tuple[int, int]:
    removed = 0
    skipped_unverified = 0

    for target_skill in targets:
        target = target_skills_root / target_skill.target_dir_name
        if not target.exists() and not target.is_symlink():
            continue

        # 核心安全检查：删除前先验证目录归属，避免误删同名第三方 skill
        verified, reason = verify_target_ownership(
            target=target,
            expected_skill_name=target_skill.expected_skill_name,
            source_skill_md=target_skill.source_skill_md,
        )
        if not verified and not force_unverified:
            print(f"skip {target}: unverified ownership ({reason})")
            skipped_unverified += 1
            continue

        if not apply:
            suffix = "" if verified else " [force-required]"
            print(f"[dry-run] would remove {target}{suffix}")
            continue

        if not verified and force_unverified:
            print(f"force remove {target}: {reason}")

        # 核心流程：仅删除计算出的 CE 复制目录，不触碰其他第三方/个人 skill
        if target.is_symlink() or target.is_file():
            target.unlink()
            print(f"removed {target}")
            removed += 1
        elif target.is_dir():
            shutil.rmtree(target)
            print(f"removed {target}")
            removed += 1
    return removed, skipped_unverified


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
    parser.add_argument(
        "--apply",
        action="store_true",
        help="Actually delete verified copied CE skill directories",
    )
    parser.add_argument(
        "--force-unverified",
        action="store_true",
        help="Delete unverified targets as well (use with --apply only)",
    )
    return parser


def main() -> int:
    parser = build_parser()
    args = parser.parse_args()
    if args.apply and args.dry_run:
        parser.error("--apply and --dry-run are mutually exclusive")
    if args.force_unverified and not args.apply:
        parser.error("--force-unverified requires --apply")

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

    apply = args.apply
    if args.dry_run:
        apply = False

    targets = collect_target_skill_dirs(source_skills_root)
    removed, skipped_unverified = remove_copied_skills(
        target_skills_root=target_skills_root,
        targets=targets,
        apply=apply,
        force_unverified=args.force_unverified,
    )
    mode = "apply" if apply else "dry-run"
    print(
        f"done ({mode}): removed {removed} copied CE skill directories, "
        f"skipped_unverified {skipped_unverified}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
