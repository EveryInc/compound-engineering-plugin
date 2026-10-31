# Screenshots for visual changes

When a PR changes what a reviewer judges by looking, screenshots in the body let them see it instead of imagining it from prose. Show before and after when a before image is cheap to get, and after only when it is not. Missing screenshots never block the PR.

## When to capture

Capture only when the change makes a material visual claim: rendered UI that a reviewer would judge faster or more correctly by seeing it than by reading about it. Examples are layout, styling, on-screen text, a new or changed screen, state, or component, and a visual bug fix. Otherwise take no screenshots and do not ask. Text output such as CLI output, logs, or API responses belongs in a code block, not in a picture of text.

In description-only mode there is no PR to attach to, so do not capture. Say in one line that screenshots can be added when the description is applied. When the body still waits on the user's confirmation before it is applied, take the screenshots after they confirm. An existing PR body that already has `## Screenshots` or `## Demo` keeps it unless the user asks to refresh it, so do not capture again.

When the project's instructions require asking before running the app, opening a browser, or taking screenshots, follow them: ask in an interactive run, and skip with a one-line reason in `mode:pipeline`. Otherwise capture without asking.

## What capture needs

All three must hold. If any is missing, write the validation note `references/compose.md` describes and add one line saying screenshots were not captured and why.

- **Attachment support.** The help for the command that will apply the body (`gh pr create --help`, or `gh pr edit --help` for an existing PR) lists an `--attach` flag. Check this before capturing anything, because without it the images cannot reach the PR.
- **A browser that saves image files to disk.** Prefer a browser built into the current host. Otherwise use `agent-browser` if it is installed, and load its own instructions first. Never install a tool or bring in another browser stack. A tool that shows you the screenshot but writes no file does not qualify.
- **The app running at the changed route.** Use a dev server that is already running, or one the project documents and that starts without extra setup. Do not install dependencies, configure secrets, or seed data just to take screenshots.

## Where the before image comes from

Use the first source that exists, then stop:

1. A screenshot of the UI without this change that the user or the caller supplied.
2. An already-deployed copy of the UI without this change: a preview deployment of the base branch, or the production URL for the same route.
3. None. Post the after screenshots alone, labeled Preview.

Net-new UI has no before image. Do not build the base revision in a second worktree or swap files in the checkout to get one unless the user asks for that. Never fake a before image, for example by undoing the change in browser devtools. Under the table, say where the before image came from (the commit or the URL), because a production URL may not match this PR's base.

## Taking the screenshots

- Use the same route, viewport, and data state for both images of a pair. Prefer viewport or component screenshots over full-page ones. GitHub centers the shorter image of a table row vertically, so both images in a pair should be the same size.
- Keep each image under 10 MB, GitHub's upload limit for images.
- Take desktop screenshots by default. Add a mobile pair when the change is responsive.
- Take the few images that prove the claim, not a tour of the app.
- Take still screenshots only. Include video or GIFs only when the user supplied them.
- Use dev or seed data. Look at every image before publishing. If one shows credentials, tokens, personal data, or a URL carrying a secret, retake it without them or drop it. Never blur or crop instead.
- Save the images in one new temporary directory outside the repository, with file names that contain no spaces. Copy any supplied before images into the same directory, because the body references every image by a path relative to it. Never commit them.

## In the body

Put the images under `## Screenshots`, placed where `references/pr-description-writing.md` puts the evidence block. Reference each image by its local path relative to that directory, with alt text that names what it shows:

```markdown
| Before | After |
|:---:|:---:|
| ![Before: settings page](./before-settings.png) | ![After: settings page](./after-settings.png) |
```

For after-only screenshots, use a single `Preview` column. The apply step uploads the files and replaces these local paths with GitHub URLs; "Applying via gh" in `references/apply-and-handoff.md` owns that.
