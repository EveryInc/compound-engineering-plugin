# `ce-setup`

> Check Compound Engineering health, optional tool availability, and repo-local config safety. It does not bulk-install the plugin's dependencies.

`ce-setup` is a diagnosis and config utility. It reports which optional tools are on PATH, refreshes the committed config example, creates the repo `config.yaml` if you approve, and offers to gitignore a local override or CE scratch space. It also reports where CE artifacts will land and can repair an invalid `docs_root` or a broken CE Work engine block.

It runs only when you invoke it explicitly (`disable-model-invocation: true`). Talking about setup does not start it. Outside a git repository it reports capabilities and stops without writing files.

See [Compound Engineering configuration](./configuration.md) for every option and how local defaults interact with session and project instructions.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs a health check, reports optional tools, refreshes the example config, and applies only the repo-local fixes you approve |
| When to use it | First install, after an upgrade, when a skill says a tool is missing, or when onboarding a repo |
| What it produces | A setup report, plus any config or gitignore edits you accepted |
| What it does not do | Bulk-install optional CE dependencies, update the plugin itself, or create `config.local.yaml` |

---

## Example invocations

There is no argument. One command covers first install, a re-check after an upgrade, a missing-tool report, and a directory that is not a git repo.

```text
/ce-setup
```

On oh-my-pi the invocation is `/skill:ce-setup`. On Codex it is `$ce-setup` when that host uses dollar-prefixed skills.

---

## Why setup does not install everything

Compound Engineering has two separate setup surfaces:

- **Repo-local state** that should stay consistent and safe: the committed config example, the repo `config.yaml`, and gitignore coverage for `config.local.yaml` and `.context/compound-engineering/` scratch.
- **Optional external tools** used by specific workflows: `agent-browser`, `gh`, `jq`, `ast-grep`, `ffmpeg`.

A missing optional tool is not a broken plugin. Most workflows never touch `ffmpeg` or `ast-grep`, so installing everything up front is wasted footprint. `ce-setup` reports what is missing, says which workflow each tool serves, and prints the install command. You install only what you use.

## What it fixes

The example config refresh happens on its own (it is the committed template copy). Everything else waits for your approval:

- Deletes the obsolete `compound-engineering.local.md` if you say yes.
- Refreshes `.compound-engineering/config.example.yaml` from the bundled template, always, inside a git repo.
- Offers to create `.compound-engineering/config.yaml` when missing. Never overwrites an existing `config.yaml` or `config.local.yaml`, and never creates the local override.
- Offers to add `.compound-engineering/*.local.yaml` to `.gitignore`, but only when `config.local.yaml` already exists and is not ignored.
- Offers to add `.context/compound-engineering/` to `.gitignore` whether or not that directory exists yet. An uncovered path is a note, not a project issue.
- Repairs an invalid CE Work implementation-engine block, or leftover retired routing keys, in the config layer that supplied the bad value.
- Repairs an invalid `docs_root`. This one is a real project issue: CE artifacts will not be written until it is fixed. See [Artifact root](./configuration.md#artifact-root).

Each question uses the host's blocking question tool when one exists. It never silently auto-configures.

## Where artifacts land

The health report includes the resolved artifact root (`docs/` by default, or a valid `docs_root` from `config.yaml`) and which config layer supplied it. `docs_root` in `config.local.yaml` is ignored; if your local file still has one, setup says so and offers to move it into `config.yaml`.

---

## Optional capabilities

| Tool | Capability |
|------|------------|
| `agent-browser` | Browser testing and dogfood QA |
| `gh` | GitHub PR, issue, and review workflows |
| `jq` | JSON inspection in shell-based workflows |
| `ast-grep` | Syntax-aware structural code search |
| `ffmpeg` | Media chunking and screenshot extraction for Riffrec analysis |

---

## Quick example

You just installed compound-engineering and want to check a repo:

```text
/ce-setup
```

The health check reports something like:

```text
Optional capabilities  3/5
  🟢  agent-browser -- browser testing and dogfood QA
  🟢  gh -- GitHub PR, issue, and review workflows
  🟡  ast-grep -- unavailable: syntax-aware structural code search
       brew install -q ast-grep
```

It refreshes the example config, asks whether to create `.compound-engineering/config.yaml`, and leaves the missing tools in the summary as install hints.

When the bundled health script is not runnable (on a non-Claude-Code platform, say), the skill runs the same checks inline and still offers the repo-local fixes.

---

## When to reach for it

Use `ce-setup` when:

- You just installed or upgraded the plugin
- You want to verify a repo's CE config, artifact root, and gitignore state
- A workflow reported an optional tool missing and you want the install command
- You are onboarding a repo to `.compound-engineering/config.yaml`
- Health marked `docs_root` or the CE Work engine block invalid

Skip it when:

- You already know the exact tool to install
- You want to update the plugin itself (use the host plugin manager)
- You want every possible CE binary installed in one shot. It will not do that.

`ce-setup` is not a pipeline stage. Run it whenever you need a diagnosis or a safe config write; the summary prints the invocation so you can re-run it later.

---

## Reference

| Phase | Step |
|-------|------|
| Diagnose | Plugin version when the host exposes it, optional capabilities, project config, artifact root, work-engine block |
| Fix | Obsolete local-md, example refresh, create repo config if wanted, gitignore safety, scratch-space gitignore, repair invalid `docs_root` or work-engine prefs |
| Summary | Fixes applied, skipped actions, missing optional tools |

---

## FAQ

**What is `compound-engineering.local.md` and why is it obsolete?**
It was the old machine-local config file. Team defaults now live in `.compound-engineering/config.yaml`, and `config.local.yaml` is the optional per-checkout override. Review-agent selection is automatic.

**Why gitignore `.compound-engineering/config.local.yaml`?**
It is a per-checkout override, so committing it defeats the point. The committed `config.example.yaml` shows the available settings. Setup creates the repo file, never the override.

---

## See Also

- [Compound Engineering configuration](./configuration.md): every supported option, its consumer, and precedence
- [`/ce-test-browser`](./ce-test-browser.md): uses `agent-browser` when no capable host-native browser is available
- [`/ce-dogfood`](./ce-dogfood.md): uses `agent-browser` for diff-scoped QA
- [`/ce-product-pulse`](./ce-product-pulse.md): reads pulse settings from CE config (local then repo)
