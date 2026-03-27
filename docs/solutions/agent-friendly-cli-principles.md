# Building Agent-Friendly CLIs: Practical Principles

CLIs are a natural fit for agents — text in, text out, composable by design. They're also more practical than MCP for most developer-facing agent work: LLMs already know common CLI tools from training data, so there's no schema overhead. An MCP server can burn tens of thousands of tokens just loading its tool definitions before a single question is asked, while a CLI call costs only the command and its output. MCP earns its complexity when agents need per-user auth and structured governance, but for the tools developers build and use day-to-day, a well-designed CLI is faster, cheaper, and more reliable.

The details still trip agents up, though: interactive prompts they can't answer, help pages with no examples, error messages that say "invalid input" and nothing else, output that buries useful data in formatting. As agents become real consumers of developer tooling, CLI design needs to account for them explicitly.

This guide synthesizes ideas from Anthropic's tool-design guidance, the Command Line Interface Guidelines project, CLI-Anything, and practitioner experience into **7 practical principles** for evaluating whether a CLI is merely usable by agents or genuinely well-optimized for them.

This is not a generic CLI style guide. It is a rubric for CLIs that are intended to work well with AI agents.

---

## How to Use This Rubric

This guide is intentionally opinionated, but it is **not pass/fail**.

Use each finding to classify the CLI along three levels:

| Level | Meaning | Typical impact on agents |
|---|---|---|
| Blocker | Prevents reliable agent use | Hangs, requires human intervention, or makes output hard to recover from |
| Friction | Agents can use it, but inefficiently or unreliably | More retries, wasted tokens, brittle parsing, extra tool calls |
| Optimization | Improves speed, cost, and robustness | Better agent throughput, lower token cost, fewer corrective loops |

In practice, you should evaluate commands by **command type**, not only at the CLI level:

| Command type | Most important principles |
|---|---|
| Read/query commands | Structured output, bounded output, composability |
| Mutating commands | Non-interactive execution, actionable errors, safety, idempotence where feasible |
| Streaming/logging commands | Filtering, truncation controls, clean stderr/stdout behavior |
| Interactive/bootstrap commands | Automation escape hatch, `--no-input`, scriptable alternatives |
| Bulk/export commands | Pagination, range selection, machine-readable output |

This keeps the rubric practical. For example, idempotence is critical for many mutating commands, but not every `tail -f`-style command needs to satisfy it.

---

## The 7 Principles

| # | Principle | Why it matters |
|---|-----------|---------------|
| 1 | Non-interactive by default for automation paths | Agents cannot reliably answer prompts or navigate TUI flows |
| 2 | Structured, parseable output | Agents need stable data contracts, not presentation formatting |
| 3 | Progressive help discovery | Agents explore tools incrementally and benefit from concrete examples |
| 4 | Fail fast with actionable errors | Agents recover well when errors tell them exactly how to correct course |
| 5 | Safe retries and explicit mutation boundaries | Agents retry, resume, and recover; commands must not make that dangerous |
| 6 | Composable and predictable command structure | Agents chain commands and depend on consistent affordances |
| 7 | Bounded, high-signal responses | Extra output consumes context, time, and tool budget |

---

## 1. Non-Interactive by Default for Automation Paths

**The principle:** Any command an agent might reasonably automate should be invocable without prompts. Interactive mode can still exist, but it should be a convenience layer, not the only path.

This principle is strongly supported by the CLI Guidelines project: if stdin is not a TTY, the command should not prompt, and `--no-input` should disable prompting entirely. The broader inference from agent-tooling guidance is straightforward: tools that pause for human intervention are poor fits for autonomous execution.

**What good looks like:**

```bash
# Human at a terminal (TTY detected) — prompts fill in missing inputs
$ blog-cli publish
? Status? (use arrow keys)
    draft
  > published
    scheduled
? Status? published
? Path to content: my-post.md
Published "My Post" to personal

# Agent or script (no TTY, or --no-input) — flags only, no prompts
$ blog-cli publish --content my-post.md --yes
Published "My Post" to personal (post_id: post_8k3m)
```

- `Blocker`: a common automation command cannot run without a prompt
- `Friction`: some prompts can be bypassed, but behavior is inconsistent across subcommands
- `Optimization`: every automation path supports explicit flags and a global non-interactive mode

Recommended traits:

- Support `--no-input` or `--non-interactive`
- Detect TTY vs non-TTY and never prompt when stdin is not interactive
- Support `--yes` / `--force` for confirmation bypass where appropriate
- Accept structured input via flags, files, or stdin

**Evaluation goal:** verify that commands never hang waiting for input in non-interactive execution.

**One practical check (POSIX shell + Python 3 example):**

