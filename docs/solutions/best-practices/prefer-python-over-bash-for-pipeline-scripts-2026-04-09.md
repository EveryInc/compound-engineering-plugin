---
title: "Prefer Python over bash for multi-step pipeline scripts"
date: 2026-04-09
category: best-practices
module: "skill scripting / ce-demo-reel"
problem_type: best_practice
component: tooling
severity: medium
applies_when:
  - Script orchestrates 2+ external CLI tools (ffmpeg, curl, silicon, vhs)
  - Script needs retry logic or graceful degradation on tool failure
  - Script will run on macOS where bash 3.2 is the default
  - Script needs to be tested from a non-shell test runner (Bun, Jest, pytest)
  - Script has conditional failure paths where some errors should be caught and others should abort
tags:
  - bash-vs-python
  - pipeline-scripts
  - skill-scripting
  - set-e-footguns
  - error-handling
  - ce-demo-reel
---

# Prefer Python over bash for multi-step pipeline scripts

## Context

When building the `ce-demo-reel` skill, the initial implementation used a bash script (`capture-evidence.sh`) to orchestrate ffmpeg stitching, frame normalization, and catbox.moe upload. Over 4 review rounds, the script hit 4 distinct bug classes that are inherent to bash's execution model rather than simple coding mistakes.

## Guidance

Use Python for agent pipeline scripts that chain multiple CLI tools with error handling. Bash `set -euo pipefail` works for simple sequential scripts but becomes a footgun when you need controlled failure paths.

**Python subprocess model (explicit error handling):**
```python
result = subprocess.run(
    ["curl", "-s", "-F", f"fileToUpload=@{file_path}", url],
    capture_output=True, text=True, timeout=30, check=False
)
if result.returncode != 0:
    # Retry logic runs normally
    attempts += 1
    continue
```

**Python timeout handling (explicit catch):**
```python
try:
    result = subprocess.run(cmd, timeout=60)
except subprocess.TimeoutExpired:
    # Controlled failure, not a crash
    return subprocess.CompletedProcess(cmd, returncode=1, stdout="", stderr="Timed out")
```

**Bash equivalent (the footgun):**
```bash
set -euo pipefail

# Exits the entire script before retry logic runs
url=$(curl -s -F "fileToUpload=@${file}" "$endpoint")
# Never reaches here on curl failure

# Workaround: || true on every line that might fail
url=$(curl -s -F "fileToUpload=@${file}" "$endpoint") || true
# Works but fragile and easy to forget
```

## Why This Matters

Agent pipeline scripts run in environments the skill author does not control: different macOS versions (bash 3.2 vs 5.x), CI containers, worktrees. Each bash portability issue requires a non-obvious workaround that reviewers must catch. Python's subprocess model makes error handling explicit and testable rather than implicit and version-dependent.

The 4 bugs found were not unusual. They are the predictable consequence of using bash for scripts that exceed its sweet spot.

## When to Apply

Use Python when:
- The script orchestrates 2+ external CLI tools
- The script needs retry logic or graceful degradation on tool failure
- The script will run on macOS where bash 3.2 is the default
- The script needs to be tested from a non-shell test runner
- The script has more than ~3 subcommands

Bash is still the right choice when:
- Simple sequential scripts with no error recovery (set -e is fine)
- One-liner wrappers around a single tool
- Scripts using only POSIX features with no array manipulation
- Git hooks and CI steps where the only failure mode is "abort the pipeline"

## Examples

**Before (bash, 4 bugs across 4 review rounds):**

| Bug | Cause | Workaround needed |
|---|---|---|
| `url=$(curl ...)` exits on network failure | `set -e` + command substitution | `\|\| true` on every line |
| `${array[-1]}` fails | Bash 3.2 lacks negative indexing | `${array[${#array[@]}-1]}` |
| Frame reduction keeps all frames for n=3,4 | Integer math: `step=(n-1)/2` with min 1 | Minimum step of 2 |
| `command -v ffmpeg` in Bun tests | `command` is a shell builtin, not spawnable | Use `which` instead |

**After (Python, all 4 bug classes eliminated):**

```python
# Negative indexing just works
last = frames[-1]

# Timeout handling is explicit
try:
    result = subprocess.run(cmd, timeout=30)
except subprocess.TimeoutExpired:
    return None

# Tool detection is a regular function
if not shutil.which("ffmpeg"):
    sys.exit("ffmpeg not found")

# Math is straightforward
step = max(2, (len(frames) - 1) // 2)
```

## Related

- `docs/solutions/skill-design/script-first-skill-architecture.md`: covers when to use scripts vs agent logic (complementary: that doc answers "should a script do this?", this doc answers "which language?")
- `docs/solutions/agent-friendly-cli-principles.md`: CLI design from the consumer side (overlaps on exit code and stderr patterns)
