# Research: Smart-Ralph Command Scaffolding Improvements

## Source

Full research conducted via foreman-spec workflow (Deep Mode) with 4 specialized agents.
Detailed findings in:
- `ai/tasks/spec/PM.md` - Product analysis, priority matrix, scope decisions
- `ai/tasks/spec/UX.md` - UX flows, error message templates, interactive patterns
- `ai/tasks/spec/TECH.md` - Technical architecture, hook scripts, CI design, file manifest
- `ai/tasks/spec/QA.md` - Test strategy, 12 acceptance criteria, test execution order

## Key Research Findings

### Claude Code Plugin Best Practices
- `disable-model-invocation: true` prevents auto-loading command instructions into context
- PreToolUse hooks are the primary safety mechanism (allow/deny/ask decisions)
- AskUserQuestion enables spec-based development with multi-round interviews
- Workflow state persistence enables resumable workflows

### Current Plugin State (v2.31.0)
- 24 commands, 29 agents, 18 skills, 0 hooks
- 14/24 commands have `disable-model-invocation: true` (10 missing)
- 23/24 have `argument-hint` (1 missing: deploy-docs.md)
- 0/24 commands validate input arguments
- `/reproduce-bug` references removed Playwright MCP tools
- No CI validates command markdown files
- 316% context budget bloat from missing `disable-model-invocation` flags
