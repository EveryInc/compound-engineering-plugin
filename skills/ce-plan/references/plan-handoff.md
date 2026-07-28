# Plan Handoff

This file contains post-plan-writing instructions: document review, post-generation options, and issue creation. Load it after the plan file has been written and the confidence check (5.3.1-5.3.7) is complete.

## 5.3.8 Document Review

**Format gate.** This phase runs only when `OUTPUT_FORMAT=md` (resolved in SKILL.md Phase 0.0). `ce-doc-review`'s mutation mechanics are markdown-specific — its walkthrough applies `gated_auto`/`manual` fixes as "single-file markdown changes" via the platform's edit tool, and its Append-to-Open-Questions flow inserts `##`/`###` markdown headings (see the walkthrough and open-questions-defer references inside the ce-doc-review skill). Running those mutators against an HTML artifact would produce malformed output. Until ce-doc-review gains HTML-aware mutation, HTML plans skip this phase entirely.

**When `OUTPUT_FORMAT=html`:** Skip the ce-doc-review invocation. Capture a synthetic "skipped" envelope so the menu summary line in 5.4 can name the limitation explicitly:
- `fixes_applied = 0`
- `proposed_fixes_count = 0`, `decisions_count = 0`, `fyi_count = 0`
- `skipped_reason = "output_format_html"`

Then proceed directly to Final Checks (5.3.9). Do not block on this — the confidence check at 5.3 already strengthened the plan. Free-form requests for review in the post-generation menu will be declined for HTML runs with a prompt to switch to `output:md` (see 5.4); review is not available for HTML plans until ce-doc-review gains HTML-aware mutation.

**When `OUTPUT_FORMAT=md`:** Invoke the `ce-doc-review` skill with arguments `mode:headless <plan-path>` using the host's normal skill-invocation mechanism. Do not substitute a generic Task, Agent, or subagent; those are delegation mechanisms, not skill invocation. When this step is reached for a markdown plan, it is mandatory — do not skip it because the confidence check already ran. The two workflows catch different classes of issues.

If `ce-doc-review` cannot be invoked, capture a synthetic envelope and proceed to Final Checks:
- `fixes_applied = 0`
- `proposed_fixes_count = 0`, `decisions_count = 0`, `fyi_count = 0`
- `skipped_reason: skill_unreachable`
- `skipped_detail: <why the host's normal skill-invocation mechanism could not start ce-doc-review>`

This is a pre-entry state: say that `ce-doc-review` did not run. Report a review error or timeout only after the `ce-doc-review` workflow actually begins.

Headless is the default at this phase because most users want to start work after planning, not adjudicate every reviewer concern up front. Headless applies `safe_auto` fixes silently and returns structured findings text — no walkthrough, no per-finding routing, no blocking prompts. The post-generation menu (see 5.4) offers `Decide on the review's open items` as a first-class option so users can opt into the full interactive walkthrough when they want it.

The confidence check and ce-doc-review are complementary:
- The confidence check strengthens rationale, sequencing, risk treatment, and grounding
- Document-review checks coherence, feasibility, scope alignment, and surfaces role-specific issues

Capture the headless envelope so it can drive the contextual summary above the post-generation menu:
- The number of fixes auto-applied
- The count of remaining findings, broken out by user-facing bucket (proposed fixes, decisions, FYI observations)
- The severity breakdown of decisions and proposed fixes (specifically the P0/P1 count, since those benefit from explicit user attention)

When ce-doc-review returns "Review complete", proceed to Final Checks.

**Pipeline mode:** Pipeline runs (LFG or any `disable-model-invocation` context) force `OUTPUT_FORMAT=md` at Phase 0.0, so the format gate above never selects the HTML skip path in pipeline mode. Pipeline runs invoke `ce-doc-review` with `mode:headless` and the plan path — the headless mode is identical to the interactive default at this phase. No further routing is offered in pipeline mode; the caller decides what to do with the returned findings. Address any P0/P1 findings before returning control to the caller. If the review could not start and ce-plan recorded the `skill_unreachable` envelope, return that envelope explicitly so the caller does not treat review as complete.

