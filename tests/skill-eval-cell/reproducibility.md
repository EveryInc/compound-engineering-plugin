# Evaluation evidence and regrading

Collection preserves what ran and how it was first graded. Regrading creates a
new assessment of those observations; it never replaces the original pack.

## Collection

Each `run.ts` or `pack.ts` invocation requires a new or empty `--out` directory.
An exclusive `.eval-owner` marker reserves it against concurrent collectors.
Choose a new directory for another run; removing the marker does not resume one.

Each cell records:

| Artifact | Purpose |
| --- | --- |
| `extract/skills/<skill>/` | Preserved initial skill bytes |
| `workspace/`, `task.md` | Initial workspace and exact task |
| `input-manifest.json` | Skill/workspace/task/harness fingerprints, requested ref, resolved commit, execution controls, runtime |
| `hosts/<host>/` | Independent skill and workspace copies, prompts, argv, CLI metadata, stdout/stderr, exits, Git observations |
| `evidence-manifest.json` | Content fingerprints sealing the collected artifacts |

A host may create Python caches or other files in its own skill copy. Those
outputs are sealed too; they do not change the preserved input snapshot.
`WORKTREE` identifies the actual copied content, with HEAD recorded only as
context. Committed refs resolve once to a commit before extraction.

Schema-v2 packs freeze each scenario, its original grades, and the grader's
runtime dependency hashes. Each completed arm seals the canonical
`{ grades, ok, pointer_ok }` object as `grade_result_sha256`. Missing or changed
result hashes are rejected before either reassessment mode reports an original
grade; do not manufacture hashes for older unsealed results. Atomic summary writes before collection and after
each arm retain completed progress when later collection fails. Arm status is
`collecting`, `graded`, or `collection-error`. Host nonzero exits and timeouts
remain failed grades with diagnostic evidence. Wanted, skipped, and actual hosts
are recorded; a passing subset does not establish coverage of unavailable hosts.

## Regrade

```bash
bun tests/skill-eval-cell/regrade.ts /path/to/pack.json
```

The default `current` mode applies the current catalog's **grade criteria** and
current trusted grader to the original observations. It preserves the original
skill, task, fixture, and arm context. A missing catalog scenario, changed task or
collection controls, changed fixture contents, or missing observation mechanism
produces `not-assessable`, not a passing or failed behavioral grade. Missing a
required output in a complete observation remains an ordinary grade failure.

To reproduce the original assessment:

```bash
bun tests/skill-eval-cell/regrade.ts /path/to/pack.json --mode original
```

Original mode uses the frozen criteria and requires a trusted checkout matching
the recorded grader hashes. It does not need the scenario in today's catalog.
It reproduces that grader's original decisions, including rubric mistakes;
observation-applicability checks belong to current reassessment.
Archived source and saved commands are never executed. `--mode current` can also
be specified explicitly.

Both modes verify evidence and write a new `pack.regrade-<uuid>.json` beside the
pack. Reports retain the selected criteria and their hash, grader fingerprints,
mode, source-pack hash, and results. A `not-assessable` arm retains its verified
`original_grade` and result hash too; an uncollected arm has no grade to invent.
A score change under a corrected criterion
is a reassessment, not proof of model improvement. Compare old and new runs under
the same criteria and grader when measuring improvement.

Exit 0 means passing; 1 means a failed grade, uncollected arm, or unassessable
observation; 2 means invalid input, integrity, or usage. Move the whole pack to
relocate it: relative cell paths are resolved beneath its current parent. Legacy
packs without provenance are unsupported; do not fabricate historical metadata.

## Evidence limits and maintenance

Fingerprints cover relative paths, bytes, entry kinds, executable bits, and empty
directories, independent of root location and mtime. Git internals and symlink
target contents are excluded. Both initial pack grading and regrading reject
symlink evidence, traversal, and workspace criteria reading `.git` components.
The trusted assessment fingerprint includes `regrade.ts`, `provenance.ts`,
`extract.ts`, `grade.ts`, `hosts.ts`, and `path-shim.ts`. Maintain `GRADER_FILES`
when that assessment path changes, including orchestration and verification,
not only immediate scoring imports. Mutable catalog criteria are snapshotted
separately: editing or removing today's scenario must not block original mode.

This is local consistency verification, not hermetic replay or authenticity
against an actor replacing evidence and hashes together. User configuration,
hooks, provider state, and external resources are not frozen. CLI version probes
are bounded; requested/observed models remain unknown when inherited from host
configuration. No new metadata dumps credentials, but existing transcripts and
workspace files may contain sensitive material. Host permission policies are
unchanged. Do not edit source or evidence during collection or assessment.

The provenance, regrading, and fake-CLI integration tests run in `bun run test`.
They exercise actual driver modules in temporary repositories, including Python
import side effects, without provider calls. They do not establish live-model
behavior or Windows-native driver support.
