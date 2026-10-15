# Standalone Report and Apply

Read this at the start of a standalone run, and again before applying any reported finding. It covers the empty-scope question, when to report instead of applying, the report itself, and how a later request to apply findings works.

## Empty scope

When Step 1 finds no scope, ask the user what to simplify rather than guessing. Use the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question.

## Report or apply

Report first, and leave every file unchanged, unless the request tells you to make the changes without review ("just fix them", "no need to check with me", "remove the useless comments without asking"). A request to audit, find, review, or list always reports first. When the request does say to fix, apply per Step 3, verify per Step 4, and report what changed in the shape below.

## The report

- Open with one line: what scope was covered, which reviewers ran, and the totals per group.
- Number findings continuously across three groups: **Delete**, **Refactor**, and **Encode as a test**. Each finding names its location, what is wrong, and the evidence the reviewer returned. A test deletion carries what failure the test could catch, which remaining test covers that (or that the test asserts nothing that could fail), any production seam the deletion unlocks, and how that was checked.
- When several comments share one cause in the code, report one refactor finding for the cause, not one finding per comment.
- List tests that fail before any change separately, as possible defects, never as deletions.
- When nothing qualifies, say so in one line, naming what was covered.
- For a scope too large for one reviewer to read in full, you may split each review by top-level directory. The report then gives totals per group and the strongest findings, and offers the rest on request.
- End by saying how to apply: all findings, specific numbers, or a described subset.

## Applying reported findings

Apply only the findings the user picked. Before editing for a finding, re-check it against the current code. If the code under it changed since the report, skip it and say why. Apply the rest under Step 3's rules, verify under Step 4, and summarize under Step 5, listing applied and skipped findings by number.
