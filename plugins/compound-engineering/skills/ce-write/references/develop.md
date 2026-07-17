# Stage: develop

Turn a rough ask into a **brief** — the foundation every later stage builds on. The brief is small and sharp, not a document for its own sake. Its whole job is to make the five decisions that a draft cannot be good without.

## The five decisions the brief must lock

1. **Audience** — who, specifically, reads this. Not "developers" but "senior engineers new to this codebase" or "a funder deciding whether to renew." The named reader drives register and terms of art (voice guide §9).
2. **Purpose** — what changes because this piece exists. Inform, persuade, decide, announce, teach.
3. **The one job** — the single thing the piece must do. If it does only one thing, what is it? Everything not serving the one job is a candidate for cutting.
4. **Thesis / angle** — the governing idea, stated as a claim, not a topic (voice guide §2.1, §6). "Get Connor out of ops and the value engine scales" — not "thoughts on the podcast workflow."
5. **Medium** — essay, email, doc, README, announcement. This selects the medium profile in voice guide §8.

## Procedure

1. Read the topic from args and whatever context the conversation already holds.
2. For any of the five that the request already answers, adopt it — do not re-ask what Jeff already told you.
3. For the genuinely open ones, ask (batched into one question set via the platform question tool). Keep it to what actually blocks the brief. Do not interview for its own sake.
4. Write `brief.md` in the working directory.

## Output: brief.md

```markdown
# Brief: <short title>

- **Audience:** <the specific reader>
- **Purpose:** <what changes because this exists>
- **The one job:** <the single thing it must do>
- **Thesis / angle:** <the governing idea as a claim>
- **Medium:** <essay | email | doc | readme | announcement>

## Notes
<Any constraints, must-include points, tone calls, length target, or
things to deliberately leave out. Mark unknowns with ⚠.>
```

Keep it under a screen. A brief that grows into an essay has missed the point.

## Voice-guide sections this stage leans on

- §9 Audience & terms of art — the named reader.
- §2.1 / §6 — the thesis as a governing idea, not a topic.
- §8 By medium — which medium profile applies downstream.
