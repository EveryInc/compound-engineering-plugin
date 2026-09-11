# `ce-plan-grounding-check`

> Verify that an implementation plan is true of the repository before anyone stamps it `implementation-ready` or starts `ce-work`.

`ce-plan-grounding-check` is the disk-vs-document review. `ce-doc-review` asks whether the plan is coherent, feasible, and in scope. This skill asks whether the files, helpers, fixtures, and pipelines the plan names actually exist and mean what the plan says.

It writes a readiness review and a two-value verdict. It does not edit the plan or product code. `artifact_readiness: implementation-ready may only be set by a passing plan-grounding-check review` — `ce-plan` sets that flag only after this skill returns a passing verdict.

It is not `ce-pov` (a holistic take), not `ce-doc-review` (persona findings on the document), and not `ce-work` (execution). Use it when a plan claims it is ready, or when you want to know whether planning read the code.

---

## TL;DR

| Question | Answer |
|----------|--------|
| What does it do? | Builds a claim ledger from the plan, checks paths, symbols, fixtures, pipelines, semantics, house rules, and traceability against disk, then writes a readiness review |
| When to use it | After `ce-plan` writes a Durable software plan, before any `ce-work` unit, or when a plan already carries `implementation-ready` |
| What it produces | A readiness review under `<root>/plans/` and a verdict: **implementation-ready** or **amend then re-check** |
| What's next | On pass, `ce-plan` stamps `artifact_readiness: implementation-ready` and offers `ce-work`. On fail, amend the plan and re-run this skill |

---

## Example invocations

A path, or no path (newest Durable software plan). `ce-plan` invokes this itself after document review.

```text
# Check a specific plan
/ce-plan-grounding-check docs/plans/notification-mute-plan.md

# No path: the newest Durable software plan under the artifact root
/ce-plan-grounding-check
```

The `docs/plans/` path in that example is a repo default. When `docs_root` is set, compose the path under `<root>/plans/` instead.

---

## The Problem

A planning chain can be internally consistent and still be wrong about the repository. Later documents cite files, helpers, fields, fixtures, and pipelines by name because earlier documents did. Nobody opened the pack. The implementer discovers the gap on the first unit.

Document review does not catch that class. It reviews the document. This skill reviews the disk.

---

## The Solution

Eight steps, in order: claim ledger, path and symbol check, fixture profiler, pipeline arrows, semantics parity, house-rule and breakage scan, traceability orphans, then the review file.

A bundled read-only profiler (`scripts/pack_reality.py`) dumps fixture and pack shape — keys, cardinalities, identity hashes — so field claims are checked against data, not against prose about the data.

A red ledger row stays red. Unverifiable claims are marked unverified, not asserted. Completeness of planning sections is not readiness.

---

## Chain position

```text
/ce-plan  ->  /ce-doc-review  ->  /ce-plan-grounding-check  ->  /ce-work
              (document)          (disk)                       (build)
```

`ce-plan` runs this after non-interactive document review (Phase 5.3.85) and before the post-generation menu. `ce-work` re-checks the active unit's paths and fixtures before writing the first test.

If the skill cannot be invoked, `ce-plan` fails closed: it does not stamp `implementation-ready`.
