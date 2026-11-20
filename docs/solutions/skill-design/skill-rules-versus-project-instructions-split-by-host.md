---
title: "Whether a skill rule beats a project instruction depends on the host and on the rule's shape"
date: 2026-11-16
category: skill-design
module: skills/ce-test-browser
problem_type: design_pattern
component: tooling
severity: medium
applies_when:
  - "A user reports that a skill overrides their AGENTS.md or CLAUDE.md policy"
  - "Deciding whether a skill needs an explicit standing-instruction exception"
  - "A skill bans a category of tool (an MCP, an extension, a library) that a project may name on purpose"
  - "Adding an exception to a rule that both SKILL.md and a reference state"
tags:
  - instruction-precedence
  - agents-md
  - cross-host
  - standing-instructions
  - ce-test-browser
  - ce-commit
  - skill-eval
---

# Whether a skill rule beats a project instruction depends on the host and on the rule's shape

## Context

Issue #2071 reported that five skills (ce-commit, ce-debug, ce-worktree, ce-test-browser, ce-dogfood) override a user's standing policy: commit on local `main`, never push, and use a named browser MCP for UI testing. Fresh-agent evals ran each skill before and after the fix on Claude (`claude -p`), Codex (`codex exec`), and Grok (`grok -p`). One trial ran per host per arm. The fixture's `AGENTS.md` carried the policy. Results for the skills before the fix:

| Skill rule before the fix | Project instruction | Claude | Codex | Grok |
|---|---|---|---|---|
| ce-commit: "on the default branch ... create a feature branch ... Do not ask" | "commit directly on local `main`. Do not create feature branches" | Stayed on `main` | Stayed on `main` | **Created a branch** |
| ce-work: commit on the default branch only when "the user explicitly authorized that in this session" | same | Stayed on `main` | Stayed on `main` | not run |
| ce-debug: ship through a PR when origin can open one | "Never push" | Chose stays-local | Chose stays-local | not run |
| ce-test-browser: "Never install or substitute ... a separately configured browser extension or MCP" | "use the Playwright MCP server (`mcp__playwright__*`)" | **Chose `agent-browser`** | Chose the Playwright MCP | **Chose `agent-browser`** |

After the fix, every cell followed the project instruction, and a ce-commit control with no policy still branched on all three hosts.

ce-worktree's defect was mechanical rather than a precedence question. Its new-work base was `origin/<from-branch>`, which drops unpushed local commits. All three hosts produced that command before the fix and the local ref after it.

## Guidance

**Codex let the project instruction win every time.** That matches `skill-granted-approval-yields-to-project-instructions-on-codex.md`: Codex ranks project instruction files above skill text.

**Claude let a skill default yield but obeyed a skill ban.** "Create a branch", "ship a PR" and "only when authorized in this session" all gave way to `AGENTS.md`. The ce-test-browser ban named "a separately configured browser extension or MCP". The project's Playwright MCP is one, and Claude followed the skill.

**Grok followed the skill in both shapes.** It created a feature branch against an explicit "do not create feature branches", and it chose `agent-browser` over the named MCP.

So the explicit exception does change behavior, just not on every host. Without the Grok cells this fix looked like it only made the contract explicit for ce-commit. It fixes a reproduced defect there. The exceptions are at `skills/ce-commit/SKILL.md:36`, at `skills/ce-debug/SKILL.md:84` for the branch, at `skills/ce-debug/references/post-fix-handoff.md:44` for pushing, and at `skills/ce-test-browser/SKILL.md:20` for the driver.

Where the exception sits matters for a ban. `skills/ce-test-browser/SKILL.md:20` states the standing-instruction case before the list that holds the ban, and says the list applies only otherwise. A literal reader still obeys a "never" that follows an exception. The ce-dogfood edit therefore says the third-stack ban applies "only when none does".

So when a user reports a skill overriding their instructions:

1. Run the pre-change skill with their instruction in a fixture `AGENTS.md` on every host CLI available. A rule that yields on two hosts can still win on the third.
2. Write the exception into the skill wherever a skill default or ban could decide against a standing instruction, and place it before any ban it qualifies.
3. Make every always-loaded copy of the rule agree. The ce-work exception went into `skills/ce-work/references/workspace-setup.md` first. `skills/ce-work/SKILL.md:34` still said "unless the user explicitly directed that in this session", and a fresh reader flagged that a literal reader obeys the body over a reference it may never load.

## Why This Matters

A two-host eval nearly recorded the ce-commit change as having no effect on behavior, because Claude and Codex already deferred to `AGENTS.md`. The third host showed the defect the issue reported. Precedence between skill text and project instructions is a property of each host, so an exception that seems redundant on one host may be the only thing deciding the outcome on another.

## When to Apply

- Triage of any report that a skill overrode a project or user instruction.
- Writing a "never use X" rule where X is a category a project might choose deliberately.
- Cross-host claims about whether a skill's rule or a project's rule wins.

## Examples

Before (`ce-test-browser`, ban with no qualification):

> 3. **Do not introduce a third browser stack.** Never install or substitute standalone Playwright, Puppeteer, a separately configured browser extension or MCP, or other ad hoc browser automation.

After (qualification first, ban scoped to the default path):

> Select the driver before the first browser action. When the user's request, memories, or the project's active instructions already in your context carry a standing instruction naming a browser driver for UI testing, that driver is the run's one driver, and the list below does not apply. ... Otherwise:

The evidence is one trial per host per arm. Treat the per-host pattern as a strong lead, not a measured rate.

## Related

- `skill-granted-approval-yields-to-project-instructions-on-codex.md`: the opposite direction, where a skill grants approval that a project instruction withholds.
- `strong-models-mask-defensive-skill-fixes.md`: why a change that passed before and after on strong models is not proof the text is inert.
- `post-menu-routing-belongs-inline.md`: decisive conditions belong in the always-loaded body.
- Issue #2071.
