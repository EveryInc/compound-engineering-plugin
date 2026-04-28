import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * Skill `!` backtick pre-resolution commands run through Claude Code's shell
 * permission checker at skill-load time. The checker rejects several patterns
 * outright, failing the skill before its body ever runs. AGENTS.md guidance
 * for the `!` pre-resolution exception allows `&&`, `||`, `2>/dev/null`, and
 * fallback sentinels — but several specific shapes are not on that allowlist.
 *
 * Past incidents:
 *   - PR #699 introduced a `case "$common" in /*) ... ;; *) ... ;; esac` block
 *     into ce-compound and ce-sessions to derive a worktree-stable repo name.
 *     The cleaner replacement is
 *     `basename "$(dirname "$(git rev-parse --path-format=absolute --git-common-dir 2>/dev/null)")"`.
 *   - PR #701 replaced the `case` blocks with `[A] && B || C` chains, which
 *     trip a different rejection: "ambiguous syntax with command separators".
 *     Issue #710. Fix: wrap the `&&` chain in a subshell, or split into
 *     scripts so the safety check sees only `bash <path>`.
 *   - The `basename "$(dirname "$common")"` shape (a double-quoted string
 *     containing `$()` containing another double-quoted string) trips
 *     "Unhandled node type: string". Issue #709. Fix: replace nested `$()`
 *     with parameter expansion, pipe to sed, or extract to a script.
 */

const PLUGIN_SKILLS_GLOB = ["plugins/compound-engineering/skills", "plugins/coding-tutor/skills"]

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
  const found: { lineNumber: number; command: string }[] = []
  const regex = /!`([^`]*)`/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(body)) !== null) {
    const lineNumber = body.slice(0, match.index).split(/\r?\n/).length
    found.push({ lineNumber, command: match[1] })
  }
  return found
}

/**
 * Returns true when both `&&` and `||` appear at the same lexical depth (not
 * inside `( ... )` subshells or `$( ... )` command substitutions, and not
 * inside quoted strings). This is the `[A] && B || C` shell antipattern that
 * Claude Code's safety check rejects as "ambiguous syntax".
 */
function hasTopLevelMixedAndOr(cmd: string): boolean {
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let andAtDepth0 = false
  let orAtDepth0 = false

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    const next = cmd[i + 1]

    if (!inDoubleQuote && c === "'") { inSingleQuote = !inSingleQuote; continue }
    if (!inSingleQuote && c === '"') { inDoubleQuote = !inDoubleQuote; continue }
    if (inSingleQuote || inDoubleQuote) continue

    if (c === '$' && next === '(') { depth++; i++; continue }
    if (c === '(') { depth++; continue }
    if (c === ')') { depth--; continue }

    if (depth === 0) {
      if (c === '&' && next === '&') { andAtDepth0 = true; i++; continue }
      if (c === '|' && next === '|') { orAtDepth0 = true; i++; continue }
    }
  }

  return andAtDepth0 && orAtDepth0
}

/**
 * Returns the contents of every top-level `$(...)` in the command, with
 * matched parens preserved correctly even when nested. Used to detect the
 * "Unhandled node type: string" pattern (a `$(...)` whose contents contain
 * a double-quoted string).
 */
function findCommandSubstitutionContents(cmd: string): string[] {
  const results: string[] = []
  let i = 0
  let inSingleQuote = false
  while (i < cmd.length) {
    const c = cmd[i]
    if (c === "'" && !inSingleQuote) { inSingleQuote = true; i++; continue }
    if (c === "'" && inSingleQuote) { inSingleQuote = false; i++; continue }
    if (inSingleQuote) { i++; continue }
    if (c === '$' && cmd[i + 1] === '(') {
      let depth = 1
      let j = i + 2
      const start = j
      while (j < cmd.length && depth > 0) {
        if (cmd[j] === '$' && cmd[j + 1] === '(') { depth++; j += 2; continue }
        if (cmd[j] === '(') { depth++; j++; continue }
        if (cmd[j] === ')') { depth--; j++; continue }
        j++
      }
      results.push(cmd.slice(start, Math.max(start, j - 1)))
      i = j
      continue
    }
    i++
  }
  return results
}

/**
 * Returns true when any `$(...)` in the command contains a double-quoted
 * string — the shape that trips Claude Code's "Unhandled node type: string"
 * rejection (e.g., `basename "$(dirname "$common")"`).
 */
function hasNestedQuotedStringInCommandSubst(cmd: string): boolean {
  return findCommandSubstitutionContents(cmd).some(s => s.includes('"'))
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
})

describe("hasTopLevelMixedAndOr", () => {
  test("flags the `[A] && B || C` antipattern", () => {
    expect(hasTopLevelMixedAndOr('[ -n "$x" ] && echo yes || echo no')).toBe(true)
  })

  test("does not flag `&&`-only chains", () => {
    expect(hasTopLevelMixedAndOr('a=$(cmd) && [ -n "$a" ] && echo "$a"')).toBe(false)
  })

  test("does not flag `||`-only chains", () => {
    expect(hasTopLevelMixedAndOr("cmd 2>/dev/null || echo fallback")).toBe(false)
  })

  test("does not flag `&&` inside subshells with `||` only at top level", () => {
    expect(hasTopLevelMixedAndOr('(a && b) || (c && d) || echo fallback')).toBe(false)
  })

  test("does not flag operators inside quoted strings", () => {
    expect(hasTopLevelMixedAndOr('echo "a && b || c"')).toBe(false)
  })
})

describe("hasNestedQuotedStringInCommandSubst", () => {
  test("flags `basename \"$(dirname \"$common\")\"`", () => {
    expect(hasNestedQuotedStringInCommandSubst('basename "$(dirname "$common")"')).toBe(true)
  })

  test("flags deeply nested `$(dirname \"$(dirname \"$x\")\")`", () => {
    expect(hasNestedQuotedStringInCommandSubst('basename "$(dirname "$(dirname "$x")")"')).toBe(true)
  })

  test("does not flag `$(...)` whose contents only contain single-quoted strings", () => {
    expect(hasNestedQuotedStringInCommandSubst("a=$(gh api endpoint --jq '.field')")).toBe(false)
  })

  test("does not flag `$(...)` with no quoted strings inside", () => {
    expect(hasNestedQuotedStringInCommandSubst('a=$(git rev-parse HEAD 2>/dev/null)')).toBe(false)
  })

  test("does not flag double-quoted strings outside any `$(...)`", () => {
    expect(hasNestedQuotedStringInCommandSubst('echo "${VAR}/path"')).toBe(false)
  })
})

