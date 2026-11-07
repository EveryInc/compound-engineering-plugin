# CE Setup Config Refresh Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-setup` brings repo config files up to date. That covers `skills/ce-setup/references/config-refresh.md`, Step 5a of `references/repo-fixes.md`, the config lines of `references/non-interactive.md`, and `scripts/config-refresh.py`. It is not a runtime reference. Never inject this file into the agent under test.

The scenarios are the `ce-setup/config-refresh-*` rows of `tests/skill-eval-cell/catalog.ts`, with fixtures under `tests/skill-eval-cell/fixtures/setup-config-refresh-*`. Each row grades the files the run leaves behind, not what it says it did.

## Scenarios

| Scenario | Fixture | Pass |
|---|---|---|
| `config-refresh-rebuilds-old-config-yaml` | `config.yaml` copied from the 2026-08-12 template, with `cross_model_peer: codex` active and a team comment above it | `config.yaml` carries the current version line, the comment and setting sit together with the current seven-option list, and the old five-option list is gone |
| `config-refresh-cuts-down-legacy-local` | `config.local.yaml` that is the pre-cascade full local template, plus the same setting and comment, `plan_use_fable: true`, and `work_delegate: codex` | the local file keeps the comment and setting, loses both retired keys and the old template text, gains no `plan_model`, and the answer names `plan_model` |
| `config-refresh-refuses-duplicate-keys` | `config.yaml` with `packs:` twice | the file is byte-for-byte unchanged and the answer names the duplicate |
| `config-refresh-current-file-is-left-alone` | `config.yaml` already on the current template, with a team setting | the file keeps its content and nothing is committed |
| `config-refresh-unattended-publishes-tracked-only` | the 2026-08-12 `config.yaml` plus a local file with `plan_use_fable: true`, run with `mode:non-interactive` | the refreshed `config.yaml` is committed for the pull request, `config.local.yaml` still has its retired key, and the run ends with `Setup complete:` or `Setup skipped:` |

The interactive rows tell the agent that every previewed change is approved, because `claude -p` and `codex exec` cannot answer a question. So the pack grades the result of approving, not how many questions were asked. Check the transcripts by hand for one yes or no per file rather than a question per setting.

## Method

```bash
bun run test:skill-eval-pack -- --id ce-setup/config-refresh-rebuilds-old-config-yaml --arm ab --hosts claude,codex,grok --out <new dir>
```

Run each row on its own, since the pack takes one `--id`. The pre arm is `5702b7b2e`, main before the refresh. On that arm every row except the duplicate-key and current-file rows is expected to fail, because the old skill never changed an existing config file. Run the two Success Criteria rows (`rebuilds-old-config-yaml` and `cuts-down-legacy-local`) three times on the post arm.

## Results

2026-11-07, Claude Code 2.1.319 (`claude -p`), Codex CLI 0.166.0 (`codex exec`), Grok 1.0.78. Pre arm `5702b7b2e`; post arm the working tree. Graded from the files each run left behind.

| Scenario | Arm | Claude | Codex | Grok |
|---|---|---|---|---|
| `rebuilds-old-config-yaml` | pre | fail | fail | fail |
| `rebuilds-old-config-yaml` | post, 3 trials | 3/3 | 3/3 | 3/3 |
| `cuts-down-legacy-local` | pre | fail | fail | fail |
| `cuts-down-legacy-local` | post, 3 trials | 3/3 | 0/3, then 3/3 after the summary fix | 3/3 |
| `refuses-duplicate-keys` | pre / post | pass / pass | pass / pass | pass / pass |
| `current-file-is-left-alone` | pre / post | pass / pass | pass / pass | pass / pass |
| `unattended-publishes-tracked-only` | pre / post | fail / pass | fail / fail | fail / pass |

- **Codex on `cuts-down-legacy-local`:** the file was right in every run, but the summary said "removed two retired keys" without naming `plan_model`. `references/summary.md` now requires each removed, migrated, or renamed setting with its reason and replacement. Three Codex and three Claude reruns after that change passed. Grok was not rerun on it; the change only adds required summary content.
- **Codex on `unattended-publishes-tracked-only`:** it drafted and verified the `config.yaml` refresh, then wrote nothing because it could not resolve an existing refresh pull request against the fixture's unreachable `origin`. That is the safe direction, and Claude and Grok published on the same fixture. One trial; not rerun.
- The single-question-per-file behavior is not graded, since the task pre-approves every change.
