# Handoff

This content is loaded when Phase 4 begins — after the requirements document is written.

---

#### 4.1 Present Next-Step Options

The Phase 4 menu's visible option count varies by state: no requirements doc hides the review and Proof options, `OUTPUT_FORMAT=html` also hides the review option (ce-doc-review is markdown-only today), unresolved `Resolve Before Planning` hides `Plan implementation` and `Build it now`, a failing direct-to-work gate hides `Build it now`. Count the visible options for the current state and choose the rendering mode accordingly:

- **4 or fewer visible:** use the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex; `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension)). This is the default.
- **5 or more visible:** render as a numbered list in chat. This is the narrow option-overflow fallback; trimming would hide legitimate choices (plan, review, Proof, build, refine, pause are all distinct destinations). Include a hint that free-form input is accepted ("Pick a number or describe what you want.") so the numbered list retains the blocking tool's open-endedness.

Never silently skip the question.

If `Resolve Before Planning` contains any items:
- Ask the blocking questions now, one at a time, by default
- If the user explicitly wants to proceed anyway, first convert each remaining item into an explicit decision, assumption, or `Deferred to Planning` question
- If the user chooses to pause instead, present the handoff as paused or blocked rather than complete
- Do not offer the `Plan implementation` or `Build it now` options while `Resolve Before Planning` remains non-empty

In both preambles below, the "Pick a number or describe what you want." hint applies only in numbered-list mode. When using the blocking tool, omit that line and pass the remaining stem as the question.

**Path format:** Use absolute paths for chat-output file references — relative paths are not auto-linked as clickable in most terminals.

**Preamble when no blocking questions remain:**

```
Brainstorm complete.

Requirements doc: <absolute path to requirements doc>  # omit line if no doc was created

What would you like to do next? (Pick a number or describe what you want.)
```

**Preamble when blocking questions remain and user wants to pause:**

```
Brainstorm paused. Planning is blocked until the remaining questions are resolved.

Requirements doc: <absolute path to requirements doc>  # omit line if no doc was created

What would you like to do next? (Pick a number or describe what you want.)
```

Present only the options that apply. Renumber so visible options stay contiguous starting at 1.

1. **Plan implementation with `ce-plan` (Recommended)** - Move to `ce-plan` for structured implementation planning. Shown only when `Resolve Before Planning` is empty.
2. **Agent review of requirements doc with `ce-doc-review`** - Dispatch reviewer agents to check the doc for coherence, feasibility, scope, and other persona-specific issues; auto-apply safe fixes; route remaining findings interactively. Shown only when a requirements document exists **and `OUTPUT_FORMAT=md`** — ce-doc-review's walkthrough applies markdown-only mutations (`##`/`###` heading inserts, single-file markdown edits via apply-set) and would corrupt an HTML artifact, so HTML brainstorms skip this option until ce-doc-review gains HTML-aware mutation support. Under HTML mode, surface a one-line note above the menu: `Agent review unavailable in output:html mode — ce-doc-review is markdown-only today. Switch to output:md if you want a review pass.`
3. **Publish to Proof — shareable link** - Publish the requirements doc to Every's Proof editor and get a shareable link to read, comment on, or share with others. One-way: the local doc stays canonical. Shown only when a requirements document exists. **Render only when `OUTPUT_FORMAT=md`** (Proof operates on markdown and cannot ingest HTML).
3. **Open in browser** — open the HTML requirements file locally for review and sharing. Shown only when a requirements document exists. **Render only when `OUTPUT_FORMAT=html`.** Replaces "Publish to Proof" at the same slot under exclusive output mode — the doc is either markdown OR HTML, never both, so exactly one of the two labels applies per run.
4. **Build it now with `ce-work` (skip planning)** - Skip planning and move to `ce-work`; suited to lightweight, well-defined changes. Shown only when `Resolve Before Planning` is empty **and** scope is lightweight, success criteria are clear, scope boundaries are clear, and no meaningful technical or research questions remain (the "direct-to-work gate").
5. **More clarifying questions to sharpen the doc** - Keep refining scope, edge cases, constraints, and preferences through further dialogue. Always shown.
6. **Done for now** - Pause; the requirements doc is saved and can be resumed later. Always shown.

**Post-review nudge (subsequent rounds only):** If the user has already run `ce-doc-review` this session and residual P0/P1 findings remain unaddressed, add a one-line prose nudge adjacent to the menu (e.g., "Document review flagged 2 P1 findings you may want to address — pick \"Agent review of requirements doc\" to run another pass."). Reference the option by label, not number: the menu renumbers when `Resolve Before Planning` hides `Plan implementation` and `Build it now`, so a hardcoded option number can point users at the wrong action. Do not add a separate menu option; reuse the existing agent-review option. Suppress this nudge when `OUTPUT_FORMAT=html` — the agent-review option is hidden in that mode, so the nudge would point users at a missing action.