```bash
python3 - <<'PY'
import subprocess, sys

cmd = ["blog-cli", "publish", "--content", "my-post.md"]
try:
    result = subprocess.run(
        cmd,
        stdin=subprocess.DEVNULL,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=10,
    )
    print("exit:", result.returncode)
    print("PASS: command exited without hanging")
except subprocess.TimeoutExpired:
    print("FAIL: command hung waiting for input")
    sys.exit(1)
PY
```

Adapt the mechanism to your environment. The important part is the test purpose: **detach stdin and enforce a timeout**.

---

## 2. Structured, Parseable Output

**The principle:** Commands that return data should expose a stable machine-readable representation and predictable process semantics.

Anthropic explicitly recommends returning meaningful context from tools and optimizing tool responses for token efficiency. CLIG explicitly recommends `--json`, clean stdout/stderr separation, and suppressing presentation formatting in non-TTY contexts. This document extends that guidance into a CLI-evaluation rule for agent use.

**What good looks like:**

```bash
# Human-readable
$ blog-cli publish --content my-post.md
Published "My Post" to personal
URL: https://personal.blog.dev/my-post
Post ID: post_8k3m

# Machine-readable
$ blog-cli publish --content my-post.md --json
{"title":"My Post","url":"https://personal.blog.dev/my-post","post_id":"post_8k3m","status":"published"}
```

- `Blocker`: output is only prose, tables, or ANSI-heavy formatting with no stable parse path
- `Friction`: some commands support structured output, but coverage is inconsistent or stderr/stdout are mixed
- `Optimization`: all data-bearing commands expose a stable machine-readable mode with useful identifiers

Recommended traits:

- Support `--json` or another clearly documented machine-readable format on data-bearing commands
- Use exit code `0` for success and non-zero for failure
- Write result data to stdout and diagnostics/logs/errors to stderr
- Return meaningful fields such as names, URLs, status, and IDs
- Suppress color, spinners, and decorative output when not attached to a TTY

**Evaluation goal:** verify that structured output is valid, stable enough to parse, and cleanly separated from diagnostics.

**One practical check (POSIX shell + Python 3 example):**

```bash
blog-cli publish --content my-post.md --json 2>stderr.txt | python3 -c '
import json, sys
data = json.load(sys.stdin)
required = ["title", "url", "post_id", "status"]
missing = [field for field in required if field not in data]
sys.exit(1 if missing else 0)
'
echo "json-valid: $?"
test ! -s stderr.txt
echo "stderr-empty-on-success: $?"
rm -f stderr.txt
```

---

## 3. Progressive Help Discovery

**The principle:** Agents rarely learn a CLI from one giant document. They probe top-level help, then subcommand help, then examples. Help should support that workflow.

CLIG directly recommends concise help, examples, subcommand help, and linking to deeper docs. Anthropic separately shows that precise tool descriptions and examples materially improve tool-use behavior. The inference here is that CLI help should be designed as layered runtime documentation.

**What good looks like:**

```bash
$ blog-cli --help
Usage: blog-cli <command>

Commands:
  publish     Publish content
  posts       List and manage posts

$ blog-cli publish --help
Publish a markdown file to your blog.

Options:
  --content   Path to markdown file
  --status    Post status (draft, published, scheduled; default: published)
  --yes       Skip confirmation prompt
  --json      Output as JSON
  --dry-run   Preview without publishing

Examples:
  blog-cli publish --content my-post.md
  blog-cli publish --content my-post.md --status draft
  blog-cli publish --content my-post.md --dry-run
```

- `Blocker`: subcommands are hard to discover or `--help` is missing/incomplete
- `Friction`: help exists but omits concrete invocation patterns or required argument guidance
- `Optimization`: help is layered, concise, example-driven, and points to deeper docs when needed

Recommended traits:

- Top-level help lists commands clearly
- Subcommand help includes synopsis, required inputs, key flags, and at least one concrete example for non-trivial commands
- Common flags appear near the top
- Deeper docs are linked from help where helpful

**Evaluation goal:** verify that an agent can discover how to invoke a command without leaving the CLI or reading the source code.

**A better check than `grep example`:**

For each important subcommand, inspect whether help includes all four of:

1. A one-line purpose
2. A concrete invocation pattern
3. Required arguments or required flags
4. The most important modifiers or safety flags

If one of those is missing, treat it as `Friction`. If several are missing, treat it as a `Blocker` for discoverability.

---

## 4. Fail Fast with Actionable Errors

**The principle:** When a command fails, the error should help the agent fix the next attempt.

This is directly supported by Anthropic's guidance: error responses should communicate specific, actionable improvements rather than opaque codes or tracebacks. CLIG also recommends clear error handling and concise output.

**What good looks like:**

