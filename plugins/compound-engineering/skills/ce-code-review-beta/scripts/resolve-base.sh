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
#   - GHE PR URLs mounted under a path prefix (acme.com/github/...) fail
#     parse_pr_url. With --pr-url this errors out explicitly; in auto-detect
#     mode where `gh pr view` returns such a URL, the resolver fails closed
#     with ERROR rather than silently falling back to origin (which would
#     compute merge-base against fork history). Callers can work around this
#     by passing --pr-base-repo/--pr-base-host/--pr-base-branch directly only
#     when a matching two-segment remote URL is configured.
#   - Remote URLs with more than two path segments are rejected instead of
#     silently truncating parent path segments. This fails closed for
#     path-prefixed GHE remotes and nested namespaces such as GitLab subgroups.
#   - url.*.insteadOf rewrites that target non-http(s)/ssh/git/scp schemes
#     (e.g., file://, custom helpers) cause parse_remote_url to reject the
#     rewritten URL, so identity matching against the raw configured URL is
#     not attempted. Workaround: configure the remote with its identity URL
#     and rely on git's native fetch-time rewriting.
#   - Percent-encoded path segments (%XX) in PR URLs are compared literally
#     and will not match a decoded remote path. GitHub web URLs do not emit
#     percent-encoding for owner/repo in practice.

set -euo pipefail

# Lowercase a string via tr — used to normalize host and owner/repo so that
# GitHub's case-insensitive identifiers compare correctly even when remote URLs
# preserve user-typed casing.
to_lower() {
  printf '%s' "$1" | tr '[:upper:]' '[:lower:]'
}

# derive_host_without_port <host>
# Strip a trailing :port from a host. Bracket-aware so IPv6 literals like
# [2001:db8::1] are preserved intact: stripping the final colon would collapse
# distinct IPv6 hosts to the same prefix (e.g., [2001:db8::1] and [2001:db8::2]
# both reducing to [2001:db8:), which combined with the URL-form ssh/git/scp
# host-without-port fallback in the matcher would silently match unrelated
# remotes. Case order matters: the IPv6 patterns must come before *:* because
# bracketed addresses contain colons.
derive_host_without_port() {
  local host=$1
  case "$host" in
    \[*\]) ;;                       # [ipv6] no port — preserve
    \[*\]:*) host=${host%:*} ;;     # [ipv6]:port — strip port
    *:*) host=${host%:*} ;;         # host:port — strip port
  esac
  printf '%s\n' "$host"
}

normalize_default_port() {
  local scheme=$1
  local host=$2
  case "$scheme:$host" in
    https:*:443) host=${host%:443} ;;
    http:*:80) host=${host%:80} ;;
  esac
  printf '%s\n' "$host"
}

has_invalid_percent_escape() {
  local value=$1
  while :; do
    case "$value" in
      *%*) value=${value#*%} ;;
      *) return 1 ;;
    esac
    case "$value" in
      [0-9A-Fa-f][0-9A-Fa-f]*) value=${value#??} ;;
      *) return 0 ;;
    esac
  done
}

# parse_pr_url <url>
# Outputs "HOST<TAB>OWNER/REPO" (both lowercased) on success, returns 1 on
# failure. Anchors owner/repo extraction on /pull/<N> from the right so a
# GHE deployment with a path prefix (acme.com/github/org/repo/pull/1) cleanly
# fails parsing instead of silently producing "github/org".
parse_pr_url() {
  local url=$1
  [ -n "$url" ] || return 1
  case "$url" in
    *\?*) url=${url%%\?*} ;;
  esac
  case "$url" in
    *#*) url=${url%%#*} ;;
  esac
  local scheme=${url%%://*}
  [ "$scheme" != "$url" ] || return 1
  case "$scheme" in
    https|http) ;;
    *) return 1 ;;
  esac
  local no_scheme=${url#*://}
  [ "$no_scheme" != "$url" ] || return 1
  local host_part=${no_scheme%%/*}
  host_part=${host_part#*@}
  [ -n "$host_part" ] || return 1
  host_part=$(normalize_default_port "$scheme" "$host_part")
  local path=${no_scheme#*/}
  [ "$path" != "$no_scheme" ] || return 1
  local owner_repo
  owner_repo=$(printf '%s\n' "$path" | sed -n 's#^\(.*\)/pull/[0-9][0-9]*\(/.*\)\{0,1\}$#\1#p')
  [ -n "$owner_repo" ] || return 1
  has_invalid_percent_escape "$owner_repo" && return 1
  case "$owner_repo" in
    */*/*) return 1 ;;
    */*) ;;
    *) return 1 ;;
  esac
  local repo=${owner_repo##*/}
  local owner_path=${owner_repo%/*}
  local owner=${owner_path##*/}
  [ -n "$owner" ] || return 1
  [ -n "$repo" ] || return 1
  owner_repo="$owner/$repo"
  printf '%s\t%s\n' "$(to_lower "$host_part")" "$(to_lower "$owner_repo")"
}

