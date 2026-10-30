# `ce-setup`

> Check Compound Engineering health, optional tool availability, and repo-local config safety. It does not bulk-install the plugin's dependencies.

`ce-setup` is a diagnosis and config utility. It reports which optional tools are on PATH, refreshes the committed config example, creates the repo `config.yaml` if you approve, offers to gitignore a local override or CE scratch space, offers to point your agent-instructions file at the knowledge store and add standing compounding and `ce-noslop` chat-register instructions, and offers to draft `CODING_STANDARDS.md` and `REVIEW.md` from your pull request history. It also reports where CE artifacts will land and can repair an invalid `docs_root` or a broken CE Work engine block.

It runs only when you invoke it explicitly (`disable-model-invocation: true`). Talking about setup does not start it. Outside a git repository it reports capabilities and stops without writing files.

See [Compound Engineering configuration](./configuration.md) for every option and how local defaults interact with session and project instructions.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Runs a health check, reports optional tools, refreshes the example config, applies only the repo-local fixes you approve, and scaffolds a Compound Pack on request |
| When to use it | First install, after an upgrade, when a skill says a tool is missing, or when onboarding a repo |
| What it produces | A setup report, plus any config or gitignore edits you accepted |
| What it does not do | Bulk-install optional CE dependencies, update the plugin itself, or create `config.local.yaml` |

---

## Example invocations

