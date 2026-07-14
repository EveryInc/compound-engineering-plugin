import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * `!`cmd`` pre-resolution in a SKILL.md runs `cmd` at skill-LOAD time and inlines
 * its stdout. This plugin BANS the construct outright in skill content. Two
 * unfixable properties drove the ban:
 *
 *   1. Claude-Code-ONLY. On Codex, Cursor, Gemini, and Grok the `!`cmd`` line is
 *      inert literal text — the pre-resolution never runs, so a skill that
 *      depends on the inlined value is already broken off-Claude.
 *   2. On Claude Code, a `!`cmd`` that exits NON-ZERO ABORTS skill load with a
 *      user-facing error. Every real use in this plugin was git context
 *      (`git rev-parse --show-toplevel`, `git rev-parse --abbrev-ref origin/HEAD`,
 *      `gh pr view …`) whose non-zero exit is a NORMAL state — no PR yet, no
 *      `origin/HEAD`, detached HEAD, not a repo, missing/unauthenticated `gh`.
 *      So the ordinary case aborted the skill.
 *
 * The guards that forced exit status 0 (`2>/dev/null || echo SENTINEL`) are
 * POSIX-only and fail to PARSE under Windows PowerShell 5.1 — no `||`/`&&`, and
 * `/dev/null` resolves to a literal file path (`D:\dev\null`) — which broke
 * skill load there instead (issue #1066). There is no single command string
 * that BOTH exits 0 on the expected-failure states AND parses under both POSIX
 * sh and PowerShell, so the construct cannot be made safe inside the `!` line.
 *
 * The replacement: gather context at RUNTIME as single argv-style commands
 * (`git …`, `gh …`, one per tool call, no shell operators) whose exit status
 * the agent interprets as control flow. A single external-program invocation
 * parses identically under POSIX sh and PowerShell, and a non-zero exit becomes
 * data the agent reads rather than a load-time abort. See `ce-commit` and
 * `ce-commit-push-pr` for the pattern.
 *
 * Saga that led here: the permission-checker rejections (#699 `case`/`esac`,
 * #701/#710 `[A] && B || C`, #709 nested `$()` strings, #758/#934 `;`
 * separators, pipes, parameter expansion) forced ever-narrower guard shapes,
 * then #1066 showed those guards break skill LOAD under PowerShell. Rather than
 * chase a portable guard that does not exist, the construct is banned and
 * context moved to runtime.
 */

const PLUGIN_SKILLS_GLOB = ["skills"]

function listSkillFiles(): string[] {
  const out: string[] = []
  for (const rel of PLUGIN_SKILLS_GLOB) {
    const root = path.join(process.cwd(), rel)
    try { statSync(root) } catch { continue }
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      const skillDir = path.join(root, entry.name)
      function walk(dir: string) {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, e.name)
          if (e.isDirectory()) { walk(full); continue }
          if (e.name.endsWith(".md")) out.push(full)
        }
      }
      walk(skillDir)
    }
  }
  return out
}

