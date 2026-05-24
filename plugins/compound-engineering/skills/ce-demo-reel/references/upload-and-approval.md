# Upload and Approval

Upload a temporary preview for the user to review, then either promote to permanent hosting or save locally based on user choice.

## Headless / Background Mode

If no blocking question tool is available (Codex running autonomously, background agent, or any mode where there is no synchronous user), skip Steps 1–2 and go straight to headless upload:

1. **R2 available** (`R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_URL` all set): upload to R2 and use the public URL. Proceed to Step 3-R2.
2. **R2 not available**: upload directly to catbox permanent hosting without a preview step. Proceed to Step 3.

## Step 1: Preview Upload (Temporary)

Upload the evidence file (GIF or PNG) to litterbox for a temporary 1-hour preview:

```bash
python3 scripts/capture-demo.py preview [ARTIFACT_PATH]
```

The last line of output is the preview URL (e.g., `https://litter.catbox.moe/abc123.gif`). This URL expires after 1 hour — no cleanup needed.

For multiple files (static screenshots tier), upload each file separately.

**If upload fails** after retry, fall back to opening the local file with the platform file-opener (`open` on macOS, `xdg-open` on Linux) so the user can still review it. Include the local path in the destination choice question instead of a URL.

## Step 2: Destination Choice

Present the preview URL to the user and ask how to handle the evidence. Use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_user` in Gemini, `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to presenting options in chat only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question.

**Question:** "Evidence preview (1h link): [PREVIEW_URL]. Where should the evidence go?"

**Options:**
1. **Upload to R2 (public URL)** -- upload to Cloudflare R2 for permanent PR embedding (available when R2 env vars are set)
2. **Upload to catbox (public URL)** -- promote to catbox permanent hosting for PR embedding
3. **Save locally** -- save to a stable OS-temp path (/tmp/compound-engineering/ce-demo-reel/)
4. **Recapture** -- provide instructions on what to change
5. **Proceed without evidence** -- set evidence to null and proceed

Omit option 1 if R2 env vars (`R2_ACCESS_KEY_ID`, `R2_BUCKET`, `R2_ENDPOINT`, `R2_PUBLIC_URL`) are not set.

### On "Upload to R2 (public URL)"

Proceed to Step 3-R2: R2 Upload.

### On "Upload to catbox (public URL)"

Proceed to Step 3: Promote to Permanent Hosting (catbox).

### On "Save locally"

Proceed to Step 3b: Local Save.

### On "Recapture"

Return to the tier execution step. The user's instructions guide what to change in the next capture attempt. After recapture, upload a new preview and repeat the destination choice.

### On "Proceed without evidence"

Set evidence to null and proceed. The preview link expires on its own.

## Step 3: Promote to Permanent Hosting (catbox)

After the user selects "Upload to catbox", upload to permanent catbox hosting. The command accepts either the preview URL (preferred) or the local file path (fallback):

```bash
python3 scripts/capture-demo.py upload [PREVIEW_URL or ARTIFACT_PATH]
```

If Step 1 produced a preview URL, pass it here -- catbox copies directly from litterbox without re-uploading. If Step 1 fell back to local review (no preview URL), pass the local artifact path instead.

The last line of output is the permanent URL (e.g., `https://files.catbox.moe/abc123.gif`). Use this URL in the output, not the preview URL.

For multiple files, promote each separately.

## Step 3-R2: R2 Upload

Upload the artifact to Cloudflare R2 using the AWS CLI:

```bash
KEY="ce-demo-reel/$(date +%Y%m%d-%H%M%S)-$(basename [ARTIFACT_PATH])"
AWS_ACCESS_KEY_ID="$R2_ACCESS_KEY_ID" \
AWS_SECRET_ACCESS_KEY="$R2_SECRET_ACCESS_KEY" \
aws s3 cp [ARTIFACT_PATH] "s3://$R2_BUCKET/$KEY" \
  --endpoint-url "https://$R2_ENDPOINT" \
  --content-type "image/gif"
```

Adjust `--content-type` to `image/png` for static screenshots.

The permanent public URL is: `$R2_PUBLIC_URL/$KEY`

**If upload fails** (aws CLI not available, credentials invalid), fall back to catbox (Step 3) and note the fallback reason.

For multiple files, upload each separately with a unique key.

## Step 3b: Local Save

After the user selects "Save locally", save the artifact to the default OS-temp path using the pipeline script:

```bash
python3 scripts/capture-demo.py save-local --file [ARTIFACT_PATH] --branch [BRANCH_NAME]
```

Determine `[BRANCH_NAME]` from `git branch --show-current` or the PR context discovered in Step 0 of the SKILL.md.

The last line of output is the absolute path of the saved file. Use this path in the output.

For multiple files (static screenshots tier), save each file separately.

**If save fails** (permission denied, disk full), report the error and offer to retry or fall back to catbox upload (Step 3).

## Step 4: Return Output

Return the structured output defined in the SKILL.md Output section: `Tier`, `Description`, and either `URL` (permanent public URL) or `Path` (local file path). The caller formats the evidence into the PR description. ce-demo-reel does not generate markdown.

## Step 5: Cleanup

Remove the `[RUN_DIR]` scratch directory and all temporary files. Preserve nothing -- the evidence lives at the permanent URL or has been copied to the local save path.
