# Upload and Approval

Upload evidence to a public URL for preview, get user approval, and clean up rejected uploads.

## Step 1: Generate Userhash

Generate a random userhash for this run so uploaded files can be deleted if the user rejects them:

```bash
python3 -c "import uuid; print(uuid.uuid4().hex)"
```

Store the output as `USERHASH` for use in upload and delete commands.

## Step 2: Upload to catbox.moe

Upload the evidence file (GIF or PNG) with the userhash. Set `ARTIFACT_PATH` to the GIF or PNG path:

```bash
python3 scripts/capture-demo.py upload --userhash [USERHASH] [ARTIFACT_PATH]
```

The script uploads to catbox.moe, validates the response starts with `https://`, and retries once on failure. The last line of output is the public URL (e.g., `https://files.catbox.moe/abc123.gif`).

For multiple files (static screenshots tier), upload each file separately with the same userhash.

**If upload fails** after retry, fall back to opening the local file with the platform file-opener (`open` on macOS, `xdg-open` on Linux) so the user can still review it. Include the local path in the approval question instead of a URL.

## Step 3: Approval Gate

Present the uploaded URL to the user for approval. Use the platform's blocking question tool (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini).

**Question:** "Evidence uploaded: [CATBOX_URL]"

**Options:**
1. **Use this in the PR** -- proceed with this URL
2. **Recapture** -- provide instructions on what to change
3. **Proceed without evidence** -- set evidence to null and proceed

If the question tool is unavailable (headless/background mode), present the numbered options and wait for the user's reply before proceeding.

### On "Recapture" or "Proceed without evidence"

Delete the uploaded file before continuing:

```bash
python3 scripts/capture-demo.py delete --userhash [USERHASH] [CATBOX_URL]
```

The delete command accepts full URLs or bare filenames (e.g., `abc123.gif`).

- **Recapture:** Return to the tier execution step. The user's instructions guide what to change in the next capture attempt. Upload the new artifact with the same userhash.
- **Proceed without evidence:** Set evidence to null and proceed.

## Step 4: Return Output

Return the structured output defined in the SKILL.md Output section: `Tier`, `Description`, and `URL`. The caller formats the evidence into the PR description. ce-demo-reel does not generate markdown.

## Step 5: Cleanup

Remove the `[RUN_DIR]` scratch directory and all temporary files. Preserve nothing -- the evidence lives at the public URL now.

If the upload failed and the user chose to proceed without evidence, clean up the scratch directory. If the user wants to retry the upload manually, preserve `[RUN_DIR]` so the artifact is still accessible.
