# `ce-explain`

> Understand how something works and why it has its current shape, for learning or the next piece of work.

`ce-explain` produces an evidence-backed explanation. It follows behavior through source and tests, investigates documented design rationale, and separates what is known from inference and unanswered questions. It explains; [`ce-pov`](./ce-pov.md) judges what to do.

## When to use it

Use it to understand a subsystem before changing it, investigate the reasons behind an existing design, learn a concept introduced in a PR, explain a supplied idea, or reconstruct a window of work. A request to diagnose or fix a failure belongs to `ce-debug`; explaining the existing mechanism remains here.

The result follows its intended use. A planning input can be an answer with citations and constraints. Explanatory material for a PR can be returned for its authoring workflow to incorporate. A deeper teaching request can produce a standalone document to study and keep. The caller's identity does not choose the format: an agent can request a teaching document for a person, and a person can request a working answer.

## Examples

```text
/ce-explain how does cancellation propagate, and why do we retain polling? This informs the readiness plan.
/ce-explain explain this queue's lease for reviewers, in two paragraphs for the PR body
/ce-explain teach me the concept introduced in this PR; make an explainer I can keep
/ce-explain diff:main..HEAD
/ce-explain since last Monday
/ce-explain my idea of caching explainers per repository
/ce-explain the parser split output:md audience:team
```

Plain language is the ordinary path. `diff:` and `since:` select the subject, `audience:` names the reader, and `output:md` or `output:html` requests that artifact format. Colons in ordinary prose are not flags. A bare invocation resolves its subject from context or asks what to explain when a person is available.

## How it works

The skill establishes the question and intended use before researching or creating files. It reuses adequate current evidence and investigates missing or disputed claims.

For **how**, it follows the relevant trigger, state changes, ownership boundaries, and effect. One pass is enough when that trace can name the boundaries. When one pass cannot, the question is split across read-only scouts, one slice each, and the caller reconciles their dossiers against the source. For **why**, it follows decision records, comments, history, PRs, and linked issues within the allowed sources. It does not search every available service by default, and it preserves a calling workflow's opt-in restrictions on team chat.

Code demonstrates behavior, not necessarily the author's motivation. A missing historical reason stays unknown. Historical constraints are checked before being treated as current requirements. When the explanation informs a change, it identifies the relevant constraints and risks without choosing the implementation.

A recap uses an evidence scout before forming a narrative about the window. It cites the sources and says which activity it included or left out. Missing subjects and empty windows are reported rather than replaced with an unrelated explanation.

## Delivery and teaching

Answers and content for another document return directly. Standalone teaching artifacts use HTML by default, or markdown when requested. Layout, visuals, terminology, and depth follow the reader's needs; there is no fixed visual quota or required prose arrangement.

Standalone HTML remains self-contained and readable offline. Existing metadata records the subject, date, input shape, and named audience. Source links remain available, and unsupported external knowledge is visibly labeled unverified.

Teaching exercises are included when requested or when they would help the reader remember and apply the material. They live in a static `Check yourself` section with answers afterward. The run never waits for the reader to answer a quiz.

A local artifact is delivered with a summary and its path. There is no mandatory destination menu. A requested destination uses the available adapter; public ht-ml.app publishing still requires confirmation after its public-publishing warning. If it cannot complete, the local file remains available.

## In a workflow

`ce-brainstorm` and `ce-pov` can use `ce-explain` when an unresolved behavior or rationale question materially affects their work. `ce-plan` uses it before a Standard or Deep choice that depends on existing behavior or on a rationale the research did not establish. The skill reuses existing research when it is sufficient. The caller gets evidence, constraints, and unanswered questions, then continues under its own authority. No return flag is required.

`ce-commit-push-pr` continues composing its own `New concepts` section and offering `ce-explain` for deeper learning. This skill can also supply an explanation for a surrounding document without taking over placement or publication.

## Related skills

- [`ce-pov`](./ce-pov.md): judge what should happen given the evidence.
- [`ce-plan`](./ce-plan.md): turn requirements and constraints into a technical plan.
- [`ce-brainstorm`](./ce-brainstorm.md): explore and scope the product direction.
- [`ce-compound`](./ce-compound.md): capture durable project learning.
- [`ce-debug`](./ce-debug.md): diagnose observed failure.
