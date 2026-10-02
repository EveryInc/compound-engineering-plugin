---
title: "A hook that acts on a repo config file states the full path, the script that decides, and where to run it"
date: 2026-10-01
category: skill-design
module: skills
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A skill step acts only when a file under a hidden directory carries a key"
  - "A bundled script owns a decision the agent could also read off a config file by eye"
  - "A fresh-agent eval passes on Claude and fails on Codex with a correct-looking answer"
  - "Grading a cell whose declared answer can be right when the skill's route was skipped"
tags:
  - skill-authoring
  - skill-eval
  - cross-model
  - codex
  - hidden-directory
  - bundled-script
---

# A hook that acts on a repo config file states the full path, the script that decides, and where to run it

## Context

The model role map added a short hook to ten skill steps. The hook says: when the repo's CE config carries a `model_roles:` key, read a shared reference and run a bundled resolver for this step's role. The resolver owns layering between the personal and team files, entry validation, and the review egress policy.

Fresh-agent eval cells (`tests/skill-eval-cell/`) ran the same checkpoint on Claude, Codex, and Cursor. Neither Claude nor Cursor failed a cell for any reason below. Codex failed four different ways across the wording changes, and each failure was a fact the hook had left for the agent to work out:

1. **Which file.** The hook named the files as "`.compound-engineering/config.local.yaml` or `config.yaml`". One Codex run looped over `.compound-engineering/config.local.yaml` and `config.yaml`, so it looked for the second file at the repo root.
2. **How to find it.** Two Codex runs listed files with `rg --files -g 'config.yaml'`. That search skips hidden directories, so it printed nothing, and the agent reported that no CE config existed. The step then ran on the session model and printed no `Model role` line. The user's map was ignored with nothing said.
3. **Who decides.** After the hook gave both full paths, Codex found the config in every cell. In 4 of 20 cells with an entry it then read the entry itself and never opened the reference or ran the resolver. Its answers were right because the fixtures held one simple entry. In a later cell, one of the two in item 4, the resolver could not start and Codex read the entry by eye: it reported `claude-ce-eval-5` for an entry that says `claude-ce-eval-a`.
4. **Where to run it.** After the hook said to run the resolver, Codex ran it from the skill directory in 2 of 20 cells. The resolver reads the config of the repository it runs in. In one cell it found no repository there and answered `unset` with the warning `not inside a git repository; no CE config to read` (`skills/ce-setup/scripts/model-role-resolve.py:412`), and Codex trusted that answer over the file it had just read. In the other cell the command failed to start.

A fifth slip went the other way. Once the hook stressed that the resolver decides, Codex ran the resolver on a checkout with no map in 2 of 16 cells. The result was harmless, but the step is meant to cost nothing when no map exists.

## Guidance

A hook that conditions a step on a repo file gives the agent four facts in this order. The current wording is in `skills/ce-plan/references/reasoning-elevation.md:17`, and the same sentence shape is used at the other nine sites.

1. **The full path of every file, and that it is opened by path.** Write `.compound-engineering/config.local.yaml` and `.compound-engineering/config.yaml`, never the directory once and a bare file name after it. Say why: a file search skips that hidden directory.
2. **The skip, before the action.** State the case where nothing happens first, and name what is skipped: do not read the reference, do not run its script, print nothing.
3. **The action, naming the script as the thing to run.** "Run its resolver for the `plan` role" rather than "resolve the `plan` role". An agent that has just read the file treats "resolve" as already done.
4. **Who decides.** One sentence: the resolver's answer decides the role, and the agent's own reading of the entry does not.

The reference that carries the script's command states where to run it. `skills/ce-plan/references/model-roles.md:13` says to run the resolver with the project as the working directory, because it reads the config of the repository it runs in.

Grade the route as well as the answer. A cell that only checks the declared model passes when the agent read the entry by eye. The cells that exposed the third failure declare a required read with `files_read_post` (`tests/skill-eval-cell/catalog.ts`, graded in `tests/skill-eval-cell/grade.ts:275`), and their matching no-map cells forbid the resolver in `ACTIONS`. The pair fails in both directions: the route skipped when a map exists, and the route taken when none does.

