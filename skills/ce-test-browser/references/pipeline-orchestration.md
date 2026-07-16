# Pipeline-Mode Server Orchestration

Read and follow this file only when invoked with `mode:pipeline` (LFG or another automated runner). It overrides visibility prompts, free-port selection, and dev-server startup. It does not change browser-driver selection. In pipeline mode you run unattended — never block on a question.

## 1. No visibility question

Unattended execution does not mean hidden execution. Do not ask a visibility question:

- When a host-native integrated browser is selected, keep its normal integrated surface visible and non-blocking so the user can watch progress without interrupting the run. Do not repeatedly steal focus.
- When the fallback `agent-browser` driver is selected, run it headless without passing `--headed`.

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
SKILL_DIR="<absolute path of the directory containing the ce-test-browser SKILL.md>"
SERVER_RUN_DIR=$(python3 "$SKILL_DIR/scripts/scratch-root.py" run-dir --skill ce-test-browser --run-id pipeline-server);
SERVER_LOG="$SERVER_RUN_DIR/dev-server-${PORT}.log";
if [ -f "bin/dev" ]; then
  SERVER_COMMAND=(env "PORT=$PORT" bin/dev);
elif [ -f "bin/rails" ]; then
  SERVER_COMMAND=(bin/rails server -p "$PORT");
elif [ -f "package.json" ]; then
  SERVER_COMMAND=(env "PORT=$PORT" npm run dev);
else
  echo "No supported dev-server command found" >&2;
  python3 "$SKILL_DIR/scripts/scratch-root.py" remove-run-dir --skill ce-test-browser "$SERVER_RUN_DIR";
  exit 64;
fi;

echo "Starting detached dev server on port ${PORT}...";
if ! START_JSON=$(python3 "$SKILL_DIR/scripts/dev-server-supervisor.py" start --run-dir "$SERVER_RUN_DIR" --log-file "$SERVER_LOG" -- "${SERVER_COMMAND[@]}"); then
  echo "Detached server supervisor failed to start. Last output:" >&2;
  tail -20 "$SERVER_LOG" 2>/dev/null || true;
  if [ -d "$SERVER_RUN_DIR" ]; then
    echo "Startup rollback could not prove process-tree extinction; helper retained the owner-private lease for recovery: $SERVER_RUN_DIR" >&2;
  else
    echo "The helper verified rollback before removing the exact run." >&2;
  fi;
  exit 1;
fi;
SERVER_TOKEN=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["token"])' "$START_JSON");
SERVER_SUPERVISOR_PID=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["supervisor_pid"])' "$START_JSON");

# Wait up to 30s for the supervised server.
for i in $(seq 1 30); do
  lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1 && break
  sleep 1
done
if ! lsof -i ":${PORT}" -sTCP:LISTEN -t >/dev/null 2>&1; then
  echo "Server did not start in 30s. Last output:"
  tail -20 "$SERVER_LOG" 2>/dev/null
  if ! python3 "$SKILL_DIR/scripts/dev-server-supervisor.py" stop --run-dir "$SERVER_RUN_DIR" --token "$SERVER_TOKEN"; then
    echo "Server startup timed out and verified teardown failed; retained: $SERVER_RUN_DIR" >&2;
    exit 1;
  fi;
  exit 1
fi
python3 "$SKILL_DIR/scripts/dev-server-supervisor.py" status --run-dir "$SERVER_RUN_DIR" --token "$SERVER_TOKEN";
printf 'Pipeline server handoff: PORT=%s SERVER_SUPERVISOR_PID=%s SERVER_RUN_DIR=%s SERVER_TOKEN=%s\n' "$PORT" "$SERVER_SUPERVISOR_PID" "$SERVER_RUN_DIR" "$SERVER_TOKEN";
```

The helper double-forks into a detached session before this startup shell returns. It launches the server in a separate process group, writes an owner-private lease with supervisor and worker birth identities, and gives the server tree an unguessable cleanup token. After the fork, only the helper may remove the run: on failed or timed-out acknowledgment, `start` uses its in-scope token and any published birth identities to terminate the detached tree, proves extinction, and only then removes the exact run. If that proof fails, it retains the directory and lease for recovery. The caller must never delete that run directly. The scan may land on a different port than the preferred one, and shell variables do not survive into later calls. Preserve all four literal values from the `Pipeline server handoff` line: the port, supervisor PID (for observability only), exact opaque run directory, and cleanup token. Use the literal port in every subsequent selected-driver navigation — do not rely on `${PORT}` carrying over. Then return to the "Test Each Affected Page" step, navigate to `http://localhost:<N>`, inspect the rendered state, and test each route.

## 3. Stop the server and clean its exact run

After the final browser check, ask the lifecycle helper to stop the captured server tree. It requires the unguessable token and verifies PID birth identities before signaling anything, so a stale reused PID cannot kill an unrelated process. It sends TERM and then KILL to the verified process group and any token-bearing descendants, proves the tree and detached supervisor are gone, and only then removes the exact resolver-created run. Substitute the two literal capability values; do not reconstruct a path, signal a PID directly, or delete the directory directly.

```bash
SKILL_DIR="<absolute path of the directory containing the ce-test-browser SKILL.md>";
SERVER_RUN_DIR='<literal-server-run-dir>';
SERVER_TOKEN='<literal-server-token>';
python3 "$SKILL_DIR/scripts/dev-server-supervisor.py" stop --run-dir "$SERVER_RUN_DIR" --token "$SERVER_TOKEN";
```

The pipeline run is not complete until the helper reports `"removed": true`, which means the identity-matching supervisor and every verified server descendant are gone and the exact run directory no longer exists. If testing aborts early, perform this same teardown before returning control to the caller. If identity or tree extinction cannot be proved, the helper fails closed and retains the run for recovery.
