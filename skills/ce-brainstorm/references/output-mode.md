# Resolving the output mode (Phase 0.0)

#### 0.0 Resolve Output Mode

`SKILL.md` owns the two rules that must hold without this read: the mode is exclusive, and pipeline mode forces `md`. This file owns the precedence that decides the rest — in-prompt request > user-stated preference > config > default (`md`) — and the token-parsing convention.

**Read config.** Resolve `<repo-root>` with `git rev-parse --show-toplevel`, then apply the ordinary-key rule stated in `SKILL.md`. Read both files when they exist. If the root cannot be resolved, fall through to the defaults below.

Resolution steps:

1. **In-prompt request.** Reason over the user's prompt for this run for a request about *this document's* output format, expressed either as the `output:` shorthand or in plain language ("make this a webpage", "I want this in HTML"). On an explicit format, match it case-insensitively to `md`/`html`, and ignore the `output:` shorthand token when reading the rest of the prompt as the feature description. Distinguish a request about the document's format from a format named as subject matter: "explore an HTML export feature" is the work, not a doc-format request — do not switch on it.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through to step 2, and remember to emit a one-line note above the post-generation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` where `<resolved_format>` is the value `OUTPUT_FORMAT` actually resolved to after the remaining precedence steps. Do not hardcode `md` in the note — that misleads users when config has set HTML.
2. **User-stated preference.** If this prompt holds no format request, honor an output-format preference (markdown vs HTML) the user established earlier — earlier in this session, in your memory, or written into their active instructions — that is already in your context (match `md`/`html` case-insensitively). A remembered preference is more current than the rarely-edited config, so it **overrides** the config in step 3. Do not open or search instruction files to find it — act only on a preference already present in your context; if none is, fall through to the config.
3. **Config.** If steps 1-2 did not resolve, apply the ordinary-key rule: first **active (non-commented)** `brainstorm_output:` in `config.local.yaml` then `config.yaml` matching `md` or `html` (case-insensitive) wins. Missing, invalid, or commented values continue to the next layer, then step 4. Critical: lines starting with `#` are YAML comments and must be ignored — the shipped config template includes commented examples like `# brainstorm_output: html` to document the option, and matching those as active settings would silently force HTML mode on every run without the user having opted in.
4. **Default.** Otherwise `OUTPUT_FORMAT=md`.
5. **Pipeline override.** When invoked from LFG or any `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-4. Downstream consumers (`ce-plan`, `ce-work`) parse markdown reliably; HTML in pipeline runs is unnecessary friction.

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:`, `brainstorm_model:<alias>`, `delegate:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including conventional commit prefixes like `feat:`, `fix:`, `chore:` that may appear inside a feature description — pass through verbatim. A stripped `brainstorm_model:<alias>` carrier (passed by an orchestrator) is retained for the approach-generation model-elevation step, not woven into the feature description.

**Model-elevation visibility.** Treat a stripped `brainstorm_model:<alias>` carrier or a surfaced `brainstorm_model` config value as a pending Phase 2 input, not a resolved choice. Phase 2 resolves the choice from the current conversation, carrier, and config immediately before generating approaches, so later user intent cannot be lost. Pipeline / `disable-model-invocation` mode still evaluates carrier and config.

**Resolve the format here; load the rendering reference at Phase 3, not now.** The format-rendering reference (`references/markdown-rendering.md` for `md`, `references/html-rendering.md` for `html`) is consumed only when the doc is composed — loading it during Phase 0 would carry 200+ lines through the entire dialogue. Phase 3 names the load. Section content is the same in either format; presentation differs.

The `output:` preference does NOT auto-propagate to `ce-plan` on handoff — ce-plan re-resolves its own `plan_output` config independently. Because both skills now operate on the same unified artifact, an explicit conversion by `ce-plan` must report the old path and new canonical path; pipeline mode may force markdown by writing the canonical markdown plan path and leaving any HTML sibling untouched as non-canonical for automated discovery.
