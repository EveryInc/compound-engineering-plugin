# Investigation Techniques

Techniques for deeper investigation when standard code tracing is not enough. Load this when a bug does not reproduce reliably, involves timing or concurrency, or requires framework-specific tracing.

---

## Root-Cause Tracing

When a bug manifests deep in the call stack, the instinct is to fix where the error appears. That treats a symptom. Instead, trace backward through the call chain to find where the bad state originated.

**Backward tracing:**

- Start at the error
- At each level, ask: where did this value come from? Who called this function? What state was passed in?
- Keep going upstream until finding the point where valid state first became invalid — that is the root cause

**Worked example:**

```
Symptom: API returns 500 with "Cannot read property 'email' of undefined"
Where it crashes: sendWelcomeEmail(user.email) in NotificationService
Who called this? UserController.create() after saving the user record
What was passed? user = await UserRepo.create(params) — but create() returns undefined on duplicate key
Original cause: UserRepo.create() silently swallows duplicate key errors and returns undefined instead of throwing
```

The fix belongs at the origin (UserRepo.create should throw on duplicate key), not where the error appeared (NotificationService).

**When manual tracing stalls**, add instrumentation:

```
// Before the problematic operation
const stack = new Error().stack;
console.error('DEBUG [operation]:', { value, cwd: process.cwd(), stack });
```

Use `console.error()` in tests — logger output may be suppressed. Log before the dangerous operation, not after it fails.

---

## Git Bisect for Regressions

When a bug is a regression ("it worked before"), use binary search to find the breaking commit:

```bash
git bisect start
git bisect bad                    # current commit is broken
git bisect good <known-good-ref> # a commit where it worked
# git bisect will checkout a middle commit — test it
# mark as good or bad, repeat until the breaking commit is found
git bisect reset                  # return to original branch when done
```

For automated bisection with a test script:

```bash
git bisect start HEAD <known-good-ref>
git bisect run <test-command>
```

The test command should exit 0 for good, non-zero for bad.

---

## Intermittent Bug Techniques

When a bug does not reproduce reliably after 2-3 attempts:

**Logging traps.** Add targeted logging at the suspected failure point and run the scenario repeatedly. Capture the state that differs between passing and failing runs.

**Statistical reproduction.** Run the failing scenario in a loop to establish a reproduction rate:

```bash
for i in $(seq 1 20); do echo "Run $i:"; <test-command> && echo "PASS" || echo "FAIL"; done
```

A 5% reproduction rate confirms the bug exists but suggests timing or data sensitivity.

**Environment isolation.** Systematically eliminate variables:
- Same test, different machine?
- Same test, different data seed?
- Same test, serial vs parallel execution?
- Same test, with vs without network access?

**Data-dependent triggers.** If the bug only appears with certain data, identify the trigger condition:
- What is unique about the failing input?
- Does the input size, encoding, or edge value matter?
- Is the data order significant (sorted vs random)?

---

## Framework-Specific Debugging

### Rails
- Check callbacks: `before_save`, `after_commit`, `around_action` — these execute implicitly and can alter state
- Check middleware chain: `rake middleware` lists the full stack
- Check Active Record query generation: `.to_sql` on any relation
- Use `Rails.logger.debug` with tagged logging for request tracing

### Node.js
- Async stack traces: run with `--async-stack-traces` flag for full async call chains
- Unhandled rejections: check for missing `.catch()` or `await` on promises
- Event loop delays: `process.hrtime()` before and after suspect operations
- Memory leaks: `--inspect` flag + Chrome DevTools heap snapshots

### Python
- Traceback enrichment: `traceback.print_exc()` in except blocks
- `pdb.set_trace()` or `breakpoint()` for interactive debugging
- `sys.settrace()` for execution tracing
- `logging.basicConfig(level=logging.DEBUG)` for verbose output

---

## Race Condition Investigation

When timing or concurrency is suspected:

**Timing isolation.** Add deliberate delays at suspect points to widen the race window and make it reproducible:

```
// Simulate slow operation to expose race
await new Promise(r => setTimeout(r, 100));
```

**Shared mutable state.** Search for variables, caches, or database rows accessed by multiple threads or processes without synchronization. Common patterns:
- Global or module-level mutable state
- Cache reads without locks
- Database rows read then updated without optimistic locking

**Async ordering.** Check whether operations assume a specific execution order that is not guaranteed:
- Promise.all with dependent operations
- Event handlers that assume emission order
- Database writes that assume read consistency

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

**Port detection:** Check project instruction files (`AGENTS.md`, `CLAUDE.md`) for port references, then `package.json` dev scripts, then `.env` files, falling back to `3000`.

**Console errors:** Check browser console output for JavaScript errors, failed network requests, and CORS issues. These often reveal the root cause of UI bugs before any code tracing is needed.

**Network tab:** Check for failed API requests, unexpected response codes, or missing CORS headers. A 422 or 500 response from the backend narrows the investigation immediately.
