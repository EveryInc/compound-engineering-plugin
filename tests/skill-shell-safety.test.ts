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
 *   - ce-compound and ce-sessions used `git rev-parse ... | sed -E '...'` which
 *     trips the permission checker as "multiple operations". Fix: replace the
 *     pipe with bash parameter expansion (e.g. strip suffix, strip prefix).
 *   - ce-compound and ce-sessions used `git rev-parse --abbrev-ref HEAD 2>/dev/null`
 *     with no fallback. Outside a git repo, `git rev-parse` exits 128;
 *     `2>/dev/null` suppresses stderr but the non-zero exit propagates and
 *     Claude Code reports "Shell command failed for pattern" (issue #730). Fix:
 *     pair `2>/dev/null` with `|| true` or `|| echo '__SENTINEL__'`.
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

/**
 * Returns true when the command's *trailing* top-level statement suppresses
 * stderr with `2>/dev/null` but has no `||` fallback. The trailing statement
 * determines the command's overall exit code (after `;` or `&&` chains). When
 * that exit code is non-zero, Claude Code reports "Shell command failed for
 * pattern" and aborts skill load before its body runs (issue #730). Established
 * defensive pattern: pair `2>/dev/null` with `|| true` or `|| echo '__SENTINEL__'`.
 *
 * `2>/dev/null` inside an earlier `;`-chained statement is fine if the trailing
 * statement (e.g., a final `echo`) succeeds — that case is not flagged.
 */
function hasUnguardedErrorSuppression(cmd: string): boolean {
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let lastSeparatorEnd = 0

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
      if (c === ';') { lastSeparatorEnd = i + 1; continue }
      if (c === '&' && next === '&') { lastSeparatorEnd = i + 2; i++; continue }
      if (c === '|' && next === '|') { lastSeparatorEnd = i + 2; i++; continue }
    }
  }

  return cmd.slice(lastSeparatorEnd).includes("2>/dev/null")
}

/**
 * Returns true when the command contains a top-level pipe (`|` that is not
 * `||`). Claude Code's permission checker treats piped commands as separate
 * operations and may require approval for each, causing skill-load failure
 * when the user's permission mode is restrictive.
 */
function hasTopLevelPipe(cmd: string): boolean {
  let depth = 0
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    const next = cmd[i + 1]

    if (!inDoubleQuote && c === "'") { inSingleQuote = !inSingleQuote; continue }
    if (!inSingleQuote && c === '"') { inDoubleQuote = !inDoubleQuote; continue }
    if (inSingleQuote || inDoubleQuote) continue

    if (c === '$' && next === '(') { depth++; i++; continue }
    if (c === '(') { depth++; continue }
    if (c === ')') { depth--; continue }

    if (depth === 0 && c === '|' && next !== '|' && cmd[i - 1] !== '|') return true
  }

  return false
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

describe("hasUnguardedErrorSuppression", () => {
  test("flags single-statement `2>/dev/null` with no fallback", () => {
    expect(hasUnguardedErrorSuppression("git rev-parse --abbrev-ref HEAD 2>/dev/null")).toBe(true)
  })

  test("flags `command -v <name> 2>/dev/null` with no fallback", () => {
    expect(hasUnguardedErrorSuppression("command -v codex 2>/dev/null")).toBe(true)
  })

  test("does not flag `2>/dev/null || true`", () => {
    expect(hasUnguardedErrorSuppression("git rev-parse --abbrev-ref HEAD 2>/dev/null || true")).toBe(false)
  })

  test("does not flag `2>/dev/null || echo '__SENTINEL__'`", () => {
    expect(hasUnguardedErrorSuppression("git rev-parse --abbrev-ref origin/HEAD 2>/dev/null || echo '__DEFAULT_BRANCH_UNRESOLVED__'")).toBe(false)
  })

  test("does not flag commands without `2>/dev/null`", () => {
    expect(hasUnguardedErrorSuppression("git status")).toBe(false)
  })

  test("does not flag `2>/dev/null` inside a guarded subshell", () => {
    expect(hasUnguardedErrorSuppression("(top=$(git rev-parse --show-toplevel 2>/dev/null); cat \"$top/file\") || echo '__NO_CONFIG__'")).toBe(false)
  })

  test("does not flag `2>/dev/null` in non-trailing statement followed by always-succeeding tail", () => {
    expect(hasUnguardedErrorSuppression('common=$(git rev-parse --git-common-dir 2>/dev/null); repo="${common%/.git}"; echo "${repo##*/}"')).toBe(false)
  })

  test("flags `2>/dev/null` on the trailing statement of a `;` chain", () => {
    expect(hasUnguardedErrorSuppression("setup; cmd 2>/dev/null")).toBe(true)
  })

  test("flags `2>/dev/null` on the trailing statement of an `&&` chain", () => {
    expect(hasUnguardedErrorSuppression("setup && cmd 2>/dev/null")).toBe(true)
  })

  test("flags `2>/dev/null` on the trailing statement of an `||` chain (a `||` belonging to an earlier statement does not protect a later unguarded one)", () => {
    expect(hasUnguardedErrorSuppression("probe || git rev-parse --abbrev-ref HEAD 2>/dev/null")).toBe(true)
  })
})

describe("hasTopLevelPipe", () => {
  test("flags a simple pipe", () => {
    expect(hasTopLevelPipe("git rev-parse --git-common-dir 2>/dev/null | sed -E 's|x||'")).toBe(true)
  })

  test("does not flag `||`", () => {
    expect(hasTopLevelPipe("cmd 2>/dev/null || echo fallback")).toBe(false)
  })

  test("does not flag a pipe inside `$(...)`", () => {
    expect(hasTopLevelPipe("x=$(echo foo | tr a b); echo $x")).toBe(false)
  })

  test("does not flag a pipe inside `(...)`", () => {
    expect(hasTopLevelPipe("(echo foo | tr a b) || echo fallback")).toBe(false)
  })

  test("does not flag commands with no pipe", () => {
    expect(hasTopLevelPipe("git rev-parse --abbrev-ref HEAD 2>/dev/null")).toBe(false)
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

    test(`${rel} pre-resolution commands that suppress stderr with \`2>/dev/null\` also include a \`||\` fallback (issue #730)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasUnguardedErrorSuppression(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `\`2>/dev/null\` only suppresses stderr — the non-zero exit code still propagates. Outside the success path (e.g., \`git rev-parse\` outside a git repo), Claude Code reports "Shell command failed for pattern" and aborts skill load. Pair \`2>/dev/null\` with \`|| true\` (when an empty result is fine) or \`|| echo '__SENTINEL__'\` (when the agent should distinguish "did not resolve" from "resolved to empty").\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })

    test(`${rel} pre-resolution commands do not use top-level pipes (triggers permission check for multiple operations)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasTopLevelPipe(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `Claude Code's permission checker flags piped commands as "multiple operations requiring approval", which fails skill load. Replace pipes with parameter expansion (e.g., \`\${var%/.git}\` / \`\${var##*/}\`) or move the transformation into a script invoked from the skill body.\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })
  }
})
