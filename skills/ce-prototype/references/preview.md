# Preview helper

Load this when serving a local web prototype. Feedback stays in chat.

This skill ships its own `scripts/light-webserver.js`. Do not import a sibling skill's copy — isolation forbids that. The file is a byte-identical copy of brainstorm's helper.

Use the bundled helper when the current platform can run a bundled skill script. Invoke it via the `SKILL_DIR` anchor: set `SKILL_DIR` to the absolute path of the directory containing the `ce-prototype` `SKILL.md` you loaded (the Bash tool's cwd is the user's project, not the skill dir), and re-set it in the same command on each call since shell vars do not persist between Bash invocations. Do not resolve the helper from the user's project CWD.

Resolve the question directory once, at the start of the run, and reuse the absolute path it prints for every later call. Do not re-derive it per command — the server keys its pidfile and its process match off `--root`, so a start and a stop that resolve differently leave an orphaned server.

`RUN_SLUG` is `<date>-<short-question-slug>` for the run; `QUESTION_SLUG` is `NN-<question-slug>` for the question being built. A run that covers a second related question resolves a second question directory under the same run directory.

Settle durability before you run this block; it reads both decisions once and there is no second pass. Set `RUN_KEEP="no"` when the user asked that this run not be left in the repo, and run the block as it stands — it sends the run to OS temp and nothing else changes. Otherwise, when the run is inside a git repository, probe the repo root for `.context/compound-engineering/`; if it is not covered, offer to append that one line to the repo-root `.gitignore`, appending only if the user agrees and leaving the rest of the file alone. A run that is headed for OS temp either way gets no offer.

```bash
RUN_SLUG="<YYYY-MM-DD>-<run-slug>";
RUN_KEEP="yes";
REPO_ROOT="$(git rev-parse --show-toplevel 2>/dev/null)";
TEMP_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$TEMP_ROOT" ] && (umask 077; mkdir -p "$TEMP_ROOT") 2>/dev/null && [ ! -L "$TEMP_ROOT" ] && [ -O "$TEMP_ROOT" ] && [ -w "$TEMP_ROOT" ] || TEMP_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)";
if [ "$RUN_KEEP" = yes ] && [ -n "$REPO_ROOT" ] && [ ! -L "$REPO_ROOT/.context" ] && [ ! -L "$REPO_ROOT/.context/compound-engineering" ] && git -C "$REPO_ROOT" check-ignore -q .context/compound-engineering/ 2>/dev/null; then
ROOT="$REPO_ROOT/.context/compound-engineering";
else
ROOT="$TEMP_ROOT";
fi;
while :; do
BASE="$ROOT/ce-prototype";
if [ -L "$ROOT" ]; then echo "unsafe root symlink: $ROOT" >&2;
elif ! (umask 077; mkdir -p "$ROOT"); then echo "could not create $ROOT" >&2;
elif [ -L "$ROOT" ] || [ ! -O "$ROOT" ]; then echo "root is not owned by the current user: $ROOT" >&2;
elif ! chmod 700 "$ROOT"; then echo "could not restrict $ROOT" >&2;
elif [ -L "$BASE" ]; then echo "unsafe base symlink: $BASE" >&2;
elif ! (umask 077; mkdir -p "$BASE"); then echo "could not create $BASE" >&2;
elif [ ! -O "$BASE" ]; then echo "base is not owned by the current user: $BASE" >&2;
elif ! chmod 700 "$BASE"; then echo "could not restrict $BASE" >&2;
else break; fi;
if [ "$ROOT" = "$TEMP_ROOT" ]; then echo "no usable run root" >&2; exit 1; fi;
echo "falling back to $TEMP_ROOT" >&2; ROOT="$TEMP_ROOT";
done;
RUN_DIR="$BASE/$RUN_SLUG"; n=1;
while ! (umask 077; mkdir "$RUN_DIR") 2>/dev/null; do
if [ ! -e "$RUN_DIR" ]; then echo "could not create $RUN_DIR" >&2; exit 1; fi;
n=$((n+1)); RUN_DIR="$BASE/$RUN_SLUG-$n";
if [ "$n" -gt 99 ]; then echo "could not claim a run directory under $BASE" >&2; exit 1; fi;
done;
chmod 700 "$RUN_DIR" || exit 1;
echo "$RUN_DIR"
```

Three things this block is careful about. The symlink and ownership checks run against both the **root** — the directory sitting in a shared or world-writable location — and the `ce-prototype` directory beneath it, because that one survives between runs: `mkdir -p` follows a symlink that is already there, and `chmod` would then change the link's target rather than anything inside the validated root. Every check is inside the retry loop, so an unsafe in-repo path at either level falls back to OS temp rather than aborting — a hostile or misconfigured `.context` costs the run its durability, not the run itself, and only a temp root that also fails is fatal.

Creating the directory is how it is claimed — never test whether the name is free and then write, which two runs starting together both pass. There is no rejoin: this block runs once per invocation, so a second question never re-derives the run directory and can neither split into a suffixed sibling nor adopt a finished run's directory.

Then, once per question, create that question's directory under the run directory the block above printed:

```bash
RUN_DIR="<absolute run directory the resolution block printed>";
QUESTION_SLUG="<NN>-<question-slug>";
if [ -L "$RUN_DIR" ] || [ ! -O "$RUN_DIR" ]; then echo "unsafe run directory: $RUN_DIR" >&2; exit 1; fi;
PROTO_DIR="$RUN_DIR/$QUESTION_SLUG"; (umask 077; mkdir -p "$PROTO_DIR") || exit 1; chmod 700 "$PROTO_DIR" || exit 1;
echo "$PROTO_DIR"
```

Start (detached), with `PROTO_DIR` set to the absolute path the resolution printed:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PROTO_DIR="<absolute question directory the resolution block printed>";
if [ -L "$PROTO_DIR" ] || [ ! -O "$PROTO_DIR" ]; then echo "unsafe run directory: $PROTO_DIR" >&2; exit 1; fi;
node "$SKILL_DIR/scripts/light-webserver.js" start --root "$PROTO_DIR"
```

The server takes `--root` on trust — it resolves the path and creates it, and checks nothing — so each call re-checks the directory it is about to hand over. The path arrives here by transcription across separate shell invocations, and a mistyped or stale one would otherwise be written to unverified.

Append `--foreground` to that `start` command for foreground mode. Status and stop take the same anchor and the same `PROTO_DIR` — and because neither persists between Bash invocations, each must re-set both in its own call rather than reuse the `start` block's values:

```bash
SKILL_DIR="<absolute path of the directory containing the SKILL.md you just read>";
PROTO_DIR="<absolute question directory the resolution block printed>";
if [ -L "$PROTO_DIR" ] || [ ! -O "$PROTO_DIR" ]; then echo "unsafe run directory: $PROTO_DIR" >&2; exit 1; fi;
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
