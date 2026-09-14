# ce-dream run: state script and report

## State script

Every read or write of `<memory>/state.yml` goes through the bundled script. Set `SKILL_DIR` to the absolute directory this `ce-dream` SKILL.md was loaded from and pick an interpreter the same way every CE bundled script does:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-dream SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/dream-state.py" <subcommand> --state <memory>/state.yml ...
```

Line 1 of stdout is always a status word; a JSON payload may follow on line 2. Without a working interpreter the run ends `Dream aborted: no Python 3 interpreter`; there is no inline equivalent, because the lease and fingerprint are the safety properties.

| Subcommand | Use | Statuses |
|---|---|---|
| `lease-acquire --writer <id> [--ttl-minutes N]` | first call of the run; `<id>` is `<harness>-<host>-<pid or session>` | `OK`, `STALE-RECLAIMED` (note it), `LOCKED` (abort), `CORRUPT` (abort; name the file) |
| `changed --root <root> --paths <inbox> <sources> <notes> <learnings> --exclude <memory> <scratch and untracked role paths>` | decide whether there is work; pass only roles the layout sets | `NO-STATE` / `CHANGED` (run), `UNCHANGED` (skip) |
| `fingerprint --root ... --paths ... --exclude ...` | the value to record after the pass, computed **after** any applied moves | `OK` -> `{fingerprint}` |
| `run-record --writer <id> --outcome completed\|partial\|aborted-locked\|failed\|no-change --timestamp <ISO> --fingerprint <hex> [--report <path>] [--counts <json>]` | every exit path | `OK` |
| `lease-release --writer <id>` | last call of the run | `OK`, `LEASE-LOST` (report it; do not retry) |
| `read` | inspect | `OK` -> the state, `NO-STATE`, `CORRUPT` |

`--counts` is a JSON object of what the run did: `moved`, `proposed`, `merged`, `promoted`, `flagged`, `conflicts`, `candidates`.

A `no-change` record keeps the previous completed fingerprint meaningful: pass the fingerprint `changed` returned.

## Report

Path: `<memory>/dreams/<date>.md`, with `<date>` the run's ISO date; a second run on the same day that finds changes appends a `## Run <time>` section rather than a second file. Frontmatter carries the layout's `frontmatter.required` keys (with `type` from `type_enum` when it lists a fitting value such as `note`; otherwise the first value the layout owner uses for memory files, stated in the report body), plus provenance under the layout's `frontmatter.provenance` key.

Body sections, each present even when empty (write "none"):

1. **Run** -- writer, lease result, fingerprint before and after, cap hit or not, `git.mode` and the `allow` list in force.
2. **Applied** -- every file moved, merged, or written, with old and new path; the commit id when committed. Empty under `git.mode: none`.
3. **Proposals** -- every move the run would make but may not, one line each: `<action> <from> -> <to> (<reason>)`, ordered inbox triage, merges, promotions.
4. **Conflicts** -- one entry per conflict: both paths, a one-sentence quote or paraphrase of each side, the more recent evidence, and what a person must decide. Nothing here was changed.
5. **Stale** -- learnings whose support drifted, with the drift and whether `ce-compound-refresh` was invoked.
6. **Pack-rule candidates** -- for each: the learning path, its cited evidence, the held-out case checked and the result, and the proposed narrowest `applies_when`. Candidates only; none written anywhere else.
7. **Flagged inbox** -- items older than `retention.inbox_flag_after_days`.

End the turn on the terminal line SKILL.md names, after `run-record` and `lease-release` have both returned.

## Scheduling

Recurring runs are the harness's job: Claude Code scheduled tasks, Codex automations, Cursor automations, a Hermes cron entry, or any cron that opens the folder and invokes `ce-dream` with `mode:non-interactive`. Use the cadence the layout's `recurring.dream` key documents when it is set; nothing in the plugin reads that key to act. Two overlapping schedules are safe: the second sees `LOCKED` and records `aborted-locked`.
