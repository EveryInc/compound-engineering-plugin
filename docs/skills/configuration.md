# Compound Engineering configuration

Compound Engineering keeps optional, checkout-local defaults in `.compound-engineering/config.local.yaml`. The file is shared by every supported harness that opens the same checkout, so a preference set while using Claude Code is also visible when the same checkout is opened in Codex or Cursor.

Run `/ce-setup` to create or repair the file and its `.gitignore` coverage. The committed `.compound-engineering/config.local.example.yaml` lists the available settings; uncomment only the keys you want to change. Do not put credentials, CLI commands, or harness flags in this file.

## Artifact root

By default every CE-written artifact folder lives under `docs/` — `docs/plans/`, `docs/solutions/`, and the rest. `docs_root` relocates that root to any repo-relative folder, for projects where `docs/` is already tracked content owned by something else (an Obsidian vault, a docs site). Unset, behavior is byte-identical to today.

`docs_root` reads from two layers, first non-empty wins: the checkout-local `config.local.yaml` above, then a **tracked** `.compound-engineering/config.yaml`. Prefer the tracked file — it is committed, so the setting reaches every clone and worktree of the project; the local file is per-checkout and would have to be re-set in each new worktree. (The tracked `config.yaml` is a general layer; today `docs_root` is its only consumer.)

Two things make `docs_root` unlike the other settings:

- **It is repo-relative and validated.** The value must resolve to a directory inside the repository — not absolute, not escaping via `../` or a symlink, not the repo root itself, not under `.git/`. A missing directory is created on first write.
- **It fails closed.** Every other setting falls through to its default on an invalid value. An unusable `docs_root` instead stops the skill with an error, because silently falling back to `docs/` would write CE artifacts into the very location you configured away from. `/ce-setup` reports the resolved root and which layer supplied it.

`docs_root` does not make artifacts survive an ephemeral workspace — the root is inside the repo, so it lives and dies with the checkout. Sharing artifacts across worktrees of a project is a separate, out-of-repo storage concern.

## How config relates to instructions

Config is a local default, not another agent-instructions file:

- A direct instruction for the current task wins over a conflicting config preference.
- Active session and project/user instructions already loaded by the harness can override or narrow config. Depending on the harness, project instructions may come from `AGENTS.md`, `CLAUDE.md`, or another native mechanism.
- Each skill's runtime contract still decides whether a setting applies. For example, pipeline execution forces planning artifacts to markdown, and model elevation takes effect on whichever harness can reach the requested model.
- Some skills define a more specific preference order for their own routing. Their skill page documents that order.

Because the file is gitignored and belongs to one checkout, linked worktrees do not automatically inherit it. CE Work resolves delegation before it creates detached worker worktrees, so an already-selected route is carried into that run; a separate interactive session opened directly in another worktree uses that worktree's own config.

## Options

All settings are optional. Commented examples are documentation, not active values.

| Consumer | Options | Purpose and values |
|---|---|---|
| all artifact-writing skills | `docs_root` | Repo-relative folder every CE artifact subdirectory lives under. Unset -> `docs` (byte-identical to today). A configured root is the sole location CE reads and writes. See [Artifact root](#artifact-root) — it is the one setting that fails closed rather than falling through to the default. |
| [`ce-ideate`](./ce-ideate.md), [`ce-brainstorm`](./ce-brainstorm.md), [`ce-plan`](./ce-plan.md) | `ideate_output`, `brainstorm_output`, `plan_output` | Artifact format: `md` or `html`. Defaults are HTML for ideation and markdown for brainstorms/plans. Pipeline contexts force markdown. |
| [`ce-plan`](./ce-plan.md) | `plan_skip_scoping_confirm` | `true` skips the normal pre-plan scope confirmation; default `false`. It does not suppress genuine blockers or the post-plan menu. |
| [`ce-plan`](./ce-plan.md), [`ce-brainstorm`](./ce-brainstorm.md) | `plan_model`, `brainstorm_model` | Model elevation: send the reasoning-heavy step to a named model (e.g. `fable`, `opus`) instead of the session model. Value is a model alias; a prompt request or an orchestrator's `plan_model:<alias>` carrier (e.g. from `lfg`, honored even in pipeline mode) overrides it. Takes effect on every harness — natively where the host serves the model, else via the Claude CLI, else inline. No default (elevation off). |
| [`ce-work`](./ce-work.md), [`lfg`](./lfg.md) | `work_engine_mode`, `work_engine_preferences` | Ordered implementation-author preferences. Mode is `off`, `prefer`, or `require`; each entry has a `harness` and optional `model`. See [Implementation routing](#implementation-routing). |
| [`ce-code-review`](./ce-code-review.md), [`ce-doc-review`](./ce-doc-review.md) | `cross_model_peer` | Preferred cross-model review target: `codex`, `claude`, `grok`, `cursor`, or `composer`. The review skills still apply host-independence and route-availability gates. |
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

`ce-work` walks the list in order and skips an entry equivalent to the current host/default model. A different explicit model in the same harness remains eligible. With `prefer`, an unavailable list falls back to native implementation with disclosure. With `require`, an interactive CE Work run asks before weakening the route, while LFG and other headless callers block.

Current-task wording can select a different route for one run without editing config, such as “use Codex for implementation” or “only use Composer for implementation.” The assignment applies to implementation; the host still owns validation, integration, commits, and the rest of the calling workflow.

## Safe maintenance

- Keep the file gitignored. It can contain local integration choices and should not be committed as team policy.
- Put durable team-wide instructions in the project's normal agent-instructions mechanism, not in this file.
- Prefer per-run instructions for one-off choices; use config for defaults you want across sessions in the same checkout.
- Re-run `/ce-setup` after plugin upgrades to refresh the committed example and diagnose retired or malformed settings.

