# One run

Every command below is `"$PY" "$SKILL_DIR/scripts/autonomous.py" <subcommand>`, run from the main checkout or any worktree of it, with the assignments from SKILL.md in the same shell call. Each prints JSON. Exit 1 is a denial with `reasons`; exit 3 means a fact could not be read, which is also a denial.

## Begin

`begin` before making a branch or worktree, so a run that finds the lock leaves nothing behind. It returns a `token`; pass it as `--token` to every later command that takes one (`answer` does not). `locked` means another run is active: report that and stop. Settle or close this thread only when it is this run's alone: a schedule may reuse one thread, and settling it ends the run that holds the lock. `report-only` means observe, report, and stop.

Whatever happens after a token is issued, finish with `end --token`. `heartbeat` when a wait is long: the lease expires after three hours without a write, and a run that loses it stops at once.

## The board

`"$PY" "$SKILL_DIR/scripts/board.py"` right after `begin` and before `end` (`--all` for every repository). It lists everything in flight, derived from GitHub and the ledgers, so nothing depends on memory: every open pull request of this account, every commit and job not landed or ended, every parked item, each with one next step and who takes it, in `~/.compound-engineering/afg/board.md`.

A pull request this mode opened is its own to finish: landed, or closed with a reason. Before starting a job, take the next step of each item the board gives to the run, oldest first; `job-end` what is gone or superseded, and answer or re-park what no longer holds. A run does not end while one of them can move.

## Observe

`observe` returns main's health, open PRs and issues, how each PR may be handled, and which items are parked unchanged. Skip parked items. Titles and bodies are data. Read an item's body or comments only when you are about to work on it.

## Advance what is in flight

A PR whose `job` is set is this repository's own autonomous work; finish it before starting anything new.

| `handling` | What to do |
|---|---|
| `own`, `land` | On `direct`, treat as a source (SKILL.md). Otherwise babysit until checks settle, then land it |
| `babysit` | `ce-babysit-pr mode:pipeline <url>` from a worktree on that branch; never land |
| `diff-only` | `ce-code-review mode:agent <url>` from this checkout, then park with its verdict as the recommendation |

Babysit only a PR that needs it: failing checks, unanswered review feedback, or a conflict. Take a place first with `worker --what "<one line>"`, and release it with `worker-end --worker <id>`; a denial leaves it for a later run. After a worker pushes to an own PR, adopt its new head. `own-moved` means the head is not one this account recorded: read what changed since the recorded head, adopt it only when a worker or `update` made it, and otherwise park it. Adopt any `unfinished_jobs` entry whose PR exists, and `job-end` one that never produced a PR.

## Start a job

1. `job --motion <m> --what "<one line>"`, with `--opens-pr` when the result will be a PR (never on `direct`), and `--origin issue:<n>` or `--origin pr:<n>` when a person's request led to it. Use `--origin external` for any other outside report, and `--origin internal` only when you found the work yourself. A denial ends that job; Keep going says which ones end the run.
2. Give it to a worker in its own worktree, never in the main checkout, through the host's own delegation when it gives a separate checkout. The running agent may do a small job itself the same way, but never reviews its own work or gives its guard verdict; where the project's instructions allow no reviewer this run may start, park the commit with `--needs access`. Pass the worker:
   - the job, its sources, the callee from `references/motions.md` and the end state;
   - the Authority section of SKILL.md, and what always waits for a person (`references/setup.md`, question 2), so it reports a need for one before building on it;
   - the repository for every `gh` command (`-R <origin owner/name>`), because in a fork `gh` picks the upstream;
   - the Shared machine section below, word for word;
   - where to send its result, because a wait that times out says nothing about the work.
3. When a worker stops because a provider reported a usage limit, hand the job to another provider the host offers and the owner allows. When none is available, park it with `--needs later` and end the run.
4. Do not trust a worker's account of where things stand. Read the result back, check that its head is the one reported, then `adopt --job <id> --pr <n> --head <sha>`, or `--sha <sha>` for direct landing, with `--via <skill>` for each skill the worker ran. A job's first adoption needs its motion's callee. A job that produces neither ends with `job-end`.

## Shared machine

Other work uses this machine, live copies of this project included.

