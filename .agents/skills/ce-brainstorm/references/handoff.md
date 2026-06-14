# Handoff

Loaded when Phase 4 begins — after the requirements document is written.

---

## 4.1 Present Next-Step Options

Visible options vary by state: no requirements doc hides review; unresolved `Resolve Before Planning` hides `Plan implementation` and `Build it now`. Choose rendering:

- **4 or fewer visible** — use blocking question tool.
- **5 or more visible** — numbered list with "Pick a number or describe what you want."

If `Resolve Before Planning` has items: ask blocking questions one at a time. Do not offer `Plan implementation` or `Build it now` while blockers remain.

**Use absolute paths** for file references in chat.

**Preamble (no blockers):**

```
Brainstorm complete.
Requirements doc: <absolute path>
What would you like to do next?
```

**Preamble (blockers remain):**

```
Brainstorm paused. Planning is blocked.
Requirements doc: <absolute path>
What would you like to do next?
```

Options (renumbered to fit):

1. **Plan implementation with `ce-plan`** — when blockers empty.
2. **Agent review with `ce-doc-review`** — when doc exists.
3. **Open in browser** — when doc exists.
4. **Build it now with `ce-work`** — when blockers empty and gate passes.
5. **More clarifying questions** — always.
6. **Done for now** — always.

## 4.2 Handle Selection

**Plan implementation** → load `ce-plan` with doc path or summary.
**Agent review** → load `ce-doc-review` with doc path; re-render Phase 4 on return.
**Build it now** → load `ce-work` with brainstorm context.
**More clarifying questions** → return to Phase 1.3 dialogue.
**Open in browser** → display absolute path; use platform open primitive if available.
**Done for now** → closing summary, end turn.

## 4.3 Closing Summary

When complete:

```
Brainstorm complete!
Requirements doc: <absolute path>
Key decisions:
- [Decision]
Recommended next step: `ce-plan`
```

When paused with blockers:

```
Brainstorm paused.
Planning blocked by:
- [Blocking question]
Resume with `ce-brainstorm` when ready.
```
