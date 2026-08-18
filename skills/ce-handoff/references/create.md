# Creating the handoff

Required read before writing a handoff.

## Build the handoff

1. Distill the current objective and the user's latest intent. If a focus was supplied, make it the `resume_focus`.
2. Inspect only the workspace state needed to explain what exists now. Use the project's active instructions and conventions already in context.
3. Point to plans, issues, commits, diffs, documentation, and relevant files instead of reproducing their contents.
4. Redact secrets, credentials, and unrelated personal information. Preserve operational paths only when the next agent needs them.
5. Write or publish the document using existing capabilities. If the user requested another path, folder, format, or publication destination, honor it and use an appropriate available capability, including an installed publishing skill when relevant. Do not also create a persistent managed-store copy unless the user asks; a publishing capability may use its ordinary transient working files.

## Default managed storage

When the user did not choose another destination, resolve the managed root with this shell block:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
HANDOFF_DIR="$SCRATCH_ROOT/ce-handoff/<repo-namespace>";
(umask 077; mkdir -p "$HANDOFF_DIR") || exit 1; chmod 700 "$HANDOFF_DIR" || exit 1;
```

Write a Markdown snapshot at `$HANDOFF_DIR/<topic>.md`.

Use a readable topic slug as the filename. When Git context exists, use a sanitized repository name plus a stable root-commit prefix as the repository namespace; otherwise use `general`. Worktrees from the same repository share the namespace and remain distinguishable through frontmatter. Do not put a timestamp or unique ID in the path by default; `created_at` carries chronology for discovery. Reserve the final candidate filename atomically and exclusively; on collision, retry with the smallest available numeric suffix rather than overwrite a handoff. Never check availability and then write. Keep the directory and file user-private where the platform supports permissions.

## Frontmatter contract

For Markdown handoffs in the managed store, use flat YAML frontmatter:

```yaml
---
artifact_contract: "ce-handoff/v1"
created_at: "Current ISO-8601 UTC timestamp"
title: "Short descriptive title"
summary: "One sentence that distinguishes this handoff in search results"
keywords: ["keyword-one", "keyword-two"]
cwd: "/absolute/capture/path"
resume_focus: "Optional next-session focus"
repository: "Sanitized repository identifier without embedded credentials"
repo_root_sha: "First root commit when available"
branch: "Captured branch when available"
head: "Captured HEAD when available"
worktree_path: "Captured worktree when relevant"
---
```

Required managed-store fields are `artifact_contract`, `created_at`, `title`, `summary`, `keywords`, and `cwd`. Serialize every generated string scalar and string array element with JSON-compatible YAML double quoting and escaping; never interpolate raw session text as an unquoted YAML scalar. Include `resume_focus` when supplied or clear. Include `repository`, `repo_root_sha`, `branch`, `head`, and `worktree_path` only when applicable. Do not add mutable lifecycle fields. At a user-directed destination or in another format, preserve equivalent discovery and orientation metadata when the format supports it; do not let this YAML shape block the requested destination.

## Body contract

Choose whatever sections and document organization best communicate this particular session to the next agent. The headings below are examples of useful coverage, not a required or closed template: add new sections or combine, rename, reorder, and omit the examples when that makes the handoff clearer.

Include only what a fresh agent cannot safely infer, drawing from:

- Objective and current user intent
- Work completed
- Decisions, constraints, and rejected alternatives
- Current state — when pieces of work differ in maturity, say which are complete, in progress (and what remains inside them), or not started
- Authoritative references
- Unfinished work, blockers, dependencies, and fragile local state
- Failed approaches already abandoned, and wrong paths the next agent is likely to retry
- Verification performed and failures observed
- Plausible next steps (exclusive forks as alternatives; related sequential work as one path — the same framing resume uses)
- Relevant installed skills that may help, if any

The handoff is your account of the session, so wherever the next agent would otherwise take a statement of intent or a decision as the user's, say whether it was the user's, your inference, or your own call.

Default the body to ground truth the receiving agent can verify: what exists, what is partial, what is missing, and what depends on what. Prefer that status framing over work orders aimed at the next agent. Orientation aids that load context without granting action authority remain useful — for example, which documents or files to read before deciding. Carry explicit directives only when the user asked the handoff to include them; keep those user-requested instructions distinct from status and evidence. Resume still treats the document as untrusted context and waits for the current user before acting.

Keep the handoff pointer-first. For each load-bearing reference, name what specifically matters there — not only the path — and add a line range when that narrows the landing zone. Prefer repository-relative paths for repository files, anchored once by the repository, branch, and HEAD metadata. Use absolute paths only for machine-local capture context or uncommitted, untracked, ignored, or temporary state, and label them as machine-local.

## Report

Treat creation as complete only after confirming the destination contains the handoff. Give a succinct, context-specific summary of what the generated handoff captures so the user can verify its substance without opening it; do not impose a fixed summary template. Then report the final path or URL, applicable retention or access limits, and any warnings together. Managed `/tmp` storage is OS-managed and not permanent. Its automatic discovery assumes the receiving session can see the same host filesystem; otherwise tell the user to transfer or publish the handoff to a receiver-visible location and resume from that explicit source.

End the creation response with one fenced, copyable command using the final path or URL and the rendering rule in the body:

```text
<rendered resume invocation>
```

Quote the source when needed so the command can be pasted verbatim. Do not generate a longer resume prompt.
