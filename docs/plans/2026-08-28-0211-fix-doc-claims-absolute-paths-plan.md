---
title: "Doc-claims absolute path check - Plan"
type: fix
date: 2026-08-28
origin: "https://github.com/EveryInc/compound-engineering-plugin/issues/1560#issuecomment-5447131411"
artifact_contract: ce-unified-plan/v1
artifact_readiness: implementation-ready
product_contract_source: ce-plan-bootstrap
execution: code
---

# Doc-claims absolute path check - Plan

## Goal Capsule

- **Objective:** A learning that cites a file by absolute path inside the repo gets a real existence check, so a green run cannot mean "checked nothing."
- **Means:** Rewrite an in-repo absolute token to a repo-relative path before the candidacy test (KTD1).
- **Authority:** Issue #1560 and its comment outrank implementation convenience; PR #1552 is complementary and out of scope. Session-settled Key Decisions outrank inferred polish.
- **Execution profile:** One unit, one PR. Test-first on the existing validator suite. Invoke `ce-skill-work` before editing either skill copy.
- **Stop conditions:** Stop and surface if an in-repo rewrite cannot be distinguished from a slash-prefixed URL route without treating the route as a path. Do not expand into fenced-block unmasking or #1552's flag-message work.
- **Tail ownership:** The invoking pipeline (`lfg`) owns simplify, review, commit, PR, and CI.

## Product Contract

### Summary

Check absolute filesystem citations that fall inside the repo. Leave URL routes and out-of-repo slash-prefixed tokens ignored. Apply the same change to both byte-identical validator copies.

Product Contract preservation: N/A (bootstrap).

### Problem Frame

`validate-doc-claims.py` reports `OK` with `0 flags` while checking zero paths whenever a doc cites files by absolute path. The candidacy guard rejects every token that starts with `/`, which is why API routes are ignored and why an in-repo absolute citation never reaches the existence check. House styles that require absolute paths so a learning still resolves after a move then get a silent empty pass.

### Requirements

- R1. A backticked absolute citation that names a path inside the repo is checked the same way as a repo-relative citation of that path.
- R2. A backticked absolute citation that names a missing in-repo path produces a `FLAG path` and a non-zero exit, not `OK`.
- R3. A slash-prefixed URL route remains ignored and does not produce a path flag.
- R4. The two skill copies of the validator stay byte-identical.

### Scope Boundaries

- In: candidacy rewrite for in-repo absolute tokens; both validator copies; the three cases already specified on #1560.
- Out: treating out-of-repo absolute paths as checkable; treating URL routes as paths; unmasking citations inside fenced code blocks; PR #1552's not-found flag wording.
- Deferred to Follow-Up Work: a skill-docs line that fenced-block citations stay unchecked by design. The issue named this as outside the patch.

### Key Decisions

- KD1. Check in-repo absolute filesystem citations; keep URL routes and out-of-repo slash-prefixed tokens ignored. (session-settled: user-directed — chosen over treating every slash-prefixed token as a path: that would flag API routes as missing files.) Governs R1, R2, R3.
- KD2. Change both validator copies together. (session-settled: user-directed — chosen over fixing only one copy: the copies are required to stay identical.) Governs R4.

### Sources

- Issue #1560 and comment `5447131411` (false-pass reproduction and the three test cases).
- `skills/ce-compound/scripts/validate-doc-claims.py` and its byte-identical copy under `skills/ce-compound-refresh/scripts/`.
- `tests/doc-claims-validator.test.ts` already runs every case against both skill directories.

## Planning Contract

### Key Technical Decisions

- KTD1. Before the candidacy test, rewrite only an already-absolute token. Containment is realpath-of-the-token against realpath-of-the-repo-root, with no join through the doc directory; if the relpath stays inside the repo, use that repo-relative path. Relative tokens, including `../` citations, stay unchanged so the existing post-candidacy `../` branch keeps owning them. URL routes stay unchanged so the slash-prefix guard still drops them. Realpath both sides so a host where `/tmp` is a symlink still matches. (session-settled: user-directed — chosen over dropping the slash-prefix guard: that guard is what keeps `/api/...` ignored.) Governs R1, R3.
- KTD2. Add the three #1560 cases inside the existing per-skill loop in `tests/doc-claims-validator.test.ts` rather than a one-copy suite. Governs R2, R4.

### Assumptions

- The script module docstring's "repo-relative paths" bullet should mention in-repo absolute citations so the contract matches behavior. Unvalidated; do not block on it.
- Fenced-code masking stays as designed. The issue asked for a possible docs line, not a code change.

### Patterns to Follow

- Existing `normalize_path` then `is_path_candidate` order in the path-scan loop.
- Existing post-candidacy `../` rewrite stays the sole owner of doc-relative citations. The new rewrite does not reuse that `doc_dir` join.
- `tests/doc-claims-validator.test.ts` fixture `writeRepoDoc` plus `src/real-file.ts` in the scratch repo.

## Implementation Units

### U1. Check in-repo absolute citations

- **Goal:** An in-repo absolute citation is counted and, when missing, flagged; a URL route stays ignored; both copies stay identical.
- **Requirements:** R1, R2, R3, R4; KTD1, KTD2.
- **Dependencies:** none
- **Files:**
  - `skills/ce-compound/scripts/validate-doc-claims.py`
  - `skills/ce-compound-refresh/scripts/validate-doc-claims.py`
  - `tests/doc-claims-validator.test.ts`
- **Approach:**
  1. Add the three #1560 cases inside the existing `SKILL_DIRS` loop so they fail on current `main`.
  2. Apply KTD1 in both copies so those cases pass and the copies stay byte-identical. Restrict the rewrite to already-absolute tokens; do not join them through the doc directory.
- **Execution note:** Implement the three cases test-first. They are the false-pass proof, not just a checked-count assertion.
- **Patterns to follow:** `writeRepoDoc` / `runValidator` helpers and the per-skill `describe` already in `tests/doc-claims-validator.test.ts`.
- **Test scenarios:**
  - Happy path: a doc cites `path.join(repo, "src/real-file.ts")` in backticks; exit 0; stdout does not contain `checked 0 paths`.
  - Error path: a doc cites `path.join(repo, "src/does-not-exist.ts")` in backticks; exit 1; stdout contains `FLAG path`.
  - Edge: a doc cites `/api/v1/users/me` in backticks; exit 0; stdout contains no `FLAG`.
- **Verification:** Both skill copies produce the same results on those three cases. The two script files remain byte-identical.

## Verification Contract

- Targeted: `bun test tests/doc-claims-validator.test.ts`
- Full suite: `bun run test` (same suite CI runs)
- `release:validate` is not required unless inventory or marketplace metadata changes; this plan does not.

## Definition of Done

- R1–R4 hold on both skill copies.
- The three U1 scenarios fail on current `main` and pass after the rewrite.
- The two `validate-doc-claims.py` files remain byte-identical.
- No change to fenced-block masking or to #1552's flag wording.
- Abandoned-attempt edits are not left in the diff.