describe("skill `!` pre-resolution commands avoid Claude Code denylist", () => {
  const files = listSkillFiles()

  for (const filePath of files) {
    const rel = path.relative(process.cwd(), filePath)
    const body = readFileSync(filePath, "utf8")
    const preResolutionCommands = findPreResolutionCommands(body)
    if (preResolutionCommands.length === 0) continue

    test(`${rel} pre-resolution commands contain no \`case\`/\`esac\` (blocked by Claude Code permission check)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        /\bcase\b/.test(command) && /\besac\b/.test(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `Claude Code rejects \`case ... esac\` in \`!\` pre-resolution commands. Use \`if\`/\`then\`/\`else\` or \`&&\`/\`||\` chaining, or \`git rev-parse --path-format=absolute --git-common-dir\` for worktree-stable repo names.\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })

    test(`${rel} pre-resolution commands do not mix \`&&\` and \`||\` at top level (issue #710)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasTopLevelMixedAndOr(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `Claude Code rejects the \`[A] && B || C\` antipattern as "ambiguous syntax with command separators". Wrap the \`&&\` chain in a subshell so only \`||\` remains at top level — \`(A && B) || C\` — or extract to a script.\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })

    test(`${rel} pre-resolution commands do not nest double-quoted strings inside \`$(...)\` (issue #709)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasNestedQuotedStringInCommandSubst(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `Claude Code rejects \`$(...)\` containing a double-quoted string as "Unhandled node type: string" (e.g., \`basename "$(dirname "$common")"\`). Replace nested \`$()\` with parameter expansion (\`\${var%/suffix}\`), pipe to sed, or extract to a script invoked as \`bash "\${CLAUDE_SKILL_DIR}/scripts/<name>.sh"\`.\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })
  }
})
