import { readdirSync, readFileSync, statSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * Skill `!` backtick pre-resolution commands run through Claude Code's shell
 * permission checker at skill-load time, and then through the USER'S shell —
 * which is PowerShell on some Windows installs, not bash. The permission
 * checker rejects several patterns outright (failing the skill before its
 * body ever runs), and bash-only syntax fails outright under PowerShell, so
 * pre-resolution commands must stay in the portable subset: a single bare
 * command with no redirects, no `||`/`&&` chaining, no `$(...)`, no pipes.
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
 *     Claude Code (at the time) reported "Shell command failed for pattern"
 *     (issue #730). The fix then was to pair `2>/dev/null` with `|| true` or
 *     `|| echo '__SENTINEL__'`.
 *   - Those `2>/dev/null || true` guards themselves broke Windows users whose
 *     harness executes `!` pre-resolution through PowerShell (issue #1066):
 *     PowerShell resolves `/dev/null` as a literal file path (`D:\dev\null`)
 *     and has no `true` command, so the guarded line fails at skill load even
 *     inside a git repo. Current Claude Code substitutes error text for a
 *     failing pre-resolution instead of aborting the skill, so the portable
 *     shape is a BARE single command plus adjacent "if this line is empty or
 *     shows an error, derive at runtime" prose. This supersedes the #730
 *     guard pattern above.
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
 * Returns true when the command contains a `;` command separator outside of
 * quotes. Claude Code's skill-load safety checker cannot parse `;` as a syntax
 * node and aborts with "Unhandled node type: ;" before the skill body runs —
 * even when the `;` sits inside a subshell, e.g. `(top=$(...); cat "$top/f")`
 * (issue #758; reintroduced and rejected in PR #934). Use `&&`/`||` chaining,
 * or extract the logic to a script invoked from the skill body. A `;` inside a
 * quoted string is a literal, not a separator, and is not flagged.
 */
function hasSemicolonSeparator(cmd: string): boolean {
  let inSingleQuote = false
  let inDoubleQuote = false
  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    if (!inDoubleQuote && c === "'") { inSingleQuote = !inSingleQuote; continue }
    if (!inSingleQuote && c === '"') { inDoubleQuote = !inDoubleQuote; continue }
    if (inSingleQuote || inDoubleQuote) continue
    if (c === ';') return true
  }
  return false
}

/**
 * Returns true when the command uses bash-only shell syntax that PowerShell
 * cannot execute: any redirect (`>`, `<`, including `2>/dev/null`) or an
 * `||` / `&&` chain outside quotes. `!` pre-resolution runs through the
 * user's shell, which is PowerShell on some Windows installs — PowerShell 5.1
 * cannot parse `||`/`&&` at all, PowerShell 7 resolves `/dev/null` to a
 * literal file path (`D:\dev\null`), and neither has a `true` command, so any
 * of these shapes fails skill load for those users even inside a git repo
 * (issue #1066). Pre-resolution commands must be a single bare command; the
 * adjacent prose owns the fallback ("if this line is empty or shows an
 * error, derive at runtime").
 */
function hasBashOnlyShellSyntax(cmd: string): boolean {
  let inSingleQuote = false
  let inDoubleQuote = false

  for (let i = 0; i < cmd.length; i++) {
    const c = cmd[i]
    const next = cmd[i + 1]

    if (!inDoubleQuote && c === "'") { inSingleQuote = !inSingleQuote; continue }
    if (!inSingleQuote && c === '"') { inDoubleQuote = !inDoubleQuote; continue }
    if (inSingleQuote || inDoubleQuote) continue

    if (c === '>' || c === '<') return true
    if (c === '&' && next === '&') return true
    if (c === '|' && next === '|') return true
  }

  return false
}

/**
 * Returns true when the command contains bash parameter expansion using
 * pattern operators: `${var%pattern}`, `${var##pattern}`, `${var#pattern}`,
 * `${var%%pattern}`, `${var/pat/repl}`, `${var:-default}`, etc.
 * Claude Code's permission checker rejects these as "Contains expansion".
 *
 * Note: simple `${var}` (no operator after the variable name) is fine.
 * The issue is operators like `%`, `#`, `/`, `:-`, `:=` that follow the name.
 */
function hasParameterExpansion(cmd: string): boolean {
  // Match ${varname followed by any operator character that isn't just }
  // Operators: %, #, /, :, ^ — any of these after the identifier
  return /\$\{[A-Za-z_][A-Za-z0-9_]*[%#/:^][^}]*\}/.test(cmd)
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

describe("hasSemicolonSeparator", () => {
  test("flags a `;` inside a subshell (the PR #934 / issue #758 regression)", () => {
    expect(hasSemicolonSeparator('(top=$(git rev-parse --show-toplevel 2>/dev/null); cat "$top/f") || echo \'__NO_CONFIG__\'')).toBe(true)
  })

  test("flags a top-level `;` separator", () => {
    expect(hasSemicolonSeparator("git rev-parse --show-toplevel 2>/dev/null; echo done")).toBe(true)
  })

  test("does not flag a command with no semicolon", () => {
    expect(hasSemicolonSeparator("git rev-parse --show-toplevel 2>/dev/null || true")).toBe(false)
  })

  test("does not flag a `;` inside a single-quoted string", () => {
    expect(hasSemicolonSeparator("echo 'a; b'")).toBe(false)
  })

  test("does not flag a `;` inside a double-quoted string", () => {
    expect(hasSemicolonSeparator('echo "a; b"')).toBe(false)
  })
})

describe("hasBashOnlyShellSyntax", () => {
  test("flags `2>/dev/null` stderr redirects", () => {
    expect(hasBashOnlyShellSyntax("git rev-parse --abbrev-ref HEAD 2>/dev/null")).toBe(true)
  })

  test("flags the former `2>/dev/null || true` guard pattern (issue #1066)", () => {
    expect(hasBashOnlyShellSyntax("git rev-parse --abbrev-ref HEAD 2>/dev/null || true")).toBe(true)
  })

  test("flags bare `||` fallback chains", () => {
    expect(hasBashOnlyShellSyntax("git rev-parse --show-toplevel || pwd")).toBe(true)
  })

  test("flags `&&` chains", () => {
    expect(hasBashOnlyShellSyntax("cd /tmp && git status")).toBe(true)
  })

  test("flags output redirects", () => {
    expect(hasBashOnlyShellSyntax("git status > /tmp/status.txt")).toBe(true)
  })

  test("does not flag a bare single command", () => {
    expect(hasBashOnlyShellSyntax("git rev-parse --abbrev-ref HEAD")).toBe(false)
  })

  test("does not flag a bare command with flags and arguments", () => {
    expect(hasBashOnlyShellSyntax("gh pr view --json url,title,body,state")).toBe(false)
  })

  test("does not flag operator characters inside quoted strings", () => {
    expect(hasBashOnlyShellSyntax("echo 'a || b > c'")).toBe(false)
    expect(hasBashOnlyShellSyntax('echo "a && b < c"')).toBe(false)
  })
})

describe("hasParameterExpansion", () => {
  test("flags ${var%pattern} (strip-suffix operator)", () => {
    expect(hasParameterExpansion('repo="${common%/.git}"')).toBe(true)
  })

  test("flags ${var##pattern} (strip-prefix operator)", () => {
    expect(hasParameterExpansion('echo "${repo##*/}"')).toBe(true)
  })

  test("flags ${var:-default} (default-value operator)", () => {
    expect(hasParameterExpansion('echo "${var:-fallback}"')).toBe(true)
  })

  test("flags ${var/pat/repl} (substitution operator)", () => {
    expect(hasParameterExpansion('echo "${var/foo/bar}"')).toBe(true)
  })

  test("does not flag simple ${var} expansion", () => {
    expect(hasParameterExpansion('echo "${CLAUDE_SKILL_DIR}/scripts/foo.sh"')).toBe(false)
  })

  test("does not flag commands with no ${...}", () => {
    expect(hasParameterExpansion("git rev-parse --abbrev-ref HEAD 2>/dev/null || true")).toBe(false)
  })

  test("does not flag $() command substitution", () => {
    expect(hasParameterExpansion("top=$(git rev-parse --show-toplevel 2>/dev/null)")).toBe(false)
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

    test(`${rel} pre-resolution commands contain no \`;\` command separator (issue #758)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasSemicolonSeparator(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `Claude Code's skill-load checker cannot parse \`;\` and aborts with "Unhandled node type: ;" — even inside a subshell. Use \`&&\`/\`||\` chaining, or extract the logic to a script invoked from the skill body.\nOffending commands:\n${formatted}`,
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
        `Claude Code rejects \`$(...)\` containing a double-quoted string as "Unhandled node type: string" (e.g., \`basename "$(dirname "$common")"\`). Extract the logic to a script under \`scripts/\` and invoke it from the skill body — do NOT replace with \`\${var%/suffix}\` parameter expansion, which is also rejected as "Contains expansion".\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })

    test(`${rel} pre-resolution commands do not use bash parameter expansion operators (rejected as "Contains expansion")`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasParameterExpansion(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `Claude Code rejects bash parameter expansion operators (\`\${var%pat}\`, \`\${var##pat}\`, \`\${var:-default}\`, etc.) as "Contains expansion". Extract the logic to a script under \`scripts/\` and invoke it from the skill body (not from \`!\` pre-resolution — scripts called from \`!\` trip the permission gate at load time). Or remove the pre-resolution and let the agent derive the value at runtime via a Bash tool call.\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })

    test(`${rel} pre-resolution commands contain no bash-only syntax — redirects or \`||\`/\`&&\` chains (issue #1066)`, () => {
      const offenders = preResolutionCommands.filter(({ command }) =>
        hasBashOnlyShellSyntax(command),
      )
      const formatted = offenders
        .map(({ lineNumber, command }) => `  line ${lineNumber}: ${command}`)
        .join("\n")
      expect(
        offenders,
        `\`!\` pre-resolution runs through the user's shell, which is PowerShell on some Windows installs. PowerShell 5.1 cannot parse \`||\`/\`&&\`, and PowerShell resolves \`/dev/null\` to a literal file path, so redirects or chaining fail skill load for those users even inside a git repo (issue #1066). Keep each pre-resolution command a single bare command, and state the fallback in the adjacent prose ("if this line is empty or shows an error, derive the value at runtime").\nOffending commands:\n${formatted}`,
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
        `Claude Code's permission checker flags piped commands as "multiple operations requiring approval", which fails skill load. Do NOT replace with parameter expansion (\`\${var%/.git}\`, \`\${var##*/}\`) — those are also rejected as "Contains expansion". Extract the logic to a script under \`scripts/\` and invoke it from the skill body.\nOffending commands:\n${formatted}`,
      ).toEqual([])
    })
  }
})
