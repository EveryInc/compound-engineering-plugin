# Remove the retired Compound Codex tool map

The Bun-era `convert` / `install --to codex` path inserted a managed block into the global Codex instructions file:

`<!-- BEGIN COMPOUND CODEX TOOL MAP -->` … `<!-- END COMPOUND CODEX TOOL MAP -->`

in `${CODEX_HOME:-$HOME/.codex}/AGENTS.md`. That Claude-compat map is obsolete — CE skills name Codex tools inline — and one of its lines told Codex to collapse subagent dispatch onto the main thread. Native plugin install does not add it, and re-running the Bun CLI for Codex strips it.

## Removal

Delete the managed block from that file: the line `<!-- BEGIN COMPOUND CODEX TOOL MAP -->` through the next line `<!-- END COMPOUND CODEX TOOL MAP -->`. If that pair is not present as two whole lines in that order, the block is not there — change nothing.

Leave the rest of the file untouched, and delete the file if nothing is left. Do not add a replacement map, and do not touch a project or repo `AGENTS.md`: the Bun installer only ever wrote the Codex home file.

Show the user a short before/after of what changed, or say the block was already absent.
