# Per-Action Flows

Read this reference when executing Phase 4. Find the section matching the action classified in Phase 2 and confirmed in Phase 3 (Keep, Update, Consolidate, Replace, or Delete) and follow that flow.

## Keep Flow

No file edit by default. Summarize why the learning remains trustworthy.

## Update Flow

Apply in-place edits only when the solution is still substantively correct.

Examples of valid in-place updates:

- Rename `app/models/auth_token.rb` reference to `app/models/session_token.rb`
- Update `module: AuthToken` to `module: SessionToken`
- Fix outdated links to related docs
- Refresh implementation notes after a directory move

Examples that should **not** be in-place updates:

- Fixing a typo with no effect on understanding
- Rewording prose for style alone
- Small cleanup that does not materially improve accuracy or usability
- The old fix is now an anti-pattern
- The system architecture changed enough that the old guidance is misleading
- The troubleshooting path is materially different

Those cases require **Replace**, not Update.

## Consolidate Flow

The orchestrator handles consolidation directly (no subagent needed — the docs are already read and the merge is a focused edit). Process Consolidate candidates by topic cluster. For each cluster identified in Phase 1.75:

1. **Confirm the canonical doc** — the broader, more current, more accurate doc in the cluster.
2. **Extract unique content** from the subsumed doc(s) — anything the canonical doc does not already cover. This might be specific edge cases, additional prevention rules, or alternative debugging approaches.
3. **Merge unique content** into the canonical doc in a natural location. Do not just append — integrate it where it logically belongs. If the unique content is small (a bullet point, a sentence), inline it. If it is a substantial sub-topic, add it as a clearly labeled section.
4. **Update cross-references** — if any other docs reference the subsumed doc, update those references to point to the canonical doc.
5. **Delete the subsumed doc.** Do not archive it, do not add redirect metadata — just delete the file. Git history preserves it.

If a doc cluster has 3+ overlapping docs, process pairwise: consolidate the two most overlapping docs first, then evaluate whether the merged result should be consolidated with the next doc.

After the merge, run the mechanical claims check on the canonical doc (step 4 of the Replace flow below) — merged content brings its citations with it, and consolidation is where cross-references most often dangle.

**Structural edits beyond merge:** Consolidate also covers the reverse case. If one doc has grown unwieldy and covers multiple distinct problems that would benefit from separate retrieval, it is valid to recommend splitting it. Only do this when the sub-topics are genuinely independent and a maintainer might search for one without needing the other.

## Replace Flow

Process Replace candidates **one at a time, sequentially**. Each replacement is written by a subagent to protect the main context window.

When a replacement is needed, read the documentation contract files and pass their contents into the replacement subagent's task prompt:

- `references/schema.yaml` — frontmatter fields and enum values
- `references/yaml-schema.md` — category mapping
- `assets/resolution-template.md` — section structure

Do not let replacement subagents invent frontmatter fields, enum values, or section order from memory.

**When evidence is sufficient:**

1. Spawn a single subagent to write the replacement learning. Pass it:
   - The old learning's full content
   - A summary of the investigation evidence (what changed, what the current code does, why the old guidance is misleading)
   - The target path and category (same category as the old learning unless the category itself changed)
   - The relevant contents of the three support files listed above
