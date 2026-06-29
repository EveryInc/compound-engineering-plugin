# Boundaries and Routing

Load this when the input's fit for `ce-pov` is in doubt, or to route a Hold (SKILL.md Phase 0).

## The discriminator

`ce-pov` always takes an **external input** and judges it **against this project**, producing a **decisive position** — not options, not requirements, not implementation, not a diagnosis. If the answer should be a *verdict about your project*, it is `ce-pov`. If the answer is options, requirements, implementation, a diagnosis, or a neutral explainer, route out.

## Where the lines fall

| If the user wants... | Route to | The line |
|---|---|---|
| A neutral explainer ("tell me about X") | general research / answer it directly | `ce-pov` only returns a project-grounded verdict; with no project angle, answer it as a normal research question — or a dedicated deep-research-style tool *if the environment has one* — rather than forcing a verdict |
| Options invented from an open field | `ce-ideate` | Invented vs. discovered: ideate invents; `ce-pov` judges/selects from a discoverable field |
| To scope an idea already chosen | `ce-brainstorm` | `ce-pov` decides *whether*; brainstorm scopes *what* once it's a yes |
| To know how to build something decided | `ce-plan` | Verdict accepted → hand off; `ce-pov` does no task breakdown |
| To fix observed broken behavior | `ce-debug` | `ce-pov` assesses *exposure and priority* of a CVE; debug investigates an *actual failure* |
| Product thesis / company direction | `ce-strategy` | `ce-pov` is bounded to a specific external input |

## The selection escape hatch

A *selection* question ("what should we use for auth?") is a `ce-pov` verdict only when the realistic candidate field is **bounded** (roughly five or fewer real options) and the **criteria are knowable** enough to judge — the candidates are *discovered* from a real market, not *invented*.

When the field cannot be bounded without inventing options, or the criteria are unclear, **Hold and route out**:

- Field too open to enumerate → Hold → `ce-ideate` to enumerate the candidates → offer to re-run `ce-pov` on the shortlist.
- Criteria unclear / unstated requirements → Hold → `ce-brainstorm` to surface them → offer to re-run.

Running a verdict on an unbounded field turns `ce-pov` into disguised requirements discovery — the escape hatch is what keeps it a judgment skill.

## Universal grounding (designed-in, deferred)

`ce-pov` grounds against the project's available context, and "project" includes a non-code folder (docs, decks, markdown, data), not only a git repo. The only case out of scope is *no local material at all* — a pure user-described situation with nothing to ground against. Treat that as out of scope: say the verdict would be ungrounded and ask for the project context, rather than dispensing generic advice dressed as a POV.
