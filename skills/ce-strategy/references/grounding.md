# Grounding the interview in the repo

Required read at the start of Phase 0, before the repo model is built.

Read `STRATEGY.md` with the native file-read tool.

Then build a **repo model** - your working understanding of what this product is - from two inputs with different jobs:

- **What the product is.** Stated intent (README, `CONCEPTS.md`, `docs/`, an existing `STRATEGY.md`, sibling docs such as `PRODUCT.md` or `VISION.md`) and structure (what the code is organized around, what is public, what is tested) - the authority for the problem, approach, and persona questions. Bound the read to "what is this and who is it for"; do not profile the whole repo.
- **What is getting attention now.** Recent commits or PRs, informing only the Tracks question and staleness in an update run. A burst of recent work is a fact about the last few weeks, not about what the product is; where it disagrees with stated intent, that is a question for the user ("recent work is mostly in X - is X a track, a temporary push, or unrelated?"), never a conclusion.

If the repo has no substantive content, say so in one line and run the interview ungrounded - a normal path, not a blocker.

## A legacy sibling doc and no `STRATEGY.md`

`STRATEGY.md` is the shared project doc; `VISION.md` and `PRODUCT.md` are legacy names other tools used before converging on it. When one of those exists and `STRATEGY.md` does not, it has already seeded the repo model; before the interview, offer the user the choice of folding it in or linking to it. Folding: this skill creates `STRATEGY.md` in the template's order and carries the legacy doc in - every meaning this run writes - whichever of the template's sections the interview captures - merges with the legacy content that carries the same meaning into one section in the author's words, with any contradiction put to the user; every meaning outside this skill's contribution is carried in under its own heading with content unchanged. The legacy file then becomes redundant: say so and leave its removal to the user (this skill never deletes a user's file; the CE readers take `STRATEGY.md` first and consult a legacy sibling only for meanings it lacks, so a folded sibling is not re-read for the meanings it carried). Linking: leave the legacy file where it is and point to it from the template's sibling line. Never edit the legacy file either way.

Show the repo model in chat before the first question: three to five lines on what you take the product to be, who it seems to serve, and where attention has gone, each with its source named. Invite correction. On a first run the interview then runs in full; an update run still revisits only the section Phase 2 settles on. If it could not supply the product's name, ask for that here - the template's frontmatter and title need it.

## Focus hint

(Also stated in the always-loaded body, which is where it has to fire.) Any argument this skill was invoked with — present in the current prompt or conversation, from the user or a calling skill — is a focus hint: a section to revisit (`metrics`, `positioning`, `tracks`; older names such as `approach` or `who it's for` map to the current section) or a scope hint. With none, proceed open-ended and let the file state decide the path.
