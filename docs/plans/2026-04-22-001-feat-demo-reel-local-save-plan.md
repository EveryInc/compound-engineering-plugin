---
title: "feat(ce-demo-reel): Add local save as alternative to catbox upload"
type: feat
status: active
date: 2026-04-22
origin: docs/brainstorms/2026-04-22-demo-reel-local-save-requirements.md
---

# feat(ce-demo-reel): Add local save as alternative to catbox upload

## Overview

Add a destination choice to the ce-demo-reel upload flow: after capture, the user picks either "upload to catbox" (existing behavior) or "save locally" (new). Local save copies the final artifact to a stable OS-temp path with a descriptive filename. The catbox upload path is unchanged.

---

## Problem Frame

When ce-demo-reel captures evidence, local artifacts are deleted after uploading to catbox.moe. Users who want to keep evidence locally have no way to do so. (See origin: `docs/brainstorms/2026-04-22-demo-reel-local-save-requirements.md`)

---

## Requirements Trace

- R1. After capture completes, ask the user whether to upload to catbox or save locally
- R2. The question must present the captured artifact(s) and clearly describe both options
- R3. When the user chooses local save, copy artifacts to `$TMPDIR/compound-engineering/ce-demo-reel/`; do not upload to catbox
- R4. Create the destination directory if it does not exist
- R5. Use a descriptive filename with branch name and timestamp to avoid collisions
- R6. After saving, display the local file path(s) to the user

---

## Scope Boundaries

- Catbox upload logic itself is unchanged — only the routing is new
- No automatic git-add or commit of saved artifacts
- No configurable save path — `$TMPDIR/compound-engineering/ce-demo-reel/` is the fixed default
- No retroactive save of previously captured evidence

---

## Context & Research

### Relevant Code and Patterns

- `plugins/compound-engineering/skills/ce-demo-reel/references/upload-and-approval.md` — the 5-step upload flow where the destination choice will be inserted
- `plugins/compound-engineering/skills/ce-demo-reel/scripts/capture-demo.py` — pipeline script with `preview` and `upload` subcommands; will get a new `save-local` subcommand
- `plugins/compound-engineering/skills/ce-demo-reel/SKILL.md` — Step 8 delegates to `upload-and-approval.md`; Output section defines the return format

### Institutional Learnings

- **Script-first architecture** (`docs/solutions/skill-design/script-first-skill-architecture.md`): File manipulation (mkdir, copy, path generation) belongs in the Python script, not inline in SKILL.md
- **Prefer Python over bash** (`docs/solutions/best-practices/prefer-python-over-bash-for-pipeline-scripts-2026-04-09.md`): The `save-local` subcommand should be Python, consistent with the existing script

---

## Key Technical Decisions

- **Destination choice replaces approval gate, not adds to it**: The existing Step 2 approval gate asks "use this / recapture / skip". The new flow asks "upload to catbox / save locally / recapture / skip" — a single merged question, not two sequential prompts.
- **`save-local` as a script subcommand**: Per script-first architecture, the Python script handles directory creation, filename generation, and file copying. The SKILL.md orchestrates the choice and calls the script.
- **Filename format**: `<branch>-<YYYYMMDD-HHMMSS>.<ext>` — branch provides context, timestamp prevents collisions. Branch name is sanitized (slashes to dashes, truncated to 60 chars).
- **Output format for local save**: The existing output uses `URL: [public URL]`. For local saves, use `Path: [local path]` instead, so the caller can distinguish between the two.

---

## Open Questions

### Resolved During Planning

- **Should preview upload still happen before the choice?** Yes — the user needs to see the artifact to decide. The preview is temporary (1h) and costs nothing if they choose local save.

### Deferred to Implementation

- **Exact branch-name sanitization regex**: Implementation detail; follow Python `re.sub` conventions.

---

## Implementation Units

- [ ] U1. **Add `save-local` subcommand to capture-demo.py**

**Goal:** Add a script subcommand that copies an artifact to a target directory with a descriptive filename.

**Requirements:** R3, R4, R5, R6

