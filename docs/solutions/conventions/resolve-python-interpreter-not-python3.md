---
title: "Resolve the Python interpreter by probing execution — never hardcode `python3` in agent-facing prose"
date: 2026-07-24
category: conventions
module: "skills (agent-facing reference prose and SKILL.md shell blocks across every skill with bundled scripts)"
problem_type: convention
component: tooling
severity: high
applies_when:
  - "Writing a SKILL.md or reference doc that instructs an agent to run a bundled script"
  - "A bundled Python script works when run by hand but the documented invocation fails"
  - "Supporting native Windows contributors (not WSL, not Git Bash with a POSIX Python)"
  - "A feature degrades to a fallback path on one platform and never reports why"
tags: [windows, python, interpreter-resolution, portability, skill-authoring, silent-failure, store-stub]
---

# Resolve the Python interpreter by probing execution — never hardcode `python3` in agent-facing prose

## Context

While adding native Windows support to `peer-job-runner.py` (issue #1243), the runner
itself was made to work — verified end to end on Windows 11. The feature still did not
work, because every skill that invokes it tells the agent to run:

```bash
python3 "$SKILL_DIR/scripts/peer-job-runner.py" start ...
```

On native Windows, `python3` resolves to the **Microsoft Store App Execution Alias stub**.
It prints an install advertisement and exits non-zero without running Python. The standard
python.org Windows installer creates `python.exe` and `py.exe` — it **never** creates
`python3.exe`. So this is the default state of an extremely common setup, not an edge case.

Observed on Windows 11 / Python 3.11:

```
$ python3 --version
Python was not found; run without arguments to install from the Microsoft Store, ...
$ echo $?
49
$ python --version
Python 3.11.0
```

The failure surfaced while attempting a sanctioned cross-model review pass: it died at the
interpreter, before the runner's own preflight ever ran.

## Guidance

**Do not hardcode an interpreter name in prose an agent will execute.** Resolve it, and
resolve it by *probing execution*, not presence.

```bash
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
```

Then invoke `"$PY" "$SKILL_DIR/scripts/…"`.

Three rules make this work:

1. **Probe execution, not existence.** This is the whole trap. `command -v python3`
   **succeeds** — the Store stub is a real file on `PATH`. Every existence check (`command
   -v`, `which`, `test -x`) passes and the call still fails. Only actually running the
   interpreter (`"$c" -c ''`) distinguishes them.
2. **Repeat the resolution in every self-contained shell block.** Agent harnesses run each
   tool call in a **fresh shell**, so a `$PY` exported in one block does not exist in the
   next. The repetition is deliberate, not redundancy to factor out — the same reason
   `SKILL_DIR` is already set inline in every block in these docs.
3. **Fail loudly when nothing resolves.** A silent fallback to a broken interpreter is how
   this bug survived; an explicit non-zero exit with a message is the point.

Order matters: try `python3` first so POSIX hosts keep their canonical name, then `python`,
then `py` (the Windows launcher, the most reliable there). Note `python` can *also* be a
Store stub if python.org Python is not installed — which is why the probe, not the order,
is what guarantees correctness.

## Why This Matters

The failure is silent in the worst way: the calling workflow degrades gracefully. In
`ce-code-review`, a failed cross-model dispatch falls back to the in-process adversarial
reviewer and the run completes normally — so a Windows user gets a *quietly weaker review*
forever, with no error and no indication that an entire independent-model pass never ran.

It also invalidates smoke evidence. This project's own Phase C smoke commands invoke
`python $runner start ...`, so the runner passed its verification while the shipped
invocation path — the one an agent actually follows — stayed broken. **Verify the literal
documented invocation, not a hand-adjusted variant.**

## When to Apply

Any time agent-facing prose or a bundled script names an interpreter or external tool that
the host may resolve differently. Python is the instance encountered here; the class is
larger. The general form: *the name on PATH is not proof the thing runs.*

Related repo scope: 17 invocation sites across the cross-model review/elevation path were
converted to this pattern. The remaining sites in unrelated skills (`pr-snapshot`,
`sweep-state.py`, `validate-*.py`, session-history extractors) are tracked in issue #1247 and
should reuse this exact snippet rather than inventing a variant.

## Examples

Before — works on macOS/Linux, silently unreachable on native Windows:

```bash
SKILL_DIR="<absolute path…>";
python3 "$SKILL_DIR/scripts/peer-job-runner.py" status "<job-id>" --json
```

After — self-contained, correct on every host:

```bash
SKILL_DIR="<absolute path…>";
PY="$(for c in python3 python py; do command -v "$c" >/dev/null 2>&1 && "$c" -c '' >/dev/null 2>&1 && { echo "$c"; break; }; done)"; [ -n "$PY" ] || { echo "no working Python 3 interpreter on PATH" >&2; exit 1; };
"$PY" "$SKILL_DIR/scripts/peer-job-runner.py" status "<job-id>" --json
```

The wrong fix, for the record — this passes and still breaks, because the stub satisfies it:

```bash
PY=$(command -v python3 || command -v python)   # WRONG: existence, not execution
```
