# `ce-codex-loop`

> Bounded local Codex-oriented implementation loop from an existing plan, with no commit, push, PR, CI, or release behavior.

`ce-codex-loop` is a composition skill for running the implementation-quality loop locally: implement from a code plan, simplify only loop-owned files, review only the manifest, apply eligible review fixes within a three-attempt budget, verify, then compound only after success.

It is intentionally narrower than `/lfg`. `/lfg` is the broad autonomous shipping path that can commit, push, open a PR, watch CI, and repair failures. `ce-codex-loop` stops at a structured terminal report and never performs outward shipping actions.

The preflight step extracts concrete Create, Modify, Delete, and Test paths from each implementation unit's `Files:` entry before mutation. Existing staged or unstaged edits to any planned implementation or test path stop the run before `ce-work`; existing untracked files at any planned Create, Modify, Delete, or Test path also stop the run.

The loop records manifest checkpoints after implementation, after simplification, after review fixes and repairs, and immediately before verification and review gates. A simplification or review fix that changes file scope refreshes the manifest before the next verification or review; a no-op simplification still records a validated checkpoint.

---

## Reference

| Argument | Effect |
|----------|--------|
| `<plan path>` | Required existing code-execution plan path |

The supplied plan argument is preserved as `raw_plan_argument`, then normalized once into `canonical_plan_path`: a repo-relative POSIX path that resolves inside the repository, points to an existing readable regular file, and contains no `.` or `..` segments. Relative, `./`-prefixed, absolute-in-repo, and lexical-equivalent paths are accepted; repo escapes, escaping symlinks, directories, placeholders, and missing files fail before mutation.

If input validation fails before the plan can be normalized or before the stable snapshot/base is captured, the terminal report uses `null` for unavailable `canonical_plan_path`, `plan_path`, and `stable_review_base` fields rather than inventing placeholder strings. After those stages succeed, the fields are strings and remain stable for review correlation.

For local loop review, `stable_review_base` is the captured pre-mutation HEAD snapshot unless the user explicitly supplies another safe base before mutation. The loop does not recompute review base from a moving branch merge-base after implementation, simplification, or fix stages have changed the tree.

The runtime resolves each downstream skill through the host skill mechanism and invokes the skill via the platform Skill tool or native skill invocation primitive. These are the exact public argument contracts passed to those skills:

- `ce-work mode:implementation-only`
- `ce-simplify-code mode:structured manifest:<path>`
- `ce-code-review mode:agent plan:<canonical-plan-path> base:<ref> manifest:<path> run-id:<id> artifact-dir:<path>`
- `ce-compound mode:headless`

Skill names are not shell commands and are not plain-text handoffs; `ce-codex-loop` must use the installed skill entry for `ce-work`, `ce-simplify-code`, `ce-code-review`, and `ce-compound`.

Every review response is checked for top-level `plan_path` and `plan_source` correlation: the returned `plan_path` must match `canonical_plan_path`, never the raw user string, `plan_source` must be `explicit`, and detailed `requirements_completeness` must be present. The loop also verifies `manifest_path` and `reviewed_manifest` against the manifest supplied to that review attempt, and requires primary JSON, `review.json`, and `metadata.json` to agree before any fix, re-review, final verification, or compound stage can continue.

Terminal statuses are `success`, `failed`, `unverified`, `already_satisfied`, and `quality_verified_but_compound_failed`.

Terminal reports separate repository state by lifecycle boundary:

- `current_manifest` is the latest loop-owned manifest at terminal completion.
- `reviewed_manifest` is the exact loop-owned manifest supplied to the final clean code-review attempt, or `null` when the workflow stops before clean review.
- `compound_outputs` lists files changed later by the single post-success `ce-compound mode:headless` invocation.
- `final_repository_delta` is the complete delta from the initial snapshot to terminal completion.

Compound outputs are reported as post-review side effects, not as files that passed the earlier code-review attempt.

## See Also

- [`ce-work`](./ce-work.md) - implementation stage used in implementation-only mode
- [`ce-simplify-code`](./ce-simplify-code.md) - structured manifest-scoped simplification stage
- [`ce-code-review`](./ce-code-review.md) - manifest-scoped report-only review stage
- [`ce-compound`](./ce-compound.md) - post-success compounding stage
