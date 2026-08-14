# Preview helper

Load this when serving a local web prototype. Feedback stays in chat.

This skill ships its own `scripts/light-webserver.js`. Do not import a sibling skill's copy — isolation forbids that. The file is a byte-identical copy of brainstorm's helper.

Use the bundled helper when the current platform can run a bundled skill script. Invoke it via the `SKILL_DIR` anchor: set `SKILL_DIR` to the absolute path of the directory containing the `ce-prototype` `SKILL.md` you loaded (the Bash tool's cwd is the user's project, not the skill dir), and re-set it in the same command on each call since shell vars do not persist between Bash invocations. Do not resolve the helper from the user's project CWD.

Resolve the question directory once, at the start of the run, and reuse the absolute path it prints for every later call. Do not re-derive it per command — the server keys its pidfile and its process match off `--root`, so a start and a stop that resolve differently leave an orphaned server.

`RUN_SLUG` is `<date>-<short-question-slug>` for the run; `QUESTION_SLUG` is `NN-<question-slug>` for the question being built. A run that covers a second related question resolves a second question directory under the same run directory.

```bash
RUN_SLUG="<YYYY-MM-DD>-<run-slug>"; QUESTION_SLUG="<NN>-<question-slug>";
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)";
if [ -n "$REPO_ROOT" ] && git -C "$REPO_ROOT" check-ignore -q .context/compound-engineering/ 2>/dev/null; then
BASE="$REPO_ROOT/.context/compound-engineering/ce-prototype";
else
BASE="/tmp/compound-engineering-$(id -u)/ce-prototype";
fi;
if [ -L "$BASE" ]; then echo "unsafe run root symlink: $BASE" >&2; exit 1; fi;
(umask 077; mkdir -p "$BASE") || exit 1;
if [ -L "$BASE" ] || [ ! -O "$BASE" ]; then echo "run root is not owned by the current user: $BASE" >&2; exit 1; fi;
chmod 700 "$BASE" || exit 1;
RUN_DIR="$BASE/$RUN_SLUG"; n=1;
while ! (umask 077; mkdir "$RUN_DIR") 2>/dev/null; do
if [ ! -e "$RUN_DIR" ]; then echo "could not create $RUN_DIR" >&2; exit 1; fi;
if [ -O "$RUN_DIR" ] && [ ! -L "$RUN_DIR" ] && [ -f "$RUN_DIR/decisions.md" ]; then break; fi;
n=$((n+1)); RUN_DIR="$BASE/$RUN_SLUG-$n";
if [ "$n" -gt 99 ]; then echo "could not claim a run directory under $BASE" >&2; exit 1; fi;
done;
chmod 700 "$RUN_DIR" || exit 1;
PROTO_DIR="$RUN_DIR/$QUESTION_SLUG"; (umask 077; mkdir -p "$PROTO_DIR") || exit 1; chmod 700 "$PROTO_DIR" || exit 1;
echo "$PROTO_DIR"
```

Creating the directory is how it is claimed — never test whether the name is free and then write, which two runs starting together both pass. The loop rejoins a run directory this run already owns (its capsule is there) and otherwise takes the next suffix.

Start (detached), with `PROTO_DIR` set to the absolute path the resolution printed:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PROTO_DIR="<absolute question directory the resolution block printed>";
node "$SKILL_DIR/scripts/light-webserver.js" start --root "$PROTO_DIR"
```

Append `--foreground` to that `start` command for foreground mode. Status and stop take the same anchor and the same `PROTO_DIR` — and because neither persists between Bash invocations, each must re-set both in its own call rather than reuse the `start` block's values:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PROTO_DIR="<absolute question directory the resolution block printed>";
node "$SKILL_DIR/scripts/light-webserver.js" status --root "$PROTO_DIR"
# stop: the same command with `stop` in place of `status` (re-set both again)
```

If `SKILL_DIR` cannot be resolved to a concrete skill directory, do not guess from the project CWD. Stop and report that the preview cannot start; do not settle the question in chat instead.

The helper creates `screens/` and `state/`, serves the newest `.html` file in `screens/` at `/`, writes `state/display-info.json`, and exposes `/version` so the browser can poll for screen changes. Every other path is read from `screens/` at that same path — `/img/blot.webp` serves `screens/img/blot.webp` — so a screen keeps whatever asset layout it was copied from, nesting included. Put the assets the screen references under `screens/` at the paths it asks for, or inline them as data URIs. Anything resolving outside `screens/` is refused.

Before handing over the URL, look at the rendered screen — a screenshot where the platform has one, otherwise measure the laid-out result in the DOM. A 200 on every asset is not that check: an image that loads correctly at the wrong size passes it, as does a script that leaves the page inert. Check each variant at rest, not just the page — one bug in shared scaffolding reads as several bad designs. Drive an interaction only when its behavior is invisible at rest, which is also the case where telling them to try something you have not tried is a claim you made up. Measurement lies by default — computed styles read mid-transition, scroll events coalesce — so read after things settle, and suspect the instrument before you conclude the page is broken. You are done when they could judge the idea, not when the code is correct. If you have no way to see the rendered result, say so when you hand over the URL rather than implying it was checked.

The browser reloads only when the newest screen changes; it must not continually reload on a timer. `/version` polling does not count as activity. Detached servers monitor the owning harness process when it can be resolved, and all servers exit after an idle timeout. The helper has no browser-to-agent event path. Interactive HTML is allowed.

Write screens under:

```text
<repo>/.context/compound-engineering/ce-prototype/<YYYY-MM-DD>-<run-slug>/
  decisions.md               # run capsule for the next skill; not a plan
  01-<question-slug>/
    screens/
      001-<variant>.html
      img/blot.webp          # any assets the screen references, at the paths it uses
      world/cast/pip.webp
    state/
      display-info.json
  02-<question-slug>/         # only when the run covers a second related question
    screens/
    state/
```

The fallback root takes the same shape under `/tmp/compound-engineering-<uid>/ce-prototype/`. The capsule sits at the run directory and names each question directory; `--root` is always a question directory, never the run directory.

## Launch mode by platform

The server is the same everywhere; only the launch mode changes.

- **Claude Code / Claude desktop app:** detached `start` is the default path. If the app opens localhost URLs, show the returned URL and continue.
- **Codex CLI / Codex app:** if detached processes are reaped or the URL dies after the tool call, use `start --foreground` through the platform's long-running/background terminal mechanism.
- **Plain terminal UI:** print the returned URL for the user to open manually.
- **Remote or containerized sessions:** if `localhost` is not reachable from the user's browser, start with `--host 0.0.0.0` and tell the user which host/port to open. That serves the run directory to anything that can reach the port, with no auth — do it only on a network the user trusts, and say so when you hand over the URL.

If the helper path is unavailable or the platform cannot display a local URL cleanly, stop and report that. Do not settle the question in chat instead — a question that needs a real artifact to be decided is not answered by talking about it.
