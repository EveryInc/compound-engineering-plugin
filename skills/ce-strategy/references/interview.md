# Strategy Interview

Loaded by `SKILL.md` at the start of Phase 1 and revisited per-section in Phase 2. Every section below maps one-to-one to a section in `strategy-template.md`.

For each section: ask the opening question, evaluate the answer against the quality bar, push back when it falls into a named anti-pattern, and capture the final answer in the user's own language.

## Overall Rules

1. **Ask, don't prescribe.** Do not offer menu options for open answers (problem, approach, persona). Use free-form responses. Reserve multi-select for routing decisions.
2. **Push back once, maybe twice.** If the first answer is weak, name the specific issue and ask a sharper question. If the second answer is still weak, capture what the user has given and note in the draft that the section is worth revisiting. Do not let the interview spiral.
3. **Quote the user back at them.** When challenging an answer, use the user's own words verbatim. Paraphrasing softens the challenge and is easier to dismiss.
4. **Keep each answer to 1-3 sentences.** Longer answers are usually hiding something vague. If the user writes a paragraph, ask them to pick the sentence that matters most.
5. **Don't leak the anti-pattern names.** The user does not need to hear "that's a vanity metric" - just ask the sharper question that follows.
6. **Ground the question, not the answer.** When the repo model from `SKILL.md` Phase 0 bears on a section, open with what it suggests ("From the README this looks like X - is that the problem?") and let the user confirm or correct; cite repo specifics when an answer contradicts what the repo states. Never write a section from the repo model alone, and never let recent activity stand in for what the product is. Where stated intent and the user's answer disagree, that is the pushback question, and the user's answer is what gets captured.

---

## 1. Purpose

**Opening question:** "What's the core problem this product solves - and what makes that problem hard?"

