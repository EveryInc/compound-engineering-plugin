# Boundaries and Routing

Read this when it is unclear whether the input fits `ce-pov`, or to route a Hold to the right skill (SKILL.md Phase 0, Frame and Classify).

## The discriminator

`ce-pov` takes a **supplied subject** and judges it **against this project**, producing a **decisive position** — not options, not requirements, not implementation, not a diagnosis. If the answer should be a *verdict about your project*, it is `ce-pov`. If the answer is options, requirements, implementation, a diagnosis, or a neutral explainer, send the request to the skill that produces that.

## Where the lines fall

| If the user wants... | Route to | The line |
|---|---|---|
| A neutral explainer ("tell me about X") | `ce-explain` | `ce-pov` only returns a project-grounded verdict; with no project angle, invoke `ce-explain` with the question and intended use rather than forcing a verdict |
| A holistic take on a supplied document ("what do you think of this doc?") | `ce-pov` | A take judges the document's direction, strengths, risks, and bottom line; "review this doc" or "find the issues" asks for findings and routes to `ce-doc-review`. When the wording is ambiguous, resolve it under the skill body's interaction rule |
| A judgment among approaches the user already supplied | `ce-pov` | Options developed → judge against the project; rough options needing development for a defined brief → `ce-bakeoff` |
| Options invented from an open field | `ce-ideate` | Invented vs. discovered: ideate invents; `ce-pov` judges/selects from a discoverable field |
| To scope an idea already chosen | `ce-brainstorm` | `ce-pov` decides *whether*; brainstorm scopes *what* once it's a yes |
| To know how to build something decided | `ce-plan` | Perform a requested handoff only when the Phase 4 (Deliver and return) authority check passes; `ce-pov` does no task breakdown |
| To fix observed broken behavior | `ce-debug` | `ce-pov` assesses *exposure and priority* of a CVE; debug investigates an *actual failure* |
| Product thesis / company direction | `ce-strategy` | `ce-pov` is bounded to a specific external input |

## The selection escape hatch

The selection escape hatch is the rule that stops `ce-pov` from judging a field it would have to invent. A *selection* question ("what should we use for auth?") is a `ce-pov` verdict only when the realistic candidate field is **bounded** (roughly five or fewer real options) and the **criteria are knowable** enough to judge — the candidates are *discovered* from a real market, not *invented*.

When the field cannot be bounded without inventing options, or the criteria are unclear, **return a Hold and name the skill that can resolve it**:

- Defined solution brief, but candidates need concrete development → `ce-bakeoff`.
- Field too open to enumerate → Hold → `ce-ideate` to enumerate the candidates → return the shortlist requirement to the caller.
- Criteria unclear / unstated requirements → Hold → `ce-brainstorm` to bring them out → return the missing criteria to the caller.

Running a verdict on an unbounded field turns `ce-pov` into disguised requirements discovery — the escape hatch is what keeps it a judgment skill.

## Universal grounding (designed-in, deferred)

`ce-pov` grounds against the project's available context, and "project" includes a non-code folder (docs, decks, markdown, data), not only a git repo. The only case out of scope is *no local material at all* — a pure user-described situation with nothing to ground against. Treat that as out of scope: return the missing project context under the skill body's interaction rule, rather than dispensing generic advice dressed as a POV.
