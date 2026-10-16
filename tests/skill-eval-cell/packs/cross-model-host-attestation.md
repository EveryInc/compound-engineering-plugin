# Cross-Model Host Attestation — Copied and Inherited Markers

Covers the host-attestation snippet shared by `ce-code-review`
(`references/cross-model-review.md`), `ce-doc-review`
(`references/cross-model-review.md`), and `ce-pov`
(`references/cross-model-panel.md`). The snippet's token mapping is pinned by
`tests/review-skill-contract.test.ts`; these cases cover what a fresh agent
passes to the worker and what the worker's receipt records, which only a live
run shows.

## Setup

Run each case through `bun run test:skill-eval-cell` with `--hosts <host>`,
`--fixture tests/skill-eval-cell/fixtures/tiny-lib --git-init`, and a
PATH-prefixed shim directory per cell:

- `python3` that appends its argv to a log when it is a
  `peer-job-runner.py ... start` call, then execs the real interpreter. The
  logged argv carries `CROSS_MODEL_HOST_HARNESS` and the worker's first
  argument, the host serving family.
- `jq` that appends its argv to the same log when it contains `independent`,
  then execs the real `jq`. That call builds the peer receipt, so the log
  records `--arg target` and `--argjson independent`.
- For a copied-marker case, a `codex` wrapper that exports the marker
  (`CLAUDECODE=1`, or `CLAUDECODE=1 OMPCODE=1`) and execs the real `codex`.
  The cell driver strips inherited markers, so the wrapper is how a marker
  reaches the host session.

The skills delete peer scratch on completion, so grade the log and the
final answer, not the job directories. Codex runs its commands in a login
shell that rebuilds PATH, so the shims never fire there; grade a Codex cell
from its stderr transcript, which records each command and its output.

For a live `ce-pov` cell on Codex, add a sentence to the task permitting the
panel's private scratch outside the workspace. Without it Codex reads the
driver's "Stay inside it" line as forbidding that scratch and skips the panel.

Codex often attests its host from its own knowledge without running the
snippet. A live Codex cell then confirms peer selection but does not exercise
the snippet; the case 5 probes, which ask the agent to run it, do.

## Cases

1. **Claude Code host, no copied marker.** `ce-pov` with `oracle: should this
   project adopt lodash?`. The runner start passes harness `claude`, family
   `claude`; no `claude` peer starts; each non-Claude peer receipt records
   `independent true`.
2. **Codex host, no copied marker.** Same prompt. Harness and family `codex`;
   no `codex` peer starts; the `claude` peer receipt records `independent true`.
3. **Codex host with an inherited `CLAUDECODE=1`.** Same prompt. No runner start
   passes family `claude`. Either the automatic panel is skipped as unattested,
   or the family comes from a runtime-published model id. No receipt records
   `independent true` for a `codex` peer.
4. **Codex host with `OMPCODE=1` and `CLAUDECODE=1`** (oh-my-pi served by a GPT
   model). Same expectations as case 3, with harness `omp`.
5. **Route-resolution probes.** `ce-code-review` and `ce-doc-review` with a
   stop-before-dispatch task that declares `HOST_HARNESS`, `HOST_FAMILY`, and
   `PEER_TARGET`, on cases 1 to 4. A lone `CLAUDECODE=1` declares
   `claude`/`claude` with a non-Claude target; an inherited or copied marker
   never declares family `claude` on a Codex host.

## Pass criteria

Cases 1 and 2 dispatch at least one peer with a verified-independent receipt on
the post-change tree. Cases 3 and 4 never pass family `claude` and never record
a same-family receipt as independent. Run the pre-change arm for cases 3 and 4
to show the failure the change fixes.
