---
name: ce-experiment
description: Turn an idea into a numbered experiment in the knowledge folder (a brief in the layout's projects role), give it a measurable loop through `ce-optimize`, log each run as a dated note, and draft the end-of-cycle learning from brief, notes, and dream reports. Use when the user wants to start, run, log, or write up an experiment; requires a `knowledge:` layout in config.
argument-hint: "[start <idea or path> | log <experiment> | write-up <experiment>]"
---

# /ce-experiment

**Outcome:** one experiment with a home the layout assigned, a brief that states the question and the appetite, a measurement loop the folder can rerun, run notes that record dead ends as well as wins, and -- when asked -- a written learning drafted from the evidence.

**Done (per request):** `start` leaves a brief at the `projects` role with contract frontmatter and an `ce-optimize` spec beside it; `log` leaves one dated note in the `notes` role for the run; `write-up` leaves a draft at the `writing` role citing brief, notes, and any dream report. Nothing is claimed as a result that the notes do not show.

**Safe failure:** the brief alone. A missing `projects` role, an idea too vague to state a question, or an unavailable `ce-optimize` ends with the brief (or nothing plus the reason), never with a folder created under a guessed path.

## Layout

<!-- ce-knowledge-layout:start -->
**Resolve the knowledge layout before filing, moving, or promoting any knowledge artifact.**

- **Read** the `knowledge:` block from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`); `config.local.yaml` never supplies it. Absent -> no layout: do not guess a folder. Say the layout is unset and that `ce-setup` (its `knowledge` argument) writes it, then stop the filing step.
- **Validate** a present block: `layout` names the template it was expanded from; `roles` is a mapping whose keys come from `inbox, sources, ideas, themes, projects, notes, learnings, writing, memory, scratch, archive, templates` and that sets at least `inbox`, `learnings`, and `memory`; every role `path` is a relative path that stays under `root` (default `.`); `git.mode` is one of `none | commit | commit+push`; `index` is `none`. Anything else -> stop with an error naming the key and the value; never fall back to a default folder.
- **Use** the block as the sole answer to "where does this go": a role's `path` (joined under `root`, placeholders such as `{id:03d}` and `{slug}` filled) and its `filename` pattern decide the location; the role's `types`, `frontmatter.required`, and `frontmatter.type_enum` decide the frontmatter, and no key outside the contract is invented. A role the block leaves unset means "do not create it, do not file there". A role with `retention: discard` or `tracked: false` is never committed. Unattended runs write, move, or commit files only under `git.allow` paths and only when `git.mode` is not `none`; everything else is a proposal for a person to apply.
<!-- ce-knowledge-layout:end -->

`ce-experiment` needs the `projects` role; `notes` and `writing` are needed by `log` and `write-up`. A request whose role is unset stops with that fact.

## Identity

The `projects` path's `{id}` follows `id_scheme`: `sequential` takes the next integer after the highest existing project folder and never reuses or renumbers one; `date` uses today's ISO date; `johnny-decimal` takes the next unused decimal inside the category the path names; `none` uses the `{slug}` alone. `{slug}` is kebab-case from the brief's title. An existing experiment named in the request (by id, slug, or path) is reused, never duplicated.

## Start

The brief goes at the `projects` role's path with its `filename` (e.g. `README.md`). Its shape comes from the folder first: a `templates` role containing an experiment template (a file whose frontmatter `type` is `template` and whose title names an experiment or brief) is used as-is; otherwise `assets/experiment-brief.md` in this skill's directory. Frontmatter is the layout contract with `type` set to the value the `projects` role's `types` lists, plus the keys the template itself carries (typically `id`, `week`, `status: planned`); nothing else. The brief states the question, the problem, the intended approach, the appetite, and what would count as a result -- an idea note or `ce-brainstorm` plan the request points at supplies these; when the request supplies none and none exist, ask for the question and appetite only.

The measurement loop is `ce-optimize`'s: invoke it to create a spec beside the brief with a metric the brief names -- a rubric scored against a fixed case set, or a `ce-pov` panel verdict when the outcome is a judgment -- and a baseline. `ce-optimize` owns the spec's shape and commands; this skill hands it the target, the metric, and the folder. If `ce-optimize` is unavailable in the harness, the brief records the intended metric and baseline under a "Measurement" heading and the run ends there.

## Log

One note per run, at the `notes` role's path for this experiment with its `filename` pattern (`{slug}` from what the run tried), `type` from the `notes` role's `types`, and the contract frontmatter plus an `experiment` key naming the brief when the layout lists that key. The body records what was tried, the metric before and after (from `ce-optimize`'s record when it ran), and what it means -- a dead end is logged as a dead end, not deleted or omitted. `status` in the brief is updated only to a value the brief's template uses.

## Write-up

The draft goes at the `writing` role's path with its `filename` (e.g. `learning.md`), `type` from that role's `types` (e.g. `weekly-learning`). A `templates` role holding a weekly-learning or write-up template wins over free form. Evidence is the brief, every note under the experiment, and the latest dream report under `memory/dreams/` that mentions the experiment; every claim in the draft points at one of them, and a result the notes do not show is stated as not reached. When a writing-review capability is available in the harness (a skill or tool that reviews prose for structure and register), hand the draft to it by that capability, never by a hardcoded tool name; publishing or sending the draft anywhere happens only when the user asks. The transferable finding, if there is one, is `ce-compound`'s to record as a `learning`: name it in the report rather than writing a second learnings file here.

## Report

Name the files written (brief, spec, note, or draft) with their roles, the experiment id, and what is still the user's: approving the appetite, running the loop, publishing the write-up, or invoking `ce-compound`.
