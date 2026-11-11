# Single Pass

Read this when the input carried a `size-cutoff:<N>` token. The caller sets the threshold. This file says how to measure the scope against it and what runs on each side.

**Measure.** After the preflight, count the added or changed lines of code, as the preflight defines it, in the resolved scope. Count only the code outside tests: leave out tests, test fixtures, and blank lines. Anything the preflight says is not code never counts, however many lines it has. Tests stay in scope for review; they only do not count toward the size.

**Choose.**
- A count of N or more runs Step 2 as written: the full team, one reviewer per persona.
- A count below N runs one combined reviewer. Give one generic subagent every persona file Step 2 would have dispatched for this scope, each passed verbatim, together with the same scope, mode, proof tests, constraints, and project standards. Ask for one findings list, each finding labeled with the persona that raised it. Dispatch it as `references/reviewer-dispatch.md` describes, including the inline fallback.

The cutoff is never a reason to skip the pass. A scope below N still gets reviewed, by the combined reviewer; whether to skip a small change is the caller's decision and was made before this skill ran.

Steps 3 through 5 run the same way after either choice.

**Report.** Step 5's summary names the mode that ran and the count behind it, for example "single-pass (12 code lines, cutoff 30)" or "full team (45 code lines, cutoff 30)".