Bare, one command covers first install, a re-check after an upgrade, a missing-tool report, and a directory that is not a git repo. `pack:<id>` scaffolds a Compound Pack instead (see [Scaffold a Compound Pack](#scaffold-a-compound-pack)), and `standards` goes straight to drafting the review docs (see [Review docs](#review-docs)).

```text
/ce-setup
/ce-setup pack:house-rules
/ce-setup standards
```

On oh-my-pi the invocation is `/skill:ce-setup`. On Codex it is `$ce-setup` when that host uses dollar-prefixed skills.

---

## Why setup does not install everything

Compound Engineering has two separate setup surfaces:

- **Repo-local state** that should stay consistent and safe: the committed config example, the repo `config.yaml`, and gitignore coverage for `config.local.yaml` and `.context/compound-engineering/` scratch.
- **Optional external tools** used by specific workflows: `agent-browser`, `gh`, `jq`, `ast-grep`, `ffmpeg`, and Node 22.13 or newer with `npx` for cross-model peers.

A missing optional tool is not a broken plugin. Most workflows never touch `ffmpeg` or `ast-grep`, so installing everything up front is wasted footprint. `ce-setup` reports what is missing, says which workflow each tool serves, and prints the install command. You install only what you use.

## What it fixes

The example config refresh happens on its own (it is the committed template copy). Everything else waits for your approval:

- Deletes the obsolete `compound-engineering.local.md` if you say yes.
- Refreshes `.compound-engineering/config.example.yaml` from the bundled template, always, inside a git repo.
- Offers to create `.compound-engineering/config.yaml` when missing. Never overwrites an existing `config.yaml` or `config.local.yaml`, and never creates the local override.
- Offers to add `.compound-engineering/*.local.yaml` to `.gitignore`, but only when `config.local.yaml` already exists and is not ignored.
- Offers to add `.context/compound-engineering/` to `.gitignore` whether or not that directory exists yet. An uncovered path is a note, not a project issue.
- Offers to add a line about the `<root>/solutions/` knowledge store to your root agent-instructions file (`AGENTS.md`, `CLAUDE.md`, or equivalent) when the file does not already convey it, placed in the file's own structure. Then offers the standing compounding instruction from the [ce-compound guide](./ce-compound.md#make-capture-automatic), offer-first or automatic, inserted verbatim. Only when the store is tracked in this repo, and never creates the file. Then offers the `ce-noslop` chat-register instruction, inserted verbatim, so agent reports and summaries to you lead with the outcome and carry no acknowledgements, offers of more help, or process narration. Skipped only when the file already covers the report boundary, that register, and the exclusions (code, config, verbatim quotes, text you asked to post as written); a partial or unrelated writing rule still gets the offer.
- Offers, in one question, to draft or update `CODING_STANDARDS.md` and `REVIEW.md` from your recent pull requests, plus a line in your agent-instructions file pointing agents to each. See [Review docs](#review-docs).
- Repairs an invalid CE Work implementation-engine block, or leftover retired routing keys, in the config layer that supplied the bad value.
- Offers to warm the npm cache for cross-model peers when Node 22.13 or newer and `npx` are present. On approval it downloads an eligible acpx version from the supported range and the codex and claude adapters associated with its upper bound without starting them (npm still runs any install scripts they declare, as a first peer run would), reducing first-run downloads in `ce-pov`, `ce-doc-review`, `ce-code-review`, and `ce-work`; an older policy-selected acpx release may fetch different adapter packages. Declining fetches nothing; the first peer run downloads them instead.
- Repairs an invalid `docs_root`. This one is a real project issue: CE artifacts will not be written until it is fixed. See [Artifact root](./configuration.md#artifact-root).

Each question uses the host's blocking question tool when one exists. It never silently auto-configures.

## Review docs

Most teams want a coding-standards file and never get past the blank page. Setup drafts a starting point from evidence the repository already has: review findings authors fixed, findings the team declined, fix commits, solution records, and rules already sitting in the agent-instructions file. It shows every draft, with the pull requests behind each rule, before writing anything.

| File | Holds | Read by |
|------|-------|---------|
| `CODING_STANDARDS.md` | Rules code here follows: defect classes visible in a diff that no lint, type, or CI check covers | Agents writing code, and every code review, including [`ce-code-review`](./ce-code-review.md#repo-owned-review-criteria) |
| `REVIEW.md` | How review behaves here: severity meanings, what not to flag, evidence a finding needs. Starts with `@CODING_STANDARDS.md` | [`ce-code-review`](./ce-code-review.md#repo-owned-review-policy), from the base branch, and Claude Code Review |
| Agent-instructions file | Working instructions, plus one line per review doc saying what it is and when to read and update it | Every agent session |

A rule needs evidence: a fixed review finding, a fix commit, or a solution record, with no check already enforcing it. A "what not to flag" category needs findings declined across several pull requests. When the history supports no `REVIEW.md` section, setup does not draft one. When a file exists, setup offers to update it and shows the change as a diff. A repository with no history to draft from gets no offer. Asking for any one of these (`/ce-setup standards`, or "set up our coding standards") skips the health check and the offer and drafts the whole set, still previewed before writing. `STRATEGY.md` comes from an interview rather than history, so setup suggests [`ce-strategy`](./ce-strategy.md) when it is missing instead of drafting one.

## Scaffold a Compound Pack

`/ce-setup pack:<id>` (or asking it in words to add or create a pack) starts a [Compound Pack](./packs.md) in the one layout discovery reads. It resolves `compound-packs/<id>/` at the repo root, refuses a directory that already has content, and previews everything before one approval: a `README.md` with a single line saying what the pack governs, a first rule file from a bundled template (`title`, two example `applies_when` situations, `tags`, and a prescriptive body with a placeholder to replace), and `- source: compound-packs/<id>` appended under `packs:` in `.compound-engineering/config.yaml`, created from the template when the file is missing. It then runs the health check and reports the `pack <id>` line, and tells you the layout rule: a rule is discovered only when it is a top-level `.md` with `title` and `applies_when`; `README.md` is the description, and subfolders are storage ([Pack layout](./packs.md#pack-layout)). In a non-interactive run it prints the preview and writes nothing.

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
| `node` | Cross-model peers: Node 22.13 or newer with `npx`, which resolves acpx within its tested compatibility range |
| `antigravity` | Gemini cross-model peer. Shown only when `cross_model_peer` or a `work_engine_preferences` entry names `antigravity`, or when `agy_acp_server.par` is on `PATH`. It checks that the Antigravity ACP runtime is on `PATH` and that its `localharness_external` helper is executable at `ANTIGRAVITY_HARNESS_PATH` or beside the runtime. When either is missing, it links the [official ACP registry download](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json). The runtime is not an npm package, so the cache warm does not fetch it. |

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
- You want to start a Compound Pack with `pack:<id>` in the layout discovery reads
- You want starting `CODING_STANDARDS.md` and `REVIEW.md` drafts from your PR history (`standards`)
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
| Fix | Obsolete local-md, example refresh, create repo config if wanted, gitignore safety, scratch-space gitignore, repair invalid `docs_root` or work-engine prefs, knowledge-store mention, compounding directive, and `ce-noslop` chat-register directive in the agent-instructions file |
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
