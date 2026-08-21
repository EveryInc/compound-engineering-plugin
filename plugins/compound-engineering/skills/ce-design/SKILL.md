---
name: ce:design
description: "Design frontend screens visually before implementation using available design tools (Paper, Pencil, Figma, Sketch, Penpot). Use between /ce:plan and /ce:work for any feature with UI, or when asked to design screens, create mockups, or get visual approval before building."
argument-hint: "[plan file path or feature description]"
---

# Design Frontend Screens

## Quick Start

Invoke with `/ce:design [plan-file-or-description]` between `/ce:plan` and `/ce:work`. Creates visual designs for user approval before implementation begins. Skip entirely for backend-only work.

## Instructions

### Input

<input_document> #$ARGUMENTS </input_document>

**If the input is empty**, use the native file-search/glob tool (e.g., Glob in Claude Code) to find recent plans matching `docs/plans/*-plan.md`. Ask which plan to design for, or what screens to design.

Do not proceed until a feature description or plan reference is available.

### Phase 0: Resume and Detect

#### 0.1 Resume Existing Design Work

Check for existing design artifacts related to the feature:
- Artboards in an open Paper document
- Open `.pen` file in Pencil
- Figma frames referenced in the plan
- Screenshots or exports in the project

If prior design work exists, confirm: "Found existing designs for [topic]. Continue from these, or start fresh?"

#### 0.2 Detect Available Design Tools

Probe for available design MCP tools at runtime, in priority order:

1. **Paper** -- Call `get_basic_info`. If it responds, Paper is available.
2. **Pencil** -- Call `get_editor_state`. If it responds, Pencil is available.
3. **Figma (Official)** -- Check for Figma MCP tools (e.g., `get_figma_data`). If present, official Figma MCP is available.
4. **Figma (Framelink)** -- Check for `get_file` tool from figma-context-mcp. If present, Framelink is available.
5. **Sketch** -- Check for `get_selection_as_image` tool. If present, Sketch MCP is available.
6. **Penpot** -- Check for Penpot MCP tools. If present, Penpot is available.

Probe tools silently. Do not display errors from unavailable tools.

#### 0.3 Select Design Tool

**If one tool detected:** Use it. Announce: "Using [tool name] for design."

**If multiple tools detected:** Ask using the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise present numbered options and wait for the user's reply.

**Question:** "Multiple design tools available. Which to use?"
- List each detected tool with a one-line capability summary

**If no tools detected:** Present fallback options:
1. **Text wireframes** -- Create ASCII/markdown wireframes for discussion
2. **Help set up a design tool** -- Guide through connecting Paper, Pencil, or another tool
3. **Skip to implementation** -- Proceed directly to `/ce:work`

#### 0.4 Load Tool-Specific Workflow

Load the corresponding reference file for the selected tool:

| Tool | Reference |
|------|-----------|
| Paper | [paper-workflow.md](references/paper-workflow.md) |
| Pencil | [pencil-workflow.md](references/pencil-workflow.md) |
| Figma | [figma-workflow.md](references/figma-workflow.md) |
| Sketch | [sketch-workflow.md](references/sketch-workflow.md) |
| Penpot | [penpot-workflow.md](references/penpot-workflow.md) |

Follow the loaded workflow for all tool-specific operations in subsequent phases.

### Phase 1: Understand What to Design

#### 1.1 Extract UI Requirements

Read the plan or feature description. Extract:
- UI screens or views mentioned
- User flows described
- Components or layouts referenced
- Visual requirements or inspiration mentioned
- Target viewport (desktop 1440px, tablet, mobile 375px)

#### 1.2 Confirm Screen List

Present the screens to design:

> "Based on the plan, I'll design these screens: [list]"
> "Does this look right? Any screens to add or skip?"

Use the platform's blocking question tool when available. Otherwise present the list and wait for confirmation.

#### 1.3 Gather Design References

Ask once: "Do you have any references -- URLs, screenshots, or existing designs to draw from? Or should I start fresh based on the plan?"

Accept any of these formats:
- **URLs** -- Figma links, live websites, Dribbble/Behance for inspiration. Fetch via web tools when available.
- **Image files** -- Screenshots, mockups, mood boards. Read via the native file-read tool (e.g., Read in Claude Code).
- **Existing designs** -- "Look at the current Figma file" or "use the open .pen file". Read via the detected design tool's MCP.
- **Text descriptions** -- "Like Stripe's dashboard" or "minimalist, dark mode". Incorporate into the design brief.
- **Nothing** -- Proceed from the plan's requirements alone.

#### 1.4 Get Design Context

If not already clear from the plan and references, clarify:
- App type (web app, mobile app, landing page, dashboard)
- Existing design system or style preferences
- Target viewport dimensions

### Phase 2: Design Brief

#### 2.1 Generate Brief

Before any design work, generate a short design brief:
- **Color palette** -- 5-6 hex values with roles (background, surface, text, accent, muted, border)
- **Type choices** -- Font family, weight scale, size scale
- **Spacing rhythm** -- Section, group, and element gaps
- **Visual direction** -- One sentence describing the aesthetic

#### 2.2 Share for Approval

Present the brief to the user. Do not begin designing until the brief is approved or adjusted.

If available, load the `frontend-design` skill and apply its aesthetic principles to strengthen the brief.

