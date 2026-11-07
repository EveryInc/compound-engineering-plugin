# Refresh repo config files

Read this from Step 5a of `references/repo-fixes.md`. It applies when the health report says `config.yaml` was written from an older template, a config file still sets a retired setting, or `config.local.yaml` is a full copy of the old local template.

**Outcome:** each flagged file follows the current template's layout and guidance. Every setting that still does something keeps its exact value, and every change carries a one-line reason a user can read.

The person running setup usually cannot judge what an upstream template change means for their file. So make every reconciliation decision yourself, and ask one question per file, not one per setting.

**Safe direction:** if the script refuses the file, verification reports a difference, or no Python interpreter runs, leave the file untouched. Say in the summary what happened and what would let the refresh run.

## The script

`scripts/config-refresh.py` does every step that has one right answer: classifying settings, drafting the rebuilt file, ranking typo candidates, and checking the result against the original on disk. Run each command as its own shell call:

```bash
SKILL_DIR="<absolute path of the directory containing the ce-setup SKILL.md>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/config-refresh.py" draft --layer tracked
```

- `draft --layer tracked|local [--changes FILE]` writes a rebuilt copy to a temp directory and prints JSON. The JSON includes the draft and changes paths, the changes it recorded, each retired and unrecognized setting, the team comments it could not tie to a setting, the verification result, and a diff. `action: none` means the file is already current.
- `verify --layer L --draft D --changes C` re-reads both files and names the first difference the changes do not explain.
- `apply --layer L --draft D --changes C` verifies again, then replaces the file.

The draft already removes each retired setting the registry marks `remove`, with the registry's reason. Do not edit the draft by hand. Write your decisions to a changes file and run `draft` again with `--changes`; only changes recorded there pass verification.

## Your decisions

The changes file is `{"changes": [...]}`. Every entry needs a `reason`, written for the user:

- `{"type": "remove", "key": K}` drops a retired setting.
- `{"type": "migrate", "key": K, "value": V}` writes a retired setting's value to its registry target.
- `{"type": "rename", "from": K, "to": T}` renames an unrecognized setting to one of its typo candidates.
- `{"type": "comment-remove", "line": TEXT}` drops one team comment.
- `{"type": "comment-move", "line": TEXT, "key": K}` places one team comment above setting K.

Decide each one this way:

- **A retired setting with a migration.** A migration never overrides a setting that is already active and would win. When the draft reports `target_winning`, record `remove`, and give a reason that names the setting that superseded it. Otherwise record `migrate` with the value the registry maps to. Word the reason as the behavior change the team gets, not as a rename.
- **An unrecognized setting.** Rename it only when it is plainly a typo of its top candidate, with the same kind of value. Otherwise leave it. The draft keeps it in a marked section at the end of the file, and the summary names it. Never remove one; it may come from a newer plugin or a teammate.
- **A team comment the draft could not place.** It also lands in the marked section. Move it above the setting it describes. Remove it only when it is plainly about a setting this refresh removed. When unsure, leave it where it is.
- **A current setting's value never changes**, including `docs_root` and invalid values. Steps 6a and 6b repair those afterwards, on the refreshed file.

## Approving and writing

`config.yaml` is rebuilt on the current template. `config.local.yaml` loses retired settings and gets migrations. A full copy of the old local template is cut down to the settings and team comments it holds. Values never move between the two files.

In an interactive run, show the list of changes with their reasons, and offer the diff. Then ask one yes or no question for each file. On yes, run `apply` with the draft and changes paths the last `draft` printed. On no, write nothing. Re-run the health check afterwards. A refreshed file reports as current, and running setup again drafts nothing.
