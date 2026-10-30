# Document Review Output Template

This is the Phase 4 interactive presentation: what the user sees in the **same turn**, immediately before the routing question (`references/walkthrough.md`). A structured non-interactive result printed in an earlier turn, or a one-line finding count, does not satisfy that ordering. The non-interactive result is documented in `references/synthesis-and-presentation.md` (Phase 4 "Route Remaining Findings") and is separate from this template.

The reader wants to know three things: what the review changed, what it wants to change with their approval, and what only they can decide. Render only the items synthesis retained. Everything else the review did — which reviewers ran, how confident each was, how findings were merged, dropped, or promoted, which route a finding took internally — is the review's own bookkeeping. Leave it out unless it changes what the reader should trust: a reviewer that failed or did not run, or suppressed findings the reader may want back.

Write it as a short markdown report with headings and bullets, not tables. Internal enum values (`safe_auto`, `gated_auto`, `manual`), confidence anchors, tier names, and reviewer attributions do not appear. Every line obeys the shared rendering floor (`references/rendering-floor.md`): consequence first, every identifier the reader cannot understand without opening the document, tracker, or code is glossed or translated to its role, and there are at most two such identifiers per finding.

## Example

```markdown
## Doc review: user-auth plan

The plan holds together, but two places would send implementers the wrong way: Unit 6 rebuilds login flows the app already has, and the webhook endpoint is the only public route left without a rate limit. I fixed five smaller gaps directly. Two choices need you.

### Changed

- Fixed three consistency slips: one term for the pipeline throughout, a cross-reference to the wrong section, and the unit count.
- Added the rate-limit config update that Unit 3's new limits require to Unit 4.
- Added token refresh to the test scenarios, since Unit 2 makes tokens expire.

### Proposed fixes

Four fixes bring units in line with decisions the plan already made.

**Units that skip a standard the plan already sets**

- Implementers would rebuild the login and session flows the existing auth setup already ships, because no unit says to migrate off it — add the migration path to Unit 6 (custom auth).
- A flood of webhook requests would reach the app unthrottled while every other public route is capped — apply the plan's standard rate limit to Unit 5 (webhooks).

**Unit 7 — Cutover**

- Two passages disagree on whether a production reset may run, so executors could take opposite actions at the destructive step — align both with the stop condition in Risks.
- Diagnostics the plan requires would render nowhere, because no unit owns that UI — assign it to this unit.

### Decisions

1. **The plan promises offline support but every unit assumes a live connection.** Implementers will either build sync nobody scoped or ship something that breaks offline.
   Recommendation: drop offline support from the goal, since no requirement depends on it.
2. **Most of the work builds admin tooling, not the stated goal.** Eight of twelve units build admin infrastructure; two touch the goal.
   Recommendation: defer to Open Questions, since cutting scope is your call.

### Also noted

- The manual fixture setup takes 15 minutes per run; the existing seed script produces the same fixture in 2.
- Rollback for the Phase 2 data changes is not addressed.
- Open question for later: should export recovery keep 7 or 30 days of data?

Coverage: security-lens timed out, so auth risks were reviewed only by the general reviewers.
```

## Section rules

- **Heading and opening:** name the document in the heading. Open with two to four plain sentences saying what the review concluded about the document as a whole: whether it is sound, what the consequential problems are, and what the reader is being asked for. Counts may appear in prose ("two choices need you"); never as a standalone tally line.
- **Changed:** every fix synthesis step 3.7 routed to Apply. Give each fix that changes what someone would build or decide its own line, with enough substance that the reader need not diff the document. Collapse mechanical consistency fixes (counts, cross-references, terminology) into one line that names what kind they were. This is a report: no recommendation, no question. Omit the section if none.
- **Proposed fixes:** the grouped confirmation, shaped by the floor's "Presenting a batch" rule. Lead with what the batch does as a whole, head each group with what its members share, and keep every member visible as one line: the consequence, then the change as intent. Entailed corrections (obligations) group under the implementation unit, or the section on a document with no units, that they affect. **No decision appears here.** Sweeping a choice the user must make into this batch turns a genuine fork into a batch answer. Omit the section if none.
- **Decisions:** only the choices the user must still make, numbered, most severe first. Each carries a consequence-first title, one or two sentences on what goes wrong if left as-is, and the recommended action with its change in intent language. The recommendation must be visible here, because routing option A executes it without a further preview. When synthesis resolved a disagreement between reviewers, add one short line saying so. Omit the section if none.
- **Also noted:** FYI observations, residual concerns, and deferred questions, one line each, with no recommendation and nothing to answer. Omit the section if none.
- **Coverage:** one line, present only when something limits what the review covered: a reviewer that failed, timed out, or returned malformed output; a cross-model pass that was skipped or did not fold, named by target and requested model per the disclosure condition in `references/cross-model-review.md`; or findings suppressed because the user rejected them in an earlier round. Omit it when the review ran as planned.
- **Ending:** the routing question follows immediately. Do not add a closing summary or next-steps paragraph before it.
