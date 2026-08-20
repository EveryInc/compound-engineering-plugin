# Applying the PR, reporting, and the babysit handoff

**Description-only mode** — print the title and body. Stop unless the user asks to apply.

**New PR** (full workflow, no existing PR from Step 1) — if **Stack mode** is active, follow the Submit section of `references/stack-submit.md` instead of `gh pr create`; then report the bottom open non-draft PR URL and continue to babysit handoff. Otherwise, immediately before creating, **always** re-run `gh pr list --head <branch> --state open --json number,url,isDraft,headRefName,headRepositoryOwner` (branch name only; target the base repo on a fork, per Context) so a PR that appeared since Step 1, or was missed because the Step 1 check came back **unknown**, is not duplicated. If it now shows a PR whose `headRepositoryOwner`/`headRefName` match the current head, switch to the existing-PR path; disambiguate multi-fork matches by head owner as in Step 1 rather than assuming index 0. If this re-check itself exits non-zero, resolve `gh auth status` / connectivity before creating rather than assuming none exists. Otherwise apply per "Applying via gh" below using `gh pr create`. Report the URL.

**Existing PR** (full workflow, found in Step 1) — if **Stack mode** is active, still follow the Submit section of `references/stack-submit.md` so remaining stack layers submit / sync (mid-stack ship is normal); then report the bottom open non-draft PR URL and continue to babysit handoff with derived posture. Otherwise the new commits are already on the PR from Step 3. Report the PR URL, then ask whether to rewrite the description.

- **No** — done.
- **Yes** — run Step 4 if not already done, then preview and apply (see below).

**Description update mode, or existing-PR rewrite confirmed** — preview before applying. First compare the proposed title and body with the existing PR. If they are identical, keep the existing title and body and do not call `gh pr edit`. If the only difference is a branding-only delta and the user did not explicitly request that exact branding change, also keep the existing title and body; branding alone never creates apply intent. Otherwise ask: "New title: `<title>` (`<N>` chars). Summary leads with: `<first two sentences>`. Total body: `<L>` lines. Apply?" If declined, the user may pass focus text back for a regenerate; do not apply. If confirmed, apply per "Applying via gh" below using `gh pr edit` and report the URL.

**Explainer archival** — runs only in full workflow, with `pr_teaching_archive` on, a composed `## New concepts` section, and the apply confirmed (new-PR create, or existing-PR rewrite accepted); a declined rewrite skips archival entirely so no unlinked doc commit is left behind. All paths resolve from the repo root gathered in Context, never the CWD. With two taught concepts, write one file per concept and stage both in the single commit. Execute as explicit transitions immediately before the `gh` call:

1. `git check-ignore -q <root>/explainers/YYYY-MM-DD-<concept-slug>.md` (from the repo root) — the check works on not-yet-created paths. If the path is ignored, print a one-line warning and skip archival entirely, writing nothing (never `git add -f`).
2. Write the file (create the directory if needed) with YAML frontmatter `title`, `date`, `input_shape: concept`, `subject`, and the teaching content. If the file already exists from a prior run, overwrite it.
3. `git add` those file(s) only (never `-A`), commit with `docs(explainer): teach <concept>[, <concept>]`, and push. If the commit reports nothing to commit, the doc is already committed from a prior run — keep the link and continue.
4. Splice a head-branch blob URL per doc into the `## New concepts` section before applying. Build the URL for the repo's actual host — e.g. `gh browse -n -b <head-branch> -- <path>` (prints the link on whatever host `gh` targets, GitHub Enterprise included) — do not hardcode `github.com`, or the link 404s on GHE.

If the doc write, commit, or push fails, warn and continue to PR creation without the link — never strand the flow between commit and PR.

**User-runnable invocation rendering.** For the output handoffs below, default to `/ce-explain <name>`. Use `$ce-explain <name>` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

