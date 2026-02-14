---
name: workflows:research
description: Plan user research, process interview transcripts, and build personas from accumulated insights
argument-hint: "[plan|process|personas]"
---

# Research Workflow

**Note: The current year is 2026.** Use this when dating research documents.

Orchestrate the user research loop: plan studies, process interview transcripts, and synthesize personas from accumulated insights.

## File Path Contracts

All research artifacts follow these path conventions:

| Artifact | Path Pattern |
|----------|-------------|
| Research plans | `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md` |
| Transcripts | `docs/research/transcripts/*.md` (user-provided) |
| Interview snapshots | `docs/research/interviews/YYYY-MM-DD-participant-NNN.md` |
| Personas | `docs/research/personas/<persona-slug>.md` |

## Directory Setup

Create research directories if they do not exist:

```bash
mkdir -p docs/research/plans docs/research/transcripts docs/research/interviews docs/research/personas
```

Run this silently before any phase.

## Routing

<research_phase> #$ARGUMENTS </research_phase>

Read the content inside `<research_phase>`. Follow the FIRST matching rule below and STOP — do not continue to later rules.

### Rule 1: Inline transcript content

If the argument contains multi-line content (a transcript, meeting notes, interview text — anything beyond a single keyword or short phrase):

This IS inline transcript content. Do NOT check artifact status. Do NOT show phase selection. Handle it immediately:

1. Extract the meeting title and date from the content to generate a filename: `YYYY-MM-DD_<meeting-title-slug>_transcript.md`. If no date is found, use today's date.
2. Save the full content to `docs/research/transcripts/[filename]`
3. Jump to **Process Selected Transcript** in Phase 2 below with this file path

### Rule 2: Phase name keyword

If the argument is exactly `plan`, `process`, or `personas`, jump to that phase below.

### Rule 3: Unrecognized argument

If the argument is a short unrecognized string, show the phase selection menu with a note: "Valid arguments: `plan`, `process`, `personas`."

### Rule 4: Empty argument

If the argument is empty, run phase selection:

### Phase Selection

**SKIP this section if Rule 1 matched above (inline content).** Only run this when the argument was empty.

Show a brief artifact status (2-3 lines max):

```
Research status:
- N plans, N transcripts (M unprocessed), N interviews, N personas
```

**Counting unprocessed transcripts:** Count files in `docs/research/transcripts/`. Then check `docs/research/interviews/` frontmatter for `source_transcript` fields. Transcripts not referenced by any interview are unprocessed. Simpler fallback: count transcripts minus count of interviews.

**Recommend the next logical phase** based on state:
- Unprocessed transcripts exist → recommend Process (ready-to-process data takes priority)
- Interviews exist but no personas → recommend Personas
- No plans and no transcripts → recommend Plan
- All phases have artifacts → show neutral menu

Use **AskUserQuestion** with three options:
1. **Plan** -- Create a new research plan with objectives and discussion guide
2. **Process** -- Process an interview transcript into a structured snapshot
3. **Personas** -- Build or update personas from processed interviews

Lead with the recommended option.

---

## Phase 1: Plan

Load the `research-plan` skill.

The skill handles all research plan creation logic including objective framing, discussion guide generation, and output file creation.

**Return contract:** The skill creates a file at `docs/research/plans/YYYY-MM-DD-<slug>-research-plan.md`.

After the skill completes, proceed to **Handoff**.

---

## Phase 2: Process

### Check for Inline Content

If arriving here from **Rule 1** in Routing, the transcript has already been saved. Skip directly to **Process Selected Transcript** below.

If the argument starts with "process" followed by substantial content, strip the "process" prefix, save the content as a transcript file (using the same naming logic from Rule 1), and skip to **Process Selected Transcript**.

### Check for Transcripts

**If inline content was already saved above, skip this section.**

Look for `.md` files in `docs/research/transcripts/`.

**If no transcripts exist:**
Report: "No transcripts found in `docs/research/transcripts/`. Save your interview transcript as a `.md` file there, or pass the content inline: `/workflows:research process [transcript content]`."
Proceed to **Handoff**.

**If transcripts exist:**
Identify unprocessed transcripts (not yet referenced by any interview snapshot in `docs/research/interviews/`).

**If no unprocessed transcripts:**
Report: "All transcripts have been processed. Add new transcripts to `docs/research/transcripts/` or re-process an existing one."
Proceed to **Handoff**.

**If exactly one unprocessed transcript:**
Present it with confirmation via AskUserQuestion: "Found 1 unprocessed transcript: `[filename]`. Process this one?"
Do not auto-select.

**If multiple unprocessed transcripts:**
List them and ask the user to select via AskUserQuestion.

### Process Selected Transcript

Load the `transcript-insights` skill with the selected transcript path.

The skill handles all processing logic including plan linking, metadata gathering, insight extraction, and output file creation.

**Return contract:** The skill creates a file at `docs/research/interviews/YYYY-MM-DD-participant-NNN.md`.

After the skill completes, proceed to **Handoff**.

---

## Phase 3: Personas

### Check for Interviews

Look for processed interviews in `docs/research/interviews/`.

**If no interviews exist:**
Report: "No processed interviews found in `docs/research/interviews/`. Process transcripts first with `/workflows:research process`."
Proceed to **Handoff**.

**If interviews exist:**
Load the `persona-builder` skill.

The skill handles persona matching, creation, merging, and output file creation.

**Return contract:** The skill creates or updates a file at `docs/research/personas/<persona-slug>.md`.

After the skill completes, proceed to **Handoff**.

---

## Handoff

Announce the created or updated file path.

If the skill completed without producing output (user abandoned or input was invalid), skip the file announcement and proceed directly to the menu.

Use **AskUserQuestion** with three options:

1. **Continue research** -- Return to the phase selection menu
2. **Proceed to `/workflows:brainstorm`** -- Hand off to brainstorm workflow
3. **Done for now**

If the user selects "Continue research", return to the **Phase Selection** section above.
