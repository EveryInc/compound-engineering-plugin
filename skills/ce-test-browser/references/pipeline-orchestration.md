# Pipeline-Mode Server Orchestration

Follow this file when invoked with `mode:pipeline`. It overrides free-port selection and dev-server startup, and it removes every question. It does not change browser-driver selection.

## Unattended does not mean hidden

Keep a selected host-native integrated browser's normal surface visible and non-blocking so the user can watch progress without interrupting the run; do not repeatedly steal focus. The `agent-browser` fallback runs headless.

## Claim a free port and start the server

Multiple agents may run on the same machine, so never assume the preferred port is free: scan upward from the preferred port to the first free one, then start the dev server there in the background (`bin/dev`, `bin/rails server -p`, or `npm run dev`), logging to a temp file and polling up to ~30s for it to listen. If it never listens, report the last log output, record every planned route as `Skip` with reason `dev server did not start`, report the overall result as `PARTIAL`, and continue with the run's next stage — an unstartable dev server is a skipped step, not a stopped run.

Shell variables do not survive between separate Bash calls, so the scan and the startup must be one command that seeds the preferred port itself. Note the port the scan settled on and use that literal number in every later navigation — do not rely on `${PORT}` carrying over.

Then return to the "Test Each Affected Page" step, navigate to `http://localhost:<that-port>`, and work through the route list to the end: log flows you cannot drive as Skip and log failures with evidence, without pausing.
