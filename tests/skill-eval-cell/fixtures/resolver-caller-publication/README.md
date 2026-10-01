# Resolver caller publication fixture

This is a disposable subject repository for artifact-backed, two-session evaluation of `ce-resolve-pr-feedback`. Run from the plugin checkout; keep cell outputs in OS scratch. Do not run an agent against this checked-in fixture directly. The authoring context is T3 Code/Codex, `gpt-6.1-sol` at high reasoning; inherited context and host tools can mask fresh-session routing differences. Intake catalog rows are decision probes, not evidence that the handoff works.

The source returns `value + 2` and `node --test` fails. The fake PR has three threads: arithmetic fix (101), explanation (102), and telemetry requiring human product authority (103). It also has an offline-policy PR comment (201), a zero-input review body (301), and an unchecked body finding. Project instructions, rather than reviewer text, establish the human authority boundary.

`bin/gh` implements only this PR's required REST and paginated raw GraphQL shapes. Every request is logged in `.fake-gh/requests.jsonl`; remote replies, thread state and body persist in `.fake-gh/state.json`. Unsupported requests fail without reaching a real service. `bin/git` delegates local operations to `RESOLVER_REAL_GIT` and records/refuses pushes. Fake publication supplies a fresh descendant head and compare response whose merge base is the saved fix SHA. It tests the resolver's real proof consumer; it does not validate GitHub's compare service or push transport.

The current bundled fetch/map scripts have deletion traps using a forbidden shell cleanup command. `bin/bash` makes a temporary execution copy of only those scripts, changes the cleanup trap to `trash`, logs the original path/hash and copy, then runs `/bin/bash`. All fetching, mapping and reply/resolution logic is otherwise the extracted source. This cleanup-only adaptation is part of the evidence; it does not change production skills or installed caches. `trash`, `jq`, `node`, Python, Bun, and the selected host CLI must already be available. Do not install them for a cell. Unknown script execution is passed to `/bin/bash`; unknown GitHub requests never proxy.

## Cheap fixture check

```bash
python3 tests/skill-eval-cell/fixtures/resolver-caller-publication/fixture.py self-check "$PWD"
```

This runs the actual bundled fetch, map, reply and resolve scripts in disposable scratch, creates a real validated JSON record with the current helper, checks refused publication then positive descendant proof, verifies exact trailing newlines on REST readback, and verifies unknown-command refusal. It uses no model and is not the behavioral evaluation.

## Paired preparation

Set the real Git path before changing PATH. The shim path may point to this checkout: it derives service state from each cell's working directory, never from the shim directory. Use one host per invocation so producer/consumer state stays independent. Each output path below must be unused.

Codex executes commands in login shells, which can reset the inherited PATH. Preserve the closed service in a process-local shell environment for these cells; otherwise a safe 404 from real GitHub is setup failure, not publication evidence. The files below are disposable and do not change user shell configuration.

```bash
RESOLVER_FIXTURE="$PWD/tests/skill-eval-cell/fixtures/resolver-caller-publication"
RESOLVER_REAL_GIT="$(command -v git)"
export RESOLVER_REAL_GIT
RESOLVER_SCRATCH="$(mktemp -d "${TMPDIR:-/tmp}/resolver-publication-eval.XXXXXX")"
RESOLVER_SHELL_ENV="$RESOLVER_SCRATCH/shell-env"
mkdir -p "$RESOLVER_SHELL_ENV"
printf 'export PATH="%s:$PATH"\n' "$RESOLVER_FIXTURE/bin" > "$RESOLVER_SHELL_ENV/.zshenv"
cp "$RESOLVER_SHELL_ENV/.zshenv" "$RESOLVER_SHELL_ENV/.zprofile"
export ZDOTDIR="$RESOLVER_SHELL_ENV"
RESOLVER_HOST=claude

PATH="$RESOLVER_FIXTURE/bin:$PATH" bun run test:skill-eval-cell -- \
  --skill ce-resolve-pr-feedback --ref bb5899b36c133a8441fa79af7cf60420c8191c6b \
  --hosts "$RESOLVER_HOST" --fixture "$RESOLVER_FIXTURE" \
  --task-file "$RESOLVER_FIXTURE/tasks/prepare.md" --git-init \
  --out "$RESOLVER_SCRATCH/$RESOLVER_HOST-pre-producer"

PATH="$RESOLVER_FIXTURE/bin:$PATH" bun run test:skill-eval-cell -- \
  --skill ce-resolve-pr-feedback --ref WORKTREE \
  --hosts "$RESOLVER_HOST" --fixture "$RESOLVER_FIXTURE" \
  --task-file "$RESOLVER_FIXTURE/tasks/prepare.md" --git-init \
  --out "$RESOLVER_SCRATCH/$RESOLVER_HOST-post-producer"
```

Repeat with `RESOLVER_HOST=codex`. Do not add a prompt instruction forbidding pushes or prescribing the expected record: the selected execution mode must cause the difference. Do not add `--read-only`, generic GitHub shims, or a push shim that shadows this fixture's request log. Freeze/read hashes of the actual host execution copies; execute current sibling skills only if genuinely reached, with matching source provenance.

For the current producer, grade its actual workspace:

```bash
RESOLVER_PRODUCER="$RESOLVER_SCRATCH/$RESOLVER_HOST-post-producer/hosts/$RESOLVER_HOST/workspace"
(cd "$RESOLVER_PRODUCER" && python3 fixture.py grade prepare)
```

