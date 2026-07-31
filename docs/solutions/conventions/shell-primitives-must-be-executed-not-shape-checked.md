---
title: "A shape assertion cannot prove a shell primitive exists — execute the documented block"
date: 2026-07-30
category: conventions
module: "skills (scratch-root preamble in 12 skills) and tests/scratch-root-contract.test.ts"
problem_type: convention
component: tooling
severity: high
applies_when:
  - "A guard test asserts that skill prose *contains* a shell command"
  - "Writing or reviewing a scratch-root, lock, or temp-dir preamble an agent will execute"
  - "Supporting native Windows contributors (Git Bash, not WSL)"
  - "A skill works on macOS/Linux and fails on one host before doing any work"
tags: [windows, git-bash, portability, shell, coreutils, testing, silent-failure, install, umask]
---

# A shape assertion cannot prove a shell primitive exists — execute the documented block

## Context

Twelve skills opened their scratch space with the same guarded preamble:

```bash
SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)";
[ ! -L "$SCRATCH_ROOT" ] && install -d -m 700 "$SCRATCH_ROOT" && [ ! -L "$SCRATCH_ROOT" ] \
  && [ -O "$SCRATCH_ROOT" ] && chmod 700 "$SCRATCH_ROOT" || { echo "unsafe scratch root" >&2; exit 1; }
```

`tests/scratch-root-contract.test.ts` enforced it, asserting each block *contained*
`install -d -m 700 "$SCRATCH_ROOT"`, an `-L` symlink guard, an `-O` ownership guard, and the
closing `chmod`. Every skill matched. The suite was green.

On native Windows Git Bash — a **supported** shell per `AGENTS.md` — that line fails:

```
$ install -d -m 700 /tmp/compound-engineering-197612
install: cannot change permissions of '/tmp/compound-engineering-197612': Permission denied
$ echo $?
1
```

`install` is MSYS coreutils shelling out to a `chmod` that NTFS will not honor. The non-zero
status trips the block's own `|| exit 1`, so **all twelve skills aborted scratch setup before
doing any work**. Discovered while validating the `ce-babysit-pr` native-Windows port (#1280):
the Python half was fixed and verified, and babysit still could not start, because the failure
was one layer up in the shell preamble the fix never touched.

The fix is the pattern the very next line of each block already used for its sub-directories:

```bash
[ ! -L "$SCRATCH_ROOT" ] && (umask 077; mkdir -p "$SCRATCH_ROOT") && ...
```

Identical end state on POSIX — created `0700`, then re-asserted by the existing `chmod` — and
it works on Git Bash. The `-L` and `-O` guards are untouched.

## Guidance

**A test that greps for a command proves the command is *spelled* right, never that it *runs*.**
When prose instructs an agent to execute something, execute it in a test on every supported host.

```ts
// Extract the block as it ships, redirect its root, and run it.
const rooted = block.replaceAll("/tmp/compound-engineering-$(id -u)", "$CE_ROOT/0")
const r = spawnSync(posixShell(), ["-c", `CE_ROOT="$1"\n${rooted}`, "sh", tmp])
expect(r.status).toBe(0)
```

Three things make this catch what the shape check could not:

1. **Run the extracted text, not a transcription.** Extract from the shipped file so prose drift
   and execution failure are caught by the same test.
2. **Run it on the hosts you claim to support.** This class of bug is invisible on the platform
   you develop on — that is its defining property, not bad luck. CI must execute the block under
   real win32; nothing patched from Linux reaches it.
3. **Assert the extractor found something.** A silently-zero-blocks test is green forever. Pin a
   minimum count.

**Prefer shell builtins over coreutils for privileged filesystem setup.** `mkdir`, `umask`, and
`test` are POSIX shell built-ins or MSYS-native; `install`, `stat -c`, and `chmod`'s effects are
where portability dies. `(umask 077; mkdir -p "$d")` sets the creation mode atomically and is the
portable spelling of `install -d -m 700 "$d"`.

## Why This Matters

The failure mode is the expensive one: **loud on the broken host, invisible everywhere else.** A
Windows user saw a skill decline to start with a message about an unsafe scratch root — which
reads as a security finding about *their* machine, not a portability bug in the tool. Meanwhile
CI, macOS, and Linux were all green, so there was nothing to investigate.

It also survived a full green run of a guard written specifically to protect this code. The guard
was not weak — it pinned four separate properties. It was just answering a different question
than the one that mattered.

This is the same lesson as
`docs/solutions/conventions/resolve-python-interpreter-not-python3.md` ("verify the literal
documented invocation, not a hand-adjusted variant"), reached from the opposite direction: there
the interpreter name was wrong, here the file-creation primitive was. Both shipped a command that
existed on `PATH` and still did not work. **The name resolving is not proof the thing runs.**

## When to Apply

Any test whose assertion is `toContain(<a shell command>)`. Ask what would happen if that exact
command were unavailable, a stub, or a no-op on a supported host — if the test would stay green,
it is a spelling check, and something has to actually run the command.

## Examples

Wrong — green on every platform, including ones where the skill cannot start:

```ts
expect(block).toContain('install -d -m 700 "$SCRATCH_ROOT"')
```

Right — the string check keeps prose consistent, and a second test proves it executes:

```ts
expect(block).toContain('(umask 077; mkdir -p "$SCRATCH_ROOT")')
expect(block).not.toContain("install -d")   // regression pin: it fails on Git Bash
// ...plus tests/scratch-root-preamble-executes.test.ts, run on ubuntu AND windows-latest
```
