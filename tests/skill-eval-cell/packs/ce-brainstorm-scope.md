# CE Brainstorm Scope Behavioral Eval

Use this evaluator-owned pack after a change to how `ce-brainstorm` decides what enters the requirements: the recommendation rule (Interaction Rule 9 in `skills/ce-brainstorm/references/interaction-rules.md`), approach recommendations in `references/approaches.md`, or the commitment rule under Requirements in `references/brainstorm-sections.md`. It is not a runtime reference and must not be injected into the agent under test.

A brainstorm should widen the user's thinking and still commit only what the user's goal needs. The pack checks both sides: overbuilding (requirements the user neither asked for, chose, nor needs), and under-expansion (needs the goal depends on that the brainstorm never raises).

## Method

Run the conversation mode. Each persona below is a user with a real goal, needs they will not volunteer, and things they would call overkill. The harness resumes the host session each turn and asks a separate simulated user, who sees only the persona and the conversation, for the next reply:

```bash
bun run test:skill-eval-cell -- --skill ce-brainstorm --with-skill ce-noslop \
  --fixture <fixture-dir> --git-init --hosts <claude|codex> --timeout-secs 3600 \
  --persona <persona-file> --max-turns 25 [--ref <git-ref>] \
  --task "Use ce-brainstorm to explore this idea with me. I'm here and will answer your questions: ask in chat, one question at a time, and wait for my reply. If a handoff menu appears after the result is written, stop there without choosing an option.

Idea: <the persona's opening request>" \
  --out <run-dir>
```

Fixtures: `csv`, `job`, and `ambitious` from `packs/ce-plan-sizing.md`; the `vague` persona uses the `job` fixture. Grade `stdout.txt` (the readable conversation) plus the written document with the conversation rubric, blind to host and ref. Compare a pre-change ref against the working tree on Claude and Codex.

A cheaper single-turn variant gives the user's answers up front and has them reply "your call, go with your recommendation" to everything else. It isolates what the brainstorm recommends when the user delegates, which is where scope grows, but it overstates growth relative to a real conversation. Use the delegated rubric for it.

## Personas

### csv (fixture `csv`)

```markdown
You run a small online shop and own its product decisions.
Opening request: customers keep emailing for a list of their past orders, so you want a "Download CSV" button on the orders page with each customer's own order history.
What you know if asked: columns should be date, status and total; only the signed-in customer's own orders; most customers have fewer than 200 orders.
Needs you will not volunteer but will confirm if the assistant raises them: most requests come from customers doing expense reports, so each row needs the order number to match their receipts.
What you would call overkill if proposed: date-range filters, other file formats, emailing the file, background export jobs.
Style: short answers. For purely technical choices (formats, encodings, how it is built) you say it's the assistant's call.
```

### job (fixture `job`)

```markdown
You lead billing at a small SaaS company.
Opening request: add a nightly job that charges each customer's saved card for their overdue open invoices and marks them paid.
Why: every morning someone spends an hour charging overdue invoices by hand in the payment provider's dashboard. You want that hour back.
What you know if asked: charge the saved card on file; mark an invoice paid only when the charge succeeds; it runs unattended at night.
Needs you will not volunteer but will confirm if the assistant raises them: your team currently follows up on cards that fail, so each morning they need to see which charges failed and why. Customers must never be charged twice for the same invoice.
What you would call overkill for this release if proposed: automatic retry schedules, customer emails, a spending cap or kill switch, an admin UI, audit logs. You would reject them unless the assistant gives a concrete reason they are needed now.
Style: short answers. For technical choices you say it's the assistant's call.
```

### dunning (fixture `ambitious`)

```markdown
You are head of finance operations at a mid-size SaaS company.
Opening request: build a complete dunning system for overdue invoices: a nightly job that charges each customer's saved card, a configurable retry schedule (for example day 1, 3 and 7 after the due date), customer emails before each attempt and after a failure, an admin page that lists failed collections with a manual "retry now" button, and a per-customer switch to pause collection.
Everything in the request is a must-have for this release.
Needs you will not volunteer but will confirm if the assistant raises them: support staff use "retry now" while on the phone with a customer who just updated their card, so it must charge immediately. Some customers pay by bank transfer mid-schedule, and they must not be charged afterwards.
What you would call overkill if proposed: per-customer schedules, SMS, audit logs, reporting dashboards, late fees.
Style: decisive, short answers. For technical choices you say it's the assistant's call.
```

### vague (fixture `job`)

```markdown
You are the founder of a small B2B SaaS company.
Opening request: our failed-payment rate on invoices is hurting revenue; help me figure out what we should build.
What you know if asked: about 8% of invoices fail on the first charge attempt; customers have saved cards; you are a small team and want something you can ship in a few weeks.
Needs you will not volunteer but will confirm if the assistant raises them: most failures are expired or replaced cards, and customers often don't know their card failed. You would like customers to be able to fix their card themselves.
What you would call overkill if proposed: machine-learning retry timing, payment plans, collections-agency integration, a full analytics dashboard.
Style: thoughtful but busy. You are open to ideas you had not considered. For technical choices you say it's the assistant's call.
```

## Conversation rubric

You grade one brainstorm conversation. You do not know how it was produced. You get the user's persona (the ground truth about what they want, what they need but would not volunteer, and what they would call overkill), the full conversation, and the result the assistant wrote (a requirements document, or a short chat result for small work).

1. List every requirement, key decision, and success criterion the result commits (not items listed as deferred, out of scope, open questions, or assumptions to confirm). Classify each:
   - ASKED: named in the user's opening request or stated by the user in the conversation.
   - CHOSEN: the user picked it, or delegated the choice ("your call") after the assistant put it to them.
   - NEEDED: not asked or chosen, but required for an asked item to work as described.
   - OVERBUILT: anything else, and anything on the persona's overkill list the user did not explicitly accept.
