# CE Debug Sibling Sites Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-debug` treats other code that makes the same root-cause mistake as the reported bug: `skills/ce-debug/references/fix.md` ("Other sites of the same mistake" and the structural-fix paragraph), the Phase 4 summary's Fix line, or the sibling-site sentence in `references/return-to-caller.md`. It is not a runtime reference and must not be injected into the agent under test.

## What it checks

A bug report names one site. The same mistake exists at two other sites the report does not mention. The fix must cover all three in the same run; offering the other two as a follow-up fails. A look-alike site where the same expression is correct must stay unchanged.

## Scenario

Catalog row: `ce-debug/fix-covers-unreported-sibling-sites`. Fixture: `tests/skill-eval-cell/fixtures/debug-sibling-sites`.

- **Reported site:** `src/api/orders.js` computes `offset = page * pageSize` for a page number that starts at 1, so page 1 skips the first 20 orders. `tests/orders.check.js` reproduces it. The task names only this symptom.
- **Unreported siblings:** `src/exports/customers-csv.js` (`offset: size * batch`, batches start at 1) and `src/sync/invoice-sync.js` (`skip = pageNo * perPage`, pages start at 1). They live outside the reported file's directory, use different names and expression shapes, and are not wired into `src/server.js`, so neither a grep for the reported line nor the call graph from the failing test leads to them. Each carries a comment saying its numbering starts at 1.
- **Correct look-alike:** `src/api/audit.js` has the identical expression, but its pages start at 0.
- **Distractors:** unrelated modules under `src/api`, `src/sync`, and `src/util`.

The task asks for the fix and then, instead of Phase 4, one local commit of every changed file.

```bash
bun run test:skill-eval-pack -- --id ce-debug/fix-covers-unreported-sibling-sites --arm ab --hosts claude,codex
```

### Grading

Artifacts only: the three buggy expressions are gone from the workspace, `orders.js`, `customers-csv.js`, and `invoice-sync.js` are in the commit, and `audit.js` is neither changed nor committed. A regression test for the siblings is not graded; read the transcripts for it.

## Fixture history

The first fixture put both siblings in `src/api/` beside `orders.js`, with the same expression. Pre-change runs passed on both hosts: in a five-file directory every agent read each file and fixed the siblings without being told to. Moving the siblings to other directories with different shapes is what makes the old contract's follow-up path reachable.

## Reference results (2026-11-16)

Pre is `ce-debug` at `8d2a49c` (main before this change). Post is the working tree. Counts are passing runs.

| Arm | Claude | Codex |
|---|---|---|
| Pre | 0 of 2 | 2 of 2 |
| Post | 3 of 3 | 3 of 3 |

Both pre-change Claude failures found the two siblings, fixed only `orders.js`, and offered the rest as a follow-up ("Tell me if you want the other two fixed the same way", "Fixing them would change behaviour outside this bug"). Every run on both arms left `audit.js` alone. Codex fixed the siblings under the old contract too, so on Codex this row is a regression check only.
