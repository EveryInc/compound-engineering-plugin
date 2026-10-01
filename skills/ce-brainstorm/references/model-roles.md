# Model roles

A repo's CE config can carry a `model_roles:` map. Each entry names the model, and optionally the reasoning effort, that should produce one step's deliverable. This file states how a skill honors the entry for its role. The calling skill's hook names the role, the deliverable, and the peer route, when the skill has one.

**Outcome:** the deliverable is produced by the model and effort the entry names, or by the nearest option this file allows, and the skill's output says which model served it and by which route.

**When this applies.** The hook loads this file only when a repo CE config file carries an active `model_roles:` key. When the role has no entry, the skill behaves exactly as it does without this file.

A *single-model role* has one entry. A *review role* has a list of seats, and the calling skill's own reference states the seat rules. This file points to them where they replace a rule below.

## Resolve the role

Run this skill's resolver in one command:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/model-role-resolve.py" --role <role>
```

Add `--host-family <family>` only when the calling skill already attests the session's model family. The command prints one JSON object, and its `state` decides what the skill does:

| `state` | What the calling skill does |
|---|---|
| `unset` | The role has no entry. Continue as the skill does today, with its existing keys. |
| `inherit` | The session model does the work. The skill's existing keys for this step are not consulted. |
| `entries` | Use the entry: its `model`, and its `effort` unless that is null. A single-model role has exactly one. |
| `invalid` | The `model_roles` block is malformed. A single-model role continues as it does today and says why, quoting `errors`. |

When the command yields no JSON (no interpreter, script not found, non-zero exit), a single-model role continues as it does today and says once that the model role map could not be read. It never stops the run for that.

A review role does not use the `invalid` row or the no-JSON rule. The calling skill's seat rules decide both.

## Precedence

The first source that exists decides the model for the step:

1. A live instruction about this step in the current run.
2. A carrier the caller passed for this step.
3. The role's map entry.
4. The skill's existing key for this step.
5. The session model.

The calling skill's existing rules decide what counts as a live instruction or a carrier. Either one replaces the entry whole, including its effort, and the skill then handles it as it does with no map. A map entry in either config file outranks an existing key in either file.

## What the entry governs

The entry governs the step's deliverable, which the calling skill's hook names. It does not change the dialogue with the user, the orchestration inside the skill, or the scouts and verifiers the skill already dispatches at their Model tier.

## When a hand-off happens

A hand-off gives the deliverable's work to another model run and takes the result back. Two cases run with no hand-off:

- The state is `inherit`.
- The entry has no effort and names the model the session can attest it is already running on. The session attests its model from what its harness states, never from a guess.

Every other entry hands off. An entry with an effort always hands off, because no host exposes the session's own effort, so the session cannot show that it already runs at that effort.

## Serving order

A hand-off uses the first route that can serve the entry's model at the entry's effort:

1. **A native subagent**, when the host's subagent primitive can be handed that model at that effort. Attempting the dispatch proves this. The agent's belief about the host does not. Where the subagent tool lists model ids that encode effort, match the entry against that list, and treat no match as proof that the host cannot serve the entry natively. Never guess an id. A subagent tool with no way to set effort cannot serve an entry that has an effort.
2. **The peer route the calling skill names**, when the skill has one and that route can serve both the model and the effort.
3. **The fallback ladder** below.

## Fallback for a single-model role

When no route can serve the entry as written, the step takes the first of these that a route can serve:

1. The same model at the nearest lower effort the route accepts.
2. The same model with the effort not applied, on a route that has no effort control. A native subagent on a host that cannot set effort is such a route.
3. The route's own default model, where the route has one.
4. The session model.

The resolver's `effort_scale` gives the order of efforts, lowest first: `low`, `medium`, `high`, `xhigh`, `max`. The route's adapter says which levels the route accepts. The agent does not guess them.

This ladder serves map entries only. The skill's existing keys keep the failure rules they have today. A review seat never uses the ladder: the calling skill's seat rules decide what happens to a seat that cannot be served.

## The `Model role` line

Print one line for every step an entry governs, which means every step whose role resolved to `inherit` or `entries`. Put it in the output the skill already produces. Print nothing about model roles when no active `model_roles:` key exists.

```text
Model role <role>: requested <model>[ <effort>]; <outcome>; route <route>[; reason: <why>].
```

- A review seat's line starts `Model role <role> seat <n>:`.
- `<outcome>` is `served <model>` followed by ` at <effort>` or `, effort not applied` when the entry has an effort. It is `not run` when nothing ran, and then the line has no route.
- `<route>` is `native subagent`, `<name> CLI`, or `session`.
- `reason:` appears only after a fallback, a dropped or blocked seat, or an invalid entry.

Name the served model as served only when the route's receipt confirms it. Without a receipt, write the model the route was asked for, followed by `(unverified)`. On the `session` route, write the model the session attests, or `unverified` alone when it attests none. No route returns an effort receipt, so the served effort is never verified: the line reports the effort the route was asked to run at.

Show the resolver's `warnings` for the role once, with this line. When the step prints no line, show them alone in the same place.

```text
Model role <role>: requested fable low; served fable (unverified) at low; route claude CLI.
Model role <role>: requested opus max; served opus at high; route claude CLI; reason: the route does not accept max.
Model role <role>: requested sonnet low; served sonnet, effort not applied; route native subagent.
Model role <role>: requested inherit; served opus; route session.
Model role <role> seat 2: requested opus high; not run; reason: no route can serve it.
```
