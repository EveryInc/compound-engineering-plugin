# ce-debug — post-fix handoff (interactive)

Loaded at Phase 4 when Phase 3 actually applied a fix in interactive mode. Not used in `mode:pipeline` (see `pipeline-mode.md`) and not used when the user chose "Diagnosis only" — in both cases Phase 4 ends at the Debug Summary.

The goal of this tail is a **PR-ready** fix, not merely a locally green one — while never letting polish or review reach outside the bug's scope.

## Post-fix polish/review tail (before commit or PR)

**Contextual overrides first.** Check the user's original prompt, loaded memories, and the project's active instructions already in your context for explicit, clearly applicable preferences that conflict with automatic polish or review — "minimal hotfix only", "do not run review", "always ask before cleanup", "ship the smallest possible diff". Honor them and state what was skipped.

**Skip the tail only with a reason:** purely mechanical fixes (typo/import-only, formatting/lint-only, dependency-only, generated artifacts, docs-only, or roughly under 10 changed lines with no sensitive surface). Keep the Phase 3 tests and self-review regardless, and carry the skip reason into the summary.

**Simplify before review when useful.** Invoke `ce-simplify-code` when the fix diff is non-mechanical and large enough to benefit (default: >=30 changed lines), touches multiple implementation files, introduces a new helper or abstraction, or affects shared/risky surfaces (auth/authz, public contracts, persistence, concurrency, background jobs, external services). Use the branch diff only when the branch is skill-owned or clearly contains only this fix; on a pre-existing branch, scope to fix-owned files that were clean before Phase 3. If a fix-owned file already had pre-existing user edits, skip it and record `Simplify: skipped for overlapping pre-existing edits` — file-level simplification could rewrite unrelated hunks the user did not authorize.

**Review the final fix scope.** Review every non-mechanical fix unless review tooling is unavailable. Run default `ce-code-review` **only when its diff scope is known to be this fix**: the branch was created by this skill, or the pre-fix tree was clean and you can pass `base:<pre-fix-HEAD>`. On a pre-existing dirty branch or one with unrelated committed work, standalone review would reach outside the bug scope — instead use the harness's lightweight review tool if it accepts an explicit file scope, else review the fix-owned files manually and record `Code review: targeted manual due to unrelated branch work`. If `ce-code-review` is unavailable on an otherwise fix-only scope, fall back to the harness's lightweight review tool, else one explicit manual diff scan, and state that dedicated review was unavailable.

**Handle residual findings before shipping.** Do not auto-open a PR with unresolved P0/P1 findings, or with findings whose fix needs a product/design decision — ask whether to fix now, accept/defer durably, or stop. Accepted residuals must not live only in the session: if a PR will be opened, pass them as "Known Residuals" context to `ce-commit-push-pr`; on commit-only or stop, prefer filing a ticket per finding in the tracker detected in Phase 1.4, with enough background to action it standalone (the finding, why it matters, file:line, severity, a pointer to the review run, and the branch/head SHA so it points at the code even without a PR). Only when no tracker is reachable, write `<root>/residual-review-findings/<branch-or-head-sha>.md`, stage it with the fix, and name the path in the final summary.

**Re-verify after tail edits.** If simplification or review changed code, rerun the bug's regression test and any targeted checks the tail identified. Never proceed to commit or PR with a red tree.

Then append this block below the Debug Summary, before the commit/PR decision:

```
## Post-Fix Quality
**Scope**: [fix-only branch / base:<pre-fix-HEAD> / fix-owned files only / targeted manual due to unrelated branch work]
**Simplify**: [ran/skipped + reason]
**Review**: [ran/skipped/manual + outcome]
**Residuals**: [none / accepted Known Residuals for PR / filed as tracker tickets / accepted residuals written to <root>/residual-review-findings/<branch-or-head-sha>.md (last resort) / blocked pending user decision]
**Re-verification**: [checks rerun after tail edits]
```

## Commit / PR handoff detail

SKILL.md's Phase 4 **Routing** block owns the bare per-option actions — which skill fires on which branch, and the three pre-existing-branch options. It stays there because it must fire even if this file is never read. This section owns only the detail that shapes those actions.

**Contextual overrides come first, on either branch.** An explicit, clearly applicable instruction — "always review before pushing", "open PRs as drafts", "don't open PRs from skills" — outranks the default routing. On a skill-owned branch that means switching to the pre-existing-branch question or skipping the PR step, whichever matches what the user said. A vague tonal cue is not an override.

**The skill-owned-branch preview is not a question.** State what gets committed, on what branch, and that a PR will be opened, then proceed without waiting. It exists so the user can interrupt.

**`branding:on` is load-bearing on both paths.** The explicit branding signal records that `ce-debug` produced the fix; a handoff without it loses that provenance.

**Issue auto-close syntax.** When the entry came from an issue tracker, include that tracker's auto-close syntax in the location it requires — most parse PR descriptions (`Fixes #N` for GitHub, `Closes ABC-123` for Linear), but some parse only commit messages (Jira Smart Commits) — so the fix flows back to the issue and closes it on merge.

## Learning-capture criteria (after a PR is open, either path)

Most bugs are localized mechanical fixes where the only "lesson" is the bug itself, and compounding those clutters `<root>/solutions/` without adding value.

- **Skip silently** when the fix is mechanical with no generalizable insight. Default to this when in doubt.
- **Offer neutrally** when the lesson fits in one sentence — "X.foo() returns T | undefined when Y, not just T", or "the diagnostic path was non-obvious and worth recording." If you cannot articulate the lesson, skip rather than offer.
- **Lean into the offer** when the pattern appears in 3+ locations, or the root cause reveals a wrong assumption about a shared dependency, framework, or convention that other code is likely to repeat.

These are the criteria only; SKILL.md's Routing block owns what fires when the user accepts.