2. The subagent writes the new learning using the support files as the source of truth: `references/schema.yaml` for frontmatter fields and enum values, `references/yaml-schema.md` for category mapping and YAML-safety rules for array items, and `assets/resolution-template.md` for section order. It should use dedicated file search and read tools if it needs additional context beyond what was passed.
3. **Validate parser-safety of the new learning's frontmatter** to catch silent-corruption issues the prose rules miss: malformed `---` delimiter lines, unquoted ` #` in scalar values (silent comment truncation), and unquoted `: ` in scalar values (silent mapping confusion). The bundled validator ships **inside the skill bundle**; on Claude Code `${CLAUDE_SKILL_DIR}` resolves to the skill directory, but the runtime Bash tool's CWD is the user's project, so a project-relative path (without the `${CLAUDE_SKILL_DIR}` prefix) would miss. Run it through an existence guard so platforms that cannot locate the script (e.g. native Codex/Gemini installs, where `${CLAUDE_SKILL_DIR}` is unset) fall back to a manual check instead of silently skipping the protection:

   ```bash
   if [ -n "${CLAUDE_SKILL_DIR}" ] && [ -f "${CLAUDE_SKILL_DIR}/scripts/validate-frontmatter.py" ]; then
     python3 "${CLAUDE_SKILL_DIR}/scripts/validate-frontmatter.py" <new-learning-path>;
   else
     echo "Bundled validate-frontmatter.py not resolvable on this platform; applying the parser-safety checklist manually.";
   fi
   ```

   - **If the script ran:** exit 0 means parser-safe; exit 1 means stderr names the offending field(s) — quote the value(s), re-write the doc, and re-run until exit 0. Do not declare success while validation fails.
   - **If the script did not run** (else branch): apply the validator's checks by hand, matching its exact scope — checking more broadly risks edits the validator would not require. Fix any violation by quoting the whole value before continuing:
     1. The opening and closing frontmatter delimiters are each a line whose content is `---` (trailing whitespace is fine; `----` or `---extra` is not a valid delimiter).
     2. For each **top-level** mapping entry (`key: value`, no leading indentation) whose value is **not already quoted or structured** (does not start with `"`, `'`, `[`, `{`, `|`, or `>`): the value must contain no unquoted ` #` (space-then-hash — YAML treats it as a comment and silently truncates) and no unquoted `: ` (colon-then-space — strict YAML may read it as a nested mapping). Quote the whole value if either appears.
     Nested values, array items, and already-quoted values are out of scope here (array-item quoting is handled by the schema/YAML-safety step above). Then note in the completion output that the bundled script validator was unavailable on this platform and the checks were applied manually.

   The validator does not enforce schema rules and does not flag YAML reserved-indicator characters (those produce loud parser errors downstream rather than silent corruption — out of scope). Uses Python 3 stdlib only (no PyYAML or other deps).
4. **Run the mechanical claims check on the successor doc.** The bundled `scripts/validate-doc-claims.py` flags cited repo paths missing from the tree, commit SHAs that do not resolve or are unreachable, relative doc links that do not resolve, and dangling drafting scaffold ("Learning 3", unresolved `{{...}}` tokens):

   ```bash
   SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
   python3 "$SKILL_DIR/scripts/validate-doc-claims.py" <new-learning-path>
   ```

   Exit 1 flags are **adjudication input, not failures** — a successor doc describing removed code legitimately cites paths that no longer exist. Resolve each flag by fixing the citation, annotating it as historical, or confirming it intentional; always fix scaffold flags. If the script is not resolvable on this platform, scan the body for those same patterns manually and say so in the report.
5. After the subagent completes, the orchestrator deletes the old learning file. The new learning's frontmatter may include `supersedes: [old learning filename]` for traceability, but this is optional — the git history and commit message provide the same information.

**When evidence is insufficient:**

1. Mark the learning as stale in place:
   - Add to frontmatter: `status: stale`, `stale_reason: [what you found]`, `stale_date: YYYY-MM-DD`
2. Report what evidence was found and what is missing
3. Recommend the user run `ce-compound` after their next encounter with that area

## Delete Flow

Delete only when a learning is clearly obsolete, redundant (with no unique content to merge), or its problem domain is gone. Do not delete a document just because it is old — age alone is not a signal.

Before unlinking the file, run a final inbound-link check across the repo's markdown content to catch any references missed during Phase 1 investigation. Prefer the platform's native content-search tool (e.g., Grep in Claude Code) for efficiency; use ranged or context-line reads around matches rather than loading whole files.

Each match is a citation that will dangle after delete. Cleanup is mechanical — Phase 2 already classified the citations and confirmed Delete was right. Don't re-litigate.

If any citation surfaces here that wasn't seen in Phase 1 and is anything other than unambiguously decorative (substantive or mixed/unclear), stop and reclassify: autofix mode stale-marks; interactive mode asks the user whether Replace fits. Only proceed with cleanup when all late-discovered citations are unambiguously decorative.
