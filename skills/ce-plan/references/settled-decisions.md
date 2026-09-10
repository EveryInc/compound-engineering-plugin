# Session-Settled Decisions

Protocol and schema for carrying decisions the user already made in the invoking conversation, so this skill builds on them instead of re-opening them. This file is byte-duplicated between `ce-plan` and `ce-brainstorm` (skills cannot share files); any edit must land in both copies and is guarded by `tests/settled-decisions-parity.test.ts`.

## The settlement test

Classify each conversation-carried decision by whether it survived examination — not by how confident the user sounded.

- **Settled** — a tradeoff, alternative, or risk was raised in the conversation and the user chose with it in view. Record with a provenance class (below).
- **Directive** — the user asserted a choice no one examined (e.g., a cold "build it with X"). Not settled. It receives exactly one in-pipeline challenge, spent during this skill's research/pressure-test phase; the outcome lands in the artifact as a (labeled or unlabeled) decision entry. The artifact is the only record of that challenge: later stages do not get a second challenge, and an unanswered challenge raised in the pipeline may come back only through the calling pipeline's channel for divergent or residual findings.
- **Unlabeled** — anything only the agent inferred or proposed without user engagement. Ordinary planning input; never annotated.

Contrast pair: the user rejected option A after seeing the tradeoff -> settled (`user-directed`); the user said "sounds good" to a passing mention -> at most `user-approved`; the agent proposed X and the user never engaged -> no label.

**No self-settling.** An agent never labels its own unexamined proposal, and never upgrades bare assent to `user-directed`. Only what the user did in the conversation can create a provenance label.

## Provenance classes

Exactly two classes; both render as visible English in the artifact:

- `user-directed` — the user chose against or between options that were shown to them ("no, do X").
- `user-approved` — the agent proposed with the tradeoff shown; the user assented.

The class records decision strength for human readers (plan annotation, PR provenance line). It is also the label to switch to when a later interactive acceptance changes a settled decision (the change was proposed and accepted -> `user-approved`). Consumers do not behave differently by class today.

## The annotation

A settled decision is recorded on its Key Technical Decision entry (plan) or Key Decision entry (brainstorm Product Contract) as an inline English parenthetical:

`(session-settled: user-directed — chosen over <alternative>: <one-line reason>)`

- The stem `session-settled:` and the class tokens `user-directed` / `user-approved` are stable protocol — greppable and test-pinned. The rest of the sentence is free-form prose.
- Self-contained: decision, rejected alternative, and reason must be readable by a consumer with no access to the conversation.
- No sidecar files, no frontmatter registry, no numeric weights, no lifecycle field. An unrecognized consumer sees a normal decision entry; the worst-case degradation is today's re-opening of the decision, never corruption.

## Capture rules

- Never re-ask a settled decision. In the scoping synthesis it renders as a "Carrying forward:" line, not a call-out, and question phases skip it.
- Research builds on settled decisions and may contradict them only on evidence. Handle a contradiction by its severity: nothing found -> proceed silently; suboptimal-but-workable -> proceed as settled and attach a conflict call-out to the decision entry (at artifact-write time only — consumers that run after the write never mutate the artifact); invalidating (infeasible, wrong-thing, destructive) -> stop as blocked per this skill's pipeline contract.
- A settled label never suppresses defect evidence: a real bug or infeasibility finding inside a settled approach keeps full severity everywhere.
- When passing research context to subagents, include settled decisions as scope — with their rejected alternatives, so researchers do not re-survey them — plus the standing line: "If you find evidence a settled decision cannot work, report it — do not suppress it." Do not pass the advocacy or rationale for the decision (the decision as fact scopes the work; advocacy anchors), and keep any adversarial/validation lens blind to settlement markers.

## Brief entries (pipeline input)

A calling skill (e.g. `lfg`) may pass a distilled brief as invocation input — from the user or a calling skill. Each settled-decision entry requires: the decision, its class, the rejected alternative, and a one-line reason. An entry that cannot state its rejected alternative fails the settlement test — demote it to a directive (one challenge) or an open area. The required fields are a compliance aid; the settlement classification itself remains this skill's judgment. The brief is transient: once the artifact is written with labeled entries, the artifact is canonical and the brief carries no further authority.
