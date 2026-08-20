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

Resolve launch configuration to one startup tuple: command, working directory, environment, and port. A selected configuration with a usable, non-empty `runtimeExecutable` owns the command and optional `runtimeArgs` and `env`; its `cwd` selects the working directory, defaulting to the repository root. A numeric declared `port` completes the tuple. Without one, classify that working directory and resolve its port from the single supported type, without replacing the selected command. Ambiguous declarations remain in disambiguation: show their names, ask the user to choose, and rerun with that name. Fall through to project detection only when no selected configuration supplies a usable command. Any operational failure or unresolved tuple fact blocks startup and must be reported.

Classify the relevant project root: the selected launch working directory when its port is absent, otherwise the repository root for project detection. Omit the path argument for the repository root:

```bash
SKILL_DIR="<absolute path of the directory containing this SKILL.md>";
bash "$SKILL_DIR/scripts/detect-project-type.sh" "<project-root>"
```

`<type>` means the classification root; `<type>@<relative-dir>` means that directory under the classification root. Ask the user to choose when the output is `multiple` or `multiple:...`.

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

Inspect the chosen port and select exactly one intended server instance before handoff. Reuse a process already serving that port only when evidence identifies it as the intended project server. Only when no intended instance is selected may the resolved command be launched in the background with the project's working directory and environment; that process becomes the selected instance. Keep its process or session handle, and write its output under a directory created with `mktemp -d "${TMPDIR:-/tmp}/ce-polish-XXXXXX"`.

An occupied port that cannot be attributed to the intended project server remains an unresolved collision. Ask the user whether to stop that process, choose another port, or stop this run; never kill it or launch past it.

Resolve the selected instance's actual URL before handoff. The resolved port seeds `http://localhost:<port>` as the default candidate, but server output or a user correction replaces that candidate when it identifies a different URL. Attribute successful reachability at the resolved actual URL to the selected instance by probing for up to 30 seconds; a response from another process is not success.

- **Reachable:** use the browser-opening capability already exposed by the active harness with the verified actual URL. If it has none or the handoff fails, print that URL; browser handoff is a convenience, not a gate.
- **Not reachable:** show diagnostics derived from the selected instance. Include the last 20 log lines only when this run launched it and owns those logs. Ask whether to correct the server URL or start configuration, or stop.

Do not continue into the polish loop unless reachability is attributed to the selected instance.

Tell the user:

```text
Dev server running on <verified-actual-url>
Browse the feature and tell me what could be better.
```
