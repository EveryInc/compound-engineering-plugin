# Resolving the output mode

Required read at Phase 0.0, before anything writes or resumes an ideation artifact. The ordinary-key cascade block lives in `SKILL.md` and is not repeated here.

#### 0.0 Resolve Output Mode

Determine `OUTPUT_FORMAT` for the ideation artifact this run might persist. Output mode is **exclusive** — the ideation doc is written as either HTML (`.html`) OR markdown (`.md`), never both. Precedence: in-prompt request > user-stated preference > config > default (`html`), with a hard pipeline-mode override.

Unlike `ce-plan` and `ce-brainstorm` (which default to `md`), ce-ideate defaults to **`html`** — ideation artifacts are read mainly by humans weighing candidate directions, and a rich self-contained HTML file makes the ideas easier to approach.

**Read config.** Resolve `<repo-root>` with `git rev-parse --show-toplevel`, then apply the ordinary-key cascade block in `SKILL.md`. Read both files when they exist. If the root cannot be resolved, fall through to the defaults below.

Resolution steps:

1. **In-prompt request.** Reason over the user's prompt for this run for a request about *this document's* output format, expressed either as the `output:` shorthand or in plain language ("give me this as markdown", "I want a webpage"). On an explicit format, match it case-insensitively to `md`/`html`, and ignore the `output:` shorthand token when reading the rest of the prompt as the focus hint. Distinguish a request about the document's format from a format named as subject matter: "ideate on an HTML export feature" is the work, not a doc-format request — do not switch on it.
   - `output:` alone (no value) → no-op, fall through to step 2.
   - `output:<unknown>` (e.g., `output:pdf`) → drop the token, fall through to step 2, and remember to emit a one-line note above the post-ideation menu after final resolution: `Ignored unknown output: value '<value>' — using <resolved_format> instead.` where `<resolved_format>` is the value `OUTPUT_FORMAT` actually resolved to after the remaining precedence steps. Do not hardcode a format in the note — that misleads users when config or the default differs from what you assume.
2. **User-stated preference.** If this prompt holds no format request, honor an output-format preference (markdown vs HTML) the user established earlier — earlier in this session, in your memory, or written into their active instructions — that is already in your context (match `md`/`html` case-insensitively). A remembered preference is more current than the rarely-edited config, so it **overrides** the config in step 3. Do not open or search instruction files to find it — act only on a preference already present in your context; if none is, fall through to the config.
3. **Config.** If steps 1-2 did not resolve, apply the ordinary-key rule: first **active (non-commented)** `ideate_output:` in `config.local.yaml` then `config.yaml` matching `md` or `html` (case-insensitive) wins. Missing, invalid, or commented values continue to the next layer, then step 4. Critical: lines starting with `#` are YAML comments and must be ignored — the shipped config template includes a commented example like `# ideate_output: md` to document the option, and matching that as an active setting would silently override the default on every run without the user having opted in.
4. **Default.** Otherwise `OUTPUT_FORMAT=html`.
5. **Pipeline override.** When invoked from any pipeline or `disable-model-invocation` context, force `OUTPUT_FORMAT=md` regardless of steps 1-4 — automated downstream consumers parse markdown reliably and HTML in pipeline runs is unnecessary friction.

**Token-parsing convention:** only literal-prefix flag tokens (`output:`, `mode:` where applicable) are consumed and stripped. Other `<word>:<word>` tokens — including conventional commit prefixes like `feat:`, `fix:`, `chore:` that may appear inside a focus hint — pass through verbatim.

**Defer loading the format-rendering reference.** The deliverable is written at Phase 4 (after generation), so `references/ideation-sections.md` and the format-rendering references (`markdown-rendering.md` / `html-rendering.md`) are only needed then — loading them at Phase 0.0 would carry them through the entire grounding and ideation dispatch for no benefit. Resolve `OUTPUT_FORMAT` now, but load the section contract and the matching rendering reference at write time (see `references/post-ideation-workflow.md` §4.1). The `output:` preference does NOT auto-propagate to `ce-brainstorm` on handoff — see §5.2 there.

#### 0.1 Check for Recent Ideation Work

Look in `<root>/ideation/` for ideation documents (`*.md` or `*.html`) created within the last 30 days. This is a repo-mode convenience: when there is no git repository or `<root>` fails to resolve, skip the scan and continue — do not fail the run before 0.3 classifies mode, since elsewhere and no-repo runs write to a temp area and never touch `<root>/ideation/`.

A prior doc is relevant when its topic, path, or subsystem overlaps the requested focus, or the request is open-ended and one obvious recent open doc exists. Issue-grounded and non-issue ideations are distinct topics — never offer to resume across that line.

If a relevant doc exists, ask whether to continue from it or start fresh. If continuing: read it, summarize what has already been explored, preserve the previous ideas and rejection summary, and update that file rather than creating a duplicate.

**Write the update back in the existing file's format**, overriding the Phase 0.0 baseline. Resume precedence: explicit `output:` arg this run > resumed file's extension > config > default (`html`), with pipeline mode still forcing `md`. An explicit `output:` that differs from the existing file switches format — write the new-format file and leave the original in place.
