# Tier: Static Screenshots

Capture individual PNG screenshots. No animation, no stitching.

**Best for:** Fallback when other tools are unavailable, library demos, or features where animation doesn't add value.
**Output:** PNG files
**Label:** "Screenshots"
**Required tools:** Varies (agent-browser for web, silicon for CLI, or native screenshot)

## Capture by Project Type

### Web app or desktop app (agent-browser available)

```bash
agent-browser open [URL]
```

```bash
agent-browser wait 2000
```

```bash
agent-browser screenshot [RUN_DIR]/screenshot-01.png
```

Capture 1-3 screenshots: before state, feature in action, result state.

### CLI tool (silicon available)

Run the command, capture its output to a text file, then render with silicon:

```bash
silicon [RUN_DIR]/output.txt -o [RUN_DIR]/screenshot-01.png --theme Dracula -l bash --pad-horiz 20 --pad-vert 20
```

### CLI tool (no silicon)

Run the command and capture the raw terminal output. Include the output as a code block in the PR description instead of an image. Label it as "Terminal output", never "Screenshot".

### Library

Run example code that exercises the new API. Capture the output as above (silicon if available, code block if not).

## Upload

Each PNG is uploaded individually. Proceed to `references/upload-and-approval.md` for each file, or upload all and present them together for approval.

For multiple screenshots, the markdown embed uses multiple image lines:

```markdown
## Screenshots

![Before](url-1)
![After](url-2)
```
