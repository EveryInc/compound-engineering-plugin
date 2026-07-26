#!/bin/bash

# Experiment Worktree Manager
# Creates, cleans up, and manages worktrees for optimization experiments.
# Each experiment gets an isolated worktree with copied shared resources.
#
# Usage:
#   experiment-worktree.sh create <spec_name> <exp_index> <base_branch> [--routed|--legacy-no-routing] [shared_file ...]
#   experiment-worktree.sh cleanup <spec_name> <exp_index>
#   experiment-worktree.sh cleanup-all <spec_name>
#   experiment-worktree.sh count
#
# Worktrees are created at: .worktrees/optimize-<spec>-exp-<NNN>/
# Branches are named: optimize-exp/<spec>/exp-<NNN>

set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

GIT_ROOT=$(git rev-parse --show-toplevel 2>/dev/null) || {
  echo -e "${RED}Error: Not in a git repository${NC}" >&2
  exit 1
}
GIT_ROOT=$(cd "$GIT_ROOT" && pwd -P)

WORKTREE_DIR="$GIT_ROOT/.worktrees"
SCRIPT_DIR=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)
CONTROLLER="$SCRIPT_DIR/optimize-controller.py"

fail() {
  echo -e "${RED}Error: $*${NC}" >&2
  return 1
}

ensure_worktree_root_safe() {
  if [[ -L "$WORKTREE_DIR" ]]; then
    fail "worktree root must not be a symlink: $WORKTREE_DIR"
    return
  fi
  if [[ -e "$WORKTREE_DIR" && ! -d "$WORKTREE_DIR" ]]; then
    fail "worktree root is not a directory: $WORKTREE_DIR"
    return
  fi
}

validate_identity() {
  local spec_name="${1:?Error: spec_name required}"
  local exp_index="${2:?Error: exp_index required}"

  [[ "$spec_name" =~ ^[a-z0-9]+(-[a-z0-9]+)*$ ]] ||
    fail "spec_name must be lowercase kebab-case"
  [[ "$exp_index" =~ ^[0-9]+$ ]] ||
    fail "exp_index must be a non-negative integer"
}

contains_dotenv_component() {
  local relative_path="${1:?Error: relative path required}"
  local component
  local components=()
  IFS='/' read -r -a components <<< "$relative_path"
  for component in "${components[@]}"; do
    if [[ "$component" == .env* ]]; then
      return 0
    fi
  done
  return 1
}

