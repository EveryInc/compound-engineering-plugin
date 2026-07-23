# Destination Sub-flows

Per-destination mechanics for Phase 6. The menu itself and the one-line action per option live inline in SKILL.md — this file carries only the elaborate sub-flows. Detection is by capability: probe the current session's tools and context; a missing binary, env var, or unloaded MCP tool is not proof of absence when a connector could supply the capability. Local file is the always-present floor.

## Claude Artifact

Offered for HTML output when the session is Claude Code and its Artifact tool is present. Give the tool the canonical `$RUN_DIR/explainer.html`, follow its current contract, and confirm the returned URL or reference to the user. The tool owns any adaptation needed for its artifact runtime; do not pre-process the HTML for it.

## Publish publicly to ht-ml.app

This is the preferred HTML publisher when the Claude Artifact adapter is not selected. ht-ml.app accepts the complete standalone HTML document and works through ordinary HTTP, independent of the agent harness.

Before publishing, the destination option itself must state: **the page is public and may be indexed, crawled, copied, or archived**. Whenever ht-ml.app is chosen without that warned option in front of the user — their initial request selected it and the menu was skipped, or they named it after the one-preferred-publisher rule kept it off a menu that *was* shown — state the same full warning in chat and ask for explicit confirmation after the warning before any publish; “this is public” is not the complete warning, and the initial request itself does not count as confirmation. Only a warned menu selection or explicit post-warning confirmation permits publishing. If confirmation cannot be obtained, do not publish; preserve the canonical `$RUN_DIR/explainer.html` and report its local path. Never publish headlessly or infer consent from the fact that an explainer was requested. If the content is sensitive, route to Local file instead.

After the user selects the warned option or explicitly confirms after the warning:

1. Prefer any ht-ml.app or general HTML-publishing capability detected in the current session. When it is a skill, invoke it through the platform's skill-invocation primitive with the canonical `$RUN_DIR/explainer.html` and the user's public-publishing confirmation; otherwise call the detected tool, connector, or browser capability directly. Follow that capability's current contract. Do not assume a particular skill name or installation path.
2. When no publisher is installed, use a reachable web or HTTP interface to follow ht-ml.app's agent-facing instructions at `https://ht-ml.app/llms.txt` (or its linked API help) and publish the complete canonical HTML. The explainer is already composed; do not select a template or redesign it.
3. Surface the returned URL. Treat any returned update credential as a secret: do not print it in chat or embed it in the page. On failure, retry once after a short wait, then report the error and fall back to the canonical local-file path.

## Local file

1. Ask nothing extra if the user already named a path; otherwise accept the path from their menu answer's free-text.
2. Copy the artifact out of the run dir to that path (`cp "$RUN_DIR/explainer.html" <path>` — or `explainer.md` for a markdown run), creating parent directories if needed.
3. Where the platform exposes a browser-opening primitive (`open` on macOS, `xdg-open` on Linux, `start` on Windows), offer to open it; otherwise print the absolute path.

## Publish to Proof (markdown output only)

Proof ingests markdown, so this option renders only when the run resolved `output:md`. Invoke the `ce-proof` skill via the platform's skill-invocation primitive when it is installed, passing the artifact path, a title (`Explainer: <subject>`), and identity `ai:compound-engineering` / `Compound Engineering`; surface the returned share URL. When the skill is not installed but the Proof web API is reachable, POST the markdown per that API. On failure: retry once after a short wait, then report plainly that the upload didn't succeed and why, and fall back to the local-file path. One-way publish; the run-dir file stays canonical.

## Send to Thinkroom

Offered only when a Thinkroom capability is detected — a Thinkroom skill in the session's skill list, a reachable MCP tool, or a documented CLI that responds. Use whatever interface that capability exposes to create/share a document from the explainer content, following that interface's own contract for title and body format. Surface the returned document reference. When the send fails, report it and fall back to the local-file path. Never guess at a Thinkroom API shape when no capability is detectable — the option simply doesn't render.
