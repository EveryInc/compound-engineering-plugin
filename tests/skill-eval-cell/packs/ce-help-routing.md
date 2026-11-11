# ce-help routing behavioral eval

Use this evaluator-owned pack after a change to how skills hand off to each other, or to `skills/ce-help`. It checks that `ce-help` gives a direct answer where the state of the work decides, stays neutral where the choice is workflow preference, and states cross-skill facts that are still true. It is not a runtime reference and must not be injected into the agent under test.

## Method

Run each question on every host CLI you have, in a small git repo holding one requirements-only plan:

```bash
bun run test:skill-eval-cell -- --skill ce-help --with-skill ce-noslop --hosts claude,codex,grok \
  --fixture <fixture-dir> --git-init --task "Use the ce-help skill. <question>" --out <run-dir>
```

Give a fresh grader the answers under anonymous IDs, with `docs/guides/` and each skill's `SKILL.md` and references as the source of truth.

## Pass condition

- The recommended skill or sequence is what the sources support.
- Every claim about what a skill does, refuses, or runs is supported. A claim the sources are silent on is reported, not failed.
- No answer calls `lfg` required, or declares running steps by hand or using `lfg` objectively right when the user stated no preference. A stated preference is followed.
- The working tree stays clean.

A wrong supporting claim that traces to `skills/ce-help` text is a `Change`. A one-off overstatement by the model is not.

## Questions

| ID | Question |
|---|---|
| `vague` | I have a rough idea: let people pause notifications. I'm not sure exactly what it should be. Where do I start? |
| `prd` | We have a detailed PRD for a CSV export on the reports page, with every behavior spelled out. Should I start with ce-brainstorm or ce-plan? |
| `lfg-start` | Can I just run lfg right now on "add a CSV export button to the account reports page", or do I have to brainstorm first? |
| `lfg-brainstorm` | I just finished ce-brainstorm in this session and it wrote docs/plans/2026-10-20-feat-notification-mute-plan.md. Should I run ce-plan or lfg next? |
| `lfg-plan` | ce-plan just wrote an implementation-ready plan in this session. Should I run ce-work or lfg next? Will lfg plan all over again? |
| `pref-hands-on` | I just finished a brainstorm in this session. I always like to review the plan and the code myself before anything gets pushed. What next? |
| `pref-hands-off` | The feature is clear and small: add a CSV export button. I don't want to approve anything along the way, I just want a PR at the end. What do I run? |
| `refused` | I ran ce-work on docs/plans/2026-10-20-feat-notification-mute-plan.md and it refused. What did I do wrong? |
| `redundant` | ce-work just opened my PR. Do I now need to run ce-simplify-code, ce-code-review, ce-commit-push-pr and ce-babysit-pr myself? |
| `compound` | ce-work finished and opened my PR. We hit a subtle race condition the code doesn't explain. Does anything capture that automatically? |
| `ideate` | I picked an idea from a ce-ideate run in this repo. Can I go straight to ce-plan? |
| `slow` | Our /reports endpoint got slow last week and I don't know why. Should I use ce-optimize? |
| `old-plan` | I have an implementation plan from two months ago at docs/plans/2026-08-01-feat-export-plan.md. Can I hand it to lfg? And will lfg find it on its own if I don't give the path? |
| `bug-inspect` | I have a bug report and I want to see the diagnosis before anyone changes code. lfg or ce-debug? |
| `blocked-items` | My brainstorm plan from yesterday still has open Resolve Before Planning items. I'm in a new session and want to just run lfg on it. Will that work? |
| `review-apply` | ce-code-review just found 6 issues on my local branch and there's no PR yet. Do I use ce-resolve-pr-feedback to fix them? |
| `red-and-comments` | My PR has failing CI and three unresolved review comments. Do I use ce-debug, ce-resolve-pr-feedback, or ce-babysit-pr? |
| `old-pr` | I have a PR from three months ago that's way behind main. Should I rebase it myself, or is there a skill for this? |
| `explain-pov-wtf` | I want to know why we use Redis for sessions here and whether we should keep it. ce-explain, ce-pov, or wtf? |
| `compare-flows` | I want to compare three different checkout flows before committing to one. ce-brainstorm, ce-prototype, or ce-bakeoff? |
| `ui-checks` | My feature works and I want to check the UI before opening a PR. ce-test-browser, ce-dogfood, or ce-polish? |
| `lfg-stopped` | lfg stopped and said planning was blocked by a settled decision that can't work. Can I just run ce-work on the plan instead? |
| `hand-written` | I wrote a feature by hand with no plan and no CE skills so far. Which CE steps should I still run before merging, and in what order? |
| `sweep-next` | I just ran ce-sweep and it wrote a feedback plan. What now? |
| `non-software` | I need to organize a two-day team offsite. Which skill should I use, and will ce-work then carry it out? |
| `routing-models` | I want lfg to plan with Codex and implement with fable. Is that how I say it? |
| `merge-grant` | Can I get lfg to merge my PR when CI passes? |
| `multi-pr` | This feature is too big for one PR. How do I split it into several PRs with CE? |
| `end-of-day` | I'm stopping for the day. I want the next agent to continue this work, and I also learned something non-obvious about our auth flow. What do I run? |
| `strategy-first` | We don't have a STRATEGY.md. Do I have to run ce-strategy before ce-brainstorm? |
| `stale-learning` | A learning in our solutions folder is now wrong because of the fix I just shipped. Do I run ce-compound or ce-compound-refresh? |
| `adopt-then-build` | Should we adopt Biome? If the answer is yes I want it done hands-off. What's the sequence? |
| `review-skipped` | ce-work shipped my PR but says "Code review: skipped (mechanical diff)". Is something broken? Should I run ce-code-review? |
| `tiny-fix` | It's a five-line fix to a typo in a validation message. Do I need to go through the whole loop? |
