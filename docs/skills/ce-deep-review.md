# ce-deep-review (beta)

> **Beta, thin slice.** `ce-deep-review-beta` is invoked explicitly (it does not auto-trigger).
> At this stage it returns cross-model findings **unverified** — confabulation-checking is still
> manual. Per-finding verification and a reconciled sidecar arrive in a later phase.

## What it does

Runs a high-stakes plan through two passes:

1. **Claude panel (no egress)** — invokes `ce-doc-review` headless: the six-persona panel
   (coherence, feasibility, security, scope, product, adversarial).
2. **Cross-model panel (egress, with consent)** — after a single consent gate, fans the plan
   across the non-Claude reviewer CLIs you opt in to, for *decorrelated* findings the Claude panel
   may have missed.

It then writes a sidecar next to the plan. In the thin slice that is `<plan>.deep-review-draft.md`
(marked `verification: none`); the verified `<plan>.deep-review.md` is produced once the
verification phase lands.

## How it differs from `ce-doc-review`

`ce-doc-review` is the no-egress single-panel review. `ce-deep-review` adds cross-model
decorrelation — sending the plan to external vendors (with explicit per-model consent) to surface
issues a single model family tends to miss. Use it for genuinely high-stakes plans (irreversible
migrations, credentials, privacy, data cutover), not routine ones.

## Arms (v1)

| Arm | Status |
|-----|--------|
| **codex** (OpenAI) | available |
| **agy** (Antigravity) | available — the non-codex arm; macOS-only (its read-only floor is a seatbelt) |
| **grok** (xAI) | deferred — blocked by a grok 0.2.8 headless relay-auth bug |
| **gemini** (Google) | retired from the skill (410s 2026-06-18); arm retained only in the cross-model eval |

You need at least one arm installed + authenticated. With none, the skill runs the Claude panel and
writes a `*.panel-review.md` (it refuses to be quiet, not to run).

## Consent & safety

- **One gate.** Before any egress, a single interaction previews the plan for secret-shaped content
  (`gitleaks`, if installed), takes **per-model opt-in** (default: none selected), and captures your
  acknowledgment that you are responsible for each vendor's data-handling policy.
- **Graceful without gitleaks.** If `gitleaks` isn't installed the gate still opens, tells you no
  automated scan ran (you're the sole filter), and escalates the acknowledgment.
- **Egress = consent.** Only the models you select receive the plan.

See [`ce-deep-review-onboarding.md`](./ce-deep-review-onboarding.md) for per-CLI setup (codex, agy
paid-plan + DPA, gitleaks).

## Quick use

```
/ce-deep-review-beta docs/plans/my-plan.md
```

You'll get the Claude panel, then a consent gate listing the arms available in your environment,
then the cross-model findings + a sidecar.
