# Design: Smart-Ralph Command Scaffolding Improvements

## Source
Full technical architecture in `ai/tasks/spec/TECH.md`.

## Architecture Principles
1. Additive-only changes to command behavior (no rewrites)
2. Plugin-scoped hooks (travel with plugin installation)
3. CI validates plugin artifacts, not user projects
4. State files are user-project artifacts (gitignored)
5. Autonomous mode bypass via $ARGUMENTS presence

## File Manifest

### New Files (4)
| File | Purpose |
|------|---------|
| `plugins/compound-engineering/hooks/hooks.json` | Hook configuration |
| `plugins/compound-engineering/hooks/scripts/validate-bash.sh` | Bash command safety hook |
| `plugins/compound-engineering/hooks/scripts/protect-env-files.sh` | Env file protection hook |
| `tests/command-validation.test.ts` | CI test for command frontmatter |
| `tests/hook-scripts.test.ts` | CI test for hook scripts |

### Modified Files (13 unique commands)
- 10 commands: Add `disable-model-invocation: true`
- 1 command: Add `argument-hint` (deploy-docs.md)
- 1 command: Replace MCP refs (reproduce-bug.md)
- 3 commands: Add input validation sections
- 4 commands: Add AskUserQuestion interactive patterns
- 2 commands: Add state management sections

Total: 17 files touched (some commands get multiple changes)

## Hook Architecture
- PreToolUse on Bash: `validate-bash.sh` (force push, hard reset, rm -rf)
- PreToolUse on Write|Edit: `protect-env-files.sh` (.env, .pem, .key, credentials, secrets)
- Decision mode: "ask" for all, "deny" only for catastrophic rm -rf targets

## CI Architecture
- `tests/command-validation.test.ts`: 6 assertion groups x 24 commands
- `tests/hook-scripts.test.ts`: 24 test cases via Bun.spawn()
- Uses existing `parseFrontmatter()` from `src/utils/frontmatter.ts`
- Zero new dependencies
