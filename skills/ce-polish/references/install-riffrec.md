# Install riffrec live mode into the host app

Load this from `references/live-start.md` when the detect script shows the app is missing the riffrec dependency, carries a version below the minimum, or has no live-capable provider mount. The result is one setup commit on the current feature branch that leaves the app able to run a live session; the riffer already accepted this when they chose live mode, so do not ask again.

## Minimum version

<!-- TODO(U7 release): no npm release carries live mode yet. Until Kieran picks a version, the dependency step installs GitHub main at or after the minimum known-good commit below. -->
`RIFFREC_MIN_VERSION` = `0.0.0-live-unreleased` (no release yet; use GitHub `main` ≥ `d4d8c5a` until Kieran picks a version)
`RIFFREC_MIN_COMMIT` = `d4d8c5ad3912e06d8b72517f7cf4583915b375b5`

The first riffrec release that ships live mode defines `RIFFREC_MIN_VERSION`, and a registry install at that version is the preferred path. Live mode is complete on riffrec's GitHub `main` from `RIFFREC_MIN_COMMIT` on (U7 and the contract fix are merged there), so while the version still reads as the placeholder, or the registry has no version at or above it, install from `main` instead (the interim path in step 1). Say which path you took in the setup commit message and in the report.

## What to change

Three edits, together, in the project root the detect script inspected:

1. **Dependency.** Use the package manager the detect output named (`package_manager`; when null the project has no `package.json` and live mode cannot host riffrec — report that and offer traditional). Let the manager update its lockfile; do not edit the lockfile by hand.
   - **Registry (preferred):** add `riffrec` at `^RIFFREC_MIN_VERSION`, or raise an existing entry that resolves below it. One command shape, with the manager's own add verb: `npm install riffrec@^<min>`, `pnpm add riffrec@^<min>`, `yarn add riffrec@^<min>`, `bun add riffrec@^<min>`.
   - **GitHub `main` (interim):** the same add verb with the git spec `kieranklaassen/riffrec#main` in place of `riffrec@^<min>` (`npm install kieranklaassen/riffrec#main`, `pnpm add kieranklaassen/riffrec#main`, `yarn add kieranklaassen/riffrec#main`, `bun add kieranklaassen/riffrec#main`). Pin to the commit instead (`kieranklaassen/riffrec#<RIFFREC_MIN_COMMIT>`) when the project wants reproducible installs. The repository declares only a `prepack` build, which git installs never run, and ships its built `dist/` in the tree, so what you get is exactly the committed `dist/`. Check it before going on: `node_modules/riffrec/dist/index.d.ts` must mention `live?: RiffrecLiveConfig`. If it does not, the committed `dist/` on `main` predates live mode; do not build it in place inside `node_modules`. Stop, report that riffrec `main` needs a `build: refresh package artifacts` commit before live mode can be installed from git, and offer traditional. The detect script reports the `version` the installed `package.json` declares, not a registry version; the probe in `references/live-start.md` (the consent screen appears) is what proves live mode is present. When the registry later carries a version at or above the minimum, switching the entry back to the registry range is a new setup commit, not part of this session.
2. **Mount.** Wrap the root of the React tree once in the provider, imported from `riffrec`:

   ```tsx
   <RiffrecProvider forceEnable live={{ autoStart: typeof window !== "undefined" && window.location.hash.includes("riffrec_live=") }}>
   ```

   `live` enables live mode; `autoStart` opens the consent step as soon as the live subtree is ready, and riffrec has no start control of its own in live mode, so it must be on for a page opened from the handoff URL and off for every ordinary visit. Reading the fragment at render time gives exactly that: the handoff URL carries `#riffrec_live=…`, riffrec strips it only after the live chunk loads, and a reload after consent resumes the stored session without a new consent step. The root is wherever the framework renders the whole app: the Vite entry that calls `createRoot`, the Remix `root.tsx` layout, the component Inertia's `createInertiaApp` renders, or, on the Next app router, a client component the root layout renders (the provider uses browser APIs, so it cannot sit directly in a server component). When a `RiffrecProvider` mount already exists, add the `live` prop to it and keep its other props. That prop is the whole configuration: the endpoint origin and the session token reach the page through the URL fragment at session start, so nothing about the endpoint is written into source, environment files, or config, and the mount is safe to commit.
3. **Verify.** Re-run the detect script from `references/live-start.md`. It must now report the dependency, a version at or above the minimum (on the interim path, the version the `main` checkout declares), and the mount (`live=` on the tag; the detect script looks for the tag, not the prop's value). If the mount edit does not show, the file you edited is not the rendered root; find the one that is.

Follow riffrec's own README when it names a different mount point for the framework in front of you; the README is the source of truth for the package, this file only for what polish needs from it.

## Commit

Commit the dependency change, the lockfile, and the mount edit as one setup commit on the current branch through `ce-commit`, with a message that says it adds riffrec live mode for polish sessions. Keep its hash: the live-mode report names it, including when the riffer later declines the consent screen and no session runs (the commit stays; riffrec remains in the app after the session, as disclosed).

## When it fails

An install or mount edit that cannot complete leaves no setup commit. Undo only the edits this step made, report what failed with the command output, and offer traditional polish. Do not retry with a different package manager or a different version than the minimum.
