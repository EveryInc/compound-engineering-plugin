#!/bin/sh
# PATH-shadowing `npx` for worker tests: replays a canned acpx stream instead of
# fetching acpx. Bash 3.2 / POSIX sh safe.
#   ACP_STUB_NPX_STREAM    stream base path, e.g. tests/fixtures/acpx-streams/end-turn;
#                          prints <base>.stdout and <base>.stderr when present and
#                          exits with the code in <base>.exit (default 0)
#   ACP_STUB_NPX_ARGV_LOG  if set, receives one argv entry per line
#   ACP_STUB_NPX_ENV_LOG   if set, receives the npm_config_* settings acpx runs under
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
  } > "$ACP_STUB_NPX_ENV_LOG"
fi
base="${ACP_STUB_NPX_STREAM:?ACP_STUB_NPX_STREAM must name a canned acpx stream}"
[ -f "$base.stdout" ] && cat "$base.stdout"
[ -f "$base.stderr" ] && cat "$base.stderr" >&2
code=0
[ -f "$base.exit" ] && code=$(cat "$base.exit")
exit "$code"
