---
name: ce-dream
description: "Recurring consolidation of a knowledge folder: triage the inbox, merge duplicate sources, promote notes to learnings, flag stale learnings, surface conflicts between learnings with both sides shown, and propose pack-rule candidates only for learnings with cited evidence. Proposals by default; applies only moves the layout's git field allow-lists. Idempotent and lease-guarded so a harness scheduler can run it unattended (mode:non-interactive)."
disable-model-invocation: true
argument-hint: "[mode:non-interactive]"
---

# /ce-dream

**Outcome:** the folder's knowledge is one pass more consolidated, and a dated dream report under the `memory` role says what changed, what should change, and where the folder disagrees with itself.

**Done:** the report exists at `<memory>/dreams/<date>.md`; every conflict found lists both sides and which artifact each side lives in; every allow-listed move was applied and everything else appears as a proposal; the state file records the run and the folder fingerprint; the lease is released.

**Safe failure:** proposals only. A run that cannot acquire the lease, cannot validate the layout, or hits its per-run cap writes the report it can (or nothing plus the reason) and moves no file.

## Layout

<!-- ce-knowledge-layout:start -->
**Resolve the knowledge layout before filing, moving, or promoting any knowledge artifact.**

- **Read** the `knowledge:` block from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`); `config.local.yaml` never supplies it. Absent -> no layout: do not guess a folder. Say the layout is unset and that `ce-setup` (its `knowledge` argument) writes it, then stop the filing step.
- **Validate** a present block: `layout` names the template it was expanded from; `roles` is a mapping whose keys come from `inbox, sources, ideas, themes, projects, notes, learnings, writing, memory, scratch, archive, templates` and that sets at least `inbox`, `learnings`, and `memory`; every role `path` is a relative path that stays under `root` (default `.`); `git.mode` is one of `none | commit | commit+push`; `index` is `none`. Anything else -> stop with an error naming the key and the value; never fall back to a default folder.
- **Use** the block as the sole answer to "where does this go": a role's `path` (joined under `root`, placeholders such as `{id:03d}` and `{slug}` filled) and its `filename` pattern decide the location; the role's `types`, `frontmatter.required`, and `frontmatter.type_enum` decide the frontmatter, and no key outside the contract is invented. A role the block leaves unset means "do not create it, do not file there". A role with `retention: discard` or `tracked: false` is never committed. Unattended runs write, move, or commit files only under `git.allow` paths and only when `git.mode` is not `none`; everything else is a proposal for a person to apply.
<!-- ce-knowledge-layout:end -->

## Mode

`mode:non-interactive` in the arguments, or an invocation that makes unattended intent unmistakable (a scheduler, "headless", "without prompts"), means the run asks nothing and ends on one terminal line a caller can parse: `Dream complete: <report path>`, `Dream skipped: no change since <date>`, or `Dream aborted: <reason>`. Interactive runs may ask one thing: whether to apply a proposal the layout does not allow-list. Nothing else is a question.

## Idempotency and the lease

Read `references/run.md` before touching the folder; it carries the state-file subcommands and the report shape. The state file is `<memory>/state.yml`, owned entirely by the bundled script:

- **Acquire** the single-writer lease first. `LOCKED` ends the run as `aborted` with no writes. A `STALE-RECLAIMED` result is noted in the report.
- **No change, no work.** When the fingerprint of the `inbox`, `sources`, `notes`, and `learnings` roles (excluding `memory`, `scratch`, and untracked roles) equals the last completed run's, release the lease, record a `no-change` run, and end with `Dream skipped`. A second run on an unchanged folder therefore writes no new report and moves nothing.
- **Cap.** Apply at most 25 file moves or edits per run (excluding the report and state file); past the cap, the remaining work becomes proposals and the run records `partial`.
- **Record and release** on every exit path, including abort; the lease never outlives the run.

## What a pass does

Each is a condition on the folder, decided from frontmatter and content, never from filenames alone:

- **Triage the inbox.** An inbox item whose `type` is claimed by exactly one non-inbox role, and whose target path needs no `{id}` the item does not name, is a move to that role (per `promotion.inbox`). Items older than `retention.inbox_flag_after_days` are flagged. Ambiguous items are listed, not moved.
- **Merge duplicate sources.** Two source notes with the same `source_id`, or the same `source_url`/`source_file` and `source_date`, are one note: the earlier file keeps its path and authored interpretation, the later one's attributed evidence is appended, and the later file is a proposed deletion (a move only under `git.allow`).
- **Promote notes to learnings.** A note (or a set of notes on one project) that states a transferable finding with at least one cited observation or source, in the register the layout's `frontmatter` contract uses, is drafted as a `learnings`-role file with `type: learning` and the contract frontmatter, linked back to its evidence. The learning is a proposal unless `learnings` is under `git.allow`; the source notes are never rewritten. Promotion follows `promotion.notes` only; an edge the layout does not list is not taken.
- **Flag stale learnings.** A learning whose claims the current folder no longer supports is a candidate for `ce-compound-refresh`, invoked with a scope limited to that file when the harness exposes it; otherwise the report names the file and the drift. `ce-dream` never edits an existing learning.
- **Detect conflicts.** Two learnings whose prescriptions cannot both be followed, or a learning that a later decision (in a project brief, a `status`, or a newer learning) contradicts, are a conflict entry with both sides quoted briefly, both paths, and the more recent evidence identified. Neither side is promoted, moved, deleted, or narrowed by this run; a person resolves it.
- **Propose pack-rule candidates.** A learning becomes a candidate only when it cites evidence, states a standing always/never rule, and passes a held-out reuse check: the report names one case in the folder the learning was **not** derived from and states whether applying the rule there would have helped. A candidate is a report entry with the narrowest `applies_when` its evidence supports; the run never widens a scope, never writes into a pack, and never appends to `packs:` in config.

## Write authority

`git.mode: none` (the default in every template but `kieran`) means every move above is a proposal in the report; the report itself and the state file are always written, since the `memory` role is the run's own. A non-`none` mode with a matching `git.allow` entry lets the run apply moves under those paths and commit the explicit list of files it changed (push only under `commit+push`), with the report path in the message and nothing unrelated staged. A file under a `tracked: false` or `retention: discard` role is never read as evidence and never committed.

## Report

The report shape is in `references/run.md`. It ends with the terminal line above, after the lease is released.
