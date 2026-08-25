# Phase 2: assembly, write, vocabulary, grounding

### Phase 2: Assembly & Write

<sequential_tasks>

**WAIT for all Phase 1 inputs to complete before proceeding** — the three parallel subagents and, in Full mode, the internal session-history flow (which may have stopped at the probe with `no relevant prior sessions`). Session history is a Phase 1 input even though it runs in the orchestrator rather than as a public skill.

The orchestrating agent (main conversation) performs these steps:

1. **Collect Phase 1 results from the run artifacts.** For each Phase 1 subagent, `Read` its artifact file under `{run_dir}/` (`context.json`, `solution.md`, `related.json`, and `session-history.md` when session history ran). The artifact holds the subagent's full output. **Fall back to the subagent's inline return only when its artifact file is absent or empty** (e.g., `{run_id}` did not resolve, or the subagent failed to write). The artifact is authoritative when present — this is what makes the workflow resilient to the issue #956 summary-collapse, where the inline return is only an executive summary.
2. **Check the overlap assessment** from the Related Docs Finder before deciding what to write:

   | Overlap | Action |
   |---------|--------|
   | **High** — existing doc covers the same problem, root cause, and solution | **Update the existing doc** with fresher context (new code examples, updated references, additional prevention tips) rather than creating a duplicate. The existing doc's path and structure stay the same. |
   | **Moderate** — same problem area but different angle, root cause, or solution | **Create the new doc** normally. Flag the overlap for the refresh check in `references/refresh-and-discoverability.md` to recommend consolidation review. |
   | **Low or none** | **Create the new doc** normally. |

   The reason to update rather than create: two docs describing the same problem and solution will inevitably drift apart. The newer context is fresher and more trustworthy, so fold it into the existing doc rather than creating a second one that immediately needs consolidation.

   When updating an existing doc, preserve its file path and frontmatter structure. Update the solution, code examples, prevention tips, and any stale references. Add a `last_updated: YYYY-MM-DD` field to the frontmatter. Do not change the title unless the problem framing has materially shifted.

3. **Incorporate session history findings** (if available). When the internal session-history flow returned relevant prior-session context:
   - Fold investigation dead ends and failed approaches into the **What Didn't Work** section (bug track) or **Context** section (knowledge track)
   - Use cross-session patterns to enrich the **Prevention** or **Why This Matters** sections
   - Tag session-sourced content with "(session history)" so its origin is clear to future readers
   - If findings are thin or "no relevant prior sessions," proceed without session context
4. Assemble complete markdown file from the collected pieces, reading `assets/resolution-template.md` for the section structure of new docs
5. Validate YAML frontmatter against `references/schema.yaml`, including the YAML-safety quoting rule for array items (see `references/yaml-schema.md` > YAML Safety Rules)
6. Create directory if needed: `mkdir -p <root>/solutions/[category]/`
7. Write the file: either the updated existing doc or the new `<root>/solutions/[category]/[filename].md`
8. **Validate parser-safety of the written frontmatter** to catch silent-corruption issues the prose rules miss: malformed `---` delimiter lines, unquoted ` #` in scalar values (silent comment truncation), and unquoted `: ` in scalar values (silent mapping confusion). The bundled validator ships **inside the skill bundle**; set `SKILL_DIR` to the absolute path of the directory containing this SKILL.md and run it through an existence guard so platforms that cannot locate the script fall back to a manual check instead of silently skipping the protection:

   ```bash
   SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
   if [ -f "$SKILL_DIR/scripts/validate-frontmatter.py" ]; then
     PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
     "$PY" "$SKILL_DIR/scripts/validate-frontmatter.py" <output-path>;
   else
     echo "Bundled validate-frontmatter.py not resolvable on this platform; applying the parser-safety checklist manually.";
   fi
   ```

   - **If the script ran:** exit 0 means parser-safe; exit 1 means stderr names the offending field(s) — quote the value(s), re-write the doc, and re-run until exit 0. Do not declare success while validation fails.
   - **If the script did not run** (else branch): apply the validator's checks by hand, matching its exact scope — checking more broadly risks edits the validator would not require. Fix any violation by quoting the whole value before continuing:
     1. The opening and closing frontmatter delimiters are each a line whose content is `---` (trailing whitespace is fine; `----` or `---extra` is not a valid delimiter).
     2. For each **top-level** mapping entry (`key: value`, no leading indentation) whose value is **not already quoted or structured** (does not start with `"`, `'`, `[`, `{`, `|`, or `>`): the value must contain no unquoted ` #` (space-then-hash — YAML treats it as a comment and silently truncates) and no unquoted `: ` (colon-then-space — strict YAML may read it as a nested mapping). Quote the whole value if either appears.
     Nested values, array items, and already-quoted values are out of scope here (array-item quoting is handled by the schema/YAML-safety step above). Then state in the completion output that the bundled script validator was unavailable on this platform and the checks were applied manually.

   The validator does not enforce schema rules and does not flag YAML reserved-indicator characters (those produce loud parser errors downstream rather than silent corruption — out of scope). Uses Python 3 stdlib only (no PyYAML or other deps).

