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
#     "installed": true|false,       node_modules/riffrec/package.json exists
#     "live_build": true|false,      the installed dist/index.d.ts names both
#                                    RiffrecLiveConfig and LOOK_AT_SCREEN_TOOL
#                                    (a build that answers the endpoint's
#                                    screen tool, not just any live build)
#     "version": "1.2.3"|null,       installed node_modules/riffrec version,
#                                    else the declared range with a leading
#                                    ^ ~ = or v stripped; null when absent
#     "mount": true|false,           a RiffrecProvider JSX opening element
#                                    (not a comment or string) exists in a
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
  # $5 installed  $6 live_build
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
  printf '{"dependency":%s,"installed":%s,"live_build":%s,"version":%s,"mount":%s,"package_manager":%s}\n' \
    "$1" "$5" "$6" "$version_json" "$3" "$pm_json"
}

# A real JSX opening element for RiffrecProvider in one file: the tag follows
# the start of the line or an ordinary JSX expression prefix (whitespace, `(`,
# `{`, `=`, `>` of an arrow, `?`, `:`, `,`, `&`, `|`, or the `return` keyword),
# is followed by whitespace, `>`, or end of line, and is not inside a `//`
# remainder, a `/* */` or `{/* */}` block, or a quoted string on the same line.
has_jsx_mount() {
  # $1 file
  awk '
    {
      line = $0
      if (inblock) {
        if (index(line, "*/") == 0) next
        line = substr(line, index(line, "*/") + 2)
        inblock = 0
      }
      while ((start = index(line, "/*")) > 0) {
        stop = index(substr(line, start + 2), "*/")
        if (stop == 0) { line = substr(line, 1, start - 1); inblock = 1; break }
        line = substr(line, 1, start - 1) substr(line, start + 2 + stop + 1)
      }
      if ((c = index(line, "//")) > 0) line = substr(line, 1, c - 1)
      if (match(line, /<RiffrecProvider([[:space:]>]|$)/)) {
        before = substr(line, 1, RSTART - 1)
        if (index(before, "\"") > 0 || index(before, "\047") > 0 || index(before, "`") > 0) next
        if (before ~ /(^|[[:space:](){}=>?:,&|]|return)[[:space:]]*$/) { found = 1; exit }
      }
    }
    END { exit found ? 0 : 1 }
  ' "$1" 2>/dev/null
}

# Extract the first `"<key>": "<string>"` pair from a JSON file, wherever it
# sits on the line. package.json values that matter here are plain strings.
json_value() {
  # $1 file  $2 key
  grep -o '"'"$2"'"[[:space:]]*:[[:space:]]*"[^"]*"' "$1" 2>/dev/null \
    | head -n 1 \
    | sed -e 's/^"[^"]*"[[:space:]]*:[[:space:]]*"//' -e 's/"$//'
}

# The declared range of `riffrec` from dependencies, devDependencies, or
# peerDependencies only; a `riffrec` key under scripts, overrides,
# resolutions, or any other section is not a dependency. Prefers a real JSON
# parse through node; without node, a line-based walk that tracks which
# top-level section the cursor is in (package.json as written by the package
# managers is one key per line).
declared_dependency() {
  # $1 package.json
  if command -v node >/dev/null 2>&1; then
    node -e '
      const fs = require("fs");
      let pkg;
      try { pkg = JSON.parse(fs.readFileSync(process.argv[1], "utf8")); } catch { process.exit(0); }
      for (const section of ["dependencies", "devDependencies", "peerDependencies"]) {
        const range = pkg && pkg[section] && pkg[section].riffrec;
        if (typeof range === "string") { process.stdout.write(range); process.exit(0); }
      }
    ' "$1" 2>/dev/null
    return
  fi
  awk '
    /^[[:space:]]*"(dependencies|devDependencies|peerDependencies)"[[:space:]]*:[[:space:]]*\{/ { inside = 1; next }
    inside && /^[[:space:]]*\}/ { inside = 0; next }
    inside && /^[[:space:]]*"riffrec"[[:space:]]*:[[:space:]]*"/ {
      sub(/^[[:space:]]*"riffrec"[[:space:]]*:[[:space:]]*"/, ""); sub(/".*$/, ""); print; exit
    }
  ' "$1" 2>/dev/null
}

DEPENDENCY=false
INSTALLED=false
LIVE_BUILD=false
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

  DECLARED=$(declared_dependency "$PACKAGE_JSON")
  if [ -n "$DECLARED" ]; then
    DEPENDENCY=true
    INSTALLED_PKG="$TARGET_PATH/node_modules/riffrec/package.json"
    if [ -f "$INSTALLED_PKG" ]; then
      INSTALLED=true
      VERSION=$(json_value "$INSTALLED_PKG" "version")
      # The built entry types prove the build: RiffrecLiveConfig names the
      # live provider config, and LOOK_AT_SCREEN_TOOL the page-side handler
      # for the screen tool the endpoint advertises to the interviewer. An
      # older live-capable build has the first without the second, and a
      # declared range or a stale committed dist proves nothing.
      for dts in "$TARGET_PATH/node_modules/riffrec/dist/index.d.ts" "$TARGET_PATH/node_modules/riffrec/dist/index.d.cts"; do
        if [ -f "$dts" ] && grep -q "RiffrecLiveConfig" "$dts" 2>/dev/null && grep -q "LOOK_AT_SCREEN_TOOL" "$dts" 2>/dev/null; then
          LIVE_BUILD=true
          break
        fi
      done
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
      if grep -q '<RiffrecProvider' "$file" 2>/dev/null && has_jsx_mount "$file"; then
        echo found
        break
      fi
    done \
  | grep -q found; then
  MOUNT=true
fi

emit "$DEPENDENCY" "$VERSION" "$MOUNT" "$PACKAGE_MANAGER" "$INSTALLED" "$LIVE_BUILD"
exit 0
