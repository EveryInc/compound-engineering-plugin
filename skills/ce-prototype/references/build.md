# Building the prototype

Required read before you write any prototype code, alongside `references/preview.md`.

## Fidelity

Fidelity is a different axis from size (`references/scoping.md` owns sizing, which the go-ahead depends on). Throwaway means unmaintained and unshipped, not thin — do not test, abstract, or harden past runnable, but take finish as far as the dimension under test needs. A flow or state model gets rich enough to drive; a visual direction gets finished enough to judge; a placement question stays thin. Fidelity may differ per avenue within one wide run. Do not stay low-fidelity on principle, and persist state only when persistence is the question.

## The artifact on the web path

On the web path the artifact is whatever a browser can display and you can author — HTML, SVG, CSS renderings, images — shown inside the page the preview helper already serves. Where the host offers image generation, use it. Where it does not, author the candidates as markup when markup can carry the dimension honestly, and say so; when it cannot — a photographic or painterly direction — report the missing capability instead, because substituting markup there fakes the very thing being judged. Do not introduce a second display mechanism alongside that page; a yielded run displays however its own medium does.

## Which run root

Prefer `.context/compound-engineering/ce-prototype/<date>-<slug>/` so the prototype survives alongside the decisions capsule. Fall back to `/tmp/compound-engineering-<uid>/ce-prototype/<date>-<slug>/` when the user declines the `.gitignore` append, when they ask that this run not be left in their repo, when the run is not inside a git repository, or when the path fails the safety checks; survival there is best-effort, so do not promise it a lifetime. Calling the prototype throwaway is not a request to leave the repo — throwaway describes the code, and a kept prototype is never deleted.

## Recreate, do not rebuild the app

Recreate what this question needs from the current product. Do not stand up the full app unless the question is the whole-product feel.

Scale into the existing app only as a throwaway overlay when the user asks or the question is density or chrome on an existing page — an isolated page will hide that. That overlay is not the shipped feature. Do not commit prototype code on the product branch. Undo those edits when the try ends — restore only the files you changed, never work you did not make. An overlay run therefore leaves no artifact behind; nothing survives it. If you cannot undo them cleanly, name the files you left modified rather than handing off a dirty tree.

## Showing it

When the question is which option wins, put the options on one surface so they can be judged together — unless that surface would distort what is being judged: a scroll or transition gets a full-size run of its own rather than being nested in a small framed panel, and the comparison surface stays static.

After each user-facing action or variant change, show the relevant state so they can see what changed.

Give each question in a multi-question run its own child directory under the run directory. Never delete a kept prototype — the directory is theirs to prune. Calling the prototype throwaway is not a request to delete it; throwaway describes the code.

The run capsule at `decisions.md` carries the question, what was built, the run and question directories each screen sits in, what won and why, what was rejected, stated adjustments that were not in the prototype, and what is still open. SKILL.md owns when it is written and what it must not become.

A run's output is a set of decisions. Converging on one direction that resolves the ambiguity is the best outcome, not a precondition for the run being complete.
