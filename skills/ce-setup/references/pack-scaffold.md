# Pack scaffold

Loaded from SKILL.md when the invocation names a pack to add, create, or scaffold. Ask with the blocking question tool named in SKILL.md.

**Outcome:** a Compound Pack the resolver publishes on the next planning or review run: a directory holding a `README.md` that says what the pack governs, one first rule at the top level, and a `packs:` entry in `.compound-engineering/config.yaml` that points at it. The next consumer is the bundled health check, which lists the pack as `pack <id>`.

**Done:** the health check reports `pack <id>` with no `Pack config error` or `publishes no packs` line about it, and the author has heard the layout rule and where the guide states it.

**Safe failure direction:** write nothing rather than write into a directory or a config file the user has not seen. A target directory that exists and is not empty, a source the config already declares, or a run that cannot ask the user each stop the scaffold with a report of what it would have written.

## Facts the scaffold needs

- The pack id is kebab-case ASCII (`a-z`, `0-9`, `-`): the resolver names a pack after its directory, and the id appears in citations as `(pack: <id>, <file>)`. Take it from the `pack:<id>` token, otherwise from the words of the request; ask when neither yields one.
- The default target is `compound-packs/<id>/` relative to the repository root (`git rev-parse --show-toplevel`). When the user names another repo-relative directory, the config entry points there instead.
- A rule is discovered only when it is a top-level `.md` with `title` and `applies_when` frontmatter; the pack's `README.md` is its description and never a rule; subdirectories and non-`.md` files are storage. The scaffold exists so a first pack starts in this shape.
- A live pack entry in `config.yaml` is `- source: compound-packs/<id>` under a top-level, uncommented `packs:` key. The bundled template ships that key as a comment, which is not a live key.

## Procedure

1. **Resolve the target.** Compute the id and the directory. Stop, saying why, when the directory exists and is not empty or when `config.yaml` already declares this source. An empty existing directory is fine.

2. **Draft the two files.** `README.md` at the pack's top level: no frontmatter, one line saying what the pack governs, drawn from what the user said, or asked for when they said nothing. The first rule comes from `assets/pack-rule-template.md` in this skill's directory, saved as `<kebab-case of the title>.md` beside the README. When the user described the first rule, fill `title`, `applies_when`, `tags`, and the body from that description; otherwise keep the template's placeholders, which still publish the pack and show the author what to replace. Keep the template's layout-reminder paragraph; it tells the author to delete it.

3. **Draft the config change.** When `.compound-engineering/config.yaml` is missing, create it from `references/config-template.yaml` under the same approval. Append `  - source: compound-packs/<id>` (or the directory the user chose) as the last item of the live `packs:` list, matching its indentation; when there is no live key, append this block at the end of the file:

   ```yaml
   packs:
     - source: compound-packs/<id>
   ```

   Leave the template's commented `# packs:` example and every other line exactly as they are. `config.local.yaml` is not the target; a pack the team shares belongs in the tracked file.

4. **Ask once, showing everything.** Preview the directory, both files in full, and the exact config lines with their placement, then ask:

   ```text
   Create the Compound Pack `<id>`?
   1. Yes, write these files and the config entry
   2. No thanks
   ```

   Write only on approval. When the caller declared the run non-interactive, or no question can reach the user, print the same preview, say the scaffold wrote nothing, and stop.

5. **Verify with the health check.** Run the bundled `scripts/check-health` exactly as SKILL.md Step 2 does, with the same `SKILL_DIR` anchor, and report its `pack <id>` line. A `Pack config error` or `publishes no packs` line about this pack means the scaffold is not done: fix the cause and run the check again.

6. **Tell the author.** In one sentence: a rule is discovered only when it is a top-level `.md` with `title` and `applies_when`; everything else in the pack folder is storage, and `README.md` is the description. Point at `https://everyinc.github.io/compound-engineering-plugin/guides/packs/`, "Pack layout", for the annotated tree. Report the pack under Fixed, or under Skipped when the user declined, in the Phase 3 summary.
