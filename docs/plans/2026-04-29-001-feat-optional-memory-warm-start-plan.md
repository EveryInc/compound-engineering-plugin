---
title: Add Optional CE Memory Warm-Start
type: feat
status: complete
date: 2026-04-29
---

# Add Optional CE Memory Warm-Start

## Summary

Add a portable CE memory researcher and wire it into planning, work execution, debugging, and compounding as best-effort context. The workflow should benefit from local Neo4j memory when available without making CE depend on it.

## Requirements

- R1. Add a `ce-memory-researcher` agent that can read persistent memory when Neo4j MCP tools are available.
- R2. Memory lookup must be optional and never block CE workflows when unavailable.
- R3. Memory findings must be supplementary. They cannot override the origin document, current repo evidence, or verified execution results.
- R4. `ce-plan` should warm-start Phase 1 with relevant decisions, prior errors, preferences, and cross-project patterns.
- R5. `ce-work`, `ce-debug`, and `ce-compound` should consult memory only where it improves execution context without changing scope or adding mandatory prompts.
- R6. Contract tests should lock in the optional behavior and agent presence.

## Implementation Units

- U1. **Memory Researcher Agent**

**Goal:** Add a CE-portable agent for persistent memory lookup.

**Files:**
- Create: `plugins/compound-engineering/agents/ce-memory-researcher.agent.md`

**Approach:**
- Support warm-start, context, recall, and explicit remember operations.
- Prefer Neo4j MCP tools when connected.
- Return a clear unavailable result instead of failing when tools are absent.
- Keep read operations as the default; write only on an explicit remember request.

**Test scenarios:**
- Happy path: agent instructions define warm-start output and Neo4j read behavior.
- Error path: agent instructions specify unavailable behavior when memory tools are missing.
- Safety path: agent instructions prevent memory from overriding current evidence.

**Verification:**
- Contract tests prove the agent exists and carries the optional/supplementary behavior.

- U2. **Workflow Wiring**

**Goal:** Integrate memory at the safest workflow points.

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-plan/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-work/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-debug/SKILL.md`
- Modify: `plugins/compound-engineering/skills/ce-compound/SKILL.md`

**Approach:**
- Add `ce-plan` Phase 1.0 before standard local research.
- Add `ce-work` memory context after plan reading and before task creation.
- Add `ce-debug` prior-error recall after triage and before reproduction.
- Add `ce-compound` persistent memory recall alongside existing auto-memory support.

**Test scenarios:**
- Happy path: each workflow references `ce-memory-researcher` at the intended stage.
- Error path: each workflow states unavailable memory must not fail the parent workflow.
- Scope path: work execution memory cannot mutate plan scope.

**Verification:**
- Targeted contract tests pass.

- U3. **Contract Tests and Install Verification**

**Goal:** Keep the behavior durable across future edits and reinstall the local fork.

**Files:**
- Modify: `tests/pipeline-review-contract.test.ts`
- Update: `docs/plans/2026-04-29-001-feat-optional-memory-warm-start-plan.md`

**Approach:**
- Add tests for agent presence, optional memory behavior, and workflow placement.
- Run targeted tests and release validation.
- Reinstall the local fork into OpenCode after verification.

**Test scenarios:**
- Contract: `ce-plan` memory warm-start appears before local research.
- Contract: `ce-code-review` is not wired to persistent memory by default.
- Contract: unavailable memory is explicitly non-blocking.

**Verification:**
- Targeted tests and release validation pass.

## Verification Notes

- `bun test tests/pipeline-review-contract.test.ts` passed.
- `bun test tests/converter.test.ts tests/opencode-writer.test.ts tests/release-metadata.test.ts tests/pipeline-review-contract.test.ts` passed.
- `bun run release:validate` passed and reported `52 agents`, `35 skills`, and `0 MCP servers`.