### Phase 3: Create Designs

Follow the tool-specific workflow loaded in Phase 0.4. The general pattern across all tools:

#### 3.1 Set Up Canvas

Create the artboard, frame, or file for each screen at the appropriate dimensions.

#### 3.2 Design Incrementally

Build each screen piece by piece -- one visual group at a time (a header, a card, a list row, a button group). Never batch an entire screen into a single operation.

Use realistic content: actual labels, representative data, and copy that matches the feature.

#### 3.3 Self-Review Checkpoints (Mandatory)

After every 2-3 modifications, take a screenshot and evaluate:
- **Spacing** -- Uneven gaps, cramped groups, or areas that feel unintentionally empty?
- **Typography** -- Text too small, poor line-height, weak heading/body hierarchy?
- **Contrast** -- Low contrast text, elements blending into backgrounds?
- **Alignment** -- Elements that should share a vertical or horizontal lane but do not?
- **Clipping** -- Content cut off at container or artboard edges?

Summarize each checkpoint into a one-line verdict. Fix issues before continuing.

#### 3.4 Finish Each Screen

Signal completion to the design tool (e.g., `finish_working_on_nodes` in Paper). Move to the next screen.

### Phase 4: Review and Approve

#### 4.1 Summarize

Describe what was designed and the key decisions:

> "Designs ready. Created [N] screens:
> - [Screen 1] -- [brief description of layout and visual approach]
> - [Screen 2] -- [brief description]
>
> Take a look and let me know how to proceed."

#### 4.2 Present Options

Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise present numbered options and wait for the user's reply.

**Question:** "Review the designs. How would you like to proceed?"

**Options:**
1. **Approved -- proceed to `/ce:work`** -- Designs look good, start building
2. **Changes needed** -- Describe what to change
3. **Redesign screen(s)** -- Specify which screens need a fresh take
4. **Share for review** -- Export or share designs for collaborative feedback
5. **Skip designs -- just build it** -- Abandon design review, go straight to code
6. **Save and pause** -- Keep designs for later

#### 4.3 Handle Selected Option

**Approved:** Proceed to Phase 6 (Handoff).

**Changes needed:** Proceed to Phase 5 (Iterate).

**Redesign screen(s):** Return to Phase 3 for the specified screens, keeping the design brief.

**Share for review:** Export screenshots or generate a shareable link using available tools (Proof, Figma sharing, file export). Then return to the approval options.

**Skip designs:** Proceed directly to handoff, noting that designs were skipped.

**Save and pause:** Note the current state in the plan file and end the workflow.

### Phase 5: Iterate

When changes are requested:

1. Read the feedback carefully
2. Check if the user has selected or highlighted specific elements in the design tool
3. Apply changes using the tool-specific workflow
4. Take a screenshot to verify the changes
5. Signal completion for modified elements
6. Return to Phase 4 (Review and Approve)

Keep iterations fast. Small changes should appear quickly.

### Phase 6: Handoff

#### 6.1 Export Reference Artifacts

Capture final screenshots or exports of approved designs for reference during implementation.

#### 6.2 Update Plan File

Add a design section to the plan file:

```markdown
## Design
- **Status:** Approved
- **Tool:** [Paper / Pencil / Figma / Sketch / Penpot]
- **Screens:** [list of designed screens]
- **Key decisions:** [notable visual choices]
```

#### 6.3 Note Integration Points

During `/ce:work`, these existing agents can verify implementation fidelity:
- `compound-engineering:design:design-implementation-reviewer` -- Compare implementation against designs
- `compound-engineering:design:figma-design-sync` -- Sync Figma designs to implementation (Figma users)
- `compound-engineering:design:design-iterator` -- Iteratively polish designs through screenshot-analyze-improve cycles

#### 6.4 Suggest Next Step

"Designs approved. Run `/ce:work [plan-file]` to start implementation."

## When to Skip

- Backend-only work (APIs, data processing, infrastructure)
- Trivial UI changes (copy updates, color tweaks)
- Existing design system with no new screens needed
- User explicitly says to skip design review

## Success Criteria

- User has reviewed and approved visual designs before implementation begins
- Plan file updated with design status and tool used
- Reference artifacts available for `/ce:work` implementation

## Key Principles

- **Live feedback** -- Where possible, the user watches designs appear in real-time
- **Design brief first** -- Catch misalignment before touching the canvas
- **Incremental creation** -- Small writes, frequent self-review
- **User decides** -- Never skip the approval step
- **Tool-agnostic core** -- All tool-specific logic lives in reference files
- **Realistic content** -- Use real labels and representative data, not lorem ipsum

## Reference Files

| File | Purpose |
|------|---------|
| [paper-workflow.md](references/paper-workflow.md) | Paper MCP design workflow (live HTML canvas) |
| [pencil-workflow.md](references/pencil-workflow.md) | Pencil MCP design workflow (.pen vector design) |
| [figma-workflow.md](references/figma-workflow.md) | Figma MCP workflows (official + Framelink) |
| [sketch-workflow.md](references/sketch-workflow.md) | Sketch MCP design workflow (macOS native) |
| [penpot-workflow.md](references/penpot-workflow.md) | Penpot MCP design workflow (open-source, design-as-code) |
