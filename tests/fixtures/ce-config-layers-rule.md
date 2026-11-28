<!-- ce-config-layers:start -->
**Resolve CE yaml keys from the config files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml` — or the primary worktree's copy of it when this checkout is a linked worktree with no local file — then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value: empty scalars are unset, an invalid value continues to the next layer, then the skill default; a present list or map — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->