2. HIDDEN_NEEDS: for each need the persona lists as "will not volunteer", mark SURFACED (the assistant raised it or the result covers it) or MISSED.
3. NARROWED: requested items dropped, deferred, or reduced (for example a "retry now" that does not charge immediately when the persona needs it to).
4. QUESTIONS: number of assistant turns that ask the user something. OPTIONS: distinct alternatives the assistant offered across the conversation.
5. One line on whether the conversation helped the user think of anything worthwhile they had not raised (beyond the hidden needs), and one line on anything the user had to push back on.

Return exactly:
COMMITTED: <n>
OVERBUILT: <n>
HIDDEN_MISSED: <n of hidden needs MISSED>
NARROWED: <n>
QUESTIONS: <n>
OPTIONS: <n>
then one line per committed item `- [ASKED|CHOSEN|NEEDED|OVERBUILT] <item> — <reason>`, one line per hidden need `- HIDDEN <need>: SURFACED|MISSED`, one line per narrowed item, then `WIDENED: <one line>` and `PUSHBACK: <one line>`.

## Delegated (single-turn) rubric

You grade one brainstorm run. You do not know how it was produced. You get the user's idea, the user's advance answers, the run's `QUESTION:` lines (each question the agent asked and the answer it used; "your call" means the user delegated that choice), and the requirements document it wrote (if any).

1. List every requirement, key decision, and success criterion the document commits (not items listed as deferred, out of scope, open questions, or assumptions to confirm). Classify each:
   - REQUESTED: named in the idea or the user's answers.
   - CHOSEN-DETAIL: a choice put to the user in a `QUESTION:` line (including "your call" delegations) that settles how a requested item behaves.
   - CHOSEN-EXPANSION: a choice put to the user in a `QUESTION:` line (including "your call" delegations) that adds scope, a safeguard, or a process beyond the requested items and beyond what they need to work.
   - NEEDED: not asked, but required to make a requested item work as described (a product behavior planning would otherwise have to invent).
   - ADDED: scope, behavior, or a mechanism neither requested, put to the user, nor needed for requested items to work (extra features, notifications, audit logs, analytics, admin tools, safeguards, limits, configuration).
2. For each requested item in the idea, mark PRESENT or MISSING/NARROWED (dropped, deferred, or reduced).
3. List GOAL_GAPS: things the user's evident goal clearly needs (not merely nice to have) that the document neither commits, nor raises as a question, nor lists as deferred or open. These measure under-expansion.
4. Count options the agent surfaced to the user: distinct approaches, alternatives, or considerations presented as a choice in a `QUESTION:` line or listed as an alternative in the document. This measures whether the brainstorm still widened the user's thinking.

Return exactly:
COMMITTED: <n>
EXPANSION: <n>  (CHOSEN-EXPANSION count)
ADDED: <n>
NARROWED: <n>
GOAL_GAPS: <n>
QUESTIONS: <n from QUESTION lines>
OPTIONS_SURFACED: <n>
then one line per committed item `- [REQUESTED|CHOSEN-DETAIL|CHOSEN-EXPANSION|NEEDED|ADDED] <item> — <reason>`, one line per requested item `- REQUESTED <item>: PRESENT|MISSING|NARROWED`, one line per goal gap, and one line naming the options surfaced.

A run that ends with a short chat result and no document for a small request is a valid outcome: grade the chat result's committed scope the same way and do not mark requested items MISSING just because no file was written.

## Reference results (2026-09-29)

"Main" is `ce-brainstorm` at `b27637b0`. "Branch" adds Interaction Rule 9 (recommend what the user's goal needs and nothing it does not; never narrow a request), removes the two "include low-cost polish" defaults, and adds the commitment rule under Requirements. One conversation per persona, host, and ref.

**Conversation mode** (16 runs, four personas each):

| | Claude main | Claude branch | Codex main | Codex branch |
|---|---|---|---|---|
| Overbuilt | 1 | 0 | 6 | 6 |
| Hidden needs missed | 0 | 1 | 1 | 0 |
| Requested items narrowed | 0 | 1 | 4 | 0 |
| Options offered | 60 | 71 | 49 | 63 |
| Questions | 37 | 35 | 42 | 49 |

With a user who answers and pushes back, both refs mostly stay balanced: hidden needs are surfaced and overkill is dropped when the user says so. The branch offered more options on both hosts. Codex on main split the must-have dunning request into phases, deferring the emails, the admin page, and "retry now" (4 narrowed); on the branch it kept all of it. The branch misses: Claude recommended limiting the nightly job to invoices at most 7 days overdue (a narrowing Rule 9 forbids), and one Claude dunning run never asked how "retry now" is used. Codex overbuilding in these runs includes plan content where the simulated user continued past the handoff; the harness now stops the user there.

**Delegated mode** (single-turn, "your call" to everything; 12 runs per column):

| | Claude main | Claude branch | Codex main | Codex branch |
|---|---|---|---|---|
| Committed requirements | 85 | 67 | 105 | 100 |
| Scope added through delegated recommendations | 9 | 4 | 11 | 13 |
| Scope added without asking | 2 | 5 | 11 | 15 |
| Requested items narrowed | 0 | 0 | 2 | 0 |
| Goal gaps | 0 | 1 | 0 | 1 |
| Questions / options | 35 / 33 | 21 / 28 | 51 / 43 | 65 / 49 |

When the user delegates everything, Claude on the branch commits less scope and asks fewer questions with about the same number of options. Codex barely changes, and its counts vary by five or more between rounds, larger than the effect being measured.
