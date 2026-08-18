# Composing the title and body: evidence, teaching, and branding gates

**You MUST read `references/pr-description-writing.md`** in full — it owns value-first framing, sizing, program altitude, related-work references (preserve existing `Related:` / `Fixes` on rewrite), branding body rules, and the pre-apply audit. The only input it needs from this skill is the PR ref, if one was identified by mode dispatch (description-only with a pasted URL, description update, or confirmed existing-PR rewrite in full workflow). If Step 1 found an existing PR, pass its URL to Step 4 when rewriting so PR mode fetches the existing body. In Stack mode, Step 5 follows the post-submit route in `references/stack-submit.md` instead of composing one default-base body here.

**Evidence decision** before composition. CE does not own a capture workflow — use harness capture tools or user-supplied artifacts, never invent/upload evidence or launch another CE skill.

1. **User supplied** (URL, markdown image/embed, local path) — incorporate as `## Demo`, `## Screenshots`, or `## Evidence`.
2. **User asked for evidence but supplied none** — ask for the artifact or tell them to capture with the harness and return.
3. **No material observable claim** (internal plumbing, type-only, pure refactor, inert docs) — skip without asking. Classify by runtime purpose, not extension (runtime agent instructions / config / product content / policy YAML is not auto-skippable as "docs").
4. **Otherwise** (UI, CLI, API, workflow, ranking, deploy/config behavior) — concise validation note of what was exercised; if a real run was impossible (credentials, paid services, deploy-only, hardware, missing setup), say so. Do not block PR creation for missing visuals; test/manual notes are fine — never label test output "Demo" or "Screenshots."

**Concept teaching gate** before composition. Use the repo root gathered in Context (resolving it with `git rev-parse --show-toplevel` if you don't already have it — description-only/update can skip the Context snapshot) and apply the ordinary-key rule below.

<!-- ce-config-layers:start -->
**Resolve ordinary CE yaml keys from the two repo files.**

- **Read** `<repo-root>/.compound-engineering/config.local.yaml`, then `config.yaml` (`<repo-root>` = `git rev-parse --show-toplevel`). Missing files are skipped. Gitignore does not change resolution.
- **Win** with the first active (non-commented) value. For scalars, empty is unset; an invalid value continues to the next layer, then the skill default. For lists and maps, a present key — including an empty list or map — replaces the whole key.
- **Do not** use this rule for `docs_root` — that key is `config.yaml` only.
<!-- ce-config-layers:end -->

Only an **active (non-commented)** `pr_teaching_section:` key counts — lines starting with `#` are YAML comments; matching commented template keys would silently flip the gate. Off only when the winning active value is exactly `false`; missing key or any other value → default **on**. Same cascade resolves `pr_teaching_archive:` — on only when the winning active value is exactly `true`, else **off**; per-run `archive:on|off` overrides for this invocation.

- Gate **on** — judge novelty and compose per **Step B2** of the reference. When off, skip judgment, section, Step 5 trailer/offer, and archival entirely.
- Gate **off** — compose without concept handling.

**PR branding gate** before composition. Branding is **off unless this invocation includes `branding:on` or the user explicitly asks in the current prompt to add Compound Engineering branding**; normalize that natural-language request to `branding:on`. `branding:off` forces off when `branding:on` is absent. If both tokens are present, stop and report the conflict rather than guessing. Pass the resolved gate and new-vs-existing PR into Step D of the reference (body rules live there).

Then continue with the reference (Steps A–E, including Step B2 when the teaching gate is on). Step E must run before the body is returned.