```bash
# Bad
$ blog-cli publish
Error: missing required arguments

# Better
$ blog-cli publish
Error: --content is required.
Usage: blog-cli publish --content <file> [--status <status>]
Available statuses: draft, published, scheduled
Example: blog-cli publish --content my-post.md
```

- `Blocker`: failures are vague, silent, or buried in stack traces
- `Friction`: errors mention what failed but not how to correct it
- `Optimization`: errors include the correction path, valid values, and nearby examples

Recommended traits:

- Include the correct syntax or usage pattern
- Suggest valid values when validation fails
- Validate early, before side effects
- Prefer actionable text over raw tracebacks by default

**Evaluation goal:** verify that a failed invocation tells the next caller how to succeed.

**One practical check:**

```bash
error_output=$(blog-cli publish 2>&1 >/dev/null)
exit_code=$?
printf '%s\n' "$error_output"
echo "exit=$exit_code"
```

Assess the error against these questions:

- Does it say what was wrong?
- Does it show the correct invocation shape?
- Does it suggest valid values or next steps?

If the answer is only yes to the first question, that is usually `Friction`, not `Optimization`.

---

## 5. Safe Retries and Explicit Mutation Boundaries

**The principle:** Agents retry, resume, and sometimes replay commands. Mutating commands should make that safe when possible, and dangerous mutations should be explicit.

This section intentionally goes beyond the sources a bit. Anthropic emphasizes clear boundaries, careful tool selection, and annotations for destructive tools; CLIG emphasizes confirmations, `--force`, and `--dry-run`. From an agent-readiness perspective, the practical synthesis is: retries must be safe enough that automation is not reckless.

**What good looks like:**

```bash
# Repeating the same command does not create duplicate work
$ blog-cli publish --content my-post.md
Published "My Post" to personal (post_id: post_8k3m)

$ blog-cli publish --content my-post.md
Already published "My Post" to personal, no changes (post_id: post_8k3m)

# Dangerous mutation is explicit
$ blog-cli posts delete --slug my-post --confirm
```

- `Blocker`: retrying a mutating command can easily duplicate or corrupt state with no warning
- `Friction`: destructive commands are scriptable but offer little preview or state feedback
- `Optimization`: retries are safe where feasible, and destructive intent is explicit and inspectable

Recommended traits:

- Provide `--dry-run` for consequential mutations where feasible
- Use explicit destructive flags for dangerous operations
- Return enough state in success output to verify what happened
- Make duplicate application a no-op or clearly detectable when the domain allows it

Important scoping note:

- For **create/update/deploy/apply** commands, idempotence or duplicate detection is usually high-value
- For **append/send/trigger/run-now** commands, exact idempotence may be impossible; in those cases, the CLI should at least make mutation boundaries explicit and return audit-friendly identifiers

**Evaluation goal:** verify that retrying or re-running a command is not surprisingly dangerous.

**Practical checks:**

- Run the same low-risk mutating command twice and compare outcomes
- Check whether destructive commands expose preview, confirmation-bypass, or explicit-danger affordances
- Check whether success output includes identifiers that let an agent determine whether it repeated work

---

## 6. Composable and Predictable Command Structure

**The principle:** Agents solve tasks by chaining commands. They benefit from CLIs that accept stdin, produce clean stdout, and use predictable naming and subcommand structure.

CLIG strongly supports composition: support stdin/stdout, `-` for pipes, clean stderr separation, and order-independent argument handling where possible. Anthropic separately recommends choosing thoughtful, composable tools instead of forcing agents through many low-level steps. The practical synthesis for CLI evaluation is consistency plus pipeability.

**What good looks like:**

```bash
cat posts.json | blog-cli posts import --stdin
blog-cli posts list --json | blog-cli posts validate --stdin
blog-cli posts list --status draft --limit 5 --json | jq -r '.[].title'
```

- `Blocker`: commands cannot participate in pipelines or have inconsistent invocation structure
- `Friction`: some commands are pipeable, but naming and structure vary unpredictably
- `Optimization`: the CLI is easy to chain because inputs, outputs, and subcommand patterns are regular

Recommended traits:

- Accept input via flags, files, or stdin where that materially helps automation
- Support `-` as a stdin/stdout alias when file paths are involved
- Keep command structures consistent across related resources
- Prefer flags for ambiguous multi-field operations; reserve positional arguments for familiar, conventional cases
- Avoid requiring users to remember arbitrary ordering rules for flags and subcommands

**Evaluation goal:** verify that commands can be chained without brittle adapters or special-case knowledge.

**Practical checks:**

- Can a command consume stdin or `-` when input logically comes from another command?
- Can output from a data command be piped into another tool without stripping logs or ANSI codes?
- Do related commands use similar verb/resource patterns?

