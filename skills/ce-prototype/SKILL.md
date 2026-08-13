---
name: ce-prototype
description: Build a throwaway prototype to answer how something should work, feel, or read — an interface, a flow, a state model, a visual direction. Use when committing the wrong answer would be expensive to unravel and a cheap sketch cannot settle it, whether the user settles it by driving the artifact or by seeing it at real finish — one question, or the next related question after that. Not a rough visual probe during brainstorming, not for deciding what to build, not polishing a feature that already works, not implementing the real thing.
argument-hint: "[prompt, brainstorm path, or plan path]"
---

# Prototype

Build a throwaway prototype of this product at the fidelity that can answer this question, before committing an approach later work will treat as given. Then apply the decisions or hand off.

**Do not fake the dimension being tested.** Modality, fidelity, and medium all follow from that one rule. A question about how a flow or state model behaves is settled by driving it, so a screen that only looks like the product does not answer it; a question about how a layout or a mark reads is settled by seeing it at real finish, so a thin sketch does not answer it either. The user's own perception settles the question, never your judgment of the artifact.

**Result:** the user has decided how the product should work or feel against a prototype that did not fake what they were deciding.
**Next consumer:** an existing markdown Product Contract, or `ce-brainstorm` / `ce-plan` with this session as the seed.
**Done:** the questions that needed an artifact are decided, or the user applies and continues into brainstorm or plan.
**Not:** a decision a cheap sketch already settles, polish, or shipping the prototype as a final product.

If there is no person to experience the prototype — LFG, `mode:pipeline`, or any unattended run — stop. Do not start a preview and do not invent how it should feel. Return that this skill needs a human.

**User-runnable invocation rendering.** Two outputs print invocation syntax: the attended re-run named in that refusal, and the next-skill recommendation when the user applies. Default to `/ce-prototype`, `/ce-brainstorm`, and `/ce-plan`; use `$ce-prototype`, `$ce-brainstorm`, and `$ce-plan` only when the active host is Codex or explicitly documents dollar-prefixed skill invocation. Render only each invocation as inline code and output one form only.

## What to prototype

Accept a prompt, a brainstorm path, a plan path, or an empty invoke. An empty invoke still uses this session: if the conversation already names what to try, start from that. Ask only when you cannot tell. If you are inferring from messy history, say what you inferred — do not silently guess.

A run in a repo is about that product unless the user says otherwise. Read this conversation and any supplied brainstorm or plan. If the repo still has to be checked, dispatch a generic subagent for it rather than judging first how big the search is — you cannot tell until you are in it. Use the platform's subagent primitive (`Agent` in Claude Code, `spawn_agent` in Codex) where available; where there is none, do the same scoped read inline. Do not dispatch a standalone agent by type or name. Ask it for what the question touches — the page, component, or flow you will recreate — with its file paths, what it does today, and the constraints on it. Do not scan the tree or ask for a summary of the architecture. Then read those files yourself when you need the detail.

Before building, you need the product surface, the question, and any hard constraints (must keep, must not change). You do not need the user to have named how it should work or feel — that is this skill's job. If the surface or the constraints are missing, ask those. Do not ask them to invent the answer in chat.

Name the parts that can only be settled against a real artifact, or take the user's named question. Start with the question that would be most expensive to get wrong. Combine parts in one prototype when the question is how they work together.

Once they have tried something and decided, work out which questions are still worth building for. A decision often answers a later question too, makes one pointless, or turns up one nobody had thought of. When that list changes, say what changed in the next go-ahead. If what they decide changes what they want to build rather than answering the question you asked, stop and hand back what you learned instead of building for a question they have moved past.

If the supplied brainstorm or plan already records a settled visual-probe decision for this question (a display-only sketch the user already judged), do not rebuild that question.

Before starting a preview, get a go-ahead. The point of that message is so they can redirect an expensive build, not so they can read a briefing. Stay high-level: what you will try, why, and how it is split. Add detail only when the split or an inference would otherwise be surprising. If you inferred from messy history, say so. Leave a way to name a different question. Wait for proceed or correction. Do not build until they proceed.

## Narrow vs wide

Classify the question before you build.

- **Narrow** — a specific detail with a small similar set (this control vs that control, this placement, this transition). Put two or three close variants on one surface. Do not invent a wildly different mechanism.
- **Wide** — the space is open (make this more fun to use, explore how this could work). Diverge first: name three to five distinct avenues — different mechanisms, not tweaks of one idea. Give each one a plain line about what the user would see or do, not a coined name and a verdict on it; keep the detail for the ones they lean toward. The user picks, or you put a comparable subset on one surface. Then converge against the built ones. Do not start by building one idea as if it were the answer.

