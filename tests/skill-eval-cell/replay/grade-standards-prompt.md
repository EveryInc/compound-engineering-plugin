Grade automatically drafted project review docs against the files a team actually wrote for the same repository at the same point in time.

Files are in `<grade dir>`:
- `real/`: the team's files. This is the reference.
- one directory per draft (`X/`, `Y/`, ...), from unknown sources, each with whatever `CODING_STANDARDS.md`, subtree standards files, and `REVIEW.md` that draft produced.

Read every file. Then:

1. Recall. List every rule in the real files, with a short id. For each draft, mark the rule:
   - "covered": the same defect class is stated, in any wording and any file of that draft.
   - "partial": a narrower or vaguer version.
   - "missing".
2. Draft-only rules. For each rule a draft has that the real files lack, label it:
   - "sound": a specific defect class a reviewer could check in a diff.
   - "too-specific": tied to one incident, volatile names, or numbers.
   - "misplaced": belongs in working instructions, process, or a check rather than a code rule.
   - "weak": vague or a restatement.
3. `REVIEW.md`, where present. Rate it 1-5 on whether its content is review policy (severity meaning, what not to flag, evidence a finding needs) rather than code rules or process. Note whether it includes `@CODING_STANDARDS.md`, and anything that looks invented, with no basis a repository's history could supply.
4. Overall, per draft:
   - Recall: covered + 0.5 × partial, over the total.
   - How usable it is as a starting point a team would edit rather than rewrite, rated 1-5.
   - The 3 biggest gaps.

Write JSON to `<grade dir>/grades.json` and reply with a summary table and the 3 biggest gaps per draft. Do not try to work out where the drafts came from.
