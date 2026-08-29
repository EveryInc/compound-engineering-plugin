# Remove the retired Compound Codex tool map

The Bun-era convert/install path could insert a managed block into
global Codex instructions:

`<!-- BEGIN COMPOUND CODEX TOOL MAP -->` … `<!-- END COMPOUND CODEX TOOL MAP -->`

in `${CODEX_HOME:-$HOME/.codex}/AGENTS.md` and in named
profile copies under `~/.codex/profiles/*/AGENTS.md`.

That Claude-compat map is obsolete — CE skills name Codex tools inline —
and one line incorrectly told Codex to collapse subagent dispatch onto
the main thread. Native plugin install does **not** add this block.

## Safe removal

1. Check `${CODEX_HOME:-$HOME/.codex}/AGENTS.md`. Also check
   `~/.codex/profiles/*/AGENTS.md`.
2. Look for the exact sentinels `<!-- BEGIN COMPOUND CODEX TOOL MAP -->`
   and `<!-- END COMPOUND CODEX TOOL MAP -->`.
3. Only if a BEGIN is followed later by its END, delete the span from
   that BEGIN through that END (inclusive). If END appears first, leave
   the file alone — there is no ordered block to remove. Leave any other
   user content untouched. Do not edit project/repo `AGENTS.md` unless
   those exact sentinels form an ordered pair there.
4. If the file is empty after the removal, delete the file.
5. Show a short before/after of what changed (or say the block was
   already absent). Do not add a replacement tool map.

This file ships with the `ce-setup` skill so marketplace/converted
installs still have the procedure without the repo `docs/` tree.
