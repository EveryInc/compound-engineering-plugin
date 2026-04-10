# Upload and Approval

Get user approval for the local artifact, upload evidence to a public URL, and generate markdown for PR inclusion.

## Step 1: Local Approval Gate

Before uploading anywhere public, present the local artifact path to the user for approval. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini).

**Question:** "Evidence captured at [RUN_DIR]/[artifact]. Review it locally and decide:"

**Options:**
1. **Looks good, upload for PR** -- proceed to upload
2. **Not good enough, try again** -- return to the tier execution step and re-capture
3. **Skip evidence for this PR** -- set evidence to null and proceed

If the question tool is unavailable (headless/background mode), present the numbered options and wait for the user's reply before proceeding.

## Step 2: Upload to catbox.moe

After the user approves the local artifact, upload the evidence file (GIF or PNG) using the capture pipeline script. Set `ARTIFACT_PATH` to the approved GIF or PNG path:

```bash
python3 scripts/capture-demo.py upload [ARTIFACT_PATH]
```

The script uploads to catbox.moe, validates the response starts with `https://`, and retries once on failure. The last line of output is the public URL (e.g., `https://files.catbox.moe/abc123.gif`).

**If upload fails** after retry, report the failure and the local artifact path. Do not commit evidence files to the repo — they are ephemeral artifacts, not source material. Tell the user: "Upload failed. Local artifact preserved at [ARTIFACT_PATH]. You can upload it manually or retry later."

For multiple files (static screenshots tier), upload each file separately.

## Step 3: Return Output

Return the structured output defined in the SKILL.md Output section: `Tier`, `Description`, and `URL`. The caller formats the evidence into the PR description. ce-demo-reel does not generate markdown.

## Step 4: Cleanup

Remove the `[RUN_DIR]` scratch directory and all temporary files. Preserve nothing -- the evidence lives at the public URL now.

If the upload failed and the user has not yet manually uploaded, preserve `[RUN_DIR]` so the artifact is still accessible.
