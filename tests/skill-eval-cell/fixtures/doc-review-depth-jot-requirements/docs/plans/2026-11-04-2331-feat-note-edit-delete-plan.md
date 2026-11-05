---
title: Note Edit and Delete Commands - Plan
type: feat
date: 2026-11-04
artifact_contract: ce-unified-plan/v1
product_contract_source: ce-plan-bootstrap
execution: code
---

# Note Edit and Delete Commands - Plan

## Goal Capsule

- **Objective:** A jot user can fix a note's text or remove a note from the terminal by its id, and a mistyped id fails loudly instead of silently doing nothing.
- **Means:** two new store operations wired into the existing `src/cli.js` dispatch (KTD1), with id allocation made safe for deletion (KTD2).
- **Authority:** Product Contract requirements win on behavior. Key Technical Decisions win on mechanism. Units override neither.
- **Execution profile:** one pull request, Lightweight, three units in dependency order.
- **Stop conditions:** stop and report if the store's on-disk format (a JSON array of `{id, text, tag, created}`) would have to change, or if any existing command's output changes.
- **Who finishes:** the implementing agent builds, tests, and documents. Shipping follows the caller's pipeline.

## Product Contract

### Summary

Add `jot edit <id> <text>` to replace a note's text and `jot delete <id>` to remove a note. Both report an unknown id on stderr and exit non-zero. New ids stop colliding once notes can be deleted.

### Problem Frame

The README lists "There is no way to edit or delete a note except by hand-editing notes.json" as a known rough edge. Hand-editing `~/.jot/notes.json` is error-prone, and a malformed file breaks every command. Users need both operations from the CLI. A typo in an id has to be visible, because a silent no-op would leave the user thinking the change was made.

### Requirements

**Edit**

- R1. `jot edit <id> <text>` replaces the text of the note with that id and keeps its id, tag, and created timestamp.
- R2. `jot edit` with an id but no text prints a usage error on stderr, exits non-zero, and changes nothing.

**Delete**

- R3. `jot delete <id>` removes the note with that id and leaves every other note unchanged.

**Unknown id**

- R4. When no note has the given id (including a missing or non-numeric id), `edit` and `delete` print an error naming the id on stderr, exit non-zero, and leave notes.json unchanged.

**Ids after deletion**

- R5. A note added after a deletion never receives an id that another existing note already has.

**Surface**

- R6. The CLI usage line and the README list `edit` and `delete`, and the README no longer claims edit/delete are missing.

### Scope Boundaries

- Not built: file locking for concurrent writes. Edit and delete inherit the existing unlocked read-modify-write in `src/store.js` (the CHANGELOG reports corruption under concurrent `add`). Fixing it belongs to its own change, and concurrent edit/delete is no more likely than concurrent add. Evidence that would change this: reports of edit/delete specifically losing data.
- Not built: changing a note's tag through `edit`. The request covers text only.
- Not built: repairing duplicate ids that already exist from earlier hand-edits. Edit and delete act on the first match (see Assumptions), which keeps every note reachable through repeated deletes.
- Not built: a guarantee that a deleted id is never reused. If the highest-id note is deleted, the next add can take that id again. No stored note collides, which is what R5 needs. A permanent counter would change the notes.json format.
- Not built: a confirmation prompt before delete. jot has no interactive prompts anywhere, and the request did not ask for one.

#### Deferred to Follow-Up Work

- `jot add` with no text writes a note with no `text` field, which later crashes `search`. It's the same class of bug R2 guards against, but it lives in `add` and stays out of this diff.

---

## Planning Contract

### Key Technical Decisions

- KTD1. **Store functions return whether they found the note, and the CLI owns output and exit codes.** `src/store.js` gains an edit and a delete operation that report found/not-found. `src/cli.js` turns not-found into the stderr message and `process.exit(1)`, the same way it already handles the usage error. This keeps the store free of process concerns, so it can be tested directly.
- KTD2. **New ids are the highest existing id plus one, not `notes.length + 1`.** With deletion, `notes.length + 1` reuses an id that is still live (delete 2 of [1,2,3], then add, and the new note gets id 3 again). Max-plus-one closes that gap without changing the stored format. An empty store still starts at 1.
- KTD3. **Ids from argv are parsed with `Number()` and compared strictly against stored numeric ids.** Anything that doesn't parse to an existing id, such as `abc`, an empty string, or a missing argument, takes the unknown-id path from R4. No separate validation branch is needed.
- KTD4. **Tests drive the real CLI as a child process with `HOME` (and `USERPROFILE`) pointed at a temp directory.** `src/store.js` resolves `~/.jot/notes.json` from `os.homedir()` at import time, so a subprocess is the only way to isolate state without adding a test-only seam. This seam catches argv parsing, stderr text, exit codes, and persistence together. It does not isolate store logic from CLI wiring, which is acceptable at this size.

