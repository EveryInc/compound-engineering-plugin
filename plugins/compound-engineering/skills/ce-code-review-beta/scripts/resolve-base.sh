#!/usr/bin/env bash
# Resolve the review base branch and compute the merge-base for ce-code-review.
# Handles fork-safe remote resolution, PR metadata, and multi-fallback detection.
#
# Usage:
#   bash scripts/resolve-base.sh
#       Auto-detect base branch from PR metadata, origin/HEAD, gh repo view, or
#       common branch names (main/master/develop/trunk).
#
#   bash scripts/resolve-base.sh --pr-url <url> --pr-base-branch <branch>
#       Use the given PR base directly. Recommended form: pass the full PR URL
#       so the script extracts host + owner/repo host-agnostically (works for
#       GitHub Enterprise and any non-github.com host).
#
#   bash scripts/resolve-base.sh --pr-base-repo <owner/repo> --pr-base-host <host> --pr-base-branch <branch>
#       Alternative form when callers already have host and repo as separate
#       values. Both --pr-base-repo and --pr-base-host must be present together.
#
# Sourcing for tests:
#   RESOLVE_BASE_SOURCE_ONLY=1 source scripts/resolve-base.sh
#       Loads parse_pr_url and parse_remote_url helpers without running the
#       main resolution flow. Used by tests/resolve-base-beta-script.test.ts.
#
# Output: BASE:<sha> on success, ERROR:<message> on failure. Failure messages
# include the captured stderr from the last failing fetch when available, so
# callers can distinguish "no such branch" from "network failure" from "auth
# failure" instead of seeing a single generic "unable to resolve" string.
#
# Limitations (intentional; documented):
#   - scp-form URLs with bracketed IPv6 (git@[::1]:owner/repo) not parsed.
#   - GHE deployments mounted under a path prefix (acme.com/github/...) fail
#     parse_pr_url, which triggers the standard fallback chain rather than
#     silently picking the wrong repo.

set -euo pipefail

# Lowercase a string via tr — used to normalize host and owner/repo so that
# GitHub's case-insensitive identifiers compare correctly even when remote URLs
# preserve user-typed casing.
to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# parse_pr_url <url>
# Outputs "HOST<TAB>OWNER/REPO" (both lowercased) on success, returns 1 on
# failure. Anchors owner/repo extraction on /pull/<N> from the right so a
# GHE deployment with a path prefix (acme.com/github/org/repo/pull/1) cleanly
# fails parsing instead of silently producing "github/org".
parse_pr_url() {
  local url=$1
  [ -n "$url" ] || return 1
  local no_scheme=${url#*://}
  [ "$no_scheme" != "$url" ] || return 1
  local host_part=${no_scheme%%/*}
  host_part=${host_part#*@}
  [ -n "$host_part" ] || return 1
  local path=${no_scheme#*/}
  [ "$path" != "$no_scheme" ] || return 1
  local owner_repo
  owner_repo=$(printf '%s\n' "$path" | sed -n 's#^\(.*\)/pull/[0-9][0-9]*\(/.*\)\{0,1\}$#\1#p')
  [ -n "$owner_repo" ] || return 1
  case "$owner_repo" in
    */*/*) return 1 ;;
    */*) ;;
    *) return 1 ;;
  esac
  printf '%s\t%s\n' "$(to_lower "$host_part")" "$(to_lower "$owner_repo")"
}

# parse_remote_url <url>
# Outputs "HOST<TAB>OWNER/REPO<TAB>FORM" (host/repo lowercased) on success,
# returns 1 on failure. Handles:
#   - https://[user@]host[:port]/owner/repo[.git]
#   - ssh://[user[:pass]@]host[:port]/owner/repo[.git]
#   - scp-form: user@host:owner/repo[.git]
# Preserves URL-form ports for exact host matching. Scp-form cannot carry the
# web UI port, so callers may choose a host-without-port fallback only for
# FORM=scp.
parse_remote_url() {
  local url=$1
  local host path form
  case "$url" in
    *://*)
      form=url
      local no_scheme=${url#*://}
      host=${no_scheme%%/*}
      host=${host#*@}
      [ "$no_scheme" != "$host" ] || return 1
      path=${no_scheme#*/}
      [ "$path" != "$no_scheme" ] || return 1
      ;;
    *@*:*)
      form=scp
      host=${url#*@}
      host=${host%%:*}
      path=${url#*:}
      [ "$path" != "$url" ] || return 1
      ;;
    *) return 1 ;;
  esac
  [ -n "$host" ] || return 1
  local owner_repo
  case "$path" in
    */*/*)
      # More than two path segments: take the first two.
      local first=${path%%/*}
      local rest=${path#*/}
      local second=${rest%%/*}
      owner_repo="$first/$second"
      ;;
    */*) owner_repo=$path ;;
    *) return 1 ;;
  esac
  owner_repo=${owner_repo%.git}
  [ -n "$owner_repo" ] || return 1
  printf '%s\t%s\t%s\n' "$(to_lower "$host")" "$(to_lower "$owner_repo")" "$form"
}

# When sourced for unit tests, expose helpers and stop before running the
# main flow.
if [ "${RESOLVE_BASE_SOURCE_ONLY:-0}" = "1" ]; then
  return 0 2>/dev/null || exit 0
fi

REVIEW_BASE_BRANCH=""
PR_URL=""
PR_BASE_REPO=""
PR_BASE_HOST=""
PR_BASE_REMOTE=""
BASE_REF=""
LAST_FETCH_ERR=""

