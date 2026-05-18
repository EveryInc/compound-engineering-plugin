# ce-code-review-beta — Beta Status

This skill is the experimental Codex-delegation lane for `ce-code-review`. It exists in parallel with stable `ce-code-review`, and the two MUST converge on a graduation/sunset decision rather than living forever as siblings.

## What "beta" means here

- `disable-model-invocation: true` — manual user-invocation only; not auto-fired by other skills.
- Only delegation behavior diverges. Non-delegation paths (scope detection, intent discovery, reviewer selection, merge/dedup, validation, synthesis, fix routing) follow stable `ce-code-review`.
- Shared references are byte-equal and enforced by `tests/review-skill-contract.test.ts` parity checks. Drift in shared files is a test failure, not a feature.

## Graduation criteria

Promote delegation behavior into stable `ce-code-review` (and delete this skill) when ALL of the following hold across at least 20 manual review runs (logged via Mixed-Model Attribution in Coverage):

1. **Quality parity:** Delegated reviewers' findings are not materially worse than local-lane equivalents. Operationalize with a side-by-side run on the same PR — count P0/P1 finding overlap, false positive rate, and missed issues. Acceptable threshold: >=80% finding overlap on critical findings, no systematic miss class.
2. **Operational reliability:** <5% of delegated reviewer runs hit the circuit breaker, timeout cancellation path, or preflight failure across the sample. Cancellation is confirmed (not "unable to confirm") in >=95% of timeouts.
3. **Schema stability:** No major-version bumps to `findings-schema.json` (`_meta.schema_version`) needed during the beta period. Producers and consumers stayed in agreement.
4. **No security regressions:** No findings against the delegation lane in adversarial code review. The Self-Review Prompt Integrity Gate has tripped at least once and behaved correctly when it did.
5. **User feedback:** No outstanding open issues against `ce-code-review-beta` that block stable adoption.

When the criteria are met, the graduation PR should:
- Move delegation logic from beta `SKILL.md` and `references/codex-delegation-workflow.md` into stable `ce-code-review/SKILL.md` (under a `delegate:codex` argument or config flag, not as a default).
- Delete `plugins/compound-engineering/skills/ce-code-review-beta/` entirely.
- Run the removal procedure below.

## Sunset criteria

Delete this skill (without graduation) when ANY of the following hold:

1. **Quality regression that cannot be closed:** After two attempts at root-cause + fix, delegated reviewers consistently miss findings that the local lane catches at >=20% rate.
2. **Operational instability that cannot be closed:** Circuit breaker / timeout / cancellation failures persist >5% across consecutive runs for two months despite mitigation attempts.
3. **Codex CLI behavior shift:** Upstream Codex changes (sandbox, schema, auth model) make the delegation contract untenable to maintain.
4. **No user adoption:** No one (including the maintainer) has run `ce-code-review-beta` in 60 days. A beta no one uses is dead weight.

Sunset PR: delete the skill, run the removal procedure below, document the lessons in `docs/solutions/skill-design/codex-delegation-tradeoffs.md`.

## Telemetry

The Mixed-Model Attribution Coverage section (per `references/codex-delegation-workflow.md`) is the only structured telemetry source. It records which reviewers ran on which lane, which preflight gate fired, and any post-circuit-breaker fallback events. Aggregating this across runs requires manual log-keeping today; if delegation usage grows beyond a handful of reviewers, surface the Coverage data as machine-readable JSON in the run artifact at that time.

## Removal procedure

When deleting this skill (graduation OR sunset):

1. Delete `plugins/compound-engineering/skills/ce-code-review-beta/` (whole directory).
2. Add `ce-code-review-beta` to `STALE_SKILL_DIRS` in `src/utils/legacy-cleanup.ts` so flat-install artifacts get swept on plugin upgrade.
3. Add the skill name to `EXTRA_LEGACY_ARTIFACTS_BY_PLUGIN["compound-engineering"]` in `src/data/plugin-legacy-artifacts.ts`.
4. Remove tests scoped to `ce-code-review-beta` from `tests/review-skill-contract.test.ts`. Keep stable-side equivalents.
5. If graduating, update stable `ce-code-review` in the same PR with the migrated delegation behavior (gated by config or argument, not default).
6. Update `plugins/compound-engineering/README.md` skill count.
7. Run `bun run release:validate` and confirm clean.

## What does NOT diverge between stable and beta

- `findings-schema.json` (parity-enforced)
- `subagent-template.md` (parity-enforced)
- `diff-scope.md` (parity-enforced)
- `persona-catalog.md` (parity-enforced; lane column is informational in stable)
- `synthesis-rubric.md`, `architecture-patterns.md`, `walk-through-rubric.md`, `dispatch-fixers.md`, `validation-pass.md` (parity-enforced when present)
- Stage 5 merge/dedup, Stage 6 synthesis, Stage 7+ fix routing
- Headless error envelopes, mode-detection rules, finding numbering, residual-summary contract

If a future PR is tempted to drift one of these between stable and beta, the question to answer first is: "is this divergence load-bearing for delegation, or is it bit-rot?" If it's the latter, fix both sides or fix neither.
