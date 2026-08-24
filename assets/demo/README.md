# The "second run" demo

`compound-loop.gif` is the animation embedded at the top of the root [README](../../README.md). It shows the one thing that distinguishes Compound Engineering from any other agent tool: a learning written in one session being read back and applied in a later, unrelated one.

## Regenerating it

```bash
vhs assets/demo/compound-loop.tape
```

`compound-loop.tape` drives [VHS](https://github.com/charmbracelet/vhs); it runs `play.sh` and captures the result. Both files are checked in, so the GIF is reproducible rather than a one-off screen capture. Re-render it whenever the CLI's real output changes so the demo stays truthful.

You can also run `bash play.sh` on its own to preview a change without rendering. The tape exports `CE_DEMO_TAKE=1` and blanks the shell prompt, which is what lets the capture safely outlive the script: no prompt and no cursor draw after `play.sh` exits, so the closing card holds the final frame and `Sleep` in the tape can be retuned freely. A standalone run restores your cursor normally.

## What it is, and what it is not

`play.sh` is a **scripted playback of a real session, not a live agent run.** Every line it prints is transcribed from actual recorded output — Claude Code's `⏺` / `⎿` markers, its `Agent(name) Opus 5 (1M context)` and `Backgrounded agent (↓ to manage · ctrl+o to expand)` lines, and its spinner frames are reproduced as the terminal really renders them, not approximated.

This matters and has one rule: **the shown output must match what the tool actually prints.** A scripted demo of real behavior is a demo. A scripted demo of behavior the tool does not have is a lie. If a skill's output changes, re-transcribe rather than letting the GIF drift.

## Source

The two beats are a genuine matched pair from one repository, 18 days apart, where the second session demonstrably read the first session's output:

- **Beat 1** — `ce-compound` ran after a merged PR and wrote a learning about an auth-gate trap: an env var declared only in `wrangler.jsonc` never reaches a dev worktree, so every authenticated user gets redirected. The arc shown (probe, three parallel research subagents, assemble, write, validators) is the real sequence and the real ordering.
- **Beat 2** — 18 days later, in a different worktree on unrelated work, a `ce-plan` run dispatched a learnings researcher across `docs/solutions/`. It scanned 71 files and returned beat 1's file among its strong matches. Two constraints in the resulting plan — an `assertedOptional` env-plumbing decision and a `.worktreeinclude` caveat — trace to that learning and to nothing in the prompt.

Real timings, for anyone re-cutting this: the three subagents in beat 1 ran 56s / 64s / 76s in parallel, and the full arc took about six minutes. The demo compresses to roughly 35 seconds but preserves the ordering.

## Anonymization

The source sessions are from a private product repository. Everything identifying is substituted, consistently, and the substitutions preserve string-length class so line wraps stay believable: the org, repo, product, and feature names; usernames and home paths; branch names, ticket IDs, PR numbers, and commit SHAs; environment variable and route names.

What is deliberately **kept**: the CE scratch paths under `/tmp/compound-engineering-<uid>/`, the skill and subagent names, the validator output, and the generic infrastructure vendors. Those are the product's real behavior, and faking them would defeat the point.

If you re-mine source material for a new cut, scrub credentials before recording anything — session transcripts routinely contain live tokens and page passwords.
