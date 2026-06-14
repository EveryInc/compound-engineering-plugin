# Investigation Techniques

Techniques for deeper investigation when standard code tracing is not enough. Load this when a bug does not reproduce reliably, involves timing or concurrency, or requires cross-system tracing.

---

## Root-Cause Tracing

When a bug manifests deep in the call stack, trace backward to find where the bad state originated — not where the error first appeared.

**Backward tracing:**

1. Start at the error
2. At each level, ask: where did this value come from? Who called this function? What state was passed in?
3. Keep going upstream until finding the point where valid state first became invalid — that is the root cause.

**Worked example:**

```
Symptom: API returns 500 with "Cannot read property 'email' of undefined"
Where it crashes: sendWelcomeEmail(user.email) in NotificationService
Who called this? UserController.create() after saving the user record
What was passed? user = await UserRepo.create(params) — but create() returns undefined on duplicate key
Original cause: UserRepo.create() silently swallows duplicate key errors
```

The fix belongs at the origin (UserRepo.create should throw on duplicate key), not where the error appeared.

**When manual tracing stalls**, add instrumentation:

```
const stack = new Error().stack;
console.error('DEBUG [operation]:', { value, cwd: process.cwd(), stack });
```

Use `console.error()` in tests — logger output may be suppressed.

---

## Multi-Component Boundary Instrumentation

When a bug crosses subsystems (CI → build → signing, API → service → database), instrument every component boundary in one run and let the evidence point to the failing layer.

**Shape:**

1. List the component boundaries data crosses from trigger to observed symptom.
2. At each boundary, log what enters and what exits — include the values, relevant environment, and a boundary tag.
3. Run the scenario once.
4. Read the log linearly, comparing each "exits" value to the next "enters" value.
5. The boundary where data first stops matching expectation is the failing layer.

One run reveals which layer drops the value — no need to trace each layer independently.

---

## Git Bisect for Regressions

When a bug is a regression ("it worked before"), use binary search to find the breaking commit:

```bash
git bisect start
git bisect bad                    # current commit is broken
git bisect good <known-good-ref>  # a commit where it worked
# test each checkout, mark as good or bad
git bisect reset                  # return to original branch
```

For automated bisection with a test script:

```bash
git bisect start HEAD <known-good-ref>
git bisect run <test-command>
```

---

## Intermittent Bug Techniques

When a bug does not reproduce reliably after 2-3 attempts:

**Logging traps.** Add targeted logging at the suspected failure point and run the scenario repeatedly.

**Statistical reproduction.** Run the scenario in a loop to establish a reproduction rate:

```bash
for i in $(seq 1 20); do echo "Run $i:"; <test-command> && echo "PASS" || echo "FAIL"; done
```

A 5% rate confirms the bug exists but suggests timing or data sensitivity.

**Environment isolation.** Systematically eliminate variables:

- Same test, different machine?
- Same test, different data seed?
- Same test, serial vs parallel execution?
- Same test, with vs without network access?

**Data-dependent triggers.** If the bug only appears with certain data:

- What is unique about the failing input?
- Does input size, encoding, or edge value matter?
- Is the data order significant (sorted vs random)?

**Test-order pollution.** If an individual test passes in isolation but fails in a suite, tests are leaking state:

- Run the failing test alone — if it passes, pollution is confirmed
- Run just the failing test's file to narrow pollution scope
- Run the suite with randomized test order — a different failing-test neighbor each run implies global state mutation
- Common culprits: module-level state, mocks not torn down, temp files not cleaned up, env vars mutated

---

## Repro Minimization

Once a bug reproduces reliably, a smaller reproduction makes every subsequent step faster.

**Delta debugging (manual):**

1. Cut the reproduction in half.
2. Does it still fail? If yes, discard the other half; recurse. If no, put the half back and cut the other half instead.
3. Continue until no further reduction is possible.

**For input payloads:** Remove fields one at a time, shrink string values, replace complex structures with the smallest shape that reproduces.

The minimized repro often reveals the root cause directly — "the bug only triggers when the string contains a tab" is much louder than "the bug triggers in a 500-line integration test."

---

## Stepping Debugger vs Instrumentation

Print-debugging is the default; an interactive debugger converges faster for localized, reliably-reproducible failures.

- **Stepping debugger when:** the failing code path is localized, reliably reproducible, and you need precise state at a known point.
- **Instrumentation when:** the bug is intermittent, spans many calls or distributed components, or happens in a context where breaking execution is disruptive.

| Language   | Entry point                                |
| ---------- | ------------------------------------------ |
| Python     | `breakpoint()` in code, or `python -m pdb` |
| Node.js    | `debugger;` in code + `node --inspect-brk` |
| Ruby       | `binding.irb` (stdlib)                     |
| Go         | `dlv debug` or `dlv test`                  |
| Rust/C/C++ | `lldb` or `gdb`                            |
| Browser JS | `debugger;` in code, or DevTools Sources   |

---

## Race Condition Investigation

**Timing isolation.** Add deliberate delays at suspect points to widen the race window:

```
await new Promise(r => setTimeout(r, 100));
```

**Shared mutable state.** Search for variables, caches, or database rows accessed by multiple threads or processes without synchronization: global state, cache reads without locks, database rows read-then-updated without optimistic locking.

