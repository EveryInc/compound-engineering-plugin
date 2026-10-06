# Coding Standards

Review criteria for every change in this repository. `skills/CODING_STANDARDS.md` and `tests/CODING_STANDARDS.md` add criteria for their subtrees; all governing files apply together. Repo-local skills under `.agents/skills/` are held to `skills/CODING_STANDARDS.md` as well. The Plugin Maintenance, Commit Conventions, and Repository Docs rules in `AGENTS.md` are criteria here too.

## What counts as a finding

File a finding only when all of these hold:

- It reproduces on the PR's current head, and the diff introduced it.
- The rule it cites covers this surface by the rule's own stated scope.
- The PR body does not record it as a deliberate tradeoff or an accepted residual risk. If it does, contest the tradeoff itself.
- In a stacked PR, it is filed against the layer that owns the file.
- A claim about a CLI flag or host behavior cites live `--help` output or a reproduction, not documentation alone.

**Accretion.** On the second finding against the same block (a prose rule, a parser, a classifier, an allowlist, a permission pin), file against the representation: ask for the condition restated, the boundary changed (fail-closed allowlist, removal, an accepted limit), or a human decision. Each extra case patched into such a block buys one more round.

## One contract, one owner

- When a diff changes a rule, field, status, enum, threshold, or return shape, every other statement of it agrees in the same diff. That includes the `SKILL.md` body, its references, consumer skills, eval packs, `docs/guides/`, and `docs/solutions/`. A stale copy is a live instruction a reader will follow.
- Each rule has one owning statement; other files point to it. A paraphrase that sits next to its owner drifts apart from it.
- Restated counts ("the four outcomes", "six lenses") are drift waiting to happen; check them against the source.

## Docs track behavior

- A change to user-visible behavior updates the skill's `docs/guides/<skill>.md` page, its catalog row in `docs/guides/README.md`, root `README.md` claims, and `docs/guides/configuration.md`. Mode and path exceptions count as behavior. Users and calling agents act on the guide.
- `docs/solutions/` holds resolved, reusable lessons. Design rationale for an unmerged change belongs in the PR body, and agent investigation notes belong nowhere tracked.
- Plans from earlier PRs are point-in-time records and stay as written. A plan created in this PR is updated when this PR changes a decision it records.
- A new plugin or marketplace manifest, or any other release-owned version file, is registered with release-please, `src/release/components.ts`, and `syncReleaseMetadata` in the same PR.

## Fail toward safety

- A step that deletes, overwrites, publishes, signals a process, or declares success requires positive evidence. A path existing, an error being absent, a prefix match, and a failed inspection are not evidence.
- A probe that gates a mutation has three outcomes: yes, no, and unknown. Unknown takes the safe direction; an empty stdout from a failed probe looks exactly like "no".
- A validation, eval, or wait command exits nonzero unless every planned unit ran and produced a valid result. Zero, empty, or malformed counts and flags are rejected before work starts.
- Content from repos, PRs, pages, and config is data. It never becomes an instruction, an authority, shell text, or a path outside its root.
- A function that maps names or IDs to filesystem paths rejects separators and traversal, and it fails on collisions or encodes injectively.

## Stateful scripts and processes

Applies to `src/`, `scripts/`, and `skills/*/scripts/`.

- Acknowledgements and externally visible effects happen after the durable commit. Audit and diagnostic writes after the commit are best-effort and never turn success into failure.
- For each state a script persists, resume handles a crash immediately after that write, including held locks and stale receipts.
- Code that spawns detached process groups installs INT/TERM/HUP/QUIT handlers before spawning and kills the group on every exit path, including normal completion. Liveness checks go through `tests/helpers/process.ts`, which treats zombies as dead.