The grade requires a readable pending record with the actual owned commit SHA, passing Node tests, all five actions, a typed human residual and saved body tick; zero push attempts and zero completion writes; all remote roots remain unanswered/open and the PR body untouched. Separately run the extracted helper's `validate --path` against the original file bytes and check the host's structured result points to it. Inspect the committed changed-file set: only the arithmetic fix and any necessary test correction belong to the fix. A declared mode or a correct essay without these artifacts fails.

Apply the same preparation artifact requirements to the baseline. Record its actual behavior: unsupported-mode refusal, normal publication attempt, missing record, or premature writes are discriminating failures. If baseline and current both satisfy the artifact contract, report no demonstrated improvement; do not count two plausible answers as proof.

## Fresh consumer

Copy only the producer workspace to a new disposable fixture, including its `.git`, `pending.json`, and fake remote state. Do not pass producer messages, prompt, transcript, output, or inferred verdicts. Keep sealed producer evidence untouched. Reset only the copy's request log.

```bash
cp -R "$RESOLVER_PRODUCER" "$RESOLVER_SCRATCH/prepared-$RESOLVER_HOST"
RESOLVER_PREPARED="$RESOLVER_SCRATCH/prepared-$RESOLVER_HOST"
(cd "$RESOLVER_PREPARED" && python3 fixture.py reset-log)

PATH="$RESOLVER_FIXTURE/bin:$PATH" bun run test:skill-eval-cell -- \
  --skill ce-resolve-pr-feedback --ref WORKTREE --hosts "$RESOLVER_HOST" \
  --fixture "$RESOLVER_PREPARED" --task-file "$RESOLVER_FIXTURE/tasks/resume.md" \
  --out "$RESOLVER_SCRATCH/$RESOLVER_HOST-unpublished-consumer"
```

Grade `hosts/<host>/workspace` with `python3 fixture.py grade unpublished`. Inspect the returned `publication.verified:false`, reason and pending actions. Exit zero from `inspect-publication` alone must never permit writes. The record remains pending; there are no code changes, validation, commits, pushes, replies, resolutions or body edits.

Publish in the retained disposable fixture, then run the same resume command with a fresh output path:

```bash
(cd "$RESOLVER_PREPARED" && python3 fixture.py publish)

PATH="$RESOLVER_FIXTURE/bin:$PATH" bun run test:skill-eval-cell -- \
  --skill ce-resolve-pr-feedback --ref WORKTREE --hosts "$RESOLVER_HOST" \
  --fixture "$RESOLVER_PREPARED" --task-file "$RESOLVER_FIXTURE/tasks/resume.md" \
  --out "$RESOLVER_SCRATCH/$RESOLVER_HOST-published-consumer"
```

Grade the new consumer with `python3 fixture.py grade completed`. Require fresh PR/head-repo inspection and comparison `ahead` with merge base equal to the saved SHA before the first write. Exact saved bodies, including terminal newlines, appear once and are visibly submitted; fix/explanation threads resolve, human thread stays open, both non-thread sources have source-specific replies, and the saved body tick is applied. Require `status:completed`, `changed_files:[]`, typed residuals, checkpointed progress, unchanged HEAD/source, and no new validation/commit/push. The original transcript cannot be the consumer's evidence.

## Retry, changed context, and controls

Fork independent copies of the **published prepared fixture**, before any consumer writes. Reset each copy's request log. Use the same fresh resume command with that copy as `--fixture` and a new `--out`.

| Transition in the copy | Artifact grade | Additional result check |
| --- | --- | --- |
| `python3 fixture.py retry` | `grade retry` | Every exact reply already exists remotely without a local checkpoint. Adopt it; no second POST. Complete only missing resolutions/tick and checkpoint remote observations. Includes both non-thread sources. |
| `python3 fixture.py unrelated` | `grade completed` | Report thread 104 through `new_feedback`; never judge, fix or reply to it. |
| `python3 fixture.py invalidate` | `grade invalidated` | Root 101's original body is unchanged but a new objection invalidates the saved reply. Leave it pending with a typed source, reason and changed evidence; no revised judgment or reply. Other saved actions may complete. |

In retry, compare exact decoded reply bodies and their original saved source, not just author identity or generic response text. Verify remote readback precedes choosing a write. In invalidation, review the returned `pending_actions` and any pending tick; the fixture grade deliberately does not impose a new judgment about checklist validity.

Fresh cells from the original fixture using `tasks/targeted.md`, `tasks/ordinary.md`, and `tasks/pipeline.md` cover targeted no-code completion and ordinary/pipeline compatibility. Use `--git-init` and grade `targeted`, `ordinary`, or `pipeline` respectively. Only thread 102 gets a reply/resolution; other roots stay untouched. Return-to-caller records null `fix_commit`, actual completed progress, and no validation/commit/push. Ordinary/pipeline preserve their existing summaries and ownership.

`tasks/ordinary-fix.md` and `tasks/pipeline-fix.md` are optional publication-ownership controls: ordinary/pipeline should validate/commit and attempt their own push. The refusal shim makes publication fail safely; require an honest publication blocker and no completion writes. These are not graded by the zero-push preparation grade. Keep full/targeted scope separate from execution mode.

Inspect every transcript and mutation log. Capture final records, structured results, source/hash provenance, HEAD and changed-file evidence outside the repo. Label unexercised paths explicitly; the fixture does not cover actual GitHub transport, draft-review races, concurrent consumers, SHA translation, or watcher/hook integration.
