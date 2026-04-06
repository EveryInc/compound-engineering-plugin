# Handoff

This content is loaded when Phase 4 begins — after the requirements document is written and reviewed.

---

#### 4.1 Present Next-Step Options

Present next steps using the platform's blocking question tool when available (see Interaction Rules in the main skill). Otherwise present numbered options in chat and end the turn.

If `Resolve Before Planning` contains any items:
- Ask the blocking questions now, one at a time, by default
- If the user explicitly wants to proceed anyway, first convert each remaining item into an explicit decision, assumption, or `Deferred to Planning` question
- If the user chooses to pause instead, present the handoff as paused or blocked rather than complete
- Do not offer `Proceed to planning` or `Proceed directly to work` while `Resolve Before Planning` remains non-empty

**Question when no blocking questions remain:** "Brainstorm complete. What would you like to do next?"

**Question when blocking questions remain and user wants to pause:** "Brainstorm paused. Planning is blocked until the remaining questions are resolved. What would you like to do next?"

Present only the options that apply:
- **Proceed to planning (Recommended)** - Run `/ce:plan` for structured implementation planning
- **Proceed directly to work** - Only offer this when scope is lightweight, success criteria are clear, scope boundaries are clear, and no meaningful technical or research questions remain
- **Run additional document review** - Offer this only when a requirements document exists. Runs another pass for further refinement
- **Ask more questions** - Continue clarifying scope, preferences, or edge cases
- **Share to Proof** - Offer this only when a requirements document exists
- **Done for now** - Return later

If the direct-to-work gate is not satisfied, omit that option entirely.

#### 4.2 Handle the Selected Option

**If user selects "Proceed to planning (Recommended)":**

Immediately run `/ce:plan` in the current session. Pass the requirements document path when one exists; otherwise pass a concise summary of the finalized brainstorm decisions. Do not print the closing summary first.

**If user selects "Proceed directly to work":**

Immediately run `/ce:work` in the current session using the finalized brainstorm output as context. If a compact requirements document exists, pass its path. Do not print the closing summary first.

**If user selects "Share to Proof":**

```bash
CONTENT=$(cat docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md)
TITLE="Requirements: <topic title>"
RESPONSE=$(curl -s -X POST https://www.proofeditor.ai/share/markdown \
  -H "Content-Type: application/json" \
  -d "$(jq -n --arg title "$TITLE" --arg markdown "$CONTENT" --arg by "ai:compound" '{title: $title, markdown: $markdown, by: $by}')")
PROOF_URL=$(echo "$RESPONSE" | jq -r '.tokenUrl')
```

Display the URL prominently: `View & collaborate in Proof: <PROOF_URL>`

If the curl fails, skip silently. Then return to the Phase 4 options.

**If user selects "Ask more questions":** Return to Phase 1.3 (Collaborative Dialogue) and continue asking the user questions one at a time to further refine the design. Probe deeper into edge cases, constraints, preferences, or areas not yet explored. Continue until the user is satisfied, then return to Phase 4. Do not show the closing summary yet.

**If user selects "Run additional document review":**

Load the `document-review` skill and apply it to the requirements document for another pass.

When document-review returns "Review complete", return to the normal Phase 4 options and present only the options that still apply. Do not show the closing summary yet.

#### 4.3 Closing Summary

Use the closing summary only when this run of the workflow is ending or handing off, not when returning to the Phase 4 options.

When complete and ready for planning, display:

```text
Brainstorm complete!

Requirements doc: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # if one was created

Key decisions:
- [Decision 1]
- [Decision 2]

Recommended next step: `/ce:plan`
```

If the user pauses with `Resolve Before Planning` still populated, display:

```text
Brainstorm paused.

Requirements doc: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # if one was created

Planning is blocked by:
- [Blocking question 1]
- [Blocking question 2]

Resume with `/ce:brainstorm` when ready to resolve these before planning.
```
