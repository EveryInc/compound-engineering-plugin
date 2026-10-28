---
artifact_contract: ce-unified-plan/v1
execution: code
---
# Widget empty state - Plan
## Goal Capsule
Help people create their first widget.
## Product Contract
### Requirements
R1. The empty-state message is left aligned, with a Create your first widget button below it.
R2. Existing populated widgets retain their current layout.
### Key Decisions
- Left alignment supersedes the prototype's centered message. Governs R1.
### Sources
- Prototype for R1: /local/planner-checkout/.context/compound-engineering/ce-prototype/widget-empty/ (decisions.md and 01-empty/screens/selected.html). Machine-local, best effort while the originating checkout exists. A missing path is not a blocker. The plan's requirements govern conflicts; R1 changed alignment after prototype approval.
## Planning Contract
KTD1. Use the existing Widget component. Covers R1, R2.
## Implementation Units
### U1. Widget empty state
- Goal: show an actionable empty widget.
- Covers R1, R2; follows KTD1.
- Files: src/widget.tsx and tests/widget.test.tsx.
- Approach: add the empty state without changing populated widgets.
- Test scenarios: zero widgets shows the message and action; populated widgets retain their layout.
- Verification: bun test tests/widget.test.tsx.
## Verification Contract
Run bun test tests/widget.test.tsx and inspect empty and populated widget states.
## Definition of Done
R1 and R2 pass the named checks.
