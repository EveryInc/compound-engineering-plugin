---
title: Seeded Test Fixture — Notification Preferences Redesign
type: feat
status: active
date: 2026-04-19
---

<!--
This is a SEEDED TEST FIXTURE for ce-doc-review pipeline validation.
Third fixture alongside seeded-plan.md (rename/infra) and
seeded-auth-plan.md (auth migration). Designed to exercise three gaps
the other fixtures do not cover:

1. design-lens persona activation and calibration — the document
   contains UI/UX content, user flows, visual hierarchy, and
   interaction descriptions.
2. Zero-root chain path — every finding in this fixture is
   independent; no seeded premise challenges exist. The synthesis
   pipeline should correctly skip chain grouping (report
   "Chains: 0 roots" or omit the Chains line).
3. Small-document / minimum-persona path — the document is ~130
   lines (vs ~210 for the other fixtures) so the adversarial reviewer
   should run Quick mode (produce ≤3 findings), and scope-guardian /
   adversarial may not activate at all given the simpler shape.

Deliberate design constraint: NO premise-level challenges. Every
seeded finding is about execution details, not foundational
assumptions. There is no "is this feature justified?" or "does this
serve a real user problem?" shape. If any reviewer surfaces a
premise-level concern anyway, that is a calibration signal worth
flagging (over-charitable root identification).

Seed map (run this plan through ce-doc-review to verify):

- safe_auto candidates (2):
    - wrong count (Requirements Trace says 5 requirements, list has 4)
    - terminology drift ("preference" / "setting" / "config"
      used interchangeably for the same concept)

- gated_auto candidates (3):
    - missing accessibility labels on the toggle components —
      framework has standard aria-label pattern
    - missing loading/error state in the Save flow — standard
      pattern exists in the codebase (cite existing component)
    - missing confirmation dialog on "unsubscribe from all"
      destructive action — codebase pattern exists

- manual candidates (4, all INDEPENDENT, no premise roots):
    - Grouping strategy: by channel (email/push/SMS) vs by topic
      (comments/mentions/updates) — real tradeoff, both legitimate
    - Default state for new users: all-on, all-off, or curated subset
    - Save pattern: explicit Save button vs auto-save on toggle
    - Admin enforcement: can org admins enforce preferences, and
      with what override UX

- FYI candidates (3):
    - naming preference ("Notification Center" vs "Preferences" vs
      "Settings" — any works)
    - micro-interaction suggestion (animate toggle state changes,
      low-stakes)
    - speculative analytics-event addition (not required by any
      stated goal)

- drop-worthy P3s (2):
    - vague style nitpick on the mock layout
    - theoretical i18n concern when no localization is in scope

Expected pipeline behavior:
- design-lens activates (UI/UX content triggers it) and produces
  findings specific to its scope.
- scope-guardian may activate lightly (no priority tiers, ≤5
  requirements) or not at all.
- adversarial: either does not activate or runs Quick mode with ≤3
  findings.
- Chains: 0 roots (no premise challenges exist; chain grouping
  skipped). This is the key new-path test.
- Engagement burden expected: 2 applied + 3 gated + ~4-5 manual
  + ~2-3 FYI = roughly 7-10 user decisions, none of which cascade.

The absence of a chain is itself the test result — if a chain appears,
a reviewer has over-elevated an execution finding to premise-root
status, which is worth investigating.
-->

# Notification Preferences Redesign

## Problem Frame

Users currently manage notification preferences through a linear list of 18 toggle switches on a single screen. In-app analytics show a 6% engagement rate with the page and a support-ticket volume averaging 12/month for "I'm getting too many notifications" — both metrics documented in the Growth team's Q1 2026 review. This redesign restructures the page for faster comprehension and reduces support volume by giving users clearer control.

## Requirements Trace

5 requirements planned:

- R1. Group preferences by a meaningful dimension (channel, topic, or both)
- R2. Provide a bulk-action affordance for common preference sets
- R3. Add accessibility labels and keyboard navigation to the new controls
- R4. Preserve existing preference values during the migration

(Only 4 items listed despite "5 requirements" — seeded wrong-count safe_auto candidate.)

## User Flows

**Primary flow — change one setting:**
1. User opens Notification Preferences from the account menu
2. User sees the grouped layout with current values
3. User toggles one control
4. System persists the change (save pattern is an open question — see Miscellaneous Notes)

**Secondary flow — bulk unsubscribe:**
1. User clicks "Turn off all notifications" at the top of the page
2. System applies the change to every preference in the page
3. User sees a confirmation that changes were applied

(Seeded gated_auto: the destructive bulk-unsubscribe action has no confirmation dialog. The codebase pattern for destructive bulk actions — see `components/confirm-dialog.tsx` — is used elsewhere in the settings surface and would apply cleanly here.)

## Implementation Units

- [ ] Unit 1: Group preferences by a chosen dimension

**Goal:** Restructure the preference list into groups based on the chosen dimension.

**Files:** `src/routes/settings/notifications/page.tsx`, `src/routes/settings/notifications/group.tsx`

