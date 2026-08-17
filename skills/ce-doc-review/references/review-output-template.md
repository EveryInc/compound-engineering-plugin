# Document Review Owner Template

Use this format for the default human response in Interactive mode. It is the same turn presentation before a routing or decision question. The structured non-interactive envelope keeps the technical record for agent callers. Do not print that envelope to the user.

Follow the shared owner rules in `references/rendering-floor.md`.

## Example: one open decision

```markdown
## Document Review

**Result:** The plan needs one decision before implementation.

The current plan could let invalid retry behavior pass without detection. That can make the finished feature less reliable for users.

### Recommended change

- Add one rule and one test that keep the retry safety check complete when new failure states are added.

### Your decision

Accept this change, defer it, or continue without it.

Ask for technical details if you want the reviewer evidence and document trace.
```

## Example: changes already applied

```markdown
## Document Review

**Result:** Ready.

The review found no open product or implementation decisions.

### What changed

- The plan now states who owns failed uploads.
- The test section now covers recovery after the app restarts.

Ask for technical details if you want the reviewer evidence and document trace.
```

## Rules

- Start with the result in one sentence.
- Lead with user impact: the effect on users, the product, or the team.
- Use `What changed` for applied edits.
- Use `Recommended change` for one clear action.
- Use `Decisions needed` when choices have real tradeoffs. State the options and their effects in plain language.
- Use `What remains uncertain` only for uncertainty that can change readiness or scope.
- Keep every decision-relevant finding. Group findings when one action fully covers them.
- Do not show priority codes, finding tiers, document IDs, section paths, code symbols, reviewer names, confidence values, routing classes, coverage tables, or validation details.
- Do not show counts unless the count itself helps the user decide.
- Do not show the technical artifact path.
- End with the exact offer: `Ask for technical details if you want the reviewer evidence and document trace.`
- Omit empty sections.

## Interaction rule

Present this owner summary before any routing question. The question can ask whether to review items one by one, let the agent resolve them, defer them, or make no change. Do not repeat the internal review fields in the question.
