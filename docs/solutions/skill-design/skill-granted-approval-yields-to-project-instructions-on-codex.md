---
title: "A skill cannot grant approval that a project's ask-first instruction withholds on Codex"
date: 2026-10-26
category: skill-design
module: skills/lfg
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A skill tries to treat its own invocation as the user's approval for something a project instruction file says to ask about first"
  - "An unattended or orchestrating skill must not stall on, or silently drop, a step the project gates behind asking the user"
  - "Deciding whether a cross-host skill change can be expected to behave the same on Claude and Codex"
  - "Evaluating a skill step that drives a browser when no real browser driver is installed"
tags:
  - authority
  - instruction-precedence
  - agents-md
  - cross-host
  - unattended-runs
  - lfg
  - ce-test-browser
  - skill-eval
  - fixture-design
related_components:
  - testing_framework
---

# A skill cannot grant approval that a project's ask-first instruction withholds on Codex

## Context

`lfg` runs hands-off, often from a scheduler or another orchestrator. Its step 8 invokes `ce-test-browser` with `mode:pipeline`, which never asks a question (`skills/ce-test-browser/references/pipeline-orchestration.md:3`). Some projects' instruction files say "Always ask the user before running browser tests or starting the dev server." Baseline evals against a throwaway web app showed two failures with that rule in `AGENTS.md`/`CLAUDE.md`:

- **Claude** (`claude -p`) skipped the browser tests and still output `<promise>DONE</promise>`. The proof the plan asked for was missing, and the final message read as a completion.
- **Codex** (`codex exec`) ended on `GATE: Step 8 needs approval. May I start the dev server and run browser tests?`, which stalls an unattended run.

With no such rule, both hosts ran the browser tests.

The fix added a section to `skills/lfg/references/task-visibility.md` (lines 11-17). It says invoking `lfg` is the user's approval, given in advance, for the verification the change needs. Project rules about *how* to test still apply. The approval does not extend past that verification, and it never answers a harness approval prompt. This applies the authoring guide's rule that invocation may satisfy a default confirmation within a bounded envelope (`docs/solutions/skill-design/portable-agent-skill-authoring.md`, "Make authority proportional to risk").

## Guidance

**On Claude, a skill's in-envelope grant works.** After the change, Claude ran the browser tests under the ask-first rule. With the how-to rule also present (`NOTES_DATA=demo PORT=<port> npm run dev`), the fixture server's log showed only demo-data requests. The recap said why it had not asked.

**On Codex, it does not, and wording and placement don't change that.** Codex stopped to ask in all six post-change trials of the ask-first scenarios:

| Variant | Codex result |
|---|---|
| Grant in the reference, worded as permission (2 trials: ask-first, ask-first + how-to) | Stopped: project instructions take precedence "over the skill's unattended-testing rule" |
| Grant reworded as compliance: "that approval has already been given… This follows the instruction rather than overriding it" (2 trials) | Stopped: "The supplied skill treats `lfg` as approval, but your explicit instruction takes precedence." |
| Same, plus a sentence in `SKILL.md`'s Interaction paragraph (2 probe trials, ask-first only; the probe edit was not kept) | Stopped: "That takes precedence over the skill's assumption that invoking lfg grants approval." |

A second round varied the rule itself (two post-change Codex trials each unless noted):

| Rule | Codex result |
|---|---|
| "Prefer to check with the user before running browser tests…" | Ran the tests, DONE (2/2). It did the same before the change (1 trial), so a preference never blocked it. |
| "Ask the user before running browser tests…" without "do not … without explicit approval" | Stopped to ask (2/2) |
| The firm rule only in the user-level `$CODEX_HOME/AGENTS.md`, nothing in the project | Stopped to ask (2/2): "your explicit instruction takes precedence" |
| "Leave browser testing to the user. Don't run browser tests yourself" | Skipped the tests and **reported DONE** (2/2), and did the same before the change (1 trial) |

Claude ran the tests under every rule tried, including "leave browser testing to the user".

