---
name: ce:write
description: "Develop, outline, and draft prose in Jeff's voice against the voice guide. Use when writing an essay, email, doc, or announcement — invoked per stage (stage:develop, stage:outline, stage:draft), typically by the Perkins orchestrator."
argument-hint: "stage:<develop|outline|draft> [brief:<path>] [outline:<path>] [topic or description]"
---

# Write (voice-guided prose generation)

Produces prose in Jeff's voice through three stages — develop the idea, outline the shape, draft the prose — each grounded in the voice guide. This skill handles the generation arc of the writing workflow; review is handled by `ce:prose-review`.

Each stage runs independently and is normally invoked one at a time by the Perkins orchestrator (`/ce:run perkins`), but each also works standalone.

## Interaction Method

Use the platform's question tool when available (`AskUserQuestion` in Claude Code, `request_user_input` in Codex, `ask_user` in Gemini). Otherwise, present numbered options in chat and wait for a reply before proceeding. In pipeline mode (see below), skip interaction and use what the args and context provide.

## Step 1: Parse arguments

Extract from the input:
- **Stage** — `stage:<value>` where value is `develop`, `outline`, or `draft`. Required. If absent, infer: no brief present → `develop`; brief present, no outline → `outline`; both present → `draft`.
- **Brief path** — `brief:<path>`. Used by `outline` and `draft`.
- **Outline path** — `outline:<path>`. Used by `draft`.
- **Topic** — the remaining text after extracting the tokens: the subject of the piece.

## Step 2: Locate the voice guide

The voice guide is the single source of truth for how Jeff writes. Find it in priority order:

```bash
# 1. Project override, if this project has a house voice
VOICE_GUIDE=""
if [ -f "docs/writing/voice-guide.md" ]; then
  VOICE_GUIDE="docs/writing/voice-guide.md"
# 2. The live, compounding guide
elif [ -f "$HOME/.config/compound-engineering/voice-guide.md" ]; then
  VOICE_GUIDE="$HOME/.config/compound-engineering/voice-guide.md"
fi
```

If no guide is found, report: "No voice-guide.md found. Seed it from ce-reviewers-jsl's voice/voice-guide.md into ~/.config/compound-engineering/, or run the Perkins bootstrap. Proceeding will produce generic prose, not Jeff's voice." Then either stop (pipeline mode) or ask whether to proceed.

Read the voice guide in full before generating anything. It is loaded fresh every run so the latest compounded rules apply.

## Step 3: Determine the working directory

Prose artifacts live under `docs/writing/<run-slug>/`, where `<run-slug>` is a short kebab-case title derived from the topic (e.g. `docs/writing/jtbd-alignment-essay/`). Reuse the slug the orchestrator passes via the brief/outline paths when present, so all three stages write to the same folder.

## Step 4: Run the stage

Load the reference for the current stage and follow it:

- `stage:develop` → read `references/develop.md`. Produces `brief.md`.
- `stage:outline` → read `references/outline.md`. Produces `outline.md`.
- `stage:draft` → read `references/draft.md`. Produces `draft.md`.

Each reference defines the procedure, the output artifact, and the voice-guide sections that stage leans on hardest.

## Step 5: Report the artifact path

End by stating the path of the artifact written (`brief.md`, `outline.md`, or `draft.md`) so the orchestrator can thread it into the next phase. In pipeline mode, this path is the return value — state it plainly, with no surrounding prose.

## Pipeline Mode

When invoked from the Perkins orchestrator, skip interactive approval questions. Use the stage, brief, and outline provided in args. For `develop`, if the brief cannot be completed without a question the user must answer (e.g. the audience is genuinely unknown), write the brief with the gap marked `⚠ NEEDS INPUT` and report it, rather than blocking — the orchestrator surfaces it at the gate.
