# Set up autonomous mode

Interactive only. Ask one question at a time with the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability. Fall back to numbered options in chat only when no such tool is in the list or a real question call errors. Never silently skip a question. On `setup` with settings present, show them and ask only about what the user wants to change.

Read the repository first: open PRs and issues, who opens them, main's health, the test command, and whether branch rules exist. Offer answers from what you found.

## Questions

1. **Where the settings live.** `.compound-engineering/config.yaml`, shared through the default branch, or `.compound-engineering/config.local.yaml`, private to this checkout. Recommend local for a repository the user does not own. When the shared file already sets a profile, local settings can only tighten it. Before writing the local file, confirm git ignores it.
2. **Risk profile.** Show what each means:

   | Motion | cautious | balanced | hands-off |
   |---|---|---|---|
   | main-red, bugs, backlog, stack | opens PRs | babysits, earns merge | merges |
   | security | opens PRs | opens PRs | opens PRs, earns merge |
   | climb | reports | opens PRs, earns merge | merges |
   | create | reports | opens PRs | opens PRs, earns merge |

   Earning takes five clean landings of its own work in that motion, whether the script or a person merged them unchanged. A revert, or a PR a person closes, resets it. Closing items needs `backlog` at babysit, so cautious never closes. At every profile, a person lands changes to permissions, data deletion or migration, secrets, billing, releases, and the CI, tests, scripts and instructions that judge a change.
3. **Motions.** Default: main-red, bugs, backlog, stack.
4. **Who is trusted.** Accounts whose PRs may merge, accounts whose PRs may be babysat, and everyone else, whose code is never run. Write a bot as `name[bot]`. Babysitting or testing runs that person's code on this machine, where it can reach the user's files and keychain; say so before accepting a name. Review bots must be listed too, because an unlisted voice on an autonomous PR caps it.
5. **Test command.** What must pass on this machine before anything lands. Without one, nothing lands.
6. **Direct to the default branch.** Off unless the user asks. It is refused where branch rules exist.
7. **Rules in their own words.** Each can only make a landing stricter.
8. **Limits.** Jobs per hour (default 2) and open autonomous PRs (default 5).

Show the resulting settings, write only the `autonomous_*` keys, preserve everything else in the file, and run `policy` to confirm it reads back as meant. Keys and value formats are in the config template that `ce-setup` installs. Say when branch rules are absent: any process running as the user can merge without this skill, and server-side rules are the only thing that prevents it.

## Schedule

Offer to schedule it, or to leave it on demand. Use the host's scheduler; do not build one. Hourly is the default. In T3 Code, that is `schedule_task` with an interval schedule, this project, and a new thread per run; a webhook schedule can start a run when a PR or issue opens. Elsewhere use the host's automation or cron. The scheduled prompt is the rendered invocation alone, so the run is unattended and never asks.

**User-runnable invocation rendering.** Default to `/lfg-auto`; use `$lfg-auto` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

Offer a first `dry-run` before the schedule starts.
