# Discovery-to-Regression Graduation

When a browser-layer discovery is fixed and verified, the system offers to generate a CLI regression check. This closes the compounding loop: browser discoveries become fast-layer guards.

## The Compounding Loop

```
Browser discovers bug → bug filed → developer fixes → next run verifies fix
    → fix confirmed → CLI regression check generated
    → future regressions caught by fast CLI layer
    → browser time freed for new exploration
```

## Trigger

Graduation is offered when commit mode marks a bug as `fixed` in `bugs.md`:

1. Check if `cli_test_command` exists in the scenario frontmatter
2. If yes, offer: "Bug B002 (cards not clickable) is fixed. Generate a CLI regression check? (y/n)"
3. If user accepts, append to `cli_queries` in the test file frontmatter

## Generated CLI Query

```yaml
cli_queries:
  - query: "show me product cards"
    expected: "Returns product data with clickable links or URLs"
    prechecks: "browse/product-grid"
    graduated_from: "B002"
```

- `query`: A representative input that would expose the original bug
- `expected`: Description of what a correct response looks like (semantic evaluation)
- `prechecks`: Links to the browser area — if this CLI check fails, the browser area is skipped (already known broken)
- `graduated_from`: Backlink to the bug ID that spawned this check (auditability)

## Graduation Trigger: Manual

The user confirms each graduation. Automatic graduation was rejected because:

- The user knows whether a CLI check can meaningfully cover a UX-discovered issue
- Some bugs are inherently browser-only (layout, animation, visual feedback, timing)
- Auto-generated CLI queries might technically pass but not actually test the thing that broke

## CLI-Ineligible Bugs

Skip the graduation offer when:

- **No `cli_test_command`** in the scenario frontmatter — there's no CLI layer to graduate to
- **Browser-only bug** — CSS layout, animation timing, visual feedback, element positioning. Note: "This bug is browser-only — no CLI graduation available."

Detection heuristic for browser-only bugs: if the bug's area detail mentions visual, layout, CSS, animation, or the fix_check involves screenshot comparison or element positioning, it's likely browser-only. The agent exercises judgment here.

## Batching

If multiple bugs are fixed in the same run, batch all graduation offers into a single prompt:

```
3 bugs fixed this run. Generate CLI regression checks?

  B002 — browse/product-grid: Cards not clickable → CLI eligible
  B005 — checkout/shipping-form: Validation broken → CLI eligible
  B007 — browse/product-detail: Image carousel layout → browser-only (skip)

Generate checks for B002 and B005? (y/n/select)
```

User can accept all, reject all, or select individual bugs.
