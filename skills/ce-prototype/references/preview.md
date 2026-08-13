# Preview helper

Load this when serving a local web prototype. Feedback stays in chat.

This skill ships its own `scripts/light-webserver.js`. Do not import a sibling skill's copy — isolation forbids that. The file is a byte-identical copy of brainstorm's helper.

Use the bundled helper when the current platform can run a bundled skill script. Invoke it via the `SKILL_DIR` anchor: set `SKILL_DIR` to the absolute path of the directory containing the `ce-prototype` `SKILL.md` you loaded (the Bash tool's cwd is the user's project, not the skill dir), and re-set it in the same command on each call since shell vars do not persist between Bash invocations. Do not resolve the helper from the user's project CWD.

Start (detached):

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
PROTO_DIR="$SCRATCH_ROOT/ce-prototype/<run-id>"; (umask 077; mkdir -p "$PROTO_DIR") || exit 1; chmod 700 "$PROTO_DIR" || exit 1;
node "$SKILL_DIR/scripts/light-webserver.js" start --root "$PROTO_DIR"
```

Append `--foreground` to that `start` command for foreground mode. Status and stop take the same anchor — and because `SKILL_DIR` does not persist between Bash invocations, each must re-set it in its own call rather than reuse the `start` block's value:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
if [ -L "$SCRATCH_ROOT" ]; then echo "unsafe scratch root symlink: $SCRATCH_ROOT" >&2; exit 1; fi;
(umask 077; mkdir -p "$SCRATCH_ROOT") || exit 1;
if [ -L "$SCRATCH_ROOT" ] || [ ! -O "$SCRATCH_ROOT" ]; then echo "scratch root is not owned by the current user: $SCRATCH_ROOT" >&2; exit 1; fi;
chmod 700 "$SCRATCH_ROOT" || exit 1;
PROTO_DIR="$SCRATCH_ROOT/ce-prototype/<run-id>"; (umask 077; mkdir -p "$PROTO_DIR") || exit 1; chmod 700 "$PROTO_DIR" || exit 1;
node "$SKILL_DIR/scripts/light-webserver.js" status --root "$PROTO_DIR"
# stop: the same command with `stop` in place of `status` (re-set SKILL_DIR again)
```

If `SKILL_DIR` cannot be resolved to a concrete skill directory, do not guess from the project CWD. Stop and report that the preview cannot start; do not settle the question in chat instead.

The helper creates `screens/` and `state/`, serves the newest `.html` file in `screens/` at `/`, writes `state/display-info.json`, and exposes `/version` so the browser can poll for screen changes. Every other path is read from `screens/` at that same path — `/img/blot.webp` serves `screens/img/blot.webp` — so a screen keeps whatever asset layout it was copied from, nesting included. Put the assets the screen references under `screens/` at the paths it asks for, or inline them as data URIs. Anything resolving outside `screens/` is refused.

Before handing over the URL, look at the rendered screen — a screenshot where the platform has one, otherwise measure the laid-out result in the DOM. A 200 on every asset is not that check: an image that loads correctly at the wrong size passes it, as does a script that leaves the page inert. Check each variant at rest, not just the page — one bug in shared scaffolding reads as several bad designs. Drive an interaction only when its behavior is invisible at rest, which is also the case where telling them to try something you have not tried is a claim you made up. Measurement lies by default — computed styles read mid-transition, scroll events coalesce — so read after things settle, and suspect the instrument before you conclude the page is broken. You are done when they could judge the idea, not when the code is correct. If you have no way to see the rendered result, say so when you hand over the URL rather than implying it was checked.

The browser reloads only when the newest screen changes; it must not continually reload on a timer. `/version` polling does not count as activity. Detached servers monitor the owning harness process when it can be resolved, and all servers exit after an idle timeout. The helper has no browser-to-agent event path. Interactive HTML is allowed.

Write screens under:

```text
/tmp/compound-engineering-<uid>/ce-prototype/<run-id>/
  screens/
    001-<question>.html
    img/blot.webp          # any assets the screen references, at the paths it uses
    world/cast/pip.webp
  state/
    display-info.json
  decisions.md    # run capsule for the next skill; not a plan
```

## Launch mode by platform

The server is the same everywhere; only the launch mode changes.

- **Claude Code / Claude desktop app:** detached `start` is the default path. If the app opens localhost URLs, show the returned URL and continue.
- **Codex CLI / Codex app:** if detached processes are reaped or the URL dies after the tool call, use `start --foreground` through the platform's long-running/background terminal mechanism.
- **Plain terminal UI:** print the returned URL for the user to open manually.
- **Remote or containerized sessions:** if `localhost` is not reachable from the user's browser, start with `--host 0.0.0.0` and tell the user which host/port to open. That serves the run directory to anything that can reach the port, with no auth — do it only on a network the user trusts, and say so when you hand over the URL.

If the helper path is unavailable or the platform cannot display a local URL cleanly, stop and report that. Do not settle the question in chat instead — a question that has to be used to be decided is not answered by talking about it.
