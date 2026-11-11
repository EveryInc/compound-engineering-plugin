---
title: "An exclusion keyed on a word the input echoes gets matched lexically by a literal host"
date: 2026-09-28
category: skill-design
module: skills/ce-resolve-pr-feedback
problem_type: design_pattern
component: development_workflow
severity: high
applies_when:
  - "Writing an exclusion or carve-out in skill prose that judges external text (review findings, bot comments, issue bodies, user requests)"
  - "The exclusion names its case with a descriptor the judged text tends to use about itself (silent, unsafe, breaking, data loss)"
  - "A literal host and a stronger host split on a case the rule was written to decide"
tags:
  - skill-design
  - skill-eval
  - cross-host
  - state-conditions-not-cases
  - review-feedback
  - lexical-matching
  - ce-resolve-pr-feedback
related_components:
  - testing_framework
---

# An exclusion keyed on a word the input echoes gets matched lexically by a literal host

## Context

`ce-resolve-pr-feedback` gained a divert for true findings whose failure something already surfaces: "Something already bounds the failure" (`skills/ce-resolve-pr-feedback/references/evaluation-rubric.md:53`). The divert needs an exclusion so it never waves off a failure that costs something before anyone notices.

The first draft of that exclusion (never committed; reported from this session's eval) read: "This divert does not apply when the failure is silent (data lost or corrupted with no visible signal), or when it touches security, auth, billing, ..."

The eval fixture's T1 (`tests/skill-eval-cell/fixtures/resolve-feedback-proportionality/threads.json:11`) is a review-bot comment: "postToSlack ignores the HTTP response. If the Slack webhook returns an error, the summary is silently dropped." The fixture's runbook has the operator check the `#ops` summary the next morning (`tests/skill-eval-cell/fixtures/resolve-feedback-proportionality/docs/runbooks/grant-credits.md:7`). A missing summary moves no money and loses no data, and the next-morning check surfaces it. T1 is the case the divert exists for.

Per this session's eval, Claude replied on T1 in 3 of 3 trials and Codex fixed it in 3 of 3. Asked for its reasoning, Codex said: "postToSlack ignores unsuccessful HTTP responses, allowing the summary to disappear without reporting an error. The next-morning check does not prevent silent loss, so the rubric's bounded-failure exception does not apply." Codex matched the bot's word "silently" against the exclusion's word "silent" and never asked the question the exclusion was meant to ask.

## Guidance

Do not key an exclusion on a descriptor the judged input tends to use about itself. Review bots write "silently", "unsafe", "breaking", and "data loss" as emphasis. A literal host checks the exclusion against the input's wording, finds the word, and stops. State the exclusion by the property that decides it.

Here the deciding property is whether the failure's cost lands before anyone would see it. The current text (`evaluation-rubric.md:53`):

> This divert does not apply when the failure's cost lands before anyone would see it (data lost or corrupted, money or access granted wrongly), or when it touches security, auth, billing, data retention, a migration, or an irreversible external effect

That clause gives the reader nothing to string-match against the bot's comment. To apply it, the reader has to ask what the failure costs and when someone sees it. For T1 the answer is nothing, and the next morning.

This is a third mechanism in the family recorded in `docs/solutions/skill-design/subordinate-the-failing-shape-to-the-condition.md`. Point 1 of that doc covers a condition that loses a concrete shape a literal host was matching on. Point 2 covers a clause after an exclusion that competes with it. Here the exclusion was correctly placed and scoped, but its vocabulary collided with the input's vocabulary, so the literal host matched words instead of evaluating the condition. The two lessons pull in different directions on concrete wording, and they reconcile on what the concrete text is for: a subordinated example shape helps a literal host recognize the condition, while a descriptor the input itself uses gives it a string to match instead.

## Why This Matters

The draft read correctly. "Silent" was meant to mean "costs something with no signal", and Claude read it that way. A review would have passed it, and a Claude-only eval would have come back green. Only Codex showed the regression, and it went in the unsafe direction for this skill: the divert exists to stop over-fixing, and the exclusion re-enabled over-fixing for any finding a bot happened to call silent. Bots use these adjectives on most error-handling findings, so the draft would have made the divert close to inert on the host that reads most literally.

Per this session's eval, after the restatement Codex declined T1 in 2 of 3 trials. In the final paired run (catalog id `ce-resolve-pr-feedback/bounded-failure-gets-no-more-code`), with the fixture otherwise unchanged apart from an unrelated T3 rewording, the new rubric passed 6 of 6 (Claude 3, Codex 3) and the old rubric passed 0 of 6.

## When to Apply

- Writing an exclusion or guard in a skill that judges external text: review comments, issue bodies, error logs, user requests. Check whether the exclusion's key term is a word that text would use about itself. If it is, restate the exclusion as the property that decides it (cost, timing, reversibility, who sees it), and keep concrete wording only as an example of that property.
- A literal host makes the opposite call from a stronger host on a case the rule was written for. Ask the literal host for its reasoning and look for a quoted input word that matches a rule word.
- Not applicable when the input's word is the decider, for example a rule that keys on a literal label or marker the input is expected to carry.

## Examples

Before (first draft, Codex fixed T1 in 3 of 3):

> This divert does not apply when the failure is silent (data lost or corrupted with no visible signal), or when it touches security, auth, billing, ...

Input it collided with (`threads.json:11`): "... the summary is silently dropped."

After (`evaluation-rubric.md:53`, 6 of 6 in the final paired run):

> This divert does not apply when the failure's cost lands before anyone would see it (data lost or corrupted, money or access granted wrongly), or when it touches security, auth, billing, ...

A separate fixture confound came up in the same session. When a human's ask in the fixture mentioned money (re-running would credit users twice), Codex escalated it on both arms, independent of the rubric change. When a fixture tests one divert, keep money, auth, and other authority-bound cues out of the threads meant to test something else, or they mask the result.
