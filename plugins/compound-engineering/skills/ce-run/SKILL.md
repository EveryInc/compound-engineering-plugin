---
name: ce:run
description: "Run a named orchestrator to manage a full engineering workflow. Orchestrators define which phases to execute, which reviewers to prioritize, and how to synthesize findings. Use when you want a specific workflow style — e.g., /ce:run erin for full-process PM, /ce:run max for a quick spike."
argument-hint: "<orchestrator-name> [feature description]"
---

# Run Orchestrator

Loads a named orchestrator definition and executes its workflow.

## Step 1: Parse arguments

Split `$ARGUMENTS` into:
- **Orchestrator name** — the first word (e.g., `erin`, `max`, `lfg`)
- **Feature description** — everything after the first word

If no orchestrator name is provided, list available orchestrators and ask which to use.

## Step 2: Locate plugin

Find the plugin's install location:

```bash
PLUGIN_DIR=$(find "$HOME/.claude" "$HOME/.claude-"* -path "*/compound-engineering/*/orchestrators" -type d 2>/dev/null | head -1 | sed 's|/orchestrators$||')
```

Fall back to relative path if not found:

```bash
PLUGIN_DIR="${PLUGIN_DIR:-plugins/compound-engineering}"
```

## Step 3: Load orchestrator

Look for `$PLUGIN_DIR/orchestrators/<name>.md`. If not found:

1. List available orchestrators: `ls $PLUGIN_DIR/orchestrators/*.md`
2. Show the user what's available
3. Suggest running `/ce:refresh` if no orchestrators are found

Read the orchestrator file. Parse the YAML frontmatter for structured data (phases, review-preferences, synthesis) and the markdown body for personality/behavior prose.

## Step 4: Adopt the orchestrator persona

Before executing any phases, adopt the orchestrator's personality from the markdown body. This shapes how you communicate, make judgment calls, and interact with the user throughout the workflow.

If the orchestrator has `skip-when` conditions on optional phases, evaluate them against the feature description and current context to decide which phases to include.

## Step 5: Execute phases

For each phase in the `phases` list from frontmatter:

1. **Check if optional** — If the phase has `optional: true` and `skip-when`, evaluate whether to skip based on the feature description and context. Explain your reasoning to the user.

2. **Invoke the skill** — Run the skill specified in `skill:`, passing `args:` with variable substitution:
   - `$ARGUMENTS` → the feature description from step 1
   - `$PLAN_PATH` → the path to the plan file created during the plan phase

3. **Evaluate the gate** — If the phase has a `gate:`, verify the gate conditions are met before proceeding to the next phase. If the gate fails, retry or ask the user for guidance (depending on orchestrator personality).

4. **Track state** — Remember the plan file path when created, track which phases have completed, note key decisions.

5. **Handle signals** — If the phase has a `signal:` instead of a `skill:`, output that signal (e.g., `<promise>DONE</promise>`).

### Variable threading

- After the plan phase completes, scan `docs/plans/` for the most recently created plan file and store its path as `$PLAN_PATH`.
- Pass `$PLAN_PATH` to subsequent phases that reference it in their `args:`.

## Step 6: Review preferences

When invoking `/ce:review`, pass the orchestrator's `review-preferences` and `synthesis` configuration as context:

- **min-reviewers** — Minimum number of reviewers to spawn
- **require-categories** — Categories that must be represented (warn if no reviewer available)
- **prefer-categories** — Categories to include if available
- **synthesis.lens** — Pass this to the synthesis reviewer to shape how findings are weighted

These preferences guide reviewer selection but don't override the existing ce:review selection logic — they add constraints on top of it.

## Step 7: Model selection

Orchestrators define two model fields:

- **`orchestrator-model`** — The model for the orchestrator itself (the main conversation thread). `inherit` means use the session model.
- **`agent-model`** — The default model for skills and subagents the orchestrator spawns.

Per-phase `model:` overrides take precedence over `agent-model`. Resolution order:

1. Phase-level `model:` (if specified)
2. Orchestrator-level `agent-model:` (if specified)
3. Session model (inherit)

When spawning Agent subagents, pass the resolved model. When invoking skills in the main conversation (e.g., `/ce:plan`), the orchestrator-model applies since skills run in the main thread.

## Step 8: Completion

When all phases are done, summarize the workflow:
- Which phases ran (and which were skipped, with reasons)
- Key decisions made along the way
- Any learnings captured in the compound phase

Communicate completion in the orchestrator's voice.

## Available Orchestrators

To see what's installed, run:

```bash
ls $PLUGIN_DIR/orchestrators/*.md 2>/dev/null | xargs -I{} basename {} .md
```

If no orchestrators are found, run `/ce:refresh` to sync from configured sources.
