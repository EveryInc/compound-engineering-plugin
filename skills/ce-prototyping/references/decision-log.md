# Decision Log

The decision log is the connective tissue between the prototype and the PRD. It guarantees that nothing decided while reviewing the prototype is lost from the PRD, and nothing in the PRD contradicts what the prototype shows — bidirectional sync.

## Where it lives

`.context/compound-engineering/ce-prototyping/<run-id>/decision-log.md` under the **repository root** (resolve via `git rev-parse --show-toplevel`, falling back to the working directory when there is no git repo) — the AGENTS.md `.context/` scratch namespace for per-run, user-inspectable working state, so the PM can inspect it and it persists across the session. Anchoring at the root keeps a run consistent even when invoked from a subdirectory. `<run-id>` is a per-run identifier. **Create it when scoping begins (Phase 3)** — scoping decisions are its first entries — not at Phase 4.

## Schema

A running markdown list, newest last. Each entry is one decision:

```markdown
- [D1] <decision, stated plainly> — origin: prototype-review | scoping | principles | pm-directive
  - reflected-in-prototype: yes | pending | n/a
  - reflected-in-prd: yes | pending
```

Keep entries terse — one line of decision plus the two sync flags. A decision is a choice that changes what gets built or how it behaves (a flow, a rule, an included/excluded case, a data point captured), not a passing comment.

## Bidirectional sync — the rule

Every round of the Phase 4 loop, before moving on:

1. **Prototype → PRD.** For every decision made while reviewing the prototype, add or update a log entry and carry it into the working PRD requirements. Set `reflected-in-prd: yes` only once it is actually in the PRD.
2. **PRD → prototype.** For every requirement decision recorded, confirm the prototype reflects it or mark `reflected-in-prototype: pending` and address it in the next build slice.
3. **No contradictions.** No PRD requirement may contradict a logged decision. If the PM reverses a decision, add a new entry superseding the old one (note which `[D#]` it supersedes) rather than silently editing history.

At finalization (Phase 5), every entry must be `reflected-in-prd: yes` (or explicitly superseded). A `pending` entry means the PRD is not yet complete.
