---
name: optimize-loop
description: "Iterative optimization loop inspired by Karpathy's autoresearch. Measures a single metric, makes one change per iteration, keeps improvements, discards regressions. Use for test speed, coverage, query performance, flakiness, bundle size, or anything with a clear number."
argument-hint: "[what to optimize, e.g. 'test speed of packages/intake/spec']"
---

# Optimize Loop

Iterative optimization skill inspired by [Karpathy's autoresearch](https://github.com/karpathy/autoresearch). Run experiments in a loop against a single measurable metric, keeping improvements and discarding regressions via git commits.

## Target Description

<target> #$ARGUMENTS </target>

**If the target above is empty, ask the user:** "What would you like to optimize? Describe the target and the metric (e.g., 'speed up the intake specs', 'reduce flakiness in billing specs', 'improve coverage of the auth package')."

Do not proceed until you have a clear optimization target.

## Core Principles

1. **Single metric**: Every experiment is judged by one number. Lower or higher depending on goal.
2. **Fixed budget**: N iterations (default 10, max 50). The loop runs autonomously within the budget.
3. **Binary keep/discard**: If the metric improved, keep the commit. Otherwise `git reset --hard HEAD~1`.
4. **Single scope**: Only modify files agreed upon with the user. Keep diffs small and reviewable.
5. **Simplicity wins**: All else equal, simpler code is better. Removing code for equal results is a win.
6. **Crash resilience**: If a run crashes, attempt ONE fix. If still broken, revert and move on.
7. **Results log**: Every experiment logged to `tmp/optimize-results.tsv`.
8. **Profile first**: Before optimizing, measure where time/resources are actually spent. The biggest bottleneck is often not where you'd expect.

## Workflow

### Phase 1: Interview

Use AskUserQuestion to gather:

1. **Goal**: What are we optimizing? (e.g., "speed up the intake specs")
2. **Metric + measurement command**: How do we measure? The command must produce a parseable number.
   - Test speed: `bundle exec rspec <path> --format progress 2>&1 | grep "Finished in"`
   - Flaky tests: Run N times, count failures
   - Coverage: `COVERAGE=true bundle exec rspec <path> 2>&1 | grep "Coverage"`
   - Query speed: `bundle exec rails runner "puts Benchmark.measure { ... }.real"`
3. **Target files**: Which files can be modified? (spec-only is safest)
4. **Budget**: How many iterations? (default: 10)
5. **Direction**: Lower is better (speed, flakiness, memory) or higher is better (coverage)?

### Phase 2: Profile and Baseline

**This step is critical. Do not skip it.**

1. Create a dedicated branch: `optimize-loop/<topic>-<date>`
2. Run the measurement command to establish the baseline value.
3. **Profile by file**: Use `--format json` to get per-file timing, or time files individually. Identify the top consumers. The distribution is almost always Pareto — a few files dominate.
4. **Profile by example**: Use `--profile 20` on the heaviest files to find the slowest individual examples.
5. **Look for non-obvious bottlenecks**: `sleep` calls in production code, VCR cassettes making real HTTP calls, N+1 queries in test setup, eager `let!` creating records no test uses.
6. Create `tmp/optimize-results.tsv` with headers: `iteration\tcommit\tmetric_value\tstatus\tdescription`
7. Log iteration 0 as the baseline.

### Phase 3: Experiment Loop

For each iteration (1 to budget):

1. **Analyze**: Read the target files and the results log. Choose the next optimization to try based on what the profiling revealed. Review what was already tried to avoid repeating failed approaches.

2. **Modify**: Make ONE focused change. Keep the diff small.

3. **Commit**: `git add` the changed files and commit:
   ```
   optimize-loop: iteration N - <short description>
   ```

4. **Measure**: Run the measurement command. Parse the metric value.

5. **Evaluate**:
   - Metric **improved** (or equal with simpler code): **KEEP**
   - Metric **regressed**: **DISCARD** via `git reset --hard HEAD~1`
   - Run **crashed**: Attempt ONE fix. If still broken, discard.

6. **Log**: Append to `tmp/optimize-results.tsv`:
   ```
   N\t<commit-sha>\t<metric_value>\t<keep|discard|crash>\t<description>
   ```

7. **Continue** to the next iteration. Do NOT ask the user for confirmation between iterations.

### Phase 4: Report

After all iterations complete:

1. Summarize: baseline → final value, % improvement, keeps/discards/crashes
2. List the top 3 most impactful changes
3. Show the git log of kept commits
4. Ask the user whether to squash, keep individual commits, cherry-pick, or discard

## Proven Optimization Techniques

Ordered by typical impact (highest first), based on real-world results:

### 1. Stub sleep/delay calls in job specs
Production jobs often have `sleep` for rate limiting or backoff. Tests that exercise these jobs sleep too — sometimes 100+ seconds total. One-line stub fix.

### 2. `let!` → `let` (eager to lazy)
The single most impactful structural change. `let!` creates records eagerly for EVERY example in scope — even examples that don't reference the variable. When a describe block has 4 `let!` patients but each test only uses 1, three patients are created and thrown away per example.

**How to find**: `grep -c "let!" <spec_file>` — files with 10+ are prime targets.
**How to verify**: Check if the variable is referenced in ALL examples, or only some.
**Caveat**: Keep `let!` when a record must exist in the DB before the test runs without being explicitly referenced (e.g., scoped queries, count assertions).

### 3. `aggregate_failures` to collapse single-assertion tests
When multiple `it` blocks share the same `before`/`let` setup and each tests one attribute, collapse them into a single `it` with `:aggregate_failures`. Each eliminated example saves one full setup/teardown cycle.

**Best targets**: Facade/presenter specs with dozens of `#method_name` describes, each with one `it { is_expected.to eq(...) }`.

### 4. `build_stubbed` instead of DB queries for stub return values
Pattern: `allow(Service).to receive(:method).and_return(Model.last(2))` — this hits the DB just to provide a return value for a stub. Replace with `build_stubbed(:model)`.

**How to find**: `grep "\.last\|\.first\|\.find" <spec_file> | grep "and_return"`

### 5. `let_it_be` from test-prof
Creates a record ONCE per describe block, reloads it per example via transaction savepoints. Requires `require 'test_prof/recipes/rspec/let_it_be'`.

**Best for**: Heavy base records (patients with 8+ traits) used across many examples in the same describe block where most tests only read.
**Use `reload: true`** when tests might mutate associations.

### 6. Merge duplicate contexts
When insurance-pay and cash-pay sub-contexts create nearly identical heavy patients to test the same outcome, merge them. Same for "with scheduling" and "without scheduling" when the scheduling doesn't affect the thing under test.

## What Typically Doesn't Work

- **Hoisting stubs to a broader scope**: Stubs that work in some contexts may break others that implicitly depend on the stub being absent. Shared examples are especially fragile here.
- **`build_stubbed` for records that get `.reload`ed**: The subject calls `record.reload` which hits the DB — stubbed records don't exist there.
- **`before(:all)` without test-prof**: Creates records outside the transaction, leading to data leaking between examples and flaky tests.
- **Aggressive factory trait removal**: Removing traits to make patients lighter often breaks tests that depend on associations created by those traits.

## Important Rules

- NEVER modify files outside the agreed target scope
- NEVER skip the measurement step — every change must be measured
- NEVER keep a change that regresses the metric (unless code is significantly simpler for equal metric)
- If a measurement takes longer than 5 minutes, kill it and log as crash
- `tmp/optimize-results.tsv` is NOT committed to git — local log only
- Do a fair A/B comparison at the end: switch to the base branch, measure, switch back, measure. DB caching and warm-up can skew results by 20-30%.

## Example Session

```
User: "optimize loop on the intake specs, they're slow"

Agent: [interviews user — spec-only scope, 20 iterations, test speed metric]
Agent: [profiles suite — finds external_entity_referrals_job_spec takes 101s due to sleep(5) calls]
Agent: [iteration 1: stub sleep → 101s → 0.7s → KEEP]
Agent: [profiles again — facade_spec is 95s with 130 examples]
Agent: [iteration 2: aggregate_failures on facade getters → 95s → 42s → KEEP]
Agent: [iteration 3: let! → let for booking → 42s → 17s → KEEP]
Agent: ...
Agent: [17 iterations: 15 keeps, 2 discards, 0 crashes]
Agent: [report: 446s → 221s (50.4% faster), 0 failures]
```
