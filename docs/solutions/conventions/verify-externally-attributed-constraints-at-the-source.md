---
title: "Verify an externally-attributed constraint against the spec text and the implementing source before encoding it"
date: 2026-08-21
category: conventions
module: "skills (SKILL.md size ratchet) and tests/codex-skill-prompt-budget.test.ts"
problem_type: convention
component: tooling
severity: medium
applies_when:
  - "A test, lint rule, or convention enforces a number attributed to an external standard, spec, or platform"
  - "The attribution carries no file-and-line citation into the spec text or the implementing source"
  - "A review comment or another agent asserts \"the spec requires X\" and you are about to design around X"
  - "Tightening, loosening, or justifying such a gate"
  - "A repo comment makes a negative claim about upstream (\"no such constant exists\")"
tags: [provenance, primary-sources, agent-plugins, agent-skills-spec, codex, verification, stale-claims]
---

# Verify an externally-attributed constraint against the spec text and the implementing source before encoding it

## Context

This repo enforces an 8,000-byte ceiling on every `SKILL.md` body. Around that ratchet a belief had settled: that 8,000 bytes is a requirement of the **Agent Plugins standard**. Contributing agents repeated it in review, and it leaked into repo comments as fact.

On 2026-08-21 the claim was checked against primary sources and found false. The Agent Plugins spec has no size limit of any kind; the real 8,000 is one host's implementation constant. A second, differently-shaped bound on another host had gone entirely unmodeled.

The full provenance — which bound comes from which host, what each one truncates, and the invalidation triggers — is owned by `docs/specs/agent-plugins.md` under "Skill body size: what actually constrains it". **This doc does not restate it.** What is captured here is the part that generalizes past skill sizing: how the question got settled, and the failure mode that let the wrong answer stand.

This is the sibling of `antigravity-target-empirical-format-verification.md` ("verify a new target's plugin format against the CLI binary, not its docs"). Same principle, different artifact: there the docs were unreliable, here the *ecosystem consensus* was.

## Guidance

**1. Settle a claimed external constraint at the source, not through what people say about it.**

Two kinds of primary source answer nearly every such question, and both are usually one command away:

```bash
# the spec text — is the constraint even in there?
gh api repos/agentplugins/agent-plugins-spec/contents/spec/1.0.0.md --jq .content | base64 -d | grep -inE 'bytes|size|truncat|8000'
gh api repos/agentplugins/agent-plugins-spec/contents/spec/1.1.0.md --jq .content | base64 -d | grep -inE 'bytes|size|truncat|8000'

# the implementing source — where does the number actually live?
gh api repos/openai/codex/contents/codex-rs/ext/skills/src/render.rs --jq .content | base64 -d | grep -n 'MAX_SKILL_PROMPT_BYTES\|CHAR_BUDGET'
```

Check **every published version** of a spec, not just the one being cited — a constraint absent from `1.0.0` and present in `1.1.0` is a different answer than "not in the spec."

Web search is the wrong instrument here. It returned confident, unsourced restatements of the same folklore, and one result asserted that no such limit could be found anywhere. A third-party blog restated a second host's numbers correctly, but only that host's own documentation could confirm them. Secondary sources reproduce consensus; the question was whether the consensus was true.

**2. Record provenance next to the enforcement, with a date.**

A number in a test needs three things beside it: which component owns it, what scope it applies to, and when that was last verified. Without them the number is unfalsifiable in practice — nobody re-checks it, nobody scopes it, and nobody notices when the implementing host moves it.

**3. Distinguish the bound from the standard, because the difference changes decisions.**

A limit believed to come from a standard is treated as immovable and universal. A limit known to come from one host's renderer is a scoped engineering constraint you can reason about: it may apply on only one code path, another host may impose a different one, and the two can be compared. Here the practical consequences were concrete — the repo's ratchet turned out to be the *tighter* of two bounds and to subsume the other, which is a fact you can only state once both are attributed.

**4. When several unrelated constants share a number, name all of them.**

