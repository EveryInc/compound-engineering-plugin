# `ce-setup`

> Check Compound Engineering health, optional tool capabilities, and repo-local config safety. It does not bulk-install the plugin's dependencies.

`ce-setup` is a **diagnosis and config** utility. It reports which optional tools are on PATH, creates repo `config.yaml` when missing (after you approve), refreshes the committed config example, and offers to gitignore a local override or CE scratch space. It also reports where artifacts will land and can repair an invalid `docs_root` or a broken CE Work engine block.

It is explicit-invocation only (`disable-model-invocation: true`). Talking about setup does not start it.

Outside a git repository it reports capabilities and stops. It does not create repo files there.

See [Compound Engineering configuration](./configuration.md) for every option and how local defaults interact with session and project instructions.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs a health check, reports optional tools, refreshes the example config, and applies only the repo-local fixes you approve |
| When to use it | First install, after an upgrade, when a skill says a tool is missing, or when onboarding a repo |
| What it produces | A setup report, plus any config or gitignore edits you accepted |
| What it does not do | Bulk-install every optional CE dependency, update the plugin itself, or create `config.local.yaml` |

---

## Example invocations

The skill takes no feature argument. The same command covers first install, a later re-check, and a repo that is not a git checkout.

```text
# First install, or a later re-check of tools and repo config
/ce-setup

# Same command after a plugin upgrade, to refresh
# .compound-engineering/config.example.yaml and notice new keys
/ce-setup

# Same command when a skill said gh, agent-browser, or another
# optional tool is missing. The report prints the install command.
/ce-setup

# Same command in a directory that is not a git repo.
# It reports optional tools and stops without writing files.
/ce-setup
```

On oh-my-pi the invocation is `/skill:ce-setup`. On Codex it is `$ce-setup` when that host uses dollar-prefixed skills.

---

## The Problem

Compound Engineering has two different setup surfaces:

- **Repo-local state** that should stay consistent and safe: the committed config example, the repo `config.yaml`, gitignore coverage if a `config.local.yaml` override exists, and (optionally) gitignore coverage for `.context/compound-engineering/` scratch.
- **Optional external tools** used by specific workflows: `agent-browser` for browser testing and dogfood QA, `gh` for GitHub, `jq` for shell JSON, `ast-grep` for structural search, `ffmpeg` for Riffrec media analysis.

A missing optional tool is not a broken plugin. Treating those as one install step forces a dependency footprint most workflows never use.

## The Solution

`ce-setup` diagnoses first, then remediates only repo-local project issues. The example config is refreshed on its own. Other writes wait for approval:

- Deletes obsolete `compound-engineering.local.md` if you say yes.
- Refreshes `.compound-engineering/config.example.yaml` from the bundled template. Always, inside a git repo.
- Offers to create `.compound-engineering/config.yaml` if it is missing. Does not create `config.local.yaml`. Does not overwrite either file if it already exists.
- Offers to add `.compound-engineering/*.local.yaml` to `.gitignore` only when `config.local.yaml` already exists and is not ignored.
- Offers to add `.context/compound-engineering/` to `.gitignore` whether or not that directory exists yet. An uncovered path is a note, not a project issue.
- Reports the resolved artifact root and which config layer supplied it. An invalid `docs_root` is a project issue. CE artifacts will not be written until it is fixed. See [Artifact root](./configuration.md#artifact-root).
- Explains and repairs an invalid CE Work implementation-engine block, or leftover retired routing keys, in the layer that supplied the bad value.
- Prints install commands or URLs for missing optional tools. It does not bulk-install them.

Each question uses the host's blocking question tool when one exists. It does not silently auto-configure.

---

## What Makes It Novel

### Capabilities are informational

Missing `ffmpeg` or `ast-grep` does not fail setup. The report says which workflows those tools serve and how to install them. You install only what you use.

### Repo files are opt-in writes

The example config is the one file it refreshes on its own (it is the committed template copy). Creating `config.yaml`, appending gitignore lines, deleting the obsolete local-md file, and editing a broken `docs_root` or work-engine block all wait for approval. Existing `config.yaml` and `config.local.yaml` are never overwritten wholesale.

### It tells you where artifacts will land

The health report includes the resolved artifact root (`docs/` by default, or a valid `docs_root` from `config.yaml`). `docs_root` in `config.local.yaml` is ignored. If local still has one, setup says so and offers to move it into `config.yaml`.

---

## Optional Capabilities

| Tool | Capability |
|------|------------|
| `agent-browser` | browser testing and dogfood QA |
| `gh` | GitHub PR, issue, and review workflows |
| `jq` | JSON inspection in shell-based workflows |
| `ast-grep` | Syntax-aware structural code search |
| `ffmpeg` | Media chunking and screenshot extraction for Riffrec analysis |

---

## Quick Example

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

Project config
  🟢  No obsolete compound-engineering.local.md
  ➖  No repo config yet (.compound-engineering/config.yaml)
  🟡  Example config missing (.compound-engineering/config.example.yaml)
```

It refreshes the example config and asks whether to create `.compound-engineering/config.yaml`. It does not create `config.local.yaml`. Missing optional tools stay in the summary as install hints.

When the bundled health script is not runnable, the skill runs the same checks inline and still offers the repo-local fixes.

---

## When to Reach For It

Use `ce-setup` when:

- You just installed or upgraded the plugin
- You want to verify a repo's CE config, artifact root, and gitignore state
- A workflow reported an optional tool missing and you want the install command
- You are onboarding a repo to `.compound-engineering/config.yaml`
- Health marked `docs_root` or the CE Work engine block invalid

Skip it when:

- You already know the exact tool to install
- You are trying to update the plugin itself (use the host plugin manager)
- You want every possible CE binary installed in one shot. This skill will not do that.

---

## Use Standalone

`ce-setup` is not a pipeline stage. Run it when you need a diagnosis or a safe config write. Re-run anytime. The summary prints the same invocation so you can do that.

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Diagnose, then remediate repo-local issues you approve. Outside a git repo: report optional tools and stop. |

| Phase | Step |
|-------|------|
| Diagnose | Plugin version when the host exposes it, optional capabilities, project config, artifact root, work-engine block |
| Fix | Obsolete local-md, example refresh, create repo config if wanted, gitignore safety, scratch-space gitignore, repair invalid `docs_root` or work-engine prefs |
| Summary | Fixes applied, skipped actions, missing optional tools |

---

## FAQ

**Why does setup not install everything?**
Most CE workflows do not need every optional tool, and modern harnesses already provide some capture and browser affordances. Setup reports capabilities instead of forcing a broad install.

**What is `compound-engineering.local.md` and why is it obsolete?**
It was the old machine-local config file. Team defaults now live in `.compound-engineering/config.yaml`. `config.local.yaml` is the optional per-checkout override. Review-agent selection is automatic.

**Why might `.compound-engineering/config.local.yaml` be gitignored?**
It is the optional override. The committed `config.example.yaml` shows available settings. Setup creates the repo file, not the override.

**Does it run on non-Claude-Code platforms?**
Yes. When the bundled health script is not directly runnable, the skill falls back to equivalent inline checks and still performs repo-local config remediation.

---

## See Also

- [Compound Engineering configuration](./configuration.md): every supported option, its consumer, and precedence
- [`/ce-test-browser`](./ce-test-browser.md): uses `agent-browser` when no capable host-native browser is available
- [`/ce-dogfood`](./ce-dogfood.md): uses `agent-browser` for diff-scoped QA
- [`/ce-product-pulse`](./ce-product-pulse.md): reads pulse settings from CE config (local then repo)