## 5.3.9 Final Checks and Cleanup

Before proceeding to post-generation options:
- Confirm the plan is stronger in specific ways, not merely longer
- Confirm the planning boundary is intact
- Confirm origin decisions were preserved when an origin document exists

If artifact-backed mode was used:
- Clean up the temporary scratch directory after the plan is safely updated
- If cleanup is not practical on the current platform, note where the artifacts were left

**Format-specific composition.** When `OUTPUT_FORMAT=html` (resolved in SKILL.md Phase 0.0), the plan is written as a single self-contained `.html` file — there is no markdown sibling. Read `references/html-rendering.md` for composition rules: invariants, precedence stack, format principles, agent-consumability rules, and the post-compose audit. The `.html` file is the artifact downstream consumers (ce-work, human readers) read. `ce-doc-review` is not a current HTML consumer — its mutation mechanics are markdown-only today, and HTML plans skip the 5.3.8 doc-review pass until that gap closes.

When `OUTPUT_FORMAT=md`, write the markdown directly per `references/markdown-rendering.md`. No HTML is composed.

After all mutations in this run have settled (initial write, deepening synthesis, ce-doc-review `safe_auto` fixes when `OUTPUT_FORMAT=md`), the artifact at its single path reflects the final state. Publishing to Proof is one-way and does not mutate the local file. HTML runs skip the ce-doc-review autofix step (see 5.3.8 format gate).

## 5.4 Post-Generation Options

**Pipeline mode:** If invoked from an automated workflow such as LFG or any `disable-model-invocation` context, skip the interactive menu below and return control to the caller immediately. The plan file has been written, the confidence check has run, and either `ce-doc-review` completed or ce-plan recorded `skill_unreachable` because the review could not start. Return the resulting review envelope to the caller (e.g., LFG), which determines the next step.

**Path format:** Use absolute paths for chat-output file references — relative paths are not auto-linked as clickable in most terminals.