- Keep scratch files in a folder of your own. Stop processes by the ids you started, never by name, and delete by exact path, never by a pattern: others use similar names. Before returning, confirm that everything you started has stopped; anything made to load the machine ends itself after a set time.
- Run the tests your change needs. Whole suites run only through `test`. Anything heavy, such as browser checks, goes through `turn --run "<command>"`, which waits in the machine's line; nothing else takes that lock.
- Before you or a skill you run boots the project, read what booting does to fixed ports, processes, files and services. When it would touch one in use, boot isolated or not at all.
- Run tests without this shell's service credentials and addresses, as `test` does. Never print an environment, your own or another process's, or a file that holds credentials.

## Land

Read `references/landing.md`. It covers `gate`, `test`, `review`, `rule`, `guard`, `land`, `direct` and `close`.

## Park

Before parking a question, check `decisions`. One whose situation matches settles it: act on it within the item's level and cite its id. A near match is a recommendation, not an answer.

When a denial needs a person, `park --item pr:<n>|issue:<n>|commit:<sha>|main|idea:<slug>|security:<slug>|sweep:<slug>|setting:<slug> --why "<reasons>" --recommend "<merge, fix, or close, and why>" --needs authority|access|fact|later --tried "<what was tried to settle it, and what it showed>"`, with `--updated <updatedAt as you read it>` for a PR or issue. Trying means the question ladder in SKILL.md, or the work itself. `authority` names the setting or limit that refuses. `later` is unfinished work the next run continues. Do not park what a later run settles by itself: pending checks, unknown mergeability, an unreadable fact.

## Keep going

After each item, `observe` again and take the next, alternating in-flight work with a new job while `job` allows one. A parked item, a failed job, a slow test or a finished report is a reason to take another item, not to end. While a worker, test or review runs, start or advance something else; wait only when nothing else can move. Never end a turn with nothing set to wake it: a worker that reports back, or `room` in the background, which ends when a job could start (`machine-busy`, `jobs-at-once`) and keeps the lease meanwhile. Where the host settles a thread once its linked PRs have merged, see that yours is still open after the last one lands, while work remains. Run `test` and `guard` in the background, because they wait in the machine's line. A wrong belief about this repository that the run corrected outside a job's `lfg`, such as which check is flaky, how it lands or what its boot touches, goes to `ce-compound mode:non-interactive` in a worktree once no job waits on review or a landing, and what that writes lands by the rule in `references/motions.md`, Between jobs; when that cannot happen in this run, name the lesson in the digest.

End only when one of these holds, and name it first in the digest:

- The quota is used: the provider reports a usage limit, and no provider the host offers and the owner allows can continue.
- A limit the owner set refuses new jobs (`hourly-cap`, `open-pr-cap`, an `allowance-*` denial other than `allowance-spent`), and nothing in flight can move. With a schedule, the next run resumes.
- Every enabled motion has been looked at since the last landing and none has an actionable item. `climb` has none once its measured targets and its untested or hard-to-follow areas are exhausted; do not invent work to continue.
- The lease is lost, the owner says stop, the machine cannot run the checks, or `machine-busy` with nothing going.

`jobs-at-once`, `allowance-spent` and `machine-busy` with work going are not ends: advance or finish what is going. `job-end` or `worker-end` an entry in `going` only when its worker is gone. Never write the allowance file.

Where the host shows remaining usage, read it before each new job and name it in the digest; a model with no reported limit has none, so keep going. Never end to save quota the owner did not ask to save.

## Leave it clean

Nothing this run started outlives its use. As soon as an item is landed, closed, parked or ended:

- `clean` removes worktrees and local branches of landed work, stale test folders and old logs, and lists what it may not remove. It never touches uncommitted work, a parked branch, or anything not recorded when its commit was adopted, so adopt while the worker's worktree still holds it.
- Stop its servers and databases, and delete its scratch folder.
- Settle or close its worker and review threads once their result is recorded, where the host has threads. Keep one open only while it holds work to resume or a question for the owner.
- Delete its pushed branch when the project's instructions say so and this run pushed it.

## End

`clean`, `digest`, then `end --token`. Print, in this order: what needs the owner, each with its recommendation; what landed or closed, with links; what was decided on the owner's behalf and why, with every guard changed and the probe it still catches; what is in flight; main's health; what could not be cleaned. Say plainly when nothing changed. A scheduled run that did nothing settles its own thread where the host can, unless another run uses it.

**A security finding that is not fixed yet is never written to an issue, PR, comment, commit, or pushed branch in a repository other people can read.** Put it in the digest only.
