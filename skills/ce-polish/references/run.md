# Prepare the live polish loop

This reference owns checkout safety, server startup, reachability, and browser handoff. It does not own the user's iterative polish decisions.

## Resolve the workspace

If the user named a PR or branch, first locate whether its branch is already checked out in a worktree. Enter that existing worktree when the harness can; if it cannot, report the blocker and stop. Only use the harness's checkout capability in the current workspace when no other worktree owns the target. With no argument, stay in the current checkout.

Confirm the resulting branch is neither the repository's default branch nor detached. Report and stop when a safe feature-branch workspace cannot be reached; do not create another worktree behind the harness or move uncommitted user changes.

## Resolve the start command

The commands below execute scripts bundled with this skill. For every self-contained shell call, set `SKILL_DIR` to the absolute directory containing the loaded `ce-polish` `SKILL.md`; shell state does not carry between calls.

First inspect the repo-root launch configuration:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/read-launch-json.sh"
```

Continue from launch configuration only when the output resolves to exactly one configuration with a non-empty `runtimeExecutable` and numeric `port`; `runtimeArgs`, `cwd`, and `env` are optional. When declarations exist but selection is multiple or unmatched, stay in disambiguation: show the declared names, ask the user to choose, and rerun with that name. Only an absent, malformed, missing, or unusable declared configuration falls through to project detection. A nonzero operational failure blocks startup and must be reported.

For project detection, resolve the classifier output to exactly one supported base type and project root:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/detect-project-type.sh"
```

`<type>` means the repository root; `<type>@<relative-dir>` means that directory under the repository root. Ask the user to choose when the output is `multiple` or `multiple:...`.

For a supported pair, read `references/dev-server-<base-type>.md`. For package-manager projects, resolve the executable in that project root rather than guessing:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/resolve-package-manager.sh" "<project-root>"
```

Resolve the port with the detected type:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/resolve-port.sh" "<project-root>" --type <base-type>
```

Startup may proceed only after command, working directory, and port are resolved. A supported classifier pair supplies them through its recipe and resolvers. For `unknown`, ask the user for those non-derivable facts and skip type-specific routing. If a resolver fails operationally or a required fact remains unknown, report that blocker; do not substitute a plausible value. After resolving a supported pair, offer once to save the command as `.claude/launch.json`; write it only when the user accepts, after reading `references/launch-json-schema.md` and the selected recipe.

## Start and hand off

Before launch, resolve any process already serving the chosen port. Reuse it only when evidence identifies it as the intended project server; otherwise ask the user whether to stop it, choose another port, or stop this run. Never kill or launch past an unresolved collision.

Start the resolved command with the project's working directory and environment in the background. Keep its process/session handle and write output under a directory created with `mktemp -d "${TMPDIR:-/tmp}/ce-polish-XXXXXX"`. Probe the actual URL bound by that launched process for up to 30 seconds; a response from some other process is not success.

- **Reachable:** use the browser-opening capability already exposed by the active harness. If it has none or the handoff fails, print the URL; browser handoff is a convenience, not a gate.
- **Not reachable:** show the last 20 log lines and ask whether to correct the start configuration or stop. Do not continue into the polish loop against a page that never came up.

Tell the user:

```text
Dev server running on http://localhost:<port>
Browse the feature and tell me what could be better.
```
