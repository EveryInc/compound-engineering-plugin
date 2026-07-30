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
- `diff:` and `since:` together conflict — say so and ask which mode the user wants.
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

## Audience resolution

Audience is orthogonal to input shape — resolve it for every shape, including recaps.

- **Default: the user personally.** Absent a signal, do not ask and do not adapt.
- **Another reader** when the `audience:` token is present, or when the request plainly says someone else will read it — "write this up for the team", "I'm sharing this with <person/group>", "for the design review", "a share-out", "something I can post in <channel>". The test is whether the *artifact itself* lands in front of other people. Carry the named reader forward verbatim; the rendering rule lives in the compose-time reference.
- Wanting to *speak* from the material is not an audience signal. "Prep me for standup", "catch me up before the meeting", "walk engineering through it — get me ready", and "so I can explain it to them" all stay personal: the user is still the reader. That resolves the case, so no re-render note is needed.
- **A request to share is not a request for a status update.** "Something I can drop in the #eng channel about this week's work" reads like a status-update ask in ordinary usage, and this skill does not write status updates. Honor the *audience* and refuse the *form*: render the explainer for that reader at full depth. Decline only if the user wants the terse update itself rather than an explainer for it — and say which you're doing.
- Ambiguous between personal and another reader (for example, "write up what shipped this week"), default to personal and say in one line that it can be re-rendered for a reader. Do not spend a blocking question on this.
