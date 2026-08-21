# Output Mode and Artifact Root

Read this before interpreting any planning phase. It owns prompt-token parsing, configuration precedence, renderer selection, and artifact-root resolution. Parse immediate prompt and contextual signals now. Defer every repository-backed fallback until resume and domain routing establish that this run will compose a rooted path or artifact; an answer-seeking run or a run with an explicit plan path may never need repository discovery.

## Artifact Root

**Every file reference inside the plan document is repo-relative** (`src/models/user.rb`), never absolute — unit file lists, pattern references, origin links, and prose mentions alike. Absolute paths break portability across machines, worktrees, and teammates. Paths printed to the user in chat are the exception and stay absolute so they are clickable.

This skill writes plans under `<root>/plans/` and reads learnings under `<root>/solutions/`. Resolve `<root>` when you first compose a `<root>/` path, never before you need it. A write to `<root>/...` and a read of `<root>/solutions/` both count, so either one triggers resolution; only a run that touches no `<root>/` path at all — a scratch-only or no-repo flow — skips it. Pass the resolved path to any subagent, not the config.

<!-- ce-docs-root:start -->
**Resolve the CE artifact root `<root>` before composing any artifact path.**

- **Read** `docs_root` from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`). Do not read it from `config.local.yaml`. Unset -> `<root>` is `docs`, exactly as before.
- **Validate** a set value: a repo-relative directory whose real, symlink-resolved path stays inside the repo and is neither the repo root nor under `.git/`. Otherwise stop with an error naming `docs_root` and the value -- never fall back to `docs`.
- **Use** `<root>` as the sole artifact location: create it if absent, compose each path as `<root>/<subdir>` with this skill's own subdirectory, and never also read `docs`.
<!-- ce-docs-root:end -->

## 0.0 Resolve Output Mode

Output mode is **exclusive** — a plan is written as either markdown (`.md`) OR HTML (`.html`), never both. Its precedence is in-prompt request > user-stated preference > config > default (`md`), with a hard pipeline-mode override. Before routing, resolve any tier that needs no repository. If those tiers do not settle the format, keep config/default resolution pending until an artifact-producing route is known; settle it before selecting a renderer or composing the artifact path. A terminal no-artifact route never probes config merely to resolve an unused format.

1. **In-prompt request.** Reason over the user's prompt for this run for a request about *this document's* output format, expressed either as the `output:` shorthand or in plain language ("make the plan a webpage"). Match an explicit format case-insensitively to `md`/`html`, and ignore the `output:` token when reading the rest of the prompt as the feature description. Distinguish a request about the document's format from a format named as subject matter: "add an HTML export feature" is the work, not a doc-format request.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through, and emit a one-line note above the post-generation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` Do not hardcode `md` in the note — that misleads users when config has set HTML.
2. **User-stated preference.** If this prompt holds no format request, honor an output-format preference the user established earlier that is already in your context, matching `md`/`html` case-insensitively. A remembered preference is more current than the rarely-edited config, so it **overrides** the config in step 3. Do not open or search instruction files to find it.
3. **Config.** Once an artifact-producing route is known, apply the ordinary-key rule below: the first **active (non-commented)** `plan_output:` matching `md` or `html` (case-insensitively) wins. Missing, invalid, or commented values continue to the next layer, then step 4. The shipped template's commented examples are not settings.
4. **Default.** Otherwise `OUTPUT_FORMAT=md`. If `<repo-root>` cannot be resolved so the config cannot be read, fall through to this default rather than failing.
5. **Pipeline override.** When invoked from LFG or any `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-4. Pipeline mode forces markdown and skips interactive questions but does **not** disable model elevation — `plan_model` config (and a `plan_model:<alias>` caller carrier) is still honored (see the model-elevation sub-step below and `references/reasoning-elevation.md`).

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:`, the exact `confirm:auto`/`confirm:ask` forms, `plan_model:<alias>`, `delegate:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including commit prefixes like `feat:` and any unrecognized `confirm:<value>` — pass through verbatim into the feature description. A stripped `plan_model:<alias>` carrier is retained for the Phase 5.2 model-elevation step.

**For an artifact-producing route, load the format-rendering reference only after the value settles:** `references/markdown-rendering.md` when `OUTPUT_FORMAT=md`, `references/html-rendering.md` when `OUTPUT_FORMAT=html`. Section content is the same either way; presentation differs. Both are paired with `references/plan-sections.md`.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

Also resolve the immediate `SKIP_SCOPING_CONFIRM` signals here. `confirm:auto` skips the scoping-synthesis confirmation for this run and `confirm:ask` forces it on; honor an equivalent plain-language instruction the same way ("just write it, don't ask me to confirm" skips; "ask me before writing the plan" asks). Only those two literal values are consumed as a flag — any other `confirm:<value>` stays verbatim in the feature description. Then use a preference already in your context. If neither settles the value, defer the first **active (non-commented)** `plan_skip_scoping_confirm:` matching `true` or `false`, then the default of asking, until `references/intake.md` reaches the gate where the value matters. A route that never reaches that gate does not probe config for it.

**Model-elevation visibility.** Treat a stripped `plan_model:<alias>` carrier or a surfaced `plan_model` config value as a pending Phase 5.2 input, not a resolved choice. Phase 5.2 resolves the choice from the current conversation, carrier, and config immediately before authoring, so later user intent cannot be lost.
