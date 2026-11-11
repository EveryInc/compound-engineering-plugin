# Install riffrec live mode into the host app

Load this from `references/live-start.md` when the detect script shows the app is missing the riffrec dependency, has no installed live-capable build, or has no live-capable provider mount. The result is one setup commit on the current feature branch that leaves the app able to run a live session; the riffer already accepted this when they chose live mode, so do not ask again.

## Where riffrec comes from

`RIFFREC_MIN_VERSION` = `2.2.1`

Live mode with the seeing interviewer (clicks announced, `look_at_screen`, no zip once the endpoint confirmed Done) ships in the npm package `riffrec` from `RIFFREC_MIN_VERSION` on, so the registry range `riffrec@^2.2.1` is the install path (step 1). Name the installed version in the setup commit message and in the report.

## What to change

Three edits, together, in the project root the detect script inspected:

1. **Dependency.** Use the package manager the detect output named (`package_manager`; when null the project has no `package.json` and live mode cannot host riffrec — report that and offer traditional). Let the manager update its lockfile; do not edit the lockfile by hand.
   - **Registry install:** one command, the manager's own add verb followed by the registry range: `<add verb> riffrec@^2.2.1`, where the add verb is `npm install`, `pnpm add`, `yarn add`, or `bun add` for the manager the detect output named. Quote the spec in shells that expand `^`. An existing `riffrec` entry that allows anything older than `RIFFREC_MIN_VERSION` (an older range, or a git spec such as `kieranklaassen/riffrec#<sha>` or `#main`) is replaced by the range.
   - **Check the build.** Re-run the detect script: `installed` and `live_build` must both be true. `live_build` requires the installed `dist/index.d.ts` to name both `RiffrecLiveConfig` (the live provider) and `LOOK_AT_SCREEN_TOOL` (the page-side handler for the screen tool the endpoint advertises to the interviewer); an older live-capable build has the first without the second and would leave the interviewer's screen requests unanswered, so it fails this check and is replaced by the range like any other stale entry. If `live_build` is false the install did not resolve to `RIFFREC_MIN_VERSION` or later (a lockfile still holding an older resolution, a manager cache); fix the resolution and reinstall rather than building inside `node_modules`. Still false after that: stop, report the command output, and offer traditional. The detect script's `version` is informational (it reads the installed `package.json`, not a registry); the probe in `references/live-start.md` (the consent screen appears) is what proves live mode is present.
2. **Mount.** Wrap the root of the React tree once in the provider, imported from `riffrec`:

   ```tsx
   <RiffrecProvider forceEnable live={{}}>
   ```

   `live` enables live mode. Its `autoStart` default is fragment-gated in riffrec from `RIFFREC_MIN_VERSION` on: the consent step opens by itself only when the page carries live credentials (the `#riffrec_live=…` fragment on the handoff URL, or stored credentials after a reload), and an ordinary visit stays quiet, so leave `autoStart` unset. The root is wherever the framework renders the whole app: the Vite entry that calls `createRoot`, the Remix `root.tsx` layout, the component Inertia's `createInertiaApp` renders, or, on the Next app router, a client component the root layout renders (the provider uses browser APIs, so it cannot sit directly in a server component). When a `RiffrecProvider` mount already exists, add the `live` prop to it and keep its other props. That prop is the whole configuration: the endpoint origin and the session token reach the page through the URL fragment at session start, so nothing about the endpoint is written into source, environment files, or config, and the mount is safe to commit.
3. **Verify.** Re-run the detect script from `references/live-start.md`. It must now report `dependency`, `installed`, and `live_build` true, and `mount` true (`live=` on the tag; the detect script looks for a real JSX opening element, not the prop's value). If the mount edit does not show, the file you edited is not the rendered root; find the one that is.

Follow riffrec's own README when it names a different mount point for the framework in front of you; the README is the source of truth for the package, this file only for what polish needs from it.

## Commit

Commit the dependency change, the lockfile, and the mount edit as one setup commit on the current branch through `ce-commit`, with a message that says it adds riffrec live mode for polish sessions. Keep its hash: the live-mode report names it, including when the riffer later declines the consent screen and no session runs (the commit stays; riffrec remains in the app after the session, as disclosed).

## When it fails

An install or mount edit that cannot complete leaves no setup commit. Undo only the edits this step made, report what failed with the command output, and offer traditional polish. Do not retry with a different package manager or a different riffrec source than the `riffrec@^2.2.1` registry range.
