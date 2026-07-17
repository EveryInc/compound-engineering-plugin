---
name: ce:prose-review
description: "Review a piece of writing with the seven-voice editorial panel against the voice guide. Use to review a draft essay, email, or doc for voice, rhythm, concision, structure, formatting, audience, and terms of art — typically invoked by the Perkins orchestrator, but works standalone on any prose file."
argument-hint: "target:<path-to-draft> [brief:<path>] [mode:report|headless]"
---

# Prose Review (the seven-voice panel)

Reviews a prose file with the writing panel — seven named editors, each owning one dimension of Jeff's voice. Dispatches them in parallel, each returning structured JSON findings against the voice guide, then merges and synthesizes the findings by theme.

Unlike `ce:review`, this skill needs **no git diff** — the input is a file. The draft is the unit of review.

## Step 1: Parse arguments

- **Target** — `target:<path>`, the prose file to review (usually `docs/writing/<slug>/draft.md`). Required. If absent, ask for the file (or, standalone, review the most recently modified file under `docs/writing/`).
- **Brief** — `brief:<path>`, optional. Supplies audience and purpose so the panel — Handley and Garner especially — can judge fit to the intended reader.
- **Mode** — `mode:report` (default) presents findings for a human or orchestrator to act on; `mode:headless` skips all interaction and returns findings as the terminal value for a calling skill. This skill never edits the draft — revision is the caller's job (Perkins revises in the review loop).

## Step 2: Locate the panel

Find the plugin and the writing reviewers:

```bash
# Prefer the active Claude profile over a global search
if [ -n "$CLAUDE_CONFIG_DIR" ]; then
  PLUGIN_DIR=$(find "$CLAUDE_CONFIG_DIR" -path "*/compound-engineering/*/agents/review" -type d 2>/dev/null | head -1 | sed 's|/agents/review$||')
fi
if [ -z "$PLUGIN_DIR" ]; then
  PLUGIN_DIR=$(find "$HOME/.claude" "$HOME/.claude-"* -path "*/compound-engineering/*/agents/review" -type d 2>/dev/null | head -1 | sed 's|/agents/review$||')
fi
PLUGIN_DIR="${PLUGIN_DIR:-plugins/compound-engineering}"
```

Read every `.md` file in `$PLUGIN_DIR/agents/review/` using the native file-search/glob tool (e.g. Glob in Claude Code) and select those whose frontmatter has `category: writing`. That set is the panel: king-voice, provost-rhythm, orwell-concision, minto-structure, nielsen-formatting, handley-audience, garner-vocabulary.

If no `category: writing` reviewers are found, report: "No writing reviewers found in agents/review/. Run /ce:refresh to sync them from ce-reviewers-jsl." Then stop.

## Step 3: Locate the voice guide

Same resolution the reviewers use, so the skill can confirm it exists and pass its path:

1. `docs/writing/voice-guide.md` (project override), else
2. `$HOME/.config/compound-engineering/voice-guide.md` (the live guide).

If neither exists, warn that the panel will fall back to first principles and be much weaker, then proceed (or stop in headless mode).

## Step 4: Read the inputs

Read the target draft in full and the brief if provided. These are passed to every reviewer as content (the draft is the whole point of the review; pass it inline, not as a path the subagent must re-open).

## Step 5: Dispatch the panel

Read `references/prose-reviewer-template.md` for the subagent prompt template.

For each writing reviewer selected in Step 2:
1. Read the reviewer's `.md` content.
2. Fill the template variables: `{reviewer_persona}`, `{voice_guide_path}`, `{brief}`, `{draft}`.
3. Spawn a sub-agent with the caller's `agent-model` (Perkins sets `sonnet`; default to `sonnet` if unspecified).

Spawn all seven in parallel. If parallel dispatch is unavailable, spawn sequentially. If a reviewer times out or fails, note it and continue with the results received — a partial panel still has signal.

## Step 6: Merge and synthesize

Collect the seven JSON responses. Then:

1. **Merge.** Flatten all findings. De-duplicate: when two reviewers flag the same quote for related reasons, keep both perspectives but group them (e.g. King and Orwell both on a generic sentence).
2. **Rank.** High severity first, then medium, then low. Within a tier, order by confidence.
3. **Synthesize by theme, not by reviewer.** Group findings by what's wrong with the piece, naming the editors who raised each — "King and Handley both read the opening as writer-centered." Lead with voice (King) and audience (Handley) findings when they fire; those two most decide whether the piece works.
4. **Collect guide candidates.** Gather every `voice_guide_updates_needed` entry across reviewers into one list — this is the raw material for Perkins's compound phase.

## Output

```markdown
## Prose Review: <draft title>

**Panel verdict:** <one line — does it sound like Jeff yet, and what's the biggest gap>

### Blockers (high severity)
- **<theme>** — <finding>. *(King, Orwell)*
  - Quote: "<offending text>"
  - Fix: <concrete rewrite>

### Worth fixing (medium)
- ...

### Minor (low)
- ...

### Reads-aloud check
<Provost's rhythm verdict — clean, uneven, or monotone, with the worst passage.>

### Candidate voice-guide rules
<Merged voice_guide_updates_needed — hand to the compound phase.>
```

## Pipeline / headless mode

When invoked by Perkins (`mode:headless`), skip all interaction, return the structured findings and the candidate-rules list as the terminal output, and do not edit the draft. Perkins reads the findings, revises `draft.md`, and re-invokes this skill until no high-severity findings remain and Provost reports the read-aloud clean.