Codex ranks project and user instruction files above anything a skill says, and it reads any explicit "ask" or "leave it to the user" as a prohibition the skill cannot lift. Only a stated preference leaves room. That fits the guide's own boundary: invocation "does not override system, organization, or user prohibitions." The difference is in which party treats an ask-first rule as a prohibition. Claude treats it as a default confirmation the invocation can satisfy. Codex treats it as a prohibition.

So design for both outcomes:

1. State the grant once, bounded, at the layer that owns the authority (the orchestrating skill). Don't escalate wording or duplicate it into more places to win on Codex; neither changed the result.
2. Make the refusal path an explicit stop. On Codex the useful outcome is a clean stop, not DONE with the check silently dropped. The "ask" rules already produced a stop. The "leave it to the user" rule did not, until `task-visibility.md:17` said that a refused verification the change needs stops the run instead of reporting DONE. After that, Codex stopped in both trials ("Stopped at step 8: browser verification is blocked by your project instruction…"). `lfg`'s stop rule (`task-visibility.md:9`) shapes that message: the stop, the blocker, then the decision with the recommended option first.
3. Record the host split in the change's PR and eval notes as a known limit, not as a passing cell.
4. Draw the grant's own line between handing a step to the user and banning the method. "Ask first" and "leave testing to the user" give the decision or the step to the user, and invoking the skill answers that. "Never run browser tests in this repo" bans the method no matter who runs it, and no invocation should answer that. `task-visibility.md:17` treats such a ban as a refusal. With "Never run browser tests or start the dev server in this repository.", both hosts stopped at step 8 in both trials, and Claude still ran the tests under "leave testing to the user". The line came from a review finding that "invocation does not override user prohibitions" should be enforced by the skill, not left to each host's ranking.
5. Keep the refusal rule from swallowing ordinary unavailability. A method that cannot run because a tool is missing is not a refusal. With no browser driver installed and no rule, both hosts still finished with DONE and said in the recap that the browser check did not run.

## Why This Matters

Without this record, the next attempt to make an unattended skill "just run the tests" will repeat the same loop. It will strengthen the wording, move it into `SKILL.md`, and re-eval Codex. Six trials say that loop doesn't converge. The opposite mistake is also tempting: concluding from a Claude-only eval that the grant works everywhere and shipping a change described as fixing unattended testing.

## When to Apply

- Any skill whose job implies an action that a project instruction file may gate behind asking: running the app, simulators, browser automation, screenshots, network calls.
- Any cross-host claim that a skill's authority envelope overrides a project-level "ask first" or "never do X without approval."

## Examples

**Eval technique for a browser-driving step without a browser.** The cell driver passes `PATH` through to the host CLI, so a fake driver can stand in for a real one:

- Put a fake `agent-browser` first on `PATH` that appends every call (cwd and args) to a log file outside the workspace. Have it fetch real URLs with `curl`, so the fixture server is actually hit. Its `click` must follow the link's `href`. A fake whose clicks do nothing made one Codex control run stop on a false navigation failure.
- Give the fixture app a server that appends each request and its dataset to a gitignored file in the workspace (`.eval/server.log`). Grade on driver calls, server requests, and the dataset value, not on what the agent narrates. Narration said "tests passed" in runs where nothing ran.
- Start the eval at the step under test ("steps 1-7 are already done… continue this lfg run from step 8 to its end"), with the plan file and feature branch committed in the fixture. That keeps a full-pipeline cell cheap enough to run on both hosts and both arms.
- Make `CLAUDE.md` a regular file, not a symlink to `AGENTS.md`. The cell's fixture copy rewrote the symlink to an absolute path, which showed up as a pre-existing dirty file the run then reported.
- Launch each cell as its own `nohup … < /dev/null` process. A backgrounded script that ran several cells with `&` and `wait` got SIGINT (exit 130), and every Codex cell was lost before it produced output.

The general pattern of a logging fake executable on `PATH` is in `paired-old-vs-new-injection-skill-evals.md`. This doc adds the browser-step specifics.