#### 4.2 Handle the Selected Option

Selections may be the literal option label (when the user types the label or a close paraphrase) or the option number. Match numbers against the currently-rendered (post-trim) list. Free-form input that doesn't match an option or describe an alternative action should be treated as clarification — ask a follow-up rather than guessing.

**If user selects "Plan implementation with `ce-plan` (Recommended)":**

Immediately load the `ce-plan` skill in the current session. Pass the requirements document path when one exists; otherwise pass a concise summary of the finalized brainstorm decisions. When the Phase 1.1 grounding scout produced a dossier and the file still exists, also pass its path (`/tmp/compound-engineering/ce-brainstorm/<run-id>/grounding.md`) — it gives planning verified quotes with `file:line` pointers to start from instead of re-scanning the repo. Do not print the closing summary first.

**If user selects "Agent review of requirements doc with `ce-doc-review`":**

Load the `ce-doc-review` skill, passing the requirements document path as the argument. When ce-doc-review returns "Review complete", return to the Phase 4 options and re-render the menu (the doc may have changed, so re-evaluate `Resolve Before Planning`, direct-to-work gate, and residual findings). If residual P0/P1 findings remain unaddressed, include the post-review nudge above the menu. Do not show the closing summary yet.

**If user selects "Build it now with `ce-work` (skip planning)":**

Immediately load the `ce-work` skill in the current session using the finalized brainstorm output as context. If a compact requirements document exists, pass its path. Do not print the closing summary first.

**If user selects "More clarifying questions to sharpen the doc":** Return to Phase 1.3 (Collaborative Dialogue) and continue asking the user clarifying questions one at a time to further refine scope, edge cases, constraints, and preferences. Continue until the user is satisfied, then return to Phase 4. Do not show the closing summary yet.

**If user selects "Publish to Proof — shareable link":**

Load the `ce-proof` skill to publish the requirements doc. Pass:

- **source file:** `docs/brainstorms/YYYY-MM-DD-<topic>-requirements.md`
- **doc title:** `Requirements: <topic title>`
- **identity:** `ai:compound-engineering` / `Compound Engineering`

ce-proof creates a shared Proof doc from the requirements file (Create and Share workflow), binds the display name, and returns the share URL. Surface the URL to the user — they can open it to read, comment, or share with others — then return to the Phase 4 options and re-render the menu. This is a one-way publish: the local doc stays canonical and nothing syncs back, so option eligibility is unchanged (no need to re-evaluate `Resolve Before Planning`, the direct-to-work gate, or residual findings on account of Proof).

If the upload fails (network error, Proof API down), retry once after a short wait. If it still fails, tell the user the upload didn't succeed and briefly explain why, then return to the Phase 4 options — don't leave them wondering why the option did nothing.

**If user selects "Open in browser":** Display the absolute path to the `.html` requirements file so the user can open it locally. Where the platform exposes a browser-opening primitive (e.g., `open` on macOS, `xdg-open` on Linux, `start` on Windows), the agent may invoke it directly; otherwise print the absolute path and let the user open it. After the path is displayed (or the browser is opened), return to the Phase 4 options so the user can pick a follow-up action.

**If user selects "Done for now":** Display the closing summary (see 4.3) and end the turn.

#### 4.3 Closing Summary

Use the closing summary only when this run of the workflow is ending or handing off, not when returning to the Phase 4 options.

In both templates below, substitute `<absolute path to requirements doc>` with the actual file path written this run — `.md` for `OUTPUT_FORMAT=md`, `.html` for `OUTPUT_FORMAT=html`. Do not emit a hardcoded `.md` path when the artifact is HTML, or the closing summary will point users at a file that was never written.

When complete and ready for planning, display:

```text
Brainstorm complete!

Requirements doc: <absolute path to requirements doc>  # omit line if no doc was created

Key decisions:
- [Decision 1]
- [Decision 2]

Recommended next step: `ce-plan`
```

If the user pauses with `Resolve Before Planning` still populated, display:

```text
Brainstorm paused.

Requirements doc: <absolute path to requirements doc>  # omit line if no doc was created

Planning is blocked by:
- [Blocking question 1]
- [Blocking question 2]

Resume with `ce-brainstorm` when ready to resolve these before planning.
```
