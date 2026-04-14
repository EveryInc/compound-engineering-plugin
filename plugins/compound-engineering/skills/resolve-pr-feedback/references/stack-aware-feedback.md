# Stack-Aware Feedback Workflow

Load this reference when the PR under review is part of a `gh stack` stack. It replaces the checkout/fix/commit/push mechanics of the parent skill so fixes land on the correct layer and cascade through the stack. Comment parsing, triage, cluster analysis, reply posting, thread resolving, verification, and summary are unchanged -- continue to use the parent skill's logic for those phases.

Use the platform's blocking question tool whenever this workflow says "ask the user" (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). If none is available, present numbered options and wait for the user's reply before continuing.

---

## CLI verification pattern (read first)

Before invoking any `gh stack <cmd>`, run `gh stack <cmd> --help` first to verify current flags and behavior. gh-stack is in GitHub's private preview; flags and output formats may evolve between versions.

This workflow invokes only the following subcommands -- verify each before first use in the session:

- `gh stack view` -- inspect stack layers and map commits to layer branches
- `gh stack checkout` -- switch to the owning layer before applying a fix
- `gh stack rebase` -- cascade the fix through dependent layers (documented behavior: "Pull from remote and do a cascading rebase across the stack. Ensures that each branch in the stack has the tip of the previous layer in its commit history.")
- `gh stack push` -- push all stack layers with `--force-with-lease`

Treat any command-shape assumption below as a routing hint, not a contract. If `--help` output disagrees, follow the `--help` output.

---

## V1 scope constraints

- **Single review comment -> single layer fix.** When a batch contains comments that belong to different layers, run this workflow once per comment (sequentially). Do not attempt cross-layer batching.
- **Multi-layer fixes (one comment requires changes in multiple layers) are DEFERRED to V2.** V1 detects the case (blame spans multiple layers AND the user declines the earliest-layer default) and hands off to the user to apply the fix manually.
- **Rebase conflicts are handed off to the user.** V1 does not attempt automated conflict resolution during `gh stack rebase`.

---

## Workflow

### 1. Parse feedback targets

For each comment being addressed, extract the file path and line range under discussion. This already happens in the parent skill's fetch/triage phases -- reuse the `path`, `line`, and thread/comment body it produced. Do not re-fetch.

If a comment has no file/line context (e.g., a top-level `pr_comment` or `review_body` without a thread anchor), it cannot be attributed to a specific layer by blame. Fall back to the non-stack flow for that comment: apply the fix on the current (commented) branch and reply there.

### 2. Identify the owning layer

This is the one nontrivial step. For each comment that has file/line context:

1. Run `git blame` scoped to the lines under discussion:

   ```bash
   git blame -L <start>,<end> -- <file>
   ```

2. Capture the commit SHAs that introduced those lines.

3. Map each SHA to a stack layer by cross-referencing the stack's commits. Use `gh stack view --json` to get machine-readable layer information:

   ```bash
   gh stack view --json
   ```

   Walk each layer's commits and match against the SHAs from blame. (If `--json` is unavailable in the current gh-stack version, parse the human output from `gh stack view` -- the `--help`-first pattern covers this.)

4. Classify the result:

   - **Single owning layer** -- all blamed SHAs map to one layer. That layer is the fix target.
   - **Multiple layers** -- blamed SHAs span two or more layers in the stack. Ask the user which layer to fix in, defaulting to the earliest (most upstream) layer. If the user declines the default and picks "apply in multiple layers", this is the V1-deferred multi-layer case -- stop the automated workflow, explain the limitation, and hand off for manual resolution.
   - **Outside the stack** -- blamed SHAs map to a commit that is not in any stack layer (typically the base branch). Fall back to the non-stack flow: treat this as normal feedback on the current (commented) branch. Note the fall-back in the reply so the reader understands why the fix landed there.
   - **Owning layer already merged and removed from the stack** -- the blamed commit belongs to a layer that has since been merged (its branch is gone from `gh stack view`). Fall back to applying the fix on the current (commented) layer, and include a short note in the reply: "Fixed on the current layer; the originally-owning layer has already merged."