Three unrelated 8,000s circulate in this ecosystem. That is why the folklore is self-reinforcing: any contributor who greps one of them "confirms" the belief. Recording all three with their distinct scopes is what stops the next agent from re-deriving the wrong conclusion from a correct grep.

**5. Treat a negative claim about upstream as perishable.**

A repo comment asserted that the body constant "is not in the Codex source." That was true when written and silently became false when upstream added it. Negative claims about someone else's codebase age worse than positive ones — a positive claim breaks loudly when the path moves, while a negative one just quietly stops being true.

So: give any claim about upstream a `file:line` and a verification date, and re-check it when you touch the surrounding rule. `tests/real-plugin-conversion.test.ts` and `docs/solutions/integrations/agent-plugins-schema-is-a-host-routing-switch.md` both carried stale upstream source paths found this way.

## Why This Matters

**A misattributed constraint cannot be questioned.** "The standard requires it" ends the conversation; "this host's renderer truncates there, verified on this date" invites the next useful question. The whole repo was tuned to one host's truncation while a second host's bound went unmodeled for months. It turned out to be looser, so the existing ratchet already covered it — that was luck, not design.

**The attribution determines what compliance means.** Once the bound is known to apply only on a specific host path, shrinking a skill stops being a compliance chore with an invented authority behind it and becomes a precondition for a specific capability, with a reason a reviewer can weigh.

**The folklore regenerates unless the disambiguation is written down.** Correcting one comment does not help if three same-numbered constants remain undistinguished. Recording the scopes is the durable fix.

## When to Apply

- A repo test, lint rule, or convention enforces a number, cap, or format attributed to an external standard or platform, and the attribution has no citation into spec text or implementing source.
- Someone asserts "the spec requires X" and you are about to design around X.
- You are about to move such a number. Re-verify before, not after.
- A stated provenance is old enough that upstream may have moved — especially a claim that something upstream does *not* exist.

Do **not** apply the full dig to internal repo conventions with no external claim behind them, or to a number the tree already cites to a specific file and line with a recent verification date. The cost is a few commands; spend it where an external party owns the truth.

## Examples

**Before — the belief as it read in the tree:**

> The 8KB body cap comes from the Agent Plugins spec. Skills must fit under it to be conformant.

Nothing to check, nowhere to look, and wrong on three counts: not from that spec, not universal, and not the only bound.

**After — the same rule with owner, scope, and date.** `docs/specs/agent-plugins.md` now carries a provenance table naming each bound's owning component, the code path it applies to, and what the truncation actually does, plus a re-verify trigger for each. `tests/codex-skill-prompt-budget.test.ts` carries the same provenance in its header, next to the constant it enforces.

**Before — a perishable negative claim:**

> the body constant is not in the Codex source (codex-rs/core-skills has no body-size constant)

**After** — the comment names the constants that now exist, cites the file that defines them, states which code path each applies to, and stamps the verification date.

**The operational consequence that outranks the byte count.** Both known truncations keep the **start** of the file. Neither reports an error. So body ordering is load-bearing: what must survive belongs above what may be cut, and a stop class or boundary rule must never sit below a long routing block. A skill can pass every mechanical gate, sit comfortably under the line, and still lose its stop conditions on a host that truncates or compacts. No test catches that — only the ordering discipline does. `docs/solutions/skill-design/size-driven-skill-restructure.md` carries this alongside the restructuring procedure.

## Related

- `docs/specs/agent-plugins.md` — owns the provenance table for both bounds and their re-verify triggers
- `docs/solutions/skill-design/size-driven-skill-restructure.md` — the restructuring procedure and the start-of-file ordering consequence
- `docs/solutions/integrations/agent-plugins-schema-is-a-host-routing-switch.md` — why the root manifest stays schema-less, which is what scopes one of the two bounds
- `docs/solutions/conventions/antigravity-target-empirical-format-verification.md` — the same principle applied to a target's plugin format
- Repo issues #1411, #1412 (the discovery) and PR #1479 (the only measured truncation-in-practice evidence)
- Upstream `openai/codex#37027` (introduced the bound), `openai/codex#37463` (open: proposes widening it)
