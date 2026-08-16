# Expectations — seeded-feature-plan.md

Answer key for this fixture. Never referenced from the fixture body; the fixture
must read as an ordinary plan to any reviewer.

Every planted finding here is independent — the fixture deliberately contains no
premise-level challenge, so chain grouping should report zero roots. A surfaced
chain means an execution finding was over-elevated to root status. The document
is also the shortest of the three fixtures, which exercises the small-document /
minimum-persona path, and it is UI/UX-heavy so the design lens should activate.

| # | Section | Planted issue | Expected class |
|---|---|---|---|
| 1 | Requirements Trace | Header says "5 requirements planned" but only R1-R4 are listed | safe_auto |
| 2 | Miscellaneous Notes | "Preference", "setting", and "config" name one concept across the mock, the nav link, and the filename; "preference" dominates | safe_auto |
| 3 | Miscellaneous Notes | Cross-reference points at `docs/guides/keyboard-nav.md`, which does not exist in the repo | safe_auto |
| 4 | User Flows — bulk unsubscribe | Destructive turn-off-everything flow has no confirmation step, though a confirm-dialog pattern exists in the settings surface | gated_auto |
| 5 | Unit 3: Accessibility labels | Plan passes `aria-label` alongside the visually rendered `label` prop, so screen readers announce both | gated_auto |
| 6 | Design Notes — Toggle states | Saving and Error states are named but not designed, so the Save flow has no pending or error/retry treatment | gated_auto |
| 7 | Design Notes — Grouping dimension | Channel vs topic grouping is an unresolved product tradeoff with two legitimate answers | manual |
| 8 | Miscellaneous Notes — Save pattern | Explicit Save button vs auto-save on toggle is left open with real tradeoffs either way | manual |
| 9 | Miscellaneous Notes — Default state | New-user default (all-on, all-off, or curated subset) is undecided and each option has a real cost | manual |
| 10 | Miscellaneous Notes — Admin enforcement | Plan defers org-admin enforcement while requiring current decisions not to foreclose it, with no stated boundary | manual |
| 11 | Miscellaneous Notes — Naming the page | Page name could be Settings, Preferences, or Notification Center; all are legible | FYI |
| 12 | Miscellaneous Notes — Animate toggle | Suggested 150ms state-change animation not tied to any stated goal | FYI |
| 13 | Miscellaneous Notes — Analytics event | Speculative `notification_preference_changed` event not required by any requirement | FYI |
| 14 | Minor Observations | Mock layout "feels a little tight" with no evidence of impact | drop |
| 15 | Minor Observations | Localization concern for group headers when localization is explicitly out of scope | drop |
