---
name: ce-debug
description: 'Systematically find root causes and fix bugs. Use when debugging errors, investigating test failures, reproducing bugs from issue trackers (GitHub, Linear, Jira), or when stuck on a problem after failed fix attempts. Also use when the user says ''debug this'', ''why is this failing'', ''fix this bug'', ''trace this error'', or pastes stack traces, error messages, or issue references.'
argument-hint: "[issue reference, error message, test path, or description of broken behavior]"
---

# Debug and Fix

Find root causes, then fix them. This skill investigates bugs systematically — tracing the full causal chain before proposing a fix — and optionally implements the fix with test-first discipline.

<bug_description> #$ARGUMENTS </bug_description>

## Core Principles

These principles govern every phase. They are repeated at decision points because they matter most when the pressure to skip them is highest.

1. **Investigate before fixing.** Do not propose a fix until you can explain the full causal chain from trigger to symptom with no gaps. "Somehow X leads to Y" is a gap.
2. **Predictions for uncertain links.** When the causal chain has uncertain or non-obvious links, form a prediction — something in a different code path or scenario that must also be true. If the prediction is wrong but a fix "works," you found a symptom, not the cause. When the chain is obvious (missing import, clear null reference), the chain explanation itself is sufficient.
3. **One change at a time.** Test one hypothesis, change one thing. If you're changing multiple things to "see if it helps," stop — that is shotgun debugging.
4. **When stuck, diagnose why — don't just try harder.**

## Execution Flow

| Phase | Name | Purpose |
|-------|------|---------|
| 0 | Triage | Parse input, fetch issue if referenced, proceed to investigation |
| 1 | Investigate | Reproduce the bug, trace the code path |
| 2 | Root Cause | Form hypotheses with predictions for uncertain links, test them, **causal chain gate**, smart escalation |
| 3 | Fix | Only if user chose to fix. Test-first fix with workspace safety checks |
| 4 | Close | Structured summary, handoff options |

All phases self-size — a simple bug flows through them in seconds, a complex bug spends more time in each naturally. No complexity classification, no phase skipping.

---

### Phase 0: Triage

Parse the input and reach a clear problem statement.

**If the input references an issue tracker**, fetch it:
- GitHub (`#123`, `org/repo#123`, github.com URL): Parse the issue reference from `<bug_description>` and fetch with `gh issue view <number> --json title,body,comments,labels`. For URLs, pass the URL directly to `gh`.
- Other trackers (Linear URL/ID, Jira URL/key, any tracker URL): Attempt to fetch using available MCP tools or by fetching the URL content. If the fetch fails — auth, missing tool, non-public page — ask the user to paste the relevant issue content.

Extract reported symptoms, expected behavior, reproduction steps, and environment details. Then proceed to Phase 1.

**Everything else** (stack traces, test paths, error messages, descriptions of broken behavior): Proceed directly to Phase 1.

**Questions:**
- Do not ask questions by default — investigate first (read code, run tests, trace errors)
- Only ask when a genuine ambiguity blocks investigation and cannot be resolved by reading code or running tests
- When asking, ask one specific question

**Prior-attempt awareness:** If the user indicates prior failed attempts ("I've been trying", "keeps failing", "stuck"), ask what they have already tried before investigating. This avoids repeating failed approaches and is one of the few cases where asking first is the right call.

---

### Phase 1: Investigate

#### 1.1 Reproduce the bug

Confirm the bug exists and understand its behavior. Run the test, trigger the error, follow reported reproduction steps — whatever matches the input.

- **Browser bugs:** Prefer `agent-browser` if installed. Otherwise use whatever works — MCP browser tools, direct URL testing, screenshot capture, etc.
- **Manual setup required:** If reproduction needs specific conditions the agent cannot create alone (data states, user roles, external services, environment config), document the exact setup steps and guide the user through them. Clear step-by-step instructions save significant time even when the process is fully manual.
- **Does not reproduce after 2-3 attempts:** Read `references/investigation-techniques.md` for intermittent-bug techniques.
- **Cannot reproduce at all in this environment:** Document what was tried and what conditions appear to be missing.

#### 1.2 Trace the code path

Read the relevant source files. Follow the execution path from entry point to where the error manifests. Trace backward through the call chain:

- Start at the error
- Ask "where did this value come from?" and "who called this?"
- Keep going upstream until finding the point where valid state first became invalid
- Do not stop at the first function that looks wrong — the root cause is where bad state originates, not where it is first observed

As you trace:
- Check recent changes in files you are reading: `git log --oneline -10 -- [file]`
- If the bug looks like a regression ("it worked before"), use `git bisect` (see `references/investigation-techniques.md`)
- Check the project's observability tools for additional evidence:
  - Error trackers (Sentry, AppSignal, Datadog, BetterStack, Bugsnag)
  - Application logs
  - Browser console output
  - Database state
- Each project has different systems available; use whatever gives a more complete picture

---

### Phase 2: Root Cause

*Reminder: investigate before fixing. Do not propose a fix until you can explain the full causal chain from trigger to symptom with no gaps.*

Read `references/anti-patterns.md` before forming hypotheses.

