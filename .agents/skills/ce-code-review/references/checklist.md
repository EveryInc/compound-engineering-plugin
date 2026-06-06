# Review Checklist

Apply this checklist before and during review.

## Preflight

- [ ] Confirm the diff base and scope.
- [ ] Identify changed files and test impact.
- [ ] Verify no secrets are introduced.
- [ ] Check error paths for silent failures.

## Output Hygiene

- [ ] Every finding has severity and confidence.
- [ ] File references are specific enough to locate.
- [ ] Residual risks are called out when fixing is skipped.
- [ ] Testing gaps map to changed behavior.
