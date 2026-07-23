# Investigation Techniques

Techniques for deeper investigation when standard code tracing is not enough. Load this when a bug does not reproduce reliably, involves timing or concurrency, spans multiple systems, or vanishes under observation.

---

## Root-Cause Tracing

Trace backward from the symptom to where valid state first became invalid; the fix belongs at that origin, not where the error surfaced. In tests, instrument with `console.error()` — logger output is often suppressed — and log *before* the dangerous operation, not after it fails. For a regression, bisect. When the reproduction is large (a 500-line integration test, a huge payload), minimize it before investigating further: cut it in half, keep whichever half still fails, and recurse. The minimized trigger is usually the answer — "only fails when the string contains a tab" is a much louder signal than "fails in this 500-line test".

---

## Multi-Component Boundary Instrumentation

Root-cause tracing walks one call chain. When the failure crosses subsystems — CI → build → signing, API → service → database, frontend → API → background worker — instrument *every* boundary in a single run instead of walking one chain: log what enters and what exits each, with a tag identifying the boundary, then read the log linearly. The first boundary where "exits" stops matching the next "enters" is the failing layer.

Prefer this when the symptom is many components from the trigger, when the components are owned by different systems (CI vs app code), or when the "call stack" is conceptual rather than literal (message bus, HTTP, process boundaries). Backward tracing still applies within a layer once the failing layer is identified.

---

## Intermittent Bug Techniques

When a bug does not reproduce reliably after 2-3 attempts, vary one thing at a time (machine, data seed, serial vs parallel execution, network access, input shape) and capture the state that differs between passing and failing runs.

**Test-order pollution.** If an individual test passes in isolation but fails when the suite runs, tests are leaking state between each other:

- Run the failing test alone — if it passes, pollution is confirmed
- Run the failing test's file alone — narrows pollution to same-file or cross-file
- Run the suite with randomized test order (most runners support a seed flag) — a different failing-test neighbor each run implies global state mutation
- Bisect the preceding tests: run the failing test with just the first half of the earlier tests, then the second half, then narrow

Common culprits once isolated: module-level state, mocks not torn down, temp files not cleaned up, database rows not rolled back, environment variables mutated and not restored.

---

## Stepping Debugger vs Instrumentation

Print-debugging is the default reach, but a stepping debugger converges faster once the failing path is localized and reliably reproducible. So: instrument to localize, then attach a debugger at the localized point.

**Entry points by language:**

| Language | Interactive breakpoint | Attach to running process |
|----------|------------------------|---------------------------|
| Python | `breakpoint()` in code, or `python -m pdb script.py` | `python -m pdb -p <pid>` (Python 3.14+ only); on earlier versions, instrument the target with `rpdb` / `remote-pdb` and connect after it triggers |
| Node.js | `debugger;` in code + `node --inspect-brk`, then connect via Chrome DevTools or VS Code | `kill -SIGUSR1 <pid>` to enable the inspector on the running process (Linux/macOS), then connect Chrome DevTools or VS Code to the default port 9229 |
| Ruby | `binding.irb` (stdlib), `binding.pry` (pry gem), `debugger` (debug gem), `rdbg` | `rdbg --attach <pid>` with `debug` gem loaded |
| Go | `dlv debug` or `dlv test`, then `break`, `continue`, `print` | `dlv attach <pid>` |
| Rust / C / C++ | `lldb target/debug/binary` or `gdb binary`, then `break`, `run`, `print` | `lldb -p <pid>` / `gdb -p <pid>` |
| Browser JS | `debugger;` in code, or DevTools Sources → set breakpoint | DevTools attaches to page automatically |

For test runs, most test runners integrate with the above — e.g., `node --inspect-brk $(which jest)`, `pytest --pdb`, `rspec` with `binding.pry`, `dlv test`. Prefer the runner's integration over trying to attach post-hoc.

---

## Race Condition Investigation

When timing or concurrency is suspected, widen the race window with a deliberate delay at the suspect point to make the failure reproducible.

**Condition-based waits instead of arbitrary delays.** Flaky tests are often built on `setTimeout`/`sleep` calls that guess how long an operation takes; they pass on fast machines and fail under load or in CI. Replace the guess with polling the condition the test actually depends on, bounded by a timeout. A fixed delay stays correct only when the test is about timing itself (debounce intervals, throttle windows) — in that case, comment why the specific duration is needed.

---

## Heisenbugs and the Observer Effect

When adding `console.log`, attaching a debugger, or inserting instrumentation causes the bug to disappear, the observation is changing the system's behavior. That is itself diagnostic — do not conclude "fixed." The bug is still present; your instrumentation perturbed it out of sight.

**What the disappearance tells you:**

