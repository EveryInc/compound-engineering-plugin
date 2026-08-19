# Destinations and Close

Everything Phase 6 does: the destination menu, the action to fire for each option, each destination's sub-flow, the audience re-render offer, and the improvement observations the run closes on. SKILL.md names this file as a required read before Phase 6 renders anything, and keeps the stop classes that must hold even if this file is never opened. Detection is by capability: probe the current session's tools and context; a missing binary, env var, or unloaded MCP tool is not proof of absence when a connector could supply the capability. Local file is the always-present floor.

## The menu, and what fires for each option

Size and detect the menu per `references/orchestration.md`'s menu section: it decides which destinations are visible, that only one publisher is offered, and what to do when the visible set exceeds the host's option cap. If the user names a publisher that the one-preferred-publisher rule kept off the menu, honor it by the bypassed-menu path below (full warning, then explicit confirmation), never as though the menu had warned them — it didn't.

When the user picks an option, fire its action rather than acknowledging the choice in prose:

- **Claude Artifact** (HTML only) — create an artifact from the canonical explainer per that destination's section below.
- **Publish publicly to ht-ml.app** (HTML only) — label it Recommended, and state in the option description that the page is public and may be indexed, crawled, copied, or archived. Then follow the ht-ml.app sub-flow below, passing the complete canonical HTML to the resolved publisher. Do not assume a particular skill exists, and do not add a ce-explain-specific publisher. On a menu bypass, give that same warning in chat and get explicit confirmation after it; the pre-warning request does not count as confirmation. If confirmation cannot be obtained, do not publish; preserve the canonical HTML and report its local `$RUN_DIR/explainer.html` path.
- **Local file** — copy it out of `$RUN_DIR` to the path the user names, then offer to open it where the platform exposes `open` / `xdg-open` / `start`; otherwise print the absolute path.
- **Publish to Proof** (markdown only) — publish per that destination's section below and surface the share URL; on failure retry once, then report and move on.
- **Send to Thinkroom** (only when a Thinkroom capability is detected) — send per that destination's section below.
- **Leave it** — report the `$RUN_DIR` path, noting it is temporary and does not survive reboot; nothing else is written.

## Audience mismatch — offered before the destination's own consent gate

Some destinations put the artifact in front of other people: ht-ml.app, Proof, and Thinkroom, but not Claude Artifact, which stays private until the user shares it. When a personally-composed artifact is headed to one of those, offer once to re-render it for that audience per the compose-time reference before sending. Take their answer and proceed either way; never re-render unasked, and never block the send on it.

**This offer comes first**, before any publish warning or confirmation the destination requires. Consent must attach to the artifact actually being published, and the adapted rendering differs materially: it names a person where the personal one says "you". Ask one question at a time: settle the rendering, then run the destination's own consent gate. When the destination needs no confirmation, this is the only ask.

## Improvement observations

Things the composition surfaced as improvable are routed by type once the destination is settled — offered, never auto-fired. "Settled" means the artifact was sent, the user declined, or the run stopped at an unanswered consent gate; in that last case the run ends there and these offers are skipped. Never raise them while any of the asks above is still open — the destination question, the audience re-render offer, or a publisher's consent gate.

**User-runnable invocation rendering.** Only the user-run handoff below uses printed invocation syntax. Default to `/ce-polish`; use `$ce-polish` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. On oh-my-pi (`omp`), use `/skill:ce-polish`. Render only the invocation as inline code and output one form only.

- **New-capability ideas** — offer first; on acceptance invoke the `ce-ideate` skill via the skill-invocation primitive with the observations as seed context, rather than telling the user to run it.
- **Code-clarity findings** — offer first; on acceptance invoke the `ce-simplify-code` skill via the skill-invocation primitive with the observations and the files they concern, rather than telling the user to run it.
- **UI/UX polish opportunities** — present the observations in chat and tell the user to invoke `ce-polish` themselves using the rendering rule above; it is user-invoked only (`disable-model-invocation`), so never fire it via the skill primitive.
- **A repo doc the evidence contradicts** — grounding reads plans and solution docs, so a recap or diff routinely surfaces one that is now stale, superseded, or contradicted by what shipped. Offer first; on acceptance invoke the `ce-compound-refresh` skill via the skill-invocation primitive, naming the doc and the evidence that supersedes it. Do not edit the doc here — this skill teaches, it does not maintain repo memory.

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