### Assumptions

- Edit takes the text from the single argument after the id, the same way `add` reads only `args[0]`. Multi-word text must be quoted.
- Edit and delete print nothing on success and exit 0, matching `add`.
- If duplicate ids already exist from hand-edits, edit and delete act on the first matching note in file order.
- The error message format is `jot: no note with id <id>`. Exact wording is an implementation detail as long as it names the id and goes to stderr.
- The CHANGELOG gets an `Unreleased` entry for the two commands. `package.json`'s version is not bumped in this change.

---

## Implementation Units

### U1. Store operations and safe id allocation

- **Goal:** Give the store edit and delete operations, and make `addNote` allocate non-colliding ids.
- **Requirements:** R1, R3, R5. Supports R4 through the found/not-found result.
- **Dependencies:** none.
- **Files:** `src/store.js`, `test/edit-delete.test.js`.
- **Approach:**
  1. Add an edit function that finds the first note with the given numeric id, replaces its `text`, saves, and reports whether it found one (KTD1).
  2. Add a delete function that removes the first note with the given id, saves, and reports whether it found one (KTD1).
  3. On not-found, neither function calls `save`, so the file stays byte-identical.
  4. Change `addNote` to use max-plus-one ids (KTD2).
- **Patterns to follow:** the existing `load()` / `save()` round trip in `addNote`.
- **Test scenarios:** driven through the CLI per KTD4. Scenarios live with U2's tests in the same file.
  - Add three notes, delete id 2, add a fourth: the new note's id is 4 and `list` shows ids 1, 3, 4.
  - Add one note into an empty store: it gets id 1.
- **Verification:** ids stay unique across add/delete sequences, and the stored shape of every note is unchanged.

### U2. CLI wiring for edit and delete

- **Goal:** Expose `edit` and `delete` as subcommands with the error behavior in R2 and R4.
- **Requirements:** R1, R2, R3, R4, R6 (usage line).
- **Dependencies:** U1.
- **Files:** `src/cli.js`, `test/edit-delete.test.js`.
- **Approach:**
  1. Add `edit` and `delete` branches to the existing `if`/`else if` dispatch.
  2. For `edit`, check for missing text before touching the store, then print the R2 usage error and exit 1.
  3. Parse the id per KTD3 and map a not-found result to the R4 error and exit 1.
  4. Add `edit` and `delete` to the usage line.
- **Patterns to follow:** the existing usage-error branch (`console.error` then `process.exit(1)`).
- **Test scenarios:** in `test/edit-delete.test.js`, each test using a fresh temp `HOME` (KTD4).
  - Add "buy milk" with tag `home`, run `edit 1 "buy oat milk"`: exit 0, `list` shows `1  buy oat milk`, and the stored note keeps tag `home` and its original `created`.
  - Add two notes, run `delete 1`: exit 0, `list` shows only note 2 with its text unchanged.
  - `edit 99 "x"` against a store with one note: exit code non-zero, stderr names `99`, and notes.json content is unchanged.
  - `delete 99` against a store with one note: exit code non-zero, stderr names `99`, and notes.json content is unchanged.
  - `delete abc`: exit code non-zero and stderr names `abc`.
  - `edit 1` with no text: exit code non-zero, stderr shows usage, and note 1's text is unchanged.
  - `edit 1 "x"` and `delete 1` against an empty store (no notes.json): exit non-zero with the unknown-id error.
- **Verification:** every scenario passes under `node --test test/`, and running `jot` with no command still prints the usage line and exits 1.

### U3. Documentation

- **Goal:** Make the README and CHANGELOG reflect the new commands.
- **Requirements:** R6.
- **Dependencies:** U2.
- **Files:** `README.md`, `CHANGELOG.md`.
- **Approach:**
  1. Add `jot edit 1 "call the plumber at 9"` and `jot delete 1` to the README usage block.
  2. Remove the "no way to edit or delete" rough-edge bullet.
  3. Add an `## Unreleased` section to the CHANGELOG listing both commands.
- **Test expectation:** none -- documentation only.
- **Verification:** the README examples match the implemented argument order.

---

## Verification Contract

| Gate | Command | Proves |
|---|---|---|
| Test suite | `npm test` (runs `node --test test/`) | U1 and U2 scenarios, plus the existing `test/export.test.js` todo still loads |
| Manual smoke | `HOME=$(mktemp -d) node src/cli.js ...` add / edit / delete / list sequence | real-terminal output matches the README examples |

## Definition of Done

- R1 through R6 hold, and each has at least one passing test or a README check (R6).
- `npm test` passes with no new failures.
- `list`, `search`, `export`, and `add` output are unchanged for stores with no deletions.
- No abandoned-attempt code, debug output, or stray temp files remain in the diff.