**Async ordering.** Check whether operations assume a specific execution order that is not guaranteed: `Promise.all` with dependent operations, event handlers that assume emission order, database writes that assume read consistency.

**Condition-based waits instead of arbitrary delays.** Replace `setTimeout`/`sleep` with polling the condition the test actually depends on, bounded by a timeout:

```typescript
// before: races under load
await new Promise((r) => setTimeout(r, 50));
// after: waits for the condition
await waitFor(() => getResult() !== undefined, "result available", 5000);
```

Arbitrary delays remain correct only when testing actual timing behavior (debounce intervals, throttle windows).

---

## Heisenbugs and the Observer Effect

When adding instrumentation causes the bug to disappear, the observation is changing the system's behavior. That is diagnostic — do not conclude "fixed."

**What the disappearance tells you:**

- **Timing-sensitive:** Instrumentation slowed the code enough that a race condition no longer wins.
- **GC-sensitive:** Logging allocated memory and triggered a GC that hid the symptom.
- **Optimization-dependent:** Instrumentation prevented a JIT optimization that was producing wrong results.
- **Buffering-dependent:** Log flushing changed I/O ordering.
- **Async-ordering-sensitive:** Log I/O introduced a microtask boundary that reorders operations.

**How to investigate without perturbing:**

- Non-blocking instrumentation: write to a ring buffer, dump only after failure.
- Sampling profilers: external observation without injecting code.
- Platform-level instrumentation: `strace`, `dtrace`, eBPF.
- Post-mortem evidence: core dumps, heap snapshots.

The defining rule: if the bug is sensitive to observation, the fix must survive re-introduction of the observation.

---

## Browser Debugging

When investigating UI bugs:

```bash
agent-browser open http://localhost:${PORT:-3000}/affected/route
agent-browser snapshot -i
agent-browser click @ref
agent-browser fill @ref "text"
agent-browser screenshot bug-evidence.png
```

**Console errors:** Check browser console for JavaScript errors, failed network requests, CORS issues.
**Network tab:** Check for failed API requests, unexpected response codes, missing CORS headers.

---

## Evidence Harvesting Across Systems

When a bug spans a real environment (production, staging, multi-service setup), existing logs, traces, and error-tracker payloads are often richer than reproducing from scratch.

**Follow a single request end-to-end.** Pick one concrete failing request (timestamp, user ID, or event ID from an error tracker). Search every relevant log source for that identifier — correlation ID, request ID, trace ID, user ID. Assemble the timeline: edge → API → service → database → downstream calls → response. Note gaps and contradictions.

**Correlation IDs.** Most web frameworks propagate a request ID. If it is missing, that is itself a finding.

**Timestamp triangulation.** Constrain every log query to a narrow window around the failure, then look for the first anomaly.

**Error tracker payloads.** Sentry, Bugsnag, AppSignal capture stack traces, breadcrumbs, user context, and release metadata. Read the full payload before tracing code.

**APM / distributed traces.** Datadog APM, Honeycomb, OpenTelemetry show the full call tree across services. Look for: unexpectedly long spans, failed spans in the middle, missing spans.

**Preserve before investigating.** Export key evidence before the retention window closes.

---

## System Boundary Checks

A fast pass through system boundaries often eliminates whole categories of suspicion:

**Network:** `dig <host>`, `curl -v https://host/path`, `ss -tan`, `openssl s_client -connect host:443`

**Database:** `EXPLAIN ANALYZE` on the suspect query, slow query log, lock inspection (`pg_locks`, `information_schema.innodb_trx`), connection pool status, replication lag.

**Filesystem:** `ls -la <path>`, case sensitivity checks, open handles (`lsof`), disk space (`df -h`), path encoding.

**Processes:** Verify the running process is the version you think it is (`ps aux | grep`, cross-reference build time).

---

## Bug-Class Pattern Checklist

Before deep tracing, check whether the symptom matches a recognizable class:

- **Time / timezone** — off-by-hours near midnight, DST transitions, epoch/milliseconds confusion, TZ-naive vs -aware
- **Encoding / locale** — mojibake, byte-vs-character off-by-one, BOM at file start breaking parsers
- **Floating-point precision** — comparisons that "should" be equal but aren't, NaN propagating silently
- **Integer overflow** — wraparound on bounded integer types, int32 overflow, negative where non-negative assumed
- **Off-by-one / boundaries** — empty-collection edge case, first/last element missing, inclusive vs exclusive range
- **Cache staleness** — correct after change, wrong after time, fixed by restart
- **Permissions / auth** — works for one user not another, works in dev without auth but fails in prod with it
- **Dependency / version drift** — works on one machine not another, lockfile out of sync with manifest
- **Path / case sensitivity** — works on macOS fails on Linux (case), breaks on Windows (separators)
- **Concurrency / ordering** — works serial, fails parallel; works one way, fails randomized
- **Stale build artifacts** — dist/, .next/, compiled .pyc, generated code, Docker image layers
- **Observer effect (heisenbug)** — bug vanishes when logging, debugger, or profiler is attached
- **TOCTOU** — check passed before the dependent action ran, but state changed in between

Pattern-matching here is cheap. Spending 30 seconds checking the symptom against known classes can eliminate hours of tracing.
