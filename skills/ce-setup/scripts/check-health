#!/usr/bin/env bash
# Compound Engineering environment health check.
# Reports optional tool capabilities and repo-local config safety in one pass.

set -o pipefail

# =====================================================
#  Optional capability config
# =====================================================
# Format: name|install_cmd|url|capability

deps=(
  "agent-browser|CI=true npm install -g agent-browser --no-audit --no-fund --loglevel=error && agent-browser install|https://github.com/vercel-labs/agent-browser|browser testing, dogfood QA, and visual polish inspection"
  "gh|NONINTERACTIVE=1 HOMEBREW_NO_AUTO_UPDATE=1 brew install -q gh|https://cli.github.com|GitHub PR, issue, and review workflows"
  "jq|NONINTERACTIVE=1 HOMEBREW_NO_AUTO_UPDATE=1 brew install -q jq|https://jqlang.github.io/jq/|JSON inspection in shell-based workflows"
  "ast-grep|NONINTERACTIVE=1 HOMEBREW_NO_AUTO_UPDATE=1 brew install -q ast-grep|https://ast-grep.github.io|syntax-aware structural code search"
  "ffmpeg|NONINTERACTIVE=1 HOMEBREW_NO_AUTO_UPDATE=1 brew install -q ffmpeg|https://ffmpeg.org/download.html|media chunking and screenshot extraction for Riffrec analysis"
)

# =====================================================
#  Args
# =====================================================

plugin_version=""
while [ $# -gt 0 ]; do
  case "$1" in
    --version) [ -n "$2" ] && plugin_version="$2" && shift 2 || shift ;;
    *) shift ;;
  esac
done

# =====================================================
#  Helpers
# =====================================================

ok()      { echo "  🟢  $1"; }
warn()    { echo "  🟡  $1"; }
skip()    { echo "  ➖  $1"; }
detail()  { echo "       $1"; }
section() { echo ""; echo " $1"; }

has_brew=$(command -v brew >/dev/null 2>&1 && echo "yes" || echo "no")
in_repo=$(git rev-parse --is-inside-work-tree >/dev/null 2>&1 && echo "yes" || echo "no")

# =====================================================
#  Check optional capabilities
# =====================================================

capability_ok=0
capability_total=0
capability_missing=0
results=()

for entry in "${deps[@]}"; do
  IFS='|' read -r name install_cmd url capability <<< "$entry"
  capability_total=$((capability_total + 1))
  if command -v "$name" >/dev/null 2>&1; then
    capability_ok=$((capability_ok + 1))
    results+=("$name|ok|$install_cmd|$url|$capability")
  else
    capability_missing=$((capability_missing + 1))
    results+=("$name|missing|$install_cmd|$url|$capability")
  fi
done

# =====================================================
#  Project checks (repo only)
# =====================================================

legacy_cfg="skip"
repo_cfg_gitignore="skip"
local_cfg="skip"
example_cfg="skip"
project_issues=0

if [ "$in_repo" = "yes" ]; then
  repo_root=$(git rev-parse --show-toplevel 2>/dev/null)
  legacy_cfg="missing"
  [ -f "$repo_root/compound-engineering.local.md" ] && legacy_cfg="present"

  local_cfg="missing"
  if [ -e "$repo_root/.compound-engineering/config.local.yaml" ]; then
    local_cfg="present"
    if git check-ignore -q "$repo_root/.compound-engineering/config.local.yaml" 2>/dev/null; then
      repo_cfg_gitignore="ok"
    else
      repo_cfg_gitignore="missing"
    fi
  fi

  script_dir="$(cd "$(dirname "$0")" && pwd)"
  template="$script_dir/../references/config-template.yaml"
  example="$repo_root/.compound-engineering/config.local.example.yaml"
  if [ ! -f "$example" ]; then
    example_cfg="missing"
  elif [ -f "$template" ] && ! diff -q "$template" "$example" >/dev/null 2>&1; then
    example_cfg="outdated"
  else
    example_cfg="ok"
  fi
fi

# =====================================================
#  Output
# =====================================================

echo ""
if [ -n "$plugin_version" ]; then
  ok "Plugin version v${plugin_version}"
fi

section "Optional capabilities  ${capability_ok}/${capability_total}"

for result in "${results[@]}"; do
  IFS='|' read -r name status install_cmd url capability <<< "$result"
  if [ "$status" = "ok" ]; then
    ok "$name -- $capability"
  else
    warn "$name -- unavailable: $capability"
    if [[ "$install_cmd" == *"brew install"* ]] && [ "$has_brew" != "yes" ]; then
      detail "$url"
    else
      detail "$install_cmd"
      detail "$url"
    fi
  fi
done

if [ "$in_repo" = "yes" ]; then
  section "Project config"

  if [ "$legacy_cfg" = "present" ]; then
    warn "Obsolete compound-engineering.local.md exists"
    project_issues=$((project_issues + 1))
  else
    ok "No obsolete compound-engineering.local.md"
  fi

  if [ "$local_cfg" = "present" ]; then
    ok ".compound-engineering/config.local.yaml exists"
    if [ "$repo_cfg_gitignore" = "ok" ]; then
      ok "Local config is gitignored"
    else
      warn "Local config is not safely gitignored"
      project_issues=$((project_issues + 1))
    fi
  else
    skip "No local config yet (.compound-engineering/config.local.yaml)"
  fi

  if [ "$example_cfg" = "ok" ]; then
    ok "Example config is current"
  elif [ "$example_cfg" = "missing" ]; then
    warn "Example config missing (.compound-engineering/config.local.example.yaml)"
    project_issues=$((project_issues + 1))
  elif [ "$example_cfg" = "outdated" ]; then
    warn "Example config outdated (new settings available)"
    project_issues=$((project_issues + 1))
  fi
else
  section "Project config"
  skip "Not inside a git repository"
fi

echo ""
if [ "$project_issues" -eq 0 ]; then
  echo " ✅  Project config healthy. Optional capabilities available: ${capability_ok}/${capability_total}"
else
  echo " ⚠️   ${project_issues} project issue(s) found. Optional capabilities available: ${capability_ok}/${capability_total}"
fi

if [ "$capability_missing" -gt 0 ]; then
  echo "     Missing optional tools do not block setup; install them only for the workflows you use."
fi

echo ""
