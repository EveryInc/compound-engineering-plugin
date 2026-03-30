#!/usr/bin/env bash
# Resolve the review base branch and compute the merge-base for ce:review.
# Handles fork-safe remote resolution, PR metadata, and multi-fallback detection.
#
# Usage: bash references/resolve-base.sh
# Output: BASE:<sha> on success, ERROR:<message> on failure.
#
# Detects the base branch from (in priority order):
# 1. PR metadata (base ref + base repo for fork safety)
# 2. origin/HEAD symbolic ref
# 3. gh repo view defaultBranchRef
# 4. Common branch names: main, master, develop, trunk

set -euo pipefail

REVIEW_BASE_BRANCH=""
PR_BASE_REPO=""
BASE_REF=""

# Step 1: Try PR metadata (handles fork workflows)
if command -v gh >/dev/null 2>&1; then
  PR_META=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    REVIEW_BASE_BRANCH=$(echo "$PR_META" | jq -r '.baseRefName // empty' 2>/dev/null || true)
    PR_BASE_REPO=$(echo "$PR_META" | jq -r '.url // empty' 2>/dev/null | sed -n 's#https://github.com/\([^/]*/[^/]*\)/pull/.*#\1#p' || true)
  fi
fi

# Step 2: Fall back to origin/HEAD
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)
fi

# Step 3: Fall back to gh repo view
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  REVIEW_BASE_BRANCH=$(gh repo view --json defaultBranchRef --jq '.defaultBranchRef.name' 2>/dev/null || true)
fi

# Step 4: Fall back to common branch names
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  for candidate in main master develop trunk; do
    if git rev-parse --verify "origin/$candidate" >/dev/null 2>&1 || git rev-parse --verify "$candidate" >/dev/null 2>&1; then
      REVIEW_BASE_BRANCH="$candidate"
      break
    fi
  done
fi

# Resolve the base ref from the correct remote (fork-safe)
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if [ -n "$PR_BASE_REPO" ]; then
    PR_BASE_REMOTE=$(git remote -v | awk "index(\$2, \"github.com:$PR_BASE_REPO\") || index(\$2, \"github.com/$PR_BASE_REPO\") {print \$1; exit}")
    if [ -n "$PR_BASE_REMOTE" ]; then
      git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" >/dev/null 2>&1 || git fetch --no-tags "$PR_BASE_REMOTE" "$REVIEW_BASE_BRANCH" 2>/dev/null || true
      BASE_REF=$(git rev-parse --verify "$PR_BASE_REMOTE/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
  fi
  if [ -z "$BASE_REF" ]; then
    git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" >/dev/null 2>&1 || git fetch --no-tags origin "$REVIEW_BASE_BRANCH" 2>/dev/null || true
    BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
  fi
fi

# Compute merge-base
if [ -n "$BASE_REF" ]; then
  BASE=$(git merge-base HEAD "$BASE_REF" 2>/dev/null) || BASE=""
else
  BASE=""
fi

if [ -n "$BASE" ]; then
  echo "BASE:$BASE"
else
  echo "ERROR:Unable to resolve review base branch locally. Fetch the base branch and rerun, or provide a PR number so the review scope can be determined from PR metadata."
fi
