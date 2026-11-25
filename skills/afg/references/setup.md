# Set up autonomous mode

Interactive only. Ask one question at a time with the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability. Fall back to numbered options in chat only when no such tool is in the list or a real question call errors. Never silently skip a question. On `setup` with settings present, show them and ask only about what the user wants to change.

Read the repository first: open PRs and issues, who opens them, main's health, the test command, and whether branch rules exist. Offer answers from what you found.

## Questions

1. **Where the settings live.** `.compound-engineering/config.yaml`, shared through the default branch, or `.compound-engineering/config.local.yaml`, private to this checkout. Recommend shared, committed and landed the way the repository lands work, and local only for a repository the user does not own. Until shared settings are on the default branch they do nothing, so finish by landing that file alone with the user's approval; a run never lands its own policy. A public repository shows them to everyone; say so. When the shared file already sets a profile, local settings can only tighten it. Before writing the local file, confirm git ignores it.
2. **Risk profile.** Show what each means:

   | Motion | cautious | balanced | hands-off |
   |---|---|---|---|
   | main-red, bugs, backlog, stack | opens PRs | babysits, earns merge | merges |
   | security | opens PRs | opens PRs | opens PRs, earns merge |
   | climb | reports | opens PRs, earns merge | merges |
   | create | reports | opens PRs | opens PRs, earns merge |

   Earning takes five clean landings of its own work in that motion, whether the script or a person merged them unchanged. A revert, or a PR a person closes, resets it. Closing items needs `backlog` at babysit, so cautious never closes. At every profile, a person lands changes to permissions, data deletion or migration, secrets, billing, releases, major updates, fewer tests, and the CI, scripts and instructions that judge a change. Linter settings and guard tests wait too, except that hands-off lands its own change to one when an independent reviewer finds it narrow and the check still catches a planted violation.
3. **Motions.** Default: main-red, bugs, backlog, stack.
4. **Who is trusted.** Accounts whose PRs may merge, accounts whose PRs may be babysat, and everyone else, whose code is never run. Write a bot as `name[bot]`. Babysitting or testing runs that person's code on this machine, where it can reach the user's files and keychain; say so before accepting a name. A listed person's commits must be signed unless the PR comes from their own fork. Review bots must be listed too, because an unlisted voice on an autonomous PR caps it.
5. **Checks.** What must pass on this machine before anything lands, as `autonomous_checks`, with `paths` where the instructions run a check only for some files. They start from a clean copy, so each includes what it needs installed, and work in a real temporary folder with a short path (a socket path over about 100 bytes fails on macOS). A check that could reach the user's live services or files gets its own `HOME`. The script withholds credentials and variables that name a database, service address or environment, so a check that needs one starts its own. Cover everything the instructions require, and end with one check without `paths`, so no change is left with none. Paths take `*`, `**` and `?`, separated by spaces. List in `autonomous_judges` any file that decides whether a check passes and that the owner wants to change only themselves, linter settings and guard tests included; those wait at every profile. A check must not rewrite tracked files. Without one that applies, nothing lands. Before saving, run each in a clean worktree on the current tip and show the result; say what a check needs that a clean copy lacks, such as a database. One that fails there blocks every landing it applies to. Find out whether a repair could pass it and stay within the limits; when none could, the user chooses what to require instead. Never weaken one to make it pass.
6. **How work lands.** Read the project instructions and recent history before asking, and say what you found. When they land without pull requests, recommend `autonomous_landing: direct`, and `autonomous_ci: ignored` only when they also say not to wait for CI. Otherwise recommend pull requests. Set `autonomous_merge_method` when they name one. Save every other rule they state about landing as an `autonomous_landing_steps` entry in their own words, and show the list for correction. Direct landing is refused where branch rules exist.
7. **Rules in their own words.** Each can only make a landing stricter.
8. **Limits.** Jobs per hour (default 2) and open autonomous PRs (default 5).

Show the resulting settings, write only the `autonomous_*` keys, preserve everything else in the file, and run `policy` to confirm it reads back as meant. Keys and value formats are in the config template that `ce-setup` installs. Say when branch rules are absent: any process running as the user can merge without this skill, and server-side rules are the only thing that prevents it.

## Schedule

Offer to schedule it, or to leave it on demand. Use the host's scheduler; do not build one. Hourly is the default. In T3 Code, that is `schedule_task` with an interval schedule, this project, and a new thread per run; a webhook schedule can start a run when a PR or issue opens. Elsewhere use the host's automation or cron. The scheduled prompt is the rendered invocation alone, so the run is unattended and never asks.

**User-runnable invocation rendering.** Default to `/afg`; use `$afg` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

Offer a first `dry-run` before the schedule starts.
