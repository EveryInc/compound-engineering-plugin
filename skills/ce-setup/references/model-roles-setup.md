# Model role setup

Loaded from SKILL.md when the invocation asks to set up model roles. Ask with the blocking question tool named in SKILL.md.

**Outcome:** the `model_roles` map in the config file the developer chose holds the entries they asked for, and nothing else in that file changed. The next consumer is the bundled resolver, which every role skill runs at its acting step.

**Done:** the developer has seen each role's value and where it comes from, the resolver reads the written file with no error or warning about an entry this run wrote, and the Phase 3 summary names the file and the roles that changed. A run the developer declined, or one that could not ask, is done when it has said that it wrote nothing.

**Safe failure direction:** write nothing the developer has not seen. A directory outside a git checkout, a resolver that returns no JSON, a candidate map the resolver rejects, and a preview the developer did not approve each end with both config files untouched. When no question can reach the developer, the flow prints what it has and writes nothing.

## Facts the flow needs

**Roles.** The map has eight roles. Each entry names the model that produces one step's deliverable:

| Role | Skill | The entry governs |
|---|---|---|
| `brainstorm` | `ce-brainstorm` | The generated approaches |
| `plan` | `ce-plan` | The authored plan |
| `doc-review` | `ce-doc-review` | Each independent review of the plan |
| `debug` | `ce-debug` | The diagnosis and fix |
| `work` | `ce-work` | The code |
| `simplify` | `ce-simplify-code` | The simplification |
| `code-review` | `ce-code-review` | Each independent review of the diff |
| `compound` | `ce-compound` | The learning document |

**Entries.** An entry is `<model> [<effort>]` or `inherit`, which means the session model. The effort is one of `low | medium | high | xhigh | max`. The two review roles, `doc-review` and `code-review`, take a list, and each item is one seat: an independent reviewer on that model. Every other role takes one entry. On a review role, a scalar `inherit` means no seats, and `inherit` inside a list is one seat on the session model. An entry names a model and an effort only, never a CLI flag, a command, or an app-specific model slug. The resolver owns the grammar, so the flow validates with it and does not judge an entry by eye.

**The two files.** Paths resolve from the repository root (`git rev-parse --show-toplevel`).

- The team file, `.compound-engineering/config.yaml`, is committed. It reaches every worktree, clone, and cloud session, and it applies to teammates.
- The personal file, `.compound-engineering/config.local.yaml`, reaches this checkout only.

The map resolves one role at a time: the personal file's entry wins, then the team file's entry. An entry in either file replaces the older keys for the same step in either file. With no entry, the older keys decide, and then the session model.

**Reachable models.** A model family is offered when the session can show a route to it: the host itself serves the family, or a peer CLI that serves it is installed. The host serves a family when its own tooling shows it, through the model the harness states the session runs on or the model choices its subagent or model-selection tool lists. The agent's belief about the host is not evidence. The resolver names four families, and each has one peer CLI: `claude` (Claude models, the `claude` CLI), `codex` (GPT models, the `codex` CLI), `grok` (Grok models, the `grok` CLI), and `composer` (Composer models, the `cursor-agent` CLI). Check each CLI with `command -v <cli>` and count only the ones found. This shows that a route exists. It does not show that the developer's account may use a given model, so say that once when offering.

Inside an offered family, name only models the session can show. For the Claude family, those are the aliases the resolver recognizes: `fable`, `opus`, `sonnet`, and `haiku`. For any family, they also include each model id the host's own tooling lists. Never invent an id. When a family is reachable but the session can show no id for it, offer the family by name and ask the developer to type the id. `inherit` is always offered.

**The `# unconfirmed` marker.** The developer may type any model. The resolver's `family` for the typed entry decides whether it is confirmed: a family the flow offered is confirmed, and every other family, including `unknown`, is not. An unconfirmed entry is written with `# unconfirmed` as a trailing comment on that entry's line. The resolver ignores the comment, so the entry still applies. When a later run finds that a marked entry in the file it is writing has become confirmed, that run's preview drops the marker and says so.

## Procedure

