# Interactive and non-interactive modes

If the arguments contain `mode:non-interactive` (or its deprecated alias `mode:headless`), strip those tokens (the remainder is a scope hint) and run **non-interactive**; otherwise run **interactive**.

**Interactive:** apply unambiguous actions directly; ask the user only on genuine judgment calls (the Decide section of `references/classify.md` lists them).

**Non-interactive:** never pause for input, in any phase.

- Apply all safe actions: Keep, Update, Consolidate, auto-Delete (only under the three-condition gate in `references/classify.md`), Replace (when evidence is sufficient). If a write succeeds, record it as **applied**; if it fails (e.g., permission denied), record it as **recommended** and continue — never stop to ask for permissions.
- When classification is genuinely ambiguous or Replace evidence is insufficient, mark the doc stale instead: add `status: stale`, `stale_reason: [what you found]`, `stale_date: YYYY-MM-DD` to its frontmatter. Err toward stale-marking over incorrect action. If even that write fails, record it as recommended.
- Relocations auto-apply only under the four-condition gate in `references/classify.md`; otherwise recommend. Splits are always recommend-only: fragment boundaries are a retrieval-value judgment with no ground truth.
- With no scope hint, process everything — no scope-narrowing questions. With a scope hint that matches nothing, report the miss and exit; do not widen to all docs.
- The report (see Report) is the primary deliverable.

## Blocking questions

Wherever this skill asks the user something, use the platform's blocking question tool: `AskUserQuestion` in Claude Code (call `ToolSearch` with `select:AskUserQuestion` first if its schema isn't loaded), `request_user_input` in Codex, `ask_question` in Antigravity CLI (`agy`), `ask_user` in Pi (requires the `pi-ask-user` extension). Fall back to numbered options on the host's user-visible chat surface only when no blocking tool exists in the harness or the call errors (e.g., Codex edit modes) — not because a schema load is required. Never silently skip the question. Ask one question at a time, prefer multiple choice, lead with the recommended option and a one-sentence rationale.

## CONCEPTS.md bootstrap requests

If invoked specifically to create or bootstrap `CONCEPTS.md` ("create a CONCEPTS.md", "build the concept map"), the intent is ambiguous between two jobs — disambiguate with a blocking question:

1. **Create CONCEPTS.md (build the concept map)** — skip the `<root>/solutions/` classification work. Read `references/concepts-vocabulary.md` and follow its **Seed goal** and **Scope of a seed** (repo-wide) rules: seed the project's core domain nouns from the declared domain model, write the preamble (see Vocabulary Capture), cluster per the organization rules, run the Discoverability Check per `references/discoverability.md`, then commit per `references/commit.md` — do not leave the bootstrap uncommitted.
2. **Run a refresh cycle** — proceed normally; `CONCEPTS.md` is seeded (if absent) and reconciled during Vocabulary Capture.

In non-interactive mode, default to the refresh cycle and note in the report that a standalone repo-wide bootstrap was not run.
