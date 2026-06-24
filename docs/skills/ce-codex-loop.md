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

The runtime uses these explicit composition contracts:

- `ce-work mode:implementation-only`
- `ce-simplify-code mode:structured manifest:<path>`
- `ce-code-review mode:agent plan:<plan-path> base:<ref> manifest:<path> run-id:<id>`
- `ce-compound mode:headless`

Terminal statuses are `success`, `failed`, `unverified`, `already_satisfied`, and `quality_verified_but_compound_failed`.

Terminal reports separate repository state by lifecycle boundary:

- `reviewed_manifest` is the exact loop-owned manifest supplied to simplification and the final code-review attempt.
- `compound_outputs` lists files changed later by the single post-success `ce-compound mode:headless` invocation.
- `final_repository_delta` is the complete delta from the initial snapshot to terminal completion.

Compound outputs are reported as post-review side effects, not as files that passed the earlier code-review attempt.

## See Also

- [`ce-work`](./ce-work.md) - implementation stage used in implementation-only mode
- [`ce-simplify-code`](./ce-simplify-code.md) - structured manifest-scoped simplification stage
- [`ce-code-review`](./ce-code-review.md) - manifest-scoped report-only review stage
- [`ce-compound`](./ce-compound.md) - post-success compounding stage
