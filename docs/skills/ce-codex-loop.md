# `ce-codex-loop`

> Bounded local Codex-oriented implementation loop from an existing plan, with no commit, push, PR, CI, or release behavior.

`ce-codex-loop` is a composition skill for running the implementation-quality loop locally: implement from a code plan, simplify only loop-owned files, review only the manifest, apply eligible review fixes within a three-attempt budget, verify, then compound only after success.

It is intentionally narrower than `/lfg`. `/lfg` is the broad autonomous shipping path that can commit, push, open a PR, watch CI, and repair failures. `ce-codex-loop` stops at a structured terminal report and never performs outward shipping actions.

---

## Reference

| Argument | Effect |
|----------|--------|
| `<plan path>` | Required existing code-execution plan path |

The runtime uses these explicit composition contracts:

- `ce-work mode:implementation-only`
- `ce-simplify-code mode:structured manifest:<path>`
- `ce-code-review mode:agent base:<ref> manifest:<path> run-id:<id>`
- `ce-compound mode:headless`

Terminal statuses are `success`, `failed`, `unverified`, `already_satisfied`, and `quality_verified_but_compound_failed`.

## See Also

- [`ce-work`](./ce-work.md) - implementation stage used in implementation-only mode
- [`ce-simplify-code`](./ce-simplify-code.md) - structured manifest-scoped simplification stage
- [`ce-code-review`](./ce-code-review.md) - manifest-scoped report-only review stage
- [`ce-compound`](./ce-compound.md) - post-success compounding stage
