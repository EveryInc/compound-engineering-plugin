# Sessions and window

**Result:** the set of this repo's sessions this run will mine, the window and why, the ledger location, and a coverage record per harness. The next step mines exactly this set.

## Repo, ledger, and earlier runs

Run the bundled state helper for the repo's directories, the ledger location, and earlier decisions. It is the only writer of the ledger, so never edit ledger files by hand.

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/retro-state.py" roots
```

Run `store` and `read` the same way, each in its own call. `"$PY" "$SKILL_DIR/scripts/retro-state.py" --help` lists every subcommand, its flags, and its exit statuses.

- `roots` names the git common directory, the main checkout, and every worktree. "This repo" means all of them, not only the directory you were started in. Outside a git repository, say so and stop: the ledger and the current-tree check both need git.
- `store` resolves the ledger directory, shared by every worktree. When it reports `.context/compound-engineering/` is not gitignored at the main checkout, offer to add that line to the main checkout's `.gitignore` before any write. When the user declines, the ledger still lives there, but backups of files outside the repo go to this run's scratch directory instead, and the report names that location. When `store` reports the ledger cannot be written, as in a sandbox limited to the current worktree, finish as the no-user branch does and tell the user to rerun from the main checkout or with write access to it.
- `read` returns the latest decision per item and the per-harness cutoff from earlier runs.

Create this run's scratch directory for extraction output. Never write transcript extracts into the repo.

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") 2>/dev/null && [ ! -L "$SCRATCH_ROOT" ] && [ -O "$SCRATCH_ROOT" ] && [ -w "$SCRATCH_ROOT" ] || SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
RUN_DIR="$SCRATCH_ROOT/ce-retro/$(date +%Y%m%d)-$(openssl rand -hex 3)";
(umask 077; mkdir -p "$RUN_DIR") || exit 1; chmod 700 "$RUN_DIR" || exit 1;
echo "$RUN_DIR";
```

## Discover sessions

Use the bundled session-history scripts. Pass every root from `roots` as its own `--cwd` to discovery and its own `--cwd-filter` to metadata extraction, include subagent transcripts, and drop sessions started only from a parent folder unless their content names a path inside the repo:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
bash "$SKILL_DIR/scripts/session-history/discover-sessions.sh" "<repo-name>" "<days>" --include-subagents --cwd "<root-1>" --cwd "<root-2>" | tr '\n' '\0' | xargs -0 "$PY" "$SKILL_DIR/scripts/session-history/extract-metadata.py" --no-ancestor --cwd-filter "<root-1>" --cwd-filter "<root-2>"
```

The output is JSONL: one object per kept session, then a `_meta` line per batch. `xargs` may split the file list, so sum `files_processed` across `_meta` lines. Optional fields are omitted, not null. A subagent session carries `parent_session`. Fold it into its parent when you count evidence, so one session with twelve subagents counts as one session, and list subagents separately in coverage.

Record a status for every harness: **searched** (found N), **present but not read** (a store exists that the scripts do not read, such as Codex archived sessions), or **absent**. A thin window must not read as a clean one.

Leave out sessions that are themselves skill evaluations or synthetic runs, such as a prompt that begins by pointing at a skill file to test. They show friction that no real user hit.

## Choose the window

**Goal:** evidence that describes the repo as it is now.

- Start with about 14 days, or the window the user gave.
- New candidates come only from sessions after each harness's cutoff in the ledger. A harness with no cutoff has none.
- When the window holds too little evidence to rank anything, extend it. Stop extending at a restructure that moved the paths a candidate would depend on, because older friction may point at code that no longer exists.
- Grading earlier accepted changes may read further back than the window.

When the user named a focus, keep only sessions where that skill or topic actually ran. A skill's name merely listed in a session's available-skills context does not count. When the focus matches no session, say so and stop. Never widen silently.

## The current session

Include the current session up to the moment this skill was invoked, and never this skill's own turns. Identify it by the harness session id when the harness exposes one. Otherwise take the newest session file still being written whose recorded directory equals the directory this run started in. When more than one qualifies, include none of them and say so in coverage.

## Large windows

Read metadata for every session. Extract skeletons and errors only for the sessions that rank highest by size, branch match, and signs of friction, into the run's scratch directory:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/session-history/extract-skeleton.py" --output "$RUN_DIR/<session-id>.skeleton.txt" < "<session-file>"
```

Run `extract-errors.py` the same way with an `.errors.txt` output. Cursor transcripts do not log tool results, so they yield no errors. Name every session skipped for size or budget in coverage.
