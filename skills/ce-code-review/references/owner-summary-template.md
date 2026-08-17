# Code Review Owner Summary

This is the default human output. It is for a product owner or teammate who needs the decision and the user impact. The full technical report remains in `report.md` and is available only when the user asks for more detail.

## Required shape

```markdown
## Code Review

**Result:** Not ready.

People who start a new recording quickly could lose or confuse that recording. The app can also show photos from the previous recording.

### What needs to change

- Keep an older recording from changing a newer recording.
- Start each new recording with a photo count of zero.
- Add tests for both cases.

### What still needs proof

- Test the finished behavior on real iPhone and Android devices.

Ask for technical details if you want the full engineering report.
```

## Rules

- Start with `**Result:** Ready.`, `**Result:** Ready after fixes.`, or `**Result:** Not ready.`
- Describe user impact before implementation detail.
- Use one short paragraph for the effect on users.
- Include each blocking or decision-relevant finding in `What needs to change`. Merge findings only when one plain-language action fully covers them.
- Include `What still needs proof` only when missing verification can change readiness.
- If fixes were applied, add `What changed` before `What still needs proof`.
- If the review is clean, say what was checked in one short sentence. Do not add empty sections.
- Do not show priority codes, requirement or unit IDs, file paths, line numbers, code symbols, reviewer names, model names, confidence values, route names, suppressed-finding counts, or validator mechanics.
- Do not link or print the artifact path in the default response. Keep it available for an explicit request for technical detail.
- Preserve coverage by translating every decision-relevant finding into user impact or a required action. Do not preserve review-internal detail in the default response.
- End with the exact offer: `Ask for technical details if you want the full engineering report.`
