# Compounding directive

Standing-instruction text `ce-setup` offers to add to a project's agent-instructions file. Insert one variant verbatim; the wording is pinned to the `ce-compound` guide by a test.

## Offer first

After a solved, verified problem, offer once to invoke the `ce-compound` skill at the completion checkpoint when the work corrected a wrong belief about how something behaves: an approach that failed, a review finding that exposed a real defect, or an assumption, document, or first diagnosis that turned out wrong. A naming, style, or preference change does not count. Work that went as first planned does not need the offer. Do not judge whether the lesson deserves a document: `ce-compound` decides whether it qualifies and what holds it (a test, a lint rule, a coding standard, or a learning), and writes nothing when nothing qualifies. Offer at the checkpoint so what it writes can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.

## Run automatically

After a solved, verified problem, automatically invoke the `ce-compound` skill with `mode:non-interactive` at the completion checkpoint when the work corrected a wrong belief about how something behaves: an approach that failed, a review finding that exposed a real defect, or an assumption, document, or first diagnosis that turned out wrong. A naming, style, or preference change does not count. Work that went as first planned does not need it. Do not judge whether the lesson deserves a document: `ce-compound` decides whether it qualifies and what holds it (a test, a lint rule, a coding standard, or a learning), and writes nothing when nothing qualifies. Capture at the checkpoint so what it writes can ship in the PR that produced it, and only where the repository treats captured learnings as tracked, committed knowledge.
