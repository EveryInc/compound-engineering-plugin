# `ce-sessions`

> Search and ask questions about your coding agent session history across Claude Code, Codex, and Cursor.

`ce-sessions` is the **session-history search** skill. It's a thin user-facing entry point that dispatches `ce-session-historian` to search session files across all three major coding harnesses (Claude Code, Codex, Cursor) for context relevant to your question — what you worked on, what was tried before, how a problem was investigated, what happened recently, decisions made.

Useful when memory fades, when picking up work in a new session, when you suspect "we tried this before but I can't remember the result", or when reconstructing the path that led to a current state.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Searches your session history across Claude Code / Codex / Cursor for context relevant to a question |
| When to use it | "What did we work on this week?", "What did I try before?", "How was X investigated?", "What did the agent decide about Y?" |
| What it produces | A synthesized digest of relevant findings — what was tried, what didn't work, key decisions, related context |
| Cross-platform | Reads sessions from `~/.claude/projects/`, `~/.codex/sessions/`, `~/.cursor/projects/` |

---

## The Problem

Coding agent session history is ephemeral by default:

- **Memory fades between sessions** — the new session starts cold even when prior context is highly relevant
- **Repeated investigations** — the same hypothesis gets tested twice because the first session's negative result was forgotten
- **Cross-harness blindness** — work in Codex doesn't show up to a Claude Code agent, even on the same repo
- **Branch-scoped context lost** — a discussion two weeks ago on the same branch is unreachable without tooling
- **Knowing-it-happened isn't enough** — knowing "we tried this" without the *result* still leads to retrying it

## The Solution

`ce-sessions` dispatches `ce-session-historian` — a specialized agent that reads session files across all three harness platforms, applies time and repo filters, extracts findings relevant to the user's question, and synthesizes a structured digest:

- What was tried before
- What didn't work (and why)
- Key decisions
- Related context

The agent operates outside the working directory (in the harness session-file directories) which orchestrator-level tools often can't access — that's why this is delegated rather than handled inline.

---

## What Makes It Novel

### 1. Cross-harness session reading

`ce-session-historian` reads from all three locations the agent might have left context in:

- `~/.claude/projects/` (Claude Code)
- `~/.codex/sessions/` (Codex)
- `~/.cursor/projects/` (Cursor)

If you used Codex yesterday and Claude Code today, this skill finds yesterday's context. Single-harness tools don't.

### 2. Question-driven synthesis, not raw transcript dump

The agent doesn't return a flat list of session content. It synthesizes findings against the user's question with structured sections:

- **What was tried before** — approaches the agent attempted, with outcomes
- **What didn't work** — failed hypotheses with reasons
- **Key decisions** — choices made in prior sessions and the reasoning
- **Related context** — adjacent findings that bear on the question

If no relevant prior sessions exist, the digest says so explicitly rather than fabricating findings.

### 3. Branch-aware filtering

The skill pre-resolves the current git branch and passes it to the agent so session searches can filter to work done on the same branch — usually what's most relevant when picking up work or reconstructing recent context. The pre-resolution uses the `!` backtick mechanism: if it resolves to a plain branch name, it's passed in; if it returns the literal command string (failed resolution), it's omitted and the agent derives the branch at runtime.

### 4. Thin orchestrator, agent does the work

The skill itself is a thin entry point — its job is to ask "what would you like to know?" if no question was provided, then dispatch the historian. The historian handles the actual search, time filtering, transcript parsing, and synthesis. This keeps the user-facing surface tiny while the heavy lifting stays in a specialist agent.

### 5. Time-window control

The historian accepts time hints in the question itself ("recently", "last week", "since the auth refactor", explicit dates). It resolves those to real time windows and applies them when filtering sessions. The default window is bounded so the agent doesn't read every session file ever — relevance is privileged over recall.

---

## Quick Example

You're picking up work on a feature you started two weeks ago. You can't quite remember whether you settled on per-subscription mute state or per-user mute state, and you want to confirm before continuing. You invoke `/ce-sessions "did we decide where notification mute state lives?"`.

The skill pre-resolves the branch (`tmchow/notification-mute`) and dispatches `ce-session-historian` with the question, current working directory, and branch hint.