function findPreResolutionCommands(body: string): { lineNumber: number; command: string }[] {
  // Scan the entire body so multi-line `!` blocks are also caught. `[^`]*`
  // matches across newlines (line terminators are not special inside JS
  // character classes), so wrapped commands surface here too.
  // The `(?<!`)` lookbehind skips a `!` that is itself inside an inline-code
  // span (e.g. prose like "doesn't process `!` pre-resolution — ...; omit"),
  // which is documentation, not a real `!`-directive — a genuine pre-resolution
  // `!` is preceded by line-start or whitespace, never by a backtick.
  const found: { lineNumber: number; command: string }[] = []
  const regex = /(?<!`)!`([^`]*)`/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    const lineNumber = body.slice(0, match.index).split(/\r?\n/).length
    found.push({ lineNumber, command: match[1] })
  }
  return found
}

/**
 * Every `!` pre-resolution occurrence across all skill files, formatted as
 * `<rel>:<line>  !`<cmd>``. An empty array is the healthy state (the ban holds).
 * Shared by the ban test and the load-failure matrix so the two views of "what
 * `!` lines exist in the repo" cannot silently drift apart.
 */
function collectPreResolutionOffenders(): string[] {
  return listSkillFiles().flatMap((filePath) => {
    const rel = path.relative(process.cwd(), filePath)
    return findPreResolutionCommands(readFileSync(filePath, "utf8")).map(({ lineNumber, command }) => {
      const oneLine = command.replace(/\s*\n\s*/g, " ")
      return `${rel}:${lineNumber}  !\`${oneLine}\``
    })
  })
}

describe("findPreResolutionCommands", () => {
  test("captures single-line `!` blocks with correct line numbers", () => {
    const sample = "intro\n!`echo hi` mid !`echo bye`\nend"
    expect(findPreResolutionCommands(sample)).toEqual([
      { lineNumber: 2, command: "echo hi" },
      { lineNumber: 2, command: "echo bye" },
    ])
  })

  test("captures multi-line `!` blocks", () => {
    const sample = "intro\n!`one`\ngap\n!`split\nover\nlines`\nend"
    expect(findPreResolutionCommands(sample)).toEqual([
      { lineNumber: 2, command: "one" },
      { lineNumber: 4, command: "split\nover\nlines" },
    ])
  })

  test("ignores a `!` inside an inline-code span (documentation, not a directive)", () => {
    // e.g. AGENTS.md prose: "Do not use `!` pre-resolution" — the `!` is
    // preceded by a backtick, so the lookbehind excludes it.
    expect(findPreResolutionCommands("Never use `!` pre-resolution `here`")).toEqual([])
  })
})

describe("skills contain no `!` pre-resolution", () => {
  test("no skill file uses `!`cmd`` load-time pre-resolution anywhere", () => {
    const offenders = collectPreResolutionOffenders()
    expect(
      offenders,
      "`!`cmd`` load-time pre-resolution is banned in skills. It runs only on " +
        "Claude Code (inert literal text on Codex/Cursor/Gemini/Grok), and on " +
        "Claude Code a non-zero exit aborts skill load — which is the ordinary " +
        "state for the git/gh context commands these were used for (no PR, no " +
        "origin/HEAD, detached HEAD, not a repo). The POSIX guards that force " +
        "exit 0 then break skill load under Windows PowerShell (issue #1066). " +
        "Gather the value at runtime with a single argv-style shell command " +
        "whose exit status the agent interprets instead (see ce-commit / " +
        "ce-commit-push-pr).\nOffending pre-resolution commands:\n" +
        offenders.join("\n"),
    ).toEqual([])
  })
})

/**
 * The load-failure catalog: each command that historically sat in a `!`
 * pre-resolution line, and the state in which pre-resolving it would abort skill
 * load on Claude Code. Each row's test asserts that its specific command is
 * absent from every skill's `!` pre-resolution — so a reintroduced `!` fails
 * loudly, named with the command and the state that would break it. This is
 * strictly narrower than the total ban above (a subset of the same empty set),
 * but it documents the concrete command→failure mapping instead of repeating one
 * global assertion per row.
 *
 * Two things this deliberately gets right:
 *  - **Detached HEAD is NOT in the catalog.** It does not abort load for any of
 *    these commands: `git branch --show-current` exits 0 with empty output, and
 *    `git rev-parse --abbrev-ref HEAD` exits 0 returning `HEAD`. It is a
 *    wrong-VALUE case handled at runtime, not a load failure.
 *  - **POSIX vs PowerShell is not a per-row axis.** "Is this command absent" is
 *    the same absence under either shell, so splitting each state into two
 *    identical assertions would be padding. The cross-shell reasoning is shared:
 *    on POSIX a bare fallible command aborts on its non-zero exit; the
 *    `2>/dev/null || echo SENTINEL` guard that would dodge that abort then fails
 *    to PARSE under PowerShell 5.1 (no `||`; `/dev/null` is a literal path,
 *    issue #1066) — so the guard cannot rescue it. The only safe move is to not
 *    pre-resolve at all, which the catalog enforces per command family. The
 *    total-ban test above is the airtight backstop for any command not listed
 *    here.
 */
const LOAD_ABORTING_COMMANDS: { command: string; abortsIn: string }[] = [
  { command: "git rev-parse --show-toplevel", abortsIn: "not a git repo (exit 128)" },
  { command: "git status", abortsIn: "not a git repo (exit 128)" },
  { command: "git diff HEAD", abortsIn: "unborn repo, no commits yet (exit 128, bad revision 'HEAD')" },
  { command: "git log", abortsIn: "unborn repo, no commits yet (exit 128)" },
  { command: "git rev-parse --abbrev-ref origin/HEAD", abortsIn: "no remote / no origin/HEAD set (exit 128)" },
  { command: "gh pr view", abortsIn: "no PR (exit 1), gh missing (127), or unauthenticated (exit 1)" },
  { command: "gh pr list", abortsIn: "gh missing (127) or unauthenticated (exit 1) — even though it returns [] on success" },
]

describe("no skill pre-resolves a command that would abort skill load", () => {
  const allPreResolutionCommands = collectPreResolutionOffenders()

  for (const { command, abortsIn } of LOAD_ABORTING_COMMANDS) {
    test(`\`!\`${command} …\`\` is absent (would abort load when ${abortsIn})`, () => {
      const offenders = allPreResolutionCommands.filter((o) => o.includes(command))
      expect(
        offenders,
        `A skill reintroduced \`!\`${command} …\`\` load-time pre-resolution. It aborts skill load ` +
          `on Claude Code in this state: ${abortsIn}. The POSIX guard that would force exit 0 ` +
          `(\`2>/dev/null || echo …\`) then fails to parse under PowerShell 5.1 (issue #1066), so the ` +
          `guard cannot rescue it. Gather the value at runtime as a single argv-style command whose ` +
          `exit status the agent interprets.\nOffending pre-resolution commands:\n${offenders.join("\n")}`,
      ).toEqual([])
    })
  }
})

/**
 * Finding-6 guard (from a Grok cross-model review). The total ban above stops
 * `!` load-time pre-resolution from returning, but nothing stopped a skill from
 * reintroducing a POSIX-only *runtime* Context gather — a fenced
 * `2>/dev/null || echo …` block, or a compound table command — which re-breaks
 * under PowerShell 5.1 mid-skill (the same #1066 failure, just after load
 * instead of during it). These two skills replaced exactly that block with an
 * argv-per-line table, so lock their Context section to single-program commands
 * and no fenced shell block, guarding the runtime regression class too.
 */
const ARGV_ONLY_CONTEXT_SKILLS = ["ce-commit", "ce-commit-push-pr"]

function extractContextSection(body: string): string {
  const lines = body.split(/\r?\n/)
  const start = lines.findIndex((l) => /^##\s+Context\s*$/.test(l))
  if (start === -1) return ""
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    if (/^##\s+/.test(lines[i])) { end = i; break }
  }
  return lines.slice(start, end).join("\n")
}

// Inline-code spans in a Context section that instruct a shell run: `git …` /
// `gh …`. Prose spans for operators (`;`, `&&`, `2>/dev/null`, …) don't start
// with git/gh, so the warning text isn't mistaken for a command.
function extractCommandSpans(section: string): string[] {
  const spans: string[] = []
  const regex = /`((?:git|gh) [^`]*)`/g
  let m: RegExpExecArray | null
  while ((m = regex.exec(section)) !== null) spans.push(m[1])
  return spans
}

// A single argv-style invocation has none of these. `<placeholder>` tokens are
// stripped first so their angle brackets aren't misread as redirects.
function hasCompoundShellSyntax(cmd: string): boolean {
  const c = cmd.replace(/<[^>]*>/g, "X")
  return (
    /;/.test(c) ||
    /&&/.test(c) ||
    /\|\|/.test(c) ||
    /(^|[^|])\|([^|]|$)/.test(c) || // a lone pipe, not `||`
    /\$\(/.test(c) ||
    /`/.test(c) ||
    /\d?>/.test(c) || // redirects: >, 1>, 2>
    /(^|\s)<(\s|$)/.test(c) // input redirect
  )
}

