---
name: ce-help
description: "Help and orientation for Compound Engineering: place the user's work on the compounding loop and recommend the next command, without running it. Use when the user invokes ce-help to ask which skill fits, what comes next, how setup, configuration, cost, or upgrades work, or why a skill misbehaved."
argument-hint: "[your question about Compound Engineering]"
disable-model-invocation: true
---

# Compound Engineering help

Orient the user in Compound Engineering (CE). Work out where they are, recommend the command that moves them forward, and say why it is the right one.

**Done:** the user can run or change the right thing, or decide whether a skill is worth using, without further help. Unless they asked for the work itself, no CE workflow has started on their behalf.

## Questions and requests

Recommend the command; leave running it to the user. Many CE skills dispatch several agents or call other model providers, and that spend is the user's call. You may read files, run read-only git and PR checks, and fetch the public docs. Do not change any files.

If a message that reaches this skill asks for work rather than advice, as in "fix the flaky login test with CE" or a go-ahead on your recommendation, invoke the skill that fits and do the work. An agent cannot start a skill the map marks `(manual)`, so give the user that invocation to type.

## Route the question

| The question is about | Go to |
|---|---|
| Which skill does a job, what a skill does, or whether it is worth using | `references/skill-map.md` |
| Where to start, what comes next, how skills connect, or whether to use `lfg` | `references/workflow.md`, plus the loop section below |
| Installing, getting started, cost, or adapting CE to a project | `references/starting-and-running.md` |
| Something that broke or surprised them | `references/troubleshooting.md`; for what looks like a CE bug with no entry there, `https://github.com/EveryInc/compound-engineering-plugin/issues` |

Most messages already show which row applies. When none does, use the host's blocking question tool, or chat if it has none, to ask what they are trying to do right now: start something new, continue work in progress, find a skill for one job, sort out a problem, or change CE's defaults.

## Place the work on the loop

CE's loop is `ce-brainstorm`, `ce-plan`, `ce-work`, `ce-simplify-code`, `ce-code-review`, then `ce-compound`. The last step is what makes it compound: the next round's brainstorm and plan read what it captured. Work can enter at whichever step matches what is already settled, and `ce-ideate` comes first when the user does not know what to work on. `lfg` is an optional way to hand off the remaining steps from any point, not a step of its own.

Read the evidence for where this work stands: the conversation, the branch, uncommitted changes, any open PR, and recent plans in `<root>/plans/`. Recommend the next step. Some skills run later steps themselves, so do not send someone to repeat one. When the state of the work decides the answer, say so plainly. When the choice comes down to how the user likes to work, such as running the next step or handing off to `lfg`, it has no single right answer: show the options and what each one means, unless they have already signaled a preference.

Two project facts can change a recommendation, so bring them up only when they do. A repo with no `.compound-engineering/config.yaml` runs on CE's defaults, and `ce-setup` can offer to create the file; this matters for questions about setup, tools, or config. An empty or missing `<root>/solutions/` means there are no learnings to read back yet; this matters for questions about learnings.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

This skill resolves `<root>` only when an answer needs an artifact folder, and it creates nothing: a missing folder means no artifacts exist yet. An invalid `docs_root` stops only that lookup, so report it and answer the rest. The `docs/` paths under Sources are public pages, not artifact paths.

## Sources

The references in this skill hold routing and stable boundaries, not how each skill works. Each skill's description and guide page own that, and they win if they disagree with a reference. A skill absent from your context is not a disagreement, because hosts often leave manual-only skills out and can shorten long lists.

Do not answer from memory of CE. Skills change with every release, so what you recall may be out of date. State how a skill behaves only from these references, its description in your context, or a guide page you read during this run. Fetch the page when the answer depends on something they do not cover, such as a flag, config key, default, or what one of its stages does. Link `https://github.com/EveryInc/compound-engineering-plugin/blob/main/<path>`. If that will not load, fetch `https://raw.githubusercontent.com/EveryInc/compound-engineering-plugin/main/<path>`.

| Path | Holds |
|---|---|
| `docs/guides/<skill-name>.md` | One page per skill: purpose, example invocations, and how it chains with other skills |
| `docs/guides/README.md` | The full catalog |
| `docs/guides/configuration.md` | Every `.compound-engineering/config.yaml` option |
| `docs/guides/packs.md` | Compound Packs |
| `docs/install/upgrading.md` | Upgrading and cleaning up old installs |
| `README.md#install`, `README.md#more-install-options` | Install steps for each host |

These pages track `main` and can be newer than the user's install. When a page describes a feature their copy of the skill lacks, say an upgrade may be needed. When a page cannot be fetched, answer from the references and descriptions, include the link, and say you did not check the page.

## The recommendation

Write the reply through the `ce-noslop` skill. The rules below are what this skill adds on top.

Render every invocation for the host: default to `/skill-name`, and use `$skill-name` only when the host is Codex or documents dollar-prefixed invocation. On oh-my-pi (`omp`), use `/skill:<name>` for a manual-only skill and the default form otherwise. On Devin, use `/compound-engineering:<skill>`. Print one form only.

Open with the recommendation and the reason it fits this situation. Follow with one ready-to-run command in a code block when there is a command to run, or one for each option when the choice is the user's preference, filled in with their details: their goal and how to tell it is done, not a list of steps, since the skill brings its own. On a command that builds or fixes something, use a placeholder for a done check they have not given. Other commands need no done check. End with the link to the page that backs it. Leave out findings about the checkout that do not change what they should do. Show the whole map only when they ask for it.
