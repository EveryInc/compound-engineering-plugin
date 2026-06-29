---
title: A correctness cache needs a COMPLETE, schema-derived invalidation input set
date: 2026-06-29
category: docs/solutions/best-practices/
module: repo-grounding-cache
problem_type: best_practice
component: tooling
severity: high
applies_when:
  - Building an optimization cache whose stale result could change a downstream decision or output
  - Invalidating a cache by checking whether a set of "input" files changed
  - Deciding what counts as a cache-busting change vs. an ignorable one
tags: [cache, invalidation, correctness, freshness, git, stale-data]
---

# A correctness cache needs a COMPLETE, schema-derived invalidation input set

## Context

We cached a question-agnostic "project profile" (stack, deps, license, conventions, topology) keyed by git `<root-sha>/<head-sha>`, and reused it only when the working tree was "clean enough." The cardinal rule: the cache is an optimization that must **never** serve a stale profile that changes a skill's output. "Clean enough" was implemented as a delta check — reuse the entry unless a **profile-input** path is dirty (`git status --porcelain`). The whole correctness of the scheme rests on the *profile-input set* being complete.

The first version's input set was a hand-picked, JS/Python/Go/Ruby-centric allowlist of manifest filenames. Adversarial review found whole ecosystems missing — `.NET` (`*.csproj`, `*.sln`), Swift/iOS (`Package.swift`, `Podfile`), Deno, modern Python (`uv.lock`, `pdm.lock`), C/C++, Gradle version catalogs. In any of those repos, editing a manifest at an unchanged HEAD would **not** invalidate, and the cache would serve a profile with the old stack/deps — a silent cardinal-rule break.

## Guidance

When a cache must never change an output, treat the **invalidation input set as a completeness obligation**, not a convenience list:

1. **Derive the input set from the cached schema's actual sources**, conservatively, as a *superset*. Every field the cache stores must trace to the files that produce it; if a file feeds the schema, a change to it must invalidate. Over-matching costs a re-derive (cheap); under-matching serves stale (a correctness break).
2. **Span ecosystems, not just the ones in front of you.** A hardcoded allowlist will omit the language you don't use today. Use suffix matching for project-file families (`.csproj`/`.fsproj`/`.sln`) and cover the mainstream package managers, deploy descriptors, and CI configs.
3. **Catch *new* (untracked) inputs.** `git status --porcelain --untracked-files=all` surfaces a newly-added manifest as `??`; without `--untracked-files=all` git collapses a fully-untracked new directory to `?? dir/` and hides the manifest inside.
4. **Count both endpoints of a rename.** `R old -> new` must invalidate on the *source* too — a profile input renamed away (`package.json -> pkg.json`) otherwise drops its invalidation signal.
5. **Don't cache cheap-to-recompute, churny, correctness-sensitive data at all.** The `docs/solutions/` index is re-globbed fresh every run rather than cached: a directory listing is ~free, the consuming match reads files fresh anyway, and caching it risked serving a stale match (e.g. missing a just-written learning). Caching it AND invalidating on every write would defeat the cache exactly in the compounding loop. Glob-fresh wins over both alternatives.

## Why This Matters

A cache that "usually" invalidates is worse than no cache: it is correct in testing (you test the ecosystems you use) and silently wrong in production for someone else's stack. The failure is invisible — there's no error, just a stale answer fed into a decision. The completeness of the input set is the single load-bearing guarantee; everything else (keying, atomic writes, TTL) is secondary to it.

The general principle: **bias every ambiguous case toward over-invalidation.** A needless re-derive is a few seconds; a served-stale profile is a wrong verdict, plan, or review.

## When to Apply

- The cached value, if stale, would change a downstream decision (a verdict, a plan, a generated artifact) — not just a perf metric.
- You invalidate by "did these inputs change?" rather than by content hash.
- The set of inputs spans formats/ecosystems you can't fully enumerate from the current repo.

For a pure latency cache where a stale value is merely slower-correct (not wrong), this rigor is overkill — bound it by TTL and move on.

## Examples

```python
# Under-complete (silently serves stale in a .NET / Swift / Deno repo):
_MANIFEST = {"package.json", "go.mod", "Cargo.toml", "Gemfile", "pyproject.toml", ...}
def is_input(p): return os.path.basename(p) in _MANIFEST

# Complete superset: span ecosystems + suffix-match project files + untracked + rename
_MANIFEST = { ...JS, Go, Rust, Ruby, Python(+uv/pdm), PHP, JVM(+catalogs),
              Swift/iOS(Package.swift, Podfile), .NET(packages.config, *.props),
              Deno, C/C++, Haskell... }
_PROJECT_SUFFIXES = (".csproj", ".fsproj", ".vbproj", ".sln", ".cabal")
def is_input(p):
    b = os.path.basename(p)
    return (b in _MANIFEST or b.endswith(_PROJECT_SUFFIXES)
            or (("/" not in p) and b in _ROOT_DOCS)
            or p.startswith((".cursor/", ".github/workflows/", ".circleci/")))
# git status --porcelain --untracked-files=all  -> catches new ?? manifests
# rename "old -> new" -> append BOTH paths
```

## Related

- `docs/solutions/skill-design/cross-skill-shared-cache-primitive.md` — the cache this rule shipped on
- `docs/solutions/best-practices/predictable-tmp-cache-ownership-check.md` — a separate safety property of the same cache
- AGENTS.md "Shared Repo-Grounding Profile Cache"
