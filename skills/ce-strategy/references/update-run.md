# Updating an existing STRATEGY.md

Required read before editing any `STRATEGY.md` that already exists. Covers whose shape the file is in and how the update run proceeds.

## Meaning is the contract; shape belongs to whoever created the doc

When this skill creates `STRATEGY.md`, it writes the house format in `references/strategy-template.md`. When a doc already exists - written by an earlier version, by hand, or by another skill - adapt to it: read it by meaning (a section counts as present when the doc expresses it anywhere, under any heading or in prose), make only additive or minimal changes in its own idiom, and never restructure it, add frontmatter or headings uninvited, or duplicate a meaning under a new heading. Sections this skill did not write are someone else's captured intent: leave them in place; if this run learned something that makes one false, make the smallest edit that keeps its intent true and say so in chat. A section marked as approved by its author (an HTML comment naming the tool and the approval, for example `<!-- <tool>: author-approved 2026-07-10 -->`), or a doc the user does not own, is not edited at all - report the conflict, or write to a separate file with a link, and leave the rest to its owner. The worst outcome is turning someone's existing doc into this template and breaking what already reads it.

## The update run

Read the existing `STRATEGY.md` thoroughly. Summarize current state in 3-5 lines so the user sees what is on file. A house-format file written by an earlier version uses older headings (`Target problem`, `Our approach`, `Who it's for`, `Not working on`, `Marketing`); treat each as its current section, and on any write of that file migrate all of them to the current headings at once - headings only, content untouched, mentioned in chat - so the file ends the run in one shape. A section carrying an author-approved marker keeps its heading along with its content. A file in any other shape is read by meaning and updated in its own shape; this skill's own sections are still written under their template headings - `## Key metrics` in particular is what `ce-product-pulse` parses - since contributing this skill's sections is not restructuring; what the meaning rule forbids is adding a heading for a meaning another section already carries.

Check for drift: compare every section of the doc against the repo model - stated intent, structure, and recent history (commits or PRs, plans and learnings under `docs/`) - not only against what changed since the last write, since a targeted update advances `last_updated` without reviewing the rest. Name any section the evidence suggests is stale, with the evidence, as a candidate - not a verdict.

If the focus hint named a specific section, jump to that section in `references/interview.md`. Preserve every other section's content and place exactly, including sections this skill did not write; the heading migration above is a rename only and does not conflict with that. Apply pushback as if this were a first run - do not rubber-stamp existing weak content just because it is already written.

If no specific target, ask the user which section to revisit using the blocking question tool, listing any drift candidates first. Options:

- "Purpose"
- "Positioning"
- "Users"
- "Metrics, tracks, boundaries, or other"

For each revisited section, re-interview with full pushback. For sections the user confirms are still accurate, leave their content untouched. If the file is in this skill's house format and no section carries a meaning the template now requires (Boundaries - a migrated `Not working on` already carries it), offer to add it - do not add it silently, and do not add it to a file in another shape. When the file has YAML frontmatter, set `last_updated` to today's ISO date; when it has none, leave it that way - readers fall back to the file's own date.

Write the updated doc back to `STRATEGY.md`.
