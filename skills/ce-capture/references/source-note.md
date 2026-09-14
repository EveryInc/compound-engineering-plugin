# Source note: keys and body

The layout's `frontmatter` block is the contract; this file says how `ce-capture` fills each key it names. A key the layout does not list is not emitted, even if it appears below.

## Filling the keys

| Key (when the layout lists it) | Value |
|---|---|
| `title` | Short, specific, sentence case; what the material is about, not where it came from. |
| `type` | One value from `frontmatter.type_enum`, chosen as SKILL.md's "Where it goes" says. |
| `date` | Today (the day the note is written), ISO `YYYY-MM-DD`. |
| `author` | The folder's owner, or the person the material belongs to. Never the agent. |
| `contributors` | People whose words or work appear, when they are not the author. Only if listed by the layout. |
| `source_id` | Stable identity of the original, derived in this order: the canonical URL of a public document; a message or thread permalink (channel plus timestamp); a repository-relative or absolute file path plus the file's date; a recording or meeting identifier plus its date. Lowercase, no query strings or fragments, the same every time the same original is captured. |
| `source` | Human-readable name of where it came from (the channel, the document, the meeting). |
| `source_date` | When the source event happened, ISO date; distinct from `date`. |
| `source_url` / `source_file` | One of the two: a link for shared material, a path for a file. A private local original may carry an absolute `source_file` labelled private. |
| `source_access` | From `frontmatter.source_access_enum`: `public` (anyone), `link` (anyone with the link), `every` or another org value the layout names (membership), `private` (only the owner or participants; the original stays in its private home), `mixed`. |
| `source_coverage` | Free text: what was read and what was not inspected. |
| `source_lines` | Line or timestamp range when part of a longer original was used. Only if listed by the layout. |
| provenance keys (e.g. `generated_with`) | The harness and model that drafted the note, as your context states them; a nested map (`harness`, `model`, and `reasoning_effort` when known) under the single key. Never copy a stale identifier from an older note. |

Quote any scalar that contains `: `, ` #`, or leading special characters so the frontmatter parses; write dates unquoted.

## Body

Open with one paragraph stating what the material is and why it matters to this folder. Then the paraphrased professional content, in the material's own order when order carries meaning, otherwise grouped by topic. Each attributed claim keeps its speaker and qualification ("X suggested", "Y was unsure whether"). Mark the three registers apart when they mix: what was directly observed, what the source reports, what the agent infers. Close with links to related notes in the folder (repository-relative Markdown links) only where a relationship is already real; do not create hub or index files.

No verbatim reproduction beyond a short phrase needed for precision. No personal passages, credentials, or private details. No invented citations, and no minimum number of sources: a first-person observation with no `source_*` keys is a valid note.

## Extending an existing note (same `source_id`)

Append, never rewrite. Add a section headed with today's date and the new material's `source_date` when it differs, holding only the new attributed evidence. Update `updated` in the frontmatter when the layout lists it. Leave the title, the earlier body, and every interpretation or conclusion exactly as they were; if the new material contradicts an earlier conclusion, say so in the new section and leave the contradiction for `ce-dream` to surface.
