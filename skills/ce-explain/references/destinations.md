# Requested Destinations

Load only when delivery to a destination was requested. Use the available capability for that destination and verify the resulting file, URL, or document reference. A calling workflow that owns the surrounding artifact also owns placement and publication; return the explanation to it instead.

Resolve only the destination information needed to complete the request. Do not require a menu or offer to rewrite or improve the explanation. Adapt the content for its intended reader before asking for any required consent to publish it. On a delivery failure, preserve the canonical local artifact and report what did not complete. Do not substitute another publisher without authorization.

## Publish a copy

Read `references/publishing.md` and follow it. It decides which publisher to use, the public-host confirmation, re-publishing, and failure handling. The canonical `$RUN_DIR/explainer.html` or `explainer.md` is the stored file it refers to. Hand a publisher the complete canonical file, already adapted for its reader; do not select a template or redesign it for the publisher. A publisher that adapts content for its own runtime owns that adaptation; do not pre-process the file for it.

## Local file

1. Ask nothing extra if the user already named a path; otherwise ask for the missing path under the skill body's interaction rule.
2. Copy the artifact out of the run dir to that path (`cp "$RUN_DIR/explainer.html" <path>` — or `explainer.md` for a markdown run), creating parent directories if needed.
3. Report the absolute path. Open it when requested and the host supports that action.
