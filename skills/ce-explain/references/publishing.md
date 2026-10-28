# Publishing a Copy

Read this before opening, sharing, or publishing a document this skill wrote.

Publishing makes a copy. Write the document first to the place this skill normally stores it, such as the repo artifact root, or a temp path when there is no repo. That stored file stays the record other skills read. A published copy never replaces it, and nothing syncs back from the copy.

Never publish in a headless run, one with no user present to answer, such as a pipeline or an automated caller. Keep the stored file and report its path.

## Choose the destination

1. Use the publisher the user asked for, or one they named in their own instructions or stated preferences. A publishing skill, CLI, or connector that is merely installed counts only when the user named it. Being installed is not permission to upload.
2. Otherwise, offer the host's own artifact tool when this session has one. That is a tool the host itself provides for publishing pages or documents, not an installed add-on.
3. Otherwise, keep the local file and open it in the browser where the host can. If it cannot, print the file's absolute path.

Reach the chosen publisher through its own skill, tool, or documented interface, and follow that interface's current contract. Do not guess an API shape. Proof (`ce-proof`) accepts markdown only: never upload HTML to it. For an HTML document, tell the user Proof cannot take it, and offer to publish a markdown rendering of the same content instead.

When a menu offers this step, label the option with the destination chosen here, for example **Open in browser** or **Publish a copy to <destination>**.

## Public hosts

A public host is one where anyone who has or finds the link can read the page without signing in. Before sending anything to a public host, tell the user the page will be public and may be indexed, copied, or archived. Then get their explicit confirmation for this document. The request that named the host does not count as confirmation. A document that changed materially since the confirmation needs a new confirmation. If confirmation cannot be obtained, do not publish; keep the local file and report its path.

## Re-publishing and failure

When the document changed after it was published, update the existing published artifact if the destination supports updates, instead of creating a new one. Do not write the published URL into the document. Give the user the link the publisher returns for sharing, even when that link carries an access token. Treat a separate management credential the publisher returns, such as an owner secret or update key, as a secret: do not print it in chat or embed it in the document.

If publishing fails, keep the local file and report what failed along with the local path. Do not switch to another publisher unless the user authorizes it.