**Approach:** Render one `<PreferenceGroup>` component per group. Each group has a header and a body containing the toggles. Groups are expanded by default.

- [ ] Unit 2: Bulk-action affordances

**Goal:** Add a bulk-action row at the top of the page with an "Off" switch that turns off every preference at once.

**Files:** `src/routes/settings/notifications/bulk-actions.tsx`

**Approach:** One toggle at the page root that cascades to every child toggle when activated.

- [ ] Unit 3: Accessibility labels and keyboard navigation

**Goal:** Every new toggle has an aria-label, a visible focus ring, and is reachable via tab order.

**Files:** `src/routes/settings/notifications/group.tsx`, `src/routes/settings/notifications/toggle.tsx`

**Approach:** Pass `aria-label` through the `<Toggle>` prop interface. (Seeded gated_auto: the `<Toggle>` component in `src/components/toggle.tsx` does not currently accept an `aria-label` prop — implementer must extend the interface. The component's existing `label` prop is rendered visually; screen readers would announce both unless `aria-labelledby` is used. The codebase convention — see `src/components/toggle.tsx` line 34 — is to pass a hidden label via `aria-label` when the visible label is not the screen-reader-friendly string.)

- [ ] Unit 4: Persist preferences during migration

**Goal:** The redesign ships as a replacement; existing preference values must be preserved.

**Files:** `src/db/migrations/20260419_notification_preferences_shape.sql`

**Approach:** Data model is unchanged; only the rendering layer is updated. No migration required beyond the UI swap.

## Design Notes

**Visual hierarchy:** Each group has a bold header, a lighter description, and the toggles in a vertical stack. Spacing between groups uses the same token as other settings surfaces (`space-6`).

**Toggle states:** Default (off), On, Saving, Error. The current design mocks show the Default and On states; Saving and Error are not represented. (Seeded gated_auto: the codebase Save-flow convention — see `src/components/async-button.tsx` — is to show a subtle spinner on the interacting control during the pending state and a toast with retry on error. The plan's Save flow needs these states explicit.)

**Grouping dimension — open question.** The design mocks show grouping by channel (Email, Push, SMS). Product has also argued for grouping by topic (Comments, Mentions, Updates, Marketing). Both structures work; the tradeoff is:
- Channel-grouped: users who want to kill push but keep email scan faster
- Topic-grouped: users who want to turn off marketing but keep mentions scan faster

(Seeded manual: real tradeoff with no objectively correct answer. This is a product decision, not a design-correctness finding.)

## Scope Boundaries

- Not changing the underlying data model or preference-evaluation logic
- Not localizing the strings in this phase (all strings English-only)
- Not touching admin-side controls (org admin enforcement is covered in a separate initiative)

## Miscellaneous Notes

**Save pattern — open question.** The current page uses an explicit "Save" button at the bottom. The redesign mocks show auto-save on toggle. Tradeoff:
- Explicit save: users can experiment and discard
- Auto-save: one fewer interaction, matches platform conventions

(Seeded manual: save-pattern choice has real tradeoffs, neither is wrong.)

**Admin enforcement.** Org admins may want to enforce certain notification preferences (e.g., mandatory security-alert emails). This plan assumes admin enforcement is out of scope per Scope Boundaries, but the grouping and default-state decisions below should not foreclose that future. (Seeded manual: plan decides whether to preemptively accommodate admin enforcement or defer entirely.)

**Default state for new users.** All-on produces the current high-support-ticket problem; all-off silences potentially important notifications; curated subset requires us to pick which subset. (Seeded manual: real product decision, no objectively correct answer.)

**Terminology:** We use "preference," "setting," and "config" in different places to mean the same thing. The design mock header says "Notification Preferences" but the navigation link says "Notification Settings" and the codebase file is `notification-config.ts`. (Seeded safe_auto: terminology drift; dominant term is "preference" based on the mock and the user-facing label.)

**Naming the page.** The current nav link says "Notification Settings"; the design mock header says "Notification Preferences"; product marketing uses "Notification Center." Any of these is legible. (Seeded FYI: naming preference, low-stakes.)

**Cross-reference in Unit 3: see existing keyboard navigation guide in `docs/guides/keyboard-nav.md` (Section 4 — Form Controls) for the canonical tab-order pattern.** (Seeded safe_auto: this file does not exist in the repo; the reference is stale. Remove or point at a real target.)

**Animate toggle state changes.** A small state-change animation (150ms ease) would feel more polished. Not required by any stated goal. (Seeded FYI: micro-interaction, low-stakes.)

**Analytics event suggestion.** We could emit a `notification_preference_changed` event with the before/after value. Useful for future Growth analysis but not required by any requirement. (Seeded FYI: speculative analytics addition, not tied to stated goals.)

## Low-Signal Residuals (Seeded Drop-Worthy P3s)

- The mock layout "feels a little tight" — subjective style nitpick without evidence of impact. (Seeded drop: vague style preference at P3.)
- If we ever localize, the group headers will need translation. Localization is explicitly out of scope. (Seeded drop: theoretical i18n concern with no current relevance, P3.)