# --- Parse optional flags. ---
while [ "$#" -gt 0 ]; do
  case "$1" in
    --pr-url)
      [ "$#" -ge 2 ] || { echo "ERROR:--pr-url requires a value"; exit 0; }
      PR_URL="$2"
      shift 2
      ;;
    --pr-base-repo)
      [ "$#" -ge 2 ] || { echo "ERROR:--pr-base-repo requires a value"; exit 0; }
      PR_BASE_REPO="$2"
      shift 2
      ;;
    --pr-base-host)
      [ "$#" -ge 2 ] || { echo "ERROR:--pr-base-host requires a value"; exit 0; }
      PR_BASE_HOST="$2"
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

# If --pr-url was given, parse it (overrides any --pr-base-repo/host duplicates).
if [ -n "$PR_URL" ]; then
  PARSED_URL=$(parse_pr_url "$PR_URL" || true)
  if [ -n "$PARSED_URL" ]; then
    PR_BASE_HOST=${PARSED_URL%%	*}
    PR_BASE_REPO=${PARSED_URL#*	}
  else
    echo "ERROR:--pr-url could not be parsed: $PR_URL"
    exit 0
  fi
fi

# Normalize manually-passed host/repo to lowercase to match parse_remote_url output.
if [ -n "$PR_BASE_HOST" ]; then
  PR_BASE_HOST=$(to_lower "$PR_BASE_HOST")
fi
if [ -n "$PR_BASE_REPO" ]; then
  PR_BASE_REPO=$(to_lower "$PR_BASE_REPO")
fi
PR_BASE_HOST_WITHOUT_PORT=$PR_BASE_HOST
case "$PR_BASE_HOST_WITHOUT_PORT" in *:*) PR_BASE_HOST_WITHOUT_PORT=${PR_BASE_HOST_WITHOUT_PORT%:*} ;; esac

# Flag-pair validation: --pr-base-repo requires --pr-base-host (so host-agnostic
# matching works) and --pr-base-branch.
if [ -n "$PR_BASE_REPO" ] && [ -z "$REVIEW_BASE_BRANCH" ]; then
  echo "ERROR:--pr-base-repo requires --pr-base-branch"
  exit 0
fi
if [ -n "$PR_BASE_REPO" ] && [ -z "$PR_BASE_HOST" ]; then
  echo "ERROR:--pr-base-repo requires --pr-base-host (or pass --pr-url instead)"
  exit 0
fi

# Capture stderr from a fetch into LAST_FETCH_ERR so the final error message
# can distinguish failure modes.
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
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  PR_META=$(gh pr view --json baseRefName,url 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    REVIEW_BASE_BRANCH=$(echo "$PR_META" | jq -r '.baseRefName // empty' 2>/dev/null || true)
    META_URL=$(echo "$PR_META" | jq -r '.url // empty' 2>/dev/null || true)
    if [ -n "$META_URL" ]; then
      PARSED_META=$(parse_pr_url "$META_URL" || true)
      if [ -n "$PARSED_META" ]; then
        PR_BASE_HOST=${PARSED_META%%	*}
        PR_BASE_REPO=${PARSED_META#*	}
      fi
    fi
  fi
fi

# Step 2: Fall back to origin/HEAD.
if [ -z "$REVIEW_BASE_BRANCH" ]; then
  REVIEW_BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##' || true)
fi

# Step 3: Fall back to gh repo view.
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
  if [ -n "$PR_BASE_REPO" ] && [ -n "$PR_BASE_HOST" ]; then
    # Iterate remotes and use git remote get-url so url.*.insteadOf rewrites
    # are honored. Match parsed (host, owner/repo) against the PR's parsed
    # (host, owner/repo). Exact equality on lowercased values — no substring
    # matching, no host hard-coding.
    while IFS= read -r remote_name; do
      [ -n "$remote_name" ] || continue
      remote_url=$(git remote get-url "$remote_name" 2>/dev/null || true)
      [ -n "$remote_url" ] || continue
      parsed=$(parse_remote_url "$remote_url" || true)
      [ -n "$parsed" ] || continue
      remote_host=${parsed%%	*}
      remote_rest=${parsed#*	}
      remote_repo=${remote_rest%%	*}
      remote_form=${remote_rest#*	}
      if { [ "$remote_host" = "$PR_BASE_HOST" ] || {
        [ "$remote_form" = "scp" ] && [ "$remote_host" = "$PR_BASE_HOST_WITHOUT_PORT" ]
      }; } && [ "$remote_repo" = "$PR_BASE_REPO" ]; then
        PR_BASE_REMOTE=$remote_name
        break
      fi
    done < <(git remote)

    if [ -n "$PR_BASE_REMOTE" ]; then
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
    if git remote get-url origin >/dev/null 2>&1; then
      BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
      if [ -z "$BASE_REF" ]; then
        run_fetch git fetch --no-tags origin "$REVIEW_BASE_BRANCH:refs/remotes/origin/$REVIEW_BASE_BRANCH" \
          || run_fetch git fetch --no-tags origin "$REVIEW_BASE_BRANCH" \
          || true
        BASE_REF=$(git rev-parse --verify "origin/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
      fi
    fi
    if [ -z "$BASE_REF" ]; then
      BASE_REF=$(git rev-parse --verify "$REVIEW_BASE_BRANCH" 2>/dev/null || true)
    fi
  fi
fi

# Compute merge-base.
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
    echo "ERROR:Unable to resolve review base branch locally. Last fetch stderr: $LAST_FETCH_ERR"
  else
    echo "ERROR:Unable to resolve review base branch locally. Fetch the base branch and rerun, or provide a PR number so the review scope can be determined from PR metadata."
  fi
fi
