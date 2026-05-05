#!/usr/bin/env bash
# Verify .compound-engineering/config.local.yaml integrity before reading or
# trusting its contents. Used by ce-code-review-beta consent + delegation flow.
#
# Usage: bash scripts/integrity-check-config.sh <repo_root>
# Output:
#   OK:<absolute-config-path>          when the config exists and passes all checks
#   ABSENT                             when the config (or its parent dir) is missing
#   ERROR:<reason>                     when an integrity check fails — DO NOT TRUST
#
# Checks (fail closed on any):
#   1. <repo_root>/.compound-engineering must not be a symlink
#   2. config.local.yaml must not be a symlink
#   3. Resolved config path must not escape the resolved repo root
#   4. If the path exists, it must be a regular file
#   5. The path must be ignored by .gitignore (gitignore coverage)
#   6. The path must not be tracked by git

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "ERROR:integrity-check-config.sh requires 1 arg: <repo_root>"
  exit 0
fi

REPO_ROOT_INPUT="$1"

# Canonicalize repo root.
RESOLVED_ROOT=""
if RESOLVED_ROOT=$(cd "$REPO_ROOT_INPUT" 2>/dev/null && pwd -P 2>/dev/null); then :; else
  echo "ERROR:repo_root cannot be canonicalized: $REPO_ROOT_INPUT"
  exit 0
fi

DIR="$RESOLVED_ROOT/.compound-engineering"
CONFIG="$DIR/config.local.yaml"

# 0. Parent directory must exist and not be a symlink.
if [ ! -e "$DIR" ]; then
  echo "ABSENT"
  exit 0
fi
if [ -L "$DIR" ]; then
  echo "ERROR:.compound-engineering is a symlink"
  exit 0
fi
if [ ! -d "$DIR" ]; then
  echo "ERROR:.compound-engineering exists but is not a directory"
  exit 0
fi

# 1. Config file: absent is ABSENT (not an error); symlink is fail-closed.
if [ ! -e "$CONFIG" ]; then
  echo "ABSENT"
  exit 0
fi
if [ -L "$CONFIG" ]; then
  echo "ERROR:config.local.yaml is a symlink"
  exit 0
fi
if [ ! -f "$CONFIG" ]; then
  echo "ERROR:config.local.yaml exists but is not a regular file"
  exit 0
fi

# 2. Resolved path must remain inside resolved root.
RESOLVED_CONFIG=""
if RESOLVED_CONFIG=$(cd "$(dirname "$CONFIG")" 2>/dev/null && pwd -P 2>/dev/null); then :; else
  echo "ERROR:cannot canonicalize config directory"
  exit 0
fi
RESOLVED_CONFIG="$RESOLVED_CONFIG/$(basename "$CONFIG")"
case "$RESOLVED_CONFIG" in
  "$RESOLVED_ROOT"/*)
    : # inside root, ok
    ;;
  *)
    echo "ERROR:resolved config path escapes repo root"
    exit 0
    ;;
esac

# 3. Must not be tracked by git. Check this BEFORE gitignore so a tracked file
# (which `git check-ignore` excludes) gets a precise error message instead of
# being misdiagnosed as a missing gitignore rule.
cd "$RESOLVED_ROOT"
if git ls-files --error-unmatch ".compound-engineering/config.local.yaml" >/dev/null 2>&1; then
  echo "ERROR:config.local.yaml is tracked by git"
  exit 0
fi

# 4. Must be gitignored.
if ! git check-ignore -q ".compound-engineering/config.local.yaml" 2>/dev/null; then
  echo "ERROR:config.local.yaml is not covered by .gitignore"
  exit 0
fi

echo "OK:$RESOLVED_CONFIG"
