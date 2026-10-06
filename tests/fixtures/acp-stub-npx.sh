#!/bin/sh
# PATH-shadowing `npx` for worker tests: replays a canned acpx stream instead of
# fetching acpx. Bash 3.2 / POSIX sh safe.
#   ACP_STUB_NPX_STREAM    stream base path, e.g. tests/fixtures/acpx-streams/end-turn;
#                          prints <base>.stdout and <base>.stderr when present, sleeps
#                          for the seconds in <base>.sleep when present, and exits
#                          with the code in <base>.exit (default 0)
#   ACP_STUB_NPX_ARGV_LOG  if set, receives one argv entry per line
#   ACP_STUB_NPX_ENV_LOG   if set, receives the npm_config_* settings acpx runs under,
#                          the adapter launch variables, and the contents of the
#                          CLAUDE_CODE_EXECUTABLE file when it is one
#   ACP_STUB_NPX_CALLS     if set, a counter file incremented per invocation; the Nth
#                          call replays <base>.<N>.* instead of <base>.* when any exist
#   ACP_STUB_NPX_PROMPT_LOG if set, receives a copy of the --file prompt (suffixed .<N>
#                          when ACP_STUB_NPX_CALLS is set)
#   ACP_STUB_NPX_PID_FILE  if set with <base>.sleep, receives this process's pid and
#                          the pid of its sleeping child, one per line
if [ -n "${ACP_STUB_NPX_ARGV_LOG:-}" ]; then
  : > "$ACP_STUB_NPX_ARGV_LOG"
  for arg in "$@"; do
    printf '%s\n' "$arg" >> "$ACP_STUB_NPX_ARGV_LOG"
  done
fi
if [ -n "${ACP_STUB_NPX_ENV_LOG:-}" ]; then
  {
    printf 'npm_config_prefer_offline=%s\n' "${npm_config_prefer_offline-<unset>}"
    printf 'npm_config_fetch_retries=%s\n' "${npm_config_fetch_retries-<unset>}"
    printf 'CODEX_PATH=%s\n' "${CODEX_PATH-<unset>}"
    printf 'CLAUDE_CODE_EXECUTABLE=%s\n' "${CLAUDE_CODE_EXECUTABLE-<unset>}"
    printf 'OPENCODE_DISABLE_PROJECT_CONFIG=%s\n' "${OPENCODE_DISABLE_PROJECT_CONFIG-<unset>}"
    printf 'OPENCODE_CONFIG_CONTENT=%s\n' "${OPENCODE_CONFIG_CONTENT-<unset>}"
    if [ -n "${CLAUDE_CODE_EXECUTABLE:-}" ] && [ -f "$CLAUDE_CODE_EXECUTABLE" ]; then
      printf -- '--- CLAUDE_CODE_EXECUTABLE contents ---\n'
      cat "$CLAUDE_CODE_EXECUTABLE"
    fi
  } > "$ACP_STUB_NPX_ENV_LOG"
fi
base="${ACP_STUB_NPX_STREAM:?ACP_STUB_NPX_STREAM must name a canned acpx stream}"
n=""
if [ -n "${ACP_STUB_NPX_CALLS:-}" ]; then
  n=$(cat "$ACP_STUB_NPX_CALLS" 2>/dev/null || echo 0)
  n=$((n + 1))
  echo "$n" > "$ACP_STUB_NPX_CALLS"
  for ext in stdout stderr exit sleep; do
    if [ -f "$base.$n.$ext" ]; then base="$base.$n"; break; fi
  done
fi
if [ -n "${ACP_STUB_NPX_PROMPT_LOG:-}" ]; then
  prev=""
  for arg in "$@"; do
    [ "$prev" = "--file" ] && cp "$arg" "$ACP_STUB_NPX_PROMPT_LOG${n:+.$n}"
    prev="$arg"
  done
fi
[ -f "$base.stdout" ] && cat "$base.stdout"
[ -f "$base.stderr" ] && cat "$base.stderr" >&2
if [ -f "$base.sleep" ]; then
  sleep "$(cat "$base.sleep")" &
  [ -n "${ACP_STUB_NPX_PID_FILE:-}" ] && printf '%s\n%s\n' "$$" "$!" > "$ACP_STUB_NPX_PID_FILE"
  wait "$!"
fi
code=0
[ -f "$base.exit" ] && code=$(cat "$base.exit")
exit "$code"
