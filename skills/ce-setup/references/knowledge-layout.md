# Knowledge Layout

**Outcome:** the folder's `.compound-engineering/config.yaml` carries a `knowledge:` block that answers "where does a `<type>` note go?" as data, and the user has seen -- not suffered -- every move the folder would need to match it.

**Done:** the block validates, the dry-run report is shown, and no file was moved or created without the user's approval. **Safe failure:** report only; an unusable layout is refused rather than approximated.

`ce-setup` owns the canonical statement of the layout rule every consuming skill duplicates (`ce-capture`, `ce-dream`, `ce-experiment`, `ce-compound`):

<!-- ce-knowledge-layout:start -->
**Resolve the knowledge layout before filing, moving, or promoting any knowledge artifact.**

- **Read** the `knowledge:` block from `<repo-root>/.compound-engineering/config.yaml` only (`<repo-root>` = `git rev-parse --show-toplevel`); `config.local.yaml` never supplies it. Absent -> no layout: do not guess a folder. Say the layout is unset and that `ce-setup` (its `knowledge` argument) writes it, then stop the filing step.
- **Validate** a present block: `layout` names the template it was expanded from; `roles` is a mapping whose keys come from `inbox, sources, ideas, themes, projects, notes, learnings, writing, memory, scratch, archive, templates` and that sets at least `inbox`, `learnings`, and `memory`; every role `path` is a relative path that stays under `root` (default `.`); `git.mode` is one of `none | commit | commit+push`; `index` is `none`. Anything else -> stop with an error naming the key and the value; never fall back to a default folder.
- **Use** the block as the sole answer to "where does this go": a role's `path` (joined under `root`, placeholders such as `{id:03d}` and `{slug}` filled) and its `filename` pattern decide the location; the role's `types`, `frontmatter.required`, and `frontmatter.type_enum` decide the frontmatter, and no key outside the contract is invented. A role the block leaves unset means "do not create it, do not file there". A role with `retention: discard` or `tracked: false` is never committed. Unattended runs write, move, or commit files only under `git.allow` paths and only when `git.mode` is not `none`; everything else is a proposal for a person to apply.
<!-- ce-knowledge-layout:end -->

## Templates are data

Built-in templates live in `references/layouts/<name>.yaml` in this skill's directory: `none` (inbox + learnings only), `kieran` (the frontier-experiments folder), `katie`, `nityesh`, `para`, `johnny-decimal`. A folder may also name a custom template file by path. Each template carries the same keys the expanded block carries -- `id_scheme`, `roles` (path, filename pattern, `types`, `retention`, `tracked` per role), `frontmatter` (required keys, `type_enum`, provenance and source keys), `promotion` (allowed role -> role moves, `pack-rule` as a terminal target), `retention`, `git` (`mode` + `allow` list), and `index` (reserved; `none` is the only value this release accepts) -- plus `name`, `description`, and an optional `docs_root` hint saying where CE artifacts land relative to the roles.

`ce-setup` expands the chosen template **into** the block rather than pointing at it: consuming skills read one file, the folder's layout does not drift when the plugin's template changes, and a per-role override is an ordinary edit to the expanded block. `layout:` keeps the template name for provenance.

## Bundled helper

Every deterministic step below runs through the bundled script; the agent decides, the script computes. Set `SKILL_DIR` to the absolute directory this `ce-setup` SKILL.md was loaded from, and pick a Python 3 interpreter the same way every CE bundled script does:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-setup SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/knowledge-layout.py" <subcommand> ...
```

| Subcommand | Answers | Line 1 -> payload |
|---|---|---|
| `expand --layout <name\|path> [--root <dir>] [--recurring capture=daily,dream=weekly] [--write <config.yaml>]` | the expanded block for a template | `OK` -> the YAML block (and a `docs_root` hint comment when the template carries one); `INVALID` -> JSON `errors` |
| `validate --config <config.yaml>` | is the folder's block usable | `OK` -> summary; `UNSET`; `NO-CONFIG`; `INVALID` -> JSON `errors` |
| `resolve --config <config.yaml> --role <role>` or `--type <type>` | where a role or a frontmatter `type` files | `OK` -> `{role, path, filename, types, retention, tracked}`; `UNSET-ROLE`; `AMBIGUOUS` (several non-inbox roles claim the type) |
| `audit --config <config.yaml> [--folder <dir>] [--today <ISO date>]` | the dry run | `OK` -> `{missing_dirs, unfiled, stale_inbox}`; `unfiled` entries carry `file`, `type`, `expected_role`, `expected_path` |

`--write` is the only subcommand that touches the config file; it replaces an existing `knowledge:` block or appends one, and leaves every other key byte-identical. Without a working interpreter, stop and say so: this flow has no inline equivalent because the dry run is the safety property.

## Interview

Ask with the blocking question tool as the Interaction Method in `SKILL.md` describes. Ask only what the folder does not already answer:

- **Which template.** Propose one when evidence supports it -- `docs_root: learnings` plus `experiments/NNN-*` folders means `kieran`; a folder with only loose notes means `none` -- and let the user confirm or pick another. Offer a custom template path as the last option. Read the candidate's `description` from its template file when presenting choices.
- **Root.** Default `.`; ask only when the knowledge folder is a subdirectory of the repo.
- **Write authority.** Read the template's `git` values aloud (`mode` and `allow`); the user may narrow them. Never widen `allow` beyond what the template ships without the user naming each path.
- **Recurring cadence.** Ask for `capture` and `dream` cadences only if the user wants them recorded; the block's `recurring` map is documentation for the harness scheduler, nothing reads it to act.

## Write and dry run

Show the `expand` output before writing. Write only after approval, with `expand ... --write`. Run `validate` on the written file and report the result. When the template carries a `docs_root` hint that differs from the folder's current `docs_root`, say so and offer that change separately; `docs_root` follows its own rule and is never changed silently.

Run `audit` and present its three lists as proposals: directories the layout expects that do not exist, files whose frontmatter `type` belongs to a different role than the folder they sit in (with the expected path), and inbox items older than `retention.inbox_flag_after_days`. Apply a proposal only when the user approves it, one list at a time. An `AMBIGUOUS` or typeless file is listed for the user, not moved. Files under a `tracked: false` or `retention: discard` role are ignored entirely.

## Report

Feed Phase 3 with: the template chosen and the roles it set, `git.mode` and `allow`, whether `docs_root` was changed, the count of proposals applied versus left for the user, and the invocation to re-run. When the layout is left unset or invalid, say which of the two and what the user must decide; do not offer a partial block.
