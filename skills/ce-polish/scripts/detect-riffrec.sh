#!/usr/bin/env bash
#
# detect-riffrec.sh — report whether a project already carries riffrec live
# mode: the dependency, its version, and a RiffrecProvider mount.
#
# Usage:
#   detect-riffrec.sh [path]
#
# Arguments:
#   path (optional) — project root to inspect. Defaults to the repository
#                     root via `git rev-parse --show-toplevel`, then to the
#                     current directory.
#
# Output contract (one JSON object on stdout, exit 0):
#   {
#     "dependency": true|false,      riffrec listed in dependencies,
#                                    devDependencies, or peerDependencies
#     "version": "1.2.3"|null,       installed node_modules/riffrec version,
#                                    else the declared range with a leading
#                                    ^ ~ = or v stripped; null when absent
#     "mount": true|false,           a RiffrecProvider JSX mount exists in a
#                                    source file outside node_modules and
#                                    build output
#     "package_manager": "npm"|"pnpm"|"yarn"|"bun"|null
#                                    from the sibling resolve-package-manager.sh;
#                                    null when the root has no package.json
#   }
#
# Errors (stderr, exit 1):
#   ERROR: <message>     — path does not exist or is not a directory
#
# Portable sh/bash: no jq, no associative arrays, no GNU-only flags.

set -u

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd -P)
TARGET_PATH="${1:-}"

if [ -n "$TARGET_PATH" ]; then
  if [ ! -d "$TARGET_PATH" ]; then
    echo "ERROR: path does not exist or is not a directory: $TARGET_PATH" >&2
    exit 1
  fi
else
  TARGET_PATH=$(git rev-parse --show-toplevel 2>/dev/null)
  if [ -z "$TARGET_PATH" ]; then
    TARGET_PATH=$(pwd)
  fi
fi

TARGET_PATH=$(cd "$TARGET_PATH" && pwd -P)

# Escape a value for a JSON string literal (backslash and double quote only;
# versions and package-manager names carry nothing else that needs escaping).
json_string() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e 's/"/\\"/g'
}

emit() {
  # $1 dependency  $2 version-or-empty  $3 mount  $4 package-manager-or-empty
  if [ -n "$2" ]; then
    version_json="\"$(json_string "$2")\""
  else
    version_json="null"
  fi
  if [ -n "$4" ]; then
    pm_json="\"$(json_string "$4")\""
  else
    pm_json="null"
  fi
  printf '{"dependency":%s,"version":%s,"mount":%s,"package_manager":%s}\n' \
    "$1" "$version_json" "$3" "$pm_json"
}

# Extract the first `"<key>": "<string>"` pair from a JSON file, wherever it
# sits on the line. package.json values that matter here are plain strings.
json_value() {
  # $1 file  $2 key
  grep -o '"'"$2"'"[[:space:]]*:[[:space:]]*"[^"]*"' "$1" 2>/dev/null \
    | head -n 1 \
    | sed -e 's/^"[^"]*"[[:space:]]*:[[:space:]]*"//' -e 's/"$//'
}

DEPENDENCY=false
VERSION=""
MOUNT=false
PACKAGE_MANAGER=""

PACKAGE_JSON="$TARGET_PATH/package.json"

if [ -f "$PACKAGE_JSON" ]; then
  PACKAGE_MANAGER=$(bash "$SCRIPT_DIR/resolve-package-manager.sh" "$TARGET_PATH" 2>/dev/null | head -n 1)
  case "$PACKAGE_MANAGER" in
    npm|pnpm|yarn|bun) ;;
    *) PACKAGE_MANAGER="" ;;
  esac

  # A `"riffrec": "<range>"` entry anywhere in package.json is a dependency
  # declaration: package.json has no other place a bare package name appears
  # as a key with a string value.
  DECLARED=$(json_value "$PACKAGE_JSON" "riffrec")
  if [ -n "$DECLARED" ]; then
    DEPENDENCY=true
    INSTALLED_PKG="$TARGET_PATH/node_modules/riffrec/package.json"
    if [ -f "$INSTALLED_PKG" ]; then
      VERSION=$(json_value "$INSTALLED_PKG" "version")
    fi
    if [ -z "$VERSION" ]; then
      VERSION=$(printf '%s' "$DECLARED" | sed -e 's/^[\^~=v]//')
    fi
  fi
fi

# Mount detection: a JSX opening tag for RiffrecProvider in a source file.
# Import lines alone do not count; the tag is what mounts the provider.
if find "$TARGET_PATH" \
    \( -name node_modules -o -name .git -o -name dist -o -name build -o -name coverage \
       -o -name .next -o -name .nuxt -o -name .svelte-kit -o -name .turbo -o -name tmp \
       -o -name vendor -o -name public \) -prune -o \
    -type f \( -name '*.tsx' -o -name '*.jsx' -o -name '*.ts' -o -name '*.js' -o -name '*.mjs' \) \
    -print 2>/dev/null \
  | while IFS= read -r file; do
      if grep -q '<RiffrecProvider' "$file" 2>/dev/null; then
        echo found
        break
      fi
    done \
  | grep -q found; then
  MOUNT=true
fi

emit "$DEPENDENCY" "$VERSION" "$MOUNT" "$PACKAGE_MANAGER"
exit 0
