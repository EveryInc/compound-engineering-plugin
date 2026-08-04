#!/usr/bin/env bash
# Discover session files across Claude Code, Codex, Cursor, Pi, and oh-my-pi (omp).
#
# Usage: discover-sessions.sh <repo-name> <days> [--cwd /abs/repo/root] [--platform claude|codex|cursor|pi|omp]
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

REPO_NAME="${1:?Usage: discover-sessions.sh <repo-name> <days> [--cwd /abs/repo/root] [--platform claude|codex|cursor|pi|omp]}"
DAYS="${2:?Usage: discover-sessions.sh <repo-name> <days> [--cwd /abs/repo/root] [--platform claude|codex|cursor|pi|omp]}"
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
discover_codex() {
    for base in "$HOME/.codex/sessions" "$HOME/.agents/sessions"; do
        [ -d "$base" ] || continue

        # Use mtime-based discovery (consistent with Claude/Cursor) so that
        # sessions started before the scan window but still active within it
        # are not missed.
        find "$base" -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
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

# --- oh-my-pi (omp) ---
discover_omp() {
    local config_dir="${PI_CONFIG_DIR:-.omp}"

    # omp's explicit session-dir override stores session files directly in the
    # supplied directory (flat), mirroring Pi's override branch. The cwd filter
    # later reads each header and keeps only sessions for the active repo.
    if [ -n "${PI_CODING_AGENT_SESSION_DIR:-}" ]; then
        local base="$PI_CODING_AGENT_SESSION_DIR"
        [ -d "$base" ] || return 0
        find "$base" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
        if [ -z "$REPO_CWD" ]; then
            for dir in "$base"/*"$REPO_NAME"*/; do
                [ -d "$dir" ] || continue
                find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
            done
        fi
        return 0
    fi

    # omp bucket names embed only the repo basename plus a sha256 of the
    # canonical cwd (e.g. home-my-repo-<64hex>), never the full cwd, so no
    # exact encoded-CWD probe like Pi's is possible. Scan basename-matching
    # buckets in the default-profile sessions root and in every named-profile
    # root; exact repo attribution comes from the downstream header `cwd`
    # filter (extract-metadata.py --cwd-filter reads the type:"session"
    # header).
    local agent_dir="${PI_CODING_AGENT_DIR:-$HOME/$config_dir/agent}"
    local root
    for root in "$agent_dir/sessions" "$HOME/$config_dir"/profiles/*/agent/sessions; do
        [ -d "$root" ] || continue
        for dir in "$root"/*"$REPO_NAME"*/; do
            [ -d "$dir" ] || continue
            find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
        done
    done
}

# --- Dispatch ---
case "$PLATFORM" in
    claude)  discover_claude ;;
    codex)   discover_codex ;;
    cursor)  discover_cursor ;;
    pi)      discover_pi ;;
    omp)     discover_omp ;;
    all)
        discover_claude
        discover_codex
        discover_cursor
        discover_pi
        discover_omp
        ;;
    *)
        echo "Unknown platform: $PLATFORM" >&2
        exit 1
        ;;
esac
