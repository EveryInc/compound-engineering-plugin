# Lightweight mode

### Lightweight Mode

<critical_requirement>
**Single-pass alternative — same artifact type, reduced research and validation.**

This mode skips parallel subagents entirely. The orchestrator performs all work in a single pass and writes the same solution-doc artifact type, but omits cross-referencing, duplicate detection, session-history research, and semantic grounding validation.

Non-interactive mode enters Lightweight only when explicitly invoked with `depth:lightweight`; otherwise it defaults to Full for backward compatibility.
</critical_requirement>

The orchestrator (main conversation) performs ALL of the following in one sequential pass:

1. **Extract from conversation**: Identify the problem and solution from conversation history. Also scan the "user's auto-memory" block injected into your system prompt, if present (Claude Code only) -- use any relevant notes as supplementary context alongside conversation history. Tag any memory-sourced content incorporated into the final doc with "(auto memory [claude])". Before asserting how code behaves (enum values, status semantics, limits, defaults), Read the defining line at the current tree — soften or attribute any claim you cannot verify. Cite PR numbers over bare commit SHAs, and phrase unmerged fixes as pending
2. **Classify**: Read `references/schema.yaml` and `references/yaml-schema.md`, then determine track (bug vs knowledge), category, and filename. Sample existing docs under `<root>/solutions/` and choose `component`, `root_cause`, and the directory under the corpus-first rule in `references/yaml-schema.md` (it names what each is matched on and when the suggested defaults apply)
3. **Write minimal doc**: Before writing, check whether the exact proposed `<root>/solutions/[category]/[filename].md` path exists. If it exists, read it: update it only when it covers the same problem, preserving its path and frontmatter structure and adding `last_updated: YYYY-MM-DD`; otherwise choose a distinct, descriptive filename and re-check that exact path is absent before writing. This is exact-path collision handling only — do not run Full mode's semantic overlap research or dispatch subagents. Create or update the doc using the appropriate track template from `assets/resolution-template.md`, with:
   - YAML frontmatter with track-appropriate fields, applying the YAML-safety quoting rule for array items (see `references/yaml-schema.md` > YAML Safety Rules)
   - Bug track: Problem, root cause, solution with key code snippets, one prevention tip
   - Knowledge track: Context, guidance with key examples, one applicability note
4. **Vocabulary capture (update-only)**: if `CONCEPTS.md` exists at repo root, read `references/concepts-vocabulary.md`, then scan the new doc and the conversation for qualifying terms and add, refine, fold, or scrub entries silently, within the criteria and coherence-neighborhood bounds that reference states. If `CONCEPTS.md` does not exist, defer creation to a Full run, which owns seeding. Record the outcome in the output (e.g., "Vocabulary: 1 entry refined, 1 folded" or "scanned, no qualifying terms"). If this run changed `CONCEPTS.md` at all — added, refined, folded, or scrubbed — and the project's active instructions and conventions already in your context do not surface it, add the discoverability tip to the output below — lightweight **tips**, it does not edit instruction files (an interactive Full run owns that edit after consent; non-interactive Full also tips/reports only).
5. **Read-only discoverability check**: Using the project's active instructions and conventions already in your context, assess whether they surface `<root>/solutions/` against the three criteria under **Discoverability Check** in `references/refresh-and-discoverability.md`. Do not open, offer to edit, or edit instruction files; Lightweight only reports the result. Record one of:
   - `no gap` when active project instructions surface the knowledge store
   - `gap noted — instruction-file tip emitted` when active project instructions exist but do not surface it
   - `not applicable — no active project instructions` when no project instructions are active; emit no discoverability tip
6. **Mechanical claims check**: run `scripts/validate-doc-claims.py` against the written doc exactly as in `references/assembly.md` Phase 2.45 step 1 (same `SKILL_DIR` anchor, same adjudicate-not-auto-fix rule — read `references/grounding-validation.md` for the adjudication table when it flags anything). Lightweight skips only the semantic validator subagent, not this deterministic check.
7. **Frontmatter parser-safety check**: validate the written doc exactly as in `references/assembly.md` Phase 2 step 8, using the same bundled-script existence guard and manual fallback checklist. Fix any violation and repeat the check; do not report success until the written frontmatter is parser-safe.
8. **Skip specialized agent reviews** (`references/enhancement.md`) and the semantic grounding validator (`references/assembly.md` Phase 2.45 step 2) to conserve context

**User-runnable retry rendering.** In the lightweight completion output below, default to `/ce-compound`; use `$ce-compound` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only the invocation as inline code and output one form only.

**Lightweight completion output:** In non-interactive Lightweight, do not emit this interactive block; use the depth-specific report under `Non-interactive mode` in `references/report.md` instead. In interactive Lightweight, emit:
```
✓ Documentation complete (lightweight mode)

File created:
- <root>/solutions/[category]/[filename].md

[If discoverability check found instruction files don't surface the knowledge store:]
Tip: Your AGENTS.md/CLAUDE.md doesn't surface <root>/solutions/ to agents —
a brief mention helps all agents discover these learnings.

[If CONCEPTS.md changed at all this run and isn't surfaced in the instruction files:]
Tip: Your AGENTS.md/CLAUDE.md doesn't surface CONCEPTS.md —
a one-line mention helps agents find the shared vocabulary.

Note: This was created in lightweight mode. For richer documentation
(cross-references, detailed prevention strategies, specialized reviews,
semantic grounding validation), re-run <rendered invocation> in a fresh session.
```

**No subagents are launched. No parallel tasks. The solution doc is the one deliverable** (Phase 2.4's update-only vocabulary capture may also change an existing `CONCEPTS.md`).

In lightweight mode, the overlap check is skipped (no Related Docs Finder subagent). This means lightweight mode may create a doc that overlaps with an existing one. That is acceptable — `ce-compound-refresh` will catch it later. Only suggest `ce-compound-refresh` if there is an obvious narrow refresh target. Do not broaden into a large refresh sweep from a lightweight session.

---