This is a better evaluation axis than requiring a specific grammar such as `resource verb` for every CLI.

---

## 7. Bounded, High-Signal Responses

**The principle:** Agents pay a real cost for every extra line of output. Large outputs are sometimes justified, but the CLI should make narrow, relevant responses the default path.

This is directly aligned with Anthropic's token-efficiency guidance: use pagination, filtering, truncation, and sensible defaults for large responses, and steer agents toward narrowing strategies. This document adds a practical optimization stance for CLIs: a command may be usable while still being wasteful.

**What good looks like:**

```bash
# Broad but bounded
$ blog-cli posts list --limit 25
Showing 25 of 312 posts
To narrow results: blog-cli posts list --status published --since 7d --limit 10

# More precise
$ blog-cli posts list --tag javascript --status published --since 30d --limit 10 --json
```

- `Blocker`: a routine query command dumps huge output by default with no narrowing controls
- `Friction`: narrowing exists, but defaults are too broad or truncation provides no guidance
- `Optimization`: defaults are bounded, filters are obvious, and truncation teaches the next better query

Recommended traits:

- Support filtering, pagination, range selection, and limits on potentially large result sets
- Provide concise vs detailed response modes where helpful
- When truncating, explain how to narrow or page the query
- Return semantic identifiers and summaries before raw detail

On thresholds:

- A default response comfortably under a few hundred lines is often a strong optimization for agents
- A larger default is not automatically wrong if the command is inherently export-oriented or the data volume is intrinsic
- For evaluation, prefer asking whether the default is **proportionate to the common task** rather than treating any fixed line count as a hard fail

**Evaluation goal:** verify that agents can get relevant answers without first paying for an unnecessary data dump.

**Practical checks:**

- Compare default output to filtered output and check whether narrowing materially reduces volume
- Check whether the command exposes `--limit`, filters, time bounds, selectors, or pagination
- If default output is large, check whether the command is explicitly an export/bulk command rather than a routine query surface

As a heuristic, treat a default output above roughly 500 lines as a likely `Friction` signal unless the command is explicitly bulk-oriented and documented as such.

---

## Quick Assessment Checklist

Use this to evaluate a CLI quickly without pretending every issue is binary:

| # | Check | What you are testing | Typical severity if missing |
|---|-------|----------------------|-----------------------------|
| 1 | Non-interactive path | Can the command run with stdin detached and no prompt? | `Blocker` |
| 2 | Structured output | Can agents get machine-readable output without scraping prose? | `Blocker` or `Friction` |
| 3 | Discoverable help | Can an agent find the invocation shape from `--help` alone? | `Friction` |
| 4 | Actionable errors | Does failure teach the next correct invocation? | `Friction` |
| 5 | Safe mutation boundaries | Are retries, destructive actions, and previews handled explicitly? | `Blocker` or `Friction` |
| 6 | Composition | Can the command participate in pipelines cleanly? | `Friction` |
| 7 | Bounded output | Are defaults reasonably scoped for common agent tasks? | `Friction` or `Optimization` |

---

## Recommended Evaluation Flow

When assessing a real CLI, review it in this order:

1. Pick representative commands by type: one read command, one mutating command, one bulk/logging command, and any intentionally interactive workflow.
2. Check for automation blockers first: prompts, unusable help, prose-only output, mixed stdout/stderr.
3. Check recovery quality next: error messages, validation, stable identifiers, repeatability.
4. Check optimization last: narrowing defaults, concise modes, consistent structure, pipeability.

This avoids over-penalizing a CLI for missing optimizations before confirming whether agents can use it at all.

---

## Sources

### Primary sources

- [Writing effective tools for agents — Anthropic Engineering](https://www.anthropic.com/engineering/writing-tools-for-agents) — Primary source for tool design guidance around meaningful context, token efficiency, actionable errors, and evaluation-driven optimization.
- [Command Line Interface Guidelines](https://clig.dev/) — Primary source for CLI behavior around help, stdout/stderr separation, interactivity, arguments/flags, and composability.
- [CLI-Anything](https://clianything.org/) — Useful agent-CLI reference point emphasizing self-description, composability, JSON output, and deterministic behavior. Best treated as a practitioner framework, not a standards source.

### Additional references

- [Why CLI is the New MCP — OneUptime](https://oneuptime.com/blog/post/2026-02-03-cli-is-the-new-mcp/view) — Opinionated ecosystem commentary on why CLI remains a strong agent integration surface.
- [How to Write a Good Spec for AI Agents — Addy Osmani](https://addyosmani.com/blog/good-spec/) — Relevant to layered documentation and context budgeting, but not a primary source for CLI-specific guidance.
