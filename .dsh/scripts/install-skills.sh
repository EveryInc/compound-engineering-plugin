#!/usr/bin/env bash
# Link Compound Engineering skills into a DeepSeek Harness (DSH) skill root.
#
# Usage:
#   .dsh/scripts/install-skills.sh --global          link into $DSH_HOME/skills
#   .dsh/scripts/install-skills.sh --project [DIR]   link into <DIR>/.dsh/skills
#   .dsh/scripts/install-skills.sh --check           report the state of the links
#   .dsh/scripts/install-skills.sh --uninstall       remove the links this checkout owns
#
# Only symlinks are created, and only ones whose target resolves under this
# checkout's skills/ tree. Existing files, directories, or foreign symlinks are
# never replaced. Re-running is idempotent.
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
repo_root=$(cd "$script_dir/../.." && pwd -P)
skills_root="$repo_root/skills"

mode=""
project_dir=""

while [ $# -gt 0 ]; do
  case "$1" in
    --global) mode="global"; shift ;;
    --project)
      mode="project"; shift
      if [ $# -gt 0 ] && [ "${1#--}" = "$1" ]; then project_dir="$1"; shift; fi
      ;;
    --check) mode="check"; shift ;;
    --uninstall) mode="uninstall"; shift ;;
    -h|--help) sed -n '2,13p' "$0" | sed 's/^# {0,1}//'; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$mode" ]; then
  echo "choose --global, --project [DIR], --check, or --uninstall" >&2
  exit 2
fi
if [ ! -d "$skills_root" ]; then
  echo "no skills directory at $skills_root" >&2
  exit 2
fi

global_root="${DSH_HOME:-$HOME/.dsh}/skills"
if [ -n "$project_dir" ]; then
  if [ ! -d "$project_dir" ]; then
    echo "no such project directory: $project_dir" >&2
    exit 2
  fi
  project_root="$(cd "$project_dir" && pwd -P)/.dsh/skills"
else
  project_root="$PWD/.dsh/skills"
fi

case "$mode" in
  global) target="$global_root"; roots=("$global_root") ;;
  project) target="$project_root"; roots=("$project_root") ;;
  check|uninstall) roots=("$global_root" "$project_root") ;;
esac

owned() {
  # True when a symlink target resolves inside this checkout's skills tree.
  [ -L "$1" ] || return 1
  target_path=$(readlink "$1") || return 1
  [ -d "$target_path" ] || return 1
  resolved=$(cd "$target_path" && pwd -P) || return 1
  case "$resolved" in
    "$skills_root"/*) return 0 ;;
    *) return 1 ;;
  esac
}

foreign() {
  # A real file/directory, or a symlink pointing outside this checkout.
  [ -e "$1" ] || [ -L "$1" ] || return 1
  owned "$1" && return 1
  return 0
}

if [ "$mode" = "check" ] || [ "$mode" = "uninstall" ]; then
  owned_count=0; missing=0; foreign_count=0
  for r in "${roots[@]}"; do
    [ -d "$r" ] || continue
    for d in "$skills_root"/*/; do
      name=$(basename "$d")
      link="$r/$name"
      if owned "$link"; then
        owned_count=$((owned_count+1))
        if [ "$mode" = "uninstall" ]; then rm -f "$link"; else printf 'owned    %s\n' "$link"; fi
      elif foreign "$link"; then
        foreign_count=$((foreign_count+1))
        [ "$mode" = "check" ] && printf 'FOREIGN  %s\n' "$link"
      else
        missing=$((missing+1))
        [ "$mode" = "check" ] && printf 'missing  %s\n' "$link"
      fi
    done
  done
  if [ "$mode" = "uninstall" ]; then
    echo "removed $owned_count CE-owned links; left $foreign_count foreign entries untouched"
  else
    echo "CE-owned links listed above; $missing missing, $foreign_count foreign"
  fi
  exit 0
fi

mkdir -p "$target"
created=0; replaced=0; skipped=0
for d in "$skills_root"/*/; do
  name=$(basename "$d")
  link="$target/$name"
  source_path=$(cd "$d" && pwd -P)
  if owned "$link"; then
    ln -sfn "$source_path" "$link"
    replaced=$((replaced+1))
  elif foreign "$link"; then
    echo "skip $link: exists and is not a CE-owned link" >&2
    skipped=$((skipped+1))
  else
    ln -s "$source_path" "$link"
    created=$((created+1))
  fi
done

echo "linked $created new and $replaced existing CE skills into $target"
[ "$skipped" -gt 0 ] && echo "skipped $skipped foreign entries (left untouched)" >&2
echo "start a new DSH session (or wait for the skill catalog to refresh) before invoking a skill"
