---
title: Notification Preferences Redesign
type: feat
status: active
date: 2026-04-19
product_contract_source: ce-brainstorm
---

# Notification Preferences Redesign

## Problem Frame

Users currently manage notification preferences through a linear list of 18 toggle switches on a single screen. In-app analytics show a 6% engagement rate with the page and a support-ticket volume averaging 12/month for "I'm getting too many notifications" — both metrics documented in the Growth team's Q1 2026 review. This redesign restructures the page for faster comprehension and reduces support volume by giving users clearer control.

## Requirements Trace

5 requirements planned:

- R1. Group preferences by a meaningful dimension (channel, topic, or both)
- R2. Provide a bulk-action affordance for common preference sets
- R3. Add accessibility labels and keyboard navigation to the new controls
- R4. Preserve existing preference values during the migration

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

**Approach:** Pass `aria-label` through the `<Toggle>` prop interface. The `<Toggle>` component's existing `label` prop is rendered visually.

- [ ] Unit 4: Persist preferences during migration

**Goal:** The redesign ships as a replacement; existing preference values must be preserved.

**Files:** `src/db/migrations/20260419_notification_preferences_shape.sql`

**Approach:** Data model is unchanged; only the rendering layer is updated. No migration required beyond the UI swap.

## Design Notes

**Visual hierarchy:** Each group has a bold header, a lighter description, and the toggles in a vertical stack. Spacing between groups uses the same token as other settings surfaces (`space-6`).

**Toggle states:** Default (off), On, Saving, Error. The current design mocks show the Default and On states; Saving and Error are not represented.

**Grouping dimension — open question.** The design mocks show grouping by channel (Email, Push, SMS). Product has also argued for grouping by topic (Comments, Mentions, Updates, Marketing). Both structures work; the tradeoff is:
- Channel-grouped: users who want to kill push but keep email scan faster
- Topic-grouped: users who want to turn off marketing but keep mentions scan faster

## Scope Boundaries

- Not changing the underlying data model or preference-evaluation logic
- Not localizing the strings in this phase (all strings English-only)
- Not touching admin-side controls (org admin enforcement is covered in a separate initiative)

## Miscellaneous Notes

**Save pattern — open question.** The current page uses an explicit "Save" button at the bottom. The redesign mocks show auto-save on toggle. Tradeoff:
- Explicit save: users can experiment and discard
- Auto-save: one fewer interaction, matches platform conventions

**Admin enforcement.** Org admins may want to enforce certain notification preferences (e.g., mandatory security-alert emails). This plan assumes admin enforcement is out of scope per Scope Boundaries, but the grouping and default-state decisions below should not foreclose that future.

**Default state for new users.** All-on produces the current high-support-ticket problem; all-off silences potentially important notifications; curated subset requires us to pick which subset.

**Terminology.** The design mock header says "Notification Preferences," the navigation link says "Notification Settings," and the codebase file is `notification-config.ts`.

**Naming the page.** The current nav link says "Notification Settings"; the design mock header says "Notification Preferences"; product marketing uses "Notification Center." Any of these is legible.

**Cross-reference in Unit 3: see existing keyboard navigation guide in `docs/guides/keyboard-nav.md` (Section 4 — Form Controls) for the canonical tab-order pattern.**

**Animate toggle state changes.** A small state-change animation (150ms ease) would feel more polished. Not required by any stated goal.

**Analytics event suggestion.** We could emit a `notification_preference_changed` event with the before/after value. Useful for future Growth analysis but not required by any requirement.

## Minor Observations

- The mock layout "feels a little tight" — subjective style nitpick without evidence of impact.
- If we ever localize, the group headers will need translation. Localization is explicitly out of scope.
