---
name: ce-prototype
description: Build a throwaway prototype to answer how something should work, feel, or read. Use when committing the wrong answer would be expensive to unravel and a cheap sketch cannot settle it. Not a rough visual probe during brainstorming, not for deciding what to build, not polishing a feature that already works, not implementing the real thing.
argument-hint: "[prompt, brainstorm path, or plan path]"
---

# Prototype

Build a throwaway prototype at the fidelity that can answer this question, before committing an approach later work will treat as given. Then apply the decisions or hand off.

**Do not fake the dimension being tested.** Modality, fidelity, and medium all follow from that one rule. A question about how a flow or state model behaves is settled by driving it, so a screen that only looks like the product does not answer it. A question about how a layout or a mark reads is settled by seeing it at real finish, so a thin sketch does not answer it either. The user's own perception settles the question, never your judgment of the artifact.

**Result:** the user decided how the product should work or feel against a prototype that did not fake what they were deciding.
**Next consumer:** an existing markdown Product Contract, or `ce-brainstorm` / `ce-plan` with this session as the seed.
**Done:** the questions that needed an artifact are decided, or the user applies and continues into brainstorm or plan.
**Not:** a decision a cheap sketch settles, polish, or shipping the prototype as a final product.

If there is no person to experience the prototype — LFG, `mode:pipeline`, or any unattended run — stop. Do not start a preview, and do not invent how it should feel. Return that this skill needs a human.

**User-runnable invocation rendering.** Two outputs print invocation syntax: the attended re-run in that refusal, and the next-skill recommendation when the user applies. Default to `/ce-prototype`, `/ce-brainstorm`, and `/ce-plan`; use `$ce-prototype`, `$ce-brainstorm`, and `$ce-plan` only on Codex or a host that documents dollar-prefixed skill invocation. Render only each invocation as inline code and output one form only.

## Scope the question

Read `references/scoping.md` before you ask the user anything or touch the repo. That load is not optional. It owns how the question arrives and the scoped repo read of what the question touches — do not scan the tree. It also owns narrow vs wide, sizing, the go-ahead message, and how the remaining questions change after each decision. Do not build until the user proceeds.

## Build it

Read `references/build.md` and `references/preview.md` before writing anything.

A question is settled by seeing when the judgment lands on the rendered result: how a layout reads, what a palette does, how dense a screen feels. It is settled by driving when the judgment lands on what happens as the user moves through it: a flow, a state model, how a control answers. Load `references/craft-floor.md` for a seeing question. It carries the quality floor the render has to clear and the rule for how avenues differ, and neither of those lives here. A question settled by driving does not load it and gains no finish from it.

Default substrate: the web, whatever the product is written in — a native app's navigation feel gets a web approximation, not SwiftUI. It yields in exactly two cases: the user names a technology, or the dimension cannot be rendered in a browser without faking it. In that second case, build in the medium the dimension requires, and name that choice before you build. If a named technology also cannot render the dimension, say so rather than yielding silently. `references/build.md` owns what the artifact may be on either path.

Build under `.context/compound-engineering/ce-prototype/<date>-<slug>/`, so the prototype survives for the implementation that follows. Fall back to `/tmp/compound-engineering-<uid>/ce-prototype/<date>-<slug>/`, where survival is best-effort. `references/build.md` names every case that forces the fallback root.

The `.context` path has to be gitignored first. Probe it from the repo root with `git -C <repo root> check-ignore -q .context/compound-engineering/`; the trailing slash is load-bearing. When it is not covered, the offer to add that line comes before the root is resolved, or accepting it cannot help this run.

`references/preview.md` owns that offer and the resolution that follows it. Do not create the run directory yourself; a second claim splits the screens from the capsule.

Scale into the existing app as a throwaway overlay when the user asks, or when the question is density or chrome on an existing page — an isolated page hides that. It is the one path that touches the product tree. Never commit it. When the try ends, restore only the files you changed, never work you did not make. If you cannot undo them cleanly, name the files you left modified rather than handing off a dirty tree. Never delete a kept prototype: throwaway describes the code, not a request to remove it.

## Keep the decisions

Keep a run capsule at `decisions.md` in this run's directory, so the next skill does not need this session. `references/build.md` lists what it carries. Point at the prototype; do not reproduce it. Include only what changes later planning. Do not treat `decisions.md` as a plan: applying writes the Product Contract or the recap, and the capsule is only continuity.

Update the capsule when you are confident a choice has settled — the user judged the artifact and chose, including any adjustments they attached. If you are not confident, do not write. Do not pause to confirm every write. Keep the winner and those adjustments in the prototype.

Read `decisions.md` before building for the next related question, and work out which questions are still worth building for. `references/scoping.md` owns how that list changes. If what they decided changed what they want to build rather than answering the question you asked, stop and hand back what you learned instead of building for a question they have moved past. Otherwise stay in this skill for it. Do not bounce to brainstorm or plan while a related question still needs an artifact, do not start an unrelated campaign, and do not keep prototyping once they apply.

## Apply or continue

When the user applies:

- If this run has a directly related brainstorm or plan — passed on invoke, passed by the calling skill, or named in this session as the file this prototype is for — load `references/write-back.md` and follow it. Markdown and HTML both. Use `decisions.md` when present. Do not pick a plan because one exists in the repo.
- If there is no such file or relatedness is unclear: do not mint a plan or a third note. Recap from `decisions.md` when present, carrying the decisions and, when the run left one behind, the prototype path — an overlay run has none, so say that rather than pointing at something you undid. That recap is a complete outcome, not a degraded one.

Then continue. If a calling skill invoked this, return the choices in `decisions.md` and let it continue. Otherwise recommend a next skill and pass this session as the seed. After a write-back, recommend `ce-plan`: the plan is now `requirements-only` with its HOW stripped, and `ce-work` refuses it until `ce-plan` re-enriches. After a file-free run, recommend `ce-brainstorm` when product-level questions remain, or `ce-plan` when the session is enough to plan. Print that recommendation per the rendering rule above.
