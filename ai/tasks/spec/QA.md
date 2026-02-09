# QA Strategy: Smart-Ralph Command Scaffolding Improvements

**Author:** agent-foreman:qa
**Date:** 2026-02-09
**Plugin:** compound-engineering v2.31.0 (24 commands, 29 agents, 18 skills, 0 hooks -> 2 hooks)

---

## QA Strategy Overview

This QA plan covers the testing strategy for 17 files being changed across 7 improvement areas in the compound-engineering plugin. The changes span four categories of risk: **frontmatter metadata** (low risk, high confidence), **hook scripts** (medium risk, new behavior), **command behavior** (medium risk, instruction-level changes), and **state management** (high risk, new subsystem).

### Testing Philosophy

1. **Automate the automatable.** Frontmatter validation and hook script logic are deterministic and must be tested with automated unit/integration tests that run in CI.
2. **Script the manual.** Command behavior changes (AskUserQuestion flows, input validation) are executed by Claude interpreting markdown instructions -- they cannot be unit-tested in the traditional sense. For these, we define scripted manual test procedures with explicit pass/fail criteria.
3. **Regression-first.** The highest-priority tests are the lfg/slfg chain regression tests. If the orchestration chains break, nothing else matters.
4. **Platform parity.** Hook scripts must pass on both macOS (local dev) and Linux (CI runner). All bash must be POSIX-compatible within bash 3.2+.

### Test Pyramid

```
            /  Manual  \           <- Command behavior, AskUserQuestion flows
           / Integration \         <- lfg/slfg chain, state lifecycle
          / Hook Unit Tests \      <- validate-bash.sh, protect-env-files.sh
         / Frontmatter CI Tests \  <- command-validation.test.ts
        /________________________\ <- Existing bun test suite (8 tests)
```

### Test Scope Summary

| Category | Test Count | Method | Runs In CI? |
|----------|-----------|--------|-------------|
| Frontmatter validation | 6 assertion groups | Bun test (automated) | Yes |
| Hook script unit tests | 18 test cases | Bash pipe tests (automated) | Yes |
| Command behavior | 12 manual procedures | Scripted manual | No |
| Integration (lfg/slfg) | 4 chain tests | Scripted manual | No |
| State management | 8 lifecycle tests | Scripted manual | No |
| AskUserQuestion bypass | 5 bypass tests | Scripted manual | No |
| Cross-platform | 2 platform checks | CI + local | Partial |

---

## Research Findings

### 1. Claude Code Plugin Testing Patterns (2025-2026)

Claude Code plugins lack a built-in test framework. The established community pattern is:
- **Frontmatter/structure validation:** Use the plugin's own parser (`parseFrontmatter()`) in Bun/Jest tests to validate command files as data artifacts. This reuses existing infrastructure and requires zero new dependencies.
- **Hook testing:** Hooks receive JSON on stdin and return JSON on stdout with exit codes. The canonical test pattern is piping mock JSON into the hook script and asserting on the output/exit code. This is effectively a bash pipe test: `echo '{"tool_input":{"command":"git push --force"}}' | bash hook.sh`.
- **Block-at-submit pattern:** A PreToolUse hook wraps Bash(git commit), checks for a marker file from the test suite, and blocks commits if tests haven't passed. This creates a "test-and-fix" loop.
- **No official plugin test harness exists.** Anthropic's plugin-dev plugin provides development skills but not a test runner. Community projects like klaudiush (Go-based hook validator) demonstrate that hook testing requires custom infrastructure.

