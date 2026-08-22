# Work Intake

Read this when Phase 0 classifies a bare prompt, and again at Phase 1 before reading a plan or building the task list. Phase 0 owns input classification and the engine-resolution gate; this file supplies what those steps read.

## Bare-prompt scan and routing

**Scan the work area**

- Identify files likely to change based on the prompt
- Find existing test files for those areas (search for test/spec files that import, reference, or share names with the implementation files)
- Note local patterns and conventions in the affected areas

**Assess complexity and route**

| Complexity | Signals | Action |
|-----------|---------|--------|
| **Trivial** | 1-2 files, no behavioral change (typo, config, rename) | Proceed to Phase 1 step 2 (environment setup) and implement directly under the body's Trivial rule. Apply Test Discovery if the change touches behavior-bearing code |
| **Small / Medium** | Clear scope, under ~10 files | Build a task list from discovery. Proceed to Phase 1 step 2 |
| **Large** | Cross-cutting, architectural decisions, 10+ files, touches auth/payments/migrations | Unless `ce-plan` already sized this prompt in this session, inform the user this would benefit from `ce-brainstorm` or `ce-plan` to surface edge cases and scope boundaries, and honor their choice. When proceeding, build a task list and continue to Phase 1 step 2; when implementation surfaces a decision the user would weigh, stop before the write and ask or return the finding |

## Read the plan and clarify

- For unified plans, size your read. A short plan (lightweight or requirements-only, a screen or two) can be read in full. For a long implementation-ready plan, do **not** read the whole document first — it is expensive and unnecessary. Build a section map, then read only what the active unit needs: metadata, then `Goal Capsule`, `Verification Contract`, `Definition of Done`, the `Implementation Units` heading list, and only the active U-ID section plus referenced R/F/AE/KTD excerpts and any Product Contract Key Decision whose `Governs R…` links name those Rs (that reverse link is how a product decision's `session-settled:` label reaches you). Read appendices or unrelated U-IDs only when the active unit cites them. To build the map: in **markdown** scan headings (`rg -n '^#{1,3} ' <plan>` — top-level sections plus `### U<N>.` units); in **HTML** scan the `<h1>`–`<h3>` heading elements and their anchor ids. Match on the stable section names / unit IDs (`Goal Capsule`, `Verification Contract`, `### U<N>.`, …), ignoring HTML wrapper tags — not on a format-specific pattern.
- For legacy plans, read the work document completely. Both formats (`.md`, `.html`) carry the same section names and IDs; HTML just wraps them in semantic elements (`<section>`, `<article>`, etc.).
- If the plan includes sections such as `Implementation Units`, `Work Breakdown`, `Requirements` (or legacy `Requirements Trace`), `Files`, `Test Scenarios`, or `Verification`, use those as the primary source material for execution
- Check for `Execution note` on each implementation unit — these carry the plan's natural-language execution direction for that unit (for example, start from failing proof, characterize legacy behavior, or prefer smoke/runtime verification). Note them when creating tasks, but do not reduce them to keyword matching.
- Check for a `Deferred to Implementation` or `Implementation-Time Unknowns` section — these are questions the planner intentionally left for you to resolve during execution. Note them before starting so they inform your approach rather than surprising you mid-task
- Check for a `Scope Boundaries` section — these are explicit non-goals. Refer back to them if implementation starts pulling you toward adjacent work
- Review any references or links provided in the plan
- If the user explicitly asks for TDD, test-first, characterization-first execution, or a specific verification style in this session, honor that direction even if the plan has no `Execution note`
- If anything is unclear or ambiguous, ask clarifying questions now
- If clarifying questions were needed above, get user approval on the resolved answers. If no clarifications were needed, proceed without a separate approval step — plan scope is the plan's authority, not something to renegotiate
- **Do not skip this** - better to ask questions now than build the wrong thing

## Create the task list

- Use the platform's task-tracking capability when available (`TaskCreate`/`TaskUpdate`/`TaskList` in Claude Code, `update_plan` in Codex, or the equivalent on other harnesses) to break the plan into actionable tasks. If none is available, continue normally without simulating a task list in chat
- Derive tasks from the plan's implementation units, dependencies, files, test targets, and verification criteria
- When the plan defines U-IDs for Implementation Units, name each task from a brief, outcome-led form of the unit's Goal and append the stable U-ID (e.g., "Add parser coverage (U3)"). Never use a bare U-ID or lead with the identifier; the user should understand the work before the traceability label. Aim for five words or fewer before the ID
- When the full unit list is visible, do not repeat ordinal counts such as "unit 1 of 5" in every task. Add an ordinal only when the harness exposes the current task without the surrounding list and the count materially improves orientation
- Carry each unit's `Execution note` into the task when present
- For each unit, read the `Patterns to follow` field before implementing — these point to specific files or conventions to mirror
- Use each unit's `Verification` field as the primary "done" signal for that task
- Do not expect the plan to contain implementation code, micro-step TDD instructions, or exact shell commands
- Include dependencies between tasks
- Prioritize based on what needs to be done first
- Include testing and quality check tasks
- Keep tasks specific and completable

## Do not re-scope the plan into human-time phases

The plan's Implementation Units define the scope of execution. Do not estimate human-hours per unit, propose multi-day breakdowns, or ask the user to pick a subset of units for "this session". Agents execute at agent speed, and context-window pressure is addressed by subagent dispatch (Phase 1 Step 4), not by phased sessions. If a plan-file input is genuinely too large for a single execution, say so plainly and suggest the user return to `ce-plan` to reduce scope -- don't invent session phases as a workaround. For bare-prompt input, Phase 0's Large routing already handles oversized work.