Strong answers name a specific situation the target user is in, identify what makes the situation hard *right now* (a crux, a constraint, something that isn't easy to route around), and are falsifiable - you could imagine the problem being absent and know the difference.

**Anti-patterns and pushback:**

- **Goal stated as problem** ("the problem is we need to grow revenue") -> "That's a goal, not a problem. What's in the world that's making that goal hard to achieve? Whose situation are you changing?"
- **Vague wish** ("people need better tools for X") -> "Whose situation specifically? Doing what? What do they try today, and why doesn't it work?"
- **Symptom, not cause** ("users churn after 30 days") -> "That's a symptom. What's happening in their world that makes them stop caring? What's the underlying condition?"
- **Too broad** ("communication at work is broken") -> "That's a civilization-scale problem. Narrow it to a situation you can actually affect - which users, doing what, when does it hurt most?"
- **Feature-shaped** ("there's no good way to do [specific workflow] with AI") -> "That's a missing feature, not the underlying problem. What outcome do users want that the feature would give them?"

**Capture:** One or two sentences naming the user's situation and the crux - the reason the product exists. No solution language.

---

## 2. Positioning

**Opening question:** "Given that problem, what's your approach - the commitment or principle that makes it tractable?"

This is the guiding choice: how the product competes or operates, so that many downstream decisions become easier. It is not the product and it is not a feature list.

Strong answers are a choice (implying alternatives explicitly *not* pursued), are general enough to direct many decisions but specific enough to rule things out, and sound more like "we win by [doing X differently]" than "we do [a list of things]".

**Anti-patterns and pushback:**

- **Fluff / values** ("we're customer-obsessed and move fast") -> "Those are values, not an approach. What are you doing *differently* from the other products users could pick? If the answer applies to any company, it's not your approach."
- **Feature list** ("we're building AI-powered X, Y, and Z") -> "That's a feature list. What's the underlying bet that makes you pick those features over others? What principle is guiding what you ship?"
- **Product description as approach** ("we use AI to draft replies") -> "That's what the product does, but what's the *choice* inside it? Every competitor will say the same thing. Your approach should name what you're doing that the obvious alternative isn't - is it a grounding choice, a trust-building commitment, a workflow bet? What are you betting on that they're not?"
- **Goal restated** ("our approach is to be the market leader") -> "That's still the goal. How does the product win? What choice are you making that competitors aren't?"
- **Multiple approaches at once** ("we're going deep on enterprise, self-serve, and a consumer app") -> "Pick one as the guiding approach. The others may still get work, but one of them organizes the rest. Which is it?"
- **Doesn't connect to the problem** (problem: "users can't trust AI output"; approach: "build a fast, beautiful UI") -> "How does that approach solve the problem you named? If there's no line between them, one of the two is wrong."
- **Any neighbor could say it** ("we're the simplest way to do X") -> "Could the nearest competing product truthfully make the same claim? If yes, it isn't positioning. What's the claim only you can make?"

**Capture:** One or two sentences. Ideally ends with or implies "...so that [outcome tied to the problem]".

---

## 3. Users

**Opening question:** "Who is the primary user, and what job are they hiring this product to do?"

Jobs-to-be-done framing - the user isn't a demographic, they're someone in a situation trying to make progress.

Strong answers name one primary persona (additional personas allowed but secondary), identify them by role or situation rather than demographic, and state a concrete job as a verb phrase.

**Anti-patterns and pushback:**

- **Too many primary personas** ("it's for founders, PMs, engineers, and designers") -> "If it's for everyone, it's for no one. Who matters most? The others can still benefit, but one of them drives the product decisions."
- **Demographic framing** ("25-45 year old professionals") -> "That's a demographic, not a user. What are they trying to do that makes them pick up this product?"
- **Role without situation** ("PMs") -> "PMs doing what? Running a roadmap review? Writing a spec at midnight? Convincing a skeptical eng lead? The situation is where the product matters."
- **Generic job** ("they want to be more productive") -> "Productive at what specifically? They're hiring this product to do *what*? The more specific, the better the product decisions downstream."

**Capture:** Persona name plus JTBD sentence. Example: "Solo founders running their own roadmap. They're hiring the product to keep strategy and execution aligned without a PM on staff."

---

## 4. Key Metrics

**Opening question:** "What 3-5 metrics will tell you whether the approach is working?"

Metrics are the feedback loop. Bad metrics create the illusion of progress while the product gets worse.

Strong answers stay at 3-5 (not 10), mix leading and lagging (something that moves weekly and something that moves quarterly), and could plausibly regress if the product got worse.

**Anti-patterns and pushback:**

- **Vanity metrics** ("total signups, total pageviews, cumulative users") -> "Those can all go up while the product gets worse. What moves when users actually get value?"
- **Too many** ("here are 12 metrics we watch") -> "A dashboard isn't a strategy. Pick the 3-5 you'd stake the quarter on. What are the others telling you that those don't?"
- **Outputs, not outcomes** ("ship velocity, deploys per week") -> "Those measure the team, not the product. If the team doubled velocity but users didn't care, would you call it a win?"
- **Can only go up** ("cumulative hours saved") -> "A metric that can only go up doesn't tell you much. What's the rate, the ratio, or the thing that can regress?"
- **Unmeasurable** ("user delight") -> "How specifically? If you can't define how you'd check it on a Tuesday, it's aspirational, not a metric."

**Capture:** A list of 3-5. Each with a one-line definition. Note where each is measured (analytics, DB, qualitative, etc.) if known. If measurement is undefined, ask: "Where does this metric live today? If nowhere, is this something you can start measuring?"

---

## 5. Tracks

**Opening question:** "What are the 2-4 tracks of work you're investing in to execute the approach?"

Tracks are the coherent-actions half of the strategy kernel - concrete areas of investment that flow from the approach. They are not feature lists and not personal todo items. Each track is a named *domain of work*.

Strong answers stay at 2-4 (not 8, not 1), connect clearly back to the approach, and are broad enough that multiple features live inside each one.

**Anti-patterns and pushback:**

- **Feature list in disguise** ("track 1: Slack integration; track 2: mobile app; track 3: dark mode") -> "Those are features. What's the *investment area* each one lives inside? 'Integrations' might be one track, with Slack, Teams, and Discord as candidates inside it."
- **Too many tracks** ("we have 7 tracks this quarter") -> "With 7 tracks, every track is starved for attention. Which 3 are load-bearing? The others either fold in or drop."
- **Doesn't connect to approach** (approach: "win by being the easiest to onboard"; track: "enterprise SSO") -> "How does that track serve the approach? If it's a separate bet, name it as one. If it's load-bearing for onboarding, explain the link."
- **Too vague** ("improve the product") -> "Every track is 'improve the product.' What's the specific investment area that's different from the others?"
- **One track only** -> "With one track, there's no real choice being made. What are the 2-3 things the product needs to be good at, and how are they different?"

Recent commits or PRs show where attention has gone lately, so this is the one section where they help. Offer what they show as a question ("most recent work is in X - is that a track, a temporary push, or unrelated?"), and take the user's answer: a burst of work in one area does not make it a track.

**Capture:** 2-4 tracks. For each: a name, a one-line purpose, and a short note on why this serves the approach.

---

## Stress Test

Run this once sections 1-5 are captured, before Boundaries and the optional sections and before drafting. A strategy is only useful if it decides things, so test whether the assembled answers do.

Pose 3-5 concrete proposals, one at a time, aimed at the draft's fault lines: a tempting feature that sits just off the approach, a second persona pulling in a different direction, a track that would starve another, a metric that would look good while the approach failed. Pick proposals whose answer the user could reasonably give either way, so the test carries information; the draft may already imply a position on it - that implied position is what the user's answer confirms or overturns. Skip proposals that are obviously on- or off-strategy for anyone ("add payroll" to a product whose README already excludes it), since the user's answer is a foregone conclusion and tests nothing. Where the repo model shows a tempting direction (a request in the issues, a recent burst of work outside the tracks), use it.

For each answer:

- The strategy already decides it the same way -> confirmed; move on.
- The strategy cannot decide it, or decides it differently from the user -> the approach or a track is too vague; ask the sharpening question and update the captured answer.
- The user resists the proposal -> candidate for Boundaries.

One round per proposal. Do not add sections or metrics to the doc to absorb a proposal; either the doc already handles it, an existing section gets sharper, or it becomes a Boundaries line.

---

## 6. Boundaries

**Opening question:** "Is there anything you've explicitly decided *not* to do right now that's worth naming? This is for things the team keeps being tempted by."

Clarity tool, not a blocker list. Proposals the user resisted in the stress test are the natural candidates - offer them; do not invent others. If the user names items, one sentence each. Do not encourage a long list. The section is always written: when nothing came up, it says so in one line, so readers have a reliable place to look for boundaries.

From the resisted proposals, also draft one line completing "Resist a change when ..." - the test a future reader (human or agent) can apply to a concrete proposal. Show it to the user with the list; drop it if nothing was resisted.

---

## 7. Milestones (optional)

**Opening question:** "Are there any dated milestones worth anchoring - a launch, a fundraise, a conference, a renewal? Skip if none apply."

Only capture externally visible, real milestones. Avoid turning this into an internal schedule.

Default is to skip. Do not push the user to invent milestones. If they name some, capture them verbatim with dates.

---

## 8. Brand (optional)

**Opening question:** "Any positioning or narrative language you want the doc to carry - a one-liner, a tagline, a key message? Skip if not yet."

Skip by default. Keep to 2-3 lines if present.

---

## After the Interview

Once sections 1-5 are captured, the stress test has run, Boundaries (section 6) is captured - it is always written, even if only to say nothing is named yet - and any optional sections the user engaged with are captured, read `strategy-template.md` and fill it in. Present the full draft in chat before writing. Offer one edit round. Then write to `STRATEGY.md`.

## Asking the questions

Default to the host's blocking question tool already in the current tool list (match by capability, not by a host-specific name). Presence in the current tool list is proof the tool exists; never call a user-facing question tool to discover whether it exists. If a matching tool is listed but unloaded, use the host's tool-discovery primitive to load that capability — do not search for another host's tool name. Fall back to numbered options on the host's user-visible chat surface only when no such tool is in the list or a real question call errors. Never silently skip the question.

Ask one question at a time. Prefer free-form answers for the substantive sections and single-select only for routing (which section to revisit); each option label must be self-contained.

For each section, ask the opening question, apply the pushback rules above, and capture the final answer in the user's own language. Where the repo model bears on the section, open with what it suggests and ask the user to confirm or correct, and use repo specifics in pushback ("the README says X; you just said Y - which is it?"). Do not skip pushback - it is the core of the skill, and existing weak content is not rubber-stamped because it is already written. Two rounds per section maximum; capture what the user has given after that and note the section as worth revisiting next run.

The **stress test** (step 6) checks that the captured answers actually decide things: a few concrete proposals aimed at the draft's fault lines, each answered by the user. An answer the strategy already decides confirms it; one it cannot decide sharpens the approach or tracks; a proposal the user resists is a candidate for Boundaries.

## Why these questions

The "Purpose / Positioning / Tracks" structure is informed by Richard Rumelt's *Good Strategy Bad Strategy* - specifically his kernel of diagnosis, guiding policy, and coherent action. The questions above are designed to push past the patterns he calls "bad strategy": fluff, goals dressed up as strategy, and feature lists in place of a guiding choice. The book is the recommended follow-up reading if the distinction between a slogan and a strategy is not yet sharp.