## Why This Matters

Each omission produced a silent failure. The user configures a model, the step runs on a different one, and no line in the output says so. A wrong answer from a hand-read entry is worse on a review role, where the resolver also applies `cross_model_review_mode` and `CROSS_MODEL_PEERS` to decide which providers may receive the reviewed content.

The failures are invisible on the authoring model. Claude followed the first wording in every cell, so an eval run on Claude alone would have shipped it. They are also invisible to a grade that reads only the declared answer, because simple fixtures make a shortcut look correct.

Fixing one omission exposed the next. Telling the agent where the files are made it open them, and having opened them it stopped needing the script. Telling it the script decides made it run the script in cases that should skip. A hook like this is settled only when a round passes in both directions on the weaker host. The final wording has one such round, so the last row of the table below is thin evidence.

## When to Apply

- Writing or reviewing a skill step that reads a file under a dot-directory.
- Adding a bundled script that reads repo state the agent can also see.
- Choosing what an eval cell declares and grades for a step with a bundled script.

The shared `ce-config-layers` block still appears in eleven files across ten skills, and its first bullet names the files as "`<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml`" (for example `skills/ce-brainstorm/SKILL.md`). That is the wording of the first failure above. It was not changed with the model role map.

## Examples

Before, the first wording of the hook:

```text
**Model role.** When either repo CE config file (`.compound-engineering/config.local.yaml`
or `config.yaml`) carries an active `model_roles:` key, read `references/model-roles.md`
now and resolve the `plan` role before reading the per-skill key. With no such key, skip
this and print nothing about model roles.
```

After:

```text
**Model role.** Open `.compound-engineering/config.local.yaml` and
`.compound-engineering/config.yaml` at the repo root by path, because a file search skips
that hidden directory. When neither has an active `model_roles:` key, skip this: do not
read `references/model-roles.md` or run its resolver, and print nothing about model roles.
When either has the key, read `references/model-roles.md` now and run its resolver for
the `plan` role before reading the per-skill key. The resolver's answer decides the role;
your own reading of the entry does not.
```

Codex results by hook wording, counted over the graded Codex cells of each round:

| Hook wording | Config not found | Reference and resolver skipped | Resolver run with no map | Resolver run from the skill directory |
|---|---|---|---|---|
| Directory once, bare `config.yaml` after it | 2 of 9 | not reached | 0 | 0 |
| Both full paths, opened by path | 0 of 36 | 4 of 20 | 0 of 16 | 0 |
| Plus "run its resolver" and "the resolver's answer decides" | 0 of 38 | 0 of 20 | 2 of 16 | 2 of 20 |
| Skip stated first, and the reference says to run from the project | 0 of 19 | 0 of 10 | 0 of 8 | 0 of 10 |

The first row is one partial round, the next two rows are two rounds each, and the last row is one round. Over the same rounds Claude passed 111 of 112 cells, and its one miss was an answer-format slip in a new cell. Cursor passed 58 of 58 over three rounds, the first of which ran before the bare file name was fixed.

## Related

- `docs/solutions/skill-design/strong-models-mask-defensive-skill-fixes.md`: the authoring model passing is not evidence the prose is sufficient.
- `docs/solutions/skill-design/authored-eval-corpora-contain-the-happy-path.md`: simple fixtures made the shortcut answers look right.
- `docs/solutions/skill-design/paired-old-vs-new-injection-skill-evals.md`: the eval method these cells use.
- `docs/solutions/skill-design/bundled-script-path-resolution-across-harnesses.md`: how a skill names the script it runs.
- `docs/solutions/skill-design/new-knowledge-source-re-derives-persona-gate-and-route.md`: the same review found the `code-review` role hooked into a reference only the full review path reads, as that learning predicts.
- `docs/solutions/skill-design/portable-agent-skill-authoring.md`: the standard these hooks follow.