The historian searches sessions on this branch over the last 30 days across all three harness locations. It finds: 4 Claude Code sessions, 1 Codex session. It reads through them looking for evidence on the mute-state question. It returns a digest:

- **Key decisions:** "Settled on per-subscription mute state (notification_subscription.mute_until) rather than per-user, per session 2026-04-22. Rationale: per-user would force a global mute across all notification types; users wanted per-type control."
- **Related context:** "Earlier session considered a separate `mutes` table with subscription_id foreign keys. Rejected because the lifecycle is identical to the subscription itself."

You have the answer. Continue from where you left off, with the previous decision context restored.

---

## When to Reach For It

Reach for `ce-sessions` when:

- You're picking up work and need context on what was decided / tried before
- A new session can't see what an earlier session learned
- You suspect "we tried this before but I can't remember"
- You're reconstructing the path that led to a current state
- The question is "when did we decide X" or "how did we investigate Y"

Skip `ce-sessions` when:

- The context lives in committed code or docs, not in agent sessions → just read the code/docs
- You want general session metadata (count, timestamps, sizes) without semantic search → use the underlying `ce-session-inventory` directly
- The question is about a single specific session you remember well — open the session file directly

---

## Use as Part of the Workflow

`ce-sessions` is mostly invoked standalone, but interlocks with other skills:

- **`/ce-compound` Phase 1 (Full mode)** — optionally dispatches the same `ce-session-historian` as a foreground agent to search prior sessions for related context, folding findings into the new learning's "What Didn't Work" section
- **`/ce-debug` Triage** — prior-attempt awareness; when the user indicates failed attempts, asking "what have you already tried" before investigating avoids repeating known-failed approaches

This skill is the user-facing way to invoke session search; the other skills invoke the agent directly when they need it.

---

## Use Standalone

Most use is direct:

- **With a question** — `/ce-sessions "did we decide where notification mute state lives?"`
- **Without a question** — `/ce-sessions` asks "what would you like to know about your session history?"
- **Time-bounded** — the question can include time hints ("recently", "last week", "since the auth refactor")
- **Topic-bounded** — the question can name a topic, file, or feature ("how was the migration tested", "what did we try for the N+1 query")

---

## Reference

| Argument | Effect |
|----------|--------|
| _(empty)_ | Asks "what would you like to know?" |
| `<question>` | Direct question to search history for |
| `<topic>` | Topic to gather context on |

The skill pre-resolves the current git branch and passes it to the historian when it resolves cleanly. The historian decides time windows from the question; the default is bounded.

---

## FAQ

**Does it work across Claude Code, Codex, and Cursor?**
Yes — `ce-session-historian` reads from `~/.claude/projects/`, `~/.codex/sessions/`, and `~/.cursor/projects/`. Cross-harness work shows up.

**What does it return when there's no relevant prior session?**
A "no relevant prior sessions" message in the digest. The skill doesn't fabricate findings to fill the digest.

**How does it filter for relevance?**
The historian uses the question to drive a relevance filter. It reads session content selectively — usually filtered by repo, branch, and time window — and synthesizes against what the question asks for. It doesn't dump raw transcripts.

**Why a separate skill vs just a slash to the agent?**
Because the user-facing surface should ask the right question if one wasn't given, and the skill handles the branch pre-resolution and dispatch shape consistently. The agent does the actual work, but invoking it directly skips the user-facing check and the cross-harness convention.

**Can it read sessions from machines I'm not on?**
No. It reads local session files only — `~/.claude/projects/` etc. Sessions on other machines aren't accessible.

**Does it work for non-software questions?**
The historian doesn't care about the topic — it searches whatever is in your session files. If you've used the agent for non-software work and want history on that, this skill works.

---

## See Also

- [`ce-compound`](./ce-compound.md) — invokes the same `ce-session-historian` (opt-in) during Full-mode capture for prior-context enrichment
- [`ce-debug`](./ce-debug.md) — prior-attempt awareness uses similar context; ask the user about prior failed attempts when the signal is there
- [`ce-session-inventory`](../../plugins/compound-engineering/skills/ce-session-inventory/) — lower-level skill for session metadata (timestamps, sizes, branch); used by the historian internally
- [`ce-session-extract`](../../plugins/compound-engineering/skills/ce-session-extract/) — extracts conversation skeleton or error signals from a single session file; also used by the historian
