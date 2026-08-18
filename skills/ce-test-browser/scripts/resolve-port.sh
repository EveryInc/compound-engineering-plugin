#!/usr/bin/env bash
# Resolve the dev-server port for ce-test-browser and print it alone on stdout, so a
# caller can capture it with $(...) instead of transcribing it out of prose.
#
# Usage: resolve-port.sh [--free] [EXPLICIT_PORT]
#   --free         after resolving, scan upward to the first port with no listener
#   EXPLICIT_PORT  a port the caller already knows (the user's --port, or an in-context
#                  project instruction that states the dev-server port)
#
# Resolution order: EXPLICIT_PORT, a --port flag in package.json, PORT= in .env /
# .env.local / .env.development, then 3000.
set -u

free=0
explicit=""
for arg in "$@"; do
  case "$arg" in
    --free) free=1 ;;
    "") ;;
    *[!0-9]*) ;;
    *) explicit="$arg" ;;
  esac
done

port="$explicit"
if [ -z "$port" ]; then
  port=$(grep -Eo -- '--port[= ]+[0-9]{2,5}' package.json 2>/dev/null | grep -Eo '[0-9]{2,5}' | head -1)
fi
if [ -z "$port" ]; then
  # take the first digit run after PORT=, so quotes and a trailing "# comment" drop out
  port=$(grep -h '^PORT=' .env .env.local .env.development 2>/dev/null | tail -1 | grep -Eo '[0-9]+' | head -1)
fi
port="${port:-3000}"

if [ "$free" = 1 ]; then
  while lsof -i ":$port" -sTCP:LISTEN -t >/dev/null 2>&1; do
    port=$((port + 1))
  done
fi

echo "$port"
