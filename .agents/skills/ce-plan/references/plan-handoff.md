# Plan Handoff

Post-plan-writing instructions: final checks and post-generation options. Load after plan file is written.

## 5.3.9 Final Checks

Before completing:

- Plan is stronger in specific ways, not merely longer
- Planning boundary is intact
- Origin decisions are preserved (when origin exists)
- Artifact-backed scratch dir is cleaned up if used

## 5.4 Post-Generation Options

**Summary line:** `Plan written to <absolute-path>. What would you like to do next?`

**Options:**

1. **Start `/ce-work`** (recommended) — Begin implementing in the current session. Use `spawn_agent` on `ce-work` skill with plan path as argument. Do not merely tell the user to type `/ce-work` — fire the invocation now.

2. **Open in browser** — Display the absolute path to the markdown plan file. Use `open <path>` on macOS if available, otherwise print the absolute path for the user.

3. **Done for now** — End the turn. Plan file is saved and can be resumed later. No follow-up work without explicit user prompt.

**Routing:**

- **Start `/ce-work`** → `spawn_agent` invoking `ce-work` skill with plan path
- **Open in browser** → `open` command or print absolute path
- **Done for now** → End session

**Path format:** Use absolute paths for chat output — relative paths are not auto-linked in most terminals.
