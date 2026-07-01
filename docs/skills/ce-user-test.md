# `ce-user-test`

> Exploratory browser-based user testing with quality scoring and compounding test files — the user watches a visible Chrome window while the agent tests like a user.

`ce-user-test` is the **exploratory user-testing** skill. It drives the app through a visible Chrome window (via the claude-in-chrome MCP), scores each functional area on a 1-5 UX rubric, and persists what it learns into a compounding test file: area maturity statuses, regression probes, queries, journeys, and run history. Each run reads the accumulated state, targets the areas most worth testing (code-affected, surprising, or unproven), and writes back sharper probes for the next run. Three companion skills complete the loop: `ce-user-test-iterate` (run the same scenario N times to measure consistency), `ce-user-test-commit` (persist results from a `--no-commit` or interrupted run), and `ce-user-test-eval` (grade the skill's own output against binary evals).

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Exploratory in-browser testing with per-area 1-5 scoring, regression probes, and a test file that compounds across runs |
| When to use it | Testing app quality as a user would experience it; tracking UX maturity over time; catching regressions in areas that used to work |
| What it produces | A dispatch-style session report, an updated test file (maturity map, probes, history), filed GitHub issues for functional failures |
| Companions | `/ce-user-test-iterate` (N-run consistency), `/ce-user-test-commit` (standalone commit), `/ce-user-test-eval` (self-eval) |

---

## The Problem

Exploratory testing is high-signal but doesn't compound:

- **Every session starts from zero** — the agent re-discovers the same flows, re-hits the same known bugs, and re-learns which selectors work
- **Scores drift** — without an absolute rubric and persisted history, "seems fine" one week is "3/5" the next
- **Regressions in proven areas go unnoticed** — attention naturally goes to new features, not the checkout flow that passed five runs ago
- **Findings evaporate** — surprising behavior noted mid-session never becomes a follow-up unless someone writes it down
- **No separation between testing and grading** — an agent grading its own in-context work inflates results

## The Solution

`ce-user-test` makes each run build on the last:

- **Compounding test file** — per-area maturity (Uncharted → Proven → Known-bug), probes, queries, journeys, and run history live in `tests/user-flows/<scenario>.md` and are updated atomically on every commit
- **Maturity-based targeting** — code-affected areas (from `git diff`) and P1 explore items get full runs; Proven areas get a tiered spot-check budget; Known-bug areas are checked against issue tracker state
- **Probes before exploration** — failing/untested probes (the highest-signal checks) execute before broad exploration, with execution-index tracking so ordering is verifiable from artifacts
- **Absolute 1-5 scoring** — UX per interaction unit, plus optional output-quality scoring for `scored_output` areas, with promotion/demotion gates
- **CLI-first when possible** — if the app exposes a testable CLI/API surface, queries run there first (faster, catches reasoning errors without browser overhead); browser areas can be skipped when tagged prechecks fail
- **Dispatch-format report** — the report tells you what to do next in priority order (NEEDS ACTION / FILED / IMPROVED / STABLE / EXPLORE NEXT RUN), not a wall of observations
- **Artifact-separated self-eval** — `/ce-user-test-eval` grades from file artifacts only, never conversation context, so grading integrity survives

---

## The Suite

| Skill | Role |
|-------|------|
| `/ce-user-test` | Main run: load context → setup → execute → score → report → auto-commit |
| `/ce-user-test-iterate` | Run the same scenario N times (capped at 10); aggregate consistency metrics, then one commit |
| `/ce-user-test-commit` | Standalone commit from `.user-test-last-run.json` after a `--no-commit` run or interruption |
| `/ce-user-test-eval` | Grade the last run's artifacts against 3 binary evals; propose skill mutations on failure |

---

## Quick Example

You invoke `/ce-user-test resale-clothing`. The skill loads `tests/user-flows/resale-clothing.md`, sees `git diff origin/main..HEAD` touched the search code, and marks the search areas code-affected (full exploration). CLI queries run first against the app's API — `y2k accessories` scores 2, flagging the tagged browser area for adversarial mode. In the browser, failing probes run before anything else; one Proven-area probe regresses. Each area gets scored, verified structurally, and timed. The report leads with two NEEDS ACTION items, files one bug to GitHub with a `user-test:<area>` label, updates the test file's maturity map and probe tables, appends to run history, and ends with: `Run /ce-user-test-eval to grade this session's output.`

---

## When to Reach For It

Reach for `ce-user-test` when:

- You want to know how the app *feels* to use, scored consistently across runs
- You're tracking quality over time — which areas are proven, degrading, or broken
- A feature branch touched user-facing code and you want targeted exploratory coverage
- You want regressions in previously-good areas caught automatically via probes

Skip it when:

- You want automated headless regression tests mapped from a PR's changed routes → use `/ce-test-browser`
- The change is backend-only with no observable user-facing behavior
- The claude-in-chrome MCP isn't available and the app has no CLI-testable surface
- You're on WSL (Chrome integration unsupported there)

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | List existing test files, or prompt for a new scenario |
| `<path or description>` | Run that test file, or create one from the description |
| `<scenario> N` | Multi-run mode: N sequential runs with inter-run probe learning |
| `--no-commit` | Report only; commit later via `/ce-user-test-commit` |
| `--no-eval` | Skip the eval prompt after commit |

Artifacts live in `tests/user-flows/`: the test file (committed), `score-history.json`, `bugs.md`, `test-history.md` (committed), and `.user-test-last-run.json` / `.user-test-last-report.md` (gitignored ephemeral run state).

Required: claude-in-chrome MCP connected (or full CLI coverage of scored areas). Optional: `gh` authenticated for issue filing.

---

## See Also

- [`ce-test-browser`](./ce-test-browser.md) — sibling skill for automated headless E2E on PR-affected routes; `ce-user-test` is exploratory and watchable, `ce-test-browser` is regression-focused
- [`ce-dogfood`](./ce-dogfood.md) — hands-off diff-scoped browser QA with autonomous fixes
- [`ce-debug`](./ce-debug.md) — take a filed `user-test:<area>` issue to root cause and fix