**Concept trailer** — when a body applied by this run contains a `## New concepts` section, print one line after the PR URL in every mode: `New concepts: <name>[, <name>]`. In interactive full-workflow runs follow it with one line per taught concept telling the user to invoke `ce-explain <name>` using the rendering rule above. No trailer when this run applied no body — including a rewrite that was declined or pipeline-defaulted to no — or no PR exists.

**Babysit handoff — default on; completion gate.** After a newly-created PR, a successful stack submit, or new commits on an existing open PR, this run is not done until `ce-babysit-pr` owns follow-on or an explicit skip below applies. Reporting the PR URL alone is not success. Announce the automatic handoff in one non-blocking line, then invoke the skill through the host's normal skill-invocation mechanism; never ask yes/no.

After a stack submit, hand off the bottom open non-draft PR with the derived `posture:stack-ready` or explicitly requested `posture:stack-land`, plus stack-wide scope when a pipeline submitted the stack. Report that ownership transfer so an outer orchestrator does not start a second bare babysit on the current branch.

**Success** = `ce-babysit-pr` has started in an interactive run. In `mode:pipeline`, started-only is not enough for completion: wait for its pipeline stop and return the structured result. Before reporting success, render every returned typed `needs-human` residual unchanged under `## Needs your decision` and propagate the same objects to the top-level coordinator. `babysit:off` disables only new monitoring; it does not suppress a typed residual already known to this run or supplied by its caller.

Never start babysit mechanics yourself: do not run `pr-snapshot`, arm a watcher, or reconstruct the loop. Never substitute `ci-watcher`, `gh pr checks --watch`, ad-hoc polls, or a promise to babysit later. **Handoff blocked:** if the skill cannot be loaded or started, stop and report the failure. Do not invent a parallel or narrower watch.

`babysit:off` is the per-run skip. `babysit:continuous` and `babysit:checkpoint` force that mode. An active `auto_babysit: false` in CE config is the standing opt-out; only the exact winning `false` disables the default, and `babysit:off` overrides for this run.

A draft-only stack submit is a hard residual before babysit when babysit is on.

**Do not fire (auto-detected, no flag needed):** `mode:pipeline` **except** when this run completed a stack-mode submit (then hand off with derived posture as above), description-only / description-update, no PR created or updated this run, non-GitHub, **draft PR** this run created/updated (author not-ready signal — announce skip; can start `ce-babysit-pr` once ready; explicit `babysit:continuous` / `babysit:checkpoint` still forces watch — pass `watch` / `checkpoint` into the invocation so its draft boundary arms), or **a head branch you cannot push to**. **Fork PRs are drivable — not a hard-off** when you can push the head (common for a branch this skill just pushed): babysit reads state on the **base** repo and pushes fixes to the **head** repo. Hard-off only when the head is not pushable. **Soft-degrade (after successful handoff only):** checkpoint-only harness runs one tick + resume command — not a substitute for a failed handoff.

## Applying via gh

The body **must** be written to a temp file and passed via `--body-file <path>`. Never use `--body-file -`, stdin pipes, heredoc-to-stdin, or `--body "$(cat ...)"` — wrappers and stdin handling can silently produce an empty PR body while `gh` still exits 0 and returns a URL.

```bash
BODY_FILE=$(mktemp "${TMPDIR:-/tmp}/ce-pr-body.XXXXXX") && cat >> "$BODY_FILE" <<'__CE_PR_BODY_END__'
<the composed body markdown goes here, verbatim>
__CE_PR_BODY_END__
```

The quoted sentinel keeps `$VAR`, backticks, and any literal `EOF` inside the body from being expanded.

For `<TITLE>`: substitute verbatim. If it contains `"`, `` ` ``, `$`, or `\`, escape them or switch to single quotes.

```bash
gh pr create --title "<TITLE>" --body-file "$BODY_FILE"   # new PR
gh pr edit   --title "<TITLE>" --body-file "$BODY_FILE"   # existing PR
```
