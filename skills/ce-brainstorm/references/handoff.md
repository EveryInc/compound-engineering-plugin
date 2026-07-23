# Handoff

This content is loaded when Phase 4 begins — after the requirements-only
unified plan is written.

---

#### 4.1 Present Next-Step Options

The Phase 4 menu's visible option count varies by state: no unified plan
artifact hides the review and Proof options, `OUTPUT_FORMAT=html` also hides
the review option (ce-doc-review is markdown-only today), unresolved `Resolve
Before Planning` hides both `Create the implementation plan` and `Ship it
autonomously with lfg`, and the lfg option is also hidden for non-software
brainstorms (`execution` other than `code`). Count the visible options for the
current state and choose the rendering mode accordingly:

- **Visible count fits the current platform's option cap:** use the platform's blocking question tool (`AskUserQuestion` in Claude Code — call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded; `request_user_input` in Codex; `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension)). Claude Code `AskUserQuestion` supports up to 4 explicit options, and Codex `request_user_input` supports only 2-3 explicit options.
- **Visible count exceeds the current platform's option cap:** render as a numbered list in chat. This is the narrow option-overflow fallback; trimming would hide legitimate choices (plan, ship, review, Proof/browser, refine are all distinct destinations). Include a hint that free-form input is accepted ("Pick a number or describe what you want.") so the numbered list retains the blocking tool's open-endedness.

Never silently skip the question.

If `Resolve Before Planning` contains any items:
- Ask the blocking questions now, one at a time, by default
- If the user explicitly wants to proceed anyway, first convert each remaining item into an explicit decision, assumption, or `Deferred to Planning` question
- If the user chooses to pause instead, present the handoff as paused or blocked rather than complete
- Do not offer the `Create the implementation plan` or `Ship it autonomously with lfg` options while `Resolve Before Planning` remains non-empty

In both preambles below, the "Pick a number or describe what you want." hint applies only in numbered-list mode. When using the blocking tool, omit that line and pass the remaining stem as the question.

**Path format:** Use absolute paths for chat-output file references — relative paths are not auto-linked as clickable in most terminals.

**Preamble when no blocking questions remain:**

```
Brainstorm complete.

Plan artifact: <absolute path to requirements-only unified plan>  # omit line if no artifact was created

Planning and shipping will use this artifact as the definition of what to build.  # omit line if no artifact was created

What would you like to do next? (Pick a number or describe what you want.)
```

**Preamble when blocking questions remain and user wants to pause:**

```
Brainstorm paused. I'm holding planning until the remaining questions are resolved — say the word and I'll proceed anyway, recording each open item as an explicit assumption or a question deferred to planning.

Plan artifact: <absolute path to requirements-only unified plan>  # omit line if no artifact was created

What would you like to do next? (Pick a number or describe what you want.)
```

The override sentence is load-bearing, not padding: the planning options are hidden while `Resolve Before Planning` is non-empty, so without it the user is told planning is blocked and is never told the block is theirs to lift. `Resolve Before Planning` is your own judgment call — an over-cautious read of it must not silently strand the user with no visible way forward. Hiding the option withholds the *recommendation*; it never withholds the *choice*.

Present only the options that apply. Renumber so visible options stay contiguous starting at 1.

1. **Create the implementation plan** *(recommended)* - Hand off to `ce-plan` and sharpen the requirements into a complete, testable plan. Shown only when `Resolve Before Planning` is empty.
2. **Ship it autonomously with `lfg`** - Hand the requirements to the full autonomous pipeline: `lfg` plans (`ce-plan`), implements, simplifies, runs independent code review and applies the fixes, opens a PR, and watches CI to green — hands-off, no check-ins. It plans first (unlike a raw `/goal` straight from requirements), so it's the safer autonomous path. Best when you trust the requirements and want it built and shipped without steering. **Opens a PR and pushes a branch.** Shown only for software brainstorms (`execution: code`) with `Resolve Before Planning` empty **and a unified plan artifact was created** — `lfg` hands `ce-plan` that artifact path in pipeline mode and cannot prompt, so with no artifact (e.g. a brief-alignment brainstorm that skipped doc creation per the "Decide whether a doc is warranted" rule) there is nothing to enrich; offer option 1 instead, which can plan interactively from the conversation. For a quicker plan-then-decide flow, or to run a `/goal` yourself, pick option 1 and choose at the `ce-plan` handoff.
3. **Pressure-test the requirements** - Dispatch reviewer agents with `ce-doc-review` to find gaps, conflicts, weak premises, and scope issues in the requirements; auto-apply safe fixes; route the rest interactively. Shown only when a markdown unified plan exists **and `OUTPUT_FORMAT=md`** — ce-doc-review's walkthrough applies markdown-only mutations (`##`/`###` heading inserts, single-file markdown edits via apply-set) and would corrupt an HTML artifact, so HTML brainstorms skip this option until ce-doc-review gains HTML-aware mutation support. Under HTML mode, surface a one-line note above the menu: `Requirements review unavailable in output:html mode — ce-doc-review is markdown-only today. Switch to output:md if you want a review pass.`
4. **Publish to Proof — shareable link** - Publish the markdown unified plan to Every's Proof editor and get a shareable link to read, comment on, or share with others. One-way: the local doc stays canonical. Shown only when a markdown unified plan exists. **Render only when `OUTPUT_FORMAT=md`** (Proof operates on markdown and cannot ingest HTML).
4. **Open in browser** — open the HTML unified plan locally for review and sharing. Shown only when an HTML unified plan exists. **Render only when `OUTPUT_FORMAT=html`.** Replaces "Publish to Proof" at the same slot under exclusive output mode — the artifact is either markdown OR HTML, never both, so exactly one of the two labels applies per run.
5. **More clarifying questions to sharpen the scope** - Keep refining scope, edge cases, constraints, and preferences through further dialogue. Always shown — so the label names the scope rather than the doc, which stays true on a run that correctly skipped doc creation.

There is no "done" / "pause" option — the blocking question already waits, and the user ends by dismissing it (Esc) or saying they're finished. The unified plan artifact is already saved.

**Post-review nudge (subsequent rounds only):** If the user has already run `ce-doc-review` this session and residual P0/P1 findings remain unaddressed, add a one-line prose nudge adjacent to the menu (e.g., "Document review flagged 2 P1 findings you may want to address — pick \"Pressure-test the requirements\" to run another pass."). Reference the option by label, not number: the menu renumbers when `Resolve Before Planning` hides `Create the implementation plan` and the lfg option, so a hardcoded option number can point users at the wrong action. Do not add a separate menu option; reuse the existing `Pressure-test the requirements` option. Suppress this nudge when `OUTPUT_FORMAT=html` — that option is hidden in that mode, so the nudge would point users at a missing action.

#### 4.2 Handle the Selected Option

Selections may be the literal option label (when the user types the label or a close paraphrase) or the option number. Match numbers against the currently-rendered (post-trim) list. Free-form input that doesn't match an option or describe an alternative action should be treated as clarification — ask a follow-up rather than guessing.

**If user selects "Create the implementation plan":**

Immediately load the `ce-plan` skill in the current session. Pass the unified
plan artifact path when one exists; otherwise pass a concise summary of the
finalized brainstorm decisions. When the Phase 1.1 grounding scout produced a
dossier and the file still exists, also pass its path
(`<scratch-root>/ce-brainstorm/<run-id>/grounding.md`) — it gives
planning verified quotes with `file:line` pointers to start from instead of
re-scanning the repo. Do not print the closing summary first.

**If user selects "Pressure-test the requirements":**

Load the `ce-doc-review` skill, passing the unified plan path as the argument.
When ce-doc-review returns "Review complete", return to the Phase 4 options
and re-render the menu (the requirements may have changed, so re-evaluate
`Resolve Before Planning`, the lfg software gate, and residual findings). If
residual P0/P1 findings remain unaddressed, include the post-review nudge
above the menu. Do not show the closing summary yet.

**If user selects "Ship it autonomously with `lfg`":**

Immediately invoke the `lfg` skill in the current session via the platform's
skill-invocation primitive, passing the unified plan artifact path as its
argument so `lfg`'s `ce-plan` step enriches *this* requirements-only artifact in
place rather than bootstrapping a new plan. `lfg` then owns the full pipeline
autonomously — plan, implement (`ce-work` in `return-to-caller` mode), simplify,
independent code review and applied fixes, commit/push/open PR, and CI watch to
green. Do not also start a `/goal` or load `ce-work` directly — `lfg`
orchestrates them. Unlike a goal tool, `lfg` is host-agnostic: it works wherever
skills run (plus `git`/`gh` for the PR/CI tail, which it guards when absent).

Where the host exposes no skill-invocation primitive, print the `lfg <plan-path>`
invocation for the user to run and note that it will plan, build, review, and
open a PR from this artifact.

Do not print the closing summary first.

**If user selects "More clarifying questions to sharpen the scope":** Return to Phase 1.3 (Collaborative Dialogue) and continue asking the user clarifying questions one at a time to further refine scope, edge cases, constraints, and preferences. Continue until the user is satisfied, then return to Phase 4. Do not show the closing summary yet.

**If user selects "Publish to Proof — shareable link":**

Load the `ce-proof` skill to publish the markdown unified plan. Pass:

- **source file:** `<root>/plans/YYYY-MM-DD-NNN-<type>-<topic>-plan.md`
- **doc title:** `Plan: <topic title> (requirements-only)`
- **identity:** `ai:compound-engineering` / `Compound Engineering`

ce-proof creates a shared Proof doc from the markdown plan file (Create and
Share workflow), binds the display name, and returns the share URL. Surface
the URL to the user — they can open it to read, comment, or share with others
— then return to the Phase 4 options and re-render the menu. This is a one-way
publish: the local doc stays canonical and nothing syncs back, so option
eligibility is unchanged (no need to re-evaluate `Resolve Before Planning`,
the lfg software gate, or residual findings on account of Proof).

If the upload fails (network error, Proof API down), retry once after a short wait. If it still fails, tell the user the upload didn't succeed and briefly explain why, then return to the Phase 4 options — don't leave them wondering why the option did nothing.

**If user selects "Open in browser":** Display the absolute path to the `.html` unified plan so the user can open it locally. Where the platform exposes a browser-opening primitive (e.g., `open` on macOS, `xdg-open` on Linux, `start` on Windows), the agent may invoke it directly; otherwise print the absolute path and let the user open it. After the path is displayed (or the browser is opened), return to the Phase 4 options so the user can pick a follow-up action.

**If the user indicates they're finished** (says "done"/"that's all", or dismisses the menu without picking an option): display the closing summary (see 4.3) and end the turn.

#### 4.3 Closing Summary

Use the closing summary only when this run of the workflow is ending or handing off, not when returning to the Phase 4 options.

In both templates below, substitute `<absolute path to unified plan>` with the
actual file path written this run — `.md` for `OUTPUT_FORMAT=md`, `.html` for
`OUTPUT_FORMAT=html`. Do not emit a hardcoded `.md` path when the artifact is
HTML, or the closing summary will point users at a file that was never written.

When complete and ready for planning, display:

```text
Brainstorm complete!

Plan artifact: <absolute path to unified plan>  # omit line if no artifact was created

Key decisions:
- [Decision 1]
- [Decision 2]

Recommended next step: `ce-plan <plan artifact path>`
```

If the user pauses with `Resolve Before Planning` still populated, display:

```text
Brainstorm paused.

Plan artifact: <absolute path to unified plan>  # omit line if no artifact was created

Planning is held on:
- [Blocking question 1]
- [Blocking question 2]

Resume with `ce-brainstorm` to resolve these — or say to plan anyway, and I'll record each open item as an explicit assumption or a question deferred to planning.
```
