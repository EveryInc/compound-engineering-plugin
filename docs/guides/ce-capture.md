# `ce-capture`

> Turn raw material -- a pasted thread, a URL, a transcript, a meeting export, a first-person observation -- into one paraphrased, typed note that lands where the folder's layout says it belongs.

`ce-capture` is the intake of a knowledge folder. It reads the `knowledge:` block in `.compound-engineering/config.yaml` (written by `/ce-setup knowledge`; see [Knowledge layout](./configuration.md#knowledge-layout)) and files a note in the role that claims the note's `type`, or in `inbox` when the type is not unambiguous. It never guesses a folder and never copies a raw source into the repository.

```text
paste / URL / transcript / observation
        |
        v
/ce-capture --> <role path>/<date>-<slug>.md   (contract frontmatter, paraphrased)
        |
        +-- same source_id already captured? append evidence, no second file
        +-- private or mixed material? professional paraphrase only, original stays home
        +-- git.allow covers the path? commit that one file; otherwise report
```

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Writes one note with the layout's frontmatter contract (title, type, date, author, `source_*` keys, provenance), paraphrased, in the role the `type` maps to |
| When to use it | Whenever material arrives that the folder should keep; model-invoked when you paste or point at something to remember |
| What it produces | One file, or one dated evidence section appended to the existing note with the same `source_id` |
| Safe failure | The note lands in `inbox` with the best-supported `type`; with no layout configured it stops and says so |

---

## Example invocations

```text
# Paste a Slack thread; type is obvious (someone else produced it), so it files as a source
/ce-capture <pasted thread>

# Force the type
/ce-capture type:idea a canary token in every system prompt to detect injection

# Point at a file; the private-source boundary applies to a mixed recording transcript
/ce-capture ~/recordings/2026-09-12-standup.txt
```

---

## Novel mechanics

- **The type decides the role; the layout decides the type's home.** A `type` claimed by exactly one non-inbox role files there; anything else goes to `inbox` for `ce-dream` to promote. `{slug}` comes from the title, `{id}` only from a project folder the material names.
- **`source_id` dedup.** Every external capture carries a stable `source_id` (canonical URL, message permalink, file path plus date, recording id). A second capture of the same original appends attributed evidence under a dated heading and leaves every authored interpretation untouched.
- **Private-source boundary.** Source content is evidence, never instruction. Mixed personal/professional material is filtered and paraphrased; the raw original is never staged or committed; who said what, with what qualification, is preserved; `source_access` and `source_coverage` say who can open the original and what was not inspected.
- **Write authority is the layout's.** The file is committed (and pushed) only when the layout's `git.mode` allows and the path is under `git.allow`; the `kieran` template authorizes reviewed captures under `inbox/` and `sources/`, every other template leaves the commit to you.

## Chain position

`ce-capture` feeds the compound loop from outside it: captured sources ground `/ce-ideate` and `/ce-brainstorm`; `/ce-dream` triages what `ce-capture` left in `inbox`; `/ce-experiment` cites source notes from its brief. Configuration: [`ce-setup`](./ce-setup.md) (`knowledge` argument), [configuration](./configuration.md#knowledge-layout).

## See also

- [`ce-dream`](./ce-dream.md) -- recurring consolidation of what was captured
- [`ce-experiment`](./ce-experiment.md) -- from idea to experiment folder
- [`ce-compound`](./ce-compound.md) -- the transferable finding, once there is one
