# `afg`

> Autonomous mode for a repository. One run picks the next job you enabled, gets it done through the other skills, and lands, babysits, closes or parks the result within the tolerances you saved.

`/lfg` takes one request you name. `afg` (always going) decides what to work on. You run it on a schedule, about hourly, and read its digest.

```text
host schedule -> /afg -> look -> pick by motion order -> delegate to lfg, ce-debug, ce-babysit-pr, ...
                                                           -> review and test the exact head
                                                           -> script decides -> land | babysit | close | park
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Repairs main, works bugs and the PR and issue backlog, updates dependencies, and proposes improvements, within your settings |
| When to use it | A repository whose routine work should start and finish without you |
| What it produces | Landed or open PRs, evidence-backed closes, and a digest of what needs you |
| What's next | Answer the parked items; the next run picks them up |

---

## Example invocations

```text
# First run: interviews you and saves settings. Later: one run
/afg

# Change the settings or the schedule
/afg setup

# Show the settings and what happened recently
/afg status

# Say what a run would do, and write nothing
/afg dry-run
```

---

## What makes it novel

**A script decides landings.** The agent does the work; a bundled script reads policy from the default branch and facts from GitHub, then allows or denies. A PR cannot change the policy that judges it, and text in an issue or PR grants nothing.

**Four settings combine.** A profile sets a start and a ceiling for each motion. Overrides lower a motion or an author. Rules in your own words make a landing stricter. Five clean landings raise a motion to its ceiling, and a revert or a closed PR resets it.

**Main first.** On the pull-request route, while main is not green, only a repair that fixes every failing check may land. Then one item lands at a time.

**The repository's own landing rules.** Setup reads how the project lands work and saves it as settings: the route (pull request or straight to main), whether hosted CI gates it, the merge method, which checks run for which files, and steps in your own words. The script enforces them. A landing step in your words must be confirmed at the exact commit.

**The exact commit.** A landing needs a passing local test and a clean review of the PR's current head on the current base. Either moving voids both.

**Some changes always wait for you.** Permissions, data deletion and migrations, secrets, billing, releases, and the CI, tests, scripts and instructions that judge a change.

---

## Motions

| Motion | Work | Today |
|---|---|---|
| `main-red` | Repair a failing default branch | Full |
| `bugs` | Fix reported bugs, including what `/ce-sweep` collected | Full |
| `backlog` | Land, close or park every open PR and issue | Full |
| `stack` | Dependency and framework updates | Full; major versions wait for you |
| `security` | Find and fix security problems | Private repositories; public ones get digest entries only |
| `climb` | Improve a number with `/ce-optimize` | Full, for measured targets with behavior checks and caps |
| `create` | Content, animation and polish with `/ce-ideate` and `/lfg` | Opens PRs; off by default |

---

## Safety

- With no `autonomous_profile`, it reports and does nothing else.
- Code from people you have not listed is never checked out or run. Code from people you list runs here with access to your files and keychain.
- Closing needs a merged fix, an older duplicate, or a merged replacement, checked by the script.
- Any process running as you can merge without this skill. Branch rules on the server are the only thing that prevents that.
- Runs are locked per checkout. Two machines running it on one repository are not coordinated.
- It needs the GitHub CLI and file locking, so it does not act on native Windows.

Settings and their layering are in [Compound Engineering configuration](./configuration.md).

## Scheduling

Use your host's scheduler with the prompt `/afg`. In T3 Code, use an interval schedule with a new thread per run; a webhook schedule can start a run when an issue or PR opens. It does not read remaining subscription quota: it caps jobs per hour and moves to another provider when one reports a limit.

When something else shares this machine's capacity across repositories, it can write `.context/compound-engineering/afg/allowance.json`: `{"version": 1, "jobs": 2, "expires_at": "2026-01-01T12:00:00Z"}`. While that file exists, `afg` has no more jobs and workers than `jobs` at once, and starts none after `expires_at`; a file it cannot read starts none, and neither does a run that began with one and lost it. Work already going finishes. `policy` reports it under `allowance`, and a denial names the file. Without it nothing changes; remove it to stop limiting the repository.
