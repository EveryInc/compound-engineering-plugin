# Reconciliation — the verified `.deep-review.md` sidecar (RU5)

Once Pass 2 findings are verdict-tagged (Phase 3.5), reconciliation assembles the **verified**
sidecar at the reserved name `<plan>.deep-review.md`. This is the skill's canonical output; the
thin-slice `<plan>.deep-review-draft.md` was the pre-verification placeholder.

## Filename reclaim + leave the draft in place

- The verified output writes to `<plan>.deep-review.md` (the reserved name).
- An existing `<plan>.deep-review-draft.md` from a thin-slice/dogfood run is **left in place** — do
  not delete or overwrite it. It is a historical dogfood artifact; rotation and reclaim never touch
  it (it has a `-draft` infix, not a `.`-delimited rotation infix).

## Rotation (data-loss-safe — keep 5)

Before writing a fresh `<plan>.deep-review.md`, rotate any existing one out of the way and prune:

```bash
python3 "${CLAUDE_SKILL_DIR}/scripts/reconcile.py" rotate "<plan>.deep-review.md"
```

- If `<plan>.deep-review.md` exists, it is renamed to `<plan>.deep-review.<ISO>.md` (UTC stamp).
- Then only the **5 newest rotations** (by the ISO infix) survive; older ones are deleted.
- The prune matches **only** rotation files `<plan>.deep-review.<infix>.md` — never the base (just
  renamed away) and never the `-draft` sidecar. `skill_phase` persists in each rotated copy's
  frontmatter, so a rotated thin-slice draft is identifiable by frontmatter, not just by timestamp.

After rotation, write the fresh `<plan>.deep-review.md`.

## Frontmatter (verified)

```
skill_phase: verified
verification: quote-grep-backstop
coverage: full | reduced-confidence | panel-only
verdicts: {confirmed: N, not_found_in_doc: N, needs_human: N}
plan: <path>
models: <csv>
timestamp: <ISO, UTC>
user: <git config user.name>
content_preview: ran | unavailable
```

`coverage` and `verification` are **orthogonal axes** — one is "did all consented arms return?", the
other is "was the output grounded?" Keep them as separate fields; do not collapse them.

## Banner precedence

- The verified sidecar shows the **coverage** banner only (`full` → no banner needed;
  `reduced-confidence` → a one-line banner naming which arm degraded). The thin slice's UNVERIFIED
  banner does **not** appear here — the output is verified.
- Still surface a one-line triage note when there are NEEDS-HUMAN findings: "N cross-model findings
  need human triage (no verbatim quote to auto-ground)." This is informational, not the UNVERIFIED
  banner.

## Body

1. **Claude panel findings** — trusted, untagged (carried verbatim from Pass 1).
2. **Cross-model findings** — grouped by lens, verdict-tagged, with the grounding quote on each
   CONFIRMED. Render deterministically:

   ```bash
   python3 "${CLAUDE_SKILL_DIR}/scripts/reconcile.py" render-cross-model "<verify-records.json>"
   ```

3. **Decision-changing union** — a short closing section listing the findings (panel + CONFIRMED
   cross-model) that would change a go/no-go decision on the plan, so a reader gets the load-bearing
   set without scanning every lens. NEEDS-HUMAN findings are not auto-included here (un-adjudicated);
   the human may promote one after triage.

## Committed-leak reminder

When `content_preview: unavailable` (gitleaks absent), the chat summary must remind the user that
the sidecar quotes plan content and is about to be written — and, if they commit it, egressed into
version history — without an automated secret scan. **Do NOT modify `.gitignore`** (an untracked
sidecar is the user's to manage; silently ignoring it could hide a file they meant to share, and
silently committing it is the leak risk). This is a known open decision, not a settled default.
