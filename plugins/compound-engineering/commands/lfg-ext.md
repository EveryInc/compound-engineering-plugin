---
name: lfg-ext
description: LFG with external delegates (Codex/Gemini CLI) in parallel worktrees — preserves Claude token budget while maintaining parallel execution
argument-hint: "[feature description]"
disable-model-invocation: true
---

External-delegate LFG. Uses CE for planning and review; replaces `/ce:work` swarm with external AI tools running in isolated git worktrees. Preserves Claude token budget for planning and review where it adds the most value.

Run these steps in order. Do not stop between steps — complete every step through to the end.

## Phase 1: Plan

1. `/ce:plan $ARGUMENTS`
2. `/compound-engineering:deepen-plan`
3. **Commit the plan** — worktrees only see committed git history, not the working tree. Uncommitted plan files are invisible to delegates.

   ```bash
   git add docs/plans/ && git commit -m "plan: <feature>"
   ```

## Phase 2: Check tools & decompose

4. **Check which external tools are available:**

   ```bash
   command -v codex  && echo "codex: available"  || echo "codex: not installed"
   command -v gemini && echo "gemini: available" || echo "gemini: not installed"
   ```

   If neither is installed, **stop here and run `/slfg` instead** — there's no point creating worktrees without delegates to fill them.

5. Read the generated plan. Identify tasks that target **different files/modules with no shared state**.

   Good signal: tasks write to non-overlapping files.
   Bad signal: tasks share a model, schema, config, or any single file — don't force it, fall back to `/slfg` or sequential `/ce:work`.

   Aim for 2–4 parallel streams. More rarely helps.

## Phase 3: External Swarm

6. **Create one worktree per task** using the CE worktree manager:

   ```bash
   bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh create <task-branch>
   ```

   The script handles `.env` file copying, `.gitignore` management, and directory setup automatically.

7. **Launch all delegates in parallel** — one per worktree, all backgrounded simultaneously.

   Assign tasks to tools by type:

   | Task type | Preferred tool | Command |
   |-----------|----------------|---------|
   | Multi-file, repo navigation, test loops | **Codex** | `cd .worktrees/<branch> && codex exec --full-auto "<prompt>"` |
   | Algorithmic, isolated logic | **Gemini CLI** | `cd .worktrees/<branch> && gemini -p "<prompt>" --yolo` |

   Each delegate prompt must include:
   - Absolute file paths (let the delegate read — don't inline file contents)
   - Constraints: "don't modify X", "keep existing patterns"
   - Verification: "run `npm test` / `bin/rails test` / `pytest` to verify"
   - "Implement fully. No stubs, no TODOs, no simplified versions."

8. **Wait for all delegates to complete.**

## Phase 4: Merge

9. For each worktree — review scope before merging:

   ```bash
   git diff --stat <task-branch>   # check for unexpected file changes
   git merge <task-branch>
   bash ${CLAUDE_PLUGIN_ROOT}/skills/git-worktree/scripts/worktree-manager.sh cleanup
   ```

   Merge conflicts mean tasks weren't fully independent. Resolve manually, then continue.

## Phase 5: Review & Ship

10. `/ce:review`
11. `/compound-engineering:resolve_todo_parallel`

> Note: `/lfg-ext` omits `/feature-video` — external delegates don't produce a reviewable PR automatically, so a video walkthrough isn't meaningful until you've raised one manually.

---

## When to use vs /slfg

| Signal | Use |
|--------|-----|
| Want fully hands-off, token cost not a concern | `/slfg` |
| Token budget constrained, or tasks decompose cleanly by file | `/lfg-ext` |
| Tasks share files or state | `/slfg` or sequential `/ce:work` |
| Want Codex repo navigation or Gemini algorithmic strength | `/lfg-ext` |
| No external tools installed | `/slfg` |
