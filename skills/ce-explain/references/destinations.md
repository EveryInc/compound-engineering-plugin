# Destination Sub-flows

Per-destination mechanics for Phase 6. The menu itself and the one-line action per option live inline in SKILL.md — this file carries only the elaborate sub-flows. Detection is by capability: probe the current session's tools and context; a missing binary, env var, or unloaded MCP tool is not proof of absence when a connector could supply the capability. Local file is the always-present floor.

## Artifact surface

Offered when an artifact-publishing tool is present in the session's toolset.

Artifact surfaces wrap published content in their own document skeleton (doctype, head, body) and enforce a CSP that blocks requests to external hosts. Publishing the run-dir file verbatim would nest a full HTML document inside theirs and break on any external reference. So:

1. Re-emit the explainer as **body-only markup**: strip the doctype/`<html>`/`<head>`/`<body>` shell; keep the content elements.
2. Keep all CSS inline (a `<style>` element at the top of the fragment is acceptable); no external font links, no external images — the explainer's no-external-request invariant already guarantees this.
3. Keep the visible metadata header and composition footer in the fragment — they are part of the artifact.
4. Publish, confirm the returned URL/reference to the user.

The run-dir file remains the complete standalone document; the fragment is a re-emission, not a replacement.

## Local file

1. Ask nothing extra if the user already named a path; otherwise accept the path from their menu answer's free-text.
2. Copy the artifact out of the run dir to that path (`cp "$RUN_DIR/explainer.html" <path>` — or `explainer.md` for a markdown run), creating parent directories if needed.
3. Where the platform exposes a browser-opening primitive (`open` on macOS, `xdg-open` on Linux, `start` on Windows), offer to open it; otherwise print the absolute path.

## Publish to Proof (markdown output only)

Proof ingests markdown, so this option renders only when the run resolved `output:md`. Invoke the `ce-proof` skill via the platform's skill-invocation primitive when it is installed, passing the artifact path, a title (`Explainer: <subject>`), and identity `ai:compound-engineering` / `Compound Engineering`; surface the returned share URL. When the skill is not installed but the Proof web API is reachable, POST the markdown per that API. On failure: retry once after a short wait, then report plainly that the upload didn't succeed and why, and fall back to the local-file path. One-way publish; the run-dir file stays canonical.

## Send to Thinkroom

Offered only when a Thinkroom capability is detected — a Thinkroom skill in the session's skill list, a reachable MCP tool, or a documented CLI that responds. Use whatever interface that capability exposes to create/share a document from the explainer content, following that interface's own contract for title and body format. Surface the returned document reference. When the send fails, report it and fall back to the local-file path. Never guess at a Thinkroom API shape when no capability is detectable — the option simply doesn't render.