# parse_remote_url <url>
# Outputs "HOST<TAB>OWNER/REPO<TAB>FORM" (host/repo lowercased) on success,
# returns 1 on failure. Handles:
#   - https://[user@]host[:port]/owner/repo[.git]
#   - http://[user@]host[:port]/owner/repo[.git]
#   - ssh://[user[:pass]@]host[:port]/owner/repo[.git]
#   - git://host[:port]/owner/repo[.git]
#   - scp-form: [user@]host:owner/repo[.git]
# Preserves non-default URL-form ports for exact host matching. Scp-form,
# ssh://, and git:// do not carry the web UI port, so callers may choose a
# host-without-port fallback only for FORM=scp/ssh/git. Rejects paths deeper
# than owner/repo so path-prefixed deployments and nested namespaces fail
# closed instead of silently dropping path segments.
parse_remote_url() {
  local url=$1
  local host path form
  case "$url" in
    *://*)
      local scheme=${url%%://*}
      case "$scheme" in
        https|http|ssh|git) form=$scheme ;;
        *) return 1 ;;
      esac
      local no_scheme=${url#*://}
      host=${no_scheme%%/*}
      host=${host#*@}
      [ "$no_scheme" != "$host" ] || return 1
      [ -n "$host" ] || return 1
      host=$(normalize_default_port "$scheme" "$host")
      path=${no_scheme#*/}
      [ "$path" != "$no_scheme" ] || return 1
      ;;
    *:*)
      form=scp
      local before_colon=${url%%:*}
      case "$before_colon" in
        */*) return 1 ;;
      esac
      # Reject bare-scheme inputs (e.g., `http:owner/repo` missing `//`) that
      # would otherwise misclassify as scp with host=`http`. These shapes are
      # never valid scp-form per git-clone(1).
      case "$before_colon" in
        http|https|ssh|git|ftp|ftps|file|rsync) return 1 ;;
      esac
      case "$before_colon" in
        *@*) host=${before_colon#*@} ;;
        *) host=$before_colon ;;
      esac
      case "$host" in
        \[*) return 1 ;;
      esac
      [ -n "$host" ] || return 1
      path=${url#*:}
      [ "$path" != "$url" ] || return 1
      ;;
    *) return 1 ;;
  esac
  [ -n "$host" ] || return 1
  local owner_repo
  path=${path%/}
  has_invalid_percent_escape "$path" && return 1
  path=${path%.git}
  case "$path" in
    */*/*) return 1 ;;
    */*) owner_repo=$path ;;
    *) return 1 ;;
  esac
  local repo=${owner_repo##*/}
  local owner_path=${owner_repo%/*}
  local owner=${owner_path##*/}
  [ -n "$owner" ] || return 1
  [ -n "$repo" ] || return 1
  owner_repo="$owner/$repo"
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
PR_BASE_BRANCH_FROM_CLI=0

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
      PR_BASE_BRANCH_FROM_CLI=1
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
PR_BASE_HOST_WITHOUT_PORT=$(derive_host_without_port "$PR_BASE_HOST")

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
if [ -n "$PR_BASE_HOST" ] && [ -z "$PR_BASE_REPO" ]; then
  echo "ERROR:--pr-base-host requires --pr-base-repo (or pass --pr-url instead)"
  exit 0
fi
if [ "$PR_BASE_BRANCH_FROM_CLI" = "1" ] && [ -n "$REVIEW_BASE_BRANCH" ] && [ -z "$PR_URL" ] && [ -z "$PR_BASE_REPO" ] && [ -z "$PR_BASE_HOST" ]; then
  echo "ERROR:--pr-base-branch requires --pr-url or --pr-base-repo/--pr-base-host (or omit all flags for auto-detect)"
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
#
# Fail-closed semantics: if `gh pr view` identifies us as on a PR (non-empty
# baseRefName), we MUST establish PR_BASE_HOST/PR_BASE_REPO so the
# matched-remote gate below triggers; silently dropping PR metadata here would
# fall through to origin and compute merge-base against fork history. Same bug
# class d87ab1a0 closed for matched-remote-fetch-fails and no-matching-remote
# — third trigger is "gh-returned-but-unestablishable PR metadata" (empty or
# unparseable PR URL, e.g., GHE deployments mounted under a path prefix). When
# gh returns no PR at all (empty PR_META or empty baseRefName), this block
# silently falls through to the legacy auto-detect chain (Steps 2-4).
if [ -z "$REVIEW_BASE_BRANCH" ] && command -v gh >/dev/null 2>&1; then
  PR_META=$(gh pr view --json baseRefName,url --jq '(.baseRefName // "") + "\t" + (.url // "")' 2>/dev/null || true)
  if [ -n "$PR_META" ]; then
    TAB=$(printf '\t')
    META_BRANCH=${PR_META%%"$TAB"*}
    META_URL=${PR_META#*"$TAB"}
    if [ -n "$META_BRANCH" ]; then
      if [ -z "$META_URL" ]; then
        echo "ERROR:gh pr view returned base branch '$META_BRANCH' but no URL; cannot establish PR base repo for fail-closed resolution. Pass --pr-url explicitly."
        exit 0
      fi
      PARSED_META=$(parse_pr_url "$META_URL" || true)
      if [ -z "$PARSED_META" ]; then
        echo "ERROR:gh pr view returned an unparseable PR URL: $META_URL. Pass --pr-url explicitly, or use --pr-base-repo/--pr-base-host/--pr-base-branch with a matching two-segment remote URL."
        exit 0
      fi
      REVIEW_BASE_BRANCH=$META_BRANCH
      PR_BASE_HOST=${PARSED_META%%	*}
      PR_BASE_REPO=${PARSED_META#*	}
      PR_BASE_HOST_WITHOUT_PORT=$(derive_host_without_port "$PR_BASE_HOST")
    elif [ -n "$META_URL" ]; then
      echo "ERROR:gh pr view returned PR URL '$META_URL' but no base branch; cannot determine review base safely. Pass --pr-base-branch explicitly."
      exit 0
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
#
# PR_METADATA_PROVIDED gates fail-closed behavior. Once a caller has told us
# which repo the PR is opened against (via --pr-url, --pr-base-repo/host, or
# `gh pr view`), we must NOT silently fall back to origin or a local branch if
# we can't reach that specific repo — that would compute merge-base against
# the wrong history (typically the fork's, or an unrelated checkout's),
# silently producing the wrong diff scope for reviewers. The legacy
# origin/local fallback only applies when no PR metadata was provided
# (auto-detect / branch mode).
PR_METADATA_PROVIDED=0
MATCHED_REMOTES=()
if [ -n "$REVIEW_BASE_BRANCH" ]; then
  if [ -n "$PR_BASE_REPO" ] && [ -n "$PR_BASE_HOST" ]; then
    PR_METADATA_PROVIDED=1
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
      remote_host_without_port=$(derive_host_without_port "$remote_host")
      if { [ "$remote_host" = "$PR_BASE_HOST" ] || {
        case "$remote_form" in
          scp|ssh|git) [ "$remote_host_without_port" = "$PR_BASE_HOST_WITHOUT_PORT" ] ;;
          *) false ;;
        esac
      }; } && [ "$remote_repo" = "$PR_BASE_REPO" ]; then
        MATCHED_REMOTES+=("$remote_name")
      fi
    done < <(git remote)

    # Guard the for-loop: bash 3.2 (macOS default) errors on
    # "${empty_array[@]}" under `set -u`, which would crash before the
    # fail-closed ERROR gate below can emit its structured message.
    if [ "${#MATCHED_REMOTES[@]}" -gt 0 ]; then
      for matched_remote in "${MATCHED_REMOTES[@]}"; do
        # Clear per-remote so the final error message's stderr accurately
        # reflects the remote it names (LAST_MATCHED_REMOTE), instead of
        # potentially carrying an earlier remote's stderr forward.
        LAST_FETCH_ERR=""
        BASE_REF=$(git rev-parse --verify "$matched_remote/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
        if [ -z "$BASE_REF" ]; then
          run_fetch git fetch --no-tags "$matched_remote" "$REVIEW_BASE_BRANCH:refs/remotes/$matched_remote/$REVIEW_BASE_BRANCH" \
            || run_fetch git fetch --no-tags "$matched_remote" "$REVIEW_BASE_BRANCH" \
            || true
          BASE_REF=$(git rev-parse --verify "$matched_remote/$REVIEW_BASE_BRANCH" 2>/dev/null || true)
        fi
        if [ -n "$BASE_REF" ]; then
          PR_BASE_REMOTE=$matched_remote
          break
        fi
      done
    fi
  fi

  # Fail-closed gate: if PR metadata was provided but we could not resolve
  # the base ref from the matched remote (or no remote matched at all), do
  # NOT fall through to origin/local. Both sub-cases produce the same wrong
  # outcome — silently computing diff against a different repo's history.
  if [ "$PR_METADATA_PROVIDED" = "1" ] && [ -z "$BASE_REF" ]; then
    if [ "${#MATCHED_REMOTES[@]}" -gt 0 ]; then
      LAST_MATCHED_REMOTE=${MATCHED_REMOTES[$((${#MATCHED_REMOTES[@]} - 1))]}
      if [ -n "$LAST_FETCH_ERR" ]; then
        echo "ERROR:Identified PR base remote '$LAST_MATCHED_REMOTE' (host=$PR_BASE_HOST, repo=$PR_BASE_REPO) but failed to resolve '$REVIEW_BASE_BRANCH' there. Last fetch stderr: $LAST_FETCH_ERR"
      else
        echo "ERROR:Identified PR base remote '$LAST_MATCHED_REMOTE' (host=$PR_BASE_HOST, repo=$PR_BASE_REPO) but '$REVIEW_BASE_BRANCH' is unresolvable there. Verify the remote URL, branch name, and authentication."
      fi
    else
      echo "ERROR:PR metadata (host=$PR_BASE_HOST, repo=$PR_BASE_REPO) does not match any configured git remote. Add a remote pointing at the PR base repository and retry; do not silently fall back to origin, which may belong to a different repository."
    fi
    exit 0
  fi

  # No PR metadata path: legacy origin/local fallback for auto-detect and
  # branch-mode invocations. Safe here because the caller did not name a
  # specific PR base — we use whatever local context is available.
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