If width is unclear, ask once whether this is a close comparison or an open exploration. Do not default to either.

## Right-size the prototype

Size the prototype to the uncertainty, not to "small." The ambitious bet, the combination that only makes sense together, and the open space with no mechanism yet all take a bigger build; a separable choice can be decided on its own in something smaller. Do not start with the leftover easy question because it feels cheap.

Fidelity is a different axis. Throwaway means unmaintained and unshipped, not thin — do not test, abstract, or harden past runnable, but take finish as far as the dimension under test needs. A flow or state model gets rich enough to drive; a visual direction gets finished enough to judge; a placement question stays thin. Fidelity may differ per avenue within one wide run. Do not stay low-fidelity on principle, and persist state only when persistence is the question.

Default substrate: the web, whatever the product is written in — a native app's navigation feel gets a web approximation, not SwiftUI. It yields in exactly two cases: the user names a technology, or the dimension under test cannot be rendered in a browser without faking it. In that second case build in the medium the dimension requires and name that choice before you build; if a technology was named and it also cannot render the dimension, say so rather than yielding silently. On the web path the artifact is whatever a browser can display and you can author — HTML, SVG, CSS renderings, images — shown inside the page the preview helper already serves. Where the host offers image generation, use it. Where it does not, author the candidates as markup when markup can carry the dimension honestly, and say so; when it cannot — a photographic or painterly direction — report the missing capability instead, because substituting markup there fakes the very thing being judged. Do not introduce a second display mechanism alongside that page; a yielded run displays however its own medium does.

Build under `/tmp/compound-engineering-<uid>/ce-prototype/<run-id>/`. Load `references/preview.md` when serving that local web prototype. Recreate what this question needs from the current product. Do not stand up the full app unless the question is the whole-product feel. Leave the prototype there when the run ends — the implementation that follows reads it alongside the decisions capsule. Survival is best-effort: do not promise it a lifetime and do not relocate it to guarantee one.

Scale into the existing app only as a throwaway overlay when the user asks or the question is density or chrome on an existing page — an isolated page will hide that. That overlay is not the shipped feature. Do not commit prototype code on the product branch. Undo those edits when the try ends — restore only the files you changed, never work you did not make. An overlay run therefore leaves no artifact behind; nothing survives it. If you cannot undo them cleanly, name the files you left modified rather than handing off a dirty tree.

When the question is which option wins, put the options on one surface so they can be judged together — unless that surface would distort what is being judged: a scroll or transition gets a full-size run of its own rather than being nested in a small framed panel, and the comparison surface stays static.

After each user-facing action or variant change, show the relevant state so they can see what changed.

A run's output is a set of decisions. Converging on one direction that resolves the ambiguity is the best outcome, not a precondition for the run being complete.

Keep a run capsule at `decisions.md` in this run's scratch so the next skill does not need this session. Write only what `ce-brainstorm` or `ce-plan` needs if they cannot live inside the prototype: the question, a short summary of what was built, the screen path, what won, what was rejected, stated adjustments that were not in the prototype, and what is still open. Point at the prototype; do not reproduce it. Update the capsule when you are confident a choice has settled — the user judged the artifact and chose, including adjustments they attached. If you are not confident it settled, do not write. Do not pause to confirm every write. Include only what changes later planning; this is not a spec of the prototype. Keep the winner and those adjustments in the prototype. Read `decisions.md` before building for the next related question. Stay in this skill for that next one. Do not bounce to brainstorm or plan while a related question still needs an artifact to be decided. Do not start an unrelated campaign, and do not keep prototyping once they apply. Do not treat `decisions.md` as a plan. Applying writes the Product Contract or the recap; the capsule is only continuity.

## Apply or continue

When the user applies:

- If this run has a directly related brainstorm or plan — the path passed on invoke, passed by the calling skill, or named in this session as the file this prototype is for — load `references/write-back.md` and follow it. Markdown and HTML both. Use `decisions.md` when present. Do not pick a plan because one exists in the repo.
- If there is no such file or relatedness is unclear: do not mint a plan or a third note. Recap from `decisions.md` when present, carrying the decisions and, when the run left one behind, the prototype path — an overlay run has none, so say that rather than pointing at something you undid. That recap is a complete outcome for the run, not a degraded one.

Then continue, whichever branch above ran. If a calling skill invoked this, return the choices in `decisions.md` and let that caller continue. Otherwise recommend a next skill and pass this session as the seed: after a write-back, `ce-plan`, because the plan is now `requirements-only` with its HOW stripped and `ce-work` refuses it until `ce-plan` re-enriches; after a file-free run, `ce-brainstorm` when product-level questions remain, or `ce-plan` when the session is enough to plan. Print that recommendation per the rendering rule above.