validate_shared_path() {
  local relative_path="${1:?Error: shared path required}"
  local component
  local cursor="$GIT_ROOT"
  local source_path
  local canonical_path
  local nested
  local components=()

  if [[ "$relative_path" == /* || "$relative_path" == *$'\n'* || "$relative_path" == *$'\r'* ]]; then
    fail "shared input must be a clean repository-relative path: $relative_path"
    return
  fi

  IFS='/' read -r -a components <<< "$relative_path"
  for component in "${components[@]}"; do
    if [[ -z "$component" || "$component" == "." || "$component" == ".." ]]; then
      fail "shared input path escapes or is not canonical: $relative_path"
      return
    fi
    cursor="$cursor/$component"
    if [[ -L "$cursor" ]]; then
      fail "shared input contains a symlink: $relative_path"
      return
    fi
  done

  if contains_dotenv_component "$relative_path"; then
    fail ".env* material is never copied into an experiment worktree: $relative_path"
    return
  fi

  source_path="$GIT_ROOT/$relative_path"
  if [[ ! -e "$source_path" ]]; then
    fail "declared shared input does not exist: $relative_path"
    return
  fi

  if [[ -d "$source_path" ]]; then
    canonical_path=$(cd "$source_path" && pwd -P)
    nested=$(find "$source_path" -type l -print -quit 2>/dev/null || true)
    if [[ -n "$nested" ]]; then
      fail "shared input directory contains a symlink: $relative_path"
      return
    fi
    nested=$(find "$source_path" -name '.env*' -print -quit 2>/dev/null || true)
    if [[ -n "$nested" ]]; then
      fail "shared input directory contains .env* material: $relative_path"
      return
    fi
    nested=$(find "$source_path" ! -type f ! -type d -print -quit 2>/dev/null || true)
    if [[ -n "$nested" ]]; then
      fail "shared input directory contains non-regular material: $relative_path"
      return
    fi
  elif [[ -f "$source_path" ]]; then
    canonical_path=$(cd "$(dirname "$source_path")" && pwd -P)/$(basename "$source_path")
  else
    fail "shared input must be a regular file or directory: $relative_path"
    return
  fi

  case "$canonical_path" in
    "$GIT_ROOT"/*) ;;
    *)
      fail "shared input resolves outside the repository: $relative_path"
      return
      ;;
  esac
}

validate_destination_path() {
  local worktree_path="${1:?Error: worktree path required}"
  local relative_path="${2:?Error: relative path required}"
  local component
  local cursor="$worktree_path"
  local components=()

  IFS='/' read -r -a components <<< "$relative_path"
  for component in "${components[@]}"; do
    cursor="$cursor/$component"
    if [[ -L "$cursor" ]]; then
      fail "shared input destination contains a symlink: $relative_path"
      return
    fi
  done
}

require_terminal_lease() {
  local worktree_path="${1:?Error: worktree path required}"
  local response
  local status

  set +e
  response=$(python3 -I -S "$CONTROLLER" worktree-status --worktree "$worktree_path" 2>&1)
  local controller_exit=$?
  set -e
  status="${response%%$'\n'*}"
  if [[ "$controller_exit" -ne 0 || "$status" != "RESET_ALLOWED" ]]; then
    fail "controller lease does not prove terminal completed/abandoned state for $worktree_path (${status:-unavailable})"
    return
  fi
}

reject_routed_dotenv() {
  local worktree_path="${1:?Error: worktree path required}"
  local dotenv_path
  dotenv_path=$(find "$worktree_path" -name '.env*' -print -quit 2>/dev/null || true)
  if [[ -n "$dotenv_path" ]]; then
    fail "routed experiment worktree contains .env* material: ${dotenv_path#"$worktree_path"/}"
    return
  fi
}

experiment_branch_name() {
  local spec_name="${1:?Error: spec_name required}"
  local padded_index="${2:?Error: padded_index required}"

  # Keep experiment refs outside optimize/<spec> so they do not collide
  # with the long-lived optimization branch namespace.
  echo "optimize-exp/${spec_name}/exp-${padded_index}"
}

ensure_worktree_exclude() {
  local exclude_file
  exclude_file=$(git rev-parse --git-path info/exclude)

  mkdir -p "$(dirname "$exclude_file")"

  if ! grep -q "^\.worktrees$" "$exclude_file" 2>/dev/null; then
    echo ".worktrees" >> "$exclude_file"
  fi
}

is_registered_worktree() {
  local worktree_path="${1:?Error: worktree_path required}"

  git worktree list --porcelain | awk -v target="$worktree_path" '
    $1 == "worktree" && $2 == target { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}

is_branch_checked_out() {
  local branch_name="${1:?Error: branch_name required}"
  local branch_ref="refs/heads/$branch_name"

  git worktree list --porcelain | awk -v target="$branch_ref" '
    $1 == "branch" && $2 == target { found = 1 }
    END { exit(found ? 0 : 1) }
  '
}

reset_worktree_to_base() {
  local worktree_path="${1:?Error: worktree_path required}"
  local branch_name="${2:?Error: branch_name required}"
  local base_branch="${3:?Error: base_branch required}"
  local current_branch

  current_branch=$(git -C "$worktree_path" symbolic-ref --quiet --short HEAD 2>/dev/null || true)
  if [[ "$current_branch" != "$branch_name" ]]; then
    echo -e "${RED}Error: Existing worktree is on unexpected branch: ${current_branch:-detached} (expected $branch_name)${NC}" >&2
    echo -e "${RED}Clean up the stale worktree before rerunning this experiment.${NC}" >&2
    return 1
  fi

  require_terminal_lease "$worktree_path"

  echo -e "${YELLOW}Resetting existing experiment worktree to base: $branch_name -> $base_branch${NC}" >&2
  git -C "$worktree_path" reset --hard "$base_branch" >/dev/null
  git -C "$worktree_path" clean -fdx >/dev/null
}

# Create an experiment worktree
create_worktree() {
  local spec_name="${1:?Error: spec_name required}"
  local exp_index="${2:?Error: exp_index required}"
  local base_branch="${3:?Error: base_branch required}"
  shift 3
  local routed=1
  case "${1:-}" in
    --routed)
      shift
      ;;
    --legacy-no-routing)
      routed=0
      shift
      ;;
    --*)
      fail "unknown create option: $1"
      return
      ;;
  esac

  ensure_worktree_root_safe
  validate_identity "$spec_name" "$exp_index"
  if ! git rev-parse --verify --quiet "${base_branch}^{commit}" >/dev/null; then
    fail "base_branch does not resolve to a commit: $base_branch"
    return
  fi

  local shared_file
  for shared_file in "$@"; do
    validate_shared_path "$shared_file"
  done

  local padded_index
  padded_index=$(printf "%03d" "$((10#$exp_index))")
  local worktree_name="optimize-${spec_name}-exp-${padded_index}"
  local branch_name
  branch_name=$(experiment_branch_name "$spec_name" "$padded_index")
  local worktree_path="$WORKTREE_DIR/$worktree_name"

  # Check if worktree already exists
  if [[ -d "$worktree_path" ]]; then
    if ! git -C "$worktree_path" rev-parse --is-inside-work-tree >/dev/null 2>&1 || \
       ! is_registered_worktree "$worktree_path"; then
      echo -e "${RED}Error: Existing path is not a valid registered git worktree: $worktree_path${NC}" >&2
      echo -e "${RED}Remove or repair that directory before rerunning the experiment.${NC}" >&2
      return 1
    fi

    echo -e "${YELLOW}Worktree already exists: $worktree_path${NC}" >&2
    reset_worktree_to_base "$worktree_path" "$branch_name" "$base_branch"
  else
    mkdir -p "$WORKTREE_DIR"
    ensure_worktree_exclude

    # Create worktree from the base branch
    if ! git worktree add -b "$branch_name" "$worktree_path" "$base_branch" --quiet 2>/dev/null; then
      if git show-ref --verify --quiet "refs/heads/$branch_name"; then
        if is_branch_checked_out "$branch_name"; then
          echo -e "${RED}Error: Existing experiment branch is already checked out: $branch_name${NC}" >&2
          echo -e "${RED}Clean up the stale worktree before rerunning this experiment.${NC}" >&2
          return 1
        fi

        require_terminal_lease "$worktree_path"
        echo -e "${YELLOW}Resetting existing experiment branch to base: $branch_name -> $base_branch${NC}" >&2
        git branch -f "$branch_name" "$base_branch" >/dev/null
        git worktree add "$worktree_path" "$branch_name" --quiet
      else
        echo -e "${RED}Error: Failed to create worktree for $branch_name from $base_branch${NC}" >&2
        return 1
      fi
    fi
  fi

  # Preserve the shipped no-routing adapter only through an explicit owning-
  # skill decision. Secure routed behavior is the fail-closed default.
  if [[ "$routed" == "0" ]]; then
    local f
    for f in "$GIT_ROOT"/.env*; do
      if [[ -f "$f" ]]; then
        local basename
        basename=$(basename "$f")
        if [[ "$basename" != ".env.example" ]]; then
          cp "$f" "$worktree_path/$basename"
        fi
      fi
    done
  else
    reject_routed_dotenv "$worktree_path"
  fi

  # Copy only the shared inputs explicitly declared by the approved spec.
  for shared_file in "$@"; do
    validate_shared_path "$shared_file"
    validate_destination_path "$worktree_path" "$shared_file"
    if [[ -f "$GIT_ROOT/$shared_file" ]]; then
      local dir
      dir=$(dirname "$worktree_path/$shared_file")
      mkdir -p "$dir"
      cp "$GIT_ROOT/$shared_file" "$worktree_path/$shared_file"
    elif [[ -d "$GIT_ROOT/$shared_file" ]]; then
      local dir
      local destination="$worktree_path/$shared_file"
      dir=$(dirname "$destination")
      mkdir -p "$dir"
      rm -rf -- "${destination:?}"
      cp -R "$GIT_ROOT/$shared_file" "$destination"
    fi
  done

  echo "$worktree_path"
}

# Clean up a single experiment worktree
cleanup_worktree() {
  local spec_name="${1:?Error: spec_name required}"
  local exp_index="${2:?Error: exp_index required}"

  ensure_worktree_root_safe
  validate_identity "$spec_name" "$exp_index"
  if [[ -n "${3:-}" ]]; then
    fail "cleanup accepts no override; controller terminal state is required"
    return
  fi

  local padded_index
  padded_index=$(printf "%03d" "$((10#$exp_index))")
  local worktree_name="optimize-${spec_name}-exp-${padded_index}"
  local branch_name
  branch_name=$(experiment_branch_name "$spec_name" "$padded_index")
  local worktree_path="$WORKTREE_DIR/$worktree_name"

  if [[ -d "$worktree_path" ]]; then
    require_terminal_lease "$worktree_path"
    git worktree remove "$worktree_path" --force 2>/dev/null || {
      # If worktree remove fails, try manual cleanup
      rm -rf "$worktree_path" 2>/dev/null || true
      git worktree prune 2>/dev/null || true
    }
  fi

  # Delete the experiment branch
  git branch -D "$branch_name" 2>/dev/null || true

  echo -e "${GREEN}Cleaned up: $worktree_name${NC}" >&2
}

# Clean up all experiment worktrees for a spec
cleanup_all() {
  local spec_name="${1:?Error: spec_name required}"
  ensure_worktree_root_safe
  validate_identity "$spec_name" "0"
  if [[ -n "${2:-}" ]]; then
    fail "cleanup-all accepts no override; controller terminal state is required"
    return
  fi
  local prefix="optimize-${spec_name}-exp-"
  local count=0
  local retained=0

  if [[ ! -d "$WORKTREE_DIR" ]]; then
    echo -e "${YELLOW}No worktrees directory found${NC}" >&2
    return 0
  fi

  for worktree_path in "$WORKTREE_DIR"/"$prefix"*; do
    if [[ -d "$worktree_path" ]]; then
      local worktree_name
      worktree_name=$(basename "$worktree_path")
      # Extract index from name
      local index_str="${worktree_name#"$prefix"}"

      if ! require_terminal_lease "$worktree_path"; then
        echo -e "${YELLOW}Retained worktree without a controller-verified terminal checkpoint: $worktree_name${NC}" >&2
        retained=$((retained + 1))
        continue
      fi

      git worktree remove "$worktree_path" --force 2>/dev/null || {
        rm -rf "$worktree_path" 2>/dev/null || true
      }

      # Delete the branch
      local branch_name
      branch_name=$(experiment_branch_name "$spec_name" "$index_str")
      git branch -D "$branch_name" 2>/dev/null || true

      count=$((count + 1))
    fi
  done

  git worktree prune 2>/dev/null || true

  # Clean up empty worktree directory
  if [[ -d "$WORKTREE_DIR" ]] && [[ -z "$(ls -A "$WORKTREE_DIR" 2>/dev/null)" ]]; then
    rmdir "$WORKTREE_DIR" 2>/dev/null || true
  fi

  echo -e "${GREEN}Cleaned up $count experiment worktree(s) for $spec_name${NC}" >&2
  if [[ "$retained" -gt 0 ]]; then
    fail "$retained worktree(s) retained; complete or explicitly abandon their controller attempts"
    return
  fi
}

# Count total worktrees (for budget check)
count_worktrees() {
  local count=0
  ensure_worktree_root_safe
  if [[ -d "$WORKTREE_DIR" ]]; then
    for worktree_path in "$WORKTREE_DIR"/*; do
      if [[ -d "$worktree_path" ]] && [[ -e "$worktree_path/.git" ]]; then
        count=$((count + 1))
      fi
    done
  fi
  echo "$count"
}

# Main
main() {
  local command="${1:-help}"

  case "$command" in
    create)
      shift
      create_worktree "$@"
      ;;
    cleanup)
      shift
      cleanup_worktree "$@"
      ;;
    cleanup-all)
      shift
      cleanup_all "$@"
      ;;
    count)
      count_worktrees
      ;;
    help)
      cat << 'EOF'
Experiment Worktree Manager

Usage:
  experiment-worktree.sh create <spec_name> <exp_index> <base_branch> [--routed|--legacy-no-routing] [shared_file ...]
  experiment-worktree.sh cleanup <spec_name> <exp_index>
  experiment-worktree.sh cleanup-all <spec_name>
  experiment-worktree.sh count

Commands:
  create       Create a secure worktree; --legacy-no-routing restores v3.20.0 .env* discovery
  cleanup      Remove one worktree after a controller-verified terminal checkpoint
  cleanup-all  Remove terminally checkpointed worktrees; retain live/unknown attempts
  count        Count total active worktrees (for budget checking)

Worktrees:  .worktrees/optimize-<spec>-exp-<NNN>/
Branches:   optimize-exp/<spec>/exp-<NNN>
EOF
      ;;
    *)
      echo -e "${RED}Unknown command: $command${NC}" >&2
      exit 1
      ;;
  esac
}

main "$@"
