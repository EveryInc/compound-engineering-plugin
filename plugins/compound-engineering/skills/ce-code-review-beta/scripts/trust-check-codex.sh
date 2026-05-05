#!/usr/bin/env bash
# Trust-check a candidate Codex CLI binary before launching delegated reviewers.
#
# Usage: bash scripts/trust-check-codex.sh <codex_bin> <repo_root> <scratch_dir>
# Output: TRUSTED:<canonical-path> on success, ERROR:<message> on failure.
#
# Verifies that <codex_bin> is safe to invoke as the delegated review process:
#   1. Exists and is executable
#   2. Canonical path is free of shell metacharacters and newlines
#   3. Canonical path is not inside the reviewed repo or the scratch directory
#   4. Canonical path is not under a world-writable parent (e.g., /tmp)
#   5. Smoke-probe survives the same scrubbed env -i shape that the actual
#      delegated launch uses (catches nvm/asdf wrappers whose interpreter
#      isn't on the scrubbed PATH, and TTY-blocking CLI builds).

set -euo pipefail

if [ "$#" -ne 3 ]; then
  echo "ERROR:trust-check-codex.sh requires 3 args: <codex_bin> <repo_root> <scratch_dir>"
  exit 1
fi

CODEX_BIN_INPUT="$1"
REPO_ROOT="$2"
SCRATCH_DIR="$3"

# --- 1. Reject obvious shell metacharacters before doing anything else ---
case "$CODEX_BIN_INPUT" in
  *[$'\n\r']*)
    echo "ERROR:codex_bin path contains newline"
    exit 1
    ;;
  *\"*|*\'*|*\`*|*\;*|*\|*|*\&*|*\<*|*\>*|*\(*|*\)*|*\\*|*\$*)
    echo "ERROR:codex_bin path contains shell metacharacters"
    exit 1
    ;;
esac

# --- 2. Existence + executability ---
if [ ! -e "$CODEX_BIN_INPUT" ]; then
  echo "ERROR:codex_bin does not exist: $CODEX_BIN_INPUT"
  exit 1
fi

# --- 3. Canonicalize. Use a portable approach (readlink -f isn't on macOS by default). ---
CANONICAL=""
if command -v readlink >/dev/null 2>&1; then
  CANONICAL=$(readlink -f "$CODEX_BIN_INPUT" 2>/dev/null || true)
fi
if [ -z "$CANONICAL" ]; then
  # Fallback: cd to the dirname and pwd -P, then re-attach basename
  bin_dir=$(cd "$(dirname "$CODEX_BIN_INPUT")" 2>/dev/null && pwd -P 2>/dev/null || true)
  if [ -z "$bin_dir" ]; then
    echo "ERROR:cannot canonicalize codex_bin path: $CODEX_BIN_INPUT"
    exit 1
  fi
  CANONICAL="$bin_dir/$(basename "$CODEX_BIN_INPUT")"
fi

if [ ! -f "$CANONICAL" ] || [ ! -x "$CANONICAL" ]; then
  echo "ERROR:canonical codex_bin is not an executable regular file: $CANONICAL"
  exit 1
fi

# --- 4. Reject canonical paths inside repo or scratch ---
if [ -n "$REPO_ROOT" ]; then
  case "$CANONICAL" in
    "$REPO_ROOT"|"$REPO_ROOT"/*)
      echo "ERROR:codex_bin canonical path is inside the reviewed repo: $CANONICAL"
      exit 1
      ;;
  esac
fi
if [ -n "$SCRATCH_DIR" ]; then
  case "$CANONICAL" in
    "$SCRATCH_DIR"|"$SCRATCH_DIR"/*)
      echo "ERROR:codex_bin canonical path is inside the scratch directory: $CANONICAL"
      exit 1
      ;;
  esac
fi

# --- 5. Reject canonical paths under common world-writable locations ---
case "$CANONICAL" in
  /tmp|/tmp/*|/var/tmp|/var/tmp/*|/private/tmp|/private/tmp/*|/dev/shm|/dev/shm/*)
    echo "ERROR:codex_bin canonical path is under a world-writable directory: $CANONICAL"
    exit 1
    ;;
esac

# Also explicitly reject any directory in the canonical path that is actually
# world-writable (catches non-standard mountpoints we don't enumerate above).
check_dir="$(dirname "$CANONICAL")"
while [ "$check_dir" != "/" ] && [ -n "$check_dir" ]; do
  if [ -d "$check_dir" ] && [ -w "$check_dir" ]; then
    # `[ -w ]` is true for the current user; world-writable detection requires stat.
    perms=""
    if perms=$(stat -f '%Lp' "$check_dir" 2>/dev/null); then :; else perms=$(stat -c '%a' "$check_dir" 2>/dev/null || echo "")
    fi
    if [ -n "$perms" ]; then
      # Last digit is "other" perms; >=2 means world-writable.
      last=${perms#${perms%?}}
      case "$last" in
        2|3|6|7)
          echo "ERROR:codex_bin canonical path has a world-writable parent directory: $check_dir"
          exit 1
          ;;
      esac
    fi
  fi
  parent="$(dirname "$check_dir")"
  if [ "$parent" = "$check_dir" ]; then break; fi
  check_dir="$parent"
done

# --- 6. Smoke probe under the actual delegated-launch env shape ---
PROBE_HOME="$(mktemp -d -t ce-codex-probe-XXXXXX)"
chmod 700 "$PROBE_HOME"
# Hard-disable network egress so a future Codex build that does telemetry at
# startup fails fast here instead of silently leaking a probe.
PROBE_OUT=""
PROBE_STATUS=0
PROBE_OUT=$(env -i \
  PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:/usr/local/bin" \
  HOME="$PROBE_HOME" \
  CODEX_HOME="$PROBE_HOME" \
  NO_PROXY="*" \
  HTTP_PROXY="http://127.0.0.1:1" \
  HTTPS_PROXY="http://127.0.0.1:1" \
  timeout 10 "$CANONICAL" --version 2>&1) || PROBE_STATUS=$?
rm -rf "$PROBE_HOME"

if [ "$PROBE_STATUS" -ne 0 ]; then
  # Help users debug nvm/asdf shim failures, since `#!/usr/bin/env node` will
  # fail under env -i when node isn't on the scrubbed PATH.
  case "$PROBE_OUT" in
    *"env: node"*|*"env: bun"*|*"env: python"*|*"command not found"*)
      echo "ERROR:codex_bin smoke probe failed; likely nvm/asdf shim — interpreter (node/bun/python) not on scrubbed PATH. Output: ${PROBE_OUT:0:200}"
      exit 1
      ;;
  esac
  echo "ERROR:codex_bin smoke probe failed (exit $PROBE_STATUS) under scrubbed env. Output: ${PROBE_OUT:0:200}"
  exit 1
fi

echo "TRUSTED:$CANONICAL"
