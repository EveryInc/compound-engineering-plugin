# Compound Engineering configuration

Compound Engineering merges one user-global source with an optional project-local source. The same policy format and resolver are available to every supported harness; opening a checkout in Claude Code, OpenCode, Codex, Cursor, or another supported host does not require a harness-specific config copy. Concrete model selectors, effort controls, and serving receipts still depend on the active host or qualified external adapter.

## Config sources

The global source is exactly one path, selected in this order:

1. `$COMPOUND_ENGINEERING_HOME/config.yaml` when `COMPOUND_ENGINEERING_HOME` is set to an absolute directory.
2. `$XDG_CONFIG_HOME/compound-engineering/config.yaml` when `XDG_CONFIG_HOME` is set to an absolute directory.
3. `$HOME/.config/compound-engineering/config.yaml` otherwise.

Setting `COMPOUND_ENGINEERING_HOME` or `XDG_CONFIG_HOME` selects that location even when `config.yaml` does not exist; the resolver does not continue to the next path. All three directory values must resolve from absolute paths. The project source remains `<repo-root>/.compound-engineering/config.local.yaml`. A checkout with no project file inherits global settings without setup and without creating a local file. Linked worktrees are separate project sources, but all see the same global source.

`ce-setup` is the only global config writer and creates or changes that source only after an explicit global-scope request. Run `/ce-setup` to inspect configuration, maintain the project source and its `.gitignore` coverage, or explicitly manage global defaults. The committed `.compound-engineering/config.local.example.yaml` lists available settings. Do not put credentials, CLI commands, or harness flags in either source.

## Resolution and precedence

Each skill keeps its existing live precedence over config. The host instruction hierarchy first normalizes applicable current-task intent, still-active session intent, provenance-bearing caller data, and project-instruction intent into one task-scoped decision; lower-authority sources may fill an unset detail but cannot contradict a higher source. Conflicting equal-authority routing intent blocks before model invocation. For example, planning output resolves an in-prompt format request, then a session preference, then the effective merged config value, then its built-in default; pipeline mode still forces markdown.

For persisted settings, the resolver applies project over global over built-in defaults:

| Value shape | Narrower-layer behavior |
|---|---|
| Missing key | Inherits the broader value. |
| Scalar | Replaces the broader scalar. |
| List | Replaces the whole broader list; lists never append implicitly. |
| Named routing map | `profiles`, `classes`, and `roles` merge by name, so unrelated broader entries survive. |
| Profile definition | A same-named narrower profile replaces the complete broader profile atomically, including its candidate list. |
| Explicit `null` on a non-routing setting | Masks the broader value. The consumer receives `null` and applies its documented built-in behavior. Remove the key to inherit again. |
| `inherit` route binding | Continues to the next routing layer. |
| `ce-default` route binding | Stops inheritance and restores the owning skill's built-in dispatch behavior. |

Use `ce-default`, not `null`, to reset routing. Inside a profile, `ce-default` may appear only as the final candidate and explicitly authorizes the built-in path after earlier preferred candidates are unavailable or safely rejected.

Project and user instructions already loaded by the harness, host permissions, and each skill's mutation or egress contract can always narrow configuration. Config proposes execution identity and possible recipients; it does not by itself authorize egress. Every actual recipient, intermediary, material scope, and environment still passes the owning adapter's authorization gate. Routing cannot broaden prompts, tools, permissions, mutation scope, or workflow ownership.

## Trusted authority

The resolver reads a stable, bounded snapshot and rejects unsafe paths, symlinks, non-regular files, wrong ownership, group/world-writable files, replacement during read, unsupported YAML, duplicate keys, and tracked project config. Repository authority checks use a canonical root-owned Git executable with Git configuration, repository, object, index, and executable-path environment overrides removed; an ambient `PATH` shim cannot make tracked data authoritative. A safely user-owned global source can carry standing authority. A project approval-bearing value is trusted only from the untracked, safely ignored machine-local project source; an unignored project file may still supply ordinary preferences, but it cannot manufacture standing action or recipient authority. A narrower source may revoke broader approval. Host permissions, explicit egress restrictions, and adapter posture remain higher authority than either file.

