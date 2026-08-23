# Compound Engineering configuration

Compound Engineering keeps optional repo defaults in `.compound-engineering/config.yaml`. Ordinary keys may also live in `.compound-engineering/config.local.yaml`, which overrides the repo file per key. Both files are visible to every supported harness that opens the same checkout.

Run `/ce-setup` to create `config.yaml` and refresh the committed `.compound-engineering/config.example.yaml`. Setup does not create `config.local.yaml`. Uncomment only the keys you want to change. Do not put credentials, CLI commands, or harness flags in either file.

## How keys resolve

- **Ordinary keys:** read `config.local.yaml`, then `config.yaml`. The first active (non-commented) value wins. A missing file is skipped. Invalid or empty scalars continue to the next layer, then the skill default. A present list or map, including empty, replaces the whole key.
- **`docs_root`:** read only from `config.yaml`. A `docs_root` in `config.local.yaml` is ignored.
- **Gitignore does not change resolution.** Either file works whether ignored or committed.
- A current-task instruction still wins over config. Session and project instructions already in context can override or narrow it.

## Artifact root

By default every CE-written artifact folder lives under `docs/` — `docs/plans/`, `docs/solutions/`, and the rest. `docs_root` relocates that root to any repo-relative folder, for projects where `docs/` is already tracked content owned by something else (an Obsidian vault, a docs site). Unset, behavior is byte-identical to today.

Set `docs_root` only in tracked `config.yaml` so every clone and worktree share one artifact tree.

Two other things make `docs_root` unlike the other settings:

- **It is repo-relative and validated.** The value must resolve to a directory inside the repository — not absolute, not escaping via `../` or a symlink, not the repo root itself, not under `.git/`. A missing directory is created on first write.
- **It fails closed.** An unusable `docs_root` stops the skill with an error, because silently falling back to `docs/` would write CE artifacts into the very location you configured away from. `/ce-setup` reports the resolved root.

`docs_root` does not make artifacts survive an ephemeral workspace — the root is inside the repo, so it lives and dies with the checkout.

## How config relates to instructions

Config is a default, not another agent-instructions file:

- A direct instruction for the current task wins over a conflicting config preference.
- Active session and project/user instructions already loaded by the harness can override or narrow config. Depending on the harness, project instructions may come from `AGENTS.md`, `CLAUDE.md`, or another native mechanism.
- Each skill's runtime contract still decides whether a setting applies. For example, pipeline execution forces planning artifacts to markdown, and model elevation takes effect on whichever harness can reach the requested model.
- Some skills define a more specific preference order for their own routing. Their skill page documents that order.

Committed `config.yaml` is shared across worktrees of the same project. `config.local.yaml` is per-checkout. CE Work resolves delegation before it creates detached worker worktrees, so an already-selected route is carried into that run.

## Options

All settings are optional. Commented examples are documentation, not active values.

