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
#   --cwd      Absolute repo root. Used for exact Pi encoded-CWD discovery
#              and the omp raw-bucket probe. Claude listing is unfiltered;
#              extract-metadata.py --cwd-filter matches recorded cwd.
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
# List every recent jsonl under <config-dir>/projects. Folder names are an
# undocumented encoder of session CWD; do not invert them. Repo attribution
# is the recorded `cwd` field, applied by extract-metadata.py --cwd-filter.
# CLAUDE_CONFIG_DIR relocates the whole config tree (official); unset -> ~/.claude.
discover_claude() {
    local base="${CLAUDE_CONFIG_DIR:-$HOME/.claude}/projects"
    [ -d "$base" ] || return 0
    find "$base" -mindepth 2 -maxdepth 2 -type f -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
}

# --- Codex ---
discover_codex() {
    local codex_home="${CODEX_HOME:-$HOME/.codex}"
    for base in "$codex_home/sessions" "$HOME/.agents/sessions"; do
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
# Encode omp's raw bucket name for a cwd: home-relative "-<rel>",
# tmp-relative "-tmp-<rel>", and otherwise "--<abs>--", with path separators
# and ":" encoded as "-" (session-paths.ts getDefaultSessionDirName /
# encodeLegacyAbsoluteSessionDirName). This raw scheme predates the hashed
# scheme and is current again since omp 17.2.9 (#7646 restored it and removed
# automatic migration), so buckets in the wild use both shapes. Canonicalize
# with physical paths so symlinked cwds resolve to the same bucket, mirroring
# omp's resolveEquivalentPath. Prints nothing when the cwd cannot be resolved.
encode_omp_raw_cwd() {
    local cwd canon_home canon_tmp rel
    cwd="$(cd "$1" 2>/dev/null && pwd -P)" || return 0
    canon_home="$(cd "$HOME" 2>/dev/null && pwd -P)" || canon_home="$HOME"
    case "$cwd" in
        "$canon_home")
            printf -- '-'
            ;;
        "$canon_home"/*)
            rel="$(printf '%s' "${cwd#"$canon_home"/}" | sed 's/[/\\:]/-/g')"
            printf -- '-%s' "$rel"
            ;;
        *)
            canon_tmp="$(cd "${TMPDIR:-/tmp}" 2>/dev/null && pwd -P)" || canon_tmp=""
            case "$cwd" in
                "$canon_tmp")
                    printf -- '-tmp'
                    ;;
                "$canon_tmp"/*)
                    rel="$(printf '%s' "${cwd#"$canon_tmp"/}" | sed 's/[/\\:]/-/g')"
                    printf -- '-tmp-%s' "$rel"
                    ;;
                *)
                    rel="$(printf '%s' "${cwd#/}" | sed 's/[/\\:]/-/g')"
                    printf -- '--%s--' "$rel"
                    ;;
            esac
            ;;
    esac
}

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

    # omp has two bucket-naming schemes in the wild, and both keep the raw
    # repo basename (spaces and all) inside the bucket name:
    #   - raw: "-<home-rel>", "-tmp-<tmp-rel>", "--<abs>--" (legacy relative to
    #     the hashed scheme; restored as current in omp 17.2.9, #7646)
    #   - hashed: "<scope>-<sanitized-basename>-<sha256-of-canonical-cwd>"
    #     (intermediate releases; basename runs of [^a-zA-Z0-9._-] collapse to
    #     "-", edge dashes stripped, capped at the last 80 chars, empty falls
    #     back to "project" — session-paths.ts getDefaultSessionDirName)
    # Scan basename-matching buckets in the default-profile sessions root and
    # in every named-profile root; exact repo attribution comes from the
    # downstream header `cwd` filter (extract-metadata.py --cwd-filter reads
    # the type:"session" header). Glob the sanitized form so repos whose
    # basename contains characters the hashed scheme normalizes (e.g. spaces)
    # still match, and glob the raw form so raw-scheme buckets whose basename
    # sanitizes differently (e.g. "my repo" in "--Users-test-Code-my repo--")
    # are found too. When --cwd is supplied, also probe the exact raw bucket
    # name: it catches buckets the basename globs miss when the bucket's path
    # segments no longer resemble the repo name as typed.
    local sanitized
    sanitized="$(printf '%s' "$REPO_NAME" | sed -E 's/[^a-zA-Z0-9._-]+/-/g; s/^-+//; s/-+$//' | tail -c 80)"
    [ -n "$sanitized" ] || sanitized="project"
    local agent_dir="${PI_CODING_AGENT_DIR:-$HOME/$config_dir/agent}"
    # omp getSessionsDir() flattens the agent/ prefix under XDG: ~/.omp/agent/sessions
    # becomes $XDG_DATA_HOME/omp/sessions (and $XDG_DATA_HOME/omp/profiles/<name>/sessions).
    # Only linux/darwin, only when XDG_DATA_HOME is set and the omp app root exists,
    # and only when PI_CODING_AGENT_DIR did not already take over the agent root.
    local xdg_omp=""
    if [ -z "${PI_CODING_AGENT_DIR:-}" ] && [ -n "${XDG_DATA_HOME:-}" ]; then
        case "$(uname -s)" in
            Linux|Darwin)
                if [ -d "${XDG_DATA_HOME%/}/omp" ]; then
                    xdg_omp="${XDG_DATA_HOME%/}/omp"
                fi
                ;;
        esac
    fi
    {
        local root dir encoded
        if [ -n "$REPO_CWD" ]; then
            encoded="$(encode_omp_raw_cwd "$REPO_CWD")"
            if [ -n "$encoded" ]; then
                for root in "$agent_dir/sessions" \
                            "$HOME/$config_dir"/profiles/*/agent/sessions \
                            ${xdg_omp:+"$xdg_omp/sessions"} \
                            ${xdg_omp:+"$xdg_omp"/profiles/*/sessions}; do
                    [ -d "$root/$encoded" ] || continue
                    find "$root/$encoded" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
                done
            fi
        fi
        for root in "$agent_dir/sessions" \
                    "$HOME/$config_dir"/profiles/*/agent/sessions \
                    ${xdg_omp:+"$xdg_omp/sessions"} \
                    ${xdg_omp:+"$xdg_omp"/profiles/*/sessions}; do
            [ -d "$root" ] || continue
            for dir in "$root"/*"$sanitized"*/; do
                [ -d "$dir" ] || continue
                find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
            done
            if [ "$REPO_NAME" != "$sanitized" ]; then
                for dir in "$root"/*"$REPO_NAME"*/; do
                    [ -d "$dir" ] || continue
                    find "$dir" -maxdepth 1 -name "*.jsonl" -mtime "-${DAYS}" 2>/dev/null
                done
            fi
        done
    # The probe and the globs can hit the same bucket; emit each path once.
    } | awk '!seen[$0]++'
}

# --- Dispatch ---
case "$PLATFORM" in
    claude)  discover_claude ;;
    codex)   discover_codex ;;
    cursor)  discover_cursor ;;
    pi)      discover_pi ;;
    omp)     discover_omp ;;
    all)
        # Pi and omp share the PI_CODING_AGENT_SESSION_DIR override: when it
        # is set, both discover functions emit the same flat-dir files, and
        # the downstream xargs call does not deduplicate. Emit each path once;
        # platform attribution is unaffected because extract-metadata.py
        # detects the file shape (title slot => omp, otherwise pi).
        { discover_claude; discover_codex; discover_cursor; discover_pi; discover_omp; } | awk '!seen[$0]++'
        ;;
    *)
        echo "Unknown platform: $PLATFORM" >&2
        exit 1
        ;;
esac