**Summary line above the menu (always):** Print a single concise line summarizing the headless review state — e.g., `Doc review applied 3 fixes. 2 decisions, 1 proposed fix, 4 FYI observations remain (1 at P1).` When no fixes were applied and no findings remain, print `Doc review clean — no fixes needed.` When the envelope carries `skipped_reason: output_format_html` (HTML run, per Phase 5.3.8 format gate), print `Doc review skipped — ce-doc-review is markdown-only today; the HTML plan was not reviewed.` When it carries `skipped_reason: skill_unreachable`, print `Doc review skipped — ce-doc-review could not be invoked (<skipped_detail>); it did not run.` If a review that actually began failed, print `Doc review failed after starting — <actual error>; the plan was not fully reviewed.` This line establishes what the autofix pass did (or didn't) so the user has the context to choose between the menu options below. Never describe a pre-entry harness or delegation failure as a downstream skill timeout.

**Render returned findings in their decision-first structure — do not re-narrate.** The headless envelope `ce-doc-review` returned already follows its shared rendering floor: each finding leads with a recommendation and a one-sentence consequence that names no opaque identifier, with mechanism capped at two sentences and two glossed anchors. When surfacing those findings alongside the menu, present them in that returned structure (Recommendation / Consequence if unchanged / Change / Basis). Do not compress a finding into a denser single-paragraph narration, and do not reintroduce bare document IDs, ticket or PR numbers, or code symbols the envelope already glossed or moved to trace — that recreates the illegibility the floor exists to remove. The summary line above is the only re-narration; the findings themselves pass through verbatim.

**Question:** "Plan ready at `<absolute path to plan>`. What would you like to do next?"

**Options:**
1. **Start `ce-work`** - Build and ship the plan in this session — subagent-driven development with simplification, code review, and commits. Show only for `artifact_readiness: implementation-ready` plus `execution: code`; universal-planning, answer-seeking, approach-plan, and requirements-only artifacts keep their own handoff/checkpoint behavior.
2. **Run it as a `/goal`** - Choose this if you'd rather run the plan through your harness's autonomous goal mode instead of ce-work's build-and-ship flow. The alternative to option 1, not an add-on — pick one. Show only when (a) the artifact is `artifact_readiness: implementation-ready` plus `execution: code` AND (b) the host has goal capability at all — Codex `create_goal` in the available tool list, or a user-typed `/goal` in Claude Code; omit it where neither exists. Where the host can start a goal directly the session begins it immediately; where it cannot, it hands over a copyable `/goal` prompt. See the routing below.

**Recommended marker:** `ce-work` (option 1) always carries *(recommended)* — render option 1 as **Start `ce-work`** *(recommended)* and leave option 2 unmarked. `ce-work` is the correctly-layered execution entry point: it owns engine selection and reaches goal or dynamic-workflow engines itself when a plan's shape warrants, so recommending it never forecloses goal mode. Goal mode (option 2) is the opt-in preference for users who'd rather drive the work through their harness's native goal loop. Exactly one option ever carries *(recommended)*.
3. **Decide on the review's open items** - Confirm or skip the suggested edits, and settle the judgment calls the auto-pass left for you. (Safe, mechanical fixes were already applied; you can also defer items into Open Questions.)
4. **Create Issue** - Create a tracked issue from this plan in your configured issue tracker (e.g., GitHub Issues, Linear, Jira)
5. **Publish to Proof — shareable link** - Publish the plan to Every's Proof editor and get a shareable link to read, comment on, or share with others. One-way: the local plan file stays canonical. **Render only when `OUTPUT_FORMAT=md`.**
5. **Open in browser** - Open the HTML plan file locally for review and sharing. **Render only when `OUTPUT_FORMAT=html`.**

There is no "done" / "pause" option — the blocking question already waits, and the user ends the turn by dismissing it (Esc) or just not picking anything. The plan file is already saved.

**Option 5 format-keyed label.** Under exclusive output mode, the plan exists as exactly one artifact — `.md` or `.html`, never both. Render the option 5 label matching the produced format. Proof ingests the `.md` source, so it does not apply to HTML runs; the browser option opens the local `.html` file directly. Implementation handoff (options 1 and 2) remains available in both modes only when the artifact is implementation-ready code — `ce-work` reads either format, and the launch prompt is emitted at handoff regardless of format (see the ce-work skill's plan-input handling).

**Menu rendering:** The menu has up to 5 options (execution options 1 and 2 render only for implementation-ready code, and option 2 only on hosts with goal capability; option 3 is conditional — see below). Detect goal capability by capability, not by slash-command shape: Codex has it when `create_goal` is in the available tool list, while Claude Code has it through user-typed `/goal`. Account for each platform's blocking-question option cap rather than trimming choices: Claude Code `AskUserQuestion` supports up to 4 explicit options, and Codex `request_user_input` supports only 2-3 explicit options. When the visible menu exceeds the current platform's cap, render it as a numbered list in chat with the hint "Pick a number or describe what you want." When the visible menu fits the cap, use the platform's blocking tool and renumber the visible options 1-N. When the platform's blocking tool is unavailable or errors (e.g., Codex edit modes where `request_user_input` is not exposed, or `ask_user` returns no match), fall back to the same numbered-list-in-chat rendering. Never silently skip the question.

**Hide `Decide on the review's open items` (option 3) when no actionable findings remain or doc review was skipped.** Show this option only when the headless envelope reports `proposed_fixes_count + decisions_count > 0` — i.e., at least one `gated_auto` or `manual` finding at confidence anchor `75` or `100`. Drop the option in any other case, including FYI-only state. FYI observations (anchor `50`) do not enter `ce-doc-review`'s interactive routing question or walkthrough — that flow is gated to actionable findings — so a `Decide on the review's open items` option that only has FYIs to show is a dead-end: ce-doc-review would re-dispatch the persona team, find the same FYIs, skip the routing question, and fall through to the terminal question with nothing to walk through. The user paid the dispatch cost for no engagement surface. **Also drop this option when the envelope carries `skipped_reason: output_format_html` or `skipped_reason: skill_unreachable`** — the former cannot be mutated safely and the latter means the skill did not run. Always renumber the *visible* options 1-N for display so users see a clean sequence (e.g., an implementation-ready plan with no actionable findings shows ce-work, give-me-`/goal`, Create Issue, Proof/browser, Done; a requirements-only plan hides both execution options and shows only the doc/issue/share/pause options). The summary line above the menu still names the FYI count when present (`Doc review applied 3 fixes. 2 FYI observations remain.`) so the user sees what was found, even though there is no menu action attached to it — the FYIs are visible in the headless envelope text the menu rendered alongside.

**Cross-skill invocation rule:** Invoke `ce-work`, `ce-doc-review`, and `ce-proof` using the host's normal skill-invocation mechanism. Do not substitute a generic Task, Agent, or subagent; the invoked skill may still dispatch its own subagents according to its protocol.

Based on selection (the bare per-option routing is also stated inline in the SKILL.md so it cannot be missed when this reference is not loaded; the elaborate sub-flows below are the reason this reference still exists):
- **Start `ce-work`** -> Classify the artifact first. If it is not `artifact_readiness: implementation-ready` plus `execution: code`, do not execute it; route requirements-only artifacts back to `ce-plan` enrichment and non-code artifacts to their own workflow. If it is executable, invoke the `ce-work` skill under the cross-skill invocation rule, passing the plan path as the skill argument; `ce-work` then owns engine selection (inline/subagent vs goal-mode vs dynamic-workflow) and the implementation tail. If `ce-work` cannot be invoked, print the existing `ce-work` fallback prompt for the user to run; in that prompt, tell the executor to read Goal Capsule, Verification Contract, Definition of Done, and active U-IDs (scanning headings to find them) rather than the whole document first. Do not merely tell the user to type an invocation when the host can invoke it directly.
- **Run it as a `/goal`** -> Build a **thin** implementation objective from the plan (generated here at handoff, never written into the doc). It points to the plan's sections; do **not** copy the plan's resolved decisions, exact verification commands, or requirements into the prompt. **Deletion test:** if your draft names a specific command, file path, U-ID dependency relationship, stop condition, or DoD item, cut it — the objective should read identically for any plan except the substituted path. Don't hardcode an open-a-PR or do-not-open-a-PR directive; carry the PR-precedence line instead. The objective: *implement `<plan-path>` to its Definition of Done; the plan is the authority — scan headings, don't read it whole; read the Goal Capsule, then work the units in dependency order, reading each unit plus its cited R/F/AE/KTD and any Product Contract Key Decision whose exact `Governs R…` links name that unit's cited R-IDs; run the plan's Verification Contract gates and satisfy each unit's test scenarios; track progress outside the plan file; follow the plan's PR/landing strategy if it defines one, with the repo's conventions and the user's preferences overriding it; surface a genuine blocker (something that changes scope or contradicts the plan) instead of guessing, using judgment on details the plan leaves open.* Then, by host capability — either way `ce-work` does **not** also run (that would double-execute and split tail ownership):
  - **If `create_goal` is in the available tool list (Codex):** call `create_goal` with that objective. The current session works toward it; do **not** call `update_goal` (the goal session marks its own completion). No copy-paste.
  - **If only a user-typed `/goal` exists (Claude Code):** print that objective as a single copyable `/goal …` block and tell the user to paste it at the start of a message (a skill cannot issue `/goal` itself there). **Best-effort clipboard copy:** also put the exact prompt on the OS clipboard so the user only has to paste. **Never interpolate the prompt into the command** — the plan path and the prompt's own backticks/`$` would be evaluated or mangled by the shell. Hand it off as data: write it to a temp file via a **quoted-sentinel** here-doc (the quotes stop all expansion), then pipe that file to the first available tool:

    ```bash
    PROMPT_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-goal-prompt.XXXXXX")
    cat >> "$PROMPT_FILE" <<'__CE_GOAL_PROMPT_END__'
    <the exact /goal prompt goes here, verbatim>
    __CE_GOAL_PROMPT_END__
    if   command -v pbcopy   >/dev/null 2>&1; then pbcopy   < "$PROMPT_FILE"                    # macOS
    elif command -v wl-copy  >/dev/null 2>&1; then wl-copy  < "$PROMPT_FILE"                    # Linux/Wayland
    elif command -v xclip    >/dev/null 2>&1; then xclip -selection clipboard < "$PROMPT_FILE"  # Linux/X11
    elif command -v xsel     >/dev/null 2>&1; then xsel --clipboard --input   < "$PROMPT_FILE"  # Linux/X11 alt
    elif command -v clip.exe >/dev/null 2>&1; then clip.exe < "$PROMPT_FILE"                    # WSL/Windows
    else false
    fi
    copy_status=$?
    rm -f "$PROMPT_FILE"
    exit "$copy_status"
    ```

    The `exit "$copy_status"` at the end is load-bearing: it makes the block's exit code the *clipboard* result, not `rm`'s (which is otherwise the last command and always 0, masking a failed or no-op copy). Only tell the user it was copied when that exit code is 0, and say "copied to this machine's clipboard" — not "your clipboard": on a remote or sandboxed session the copy lands on the wrong machine and the paste comes up empty, so the printed block above stays the source of truth. If no tool is found or the copy fails (nonzero exit), say nothing about the clipboard. After printing (and the optional copy), return to the options.

  Render only for implementation-ready code plans, and only where the host has goal capability at all (Codex `create_goal` or Claude Code user-typed `/goal`) — omit the option where neither exists.
- **Decide on the review's open items** -> Invoke the `ce-doc-review` skill again under the cross-skill invocation rule, passing the plan path **without** `mode:headless` so the interactive routing question and walkthrough fire. The headless pass already applied `safe_auto` fixes and recorded its findings in the session, so the interactive pass picks up where headless stopped — its R29 suppression rule prevents prior-round Skipped/Deferred entries from re-raising. If the skill cannot be invoked, say that it did not run and return to the menu. After it returns, re-render this menu with the refreshed counts so the user can pick what to do next.
- **Create Issue** -> Follow the Issue Creation section below
- **Publish to Proof — shareable link** -> Invoke the `ce-proof` skill under the cross-skill invocation rule to publish the plan. If it cannot be invoked, say that publishing did not start and return to the menu. Pass:
  - source file: `<root>/plans/<plan_filename>.md`
  - doc title: `Plan: <plan title from frontmatter>`
  - identity: `ai:compound-engineering` / `Compound Engineering`

  ce-proof creates a shared Proof doc from the plan file (Create and Share workflow), binds the display name, and returns the share URL. Surface the URL to the user — they can open it to read, comment, or share with others — then return to the post-generation options. This is a one-way publish: the local plan file stays canonical and nothing syncs back, so no re-review is needed and the menu re-renders with the same residual findings as before.

  Note: the Proof option only renders when `OUTPUT_FORMAT=md`. Proof ingests markdown; HTML plans use the local browser option instead.

  If the upload fails (network error, Proof API down), retry once after a short wait. If it still fails, tell the user the upload didn't succeed and briefly explain why, then return to the options — don't leave them wondering why the option did nothing.
- **Open in browser** -> Display the absolute path to the `.html` plan file so the user can open it locally. Where the platform exposes a browser-opening primitive (e.g., `open` on macOS, `xdg-open` on Linux, `start` on Windows), the agent may invoke it directly; otherwise print the absolute path and let the user open it. After the path is displayed (or the browser is opened), return to the post-generation options so the user can pick a follow-up action.
- **Free-form prompts that target the findings** (e.g., the user types "review", "walk through", "deep review" instead of picking a numbered option) -> route as if they had picked `Decide on the review's open items`. Do not loop back to the menu without firing the review. **Exception:** when the envelope carries `skipped_reason: output_format_html`, do not fire `ce-doc-review` — instead, reply once that `ce-doc-review` is markdown-only today, the HTML plan cannot be reviewed without HTML-aware mutation support, and the user can regenerate as markdown by invoking `ce-plan output:md`. For this user-runnable output, default to `/ce-plan output:md`; use `$ce-plan output:md` only on Codex or a host explicitly documented as dollar-prefixed. Render only the invocation as inline code and output one form only. Then loop back to the menu. When it carries `skipped_reason: skill_unreachable`, say that `ce-doc-review` could not be invoked and loop back without misreporting a review failure.
- **Other free-form input** -> Accept revisions to the plan and loop back to options.

## Issue Creation

When the user selects "Create Issue":

1. **Identify the project's issue tracker from the active instructions and conventions already in your context** — the issue / project-management tool the project uses (e.g., GitHub Issues, Linear, Jira). Don't open or name specific instruction files to do this; the project's instructions are already available to you. Look for an explicit `project_tracker:` declaration (`github`, `linear`, …) or any documented tracker convention. Only if your context doesn't already carry the project's instructions (e.g., you're a fresh subagent) or they're silent, consult supplementary signals: `README.md`, `CONTRIBUTING.md`, PR templates under `.github/`, or visible tracker URLs.

2. **Create the issue through whatever interface that tracker actually exposes in this environment** — a platform connector/MCP tool, documented API/GraphQL credentials, or a documented CLI. First actively discover what's available: use the platform's tool-discovery primitive (e.g., `ToolSearch` in Claude Code) to look for a tracker connector or MCP tool before assuming none exists — lazy-loaded connectors and credentials stored outside the shell won't surface in a passive check. Do not assume a tracker means a particular CLI, and do not treat a missing binary, env var, or unloaded MCP server as proof the tracker is unavailable — those are false negatives when access comes through a connector or a raw API with credentials stored outside the shell. When using a direct API, never print secret values; read the plan body from disk and send it as the issue's markdown/description per the API contract. Worked examples for the common cases:
   - **GitHub** — `gh issue create --title "<type>: <title>" --body-file <plan_path>`
   - **Linear** (no guaranteed first-party CLI) — prefer, in order: a Linear connector or MCP tool that can create issues → documented direct API/GraphQL credentials and endpoint → a documented local Linear CLI, only when the project or user explicitly states it is installed and authenticated.

3. If no tracker is configured, ask the user which tracker they use with the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to asking in chat only when no blocking tool exists or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip. Offer three explicit options — `GitHub`, `Linear`, `Skip` — and let the user name a different tracker (Jira, etc.) through the tool's built-in free-form / "Other" input: `AskUserQuestion` always provides it, and `request_user_input` / `ask_user` supply their own. Don't add an explicit fourth `Other` option — that's redundant where the tool already offers free-form and can exceed the option cap on tools that accept only 2–3 explicit choices (e.g., Codex `request_user_input`). When the tool exposes no free-form path, capture the other-tracker name via the chat fallback. Then:
   - Proceed with the chosen tracker's creation path above
   - If the user names a different tracker through the free-form path, ask for its reachable interface if they didn't say, then create the issue via the capability path in step 2
   - Offer to persist the choice by adding a `project_tracker: <value>` declaration to the project's root agent-instructions file (e.g., `AGENTS.md`; if it `@`-includes another file, write to the substantive one). Use the lowercase tracker key (`github`, `linear`, `jira`, …) — not the display label — so future runs match step 1 and skip this prompt
   - If `Skip`, return to the options without creating an issue

4. If the detected tracker has no reachable interface after actively discovering available connector/MCP tools and following its documented access method — no working connector, MCP tool, CLI, or API path — surface a clear error (e.g., "`gh` CLI not found or not authenticated for GitHub Issues"; "Linear is documented for this project, but no connector, MCP tool, or API credentials were found") and return to the options. Do not silently fall back to a local issue-plan document unless the user explicitly asks for a local-only artifact.

After issue creation:
- Display the issue URL
- Ask whether to proceed with `ce-work` using the platform's blocking question tool
