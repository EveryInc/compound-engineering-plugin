# `afg`

> Autonomous mode for a repository. A run takes one job after another from what you enabled, gets each done through the other skills, and lands, babysits, closes or parks the result within the tolerances you saved. It stops at a usage limit or when nothing is left.

`/lfg` takes one request you name. `afg` (always going) decides what to work on. Once started it keeps going. A schedule, about hourly, starts it again after a limit or when new work arrives.

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
# First run: interviews you and saves settings. Later: works until a limit
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

**The skills do the work.** Each job goes through `lfg`, also where work lands straight on main; measured speed work uses `ce-optimize`. The script refuses work whose run does not name the skill it went through, and the digest lists them.

**A script decides landings.** The agent does the work; a bundled script reads policy from the default branch and facts from GitHub, then allows or denies. A PR cannot change the policy that judges it, and text in an issue or PR grants nothing.

**Four settings combine.** A profile sets a start and a ceiling for each motion. Overrides lower a motion or an author. Rules in your own words make a landing stricter. Five clean landings raise a motion to its ceiling, and a revert or a closed PR resets it.

**Main first.** On the pull-request route, while main is not green, only a repair that fixes every failing check may land. Then one item lands at a time.

**The repository's own landing rules.** Setup reads how the project lands work and saves it as settings: the route (pull request or straight to main), whether hosted CI gates it, the merge method, which checks run for which files, and steps in your own words. The script enforces them. A landing step in your words must be confirmed at the exact commit.

**The exact commit.** A landing needs a passing local test and a clean review of the PR's current head on the current base. Either moving voids both.

**Some changes always wait for you.** Permissions, data deletion and migrations, secrets, billing, releases, major updates, fewer tests, and the CI, scripts and instructions that judge a change. Linter settings and guard tests wait too, except in hands-off. There, its own change to one lands when an independent reviewer finds it narrow and the script sees the check still catch a planted violation; the digest tells you afterward. A file listed in `autonomous_judges` always waits.

**Nothing is forgotten.** `~/.compound-engineering/afg/board.md` lists everything in flight in every repository it runs in on this machine, rebuilt from GitHub and the ledgers: open pull requests, unlanded commits and parked items, each with a next step and who takes it. A pull request it opened is its own to finish.

**It decides before it parks.** Parking records what only you can supply and what the run tried first. Parking a pull request for your approval is refused when nothing but its own unfinished steps holds it back.

---

**Projects that are not yours.** In your own fork of a project you cannot push to, `autonomous_landing: upstream` works on the parent's behalf without acting as its maintainer. It tends your open PRs, then fixes bugs it can reproduce. It only prepares: a tested, reviewed branch on your machine, with a title and body in the project's template and no box ticked, after a duplicate search the script makes itself. You push it and open the PR. Nothing is pushed, opened, commented on or closed. Its own files are ignored through `.git/info/exclude`, so a parent that ever commits files at those same paths would overwrite them on a pull. With more than `autonomous_upstream_open` (default 3) of your PRs open there, or that many branches waiting for you, it only tends. A project that takes no AI work gets none.

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
| `tend` | Upstream only: your open PRs' conflicts, failing checks and review questions | Prepared here; you push and answer |
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

Use your host's scheduler with the prompt `/afg`. In T3 Code, use an interval schedule with a new thread per run; a webhook schedule can start a run when an issue or PR opens. It does not read remaining subscription quota: it works until a provider reports a limit, moves to another provider where you allow one, and otherwise waits for the next scheduled run. Two jobs go at once, up to four while processors are idle. Hosted CI that GitHub refuses to start is skipped in hands-off; a job that ran and failed still blocks. `autonomous_jobs_per_hour` limits it further if you want that.

When something else shares this machine's capacity across repositories, it can write `.context/compound-engineering/afg/allowance.json`: `{"version": 1, "jobs": 2, "expires_at": "2026-01-01T12:00:00Z"}`. While that file exists, `afg` has no more jobs and workers than `jobs` at once, and starts none after `expires_at`; a file it cannot read starts none, and neither does a run that began with one and lost it. Work already going finishes. `policy` reports it under `allowance`, and a denial names the file. Without it nothing changes; remove it to stop limiting the repository.