Sources:
- [Hooks Reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Claude Code Hooks: Automated Quality Checks](https://www.letanure.dev/blog/2025-08-06--claude-code-part-8-hooks-automated-quality-checks)
- [Claude Code Hooks Complete Guide - DataCamp](https://www.datacamp.com/tutorial/claude-code-hooks)
- [Claude Code Hook Control Flow - Steve Kinney](https://stevekinney.com/courses/ai-development/claude-code-hook-control-flow)
- [klaudiush - Go-based PreToolUse Hook Validator](https://github.com/smykla-skalski/klaudiush)

### 2. Bash Script Testing with BATS

BATS (Bash Automated Testing System) is the standard framework for testing bash scripts. Key patterns:
- **TAP-compliant output:** Integrates with CI runners that understand TAP format.
- **Function isolation:** Individual functions can be tested by sourcing the script and calling functions directly. For our hooks, the entire script is the unit under test -- input on stdin, output on stdout.
- **Pipe testing pattern:** For scripts that read stdin, BATS tests pipe mock data: `run bash -c 'echo "$MOCK_JSON" | ./script.sh'`. Assert on `$status` (exit code) and `$output` (stdout).
- **Cross-platform considerations:** BATS runs on macOS and Linux. The `jq` dependency must be verified on both.

However, adding BATS as a dependency introduces complexity. For this project, we recommend **inline bash pipe tests within the Bun test suite** -- Bun can spawn shell processes with `Bun.spawn()` and assert on stdout/exit code, keeping all tests in one `bun test` run.

Sources:
- [Testing Bash Scripts with BATS - HackerOne](https://www.hackerone.com/blog/testing-bash-scripts-bats-practical-guide)
- [Bats-core Documentation](https://bats-core.readthedocs.io/)
- [Testing Bash Scripts Using BATS - thewatertower.org](https://blog.thewatertower.org/2025/02/10/testing-bash-scripts-using-bats/)

### 3. Frontmatter Validation in CI

The prevailing approach for markdown frontmatter CI validation is:
- **Use the project's own parser**, not external tools like markdownlint or remark-lint-frontmatter-schema. This avoids dependency bloat and ensures the test validates what the runtime actually parses.
- **Schema validation via test assertions:** Define required fields as test expectations. `expect(data["name"]).toBeString()` is more readable and maintainable than a JSON Schema file.
- **GitHub Actions inline annotations:** Use `::error file=path,line=1::message` format to surface failures as PR annotations. The existing `bun test` CI step already runs on ubuntu-latest, so no new workflow is needed.
- **Severity differentiation:** Required fields (name, description) are hard failures. Expected fields (argument-hint, disable-model-invocation) are hard failures with an escape hatch comment.

Sources:
- [Using YAML Frontmatter - GitHub Docs](https://docs.github.com/en/contributing/writing-for-github-docs/using-yaml-frontmatter)
- [YAML Schema for Markdown Frontmatter - Zed Issue #43444](https://github.com/zed-industries/zed/issues/43444)
- [remark-frontmatter - GitHub](https://github.com/remarkjs/remark-frontmatter)

### 4. Hook Input/Output Contract

The Claude Code hook contract for PreToolUse is:
- **Input (stdin):** JSON with `tool_name`, `tool_input` (command for Bash, file_path for Write/Edit), `session_id`, `cwd`, `permission_mode`.
- **Output (stdout):** JSON with `hookSpecificOutput.permissionDecision` ("allow", "deny", "ask") and `hookSpecificOutput.permissionDecisionReason`.
- **Exit codes:** 0 = success (parse stdout for decision), 2 = block (stderr fed to Claude as reason), non-zero other = error (hook ignored).
- **Timeout:** Hook must respond within the configured timeout (10s for validate-bash.sh, 5s for protect-env-files.sh).

This contract defines the test interface: pipe JSON in, assert on JSON out + exit code.

Sources:
- [Hooks Reference - Claude Code Docs](https://code.claude.com/docs/en/hooks)
- [Claude Code Power User Customization: Hooks](https://claude.com/blog/how-to-configure-hooks)
- [Understanding Claude Code Hooks Documentation - PromptLayer](https://blog.promptlayer.com/understanding-claude-code-hooks-documentation/)

---

## Test Plan

### Category 1: Frontmatter Validation Tests (Automated CI)

**Test file:** `tests/command-validation.test.ts`
**Runner:** `bun test` (integrated into existing CI)
**Dependencies:** Existing `parseFrontmatter()` from `src/utils/frontmatter.ts`

#### Test Cases

| # | Test Name | What It Validates | Pass Criteria | Edge Cases |
|---|-----------|-------------------|---------------|------------|
| 1.1 | All command files parse valid YAML | Frontmatter is syntactically correct YAML | `parseFrontmatter()` returns non-empty `data` for every `.md` file in `commands/` and `commands/workflows/` | Empty frontmatter, malformed YAML, UTF-8 characters in values |
| 1.2 | All commands have `name` field | Required field presence | `data["name"]` is a non-empty string for all 24 commands | Name with special characters, very long names |
| 1.3 | All commands have `description` field | Required field presence | `data["description"]` is a non-empty string for all 24 commands | Multi-line descriptions, descriptions with markdown |
| 1.4 | All commands have `argument-hint` field | Expected field presence | `data["argument-hint"]` is a string for all 24 commands | Hints with quotes, hints with special characters |
| 1.5 | All commands have `disable-model-invocation: true` | Expected field presence with escape hatch | `data["disable-model-invocation"] === true` for all commands UNLESS body contains `# ci-allow: model-invocation` | Boolean true vs string "true", missing field vs explicit false |
| 1.6 | No removed tool references in command bodies | Stale reference detection | No command body matches `/mcp__plugin_compound-engineering_pw__/` regex | References in comments, partial matches, similar-but-different patterns |

#### Implementation Notes

- Test 1.5 implements the escape hatch: scan the command body for `# ci-allow: model-invocation`. If found, skip the `disable-model-invocation` assertion for that file. Currently no commands use this escape hatch.
- Test 1.6 uses a `REMOVED_TOOL_PATTERNS` array that can be extended as tools are deprecated. Start with `[/mcp__plugin_compound-engineering_pw__/]`.
- All failures emit `::error file=<path>,line=1::<message>` for GitHub Actions inline annotations.
- The test discovers command files via glob at runtime, not a hardcoded list. This automatically validates new commands added in future PRs.

#### Pass/Fail Criteria

- **PASS:** All 6 assertion groups pass for all 24 command files (144 total assertions minimum).
- **FAIL:** Any single assertion failure fails the entire CI run. The failure message includes the file path and a Fix instruction.

---

### Category 2: Hook Script Unit Tests (Automated CI)

**Test file:** `tests/hook-scripts.test.ts`
**Runner:** `bun test` (using `Bun.spawn()` to execute bash scripts)
**Dependencies:** `jq` must be available on the test runner (standard on ubuntu-latest, verify on macOS)

#### Test Approach

Each test case pipes a mock JSON payload (simulating Claude Code's PreToolUse input) into the hook script via stdin, then asserts on:
1. Exit code (0 for allow/ask/deny, non-zero for error)
2. Stdout JSON structure (permissionDecision field)
3. Stdout JSON content (permissionDecisionReason message)

#### Test Cases: validate-bash.sh

| # | Test Name | Input Command | Expected Decision | Expected Reason Contains |
|---|-----------|---------------|-------------------|--------------------------|
| 2.1 | Allows normal commands | `ls -la` | allow (exit 0, no JSON) | N/A |
| 2.2 | Allows git push (non-force) | `git push origin main` | allow (exit 0, no JSON) | N/A |
| 2.3 | Asks on git push --force | `git push --force origin feat/auth` | ask | "Force push", "feat/auth" |
| 2.4 | Asks on git push -f | `git push -f origin main` | ask | "Force push" |
| 2.5 | Asks on git reset --hard | `git reset --hard HEAD~3` | ask | "Hard reset", "uncommitted changes" |
| 2.6 | Asks on rm -rf meaningful path | `rm -rf src/components` | ask | "Recursive delete", "src/components" |
| 2.7 | Asks on rm -fr (flag reorder) | `rm -fr dist/build` | ask | "Recursive delete" |
| 2.8 | Denies rm -rf / | `rm -rf /` | deny | "Catastrophic" |
| 2.9 | Denies rm -rf ~ | `rm -rf ~` | deny | "Catastrophic" |
| 2.10 | Denies rm -rf $HOME | `rm -rf $HOME` | deny | "Catastrophic" |
| 2.11 | Allows rm -rf node_modules | `rm -rf node_modules` | allow (exit 0, no JSON) | N/A |
| 2.12 | Allows rm -rf .cache | `rm -rf .cache` | allow (exit 0, no JSON) | N/A |
| 2.13 | Handles empty command | `""` (empty) | allow (exit 0, no JSON) | N/A |
| 2.14 | Handles multi-line command | `cd src && rm -rf dist` | ask | "Recursive delete" |

#### Test Cases: protect-env-files.sh

| # | Test Name | Input File Path | Expected Decision | Expected Reason Contains |
|---|-----------|-----------------|-------------------|--------------------------|
| 2.15 | Asks on .env edit | `/project/.env` | ask | ".env", "secrets" |
| 2.16 | Asks on .env.local edit | `/project/.env.local` | ask | ".env", "secrets" |
| 2.17 | Asks on .env.production edit | `/project/.env.production` | ask | ".env", "secrets" |
| 2.18 | Allows normal file edit | `/project/src/index.ts` | allow (exit 0, no JSON) | N/A |
| 2.19 | Asks on .pem file edit | `/project/cert.pem` | ask | "secrets" |
| 2.20 | Asks on .key file edit | `/project/private.key` | ask | "secrets" |
| 2.21 | Asks on credentials file edit | `/project/credentials.json` | ask | "secrets" |
| 2.22 | Asks on secret config edit | `/project/secret.yml` | ask | "secrets" |
| 2.23 | Allows similarly-named safe files | `/project/src/env-utils.ts` | allow (exit 0, no JSON) | N/A |
| 2.24 | Handles empty file_path | `""` (empty) | allow (exit 0, no JSON) | N/A |

#### Mock JSON Templates

**Bash tool input:**
```json
{
  "tool_name": "Bash",
  "tool_input": {
    "command": "<COMMAND_HERE>"
  },
  "session_id": "test-session",
  "cwd": "/tmp/test-project",
  "permission_mode": "default"
}
```

**Write/Edit tool input:**
```json
{
  "tool_name": "Write",
  "tool_input": {
    "file_path": "<FILE_PATH_HERE>"
  },
  "session_id": "test-session",
  "cwd": "/tmp/test-project",
  "permission_mode": "default"
}
```

#### Implementation Pattern (Bun)

```typescript
import { describe, expect, test } from "bun:test";
import path from "path";

const SCRIPT_DIR = path.join(import.meta.dir, "..", "plugins", "compound-engineering", "hooks", "scripts");

async function runHook(script: string, input: object): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["bash", path.join(SCRIPT_DIR, script)], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  });
  const writer = proc.stdin.getWriter();
  await writer.write(new TextEncoder().encode(JSON.stringify(input)));
  await writer.close();
  const exitCode = await proc.exited;
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  return { exitCode, stdout: stdout.trim(), stderr: stderr.trim() };
}
```

#### Pass/Fail Criteria

- **PASS:** All 24 test cases return the expected exit code AND (where applicable) the expected JSON decision and reason substring.
- **FAIL:** Any deviation in exit code or decision type. Reason text is checked with `toContain()` (substring match) to allow for message refinement without breaking tests.

#### Edge Cases

- **jq not installed:** Test should fail with a clear message: "jq is required for hook scripts. Install with: brew install jq (macOS) or apt-get install jq (Linux)".
- **Script not executable:** Test should detect `chmod +x` requirement and fail with actionable message.
- **Malformed JSON input:** Script should exit 0 (allow) gracefully -- hooks must never crash on bad input.
- **Piped commands:** `git pull && git push --force` should still detect the force push pattern.
- **Quoted arguments:** `rm -rf "path with spaces"` should still match.

---

### Category 3: Command Behavior Tests (Manual Procedures)

**Method:** Scripted manual test procedures executed by a human or by Claude in an interactive session.
**Environment:** Local dev machine with the plugin installed.

These tests verify that the markdown instruction changes (input validation sections, AskUserQuestion gates) are correctly interpreted by Claude at runtime.

#### Test Procedures

| # | Command | Scenario | Steps | Pass Criteria |
|---|---------|----------|-------|---------------|
| 3.1 | `/workflows:work` | Empty arguments, interactive mode | 1. Run `/workflows:work` with no arguments. 2. Observe plan picker prompt. | Claude presents AskUserQuestion with recent plans from `docs/plans/`. Shows max 5 plans, state-files first. |
| 3.2 | `/workflows:work` | Valid plan path argument | 1. Run `/workflows:work docs/plans/some-plan.md`. 2. Observe immediate execution. | Claude proceeds directly to Phase 1 without asking questions. No plan picker shown. |
| 3.3 | `/workflows:work` | Invalid plan path argument | 1. Run `/workflows:work nonexistent.md`. 2. Observe error message. | Claude shows What/Why/Fix error: file not found, explains plan file expected, suggests correct path. |
| 3.4 | `/workflows:review` | Empty arguments, on feature branch with PR | 1. Checkout a feature branch with an open PR. 2. Run `/workflows:review`. | Claude auto-detects the PR and asks "What would you like to review?" with the current PR as default option. |
| 3.5 | `/workflows:review` | PR number argument | 1. Run `/workflows:review 123`. | Claude proceeds directly to review without asking questions. |
| 3.6 | `/workflows:review` | Invalid PR number | 1. Run `/workflows:review abc`. | Claude shows What/Why/Fix error for invalid PR number, suggests correct format. |
| 3.7 | `/workflows:compound` | Interactive mode, category confirmation | 1. Run `/workflows:compound` with no arguments. 2. Wait for Category Classifier. 3. Observe confirmation prompt. | Claude shows "Classified as '[category]'. Does this look right?" with 3 options. |
| 3.8 | `/workflows:plan` | L1 path (detailed description >50 words) | 1. Run `/workflows:plan` with a >50 word description. | Claude announces "Description is detailed, proceeding to research" and skips idea refinement. |
| 3.9 | `/workflows:plan` | L2 path (brief description) | 1. Run `/workflows:plan add user auth`. | Claude offers a single clarifying question before proceeding. |
| 3.10 | `/workflows:plan` | L3 path (empty arguments) | 1. Run `/workflows:plan` with no arguments. | Claude enters full idea refinement dialogue with multiple AskUserQuestion rounds. |
| 3.11 | `/reproduce-bug` | Verify agent-browser CLI usage | 1. Run `/reproduce-bug 42`. 2. Observe Phase 2 instructions. | Claude uses `agent-browser` CLI commands, NOT `mcp__plugin_compound-engineering_pw__*`. No stale tool references. |
| 3.12 | `/reproduce-bug` | Invalid issue number | 1. Run `/reproduce-bug notanumber`. | Claude shows What/Why/Fix error for invalid issue number. |

#### Pass/Fail Criteria

- **PASS:** Claude's behavior matches the "Pass Criteria" column exactly. For error messages, all three parts (What/Why/Fix) must be present.
- **FAIL:** Claude asks questions when it should not (autonomous mode), skips questions when it should ask (interactive mode), or shows incorrect/missing error messages.

---

### Category 4: Integration Tests (lfg/slfg Chain Regression)

**Method:** Full chain execution in a test repository.
**Environment:** Local dev machine with plugin installed, a test repository with at least one existing plan file.
**Priority:** HIGHEST -- these tests gate the release.

#### Test Procedures

| # | Chain | Scenario | Steps | Pass Criteria | Failure Indicators |
|---|-------|----------|-------|---------------|-------------------|
| 4.1 | lfg | Full chain execution | 1. In a test repo, run `/lfg "add a simple hello world page"`. 2. Let it run through all 8 steps. | Chain completes all steps: plan -> deepen -> work -> review -> resolve -> test-browser -> feature-video -> DONE. No AskUserQuestion prompts block the chain. | Chain stalls at any step waiting for user input. `disable-model-invocation` blocks a workflow command invocation. |
| 4.2 | slfg | Full chain execution | 1. In a test repo, run `/slfg "add a contact form"`. 2. Let it run through sequential + parallel + finalize phases. | Chain completes all phases. Parallel agents (review + test-browser) launch correctly. No blocking prompts. | Parallel phase fails to launch. Sequential commands stall on AskUserQuestion. |
| 4.3 | lfg | Chain with hook trigger | 1. Run `/lfg "add a feature"`. 2. During work phase, Claude may run `rm -rf dist/` or `git push`. 3. Observe hook behavior. | Hooks fire "ask" prompts for destructive operations. If confirmed, chain continues. Hooks do not hard-block routine operations. | Hook blocks a legitimate operation. Hook "ask" prompt is invisible/unreachable in the chain context. |
| 4.4 | lfg | Context budget measurement | 1. Run `/lfg "simple feature"`. 2. Monitor context usage via Claude Code diagnostics. 3. Compare to pre-change baseline. | Context consumption is LESS than or equal to baseline. The `disable-model-invocation` changes should reduce auto-loaded command text. | Context consumption increases (regression). Commands that should be hidden are still loaded into context. |

#### Special Considerations

- **Test 4.1 and 4.2 are long-running.** Expected duration: 20-60 minutes each. They should be run once before release, not on every code change.
- **Test 4.3 depends on Claude's behavior during work phase.** The hook may or may not fire depending on what commands Claude decides to run. This test verifies that IF a hook fires, it doesn't break the chain.
- **Test 4.4 requires a baseline measurement.** Take a context usage snapshot BEFORE applying changes, then compare AFTER. The target is <150% (down from ~316%).

#### Pass/Fail Criteria

- **PASS:** Both lfg and slfg chains complete without stalling on unexpected prompts. Context budget does not regress.
- **FAIL:** Any chain step stalls, errors, or the context budget increases.

---

### Category 5: State Management Tests (Manual)

**Method:** Step-by-step manual procedures testing the full state lifecycle.
**Environment:** Local dev machine with a clean test repository.

#### Test Procedures

| # | Phase | Scenario | Steps | Pass Criteria |
|---|-------|----------|-------|---------------|
| 5.1 | Create | State file creation on plan completion | 1. Run `/workflows:plan "add user auth"`. 2. Let plan complete. 3. Check project root for `.*.local.md` file. | File `.user-auth.local.md` (or similar slug) exists with correct YAML frontmatter: phase: plan-complete, plan_file pointing to created plan, timestamps present. Claude announces "Progress saved to .user-auth.local.md (gitignored)". |
| 5.2 | Read | State discovery on work start | 1. With a state file from 5.1, run `/workflows:work` (no arguments). 2. Observe resume prompt. | Claude finds the state file, shows Template 6 resume prompt with feature name, phase, progress, and 3 options (resume/fresh/view). |
| 5.3 | Resume | Resuming from saved state | 1. From 5.2, select "Resume from where you left off". 2. Observe work command behavior. | Claude loads the plan path from the state file and proceeds to the correct phase. Does not re-do completed steps. |
| 5.4 | Fresh start | Discarding saved state | 1. With a state file present, run `/workflows:work`. 2. Select "Start fresh". 3. Check state file. | Old state file is deleted. Work command starts from scratch. |
| 5.5 | Staleness | Stale state warning (>7 days) | 1. Manually edit a state file's `updated:` field to 8 days ago. 2. Run `/workflows:work`. | Claude shows staleness warning: "This state is 8 days old and may be outdated." Resume is NOT the recommended option. |
| 5.6 | Cleanup | State file deleted on compound completion | 1. Run through plan -> work -> review -> compound lifecycle. 2. After compound completes, check for state file. | State file is deleted. No orphaned `.local.md` files remain. |
| 5.7 | Branch divergence | Warning when branch has new commits | 1. Create state file, then add 3 commits to the branch. 2. Run `/workflows:work`. | Claude warns: "Branch has 3 new commits since state was saved." |
| 5.8 | Gitignore | State files excluded from git | 1. Create a state file. 2. Run `git status`. | State file does not appear in untracked files. `.gitignore` contains `.*.local.md` pattern. |

#### Edge Cases

| Scenario | Expected Behavior |
|----------|-------------------|
| Corrupt state file (invalid YAML) | Claude warns "Could not read state file. Starting fresh." and deletes the corrupt file. |
| Multiple state files for different features | Claude lists all state files and asks which one to use. |
| State file exists but plan file was deleted | Claude warns "Plan file not found" and offers to start fresh or enter a new path. |
| State says phase is "work" but user runs `/workflows:plan` | Claude warns "State shows this feature is in the work phase. Did you mean /workflows:work?" |

#### Pass/Fail Criteria

- **PASS:** Full lifecycle (create -> read -> resume -> cleanup) works end-to-end. All warnings fire at correct thresholds. State files are gitignored.
- **FAIL:** State file not created, not found on resume, not deleted on cleanup, or missing warning at any threshold.

---

### Category 6: AskUserQuestion Bypass Tests (Autonomous Mode)

**Method:** Scripted manual tests verifying that commands skip interactive prompts when invoked with arguments (autonomous mode).
**Environment:** Local dev with plugin installed.

#### Test Procedures

| # | Command | Invocation | Expected Behavior |
|---|---------|-----------|-------------------|
| 6.1 | `/workflows:plan` | `/workflows:plan "detailed feature description here with enough words to be clear"` | Proceeds to research immediately. No AskUserQuestion prompts. |
| 6.2 | `/workflows:work` | `/workflows:work docs/plans/2026-02-09-feat-test-plan.md` | Proceeds to Phase 1 immediately. No plan picker. |
| 6.3 | `/workflows:review` | `/workflows:review 123` | Proceeds to review immediately. No target selection prompt. |
| 6.4 | `/workflows:compound` | `/workflows:compound "Fixed the auth bug by..."` | Auto-classifies category. No confirmation prompt. Proceeds autonomously. |
| 6.5 | lfg chain context | Run `/lfg "build feature X"` and observe all sub-commands | Every sub-command in the chain receives arguments and skips interactive prompts. The only acceptable interaction is `/workflows:work` showing "Found one plan: [name]. Work on this? (y/n)" since lfg invokes it without arguments. |

#### Pass/Fail Criteria

- **PASS:** All 5 tests proceed without AskUserQuestion prompts (except the acknowledged `/workflows:work` single-confirmation in lfg chains).
- **FAIL:** Any command shows an unexpected interactive prompt when arguments are provided. This would stall autonomous chains.

---

### Category 7: Cross-Platform Tests

**Method:** Run automated tests on both macOS (local) and Linux (CI).
**Purpose:** Verify hook scripts and CI tests work identically on both platforms.

#### Test Matrix

| # | Test | macOS (local) | Linux (CI) | Known Differences |
|---|------|--------------|------------|-------------------|
| 7.1 | Hook scripts execute correctly | Run `bun test` locally | Automated via CI | `jq` availability: pre-installed on macOS (via Homebrew), standard on ubuntu-latest. `date` flag differences: macOS uses `-jf`, Linux uses `-d`. |
| 7.2 | Frontmatter validation passes | Run `bun test` locally | Automated via CI | File glob patterns: verify `**/*.md` resolves identically on both platforms. |

#### Platform-Specific Risk: `date` Command

The state management staleness detection uses `date` parsing which differs between macOS and Linux:
- **macOS (BSD):** `date -jf "%Y-%m-%dT%H:%M:%SZ" "$TIMESTAMP" +%s`
- **Linux (GNU):** `date -d "$TIMESTAMP" +%s`

The hook scripts (`validate-bash.sh`, `protect-env-files.sh`) do NOT use `date`, so they are not affected. The state management `date` usage is in command markdown instructions (interpreted by Claude, not executed directly as a script), so cross-platform compatibility is Claude's responsibility at runtime. However, the TECH spec's staleness detection bash snippet should include BOTH forms with a fallback.

#### Pass/Fail Criteria

- **PASS:** `bun test` passes on both macOS and ubuntu-latest with identical results. No platform-specific test failures.
- **FAIL:** Any test passes on one platform but fails on the other.

---

## Regression Test Plan

### Regression Risk 1: lfg/slfg Chains Breaking

**Risk Level:** HIGH
**Root Cause:** Adding `disable-model-invocation: true` to workflow commands, or AskUserQuestion gates that don't bypass correctly in autonomous mode.
**Detection:** Integration tests 4.1 and 4.2 (full chain execution).
**Mitigation:**
- Verify that `disable-model-invocation` only prevents model-initiated invocation, NOT explicit `/slash-command` invocation. This is documented in Claude Code's behavior, but must be confirmed empirically.
- Verify that every AskUserQuestion gate checks `$ARGUMENTS` non-empty and bypasses when true.
- Run both lfg and slfg chains end-to-end before release.

**Test:** After all changes are applied, run `/lfg "test feature"` and `/slfg "test feature"` in a clean test repository. Both must complete without stalling.

### Regression Risk 2: Context Budget Regression

**Risk Level:** MEDIUM
**Root Cause:** Adding input validation sections, AskUserQuestion sections, and state management sections to command markdown files increases their text size. If `disable-model-invocation` does not work as expected, these larger files could INCREASE context consumption rather than decrease it.
**Detection:** Integration test 4.4 (context budget measurement).
**Mitigation:**
- Measure context budget BEFORE and AFTER changes using Claude Code diagnostics.
- If context increases despite `disable-model-invocation: true`, investigate whether the flag is correctly parsed by checking `bun test` output for the `parseFrontmatter` assertion.
- Worst case: the content additions are modest (~50-100 lines per file), so even if loaded, they contribute less than the removed auto-loading of ALL 10 previously unflagged commands.

**Test:** Compare pre-change and post-change context consumption on a standardized prompt sequence.

### Regression Risk 3: Hook False Positives Blocking Normal Operations

**Risk Level:** MEDIUM
**Root Cause:** Overly broad regex patterns in `validate-bash.sh` matching legitimate commands.
**Detection:** Hook unit tests (Category 2) covering safe command allowlists.
**Mitigation:**
- The safe target allowlist (node_modules, .cache, tmp, __pycache__, .next) is tested explicitly in tests 2.11 and 2.12.
- All hooks use "ask" mode (not "deny"), so false positives are recoverable -- the user just confirms.
- The only "deny" patterns are catastrophic: `rm -rf /`, `rm -rf ~`, `rm -rf $HOME`.

**Test:** Run a typical development session with Claude (file edits, npm commands, git operations) and count how many times hooks fire unnecessarily. Target: zero false positive prompts during normal development.

### Regression Risk 4: State File Corruption/Accumulation

**Risk Level:** LOW-MEDIUM
**Root Cause:** State files not cleaned up after workflow completion, or state files with invalid YAML accumulating in project root.
**Detection:** State management tests 5.6 (cleanup) and 5.8 (gitignore).
**Mitigation:**
- Automatic cleanup on compound completion (test 5.6).
- Gitignore pattern (test 5.8) prevents state files from appearing in git status.
- Staleness warnings at 7+ days (test 5.5) remind users to clean up.
- Future enhancement: periodic cleanup of files older than 30 days.

**Test:** After a complete plan-work-review-compound lifecycle, verify no `.local.md` files remain in project root.

### Regression Risk 5: Existing Test Suite Failures

**Risk Level:** LOW
**Root Cause:** New test file (`command-validation.test.ts` or `hook-scripts.test.ts`) could interfere with existing 8 tests if imports or fixtures conflict.
**Detection:** Run full `bun test` after adding new test files.
**Mitigation:**
- New tests use separate fixture data (command files on disk for frontmatter, piped JSON for hooks).
- No shared mutable state between test files.
- New tests do not modify any files -- they are read-only assertions.

**Test:** Run `bun test` and verify all 8 existing tests still pass alongside the new tests.

---

## Acceptance Criteria

### Release Gate Criteria (ALL must pass)

| # | Criterion | Verification Method | Owner |
|---|-----------|-------------------|-------|
| AC-1 | All 24 commands have valid YAML frontmatter with name, description, argument-hint, and disable-model-invocation | `bun test` (command-validation.test.ts) passes | CI (automated) |
| AC-2 | No command body references removed Playwright MCP tools | `bun test` (command-validation.test.ts) removed-pattern check passes | CI (automated) |
| AC-3 | validate-bash.sh correctly handles all 14 test cases | `bun test` (hook-scripts.test.ts) passes | CI (automated) |
| AC-4 | protect-env-files.sh correctly handles all 10 test cases | `bun test` (hook-scripts.test.ts) passes | CI (automated) |
| AC-5 | `/lfg` chain completes end-to-end without stalling | Manual integration test 4.1 | QA (manual) |
| AC-6 | `/slfg` chain completes end-to-end without stalling | Manual integration test 4.2 | QA (manual) |
| AC-7 | Context budget does not increase vs. baseline | Manual integration test 4.4 | QA (manual) |
| AC-8 | State file lifecycle works: create, read, resume, cleanup | Manual state tests 5.1-5.6 | QA (manual) |
| AC-9 | AskUserQuestion bypasses correctly when arguments provided | Manual bypass tests 6.1-6.5 | QA (manual) |
| AC-10 | `bun test` passes on both macOS and ubuntu-latest | Local run + CI run | CI + developer |
| AC-11 | All existing 8 tests continue to pass | `bun test` full suite | CI (automated) |
| AC-12 | Hook scripts have executable permissions | `chmod +x` verified in CI step | CI (automated) |

### Non-Gate Criteria (Should pass, document exceptions)

| # | Criterion | Verification Method |
|---|-----------|-------------------|
| NG-1 | Error messages follow What/Why/Fix format for all validation failures | Manual spot check of 3+ commands |
| NG-2 | Plan picker shows max 5 plans with state-first sort | Manual test 3.1 |
| NG-3 | reproduce-bug uses agent-browser CLI exclusively | Manual test 3.11 |

---

## Test Execution Order

Tests should be executed in this order to catch critical failures early and avoid wasting time on downstream tests if a blocker is found.

### Phase 1: Foundation (Before Any Manual Testing)

```
Step 1: Run existing test suite
  $ bun test
  Purpose: Confirm baseline is green before changes
  Gate: ALL 8 existing tests pass

Step 2: Apply all code changes (all 17 files)

Step 3: Run full automated test suite
  $ bun test
  Purpose: Validate frontmatter (Cat 1) + hook scripts (Cat 2) + existing tests
  Gate: ALL tests pass (8 existing + new frontmatter + new hook tests)
  Estimate: 30 seconds

Step 4: Cross-platform verification
  Push to PR branch, verify CI passes on ubuntu-latest
  Purpose: Cat 7 cross-platform check
  Gate: CI green
```

### Phase 2: Regression (Highest Priority Manual Tests)

```
Step 5: lfg chain regression
  $ /lfg "add a hello world page" (in test repo)
  Purpose: Cat 4, test 4.1 -- verify orchestration chain
  Gate: Chain completes all steps without stalling
  Estimate: 20-60 minutes

Step 6: slfg chain regression
  $ /slfg "add a contact form" (in test repo)
  Purpose: Cat 4, test 4.2 -- verify swarm orchestration
  Gate: Chain completes without stalling
  Estimate: 20-60 minutes
```

### Phase 3: Feature Verification (After Regression Passes)

```
Step 7: AskUserQuestion bypass tests
  Run tests 6.1 through 6.5
  Purpose: Cat 6 -- verify autonomous mode works
  Gate: No unexpected interactive prompts
  Estimate: 15 minutes

Step 8: Command behavior tests (interactive mode)
  Run tests 3.1, 3.4, 3.7, 3.8, 3.10
  Purpose: Cat 3 -- verify interactive flows work
  Gate: Plan picker, review target selector, compound confirmation all functional
  Estimate: 30 minutes

Step 9: Input validation tests
  Run tests 3.3, 3.6, 3.12
  Purpose: Cat 3 -- verify error messages
  Gate: What/Why/Fix format for all validation errors
  Estimate: 15 minutes
```

### Phase 4: State Management (After Features Pass)

```
Step 10: State lifecycle end-to-end
  Run tests 5.1 through 5.8
  Purpose: Cat 5 -- full state management lifecycle
  Gate: Create, read, resume, cleanup all work
  Estimate: 30-45 minutes

Step 11: Context budget measurement
  Run test 4.4
  Purpose: Verify context budget improvement
  Gate: Context consumption <= baseline
  Estimate: 15 minutes
```

### Phase 5: Final Verification

```
Step 12: Full automated suite (final run)
  $ bun test
  Purpose: Catch any regressions from manual testing changes
  Gate: ALL tests pass

Step 13: Sign-off
  Verify all 12 acceptance criteria are met
  Document any exceptions for non-gate criteria
```

### Estimated Total QA Time

| Phase | Automated | Manual | Total |
|-------|-----------|--------|-------|
| Phase 1: Foundation | 5 min | 0 | 5 min |
| Phase 2: Regression | 0 | 40-120 min | 40-120 min |
| Phase 3: Feature Verification | 0 | 60 min | 60 min |
| Phase 4: State Management | 0 | 45-60 min | 45-60 min |
| Phase 5: Final Verification | 5 min | 10 min | 15 min |
| **Total** | **10 min** | **155-250 min** | **~3-4.5 hours** |

---

## Appendix: Test Data Requirements

### Test Repository Setup

For integration tests (Category 4) and state management tests (Category 5), create a dedicated test repository with:

1. A simple web app (HTML + JS) to give Claude something to build
2. At least one existing plan file in `docs/plans/`
3. At least one open PR on GitHub
4. `.gitignore` with `.*.local.md` pattern
5. Plugin installed and working

### Mock Data Files

For hook script tests (Category 2), the test file should generate JSON payloads programmatically. No static fixture files needed -- the mock JSON is simple enough to construct inline.

---

---QUESTIONS FOR USER---

1. **Should we add BATS as a dependency for hook script testing, or keep all tests in Bun?**
   - Why: BATS (Bash Automated Testing System) is the industry standard for bash script testing and provides richer bash-specific assertions. However, it adds a new dependency and a second test runner. Keeping tests in Bun (using `Bun.spawn()` to pipe JSON into scripts) keeps everything in one `bun test` run.
   - Options:
     - (a) All tests in Bun using `Bun.spawn()` -- zero new dependencies, single test runner, simpler CI
     - (b) Hook tests in BATS, frontmatter tests in Bun -- industry standard for bash, but two test runners
     - (c) All tests in Bun now, migrate to BATS later if hook complexity grows
   - Recommend: (a) -- the hook scripts are simple (grep + jq on stdin). Bun's `Bun.spawn()` gives us exit code + stdout + stderr assertions, which is sufficient. Adding BATS adds CI complexity (install step) for marginal benefit. If we later add 10+ hook scripts, reconsider.

2. **Should the lfg/slfg regression tests be automated or remain manual?**
   - Why: These are the highest-priority tests but also the longest-running (20-60 min each) and most expensive (they consume API tokens by running full Claude sessions). Automating them as CI tests would require a Claude Code headless runner and API key in CI secrets, which is significant infrastructure.
   - Options:
     - (a) Manual only -- run before each release, document results in a test log
     - (b) Automated via Claude Code headless mode (`claude --headless`) in CI -- full E2E but expensive and slow
     - (c) Manual for now, with a tracking issue to automate when Claude Code's `--headless` mode stabilizes
   - Recommend: (c) -- the headless mode is still evolving. Manual testing for the initial release is pragmatic. File a tracking issue to automate once the headless API is stable and we can budget the API costs.

3. **Should we require a pre-release context budget measurement, or treat it as informational?**
   - Why: The PM spec targets <150% context consumption (down from ~316%). Measuring this precisely requires running a standardized prompt sequence before and after changes, which is time-consuming and somewhat subjective. We could make it a hard gate (block release if context increases) or a soft metric (measure and report, but don't block).
   - Options:
     - (a) Hard gate: measure before and after, block release if context increases
     - (b) Soft metric: measure and report, release proceeds regardless
     - (c) Hard gate on regression (must not increase), soft metric on improvement target (<150%)
   - Recommend: (c) -- we must not regress (make context worse), but the specific <150% target depends on Claude's runtime behavior which we can't fully control. Gate on "no regression" and track improvement as a metric.

4. **How should we handle hook script test failures when `jq` is not installed?**
   - Why: The hook scripts depend on `jq` for JSON parsing. On macOS it's typically installed via Homebrew, and on ubuntu-latest (CI) it's pre-installed. But a contributor without jq would get cryptic test failures.
   - Options:
     - (a) Add a `jq` check as the first test in hook-scripts.test.ts -- skip all hook tests with a clear message if jq is missing
     - (b) Add `apt-get install -y jq` to the CI workflow as a precaution
     - (c) Both: CI ensures jq is present, and the test file gracefully skips with a message if not found locally
   - Recommend: (c) -- belt and suspenders. The CI step ensures tests always run in CI. The graceful skip ensures contributors get a helpful message instead of cryptic failures.

5. **Should we add a `--dry-run` flag to hook scripts for easier manual testing?**
   - Why: Currently, testing hooks manually requires piping JSON from the terminal. A `--dry-run` flag could accept a command string directly (e.g., `./validate-bash.sh --dry-run "git push --force"`) and output the decision, making manual verification easier during development.
   - Options:
     - (a) No dry-run flag -- keep scripts simple, test via Bun only
     - (b) Add a dry-run flag that wraps the input in the expected JSON format
     - (c) Add a separate `test-hook.sh` helper script that wraps any hook in dry-run mode
   - Recommend: (a) -- the scripts should remain as simple as possible (they run on every tool call). Adding argument parsing adds complexity and potential bugs. Developers can test with a one-liner: `echo '{"tool_input":{"command":"git push --force"}}' | bash validate-bash.sh`.

---END QUESTIONS---

---

## Questions & Answers

### Q1: Hook script testing approach
**Answer**: Bun spawning bash — zero new dependencies, pipe mock JSON via Bun.spawn(), assert on exit codes + JSON output
**Impact**: All hook tests run within existing `bun test` pipeline. No BATS dependency needed.

### Q2: lfg/slfg chain regression testing
**Answer**: Manual now, automate later — manual testing for this release, automate in future CI job
**Impact**: Full chain regression requires 20-60 min. Manual testing before release, with a plan to build automated fixtures later.

### Q3: Context budget measurement
**Answer**: Gate on no-regression, soft on target — block release if budget increases, target <150% but don't block if not met
**Impact**: Ensures changes never make context budget worse. The 150% target is aspirational for this release.
