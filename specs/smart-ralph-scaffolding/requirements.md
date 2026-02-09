# Requirements: Smart-Ralph Command Scaffolding Improvements

## Source
Full requirements in `ai/tasks/spec/PM.md` and `ai/tasks/spec/UX.md`.

## User Stories

### US-1: Context Budget Reduction (P0)
As a plugin user, I want commands that shouldn't be auto-loaded to have `disable-model-invocation: true` so my context budget isn't wasted on unused command instructions.

**Acceptance:** All 24 commands have `disable-model-invocation: true`. Context budget does not regress.

### US-2: Fix Broken reproduce-bug Command (P1)
As a developer, I want `/reproduce-bug` to work with `agent-browser` CLI instead of referencing removed Playwright MCP tools.

**Acceptance:** Zero `mcp__plugin_compound-engineering_pw__*` references remain. Command uses `agent-browser` CLI exclusively.

### US-3: Input Validation (P1)
As a developer, I want clear What/Why/Fix error messages when I pass invalid arguments to commands.

**Acceptance:** `work.md`, `review.md`, and `reproduce-bug.md` validate inputs with three-part error messages.

### US-4: Safety Hooks (P1)
As a developer, I want confirmation prompts before destructive operations (force push, hard reset, rm -rf, .env edits).

**Acceptance:** 2 PreToolUse hook scripts fire correctly for all destructive operations. "Ask" mode for all except catastrophic deletes.

### US-5: CI Validation (P2)
As a contributor, I want CI to catch frontmatter errors and stale tool references in command files.

**Acceptance:** `bun test` validates all 24 command files. Hard fail with escape hatch for missing `disable-model-invocation`.

### US-6: Interactive Patterns (P2)
As a developer, I want workflow commands to help me select targets when I invoke them without arguments.

**Acceptance:** `work.md` has plan picker, `review.md` has target selector, `compound.md` has category confirmation. All bypass when `$ARGUMENTS` is non-empty.

### US-7: State Management (P3)
As a developer, I want workflow state saved so I can resume interrupted plan/work sessions.

**Acceptance:** `plan.md` writes `.local.md` state files. `work.md` discovers and offers resume. Staleness detection at 7/30 days.

## Key Decisions
- Ship all 4 phases as one release (PM Q5)
- Hooks use "ask" mode for all operations (PM Q2)
- Autonomous detection via `$ARGUMENTS` presence (UX Q1)
- Error messages always use What/Why/Fix format (UX Q4)
- CI: Hard fail + `# ci-allow: model-invocation` escape hatch (TECH Q1)
- Only `rm -rf` and `rm -fr` patterns caught by hooks (TECH Q2)
- State files auto-created with announcement (TECH Q5)
