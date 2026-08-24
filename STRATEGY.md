---
name: Compound Engineering
last_updated: 2026-08-24
---

# Compound Engineering Strategy

Compound Engineering is an open-source plugin of agent skills, installed into the coding agent a
developer already uses and run against their own repo.

## Purpose

A developer working through coding agents earns hard-won knowledge every session, and it scatters —
across sessions, across harnesses, with no way to compound it — while output outruns the judgment
available to check it. Capable models don't fix this on their own: left to themselves they plan
thinly, review shallowly, and write nothing down, and the practices that would correct that are hard
to apply consistently and decay as the models and harnesses underneath them move.

## Positioning

We believe knowledge from agents and humans should compound, so that each unit of work is easier than
the last. Our core skills make that happen by imposing an opinionated workflow — plan, build, review,
then capture what was learned where the next run will read it — rather than leaving those steps to
whatever the agent would do on its own. Around that core we ship additional skills that make everyday
software engineering easier, and we keep all of them working as models and harnesses change.

## Users

**Primary:** Agent-first developers who work across more than one harness and model. They're hiring
this plugin so the knowledge from each session lands in their repo instead of a transcript, and so
one workflow travels with them — free to pick whichever host and model they want without losing what
they've built up.

## Boundaries

- No telemetry, ever. The plugin installs into private codebases; shipping no analytics is part of
  what makes it safe to install, and operating blind is a cost we accept deliberately.
- Host support is curated, not exhaustive. We follow developers to harnesses with real adoption and
  real skill/plugin support, and we have said no — to niche hosts, and to hosts whose limitations
  would degrade the skills.
- Open source, and not monetized directly. Nothing is built here to be sold behind it.

_Resist a change when:_ it doesn't fit the sequence our skills form as a workflow, or it can't
materially justify its usefulness against what the host already does on its own.

## Key metrics

We ship no product analytics by choice, so these are signals we watch, not measurements. Adoption and
effectiveness inside other people's repos are not observable to us, and this doc shouldn't pretend
otherwise.

- **Community feedback** — issues, discussions, and PRs from people who aren't maintainers, plus what
  people say publicly. GitHub and social; the only outside signal we have.
- **Our own compounding** — learnings written in this repo and, more importantly, reused by later
  runs. `docs/solutions/` and `ce-compound-refresh` audits.
- **Frontier currency** — whether the skills still work well on the newest models and harnesses, and
  how fast they get there after a release. Release dates against the PRs that land support.

## Tracks

### The skills that run the loop

The six core skills and the judgment they encode — brainstorm, plan, work, simplify, review, compound
— plus the on-demand skills that earn a place in that sequence.

_Why it serves the approach:_ The skills are the product; the philosophy only reaches anyone through
what they do in a session.

### Frontier re-tuning

Keeping the skills correct and current as models and harnesses move: evals, cross-model review,
portability and prompt-budget limits, re-authoring prose for new model generations.

_Why it serves the approach:_ An installed skill that was tuned for last year's model quietly stops
earning its place, and a skill pack is only worth installing if it tracks the frontier.

### The knowledge substrate

How learnings get written into the user's repo, retrieved, refreshed, and kept from rotting — the
store itself, not the skills that fill it.

_Why it serves the approach:_ Compounding is the commitment, and the substrate is where it either
happens or quietly doesn't.

<!-- Host reach — native manifests, the converter CLI, per-host specs — is maintenance the three
     tracks depend on, not a fourth track. -->
