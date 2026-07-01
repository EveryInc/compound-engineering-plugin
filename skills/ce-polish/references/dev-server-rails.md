# Rails dev-server recipe (auto-detect fallback)

Loaded when `detect-project-type.sh` returns `rails` and there is no `.claude/launch.json` to consult.

## Signature

- `bin/dev` exists and is executable
- `Gemfile` exists

## Start command

```bash
bin/dev
```

`bin/dev` is the Rails 7+ convention for "start everything" (web + assets watcher + optional workers). It is a one-liner script that invokes `foreman start -f Procfile.dev` under the hood, so `Procfile.dev` is the canonical place to read the *actual* command if `bin/dev` is missing or non-executable.

## Port

Default: `3000`. Overrides follow the cascade in `references/dev-server-detection.md`:
1. `Procfile.dev` `web:` line may contain `-p <n>`
2. `config/puma.rb` may bind to a non-default port
3. `.env` / `.env.development` `PORT=<n>`
4. a dev-server port explicitly stated in the project's active instructions in context (not grepped from instruction files)

## Stub generation for `.claude/launch.json`

When the user accepts "Save this as `.claude/launch.json`?", emit the Rails stub from `launch-json-schema.md`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Rails dev",
      "runtimeExecutable": "bin/dev",
      "runtimeArgs": [],
      "port": 3000
    }
  ]
}
```

If the cascade resolved a non-3000 port, substitute it in the stub's `port` field before writing.

## Common gotchas

- **Bundler path:** some machines require `bundle exec bin/dev`. If `bin/dev` fails with a load-path error, fall back to `bundle exec bin/dev`.
- **Foreman vs overmind:** `Procfile` vs `Procfile.dev` often both exist. Rails' `bin/dev` resolves to `Procfile.dev`; if the project uses `overmind` explicitly, prefer `overmind start -f Procfile.dev` (see `dev-server-procfile.md`).
- **SSL dev server:** `rails s --ssl` serves over `https://`, but polish's reachability probe, browser handoff, and printed URL are all `http://localhost:<port>` — and the scheme is not configurable via `.claude/launch.json` (it has no scheme/URL field). The probe will therefore fail against an HTTPS-only server; that failure is non-fatal (polish shows the log and asks what to do), so open `https://localhost:<port>` manually to continue. Setting `port` explicitly in `.claude/launch.json` still helps polish target the right port.