describe("hasCompoundShellSyntax", () => {
  test("flags shell operators and redirects", () => {
    for (const cmd of [
      "git rev-parse --show-toplevel 2>/dev/null",
      "git rev-parse --show-toplevel || pwd",
      "cd /tmp && git status",
      "git status; git log",
      "git log | head",
      "echo $(git rev-parse HEAD)",
      "git status > out.txt",
    ]) {
      expect(hasCompoundShellSyntax(cmd), `expected compound: ${cmd}`).toBe(true)
    }
  })

  test("does not flag single argv commands, including <placeholder> and comma-list flags", () => {
    for (const cmd of [
      "git rev-parse --show-toplevel",
      "git branch --show-current",
      "git rev-parse --abbrev-ref origin/HEAD",
      "gh pr list --head <branch> --state open --json number,url,title,body,state",
      "gh auth status",
    ]) {
      expect(hasCompoundShellSyntax(cmd), `expected single argv: ${cmd}`).toBe(false)
    }
  })
})

describe("argv-only runtime Context gather (no POSIX-only compound shell)", () => {
  for (const skill of ARGV_ONLY_CONTEXT_SKILLS) {
    const body = readFileSync(path.join(process.cwd(), "skills", skill, "SKILL.md"), "utf8")
    const section = extractContextSection(body)

    test(`${skill} has a "## Context" section`, () => {
      expect(section, `expected a "## Context" section in skills/${skill}/SKILL.md`).not.toEqual("")
    })

    test(`${skill} Context section has no fenced shell block (POSIX fallback regression)`, () => {
      expect(
        section.includes("```"),
        `The Context section must gather via argv-style commands in a table, not a fenced shell ` +
          `block. A \`\`\`bash block with \`2>/dev/null\`/\`||\`/\`;\` re-breaks under PowerShell 5.1 ` +
          `(issue #1066) at runtime instead of load time.`,
      ).toBe(false)
    })

    test(`${skill} Context commands are single-program (no ;, &&, ||, |, $(, redirects)`, () => {
      const offenders = extractCommandSpans(section).filter(hasCompoundShellSyntax)
      expect(
        offenders,
        `Each Context command must be a single argv-style invocation so it parses under both POSIX ` +
          `sh and PowerShell. Compound operators reintroduce the #1066 break at runtime.\n` +
          `Offending commands:\n${offenders.map((c) => `  ${c}`).join("\n")}`,
      ).toEqual([])
    })
  }
})
