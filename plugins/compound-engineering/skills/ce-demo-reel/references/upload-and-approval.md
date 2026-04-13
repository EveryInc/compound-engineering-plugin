# Upload and Approval

Upload a temporary preview for the user to review, then promote to permanent hosting on approval.

## Step 1: Preview Upload (Temporary)

Upload the evidence file (GIF or PNG) to litterbox for a temporary 1-hour preview:

```bash
python3 scripts/capture-demo.py preview [ARTIFACT_PATH]
```

The last line of output is the preview URL (e.g., `https://litter.catbox.moe/abc123.gif`). This URL expires after 1 hour — no cleanup needed.

For multiple files (static screenshots tier), upload each file separately.

**If upload fails** after retry, fall back to opening the local file with the platform file-opener (`open` on macOS, `xdg-open` on Linux) so the user can still review it. Include the local path in the approval question instead of a URL.

## Step 2: Approval Gate

Present the preview URL to the user for approval. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini).

**Question:** "Evidence preview (1h link): [PREVIEW_URL]"

**Options:**
1. **Use this in the PR** -- promote to permanent hosting
2. **Recapture** -- provide instructions on what to change
3. **Proceed without evidence** -- set evidence to null and proceed

If the question tool is unavailable (headless/background mode), present the numbered options and wait for the user's reply before proceeding.

### On "Recapture"

Return to the tier execution step. The user's instructions guide what to change in the next capture attempt. After recapture, upload a new preview and repeat the approval gate.

### On "Proceed without evidence"

Set evidence to null and proceed. The preview link expires on its own.

## Step 3: Promote to Permanent Hosting

After the user approves, upload to permanent catbox hosting. The command accepts either the preview URL (preferred) or the local file path (fallback):

```bash
python3 scripts/capture-demo.py upload [PREVIEW_URL or ARTIFACT_PATH]
```

If Step 1 produced a preview URL, pass it here -- catbox copies directly from litterbox without re-uploading. If Step 1 fell back to local review (no preview URL), pass the local artifact path instead.

The last line of output is the permanent URL (e.g., `https://files.catbox.moe/abc123.gif`). Use this URL in the output, not the preview URL.

For multiple files, promote each separately.

## Step 4: Return Output

Return the structured output defined in the SKILL.md Output section: `Tier`, `Description`, and `URL` (the permanent catbox URL). The caller formats the evidence into the PR description. ce-demo-reel does not generate markdown.

## Step 5: Cleanup

Remove the `[RUN_DIR]` scratch directory and all temporary files. Preserve nothing -- the evidence lives at the permanent URL now.