- **Timing-sensitive:** Instrumentation slowed the code enough that a race condition no longer wins. Investigate concurrency, async ordering, and shared mutable state rather than the nominal logic.
- **Garbage-collection-sensitive:** Logging allocated memory and triggered a GC that hid the symptom. Look at memory pressure, finalizers, object lifecycle.
- **Optimization-dependent:** Instrumentation prevented a compiler/JIT optimization that was producing wrong results. Rare but real (especially in C/C++/Rust release builds).
- **Buffering-dependent:** Log flushing changed I/O ordering. Often indicates unflushed writes elsewhere.
- **Async-ordering-sensitive:** Log I/O introduced a microtask boundary that reorders subsequent operations. Look for code that implicitly depends on synchronous ordering.

**How to investigate without perturbing:**

- Non-blocking instrumentation: write to a ring buffer in memory, dump it only after failure is observed
- Sampling profilers instead of tracing: external observation of what's running without injecting code into the path
- Platform-level instrumentation: `strace`, `dtrace`, eBPF, platform profilers that don't require code changes
- Post-mortem evidence: core dumps, heap snapshots, captured state from after the failure, without observing during

The defining rule: if the bug is sensitive to observation, the fix must survive re-introduction of the observation. A fix that only works while instrumentation is present is itself a heisenbug.

---

## Browser Debugging

When investigating UI bugs with `agent-browser` or equivalent tools:

```bash
# Open the affected page
agent-browser open http://localhost:${PORT:-3000}/affected/route

# Capture current state
agent-browser snapshot -i

# Interact with the page
agent-browser click @ref          # click an element
agent-browser fill @ref "text"    # fill a form field
agent-browser snapshot -i         # capture state after interaction

# Save visual evidence
agent-browser screenshot bug-evidence.png
```

**Port detection:** If your in-context project instructions explicitly state the dev-server port, use it (don't grep instruction prose for a port — it's false-positive-prone); otherwise check `package.json` dev scripts, then `.env` files, falling back to `3000`.

**Console errors:** Check browser console output for JavaScript errors, failed network requests, and CORS issues. These often reveal the root cause of UI bugs before any code tracing is needed.

**Network tab:** Check for failed API requests, unexpected response codes, or missing CORS headers. A 422 or 500 response from the backend narrows the investigation immediately.

---

## Evidence Harvesting and Boundary Gotchas

When a bug spans a real environment — production, staging, a multi-service setup — the richest evidence usually already exists in logs, traces, and error-tracker payloads. Two non-obvious things about that evidence:

- **Snapshot it before a long investigation.** Error trackers and log systems have retention windows, and the evidence can age out mid-session — export the event ID, trace ID, full stack trace, and breadcrumbs first.
- **Grouping hides variants.** An error tracker shows you a representative instance; expand the group to see every instance, or you will tune the fix to one variant of several.

Three boundary gotchas worth ruling out early, because each masquerades as a code bug:

- A read immediately after a write may hit a **read replica that hasn't caught up** yet.
- `EMFILE` / "too many open files" is usually an **inotify or FD limit**, not a leak in your code.
- The **running process may be an older build** than the code you are reading (cross-reference the pid to its build time); crashed-then-restarted-with-old-code workers look exactly like logic bugs.

---

## Bug-Class Pattern Checklist

Before deep tracing, run down this checklist. Many bugs match a recognizable class, and the class implies where to look first. Check whether the observed symptom fits any of these patterns:

- **Time and timezone:** off-by-hours errors near midnight, failures specifically during DST transitions, epoch/milliseconds confusion, naive vs timezone-aware datetimes mixed, UTC-vs-local assumed incorrectly
- **Encoding and locale:** mojibake in output, byte-vs-character length off-by-one, BOM at the start of a file breaking parsers, non-ASCII characters missing, locale-sensitive comparisons producing inconsistent results
- **Floating-point precision:** comparisons that "should" be equal but aren't, NaN propagating through a calculation and silently corrupting downstream results, very large or very small numbers losing precision
- **Integer overflow / underflow:** wraparound on bounded integer types, `int32` overflows in languages without arbitrary-precision integers, negative values where non-negative was assumed
- **Off-by-one and boundaries:** empty-collection edge case, first or last element missing, inclusive vs exclusive range mismatch, fencepost errors
- **Cache staleness:** correct behavior immediately after a change, wrong behavior after some time, fixed by restart or cache flush; includes HTTP caches, CDN caches, app-level memoization, browser service workers
- **Permissions / auth:** works for one user and not another, works in dev without auth layer but fails in prod with it, works with superuser but not with the actual operating identity
- **Dependency or version drift:** works on one machine but not another, lockfile out of sync with manifest, transitive dependency updated and changed behavior, native module built against a different runtime version
- **Path / case sensitivity:** works on macOS and fails on Linux (case), works on Linux and fails on Windows (path separators, reserved names like `CON`/`PRN`)
- **Concurrency / ordering:** works in serial test mode, fails in parallel; works one way and fails another when randomized
- **Stale build artifacts:** `dist/`, `.next/`, compiled `.pyc`, generated code, Docker image layers — rebuild from clean and see if it reproduces
- **Observer effect (heisenbug):** bug vanishes when logging, debugger, or profiler is attached — see the Heisenbugs section above
- **TOCTOU (time-of-check vs time-of-use):** a check passed a moment ago but the underlying state changed before the dependent action ran
