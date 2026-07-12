# Native Browser Driver Selection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `ce-test-browser` prefer a capable host-native integrated browser, fall back to `agent-browser`, and continue rejecting ad hoc standalone browser automation.

**Architecture:** Separate browser-driver selection from manual versus pipeline orchestration. Select one qualifying driver before testing, express the test loop in driver-neutral operations, and keep `agent-browser` commands in a conditional reference used only by the fallback path.

**Tech Stack:** Markdown skill instructions, Bun contract tests.

## Global Constraints

- Host-native means a browser-control surface embedded in or directly owned by the active harness, not a separately configured browser extension or MCP or a newly installed automation stack.
- A host-native API named Playwright remains host-native; standalone Playwright and Puppeteer are prohibited substitutes.
- Pipeline mode controls prompting and server orchestration, not driver choice or visibility.
- Once selected, one browser driver owns the entire run.

---

### Task 1: Pin the browser-driver policy

**Files:**
- Create: `tests/ce-test-browser-driver-policy.test.ts`
- Modify: `skills/ce-test-browser/SKILL.md`
- Modify: `skills/ce-test-browser/references/pipeline-orchestration.md`

**Interfaces:**
- Consumes: the existing `ce-test-browser` manual and `mode:pipeline` workflows.
- Produces: a native-first, `agent-browser`-fallback driver-selection contract used by every browser action.

- [ ] **Step 1: Write the failing contract tests**

Assert that the skill prefers a capable host-native browser, falls back to `agent-browser`, treats embedded Playwright APIs as native, prohibits standalone alternatives, keeps one driver per run, and does not make pipeline mode force `agent-browser` or hidden execution.

- [ ] **Step 2: Run the focused test and verify RED**

Run: `bun test tests/ce-test-browser-driver-policy.test.ts`

Expected: failures showing the current categorical `agent-browser` mandate and pipeline-specific command wording violate the new contract.

- [ ] **Step 3: Implement the minimal skill policy**

Replace the categorical mandate with capability-based selection, rewrite browser actions as driver-neutral operations, and move CLI-specific command recipes into a new conditional reference.

- [ ] **Step 4: Run the focused test and verify GREEN**

Run: `bun test tests/ce-test-browser-driver-policy.test.ts`

Expected: all policy tests pass.

### Task 2: Align user-facing documentation

**Files:**
- Modify: `docs/skills/ce-test-browser.md`
- Modify: `docs/skills/README.md`

**Interfaces:**
- Consumes: the driver-selection contract from Task 1.
- Produces: accurate skill catalog and detailed documentation for native and fallback behavior.

- [ ] **Step 1: Remove exclusive-agent-browser claims**

Document host-native selection, the portable fallback, one-driver-per-run behavior, and visible-but-non-blocking integrated browser execution.

- [ ] **Step 2: Run focused and convention tests**

Run: `bun test tests/ce-test-browser-driver-policy.test.ts tests/skill-conventions.test.ts`

Expected: all tests pass.

### Task 3: Verify and compound the learning

**Files:**
- Create: `docs/solutions/architecture-patterns/host-native-browser-driver-selection.md`
- Optionally update: `CONCEPTS.md` when `ce-compound` vocabulary criteria qualify a term.

**Interfaces:**
- Consumes: verified implementation and the design decisions from this plan.
- Produces: grounded durable guidance about separating harness-native capabilities from substitute automation tools.

- [ ] **Step 1: Run repository validation**

Run: `bun test` and `bun run release:validate`

Expected: both commands exit successfully.

- [ ] **Step 2: Run `ce-compound` in headless mode**

Capture one knowledge-track learning: browser-driver policy should distinguish first-class host-native capabilities from ad hoc substitute tooling, while keeping orchestration mode independent from driver visibility.

- [ ] **Step 3: Validate the compounded document**

Run the `ce-compound` frontmatter and grounded-claim validators required by that skill, then re-run the focused contract test.

Expected: documentation validation and the focused policy test pass.
