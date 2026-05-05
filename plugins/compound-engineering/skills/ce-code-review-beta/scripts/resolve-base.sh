#!/usr/bin/env bash
# Resolve the review base branch and compute the merge-base for ce-code-review.
# Handles fork-safe remote resolution, PR metadata, and multi-fallback detection.
#
# Usage:
#   bash scripts/resolve-base.sh
#       Auto-detect base branch from PR metadata, origin/HEAD, gh repo view, or
#       common branch names (main/master/develop/trunk).
#
#   bash scripts/resolve-base.sh --pr-base-repo <owner/repo> --pr-base-branch <branch>
#       Use the given PR base directly. Both flags are required when either is
#       passed; partial flags emit ERROR. Used by SKILL.md PR-mode resolution
#       so PR-mode and standalone mode share one tested code path.
#
# Output: BASE:<sha> on success, ERROR:<message> on failure. Failure messages
# include the captured stderr from the last failing fetch when available, so
# callers can distinguish "no such branch" from "network failure" from "auth
# failure" instead of seeing a single generic "unable to resolve" string.

set -euo pipefail

REVIEW_BASE_BRANCH=""
PR_BASE_REPO=""
PR_BASE_REMOTE=""
BASE_REF=""
LAST_FETCH_ERR=""

# --- Parse optional flags. Both PR flags must be present together. ---
while [ "$#" -gt 0 ]; do
  case "$1" in
    --pr-base-repo)
      [ "$#" -ge 2 ] || { echo "ERROR:--pr-base-repo requires a value"; exit 0; }
      PR_BASE_REPO="$2"
      shift 2
      ;;
    --pr-base-branch)
      [ "$#" -ge 2 ] || { echo "ERROR:--pr-base-branch requires a value"; exit 0; }
      REVIEW_BASE_BRANCH="$2"
      shift 2
      ;;
    *)
      echo "ERROR:unknown argument: $1"
      exit 0
      ;;
  esac
done

if [ -n "$PR_BASE_REPO" ] && [ -z "$REVIEW_BASE_BRANCH" ]; then
  echo "ERROR:--pr-base-repo requires --pr-base-branch"
  exit 0
fi
if [ -n "$REVIEW_BASE_BRANCH" ] && [ -z "$PR_BASE_REPO" ] && [ "$1" != "" ]; then
  # Branch-only is allowed (callers may know the branch but not the base repo);
  # but if PR_BASE_REPO was explicitly required, we'd reject above.
  :
fi

# Capture stderr from a fetch into LAST_FETCH_ERR so the final error message
# can distinguish failure modes. Returns the fetch's exit code.
run_fetch() {
  local err
  err=$(mktemp -t ce-fetch-stderr-XXXXXX)
  local rc=0
  "$@" 2>"$err" >/dev/null || rc=$?
  if [ -s "$err" ]; then
    LAST_FETCH_ERR=$(tr -d '\r' <"$err" | tail -c 400)
  fi
  rm -f "$err"
  return "$rc"
}

# Step 1: Try PR metadata when no flags supplied (handles fork workflows).
# Skip auto-detection when caller passed PR flags explicitly — they win.
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  # Auto-detect: gh failure here is non-fatal (we have other fallbacks). The
  # `|| true` here is intentional — gh exits non-zero outside a PR checkout,
  # which is normal for `bun run`/dev-loop usage.
  PR_META=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    REVIEW_BASE_BRANCH=$(echo "$PR_META" | jq -r '.baseRefName // empty' 2>/dev/null || true)
    PR_BASE_REPO=$(echo "$PR_META" | jq -r '.url // empty' 2>/dev/null | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p' || true)
  fi
fi

# Step 2: Fall back to origin/HEAD. `|| true` is intentional — repos without
# origin/HEAD set (fresh clones, fork workflows) hit the next fallback.
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)
fi

# Step 3: Fall back to gh repo view. `|| true` intentional for the same reason.
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  REVIEW_BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)
fi

# Step 4: Fall back to common branch names.
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1 || git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      REVIEW_BASE_BRANCH="$candidate"
      break
    fi
  done
fi

# Resolve the base ref from the correct remote (fork-safe).
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if [ -n "$PR_BASE_REPO" ]; then
    # awk -v keeps PR_BASE_REPO out of the awk program string entirely so a
    # repo name with a quote/backslash can't terminate the awk source.
    PR_BASE_REMOTE=$(git remote -v | awk -v repo="$PR_BASE_REPO" 'index($2, "github.com:" repo) || index($2, "github.com/" repo) {print $1; exit}')
    if [ -n "$PR_BASE_REMOTE" ]; then
      # `|| true` intentional: rev-parse fails when the ref isn't fetched yet,
      # which is the normal case before run_fetch below.
      BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
      if [ -z "$BASE_REF" ]; then
        run_fetch git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH:refs/remotes/$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" \
          || run_fetch git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH" \
          || true
        BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
      fi
    fi
  fi
  if [ -z "$BASE_REF" ]; then
    # Only try origin if it exists as a remote; otherwise skip to avoid
    # confusing errors in fork setups where origin points at the user's fork.
    if git remote get-url origin >/dev/null 2>&1; then
      BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
      if [ -z "$BASE_REF" ]; then
        run_fetch git fetch --no-tags origin "$REVIEW_BASE_BRANCH:refs/remotes/origin/$REVIEW_BASE_BRANCH" \
          || run_fetch git fetch --no-tags origin "$REVIEW_BASE_BRANCH" \
          || true
        BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
      fi
    fi
    # Fall back to a bare local ref only if remote resolution failed.
    if [ -z "$BASE_REF" ]; then
      BASE_REF=$(git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
  fi
fi

# Compute merge-base. `|| BASE=""` handles unrelated histories — diagnosis is
# the unshallow path below, not this initial attempt.
if [ -n "$BASE_REF" ]; then
  BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
  if [ -z "$BASE" ] && [ "$(git rev-parse --is-shallow-repository 2>/dev/null || echo false)" = "true" ]; then
    if git remote get-url origin >/dev/null 2>&1; then
      run_fetch git fetch --no-tags --unshallow origin || true
      BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
    fi
    if [ -z "$BASE" ] && [ -n "$PR_BASE_REMOTE" ] && [ "$PR_BASE_REMOTE" != "origin" ]; then
      run_fetch git fetch --no-tags --unshallow "$PR_BASE_REMOTE" || true
      BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
    fi
  fi
else
  BASE=""
fi

if [ -n "$BASE" ]; then
  echo "BASE:$BASE"
else
  if [ -n "$LAST_FETCH_ERR" ]; then
    # Inline the captured stderr so the orchestrator can distinguish
    # auth/network/no-such-branch failures from generic resolution failures.
    echo "ERROR:Unable to resolve review base branch locally. Last fetch stderr: $LAST_FETCH_ERR"
  else
    echo "ERROR:Unable to resolve review base branch locally. Fetch the base branch and rerun, or provide a PR number so the review scope can be determined from PR metadata."
  fi
fi