When creating a new doc, preserve the section order from `assets/resolution-template.md` unless the user explicitly asks for a different structure.

</sequential_tasks>

### Phase 2.4: Vocabulary Capture

**First, read `references/concepts-vocabulary.md`.** This is unconditional. Do not pre-judge from memory that nothing qualifies — the reference's criteria are non-obvious and qualifying terms often live in the surrounding conversation rather than the new doc itself. Reading the reference is what makes the rest of the phase possible.

Then, applying those criteria, scan the new doc **and** the surrounding conversation for qualifying domain terms. If `CONCEPTS.md` exists at repo root, this phase may add, refine, fold, and scrub, as those are defined under **The supported mutations** in that reference; retiring and deleting belong to `ce-compound-refresh`. If it does not exist and at least one qualifying term surfaced, create it.

**Verify behavior assertions against source before writing them.** When an entry asserts how code behaves (states, transitions, limits, semantics), Read the defining source at the current tree first — an entry drafted from a session-level summary is exactly how wrong semantics enter the glossary. Phase 2.45 re-checks these entries, but the cheap fix is to not write the error.

**Seed the learning's area at creation — don't write a lone term.** When `CONCEPTS.md` does not yet exist, alongside the surfaced term also seed the core domain nouns of the area this learning touched, following the **Seed goal** and **Scope of a seed** rules in `references/concepts-vocabulary.md`. The seed is scoped to the learning's area (the modules and domain the fix touched) and defines only terms investigated here — it does not reach for repo-wide nouns. This anchors the surfaced term so it does not dangle against undefined siblings. A repo-wide concept map is `ce-compound-refresh`'s bootstrap path, not this one.

**At creation, hold the qualifying bar conservatively for borderline terms.** A borderline term, or a class/table/file name dressed up as an entity, defers to a later run — clear core nouns are seeded, borderline ones wait. The conservatism is about quality, not count; updates to an existing file follow the normal criteria.

**When bootstrapping the file, start with this preamble under the `# Concepts` heading**, then add the qualifying entries below it:

> Shared domain vocabulary for this project — entities, named processes, and status concepts with project-specific meaning. Seeded with core domain vocabulary, then accretes as ce-compound and ce-compound-refresh process learnings; direct edits are fine. Glossary only, not a spec or catch-all.

**Refresh the coherence neighborhood of the area this learning touched.** Inspect that *coherence neighborhood* — defined, with its bounds, in `references/concepts-vocabulary.md` — whether or not this run added, edited, or folded anything. A run that surfaces no qualifying term still leaves its neighborhood correct; that is the pass that keeps violations from accumulating between audits. Within that neighborhood, do three things: fix glossary violations (implementation specifics — file paths, class names, function signatures, current-config values), refresh entries the learning's own evidence shows have drifted, and fold an entry whose whole meaning a neighbor already carries into that neighbor, repointing the terms that cross-reference it. Retiring an entry outright belongs to `ce-compound-refresh`, which investigates; this run folds or leaves standing. Bounds: neighborhood only, never a full-file audit; act only on evidence already in hand; if judging a neighbor would require investigation this learning did not do, flag it for `ce-compound-refresh` rather than editing on a guess. The test: does every entry in the neighborhood still hold a heading a reader needs, and read consistently with this learning's terms? Broader audit is `ce-compound-refresh`'s job.

