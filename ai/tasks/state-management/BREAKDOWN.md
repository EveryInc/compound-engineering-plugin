---
id: state-management.BREAKDOWN
module: state-management
priority: 6
status: pending
version: 1
origin: spec-workflow
dependsOn: [interactive-patterns]
tags: [smart-ralph, compound-engineering]
---
# State Management

## Context

The Plan-Work-Review-Compound lifecycle is inherently stateful but runs in a single session with no checkpoint/resume capability. Session crashes or context window exhaustion means starting over -- a 30+ minute loss per incident. This module implements `.local.md` state files as a proof of concept: `plan.md` writes state on completion, `work.md` discovers and offers to resume from saved state. State files are gitignored, automatically created with announcement, and deleted when the workflow completes.

## Tasks

1. **Add State Checkpoint section to `workflows/plan.md`** -- Insert a `### State Checkpoint` section at the end of the plan command, after the plan file is written:
   - Derive the feature slug from the plan filename by stripping date prefix (`YYYY-MM-DD-`), type prefix (`feat-`, `fix-`, `refactor-`), and `-plan` suffix
   - Create `.{feature-slug}.local.md` in the project root with YAML frontmatter:
     - `feature:` the slug
     - `plan_file:` path to the created plan
     - `phase: plan-complete`
     - `branch:` (empty, may not exist yet)
     - `started:` and `updated:` set to current ISO 8601 timestamp
   - Progress section with "Plan created" checked, all other items unchecked
   - Announce: "Progress saved to .{feature-slug}.local.md (gitignored)"

2. **Add State Discovery section to `workflows/work.md`** -- Insert a `### State Discovery` section before Phase 1 (after Input Handling):
   - Scan for `.*.local.md` files in project root: `ls -1a .*.local.md 2>/dev/null`
   - If a state file matches the selected plan (by `plan_file` field in frontmatter):
     - Read the state file, parse phase and progress
     - Show resume prompt using AskUserQuestion (Template 6 from UX spec):
       - Question: "Found previous session for '[feature]'"
       - Display: file, phase, progress count, age, branch
       - Options: (1) Resume from where you left off (recommended), (2) Start fresh (discards saved progress), (3) View saved state before deciding
     - "Start fresh" deletes the old state file
   - If no matching state file: proceed normally (new workflow)

3. **Implement staleness detection** -- When reading a state file, check the `updated:` timestamp age:
   - < 24 hours: Resume prompt with "recommended" label on resume option
   - 1-7 days: Resume prompt with neutral framing (no "recommended")
   - > 7 days: Warning: "This state is [N] days old and may be outdated"
   - > 30 days: "Start fresh" becomes the recommended option
   - Use bash date parsing with macOS/Linux fallback: `date -jf` (BSD) vs `date -d` (GNU)

4. **Implement branch divergence check** -- When resuming, check if the branch has new commits since state was saved:
   - Extract branch name from state file
   - Count commits since the `updated:` timestamp: `git log --oneline "$BRANCH" --since="$UPDATED" | wc -l`
   - If > 0 commits: warn "Branch '$BRANCH' has $N new commits since state was saved."

5. **Document state file structure** -- The state file format (for implementer reference):
   ```markdown
   ---
   feature: {slug}
   plan_file: docs/plans/{plan-filename}
   phase: plan-complete|work|work-complete|review|review-complete|compound
   branch: {branch-name or empty}
   started: {ISO 8601}
   updated: {ISO 8601}
   ---
   ## Progress
   - [x] Plan created: {plan path}
   - [ ] Branch created
   - [ ] Implementation
   - [ ] Tests passing
   - [ ] Review complete
   - [ ] Compound documented
   ```

6. **Add gitignore guidance** -- Include instructions for adding `.*.local.md` to the project's `.gitignore`. This is a user-project change, not a plugin change. Document it in the state checkpoint announcement and in the plugin README.

7. **Handle edge cases** -- Add instructions for:
   - Corrupt state file (invalid YAML): Warn and delete, start fresh
   - Multiple state files for different features: List all, ask user which one
   - Plan file was deleted: Warn "Plan file not found", offer to start fresh or enter a new path
   - Phase mismatch (user runs `/workflows:plan` but state says phase is `work`): Warn and suggest correct command

## Acceptance Criteria

- AC-8 (from QA): State file lifecycle works: create, read, resume, cleanup. Verified by manual state tests 5.1-5.6.
- Manual test 5.1: After plan completion, `.{slug}.local.md` exists with correct frontmatter and Claude announces "Progress saved to..."
- Manual test 5.2: Running `/workflows:work` with no arguments discovers state file and shows resume prompt.
- Manual test 5.3: Selecting "Resume" loads plan path from state and proceeds to correct phase.
- Manual test 5.4: Selecting "Start fresh" deletes state file and starts from scratch.
- Manual test 5.5: State file with `updated:` 8 days ago triggers staleness warning.
- Manual test 5.6: After compound completion, state file is deleted (lifecycle complete).
- Manual test 5.7: Branch with new commits since state was saved triggers divergence warning.
- Manual test 5.8: State file does not appear in `git status` (gitignored).
- State file naming uses plan filename slug (per UX Q3), not git branch name.
- State creation is automatic with announcement (per TECH Q5), not opt-in.

## Files to Create/Modify

### Modified Files (2)

| File | Change |
|------|--------|
| `plugins/compound-engineering/commands/workflows/plan.md` | Add `### State Checkpoint` section at end -- writes `.{feature-slug}.local.md` after plan completion |
| `plugins/compound-engineering/commands/workflows/work.md` | Add `### State Discovery` section before Phase 1 -- finds matching state files, shows resume prompt, handles staleness/divergence |
