# Handoff

This content is loaded when Phase 4 begins — after the requirements document is written and reviewed.

---

#### 4.1 Present Next-Step Options

Present the options using the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If no question tool is available, present the numbered options in chat and wait for the user's reply before proceeding.

If `Resolve Before Planning` contains any items:
- Ask the blocking questions now, one at a time, by default
- If the user explicitly wants to proceed anyway, first convert each remaining item into an explicit decision, assumption, or `Deferred to Planning` question
- If the user chooses to pause instead, present the handoff as paused or blocked rather than complete
- Do not offer `Proceed to planning` or `Proceed directly to work` while `Resolve Before Planning` remains non-empty

**Question when no blocking questions remain:** "Brainstorm complete. What would you like to do next?"

**Question when blocking questions remain and user wants to pause:** "Brainstorm paused. Planning is blocked until the remaining questions are resolved. What would you like to do next?"

Present only the options that apply, keeping the total at 4 or fewer:

- **Proceed to planning (Recommended)** - Move to `/ce-plan` for structured implementation planning. Shown only when `Resolve Before Planning` is empty.
- **Proceed directly to work** - Skip planning and move to `/ce-work`; suited to lightweight, well-defined changes. Shown only when `Resolve Before Planning` is empty **and** scope is lightweight, success criteria are clear, scope boundaries are clear, and no meaningful technical or research questions remain (the "direct-to-work gate").
- **Continue the brainstorm** - Answer more clarifying questions to tighten scope, edge cases, and preferences. Always shown.
- **Open in Proof (web app) — review and comment to iterate with the agent** - Open the doc in Every's Proof editor, iterate with the agent via comments, or copy a link to share with others. Shown only when a requirements document exists **and** the direct-to-work gate is not satisfied (when both conditions collide, `Proceed directly to work` takes priority and Proof becomes reachable via free-form request).
- **Done for now** - Pause; the requirements doc is saved and can be resumed later. Always shown.

**Surface additional document review contextually, not as a menu fixture:** When the prior document-review pass surfaced residual P0/P1 findings that the user has not addressed, mention them adjacent to the menu and offer another review pass in prose (e.g., "Document review flagged 2 P1 findings you may want to address — want me to run another pass?"). Do not add it to the option list.

#### 4.2 Handle the Selected Option

**If user selects "Proceed to planning (Recommended)":**

Immediately run `/ce-plan` in the current session. Pass the requirements document path when one exists; otherwise pass a concise summary of the finalized brainstorm decisions. Do not print the closing summary first.

**If user selects "Proceed directly to work":**

Immediately run `/ce-work` in the current session using the finalized brainstorm output as context. If a compact requirements document exists, pass its path. Do not print the closing summary first.

**If user selects "Continue the brainstorm":** Return to Phase 1.3 (Collaborative Dialogue) and continue asking the user clarifying questions one at a time to further refine scope, edge cases, constraints, and preferences. Continue until the user is satisfied, then return to Phase 4. Do not show the closing summary yet.

**If user selects "Open in Proof (web app) — review and comment to iterate with the agent":**

Load the `proof` skill in HITL-review mode with:

- **source file:** `docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md`
- **doc title:** `Requirements: <topic title>`
- **identity:** `ai:compound-engineering` / `Compound Engineering`
- **recommended next step:** `/ce:plan` (shown in the proof skill's final terminal output)

Follow `references/hitl-review.md` in the proof skill. It uploads the doc, prompts the user for review in Proof's web UI, ingests each thread by reading it fresh and replying in-thread, applies agreed edits as tracked suggestions, and syncs the final markdown back to the source file atomically on proceed.

When the proof skill returns control:

- `status: proceeded` with `localSynced: true` → the requirements doc on disk now reflects the review. Return to the Phase 4 options and re-render the menu (the doc may have changed substantially during review, so option eligibility can shift — re-evaluate `Resolve Before Planning`, direct-to-work gate, and residual document-review findings against the updated doc).
- `status: proceeded` with `localSynced: false` → the reviewed version lives in Proof at `docUrl` but the local copy is stale. Offer to pull the Proof doc to `localPath` using the proof skill's Pull workflow. Re-render the Phase 4 menu after the pull completes (or is declined). If the pull was declined, include a one-line note above the menu that `<localPath>` is stale vs. Proof — otherwise `Proceed to planning` / `Proceed directly to work` will silently read the pre-review copy.
- `status: done_for_now` → the doc on disk may be stale if the user edited in Proof before leaving. Offer to pull the Proof doc to `localPath` so the local requirements file stays in sync, then return to the Phase 4 options. If the pull was declined, include the stale-local note above the menu. `done_for_now` means the user stopped the HITL loop without syncing — it does not mean they ended the whole brainstorm; they may still want to proceed to planning or continue the brainstorm.
- `status: aborted` → fall back to the Phase 4 options without changes.

If the initial upload fails (network error, Proof API down), retry once after a short wait. If it still fails, tell the user the upload didn't succeed and briefly explain why, then return to the Phase 4 options — don't leave them wondering why the option did nothing.

**If the user asks to run another document review** (either from the contextual prompt when P0/P1 findings remain, or by free-form request):

Load the `ce-doc-review` skill and apply it to the requirements document for another pass. When ce-doc-review returns "Review complete", return to the normal Phase 4 options and present only the options that still apply. Do not show the closing summary yet.

**If user selects "Done for now":** Display the closing summary (see 4.3) and end the turn.

#### 4.3 Closing Summary

Use the closing summary only when this run of the workflow is ending or handing off, not when returning to the Phase 4 options.

When complete and ready for planning, display:

```text
Brainstorm complete!

Requirements doc: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # if one was created

Key decisions:
- [Decision 1]
- [Decision 2]

Recommended next step: `/ce-plan`
```

If the user pauses with `Resolve Before Planning` still populated, display:

```text
Brainstorm paused.

Requirements doc: docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md  # if one was created

Planning is blocked by:
- [Blocking question 1]
- [Blocking question 2]

Resume with `/ce-brainstorm` when ready to resolve these before planning.
```
