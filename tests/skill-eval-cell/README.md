# Skill-eval cell driver

Extract `skills/<name>` from a git ref and run the same prompt on the CLIs already on PATH: `claude`, `codex`, `grok`. Bills those products (whatever you already use to run the harness). No extra Anthropic/OpenAI API key. No Vercel AI SDK.

Default hosts are the **other two** from the calling harness (Claude Code → Codex+Grok, Codex → Claude+Grok, Grok → Claude+Codex). `--hosts` overrides that. A missing CLI prints `warning: skipping <host>: …` and the run continues with whatever is left. If no peers are installed it falls back to the current harness and prints `warning: own-eval only …`. Exit 2 only when nothing can run. `summary.json` records `current_harness`, `hosts_wanted`, `hosts_run`, `own_eval_only`, and `warnings`. Not in default `bun test` except mechanical pins (`hosts.test.ts`, `extract.test.ts`, `path-shim.test.ts`). Cursor is not a default host (`cursor-agent -p` hangs without prior trust).

## Run

```bash
bun run test:skill-eval-cell -- \
  --skill ce-debug \
  --fixture tests/skill-eval-cell/fixtures/seat-cap \
  --git-init \
  --shim-git-push \
  --task "mode:pipeline the seat cap test is failing. Run node tests/seat-cap.check.js."
```

`--read-only` maps to the sweep's fake-boundary flags (no Bash/Edit/Write).

Prints a `summary.json` path. Each host gets its own workspace copy plus stdout/stderr, git status/log, and a file list. Grade those; Grok narrates before the answer (grep `FILES_READ:`). Codex transcript is stderr, final message is stdout. `claude -p` is one-tick only.

Gotchas baked in (see `docs/solutions/skill-design/size-driven-skill-restructure.md`): Codex stdin `/dev/null`, `CLAUDECODE` unset, `NO_COLOR=1`.

## Sweep A/B pack

Cases live in `catalog.ts`, authored from the skill bodies **before** the 8KB merges (`PRE_SWEEP_REF` = parent of #1433). The same prompt runs against that ref, then against `origin/main`. See `scenarios.md` for the inventory.

```bash
bun run test:skill-eval-pack -- --list
bun run test:skill-eval-pack -- --wave1 --arm ab
bun run test:skill-eval-pack -- --id ce-babysit-pr/refuse-unasked-update --arm ab
bun run test:skill-eval-pack -- --id lfg/plan-first --arm ab
```

`--arm ab` is pre+post for every catalog skill (the 8KB sweep is fully merged). `--wave1` is the cheap read-only decision set, not every scenario. Live mutation and oracle dispatch are separate ids. `ok` is the only verdict: a listed `files_read_post` miss fails the cell; unlisted references are not graded. Not in default `bun test`.
