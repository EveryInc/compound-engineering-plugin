# Discoverability check

After the report, check that the project's instruction files would lead an agent to discover `<root>/solutions/` before working in a documented area. Runs every time — the store only compounds value when agents can find it.

1. Find the project's root agent-instruction surface — `AGENTS.md`, `CLAUDE.md`, `GEMINI.md`, or whatever equivalent this project uses; the substantive file is the target, so ignore a shim that just `@`-includes another. No such file exists: skip this check.
2. Assess semantically (not by string match) whether a reader would learn: the store exists, enough structure to search it (categories, frontmatter fields like `module`, `tags`, `problem_type`), and when it's relevant. If the spirit is met, done.
3. If not, draft the smallest addition that communicates those three things, matching the file's style — prefer one line in an existing related section (a directory listing, architecture tree, conventions block) over a new headed section. Keep the tone informational, not imperative ("relevant when implementing or debugging in documented areas", not "always search before implementing" — imperatives cause redundant reads when a workflow already searches). Substitute the resolved concrete root for `<root>` in what you write — readers without this plugin cannot resolve the placeholder. Calibration example for a directory listing:

   ```
   <root>/solutions/  # documented solutions to past problems (bugs, best practices, workflow patterns), organized by category with YAML frontmatter (module, tags, problem_type)
   ```

4. Interactive: show the proposed change and where it goes, explain why it matters (fresh sessions and plugin-less collaborators won't find the store otherwise), and get consent via a blocking question before editing. Non-interactive: emit a "Discoverability recommendation" line in the report instead of editing instruction files — non-interactive scope is doc maintenance, not project config.
5. If `CONCEPTS.md` exists at the repo root, run the same check for it (e.g., a `CONCEPTS.md  # shared domain vocabulary — read when orienting to the codebase` line). Skip entirely when it doesn't exist — never nag for an artifact the project hasn't adopted.
6. If this check edited an instruction file after Commit already ran, amend the commit (same branch, not yet pushed) or add a small follow-up commit (e.g., `docs: add solutions discoverability to AGENTS.md`), and push it if the branch was already pushed so an open PR includes it. If the user chose "don't commit", leave the edits uncommitted alongside the rest.
