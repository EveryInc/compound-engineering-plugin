#!/usr/bin/env bash
# Discover session files across Claude Code, Codex, and Cursor.
#
# Usage: discover-sessions.sh <repo-name> <days> [--platform claude|codex|cursor]
#
# Outputs one file path per line. Safe in both bash and zsh (all globs guarded).
# Pass output to extract-metadata.py:
#   python3 extract-metadata.py --cwd-filter <repo-name> $(bash discover-sessions.sh <repo-name> 7)
#
# Arguments:
#   repo-name  Folder name of the repo (e.g., "my-repo"). Used for directory matching.
#   days       Scan window in days (e.g., 7). Files older than this are skipped.
#   --platform Restrict to a single platform. Omit to search all.

set -euo pipefail

REPO_NAME="${1:?Usage: discover-sessions.sh <repo-name> <days> [--platform claude|codex|cursor]}"
DAYS="${2:?Usage: discover-sessions.sh <repo-name> <days> [--platform claude|codex|cursor]}"
PLATFORM="${4:-all}"

# Parse optional --platform flag
shift 2
while [ $# -gt 0 ]; do
    case "$1" in
        --platform) PLATFORM="$2"; shift 2 ;;
        *) shift ;;
    esac
done

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
discover_codex() {
    local found_any=false
    for base in "$HOME/.codex/sessions" "$HOME/.agents/sessions"; do
        [ -d "$base" ] || continue

        # Compute date directories within the scan window
        local i=0
        while [ "$i" -lt "$DAYS" ]; do
            local date_dir
            # macOS date vs GNU date
            if date -v-${i}d +%Y/%m/%d >/dev/null 2>&1; then
                date_dir=$(date -v-${i}d +%Y/%m/%d)
            else
                date_dir=$(date -d "$i days ago" +%Y/%m/%d 2>/dev/null || true)
            fi

            if [ -n "$date_dir" ] && [ -d "$base/$date_dir" ]; then
                find "$base/$date_dir" -name "*.jsonl" 2>/dev/null
                found_any=true
            fi
            i=$((i + 1))
        done
    done
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

# --- Dispatch ---
case "$PLATFORM" in
    claude)  discover_claude ;;
    codex)   discover_codex ;;
    cursor)  discover_cursor ;;
    all)
        discover_claude
        discover_codex
        discover_cursor
        ;;
    *)
        echo "Unknown platform: $PLATFORM" >&2
        exit 1
        ;;
esac
