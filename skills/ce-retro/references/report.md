# Report

**Result:** the user knows what was read, what changed, what was handed off, and what is still open, without opening the ledger or the transcripts.

## Final report

Lead with what changed, then:

- **Coverage:** for each harness, sessions read (subagents counted with their parent), or that its store was present but not read, or absent. Give the window and why it was chosen, sessions skipped for size or budget, and that only this machine's sessions were read.
- **Applied:** each edit, its commit, and the signal a later run will check.
- **Routed:** each item, its owner, and the owner's result or the path it produced. Name every drafted issue's path, and say it was not posted.
- **Not applied:** each approved item that failed or was refused, and why.
- **Graded:** earlier accepted changes that worked, that did not and became candidates, and that had no new sessions to grade.
- **Backups:** the path of every backup of a file outside the repo.

Cite session ids and paraphrase. Never quote transcript text.

## No-user branch

When no user can answer, or the ledger cannot be written, write the ranked candidates, each with its evidence, proof, fix, and owner, to `candidates.md` in the run's scratch directory. Report coverage and that file's path. Apply nothing and record nothing. When the ledger could not be written, also say how to rerun with access to it.
