# Workflow: Track Tech Debt

<required_reading>
Read these references before tracking:
1. `../references/entropy-management.md`
2. `../references/feedback-loop-patterns.md`
</required_reading>

<process>
## Step 1: Gather Debt Input

Capture:

- Issue label
- Severity (`critical`, `high`, `medium`, `low`)
- Status (`active`, `scheduled`, `resolved`)
- Source link (`docs/solutions/...`)

## Step 2: Ensure Debt File Exists

If `docs/TECH_DEBT.md` is missing:

- Create from `../assets/TECH_DEBT.md`
- Continue workflow in-place

## Step 3: Parse Existing Table

Expected headers:

`Issue | Occurrences | Severity | Status | Source`

If an issue row already exists, increment `Occurrences`.
Else add a new row with `Occurrences = 1`.

## Step 4: Apply Promotion Rule

If `Occurrences >= 3`, emit suggestion:

`This pattern has appeared N times. Consider promoting to convention.`

Do not auto-promote.

## Step 5: Confirm Update

Report whether row was created or incremented.
Include current occurrence count.
</process>

<success_criteria>
- [ ] Debt file exists after workflow
- [ ] Table format remains parseable
- [ ] Existing entries increment correctly
- [ ] New entries include source links
- [ ] Promotion suggestion appears at 3+ occurrences
</success_criteria>