Report what this run did to `CONCEPTS.md` in the success output. "Vocabulary capture: scanned, no qualifying terms" is correct only when the file is byte-for-byte as the run found it; any change at all reports its counts, whichever step made it. Do not silently skip either one — an unreported `CONCEPTS.md` mutation is exactly what this line exists to prevent, and the visible scan-and-no-result record is the audit signal that the reference was consulted.

**Apply edits silently in every mode — no user prompt in interactive, lightweight, or non-interactive.** Vocabulary capture is a side effect of compounding, not a decision the user makes per run. Lightweight mode reaches this through its own single-pass step in `references/lightweight.md`, and runs an **update-only** version, which that reference defines.

### Phase 2.45: Grounding Validation

The doc (and any `CONCEPTS.md` entries from Phase 2.4) is about to become permanent, trusted knowledge. Validate its claims against the tree before it compounds. **Read `references/grounding-validation.md` now** — it holds the adjudication rules and the validator prompt; the steps below are only the trigger.

1. **Mechanical claims check (every mode, including non-interactive).** Optionally run `git fetch --quiet` first (best-effort — skip silently offline; the network is never a correctness dependency). Then run the bundled validator against the written doc:

   ```bash
   SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
   if [ -f "$SKILL_DIR/scripts/validate-doc-claims.py" ]; then
     PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
     "$PY" "$SKILL_DIR/scripts/validate-doc-claims.py" <doc-path>;
   else
     echo "Bundled validate-doc-claims.py not resolvable on this platform; applying the claims checklist manually.";
   fi
   ```

   Exit 0 means nothing flagged. Exit 1 means flags to **adjudicate, not auto-fix** — each flagged path, SHA, link, or scaffold pattern is fixed, annotated as historical, or confirmed intentional per the reference's adjudication table. A doc may legitimately cite a path deleted by the very fix it documents; a flag is a question, not a failure. If the script cannot be resolved on this platform, apply the reference's manual checklist and say so in the output — never silently skip.

2. **Semantic grounding validator (Full mode, including non-interactive Full; lightweight skips it).** Dispatch one read-only generic subagent built from the prompt template in the reference, covering the written doc plus any `CONCEPTS.md` entries added or edited this run. It verifies code-behavior claims by quoting the defining source line, merge-state claims against remote truth (`gh` primary, git reachability fallback), and internal completeness of countable assertions. Apply its verdicts per the reference (fix contradicted claims from the quoted evidence; soften or drop unverifiable ones; mark offline merge-state checks as degraded), then re-run the mechanical check if the body changed.

## What It Creates

**Organized documentation:**

- File: `<root>/solutions/[category]/[filename].md`

**Categories auto-detected from problem** (default layout — an established directory taxonomy under `<root>/solutions/` wins over this list):

Bug track:
- build-errors/
- test-failures/
- runtime-errors/
- performance-issues/
- database-issues/
- security-issues/
- ui-bugs/
- integration-issues/
- logic-errors/

Knowledge track:
- architecture-patterns/ — architectural or structural patterns (agent/skill/pipeline/workflow shape decisions)
- design-patterns/ — reusable non-architectural design approaches (content generation, interaction patterns, prompt shapes)
- tooling-decisions/ — language, library, or tool choices with durable rationale
- conventions/ — team-agreed way of doing something, captured so it survives turnover
- workflow-issues/
- developer-experience/
- documentation-gaps/
- best-practices/ — fallback only, use when no narrower knowledge-track value applies
