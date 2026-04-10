---
name: ce:user-scenarios
description: "Spawn user personas to evaluate a feature from distinct user perspectives. Use when exploring how real users would interact with a feature — at concept, planning, implementation, or presentation stages."
---

# User Scenario Evaluation

Spawns user personas in parallel to evaluate a feature from distinct user perspectives. Each persona produces a narrative walkthrough grounded in their unique habits, frustrations, and expectations. A synthesis pass distills the narratives into actionable items.

## Interaction Method

Use the platform's question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for the user's reply before proceeding.

## Step 1: Parse arguments

Parse the input for:
- **Stage** — one of `concept`, `plan`, `implementation`, `presentation`. Look for `stage:<value>` in the args. If not provided, infer from context or ask.
- **Plan path** — look for `plan:<path>` in the args. Used for `plan` and `implementation` stages.
- **Feature description** — any remaining text after extracting stage and plan args.

If no stage is specified, use these heuristics:
- If a plan path is provided and the plan has unchecked implementation units, use `plan`
- If a plan path is provided and all units are checked, use `implementation`
- Otherwise, use `concept`

## Step 2: Locate plugin and discover personas

Find the plugin's install location:

```bash
PLUGIN_DIR=$(find "$HOME/.claude" "$HOME/.claude-"* -path "*/compound-engineering/*/agents/user" -type d 2>/dev/null | head -1 | sed 's|/agents/user$||')
```

Fall back to relative path if not found:

```bash
PLUGIN_DIR="${PLUGIN_DIR:-plugins/compound-engineering}"
```

Read all `.md` files from `$PLUGIN_DIR/agents/user/` using the native file-search/glob tool (e.g., Glob in Claude Code). Skip files starting with underscore.

If no persona files are found:
- Report: "No user personas found in agents/user/. Run /ce:refresh to sync personas from configured sources."
- Exit.

## Step 3: Build feature context

Assemble the feature context based on the stage:

**concept stage:**
- Use the feature description from args
- If a brainstorm/requirements document exists in `docs/brainstorms/`, read the most recent relevant one and include it

**plan stage:**
- Read the plan file at the provided path
- Include the plan's overview, problem frame, requirements, and implementation units

**implementation stage:**
- Read the plan file at the provided path
- Include the plan content plus a summary of what was built
- If there is a recent git diff or commit log showing the implementation, summarize the changes at a user-facing level (not code-level)

**presentation stage:**
- Read the plan file at the provided path
- Include everything from the implementation stage
- Frame as a final review before rollout

## Step 4: Spawn persona agents

Read `references/user-subagent-template.md` for the prompt template and stage framing blocks.

For each persona file discovered in Step 2:

1. Read the persona file content
2. Select the stage framing block matching the current stage
3. Construct the sub-agent prompt by filling template variables:
   - `{persona_file}` -- the full persona markdown content
   - `{stage_framing}` -- the stage-specific framing block
   - `{feature_context}` -- the assembled feature context from Step 3
4. Spawn a sub-agent with `model: haiku` using the constructed prompt

Spawn all persona agents in parallel. If parallel dispatch is not supported, spawn sequentially.

Wait for all agents to complete. If an agent times out or fails, note it and continue with the responses received.

## Step 5: Present individual narratives

Present each persona's narrative response under a clear heading:

```markdown
---

## Nancy's Experience

[Nancy's full narrative response]

---

## Dorry's Critique

[Dorry's full narrative response]

---
```

Present the narratives in a consistent order. Do not summarize, truncate, or paraphrase the persona responses — show them in full. Each persona has a distinct voice that is part of the value.

## Step 6: Synthesize

After presenting the individual narratives, produce a synthesis section that distills actionable items from all personas.

### Synthesis Structure

```markdown
## Synthesis: User Scenario Findings

### Common Themes
[Issues or observations that multiple personas raised — these are high-confidence findings]

### Unique Perspectives
[Issues only one persona raised but that represent a real concern for their user type]

### Acceptance Test Scenarios
[Concrete test scenarios derived from persona narratives. Each should specify: starting point, user action sequence, expected outcome. These are ready to translate into system tests.]

- Scenario: [Name]
  - Start: [Where the user begins]
  - Steps: [What they do]
  - Expected: [What should happen]
  - Source: [Which persona(s) surfaced this]

### UX Gaps
[Usability problems identified — missing labels, broken navigation, confusing flows, missing confirmations]

### Design Issues
[Visual and design coherence problems — primarily from Dorry but validated against other personas' experiences]

### Missing Features
[Capabilities personas expected but that don't exist in the current concept/plan/implementation]

### Risk Items
[Things that could cause users to abandon the feature entirely]
```

### Synthesis Guidelines

- Weight common themes higher than individual findings — if Nancy, Chuck, and Betty all hit the same problem, it is critical
- Acceptance test scenarios should be specific enough to translate directly into system tests (Capybara, Playwright, etc.)
- Distinguish between "nice to have" improvements and blocking issues
- For the `concept` stage, focus the synthesis on scenario coverage and design gaps
- For the `plan` stage, focus on unresolved questions and missing scenarios
- For the `implementation` stage, focus on acceptance test gaps and UX issues
- For the `presentation` stage, focus on overall readiness and launch risks

## Pipeline Mode

When invoked from an automated workflow (orchestrator phase), skip interactive questions. Use the stage and context provided in args. Present narratives and synthesis without asking for approval to proceed.
