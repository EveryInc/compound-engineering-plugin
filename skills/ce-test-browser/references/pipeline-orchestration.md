# Pipeline-Mode Server Orchestration

Read and follow this file only when invoked with `mode:pipeline` (LFG or another automated runner). It overrides three things in the main workflow: the headed/headless question, free-port selection, and dev-server startup. In pipeline mode you run unattended — never block on a question.

## 1. No headed/headless question

Default to headless. Do not ask. Skip the "Choose Headed or Headless" step entirely and never pass `--headed`.

## 2. Claim a free port and start the server

Multiple agents may run on the same machine, so never assume the preferred port is free: scan upward to the first free port, then start the server there in the background.

Run the whole thing as **one** command. Shell variables do not survive between separate Bash calls, so the free-port scan and the startup must share a single block, and that block must seed `PORT` itself — the `$PORT` computed in step 4 is gone by the time this runs. Set `PORT` on the first line to the preferred port step 4 printed ("Preferred dev server port: N"); it defaults to `3000` only if step 4 found nothing.

```bash
PORT=3000   # replace 3000 with the preferred port from step 4

# scan upward to the first free port
find_free_port() {
  local p=$1
  while lsof -i ":$p" -sTCP:LISTEN -t >/dev/null 2>&1; do
    p=$((p + 1))
  done
  echo "$p"
}
PORT=$(find_free_port "$PORT")
echo "Using dev server port: $PORT"

# start in the background (the scan guarantees this port is free), then wait up to 30s
echo "Starting dev server on port ${PORT}..."
if [ -f "bin/dev" ]; then
  PORT=${PORT} bin/dev > /tmp/dev-server-${PORT}.log 2>&1 &
elif [ -f "bin/rails" ]; then
  bin/rails server -p ${PORT} > /tmp/dev-server-${PORT}.log 2>&1 &
elif [ -f "package.json" ]; then
  PORT=${PORT} npm run dev > /tmp/dev-server-${PORT}.log 2>&1 &
fi
for i in $(seq 1 30); do
  lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 && break
  sleep 1
done
if ! lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Server did not start in 30s. Last output:"
  tail -20 /tmp/dev-server-${PORT}.log 2>/dev/null
  exit 1
fi
```

The scan may land on a different port than the preferred one, and `$PORT` does not survive into later Bash calls. Note the number this block echoes ("Using dev server port: N") and substitute that literal port into every subsequent `agent-browser` command — do not rely on `${PORT}` carrying over into the main workflow's snippets. Then return to the "Test Each Affected Page" step (open `http://localhost:<N>`, snapshot, then test each route).