### 3. Navigate to the owning layer

If the owning layer is a layer in the current stack (the common happy path), switch to it:

```bash
gh stack checkout <owning-layer-branch>
```

If the fix target is the current branch already (owning layer is the commented PR's layer), skip this step.

### 4. Apply the fix

Apply the fix using the parent skill's fix-application logic. The content of the fix is not stack-specific -- read the code, decide the right change, edit the files. The difference is only which branch the edits happen on.

### 5. Commit

Stage and commit with a conventional message referencing the review:

```bash
git add <files-changed>
git commit -m "fix: address review feedback on <aspect>"
```

Do NOT invoke `git-commit-push-pr` or any other shipping skill -- the parent skill and this reference handle the stack-specific push via `gh stack push` in step 7 below.

### 6. Cascade via `gh stack rebase`

Run a cascading rebase so each layer on top of the owning layer re-applies on the new commit:

```bash
gh stack rebase
```

Documented behavior: "Pull from remote and do a cascading rebase across the stack. Ensures that each branch in the stack has the tip of the previous layer in its commit history." This also pulls from the remote as part of the rebase, so upstream changes to other layers made while the user was working on feedback are incorporated.

Classify the result:

- **Clean success** -- no conflicts, no unexpected remote content. Continue to step 7.
- **Rebase conflicts** -- halt. Report which layer conflicted. Do not push. Provide manual resolution guidance:

  > Rebase conflicted on `<layer-name>`. Resolve the conflict manually, then run one of:
  > - `gh stack rebase --continue` to resume the cascade after resolving, or
  > - `gh stack rebase --abort` to restore all branches to their pre-rebase state.
  >
  > Once the rebase completes, re-run this skill (or push manually with `gh stack push`) and I'll pick up from the reply step.

  Exit the workflow. Do not attempt to push a partially-rebased stack.

- **Unexpected remote content pulled in** -- the remote had changes on sibling layers that the user had not seen locally, and the rebase incorporated them. Before pushing, summarize what changed (which layers gained commits, what those commits are about if visible from `gh stack view`) and ask the user whether to proceed. Do NOT silently push surprise content.

- **Top-of-stack with no layers above** -- rebase is effectively a no-op for cascading (there is nothing to cascade into). Proceed to push normally.

### 7. Push

Push all layers:

```bash
gh stack push
```

`gh stack push` uses `--force-with-lease` to safely update rebased branches without clobbering concurrent remote changes.

If the push fails with a force-with-lease rejection (remote has commits the local stack does not), advise the user:

> Push was rejected because the remote stack has changes your local stack does not. Run `gh stack sync` to pull remote changes, then re-run this skill to apply and re-push.

Exit. Do not retry blindly; `gh stack sync` is the recovery path.

### 8. Reply on the correct PR

Post the reply to the **original commented PR** -- not the owning layer's PR if they differ. This keeps the conversation on the thread the reviewer started.

Use the parent skill's reply mechanism (`scripts/reply-to-pr-thread` for review threads, `gh pr comment` for top-level comments and review bodies).

When the fix landed on a different layer than the commented PR, prefix the reply's resolution text with a short owning-layer note. Example:

```markdown
> [quoted relevant part of original feedback]

Fixed in the `<layer-branch-name>` layer (PR #NNNN), which owns this code in the stack.

Addressed: [brief description of the fix]
```

When the fix landed on the commented PR's own layer (the common case), the reply is unchanged from the non-stack flow.

When the fall-back branches fired (blame outside the stack, or owning layer already merged), include the corresponding note from step 2 so the reader understands why the fix landed where it did.

After replying, resolve the thread as in the non-stack flow (except for `needs-human` verdicts, which remain open).

---

## After the workflow

Return control to the parent skill for the verification step (re-fetch threads) and summary. The only stack-specific addition to the summary is a brief line per fix noting the owning layer when it differs from the commented PR -- the parent skill's summary format accommodates this as extra context in the per-item description.
