# Intake

Classify the request into exactly one input shape — concept, diff, idea, or work-recap window — before any grounding runs, and resolve its audience. Parse by reasoning over the user's prompt; do not depend on argument-token substitution mechanics, which vary by harness.

## Flag tokens

Tokens exist so automation and chained calls can force a decision. Plain language is the ordinary way a person invokes this skill and is not a lesser path — most requests carry no token at all and must classify just as reliably.

| Token | Example | Effect |
|-------|---------|--------|
| `diff:<ref-or-range>` | `diff:abc1234`, `diff:main..HEAD`, `diff:PR#42` | Forces diff mode on that change |
| `since:<window-or-ref>` | `since:monday`, `since:7d`, `since:v2.1.0` | Forces recap mode over that window |
| `output:<md\|html>` | `output:md` | Overrides the artifact format (default `html`) |
| `audience:<who>` | `audience:team`, `audience:"the design review"` | Renders for that reader instead of the user personally |

**A `word:value` pair is a flag only when it reads as one.** It leads the request or stands alone, carries no space after the colon, and — the decisive test — **the request still makes sense with it removed. If stripping it would garble the sentence, it was never a flag.** Leave it in the request text and classify by meaning. Ordinary technical prose is full of colons, and a flag parser that eats them silently changes what the user asked for:

- "walk me through the diff: why did we split the parser" — stripping `diff:why` leaves "walk me through the did we split the parser". Garbled, so this is prose. Classify by meaning (a diff request about the parser split), and never let the bogus ref `why` outrank that.
- "explain how we pick the audience: engineers vs designers" — a concept request about audience selection, rendered personally. Not an `audience:` flag naming "engineers".
- "teach me how our renderer decides output: html or terminal escape codes" — prose. Note this one fails quietly if mis-parsed, because `html` is already the default format, so nothing visible contradicts it.
- `diff:main..HEAD`, or `audience:team` leading a request — genuine flags: nothing is left to garble.

- A token in flag position beats inference. A colon inside prose does not.
- `diff:` and `since:` together conflict — resolve the intended subject under the skill body's interaction rule.
- An unrecognized `<word>:<word>` token (including conventional-commit prefixes like `feat:` appearing inside a topic) is not a flag — it passes through verbatim as request text. The same holds for a *recognized* token that fails the reads-as-a-flag test above.
- A token with an empty or missing value is not a flag — treat it as prose.
- `output:` with an unknown value: drop the token, note `Ignored unknown output: value '<value>' — using html`, and continue.

## Inference (no forcing token)

Classify the remaining text by shape:

- **Diff** — the request names a resolvable change: a sha, branch, PR, "the last commit", "what you just did", "this change".
- **Recap** — the request asks what happened over time ("what did I do this week", "catch me up", "prep me for standup"), **or names a time window and little else** ("since last Monday", "last week", "the past 3 days", "this sprint"). A bare window is a recap request, not a topic to be explained — do not read "since last Monday" as a concept called "since last Monday".
- **Idea** — the request presents a proposal or notion of the user's to be understood: "explain my idea of X", "what would Y imply". The idea is a fixed given (see SKILL.md Boundaries).
- **Concept** — everything else: a topic, pattern, subsystem, or external subject to learn.

**Resolving the window (recap mode).** A window arrives either as a token value (`since:monday`) or as prose ("since last Monday", "the past 3 days") — resolve both the same way, to a concrete date range, and name that resolved range in the artifact's `Subject`. `since last Monday` and `since:monday` mean the same thing; a colon must not change the answer. Fall back to the last 7 days only when the request names no window at all, and never silently substitute that default for a window the user did name — if a named window can't be resolved confidently, say what you used.

**Tiebreak — concept vs diff:** when the request is plausibly both (a repo topic that also names an identifiable recent change, e.g. "explain the retry logic we just added"), a concretely resolvable change wins: diff mode, with the concept as framing context. A topic with no resolvable change is a concept.

**Repo footprint check (concept mode):** a concept grounds in the repo only when it actually touches it. An external subject (a language feature, an interview topic, a paper) gets no repo grounding — do not force it.

## Reader and delivery

Resolve who will use the explanation and for what purpose from the request and context. The user is the default reader. Someone preparing to speak from the explanation is still its reader. When someone requests content for others, those people are the intended readers. Adapt terminology, orientation, depth, and presentation to that use without changing the evidence or attributing others' work to the user.

Return an answer or text for another document when that satisfies the request. A request to learn deeply, keep an explainer, or produce a standalone document warrants an artifact; use HTML by default for that artifact and markdown when requested. A named `diff:` or `since:` selects the subject, not whether a document must be created. An explicit `output:` selects the artifact format. Honor requests for a shorter explanation or a shareable excerpt without requiring a full teaching document.

Select delivery before creating a run directory or loading rendering instructions. No extra mode or confirmation is needed when the intended use is clear. Missing subject or material ambiguity follows the skill body's interaction rule.
