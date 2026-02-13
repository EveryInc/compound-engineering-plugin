# Workflow: Promote to Convention

<required_reading>
Read these references before promoting:
1. `../references/feedback-loop-patterns.md`
</required_reading>

<process>
## Step 1: Gather Promotion Input

Collect from the current finding:

- Candidate rule
- Rationale
- Source link to `docs/solutions/...`
- Optional scope (backend/frontend/testing/etc.)

## Step 2: Ensure Convention File Exists

If `docs/CONVENTIONS.md` is missing:

- Create it from `../assets/CONVENTIONS.md`
- Keep user in flow, do not redirect to setup

## Step 3: Check for Duplicate Rule

Search by rule keywords and source link.
If equivalent rule exists, suggest updating existing entry instead of duplicating.

## Step 4: Append Convention Entry

Append entry in a suitable section with this shape:

- Rule: [one sentence]
- Rationale: [one sentence]
- Source: [link to solution doc]

Prefer concise, enforceable language.

## Step 5: Confirm and Suggest Next Action

Confirm file update and suggest next action:

- If highly repeatable, suggest mechanical enforcement.
- If still emerging, track related debt occurrences.
</process>

<success_criteria>
- [ ] Convention file exists after workflow
- [ ] New entry has rule, rationale, and source
- [ ] Duplicate conventions are avoided
- [ ] Entry is concise and enforceable
- [ ] User receives a clear follow-up suggestion
</success_criteria>
