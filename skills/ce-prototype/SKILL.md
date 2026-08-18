---
name: ce-prototype
description: Build a throwaway prototype to answer how something should work, feel, or read — an interface, a flow, a state model, a visual direction. Use when committing the wrong answer would be expensive to unravel and a cheap sketch cannot settle it, whether the user settles it by driving the artifact or by seeing it at real finish — one question, or the next related question after that. Not a rough visual probe during brainstorming, not for deciding what to build, not polishing a feature that already works, not implementing the real thing.
argument-hint: "[prompt, brainstorm path, or plan path]"
---

# Prototype

Build a throwaway prototype at the fidelity that can answer this question, before committing an approach later work will treat as given. Then apply the decisions or hand off.

**Do not fake the dimension being tested.** Modality, fidelity, and medium all follow from that one rule: a question about how a flow or state model behaves is settled by driving it, so a screen that only looks like the product does not answer it; a question about how a layout or a mark reads is settled by seeing it at real finish, so a thin sketch does not answer it either. The user's own perception settles the question, never your judgment of the artifact.

**Result:** the user decided how the product should work or feel against a prototype that did not fake what they were deciding.
**Next consumer:** an existing markdown Product Contract, or `ce-brainstorm` / `ce-plan` with this session as the seed.
**Done:** the questions that needed an artifact are decided, or the user applies and continues into brainstorm or plan.
**Not:** a decision a cheap sketch settles, polish, or shipping the prototype as a final product.

If there is no person to experience the prototype — LFG, `mode:pipeline`, or any unattended run — stop. Do not start a preview and do not invent how it should feel; return that this skill needs a human.

**User-runnable invocation rendering.** Two outputs print invocation syntax: the attended re-run in that refusal, and the next-skill recommendation when the user applies. Default to `/ce-prototype`, `/ce-brainstorm`, and `/ce-plan`; use `$ce-prototype`, `$ce-brainstorm`, and `$ce-plan` only on Codex or a host that documents dollar-prefixed skill invocation. Render only each invocation as inline code and output one form only.

## Scope the question

Read `references/scoping.md` first — a non-optional load, before you ask the user anything or touch the repo. It owns how the question arrives, the scoped repo read of what the question touches (do not scan the tree), narrow vs wide, sizing, the go-ahead message, and how the remaining questions change after each decision. Do not build until the user proceeds.

## Build it

Read `references/build.md` and `references/preview.md` before writing anything.

A question is settled by seeing when the judgment lands on the rendered result — how a layout reads, what a palette does, how dense a screen feels; by driving when it lands on what happens as they move through it — a flow, a state model, how a control answers. Load `references/craft-floor.md` for the first; it carries the quality floor the render has to clear and how avenues differ, and neither lives here. A question settled by driving does not load it and gains no finish from it.

Default substrate: the web, whatever the product is written in — a native app's navigation feel gets a web approximation, not SwiftUI. It yields in exactly two cases: the user names a technology, or the dimension cannot be rendered in a browser without faking it. In that second case build in the medium the dimension requires and name the choice before you build; if a named technology also cannot render the dimension, say so rather than yielding silently. `references/build.md` owns what the artifact may be on either path.

Build under `.context/compound-engineering/ce-prototype/<date>-<slug>/`, so the prototype survives for the implementation that follows; fall back to `/tmp/compound-engineering-<uid>/ce-prototype/<date>-<slug>/`, where survival is best-effort. The `.context` path has to be gitignored first: probe `git -C <repo root> check-ignore -q .context/compound-engineering/` from the repo root — the trailing slash is load-bearing — and when it is not covered, offer to append that one line to the repo-root `.gitignore`, appending only if they agree and leaving the rest of the file alone. `references/build.md` names every case that forces the fallback root; `references/preview.md` owns the resolution — it picks between the roots, claims the run directory once per run, and prints the path the start and status/stop calls take. Do not create that directory yourself: its claim would land on a suffixed sibling, and the screens would part company with the capsule. Scaling into the existing app as a throwaway overlay is the one path that touches the product tree: never commit it, and when the try ends restore only the files you changed, never work you did not make. If you cannot undo them cleanly, name the files you left modified rather than handing off a dirty tree. Never delete a kept prototype — throwaway describes the code, not a request to remove it.

## Keep the decisions

Keep a run capsule at `decisions.md` in this run's directory so the next skill does not need this session: the question, what was built, the run and question directories each screen sits in, what won and why, what was rejected, stated adjustments that were not in the prototype, and what is still open. Point at the prototype; do not reproduce it, and include only what changes later planning. Update it when you are confident a choice has settled — the user judged the artifact and chose, including any adjustments they attached; if you are not confident, do not write. Do not pause to confirm every write. Keep the winner and those adjustments in the prototype. Read `decisions.md` before building for the next related question, and work out which questions are still worth building for — a decision often answers a later one, makes one pointless, or turns up one nobody had thought of. If what they decided changed what they want to build rather than answering the question you asked, stop and hand back what you learned instead of building for a question they have moved past. Otherwise stay in this skill for it: do not bounce to brainstorm or plan while a related question still needs an artifact, do not start an unrelated campaign, and do not keep prototyping once they apply. Do not treat `decisions.md` as a plan: applying writes the Product Contract or the recap, and the capsule is only continuity.

## Apply or continue

When the user applies:

- If this run has a directly related brainstorm or plan — passed on invoke, passed by the calling skill, or named in this session as the file this prototype is for — load `references/write-back.md` and follow it. Markdown and HTML both. Use `decisions.md` when present. Do not pick a plan because one exists in the repo.
- If there is no such file or relatedness is unclear: do not mint a plan or a third note. Recap from `decisions.md` when present, carrying the decisions and, when the run left one behind, the prototype path — an overlay run has none, so say that rather than pointing at something you undid. That recap is a complete outcome, not a degraded one.

Then continue. If a calling skill invoked this, return the choices in `decisions.md` and let it continue. Otherwise recommend a next skill and pass this session as the seed: after a write-back, `ce-plan`, because the plan is now `requirements-only` with its HOW stripped and `ce-work` refuses it until `ce-plan` re-enriches; after a file-free run, `ce-brainstorm` when product-level questions remain, or `ce-plan` when the session is enough to plan. Print that recommendation per the rendering rule above.
