# Deciding what to prototype

Required read before the go-ahead message, in every run.

## Getting the question

Accept a prompt, a brainstorm path, a plan path, or an empty invoke. An empty invoke still uses this session: if the conversation already names what to try, start from that. Ask only when you cannot tell. If you are inferring from messy history, say what you inferred — do not silently guess.

A run in a repo is about that product unless the user says otherwise. Read this conversation and any supplied brainstorm or plan. If the repo still has to be checked, dispatch a generic subagent for it rather than judging first how big the search is — you cannot tell until you are in it. Use the platform's subagent primitive (`Agent` in Claude Code, `spawn_agent` in Codex) where available; where there is none, do the same scoped read inline. Do not dispatch a standalone agent by type or name. Ask it for what the question touches — the page, component, or flow you will recreate — with its file paths, what it does today, and the constraints on it. Do not scan the tree — neither you nor the subagent — and do not ask for a summary of the architecture. Then read those files yourself when you need the detail.

<!-- ce-worker-profiles:start -->
**Named worker profiles for generic subagent dispatch (optional, two authority classes).**

- **Resolve** `subagent_read_profile` for children that do not mutate tracked project content (writing per-run scratch artifacts stays read class) and `subagent_write_profile` for children that do, from `<repo-root>/.compound-engineering/config.local.yaml` then `config.yaml` per the ordinary two-file config rule. Names are opaque host-defined strings: never invent, validate, or default them, and the selector derives only from the resolved keys - never from dispatch content, PR text, reviewer output, or a child's own request.
- **Choose the class per dispatch call**, by the project authority that child needs; a cheaper profile must never be given write work.
- **Apply only where the host's dispatch primitive accepts a named worker profile** for an otherwise generic dispatch that still receives this file's prompt payload - on Devin, `run_subagent`'s `profile` argument, where a configured name substitutes for the built-in profile the call would otherwise use. A typed or registered-agent selector is not a worker profile and stays excluded; where no such selector exists the keys are inert and dispatch is unchanged.
- **A resolved profile supersedes this surface's model selection for that dispatch's class** - tier override or session-model inheritance alike; the profile carries the model and tool policy, so never pass both.
- **Fail transparently.** Where the host exposes the available profile set, confirm the name resolves before dispatch. A rejected, unknown, or unresolvable name follows this surface's ordinary dispatch-failure rule and is named in the coverage or degradation note. Never report a profile or model as having run when it did not serve.
- **Unset keys are a strict no-op:** dispatch exactly as today on every host.
<!-- ce-worker-profiles:end -->

Before building, you need the product surface, the question, and any hard constraints (must keep, must not change). You do not need the user to have named how it should work or feel — that is this skill's job. If the surface or the constraints are missing, ask those. Do not ask them to invent the answer in chat.

Name the parts that can only be settled against a real artifact, or take the user's named question. Start with the question that would be most expensive to get wrong. Combine parts in one prototype when the question is how they work together.

If the supplied brainstorm or plan already records a settled visual-probe decision for this question (a display-only sketch the user already judged), do not rebuild that question.

## Narrow vs wide

Classify the question before you build.

- **Narrow** — a specific detail with a small similar set (this control vs that control, this placement, this transition). Put two or three close variants on one surface. Do not invent a wildly different mechanism.
- **Wide** — the space is open (make this more fun to use, explore how this could work). Diverge first: name three to five distinct avenues — different mechanisms, not tweaks of one idea. Give each one a plain line about what the user would see or do, not a coined name and a verdict on it; keep the detail for the ones they lean toward. The user picks, or you put a comparable subset on one surface. Then converge against the built ones. Do not start by building one idea as if it were the answer.

If width is unclear, ask once whether this is a close comparison or an open exploration. Do not default to either.

## Size the build

Size the prototype to the uncertainty, not to "small." The ambitious bet, the combination that only makes sense together, and the open space with no mechanism yet all take a bigger build; a separable choice can be decided on its own in something smaller. Do not start with the leftover easy question because it feels cheap. The go-ahead names that split, so this decision is made before it, not after.

## The go-ahead message

Before starting a preview, building must be authorized. A request that already is to prototype this named thing is that authorization after scoping. The go-ahead message is owed when the request is only whether to prototype, or when the split or an inferred question would surprise them. The point of that message is so they can redirect an expensive build, not so they can read a briefing. Stay high-level: what you will try, why, and how it is split. Add detail only when the split or an inference would otherwise be surprising. If you inferred from messy history, say so. Leave a way to name a different question. When the message is owed, wait for proceed or correction. Do not build until building is authorized.

## Between questions

Once they have tried something and decided, work out which questions are still worth building for. A decision often answers a later question too, makes one pointless, or turns up one nobody had thought of. When that list changes, say what changed in the next go-ahead. If what they decide changes what they want to build rather than answering the question you asked, stop and hand back what you learned instead of building for a question they have moved past.
