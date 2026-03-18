---
name: ce:user-research
description: Plan user research, process interview transcripts, and build personas from accumulated insights
argument-hint: "[plan|process|personas]"
---

# Research Workflow

**Note: The current year is 2026.** Use this when dating research documents.

Orchestrate the user research loop: plan studies, process interview transcripts, and synthesize personas from accumulated insights.

## File Path Contracts

All research artifacts follow these path conventions:

| Artifact | Path Pattern | Created by |
|----------|-------------|------------|
| Research plans | `docs/user-research/plans/YYYY-MM-DD-<slug>-research-plan.md` | `research-plan` skill |
| Transcripts | `docs/user-research/transcripts/*` (gitignored, PII) | User saves manually; Phase 2 reads from here |
| Interview snapshots | `docs/user-research/interviews/YYYY-MM-DD-participant-NNN.md` | `transcript-insights` skill |
| Personas | `docs/user-research/personas/<persona-slug>.md` | `persona-builder` skill |

Directories are created lazily — each owner creates its directory before first write.

## Routing

<research_phase> #$ARGUMENTS </research_phase>

Read the content inside `<research_phase>`. Follow the FIRST matching rule below and STOP — do not continue to later rules.

### Rule 1: Inline transcript content

If the argument contains multi-line content (a transcript, meeting notes, interview text — anything beyond a single keyword or short phrase):

Do NOT attempt to save the content to a file. Writing large transcripts via tool calls causes token generation timeouts.

Instead, instruct the user:

> Save your transcript to `docs/user-research/transcripts/` as a markdown file (e.g., `2025-03-06_bcbs-ks-customer-discovery_transcript.md`), then run `/ce-user-research process`.

Stop here. Do not proceed to phase selection or any other rule.

### Rule 2: Phase name keyword

If the argument is exactly `plan`, `process`, or `personas`, jump to that phase below.

### Rule 3: Unrecognized argument

If the argument is a short unrecognized string, show the phase selection menu with a note: "Valid arguments: `plan`, `process`, `personas`."

### Rule 4: Empty argument

If the argument is empty, run phase selection:

### Phase Selection

Only run this when the argument was empty (Rule 4).

**First-run check:** If `docs/user-research/` does not exist, create it (`mkdir -p docs/user-research/`) and show before the status line:

> Setting up research workspace at `docs/user-research/`. Directories will be created as you use each phase. Transcripts are gitignored (they may contain PII).

Only show this once — when the root `docs/user-research/` directory does not exist. On subsequent runs, skip directly to the artifact status.

Show a brief artifact status (2-3 lines max):

```
Research status:
- N plans, N transcripts (M unprocessed), N interviews, N personas
```

**Counting artifacts:** For each directory, check if it exists first. If a directory does not exist, count as 0. Do not create directories during counting.

**Counting unprocessed transcripts:** Count files in `docs/user-research/transcripts/`. Then check `docs/user-research/interviews/` frontmatter for `source_transcript` fields. Transcripts not referenced by any interview are unprocessed. Simpler fallback: count transcripts minus count of interviews.

**Recommend the next logical phase** based on state:
- Unprocessed transcripts exist → recommend Process (ready-to-process data takes priority)
- Interviews exist but no personas → recommend Personas
- No plans and no transcripts → recommend Plan
- All phases have artifacts → show neutral menu

Use **AskUserQuestion** (or present numbered options and wait for reply if that tool is unavailable) with three options:
1. **Plan** -- Create a new research plan with objectives and discussion guide
2. **Process** -- Process an interview transcript into a structured snapshot
3. **Personas** -- Build or update personas from processed interviews

Lead with the recommended option.

---

## Phase 1: Plan

Load the `research-plan` skill.

The skill handles all research plan creation logic including objective framing, discussion guide generation, and output file creation.

**Return contract:** The skill creates a file at `docs/user-research/plans/YYYY-MM-DD-<slug>-research-plan.md`.

After the skill completes, proceed to **Handoff**.

---

## Phase 2: Process

### Check for Transcripts

Look for `.md` files in `docs/user-research/transcripts/`.

**If no transcripts directory exists or no transcripts found:**
Report: "No transcripts found. Save your interview transcript to `docs/user-research/transcripts/` as a markdown file, then run `/ce-user-research process`."
Proceed to **Handoff**.

**If transcripts exist:**
Identify unprocessed transcripts (not yet referenced by any interview snapshot in `docs/user-research/interviews/`).

**If no unprocessed transcripts:**
Report: "All transcripts have been processed. Save new transcripts to `docs/user-research/transcripts/` or re-process an existing one."
Proceed to **Handoff**.

**If exactly one unprocessed transcript:**
Present it with confirmation via AskUserQuestion: "Found 1 unprocessed transcript: `[filename]`. Process this one?"
Do not auto-select.

**If multiple unprocessed transcripts:**
List them and ask the user to select via AskUserQuestion.

### Process Selected Transcript

Load the `transcript-insights` skill with the selected transcript path.

The skill handles all processing logic including plan linking, metadata gathering, insight extraction, and output file creation.

**Return contract:** The skill creates a file at `docs/user-research/interviews/YYYY-MM-DD-participant-NNN.md`.

After the skill completes, proceed to **Handoff**.

---

## Phase 3: Personas

### Check for Interviews

Look for processed interviews in `docs/user-research/interviews/`.

**If no interviews exist:**
Report: "No processed interviews found in `docs/user-research/interviews/`. Process transcripts first with `/ce:user-research process`."
Proceed to **Handoff**.

**If interviews exist:**
Load the `persona-builder` skill.

The skill handles persona matching, creation, merging, and output file creation.

**Return contract:** The skill creates or updates a file at `docs/user-research/personas/<persona-slug>.md`.

After the skill completes, proceed to **Handoff**.

---

## Handoff

Announce the created or updated file path.

If the skill completed without producing output (user abandoned or input was invalid), skip the file announcement and proceed directly to the menu.

Use **AskUserQuestion** (or present numbered options and wait for reply if that tool is unavailable) with three options:

1. **Continue research** -- Return to the phase selection menu
2. **Proceed to `/ce:brainstorm`** -- Hand off to brainstorm workflow
3. **Done for now**

If the user selects "Continue research", return to the **Phase Selection** section above.
