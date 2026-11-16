---
title: "The Codex peer's editorial model and reasoning effort are refused before egress on accounts whose catalog lacks them"
date: 2026-11-16
category: integration-issues
module: "cross-model peer workers (skills/*/scripts/cross-model-*.sh)"
problem_type: integration_issue
component: tooling
symptoms:
  - "transport unavailable (pre-egress, route): Invalid params on every codex peer run, with any model"
  - "transport unavailable (pre-egress, route): Cannot apply --model \"gpt-6.1-terra\": the ACP agent did not advertise that model"
  - "CROSS_MODEL_EFFORT_OVERRIDE cannot avoid the Invalid params failure"
  - "the same script runs cleanly on another account, so the failure does not reproduce for the author"
root_cause: wrong_api
resolution_type: code_fix
severity: high
retire_when: "codex-acp stops refusing an unlisted reasoning_effort, or acpx gains a way to send a config option only when the session advertises it; re-run the gpt-6-luna + reasoning_effort=ultra probe below against the pinned acpx and check for end_turn."
tags:
  - "acpx"
  - "codex-acp"
  - "cross-model"
  - "peer-delegation"
  - "reasoning-effort"
  - "config-option"
  - "model-fallback"
---

# The Codex peer's editorial model and reasoning effort are refused before egress on accounts whose catalog lacks them

## Problem

The `codex` route of the ce-doc-review and ce-code-review cross-model peer always requested `gpt-6.1-terra` with `--config-option reasoning_effort=high`, and ce-pov always requested `reasoning_effort=high`. Codex offers each signed-in account its own model catalog and, per model, its own list of effort levels. On an account without that model or that effort, the peer failed before any prompt was sent, so the cross-model pass never ran (issues #2074 and #2075).

## Symptoms

- `[cross-model-doc] transport unavailable (pre-egress, route): Invalid params`, the whole skip reason, with no hint of which option was refused.
- `Cannot apply --model "gpt-6.1-terra": the ACP agent did not advertise that model. Available models: gpt-6.1-sol, ...` on ChatGPT Pro Codex logins.
- Pinning another model with `cross_model_model` fixed the second message and then hit the first; `cross_model_effort` only accepts real effort values, so no configuration avoided both.

## What Didn't Work

- **Taking the issue's diagnosis literally.** The report said the Codex ACP agent does not advertise a `reasoning_effort` option. On another account the same agent advertised it with six levels. The option is per model and per account, not absent.
- **Reproducing with the reporter's settings on the author's account.** The default model and effort, and the reporter's `gpt-6.1-sol` override, all ended with `end_turn`. The account decided the outcome. The failure reproduced only by asking for values that account does not list: an advertised model paired with an effort it does not support (`--model gpt-6-luna` with `reasoning_effort=ultra` on codex-acp 1.13.1), and an unadvertised model id.
- **The existing tests.** The stream stubs in the route tests and the stub agent behind the real-acpx contract accepted every config option, so no test could see a refusal.
- **The model change itself.** PR #2029 moved the review peer's default to `gpt-6.1-terra` and recorded that no live Codex run was made against the new model.

## Solution

Each editorial value gets one retry before egress, on the same deadline. A value the user configured stays exact and fails with a clear reason. This is the same shape as the Antigravity Argon -> Flash fallback.

- **Model.** When acpx reports `did not advertise` for the default `M_CODEX`, the worker retries once with `M_CODEX_FALLBACK` (`gpt-6.1-sol`), unless `cross_model_model` targets codex (`skills/ce-doc-review/scripts/cross-model-doc-review.sh:1252`).
- **Effort.** When the adapter refused `reasoning_effort` and no `cross_model_effort` is set, the worker retries once without that option, so the account's default effort applies (`skills/ce-doc-review/scripts/cross-model-doc-review.sh:513`). The receipt then records `effort_requested: "unverified"` (`:118`). ce-pov does the same for its fixed `high` (`skills/ce-pov/scripts/cross-model-pov.sh:1069`).
- **Diagnosis.** `acpx_refused_config_option` reads the acpx stream for a `session/set_config_option` request whose id came back with an error (`skills/ce-doc-review/scripts/cross-model-doc-review.sh:1116`). The skip reason now says `Invalid params (the adapter refused reasoning_effort=xhigh)`.
- **Contract.** `tests/fixtures/acp-stub-agent.mjs` gained a `refuse-effort` mode, and `tests/acpx-contract.test.ts` checks across every admitted acpx release that a refused option ends the run before `session/prompt`, with the error under that request's id.

The ce-code-review worker carries the same edits; its route-mapping block must stay byte-identical to doc-review's.

## Why This Works

acpx sends every `--config-option` as `session/set_config_option` after `session/new`. This fix found no acpx flag that sends an option only when the session advertises it. In codex-acp 1.13.1, `createSessionConfigOptions` adds the `reasoning_effort` option only when the current model lists supported efforts. `applyReasoningEffortChange` throws `RequestError.invalidParams()` for any effort the model does not list. acpx stops before sending the prompt, so the failure is pre-egress and a retry sends nothing twice. The model check is acpx's own: it compares `--model` against the models the session advertises, before any prompt.

A retry that drops only an editorial value keeps the review running at the account's best available setting. Recording `unverified` keeps the receipt honest about what was asked for.

## Prevention

- Treat any model or session option a worker sends to an ACP adapter by default as an account-dependent request. Give it a pre-egress fallback, and keep user-configured values exact. A default that only fails loudly makes the pass silently unavailable for every account that lacks it.
- Before changing an `M_*` default, run it live on an account tier other than your own, or rely on the fallback. A green run on the author's account says nothing about other tiers.
- To reproduce an account-dependent refusal on an account that has the default, ask for a value it does not list: an unadvertised model id, or an advertised model with an effort it lacks.
- Stub tests must include a refusal path. The `refuse-effort` stub mode exists for this.
- Still open: ce-work's codex route sends the effort the user authorized (`skills/ce-work/scripts/cross-model-work.sh:425`), and the claude `effort`, grok `reasoning_effort`, and antigravity `thinking_level` options are sent unconditionally on the review routes. No account is known to refuse them today; when one does, the same retry applies to editorial values only.

## Related Issues

- Issues #2074 and #2075 (what this fix addresses); PR #2029 (the model change); issue #1569 (ce-work's codex route hard-codes effort).
- `docs/solutions/integration-issues/antigravity-acp-runtime-as-cross-model-peer.md`: the first pre-egress model fallback.
- `docs/solutions/skill-design/requested-vs-verified-model-identity.md`: why a receipt records what was requested apart from what ran.
- `docs/solutions/skill-design/benchmark-review-peer-model-and-reasoning-tier.md`: how the Codex peer's model and effort were chosen.