1. **Show the current state.** Run this skill's resolver:

   ```bash
   SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
   PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
   "$PY" "$SKILL_DIR/scripts/model-role-resolve.py" --all
   ```

   When the command yields no JSON (no interpreter, script not found, non-zero exit), say that the model role map could not be read and stop, because the flow cannot validate what it would write.

   Show all eight roles, each with what it governs, its effective value, and where that value comes from. The role's `effective.from` names the source:

   - `map`: the role's map entry. `source` says which file holds it: `local` is the personal file and `team` is the team file.
   - `existing_key`: an older key governs the step. `existing_keys` names each key, its file, and its value.
   - `session`: nothing is set, so the session model does the work.
   - `invalid`: the `model_roles` block is malformed, and `errors` says why.

   Below the roles, name every key in a role's `shadowed` list as an older key that a map entry already replaces. When the `work` role has `engine_opt_out: true`, say that the personal `work_engine_mode: off` keeps the team's `work` entry off external engines. Show every warning and error the resolver printed, in its own words.

2. **Offer models and take the changes.** Work out the offered families and models from the facts above. Then ask which roles to change. For each role the developer names, take one of three answers: set it to an entry in the form above, clear it, or leave it.

   Clearing removes the role's entry from the chosen file. To take a role back from a team entry without editing the team file, the entry in the personal file is `inherit`. When the developer sets a role that an older key governs today, say that the new entry will replace that key for the step and name the key. The flow leaves older keys in the file.

3. **Ask which file receives the map,** stating the reach of each:

   ```text
   Which file should receive the model role map?
   1. Team file (.compound-engineering/config.yaml): committed, reaches every worktree, clone, and cloud session, and applies to your teammates
   2. Personal file (.compound-engineering/config.local.yaml): reaches this checkout only
   ```

   One run writes one file.

4. **Build the candidate and validate it with the resolver.** The candidate is the chosen file as it is now, with only the roles the developer changed altered. Preserve every unrelated setting and comment in the file exactly as written. Do the same for every role line the developer did not change, apart from a `# unconfirmed` marker this run drops because the entry is now confirmed. Build the block by these rules:

   - When the file has a live, uncommented `model_roles:` key, edit the changed roles' lines inside that block. When the last entry is cleared, remove the `model_roles:` line too, so role skills see no active key.
   - When the file has no live key, append the block at the end. Leave the template's commented `# model_roles:` example as it is.
   - When the personal file does not exist, the candidate is a new file that holds only the `model_roles` block. When the team file does not exist, the candidate is `references/config-template.yaml` with the block appended.
   - Write a changed review role as a block list with one seat per line, so each seat can carry its own marker.

   The resolver takes no file argument. It reads `.compound-engineering/` at the top of the git checkout it runs in, and for each role it reports only the file that wins. To validate without touching the developer's files, create a throwaway checkout (`mktemp -d "${TMPDIR:-/tmp}/ce-setup-models-XXXXXX"`, then `git init -q` inside it). Run the resolver command from step 1 twice with that directory as the working directory:

   - **The candidate alone.** Write only the candidate into the throwaway checkout's `.compound-engineering/` directory, under its real file name. This run validates every entry in the chosen file and gives each one's `family`. An error, an `invalid` seat, or a warning that names an entry the developer changed means the candidate is not valid: show the resolver's message and take a corrected entry. Each set entry's `family` decides its `# unconfirmed` marker.
   - **Both files.** Add a copy of the other config file beside the candidate and run again. This run shows how each role resolves after the write. For every role the developer changed, compare it with what they asked for. When the role's value would come from somewhere other than the chosen file's entry, say where it would come from before asking for approval. A personal entry that shadows a team write is one such result. Another is a cleared role that the other file or an older key then governs.

5. **Ask once, showing everything.** Preview the file the map goes to and whether the write creates it, the complete resulting `model_roles` block with its markers, where the block sits in the file, and the notes from step 4. Then ask:

   ```text
   Write this model role map to <file>?
   1. Yes, write it
   2. No thanks
   ```

   Write only on approval. When the caller declared the run non-interactive, or no question can reach the user, print the current state and the preview the invocation's own words allow, say the flow wrote nothing, and stop.

6. **Write, then verify.** Apply the candidate to the chosen file. When the write created `config.local.yaml`, apply Step 7 of `references/repo-fixes.md` to it next. That step owns the gitignore check and its offer.

   Run the bundled `scripts/check-health` exactly as SKILL.md Step 2 does, with the same `SKILL_DIR` anchor, and run the resolver command from step 1 again in the real checkout. Show any project issue the health check reports. The flow is not done while the resolver reports an error or a warning about an entry this run wrote: fix the cause under a new preview and check again.

7. **Report.** Show the developer the roles as they now resolve. Tell them in one sentence that each governed step prints a `Model role` line naming the requested model, the served model, and the route, which is where an entry that could not be served shows up. Report the file and the changed roles under Fixed in the Phase 3 summary, or under Skipped when the developer declined.
