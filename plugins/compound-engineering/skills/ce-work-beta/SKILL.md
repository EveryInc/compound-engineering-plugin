---
name: ce:work-beta
description: "[BETA] Execute work plans with external delegate support. Same as ce:work but includes experimental external delegation mode for token-conserving code implementation. Use when testing delegation workflows before promoting to ce:work."
argument-hint: "[plan file, specification, or todo file path]"
disable-model-invocation: true
---

# Work Plan Execution Command (Beta)

This is the beta variant of `ce:work` that includes the External Delegate Mode feature for testing. Once stable, the delegation section will be promoted to `ce:work` and this beta skill will be removed.

**All behavior is identical to `ce:work`** - this skill simply re-includes the full `ce:work` content with the External Delegate Mode section active.

To use: run `/ce:work-beta [plan file]` instead of `/ce:work [plan file]`.

The delegation feature activates when:
- The user says "use codex", "delegate mode", or "delegate to codex"
- A plan implementation unit contains `Execution target: external-delegate`

See `ce:work` SKILL.md for the full workflow. This beta wrapper exists so we can test delegation safely before promoting.
