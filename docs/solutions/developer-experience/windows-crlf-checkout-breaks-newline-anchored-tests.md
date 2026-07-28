---
title: "A Windows CRLF checkout fails newline-anchored tests — diagnose it before you 'fix' the source"
date: 2026-07-24
category: developer-experience
module: "tests (peer-job-runner-parity.test.ts and any assertion anchoring on \\n)"
problem_type: developer_experience
component: testing_framework
severity: medium
applies_when:
  - "Running the test suite from a Windows checkout and seeing a failure CI does not show"
  - "A test asserts on file content with a regex or comparison anchored on \\n"
  - "Deciding whether a local-only test failure is a real defect or an environment artifact"
  - "Worried that editing files on Windows will commit CRLF line endings"
tags: [windows, crlf, line-endings, autocrlf, false-failure, testing, git]
---

# A Windows CRLF checkout fails newline-anchored tests — diagnose it before you "fix" the source

## Context

Running the repo's test suite from a Windows checkout, `tests/peer-job-runner-parity.test.ts`
reported one passing and one failing sub-test. The failure looked like a genuine content
problem in the shell workers:

```
expect(received).not.toBeNull()   // Received: null
  body.match(/start_heartbeat\(\) \{[\s\S]*?\n\}\n(?=\nrun_codex_cmd\(\))/)
```

It is not a content problem. `core.autocrlf=true` with no `.gitattributes` means git checks
out **every** text file with CRLF line endings. A regex anchored on `\n}\n` cannot match
`\r\n}\r\n`, so the assertion fails against files that are byte-perfect in the repository.

The tell is in the same test: the sibling assertion on the *same file* —
`expect(body).toContain('wait "$_HEARTBEAT_PID" 2>/dev/null || true')` — **passed**. A
plain substring is insensitive to line endings; a newline-anchored regex is not. When one
passes and the other fails on identical input, the discriminator is the anchoring, not the
content.

## Guidance

**Diagnose before fixing.** A local-only failure that CI does not reproduce is an
environment hypothesis first, a defect second. Confirm with:

```bash
git config --get core.autocrlf          # true => working copy is CRLF
cat .gitattributes 2>/dev/null           # absent => nothing pins eol
python -c "d=open(r'path/to/file','rb').read(); print('CRLF' if b'\r\n' in d else 'LF')"
```

**Do not 'fix' the source files.** Rewriting the `.sh` files to LF, or loosening the test
regex, both change tracked content to work around a checkout setting. The files are correct;
the assertion is correct on the CI checkout. Leave both alone and note the artifact.

**Your own edits are safe to commit.** With `autocrlf=true`, git converts CRLF back to LF on
staging, so editing a CRLF working copy does not commit CRLF. Prove it rather than trusting
it — stage the file and inspect the blob git would actually store:

```bash
git add path/to/file
git cat-file -p :path/to/file | python -c "import sys; d=sys.stdin.buffer.read(); print('CRLF present' if b'\r\n' in d else 'LF only')"
git restore --staged path/to/file
```

This matters when a change adds hundreds of lines on Windows: it is the difference between a
clean diff and a whole-file line-ending rewrite that buries the real change.

**When the assertion is worth hardening**, prefer `\r?\n` in the regex or normalize before
matching — a test that only passes on one platform's checkout is a latent contributor
blocker. Adding a `.gitattributes` with `* text=auto eol=lf` fixes it repo-wide but is a
broader decision than a single test warrants.

## Why This Matters

The wrong move here is cheap to make and expensive to undo. A confident reading of the
failure — "the heartbeat kernel drifted between the shell workers" — leads to editing five
`.sh` files to satisfy a test that was never testing what the failure implied. The change
would pass locally, alter tracked content for no reason, and be invisible on CI where the
test already passed.

More generally: **a test failure that only reproduces on your machine is evidence about your
machine.** Establish which of the two it is before touching anything, because the debugging
cost is small and the cost of a wrong fix compounds into the repo.

## When to Apply

On any Windows checkout of this repo, and whenever a test compares file content with
newline-anchored patterns, heredoc-shaped fixtures, or byte-for-byte file equality. It also
applies to reading *any* local-only failure: identify the environment delta before
attributing the failure to the code under test.

## Examples

Failure that is an artifact — assertion anchors on `\n`:

```js
const match = body.match(/start_heartbeat\(\) \{[\s\S]*?\n\}\n(?=\nrun_codex_cmd\(\))/)
expect(match).not.toBeNull()          // fails on a CRLF checkout, passes on CI
```

Assertion on the same file that is immune — plain substring:

```js
expect(body).toContain('wait "$_HEARTBEAT_PID" 2>/dev/null || true')   // passes everywhere
```

Byte-identical comparison across duplicated files is also immune, because every copy carries
the *same* line endings in the same checkout:

```js
for (let i = 1; i < contents.length; i++) expect(contents[i]).toBe(contents[0])
```

That last property is worth knowing: it means a parity/duplication gate remains trustworthy
on Windows even while a newline-anchored gate in the same file is not.
