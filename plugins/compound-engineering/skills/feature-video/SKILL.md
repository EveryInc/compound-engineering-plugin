---
name: feature-video
description: Record a video walkthrough of a feature and add it to the PR description. Use when a PR needs a visual demo for reviewers, when the user asks to demo a feature, create a PR video, record a walkthrough, show what changed visually, or add a video to a pull request.
argument-hint: "[PR number or 'current' or path/to/video.mp4] [optional: base URL, default localhost:3000]"
---

# Feature Video Walkthrough

Record browser interactions demonstrating a feature, stitch screenshots into an MP4 video, upload natively to GitHub, and embed in the PR description as an inline video player.

## Prerequisites

- Local development server running (e.g., `bin/dev`, `npm run dev`, `rails server`)
- `agent-browser` CLI installed (load the `agent-browser` skill for details)
- `ffmpeg` installed (for video conversion)
- `gh` CLI authenticated with push access to the repo
- Git repository on a feature branch (PR optional -- skill can create a draft or record-only)
- One-time GitHub browser auth (see Step 6 auth check)

## Autopilot Mode

Autopilot is active only when the input begins with:

- `[ce-autopilot manifest=.context/compound-engineering/autopilot/<run-id>/session.json] ::`

When that marker is present:
- Strip the marker before processing the normal argument
- Read the manifest path from the marker
- Validate that the manifest describes an active autopilot run
- Treat this skill as an autopilot contract consumer, not a substantive decision owner
- Treat `wrap_up` as best-effort by default; ordinary PR, auth, upload, or environment issues should not derail the run

Then treat feature video as best effort and prefer continuing the pipeline over blocking on interaction.

Specific behavior:

- If no PR exists for the current branch, first try creating a draft PR automatically. If that fails, set `gates.wrap_up.state = skipped` with a brief reason and return control to the caller.
- If required tools are missing, the dev server is unavailable, or the app cannot be exercised, set `gates.wrap_up.state = skipped` with a brief reason and return control to the caller.
- Plan the video flow automatically. Do not ask for shot-list confirmation.
- If GitHub browser auth is required and a saved authenticated session is unavailable, set `gates.wrap_up.state = skipped` with a brief reason and return control to the caller rather than waiting for manual login.
- Briefly inform the user when the video step is skipped or downgraded. Do not block on the prompt.
- Do not append substantive product or implementation decisions to the autopilot decision log. This skill only emits operational notes and artifacts.
- When wrap-up succeeds in autopilot mode, set `gates.wrap_up.state = complete`, record brief evidence, and set `gates.wrap_up.ref = current HEAD`.

## Main Tasks

### 1. Parse Arguments & Resolve PR

**Arguments:** $ARGUMENTS