Frozen routing snapshots retain their unchanged content-derived public envelope and are authenticated for seven days by MAC records under effective-user-private state at `/tmp/compound-engineering-<effective-uid>/routing/snapshot-auth/`. State directories must be user-owned mode `0700`; the key and records must be user-owned, non-symlink regular files mode `0600`. Installed resolver copies share that stable state even when a restrictive adapter strips `HOME` and XDG variables between commands. Records expire after seven days and are capped at the newest 1,024 entries. No key, MAC, or authentication metadata enters the snapshot or receipt; expired, evicted, rehashed, or provenance-altered envelopes fail closed.

## Inspection

`ce-setup` inspection reports both source paths and revisions, `settings.effective`, per-setting `settings.provenance`, authority status, diagnostics, and routing coverage. Skills consume that resolver output instead of parsing YAML themselves. This makes a global-only value visible in a checkout, shows whether a project override actually won, and distinguishes an explicit reset from a missing value before a workflow runs.

## Options

All settings are optional. Commented examples are documentation, not active values.

| Consumer | Options | Purpose and values |
|---|---|---|
| All model-dispatching CE skills | `routing` | Reusable execution profiles plus class and role bindings. See [Execution routing](#execution-routing). |
| [`ce-ideate`](./ce-ideate.md), [`ce-brainstorm`](./ce-brainstorm.md), [`ce-plan`](./ce-plan.md) | `ideate_output`, `brainstorm_output`, `plan_output` | Artifact format: `md` or `html`. Defaults are HTML for ideation and markdown for brainstorms/plans. Pipeline contexts force markdown. |
| [`ce-plan`](./ce-plan.md) | `plan_skip_scoping_confirm` | `true` skips the normal pre-plan scope confirmation; default `false`. It does not suppress genuine blockers or the post-plan menu. |
| [`ce-plan`](./ce-plan.md), [`ce-brainstorm`](./ce-brainstorm.md) | `plan_model`, `brainstorm_model` | Existing narrow model-elevation preferences. A prompt request or orchestrator carrier overrides the effective setting. No default (elevation off). |
| [`ce-work`](./ce-work.md), [`lfg`](./lfg.md) | `work_engine_mode`, `work_engine_preferences` | Existing ordered implementation-author preferences. Mode is `off`, `prefer`, or `require`; each entry has a `harness` and optional `model`. See [Legacy CE Work preferences](#legacy-ce-work-preferences). |
| [`ce-code-review`](./ce-code-review.md), [`ce-doc-review`](./ce-doc-review.md), [`ce-pov`](./ce-pov.md) | `cross_model_peer` | Existing preferred cross-model peer: `codex`, `claude`, `grok`, `cursor`, or `composer`. Owning skills retain independence and route-availability gates. |
| [`ce-commit-push-pr`](./ce-commit-push-pr.md) | `pr_teaching_section`, `pr_teaching_archive`, `auto_babysit` | Toggle PR concept teaching, opt into explainer archival, or opt out of the default babysit handoff. Defaults: `true`, `false`, and `true`. |
| [`ce-product-pulse`](./ce-product-pulse.md) | `pulse_product_name`, `pulse_lookback_default`, `pulse_primary_event`, `pulse_value_event`, `pulse_completion_events` | Product identity, reporting window, and the events that represent engagement, value, and completion. |
| [`ce-product-pulse`](./ce-product-pulse.md) | `pulse_quality_scoring`, `pulse_quality_dimension`, `pulse_analytics_source`, `pulse_tracing_source`, `pulse_payments_source`, `pulse_db_enabled` | Optional quality scoring and read-only data-source routing. |
| [`ce-product-pulse`](./ce-product-pulse.md) | `pulse_metric_sources`, `pulse_pending_metrics`, `pulse_excluded_metrics` | Per-metric source overrides and strategy metrics that should render as pending or be excluded. |
| [`ce-promote`](./ce-promote.md) | `ce_promote_spiral_optout` | `true` suppresses the one-time Spiral setup offer; remove the project key to inherit the global value again. |
| [`ce-sweep`](./ce-sweep.md) | `feedback_sources`, `sweep_state_path`, `sweep_ack_cap`, `sweep_lease_ttl_minutes`, `sweep_shared_branch` | Feedback connectors, durable state location, acknowledgment circuit breaker, lease expiry, and optional push-gated shared-branch coordination. |

## Execution routing

CE owns the role catalog and decides which workers or personas run. Configuration only binds those selected roles to reusable execution profiles:

```yaml
routing:
  profiles:
    economy:
      candidates:
        - { harness: codex, model: gpt-5-mini, effort: low }
        - ce-default
    strong:
      candidates:
        - { harness: claude, model: opus, effort: high }
  classes:
    implementation: { profile: economy, policy: prefer }
    review: { profile: strong, policy: require }
  roles:
    ce-code-review.security-reviewer: { profile: strong, policy: require }
```

The stable classes are `implementation`, `review`, `reasoning`, `research`, and `verification`. A dispatch role is a stable skill-qualified identity such as `ce-work.implementation-worker`; CE owns both the role catalog and each role's class. A profile is a reusable ordered candidate list. A candidate requires a `harness` and may add `model`, `effort`, or `route`; these are data values, never command-line flags. Accepted harness identifiers are `claude`, `opencode`, `codex`, `cursor`, `grok`, `composer`, `pi`, and `antigravity`, but an accepted identifier is not a promise that the current host can serve every selector.

Routing precedence is explicit current-task binding, project role, project class, global role, global class, then the CE default. A role binding wins over its class at the same layer. Bindings may be `inherit`, `ce-default`, or `{ profile: <name>, policy: prefer|require }`. On OpenCode, task precedence is narrower: only a valid `ce-routing-intent/v1` structured carrier at the start of the original direct top-level user or command input can create it. The native plugin strips an accepted carrier before the skill or worker sees product text; unauthorized, malformed, quoted, synthetic, and child input remains byte-identical. Free-form wording, repository prose, plans, and findings do not create task routing authority. Global and project bindings are unaffected.

`prefer` tries declared candidates in order and can return to built-in execution only through an explicit final `ce-default` candidate or a documented compatibility mapping. It may accept a successful run with unavailable identity evidence only as `accepted_unverified`; it never relabels the requested model as the served model. `require` blocks the affected dispatch without prompting when the requested execution is unavailable or its concrete model/effort identity cannot be verified. Neither policy changes the active top-level session model, persona selection, prompt, tools, permissions, or workflow ownership. Routing is never encoded in a worker prompt and never approximated by selecting a different typed persona.

### Attempt-safe fallback

A candidate is locked before material reaches its recipient. Preflight unavailability can advance immediately. After an attempt starts, a preferred route may advance only when the owning adapter proves the attempt terminal, proves no output or side effect was integrated, discards or quarantines that output, and independently authorizes the next recipient, material scope, and environment. Lost contact, an in-flight process, a result marker, measurement, cherry-pick, commit, merge, or other integrated effect prevents recipient-changing fallback. Workers never choose their own fallback.

### Receipts

Each routed dispatch produces a redacted route receipt with the stable role and class, selected profile and source layer, policy, requested harness/route/model/effort, served provider/model/variant or explicit unverified status, ordered attempts, fallback reason, and terminal outcome. The request and served facts remain separate. On OpenCode, only the assistant response's `providerID`, `modelID`, and `variant` become serving evidence; worker claims are ignored. Normal successes may be grouped by profile, class, source, and outcome; fallbacks, mismatches, unverified strict identity, and blockers remain individually visible. Receipts are summaries, not prompt or credential logs. They persist only when the owning workflow already has durable state; otherwise they live only through the current result summary.

## Legacy compatibility

Existing narrow settings remain valid and resolve from the same merged global/project snapshot: `plan_model`, `brainstorm_model`, `cross_model_peer`, `work_engine_mode` with `work_engine_preferences`, and optimization-spec model/backend settings retain their owning skill's scope. A more specific generalized role binding can route that dispatch without turning the narrow key into a global prompt or permission override.

Retired scalar keys such as `plan_use_fable`, `brainstorm_use_fable`, `fable_nudge`, `work_engine_target`, and `work_engine_model` are diagnostics, not silent aliases. Run `ce-setup` to see their replacement and remove them after migration.

### Legacy CE Work preferences

The narrow CE Work list remains an accepted compatibility input:

```yaml
work_engine_mode: prefer
work_engine_preferences:
  - harness: cursor
    model: composer
  - harness: codex
    model: gpt-5.6
  - harness: claude
```

Omitting `model` uses that harness's configured default. Current-task implementation wording still outranks this compatibility setting. `prefer` follows its declared compatibility fallback; `require` blocks without prompting when no valid route can satisfy it. The host continues to own validation, integration, commits, and the calling workflow's tail.

Compatibility `prefer` synthesizes its historically shipped built-in fallback explicitly. That exception does not add implicit native fallback to generalized profiles: add final `ce-default` there when built-in execution is intended.

## Host capabilities and evidence

| Surface | Deterministic evidence | Deliberate limit |
|---|---|---|
| Native skill directories | Generated resolver, settings schema, protocol, role catalog, and execution reference match their canonical bytes. | Asset presence proves packaging, not a live model selector. |
| Native OpenCode package | The package registers `ce_task`; harness-faithful tests use the SDK's session, agent, config, and model APIs, reproduce TaskTool's filtered parent-deny/external-directory plus recursion/primary-tool permission derivation for `general`, preserve prompt bytes, apply provider/model/variant, and finalize host response identity before returning output. | Version `1.18.3` is the tested baseline, not runtime attestation. Missing or malformed capability responses, depth exhaustion, unknown model/variant, or any candidate `route` is unavailable before child creation. Fakes do not prove live authentication or provider service. |
| OpenCode, Codex, Pi, and Antigravity converted trees | The real plugin is converted twice into the same managed output roots; representative consumer skills retain byte-identical assets, and each copied resolver runs from a standalone non-repository directory. | Converted OpenCode output does not carry the native `ce_task` adapter. Configured native OpenCode selectors are therefore unavailable; copied routing assets do not prove selector support. |
| Other native dispatch metadata | Contract tests preserve prompt assets, roster, tools, permissions, mutation posture, and concurrency around configured selectors and receipts. | Prose and static metadata are not evidence that a particular installed host exposes a selector or serving receipt. |
| Hosts without a usable selector | Deterministic policy marks the candidate unavailable; `prefer` advances only as declared and `require` blocks. | Routing never emulates a selector with prompt text or a typed-agent substitution. |
| External CLI routes | Adapter tests pin fixed recipients, least-privilege flags, identity parsing, credential minimization, and terminal-state handling. | Installed CLI version, authentication, provider availability, and trustworthy live receipts are opt-in environment evidence. Default tests make no live-provider claim. |

Native subagent support is also host-specific. Where an owning skill already has an inline or serial degradation path, `ce-default` preserves it; routing does not invent one. Treat any unrun live OpenCode, Claude Code, Codex, Cursor, Grok, Composer, Pi, or Antigravity selector/receipt check as an explicit evidence gap rather than inferring support from config syntax.

## Local writer ownership

Feature setup writers remain project-local: Product Pulse, Sweep, Promote, and similar flows use the resolver's `patch_source` operation only for `.compound-engineering/config.local.yaml`. They use the inspected project source revision for a compare-and-swap update, preserve unrelated project keys, and never copy inherited global values into the checkout. Because portable POSIX rename has no inode-conditional replace, the writer persists and fsyncs an owner-validated `ce-config-replace/v1` transaction beside the source before displacing the current destination, then installs the candidate with no-overwrite semantics. Every resolver read or write recovers a pending transaction under the exclusive source lock before readers continue under shared locks: it restores the old source or completes an identity-proven installed candidate. A competing external save, malformed state, or multiple pending transactions returns `CONFIG_RECOVERY_REQUIRED`, preserves every version, and never interprets a transiently absent source as missing policy. An interrupted uncommitted candidate is retained as `.ce-candidate-*`; the caller must re-inspect rather than overwrite it. Only `ce-setup`, after explicit global intent, writes the global source.

## Safe maintenance

- Keep the project source gitignored and untracked. Durable team policy belongs in the project's normal agent-instructions mechanism, such as `AGENTS.md` or `CLAUDE.md`, not in machine-local config.
- Prefer current-task instructions for one-off choices and global config for defaults wanted across projects.
- Use project config only for selective checkout-specific overrides; remove an override to resume inheritance.
- Re-run `/ce-setup` after plugin upgrades to refresh the committed example and inspect retired, malformed, unsafe, or unclassified settings. Malformed active configuration fails the affected read or dispatch closed; it is not silently ignored.