**Dependencies:** None

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-demo-reel/scripts/capture-demo.py`

**Approach:**
- Add `save-local` subcommand accepting `--file` (artifact path), `--branch` (branch name), and `--output-dir` (target directory, defaults to `$TMPDIR/compound-engineering/ce-demo-reel/`)
- Create output directory with `os.makedirs(exist_ok=True)`
- Sanitize branch name: replace `/` with `-`, strip non-alphanumeric chars except `-`, truncate to 60 chars
- Generate filename: `<sanitized-branch>-<YYYYMMDD-HHMMSS>.<ext>` where ext comes from the source file
- Copy file with `shutil.copy2`
- Print the final absolute path as the last line of output (matching the convention of `preview` and `upload` which print the URL as last line)
- Register the subcommand in the argparse `main()` block

**Patterns to follow:**
- `cmd_preview` and `cmd_upload` in the same file — same structure, same error handling with `die()`
- Argparse registration pattern at bottom of file

**Test scenarios:**
- Happy path: `save-local --file /tmp/demo.gif --branch feat/add-login` creates `$TMPDIR/compound-engineering/ce-demo-reel/feat-add-login-<timestamp>.gif` and prints the path
- Happy path: `save-local --file /tmp/screenshot.png --branch main` creates `$TMPDIR/compound-engineering/ce-demo-reel/main-<timestamp>.png`
- Edge case: branch with deep nesting `feat/team/subsystem/thing` sanitizes to `feat-team-subsystem-thing`
- Edge case: branch name exceeding 60 chars is truncated
- Edge case: output directory does not exist — created automatically
- Error path: source file does not exist — exits with error message

**Verification:**
- `python3 scripts/capture-demo.py save-local --file <test-gif> --branch test-branch` copies the file and prints the destination path

---

- [ ] U2. **Update upload-and-approval.md to add destination choice**

**Goal:** Replace the current approval gate with a combined destination-choice question that includes the local save option.

**Requirements:** R1, R2

**Dependencies:** U1

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-demo-reel/references/upload-and-approval.md`

**Approach:**
- Step 1 (preview upload) stays unchanged — user still sees a preview
- Step 2 becomes "Destination Choice" instead of "Approval Gate"
- The blocking question now offers 4 options:
  1. **Upload to catbox (public URL)** — proceeds to Step 3 (promote to permanent, unchanged)
  2. **Save locally** — runs `save-local` subcommand, skips Step 3, goes to cleanup
  3. **Recapture** — unchanged behavior
  4. **Proceed without evidence** — unchanged behavior
- Add a new section "Step 3b: Local Save" that calls `python3 scripts/capture-demo.py save-local --file [ARTIFACT_PATH] --branch [BRANCH]`
- Step 3b captures the printed path and uses it in the output
- Step 5 (cleanup) remains the same — `[RUN_DIR]` is always removed since the artifact has been copied out

**Patterns to follow:**
- Existing Step 2 approval gate structure (question wording, option format, platform blocking tool instructions)
- Existing Step 3 promote structure (script invocation, output capture)

**Test scenarios:**
- Happy path: user selects "Save locally" -> `save-local` runs, local path displayed, `[RUN_DIR]` cleaned up
- Happy path: user selects "Upload to catbox" -> existing promote flow runs unchanged
- Happy path: user selects "Recapture" -> returns to tier execution as before
- Integration: multiple static screenshots — each file is saved locally with the same branch prefix but unique timestamps

**Verification:**
- The approval gate question includes all 4 options with clear descriptions
- "Save locally" branch calls the script and does not invoke catbox upload
- "Upload to catbox" branch is functionally identical to the current behavior

---

- [ ] U3. **Update SKILL.md output format for local saves**

**Goal:** Extend the output contract to support local file paths alongside URLs.

**Requirements:** R6

**Dependencies:** U2

**Files:**
- Modify: `plugins/compound-engineering/skills/ce-demo-reel/SKILL.md`

**Approach:**
- In the Output section, add `Path` as an alternative to `URL`:
  - `URL: [public URL]` when uploaded to catbox (unchanged)
  - `Path: [local file path]` when saved locally
  - One of the two is present, never both
- Update the note about `URL: "none"` to cover the local case: when saved locally, `URL` is `"none"` but `Path` is populated

**Patterns to follow:**
- Existing output block format in SKILL.md

**Test scenarios:**
- Happy path: local save produces output with `Path:` field and `URL: "none"`
- Happy path: catbox upload produces output with `URL:` field and no `Path:` field (unchanged)

**Verification:**
- Output contract is clear about when `Path` vs `URL` is present
- Callers (e.g., ce-commit-push-pr) can distinguish local from remote evidence

---

## System-Wide Impact

- **Interaction graph:** ce-commit-push-pr is the primary caller of ce-demo-reel. It currently expects a `URL` in the output to embed in PR descriptions. With local saves, it will receive `Path` instead — it should handle this gracefully (e.g., skip embedding or note that evidence is local-only).
- **Error propagation:** If `save-local` fails (disk full, permission denied), the artifact still exists in `[RUN_DIR]`. The skill should report the error and offer to retry or fall back to catbox upload.
- **Unchanged invariants:** The catbox preview/upload pipeline, tier selection, and capture logic are entirely untouched.

---

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| ce-commit-push-pr doesn't handle `Path` output | Check how ce-commit-push-pr consumes demo-reel output; update if needed (but scoped out of this plan per scope boundaries) |
| OS-temp files cleaned by system reboot | Acceptable — demo reel artifacts are transient; users can `mv` to repo if they want to commit |

---

## Sources & References

- **Origin document:** [docs/brainstorms/2026-04-22-demo-reel-local-save-requirements.md](docs/brainstorms/2026-04-22-demo-reel-local-save-requirements.md)
- Related code: `plugins/compound-engineering/skills/ce-demo-reel/`
- Learnings: `docs/solutions/skill-design/script-first-skill-architecture.md`, `docs/solutions/best-practices/prefer-python-over-bash-for-pipeline-scripts-2026-04-09.md`