Parse the input:
- First argument: PR number, "current" (defaults to current branch's PR), or path to an existing `.mp4` file (upload-only resume mode)
- Second argument: Base URL (defaults to `http://localhost:3000`)

**Upload-only resume:** If the first argument ends in `.mp4` and the file exists, skip Steps 2-5 and proceed directly to Step 6 using that file. Resolve the PR number from the current branch (`gh pr view --json number -q '.number'`).

If an explicit PR number was provided, verify it exists and use it directly:

```bash
gh pr view [number] --json number -q '.number'
```

If no explicit PR number was provided (or "current" was specified), check if a PR exists for the current branch:

```bash
gh pr view --json number -q '.number'
```

If no PR exists for the current branch:

- In autopilot mode, try creating a draft PR automatically and continue if successful. If draft PR creation fails, set `gates.wrap_up.state = skipped` with a brief reason and return control to the caller.
- Otherwise, ask the user how to proceed. **Use the platform's blocking question tool** (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini):

```
No PR found for the current branch.

1. Create a draft PR now and continue (recommended)
2. Record video only -- save locally and upload later when a PR exists
3. Cancel
```

If option 1: create a draft PR with a placeholder title derived from the branch name, then continue with the new PR number:

```bash
gh pr create --draft --title "[branch-name-humanized]" --body "Draft PR for video walkthrough"
```

If option 2: set `RECORD_ONLY=true`. Proceed through Steps 2-5 (record and encode), skip Steps 6-7 (upload and PR update), and report the local video path and `[RUN_ID]` at the end.

**Upload-only resume:** To upload a previously recorded video, pass an existing video file path as the first argument (e.g., `/feature-video .context/compound-engineering/feature-video/1711234567/videos/feature-demo.mp4`). When the first argument is a path to an `.mp4` file, skip Steps 2-5 and proceed directly to Step 6 using that file for upload.

### 1b. Verify Required Tools

Before proceeding, check that required CLI tools are installed. Fail early with a clear message rather than failing mid-workflow after screenshots have been recorded:

```bash
command -v ffmpeg
```

```bash
command -v agent-browser
```

```bash
command -v gh
```

If any tool is missing:

- In autopilot mode, set `gates.wrap_up.state = skipped` with a brief reason and return control to the caller.
- Otherwise, stop and report which tools need to be installed:
- `ffmpeg`: `brew install ffmpeg` (macOS) or equivalent
- `agent-browser`: load the `agent-browser` skill for installation instructions
- `gh`: `brew install gh` (macOS) or see https://cli.github.com

Do not proceed to Step 2 until all tools are available unless autopilot mode already returned control.

### 2. Gather Feature Context

**If a PR is available**, get PR details and changed files:

```bash
gh pr view [number] --json title,body,files,headRefName -q '.'
```

```bash
gh pr view [number] --json files -q '.files[].path'
```

**If in record-only mode (no PR)**, detect the default branch and derive context from the branch diff. Run both commands in a single block so the variable persists:

```bash
DEFAULT_BRANCH=$(gh repo view --json defaultBranchRef -q '.defaultBranchRef.name') && git diff --name-only "$DEFAULT_BRANCH"...HEAD && git log --oneline "$DEFAULT_BRANCH"...HEAD
```

Map changed files to routes/pages that should be demonstrated. Examine the project's routing configuration (e.g., `routes.rb`, `next.config.js`, `app/` directory structure) to determine which URLs correspond to the changed files.

### 3. Plan the Video Flow

Before recording, create a shot list:

1. **Opening shot**: Homepage or starting point (2-3 seconds)
2. **Navigation**: How user gets to the feature
3. **Feature demonstration**: Core functionality (main focus)
4. **Edge cases**: Error states, validation, etc. (if applicable)
5. **Success state**: Completed action/result

In autopilot mode, create the proposed flow automatically and proceed to recording without asking for confirmation.

Otherwise, present the proposed flow to the user for confirmation before recording.

**Use the platform's blocking question tool when available** (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options and wait for the user's reply before proceeding:

```
Proposed Video Flow for PR #[number]: [title]

1. Start at: /[starting-route]
2. Navigate to: /[feature-route]
3. Demonstrate:
   - [Action 1]
   - [Action 2]
   - [Action 3]
4. Show result: [success state]

Estimated duration: ~[X] seconds

1. Start recording
2. Modify the flow (describe changes)
3. Add specific interactions to demonstrate
```

### 4. Record the Walkthrough

Generate a unique run ID (e.g., timestamp) and create per-run output directories. This prevents stale screenshots from prior runs being spliced into the new video.

**Important:** Shell variables do not persist across separate code blocks. After generating the run ID, substitute the concrete value into all subsequent commands in this workflow. For example, if the timestamp is `1711234567`, use that literal value in all paths below -- do not rely on `[RUN_ID]` expanding in later blocks.

```bash
date +%s
```

Use the output as RUN_ID. Create the directories with the concrete value:

```bash
mkdir -p .context/compound-engineering/feature-video/[RUN_ID]/screenshots
mkdir -p .context/compound-engineering/feature-video/[RUN_ID]/videos
```

Execute the planned flow, capturing each step with agent-browser. Number screenshots sequentially for correct frame ordering:

```bash
agent-browser open "[base-url]/[start-route]"
agent-browser wait 2000
agent-browser screenshot .context/compound-engineering/feature-video/[RUN_ID]/screenshots/01-start.png
```

```bash
agent-browser snapshot -i
agent-browser click @e1
agent-browser wait 1000
agent-browser screenshot .context/compound-engineering/feature-video/[RUN_ID]/screenshots/02-navigate.png
```

```bash
agent-browser snapshot -i
agent-browser click @e2
agent-browser wait 1000
agent-browser screenshot .context/compound-engineering/feature-video/[RUN_ID]/screenshots/03-feature.png
```

```bash
agent-browser wait 2000
agent-browser screenshot .context/compound-engineering/feature-video/[RUN_ID]/screenshots/04-result.png
```

### 5. Create Video

Stitch screenshots into an MP4 using the same `[RUN_ID]` from Step 4:

```bash
ffmpeg -y -framerate 0.5 -pattern_type glob -i ".context/compound-engineering/feature-video/[RUN_ID]/screenshots/*.png" \
  -c:v libx264 -pix_fmt yuv420p -vf "scale=1280:-2" \
  ".context/compound-engineering/feature-video/[RUN_ID]/videos/feature-demo.mp4"
```

Notes:
- `-framerate 0.5` = 2 seconds per frame. Adjust for faster/slower playback.
- `-2` in scale ensures height is divisible by 2 (required for H.264).

### 6. Authenticate & Upload to GitHub

Upload produces a `user-attachments/assets/` URL that GitHub renders as a native inline video player -- the same result as pasting a video into the PR editor manually.

The approach: close any existing agent-browser session, start a Chrome-engine session with saved GitHub auth, navigate to the PR page, set the video file on the comment form's hidden file input, wait for GitHub to process the upload, extract the resulting URL, then clear the textarea without submitting.

#### Check for existing session

First, check if a saved GitHub session already exists:

```bash
agent-browser close
agent-browser --engine chrome --session-name github open https://github.com/settings/profile
agent-browser get title
```

If the page title contains the user's GitHub username or "Profile", the session is still valid -- skip to "Upload the video" below. If it redirects to the login page, the session has expired or was never created -- proceed to "Auth setup".

#### Auth setup (one-time)

Establish an authenticated GitHub session. This only needs to happen once -- session cookies persist across runs via the `--session-name` flag.

Close the current session and open the GitHub login page in a headed Chrome window:

```bash
agent-browser close
agent-browser --engine chrome --headed --session-name github open https://github.com/login
```

In autopilot mode, if manual login is required because the saved session is missing or expired, set `gates.wrap_up.state = skipped` with a brief reason and return control to the caller.

Otherwise, the user must log in manually in the browser window (handles 2FA, SSO, OAuth -- any login method). **Use the platform's blocking question tool** (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present the message and wait for the user's reply before proceeding:

```
GitHub login required for video upload.

A Chrome window has opened to github.com/login. Please log in manually
(this handles 2FA/SSO/OAuth automatically). Reply when done.
```

After login, verify the session works:

```bash
agent-browser open https://github.com/settings/profile
```

If the profile page loads, auth is confirmed. The `github` session is now saved and reusable.

#### Upload the video

Navigate to the PR page and scroll to the comment form:

```bash
agent-browser open "https://github.com/[owner]/[repo]/pull/[number]"
agent-browser scroll down 5000
```

Save any existing textarea content before uploading (the comment box may contain an unsent draft):

```bash
agent-browser eval "document.getElementById('new_comment_field').value"
```

Store this value as `SAVED_TEXTAREA`. If non-empty, it will be restored after extracting the upload URL.

Upload the video via the hidden file input. Use the caller-provided `.mp4` path if in upload-only resume mode, otherwise use the current run's encoded video:

```bash
agent-browser upload '#fc-new_comment_field' [VIDEO_FILE_PATH]
```

Where `[VIDEO_FILE_PATH]` is either:
- The `.mp4` path passed as the first argument (upload-only resume mode)
- `.context/compound-engineering/feature-video/[RUN_ID]/videos/feature-demo.mp4` (normal recording flow)

Wait for GitHub to process the upload (typically 3-5 seconds), then read the textarea value:

```bash
agent-browser wait 5000
agent-browser eval "document.getElementById('new_comment_field').value"
```

**Validate the extracted URL.** The value must contain `user-attachments/assets/` to confirm a successful native upload. If the textarea is empty, contains only placeholder text, or the URL does not match, do not proceed to Step 7. Instead:

1. Check `agent-browser get url` -- if it shows `github.com/login`, the session expired. Re-run auth setup.
2. If still on the PR page, wait an additional 5 seconds and re-read the textarea (GitHub processing can be slow).
3. If validation still fails after retry, report the failure and the local video path so the user can upload manually.

Restore the original textarea content (or clear if it was empty). A JSON-encoded string is also a valid JavaScript string literal, so assign it directly without `JSON.parse`:

```bash
agent-browser eval "const ta = document.getElementById('new_comment_field'); ta.value = [SAVED_TEXTAREA_AS_JS_STRING]; ta.dispatchEvent(new Event('input', { bubbles: true }))"
```

To prepare the value: take the SAVED_TEXTAREA string and produce a JS string literal from it -- escape backslashes, double quotes, and newlines (e.g., `"text with \"quotes\" and\nnewlines"`). If SAVED_TEXTAREA was empty, use `""`. The result is embedded directly as the right-hand side of the assignment -- no `JSON.parse` call needed.

### 7. Update PR Description

Get the current PR body:

```bash
gh pr view [number] --json body -q '.body'
```

Append a Demo section (or replace an existing one). The video URL renders as an inline player when placed on its own line:

```markdown
## Demo

https://github.com/user-attachments/assets/[uuid]

*Automated video walkthrough*
```

Update the PR:

```bash
gh pr edit [number] --body "[updated body with demo section]"
```

### 8. Cleanup

In autopilot mode, do not ask for cleanup confirmation:

- If the video was successfully uploaded from the current run, remove only that run's scratch directory automatically.
- If in record-only mode or upload failed, remove only that run's screenshots and preserve the `.mp4` so the caller can upload later.
- If this was upload-only resume mode with a caller-provided `.mp4`, do not delete the caller's file.
- Briefly note what was removed and what was preserved, then return control to the caller.

Outside autopilot mode, ask the user before removing temporary files. If confirmed, clean up only the current run's scratch directory (other runs may still be in progress or awaiting upload).

**If the video was successfully uploaded**, remove the entire run directory:

```bash
rm -r .context/compound-engineering/feature-video/[RUN_ID]
```

**If in record-only mode or upload failed**, remove only the screenshots but preserve the video so the user can upload later:

```bash
rm -r .context/compound-engineering/feature-video/[RUN_ID]/screenshots
```

Present a completion summary:

```
Feature Video Complete

PR: #[number] - [title]
Video: [VIDEO_URL]

Shots captured:
1. [description]
2. [description]
3. [description]
4. [description]

PR description updated with demo section.
```

## Usage Examples

```bash
# Record video for current branch's PR
/feature-video

# Record video for specific PR
/feature-video 847

# Record with custom base URL
/feature-video 847 http://localhost:5000

# Record for staging environment
/feature-video current https://staging.example.com
```

## Tips

- Keep it short: 10-30 seconds is ideal for PR demos
- Focus on the change: don't include unrelated UI
- Show before/after: if fixing a bug, show the broken state first (if possible)
- The `--session-name github` session expires when GitHub invalidates the cookies (typically weeks). If upload fails with a login redirect, re-run the auth setup.
- GitHub DOM selectors (`#fc-new_comment_field`, `#new_comment_field`) may change if GitHub updates its UI. If the upload silently fails, inspect the PR page for updated selectors.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `ffmpeg: command not found` | ffmpeg not installed | Install via `brew install ffmpeg` (macOS) or equivalent |
| `agent-browser: command not found` | agent-browser not installed | Load the `agent-browser` skill for installation instructions |
| Textarea empty after upload wait | Session expired, or GitHub processing slow | Check session validity (Step 6 auth check). If valid, increase wait time and retry. |
| Textarea empty, URL is `github.com/login` | Session expired | Re-run auth setup (Step 6) |
| `gh pr view` fails | No PR for current branch | Step 1 handles this -- choose to create a draft PR or record-only mode |
| Video file too large for upload | Exceeds GitHub's 10MB (free) or 100MB (paid) limit | Re-encode: lower framerate (`-framerate 0.33`), reduce resolution (`scale=960:-2`), or increase CRF (`-crf 28`) |
| Upload URL does not contain `user-attachments/assets/` | Wrong upload method or GitHub change | Verify the file input selector is still correct by inspecting the PR page |
