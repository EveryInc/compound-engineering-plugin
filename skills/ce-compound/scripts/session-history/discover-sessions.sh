#!/usr/bin/env bash
# Discover session files across Claude Code, Codex, Cursor, and Pi.
#
# Usage: discover-sessions.sh <repo-name> <days> [--cwd /abs/repo/root] [--platform claude|codex|cursor|pi]
#
# Outputs one file path per line. Safe in both bash and zsh (all globs guarded).
# Pass output to extract-metadata.py:
#   python3 extract-metadata.py --cwd-filter <repo-name> $(bash discover-sessions.sh <repo-name> 7)
#
# Arguments:
#   repo-name  Folder name of the repo (e.g., "my-repo"). Used for directory matching.
#   days       Scan window in days (e.g., 7). Files older than this are skipped.
#   --cwd      Absolute repo root. Used for exact Pi encoded-CWD discovery.
#   --platform Restrict to a single platform. Omit to search all.

set -euo pipefail

REPO_NAME="${1:?Usage: discover-sessions.sh <repo-name> <days> [--cwd /abs/repo/root] [--platform claude|codex|cursor|pi]}"
DAYS="${2:?Usage: discover-sessions.sh <repo-name> <days> [--cwd /abs/repo/root] [--platform claude|codex|cursor|pi]}"
PLATFORM="all"
REPO_CWD=""

# Parse optional --platform flag
shift 2
while [ $# -gt 0 ]; do
    case "$1" in
        --cwd) REPO_CWD="$2"; shift 2 ;;
        --platform) PLATFORM="$2"; shift 2 ;;
        *) shift ;;
    esac
done

encode_pi_cwd() {
    local cwd="${1%/}"
    local encoded="${cwd//\//-}"
    encoded="${encoded#-}"
    printf -- "--%s--" "$encoded"
}

# --- Claude Code ---
discover_claude() {
    local base="$HOME/.claude/projects"
    [ -d "$base" ] || return 0

    # Find all project dirs matching repo name
    for dir in "$base"/*"$REPO_NAME"*/; do
        [ -d "$dir" ] || continue
        find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
    done
}

# --- Codex ---
# Codex session roots, one per line, highest priority first. Codex is the one
# supported harness whose home is commonly relocated at launch (managed
# runtimes set CODEX_HOME), so conventional home directories alone miss those
# sessions. Callers that already resolved runtime roots pass them through
# CE_CODEX_SESSION_ROOTS (colon-separated) instead of teaching this script
# about their runtime.
codex_session_roots() {
    if [ -n "${CE_CODEX_SESSION_ROOTS:-}" ]; then
        printf '%s\n' "$CE_CODEX_SESSION_ROOTS" | tr ':' '\n'
    fi
    if [ -n "${CODEX_HOME:-}" ]; then
        printf '%s\n' "${CODEX_HOME%/}/sessions"
    fi
    printf '%s\n' "$HOME/.codex/sessions" "$HOME/.agents/sessions"
    # Orca-managed runtime home. Orca exposes no CLI surface for adapter
    # session roots, so its documented macOS location is probed directly;
    # the directory simply does not exist on other setups.
    printf '%s\n' "$HOME/Library/Application Support/Orca/codex-runtime-home/home/sessions"
}

discover_codex() {
    # Several configured roots can name the same physical directory (symlink,
    # CODEX_HOME pointing at ~/.codex, explicit extra root). Deduplicate on
    # device:inode so one session file yields one candidate. Plain string
    # accumulation keeps this bash-3.2 compatible (no associative arrays).
    local seen_keys=""
    local base key
    while IFS= read -r base; do
        [ -n "$base" ] || continue
        [ -d "$base" ] || continue
        key=$(stat -f '%d:%i' "$base" 2>/dev/null || stat -c '%d:%i' "$base" 2>/dev/null) || continue
        case " $seen_keys " in *" $key "*) continue ;; esac
        seen_keys="$seen_keys $key"

        # Use mtime-based discovery (consistent with Claude/Cursor) so that
        # sessions started before the scan window but still active within it
        # are not missed.
        find "$base" -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
    done <<EOF
$(codex_session_roots)
EOF
}

# --- Cursor ---
discover_cursor() {
    local base="$HOME/.cursor/projects"
    [ -d "$base" ] || return 0

    for dir in "$base"/*"$REPO_NAME"*/; do
        [ -d "$dir" ] || continue
        local transcripts="$dir/agent-transcripts"
        [ -d "$transcripts" ] || continue
        find "$transcripts" -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
    done
}

# --- Pi ---
discover_pi() {
    local agent_dir="${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}"
    local base="${PI_CODING_AGENT_SESSION_DIR:-$agent_dir/sessions}"
    [ -d "$base" ] || return 0

    # Pi's explicit session-dir override stores session files directly in the
    # supplied directory. The cwd filter later reads each header and keeps only
    # sessions for the active repo.
    if [ -n "${PI_CODING_AGENT_SESSION_DIR:-}" ]; then
        find "$base" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
        if [ -z "$REPO_CWD" ]; then
            for dir in "$base"/*"$REPO_NAME"*/; do
                [ -d "$dir" ] || continue
                find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
            done
        fi
        return 0
    fi

    # Pi stores sessions under --<absolute-cwd-with-slashes-as-hyphens>--.
    # When the caller supplies an exact repo root, probe only that encoded
    # directory so sibling repos like my-repo-old never enter the pipeline.
    if [ -n "$REPO_CWD" ]; then
        local dir="$base/$(encode_pi_cwd "$REPO_CWD")"
        [ -d "$dir" ] || return 0
        find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
        return 0
    fi

    # Fallback for direct script use without --cwd.
    for dir in "$base"/*"$REPO_NAME"*/; do
        [ -d "$dir" ] || continue
        find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
    done
}

# --- Dispatch ---
case "$PLATFORM" in
    claude)  discover_claude ;;
    codex)   discover_codex ;;
    cursor)  discover_cursor ;;
    pi)      discover_pi ;;
    all)
        discover_claude
        discover_codex
        discover_cursor
        discover_pi
        ;;
    *)
        echo "Unknown platform: $PLATFORM" >&2
        exit 1
        ;;
esac
