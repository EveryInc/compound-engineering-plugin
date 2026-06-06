# Plan Handoff

Post-plan-writing instructions: final checks and options.

## 5.3.9 Final Checks

Before completing:
- Confirm the plan is stronger, not merely longer
- Confirm the planning boundary is intact
- Confirm origin decisions are preserved (when origin exists)

## 5.4 Post-Generation Options

**Summary line:** `Plan written to <absolute path>. What would you like to do next?`

**Options:**
1. **Start `/ce-work`** - Begin implementing this plan in the current session
2. **Open in browser** - Open the markdown plan file locally for review
3. **Create Issue** - Create a tracked issue from this plan
4. **Done for now** - Pause; plan saved for later

**Routing:**
- **Start `/ce-work`** - Invoke `Skill ce-work` with the plan path
- **Open in browser** - Display absolute path to the `.md` plan file
- **Create Issue** - Detect tracker from `AGENTS.md`, then run appropriate CLI command
- **Done for now** - End session, plan saved

**Note:** Issue/Proof/HITL flows are Claude Code ecosystem features. The Zed version keeps only the core options (ce-work, browser, done) to stay focused on the planning output.