| Consumer | Options | Purpose and values |
|---|---|---|
| all artifact-writing skills | `docs_root` | Repo-relative folder every CE artifact subdirectory lives under. Set only in `config.yaml`. Unset -> `docs`. See [Artifact root](#artifact-root). |
| [`ce-ideate`](./ce-ideate.md), [`ce-brainstorm`](./ce-brainstorm.md), [`ce-plan`](./ce-plan.md) | `ideate_output`, `brainstorm_output`, `plan_output` | Artifact format: `md` or `html`. Defaults are HTML for ideation and markdown for brainstorms/plans. Pipeline contexts force markdown. |
| [`ce-plan`](./ce-plan.md) | `plan_skip_scoping_confirm` | `true` skips the normal pre-plan scope confirmation; default `false`. It does not suppress genuine blockers or the post-plan menu. |
| [`ce-plan`](./ce-plan.md), [`ce-brainstorm`](./ce-brainstorm.md) | `plan_model`, `brainstorm_model` | Model elevation: send the reasoning-heavy step to a named model (e.g. `fable`, `opus`) instead of the session model. Value is a model alias; a prompt request or an orchestrator's `plan_model:<alias>` carrier (e.g. from `lfg`, honored even in pipeline mode) overrides it. Takes effect on every harness — natively where the host serves the model, else via the Claude CLI, else inline. No default (elevation off). |
| [`ce-work`](./ce-work.md), [`lfg`](./lfg.md) | `work_engine_mode`, `work_engine_preferences` | Ordered implementation-author preferences. Mode is `off`, `prefer`, or `require`; each entry has a `harness` and optional `model`. See [Implementation routing](#implementation-routing). |
| [`ce-code-review`](./ce-code-review.md), [`ce-doc-review`](./ce-doc-review.md) | `cross_model_review_mode` | Whether the automatic cross-model pass may send review content to a second provider: `auto` (default, current behavior) or `off`. `off` is evaluated before any peer or route is resolved, keeps every local reviewer and the local adversarial fallback, and is reported as "disabled by checkout config" rather than as an unavailable route. A direct conversation request for a peer overrides `off` for that run; a conversation prohibition overrides `auto`. |
| [`ce-code-review`](./ce-code-review.md), [`ce-doc-review`](./ce-doc-review.md) | `cross_model_peer` | Preferred cross-model review target: `codex`, `claude`, `grok`, `cursor`, or `composer`. `grok` binds the native grok CLI when it is installed, and falls back to Grok through Cursor only when that CLI is absent and Cursor is a sanctioned recipient. The review skills still apply host-independence and route-availability gates. |
| [`ce-code-review`](./ce-code-review.md), [`ce-doc-review`](./ce-doc-review.md) | `cross_model_model`, `cross_model_effort` | Pin the resolved peer target's model (an alias such as `fable` or a full id such as `claude-opus-5`, same family as the target; a codex id may carry its serving provider's namespace, such as `openai.gpt-5.6-sol`, when the CLI routes through a non-default `model_provider`) and reasoning effort (claude `low`..`max`, codex `minimal`..`xhigh`, grok `low`..`high`; cursor-agent routes accept none). Unset keeps the skills' editorial mapping. A value the peer cannot honor skips the pass with a stated reason rather than substituting; a conversation request overrides both. |
| [`ce-commit-push-pr`](./ce-commit-push-pr.md) | `pr_teaching_section`, `pr_teaching_archive`, `auto_babysit` | Toggle PR concept teaching, opt into explainer archival, or opt out of the default babysit handoff. Defaults: `true`, `false`, and `true`. |
| [`ce-product-pulse`](./ce-product-pulse.md) | `pulse_product_name`, `pulse_lookback_default`, `pulse_primary_event`, `pulse_value_event`, `pulse_completion_events` | Product identity, reporting window, and the events that represent engagement, value, and completion. The setup interview writes these values. |
| [`ce-product-pulse`](./ce-product-pulse.md) | `pulse_quality_scoring`, `pulse_quality_dimension`, `pulse_analytics_source`, `pulse_tracing_source`, `pulse_payments_source`, `pulse_db_enabled` | Optional quality scoring and read-only data-source routing. |
| [`ce-product-pulse`](./ce-product-pulse.md) | `pulse_metric_sources`, `pulse_pending_metrics`, `pulse_excluded_metrics` | Per-metric source overrides and strategy metrics that should render as pending or be excluded. |
| [`ce-promote`](./ce-promote.md) | `ce_promote_spiral_optout` | `true` suppresses the one-time Spiral setup offer; remove the key to enable it again. |
| [`ce-sweep`](./ce-sweep.md) | `feedback_sources`, `sweep_state_path`, `sweep_ack_cap`, `sweep_lease_ttl_minutes`, `sweep_shared_branch` | Feedback connectors, durable state location, acknowledgment circuit breaker, lease expiry, and optional push-gated shared-branch coordination. The setup interview writes these values. |

## Implementation routing

The work engine list is host-relative rather than tied to the checkout's usual harness:

```yaml
work_engine_mode: prefer
work_engine_preferences:
  - harness: cursor
    model: composer
  - harness: codex
    model: "gpt-5.6"
  - harness: claude
```

Supported harnesses are `codex`, `claude`, `grok`, and `cursor`. Omitting `model` uses that harness's configured default. Composer is a model family reached through Cursor, so request it with `harness: cursor` and `model: composer`.

`ce-work` walks the list in order and skips an entry equivalent to the current host/default model. A different explicit model in the same harness remains eligible. With either `prefer` or `require`, an unavailable list falls back to native implementation on the current harness and session model with one disclosure. `require` keeps the requested external identity fixed while viable; it never authorizes an unrequested external recipient or turns route unavailability into a blocker.

Current-task wording can select a different route for one run without editing config, such as “use Codex for implementation” or “only use Composer for implementation.” The assignment applies to implementation; the host still owns validation, integration, commits, and the rest of the calling workflow.

## Safe maintenance

- Commit `config.yaml` when you want team defaults. Keep `config.local.yaml` out of git if it holds personal or checkout-only choices (`/ce-setup` can add `.compound-engineering/*.local.yaml`).
- Put durable team-wide *instructions* in the project's normal agent-instructions mechanism. Team *defaults* for CE keys may live in `config.yaml`.
- Prefer per-run instructions for one-off choices.
- Re-run `/ce-setup` after plugin upgrades to refresh the committed example and diagnose retired or malformed settings.