**Form hypotheses** ranked by likelihood. For each, state:
- What is wrong and where (file:line)
- The causal chain: how the trigger leads to the observed symptom, step by step
- **For uncertain links in the chain**: a prediction — something in a different code path or scenario that must also be true if this link is correct

When the causal chain is obvious and has no uncertain links (missing import, clear type error, explicit null dereference), the chain explanation itself is the gate — no prediction required. Predictions are a tool for testing uncertain links, not a ritual for every hypothesis.

Before forming a new hypothesis, review what has already been ruled out and why.

**Causal chain gate:** Do not proceed to Phase 3 until you can explain the full causal chain — from the original trigger through every step to the observed symptom — with no gaps. The user can explicitly authorize proceeding with the best-available hypothesis if investigation is stuck.

*Reminder: if a prediction was wrong but the fix appears to work, you found a symptom. The real cause is still active.*

#### Present findings

Once the root cause is confirmed, present:
- The root cause (causal chain summary with file:line references)
- The proposed fix and which files would change
- Which tests to add or modify to prevent recurrence (specific test file, test case description, what the assertion should verify)
- Whether existing tests should have caught this and why they did not

Then offer next steps (use the platform's question tool — `AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini — or present numbered options and wait):

1. **Fix it now** — proceed to Phase 3
2. **View in Proof** (`/proof`) — for easy review and sharing with others
3. **Rethink the design** (`/ce:brainstorm`) — only when the root cause reveals a design problem (see below)

Do not assume the user wants action right now. The test recommendations are part of the diagnosis regardless of which path is chosen.

**When to suggest brainstorm:** Only when investigation reveals the bug cannot be properly fixed within the current design — the design itself needs to change. Concrete signals observable during debugging:

- **The root cause is a wrong responsibility or interface**, not wrong logic. The module should not be doing this at all, or the boundary between components is in the wrong place. (Observable: the fix requires moving responsibility between modules, not correcting code within one.)
- **The requirements are wrong or incomplete.** The system behaves as designed, but the design does not match what users actually need. The "bug" is really a product gap. (Observable: the code is doing exactly what it was written to do — the spec is the problem.)
- **Every fix is a workaround.** You can patch the symptom, but cannot articulate a clean fix because the surrounding code was built on an assumption that no longer holds. (Observable: you keep wanting to add special cases or flags rather than a direct correction.)

Do not suggest brainstorm for bugs that are large but have a clear fix — size alone does not make something a design problem.

#### Smart escalation

If 2-3 hypotheses are exhausted without confirmation, diagnose why:

| Pattern | Diagnosis | Next move |
|---------|-----------|-----------|
| Hypotheses point to different subsystems | Architecture/design problem, not a localized bug | Present findings, suggest `/ce:brainstorm` |
| Evidence contradicts itself | Wrong mental model of the code | Step back, re-read the code path without assumptions |
| Works locally, fails in CI/prod | Environment problem | Focus on env differences, config, dependencies, timing |
| Fix works but prediction was wrong | Symptom fix, not root cause | The real cause is still active — keep investigating |

Present the diagnosis to the user before proceeding.

---

### Phase 3: Fix

*Reminder: one change at a time. If you are changing multiple things, stop.*

If the user chose Proof or brainstorm at the end of Phase 2, skip this phase — the skill's job was the diagnosis.

**Workspace check:** Before editing files, check for uncommitted changes (`git status`). If the user has unstaged work in files that need modification, confirm before editing — do not overwrite in-progress changes.

**Test-first:**
1. Write a failing test that captures the bug (or use the existing failing test)
2. Verify it fails for the right reason — the root cause, not unrelated setup
3. Implement the minimal fix — address the root cause and nothing else
4. Verify the test passes
5. Run the broader test suite for regressions

**3 failed fix attempts = smart escalation.** Diagnose using the same table from Phase 2. If fixes keep failing, the root cause identification was likely wrong. Return to Phase 2.

**Conditional defense-in-depth** (trigger: grep for the root-cause pattern found it in other files):
Check whether the same gap exists at those locations. Skip when the root cause is a one-off error.

**Conditional post-mortem** (trigger: the bug was in production, OR the pattern appears in 3+ locations):
How was this introduced? What allowed it to survive? If a systemic gap was found: "This pattern appears in N other files. Want to capture it with `/ce:compound`?"

---

### Phase 4: Close

**Structured summary:**

```
## Debug Summary
**Problem**: [What was broken]
**Root Cause**: [Full causal chain, with file:line references]
**Recommended Tests**: [Tests to add/modify to prevent recurrence, with specific file and assertion guidance]
**Fix**: [What was changed — or "diagnosis only" if Phase 3 was skipped]
**Prevention**: [Test coverage added; defense-in-depth if applicable]
**Confidence**: [High/Medium/Low]
```

**Handoff options** (use platform question tool, or present numbered options and wait):
1. Commit the fix (if Phase 3 ran)
2. Document as a learning (`/ce:compound`)
3. Post findings to the issue (if entry came from an issue tracker) — convey: confirmed root cause, verified reproduction steps, relevant code references, and suggested fix direction; keep it concise and useful for whoever picks up the issue next
4. View in Proof (`/proof`) — for easy review and sharing with others
5. Done
