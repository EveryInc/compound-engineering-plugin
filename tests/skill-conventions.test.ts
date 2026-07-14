import { readdirSync, readFileSync, statSync, type Dirent } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"
import { parseFrontmatter } from "../src/utils/frontmatter"

/**
 * Convention-enforcement tests for skill content, encoding the repo-root
 * AGENTS.md rules "File References in Skills" and "Platform-Specific
 * Variables in Skills", plus the Anthropic skill-spec frontmatter limits.
 *
 * Skill directories are enumerated dynamically under plugins/<plugin>/skills/
 * so new skills (and new plugins) are auto-covered.
 *
 * Rule groups:
 *
 * 1. SELF-CONTAINMENT (AGENTS.md "File References in Skills"): a skill must
 *    not reference files outside its own directory tree. Detection policy —
 *    designed to avoid false positives on documentation examples:
 *      - Fenced code blocks are stripped before scanning. Teaching samples,
 *        message templates, and anti-pattern demos live in fences (e.g.,
 *        screenshot markdown like `![Before](url-1)`), and fences are where
 *        skills quote code they are ABOUT rather than files they USE. This
 *        fence policy is Rule-1-specific — Rule 2 deliberately differs (see
 *        below): self-containment looks for ESCAPING references, which in
 *        fences are overwhelmingly quoted anti-patterns, while reference
 *        integrity looks for LOCAL paths, which in fences are overwhelmingly
 *        real script invocations.
 *      - Markdown link/image targets are treated as real references. A target
 *        is a violation when it is absolute (`/...`, `~/...`) or when it
 *        resolves outside the skill directory under BOTH file-relative and
 *        skill-root-relative anchoring (a `../scripts/x` link from
 *        `references/` resolves inside the skill and is allowed).
 *      - Prose/backtick mentions of installed-plugin paths
 *        (`~/.claude/plugins/...`) are flagged — AGENTS.md names this as a
 *        broken pattern. Files whose PURPOSE is reading that machine state
 *        are exempted below with written reasons.
 *      - Bare absolute paths in prose are NOT flagged: skills legitimately
 *        discuss `/tmp` scratch conventions and quote `/Users/...` as
 *        anti-pattern examples (ce-plan, ce-compound, ce-ideate).
 *
 * 2. REFERENCE INTEGRITY (AGENTS.md "File References in Skills"): every
 *    skill-local path mentioned in a skill's markdown must exist on disk
 *    INSIDE the skill directory. Candidates are (a) relative markdown link
 *    targets outside fences, (b) `references/...`, `scripts/...`, or
 *    `assets/...` path tokens inside backtick code spans — whether the span
 *    IS the path (`scripts/run.sh`) or embeds it in a command
 *    (`bash scripts/run.sh ARG`, `python3 scripts/foo.py <arg>`), so a
 *    deleted or renamed script is caught even when mentioned only as an
 *    executable command — (c) the same path tokens inside FENCED code
 *    blocks, and (d) `@`-include targets in prose (`@./references/x.md` —
 *    inlined at load time, so a deleted target breaks the skill at load).
 *    For (b) and (c), tokens are unwrapped before the shape gate:
 *    surrounding quotes and a platform-variable prefix (`${VAR}/`,
 *    `${VAR:-default}/`, `$VAR/`) are stripped, so the repo's documented
 *    cross-platform invocation style
 *    (`bash "${CLAUDE_SKILL_DIR:-.}/scripts/x.sh"` — AGENTS.md
 *    "Platform-Specific Variables in Skills") yields `scripts/x.sh` as a
 *    candidate; the variable prefix means "skill-root-relative" by that
 *    convention, so skill-root anchoring is correct for the remainder.
 *    Deliberately NOT candidates (per a mechanical audit of every
 *    references/-, scripts/-, assets/-mentioning line across all skills):
 *    bare path tokens in prose with no backticks, link, or `@` prefix —
 *    unmarked prose is where hypothetical teaching examples live, and the
 *    only real instances (advisory `references/yaml-schema.md` pointers in
 *    HTML comments inside ce-compound's and ce-compound-refresh's asset
 *    templates) sit in templates that are instantiated OUTSIDE the skill,
 *    where the path is context for a future reader, not a runtime
 *    dependency — and directory-only mentions (`references/` with no
 *    filename), which name no file to check.
 *    (c) is where this rule's fence policy deliberately diverges
 *    from Rule 1: fenced bash blocks are where skills put their REAL bundled
 *    script invocations (for example, `bash scripts/session-history/extract-metadata.py`),
 *    so stripping fences here would let a deleted or renamed script pass CI
 *    while the skill fails at runtime. Markdown-link syntax inside fences is
 *    still NOT a candidate — fenced `[text](references/x.md)` is teaching
 *    material, and its parentheses/brackets fail the bare-token shape — and
 *    backticks within fenced lines act as token separators so inline-code
 *    path mentions in fenced pseudocode tokenize cleanly. A candidate passes
 *    when it resolves
 *    inside the skill directory (anchored at the skill root or at the
 *    containing file's directory) AND exists there. Resolution is contained
 *    BEFORE any existence check: a `..` candidate that escapes the skill is
 *    a violation even when the target exists in a sibling skill — existence
 *    elsewhere is exactly what makes it a cross-skill reference. Targets
 *    containing template placeholder characters (`<`, `>`, `*`, `{`, `$`)
 *    are skipped.
 *
 * 3. FRONTMATTER LIMITS (Anthropic skill spec — hard constraints, with no
 *    exemption lists because exceeding them breaks real behavior):
 *      - frontmatter description <= 1024 chars (some harnesses reject longer
 *        descriptions — also enforced in tests/frontmatter.test.ts).
 *      - frontmatter name <= 64 chars.
 *    Deliberately NOT gated here: the 500-line SKILL.md body guidance and any
 *    byte cap on skill bodies. The line guidance is advice, not a constraint —
 *    several skills in this plugin are large by design, and gating guidance
 *    would tax every deliberately-large skill with exemption-list ceremony.
 *    The "8KB Codex body cap" that circulates in ecosystem lint tooling turned
 *    out to be folklore: Codex's real limit is an ~8,000-character budget on
 *    the injected skills metadata LIST, while full SKILL.md bodies are read
 *    from disk on demand (see the note in tests/real-plugin-conversion.test.ts).
 *
 * 4. PLATFORM-VARIABLE FALLBACK (AGENTS.md "Platform-Specific Variables in
 *    Skills"): skill markdown using harness variables (${CLAUDE_*},
 *    ${CODEX_*}) must degrade gracefully. Mechanically graceful forms pass
 *    outright: a shell default (`${VAR:-...}`) or an existence guard
 *    (`[ -n "$VAR" ]` / `[ -z "$VAR" ]` / `[ -f "${VAR}/path" ]`). EXCEPTION:
 *    a skill-directory var (CLAUDE_SKILL_DIR / CLAUDE_PLUGIN_ROOT, see
 *    SKILL_DIR_VARS) used to locate a bundled file is NOT made graceful by a
 *    `${VAR:-.}` default — that default resolves to the project CWD and
 *    silently misses the bundled script on non-Claude targets (issue #943);
 *    it must use an existence guard or be acknowledged. Any other use must be
 *    explicitly acknowledged in PLATFORM_VAR_ACKNOWLEDGED with a written
 *    reason naming the prose fallback (the AGENTS.md pre-resolution pattern).
 *    An earlier
 *    revision tried to verify the fallback PROSE itself, via a fallback
 *    keyword list and a line window — that graded English with regexes and
 *    failed legitimate rewordings, so the editorial judgment now lives in
 *    the registry: exact matching, immune to prose rewording, vetted by a
 *    reviewer when the entry is added, kept honest by a stale-entry check.
 *    Credential-style env vars (e.g., GEMINI_API_KEY) are out of scope —
 *    they are API requirements, not harness variables.
 *
 * Each rule's scanning helpers are unit-tested with in-file fixtures at the
 * bottom of this file (mutation-resistance layer, matching the house style
 * of tests/skill-shell-safety.test.ts).
 */

const REPO_ROOT = process.cwd()
const SKILLS_ROOT = path.join(REPO_ROOT, "skills")
const AGENTS_MD_REF = `AGENTS.md (repo root)`

// ---------------------------------------------------------------------------
// Exemptions. Shrinking these lists is welcome; growing them requires written
// justification in the entry comment — they must not become silent junk
// drawers. Keys are repo-root-relative paths so same-named skills in
// different plugins cannot collide.
// ---------------------------------------------------------------------------

// Rule 1: files allowed to mention installed-plugin paths (~/.claude/plugins/...).
const INSTALLED_PLUGIN_PATH_EXEMPTIONS = new Map<string, string>([])

const DESCRIPTION_CHAR_BUDGET = 1024
const NAME_CHAR_BUDGET = 64

const EXPECTED_USER_INVOKED_SKILLS = new Set([
  "ce-dogfood",
  "ce-polish",
  "ce-product-pulse",
  "ce-promote",
  "ce-setup",
  "ce-sweep",
  "ce-test-xcode",
])

const REQUIRED_MODEL_INVOKED_CALLEES = new Set([
  "ce-brainstorm",
  "ce-code-review",
  "ce-commit",
  "ce-commit-push-pr",
  "ce-compound",
  "ce-compound-refresh",
  "ce-debug",
  "ce-doc-review",
  "ce-ideate",
  "ce-optimize",
  "ce-plan",
  "ce-proof",
  "ce-resolve-pr-feedback",
  "ce-riffrec-feedback-analysis",
  "ce-simplify-code",
  "ce-strategy",
  "ce-test-browser",
  "ce-work",
  "ce-worktree",
  "lfg",
])

// ---------------------------------------------------------------------------
// Skill enumeration
// ---------------------------------------------------------------------------

type SkillDir = {
  /** repo-root-relative skill dir, e.g. skills/ce-plan */
  relPath: string
  absPath: string
}

function listSkillDirs(): SkillDir[] {
  const out: SkillDir[] = []
  let skillEntries: Dirent[]
  try {
    skillEntries = readdirSync(SKILLS_ROOT, { withFileTypes: true })
  } catch {
    return out
  }
  for (const entry of skillEntries) {
    if (!entry.isDirectory()) continue
    const absPath = path.join(SKILLS_ROOT, entry.name)
    out.push({ relPath: path.relative(REPO_ROOT, absPath), absPath })
  }
  return out
}

function listMarkdownFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      out.push(...listMarkdownFiles(full))
      continue
    }
    if (entry.name.endsWith(".md")) out.push(full)
  }
  return out
}

// ---------------------------------------------------------------------------
// Scanning helpers (pure; unit-tested at the bottom of this file)
// ---------------------------------------------------------------------------

type Located = { lineNumber: number; value: string }

/**
 * Partitions markdown around fenced code blocks (``` / ~~~, any fence length
 * >= 3): `prose` is the input with fences blanked (line numbers preserved),
 * `fencedLines` are the in-fence lines with their line numbers. Outer fences
 * longer than three backticks (e.g., ````markdown teaching blocks) correctly
 * swallow shorter inner fences. Rule 1 scans only `prose`; Rule 2 scans both
 * sides — sharing one fence state machine keeps the two policies from
 * drifting on fence-parsing edge cases.
 */
function partitionFencedCodeBlocks(markdown: string): { prose: string; fencedLines: Located[] } {
  const lines = markdown.split("\n")
  let fence: { char: string; len: number } | null = null
  const fencedLines: Located[] = []
  const prose = lines.map((line, i) => {
    const match = line.match(/^\s*(`{3,}|~{3,})/)
    if (match) {
      const char = match[1][0]
      const len = match[1].length
      if (!fence) fence = { char, len }
      else if (fence.char === char && len >= fence.len) fence = null
      return ""
    }
    if (fence) {
      fencedLines.push({ lineNumber: i + 1, value: line })
      return ""
    }
    return line
  })
  return { prose: prose.join("\n"), fencedLines }
}

/** Blanks out fenced code blocks while preserving line numbers. */
function stripFencedCodeBlocks(markdown: string): string {
  return partitionFencedCodeBlocks(markdown).prose
}

function lineNumberAt(text: string, index: number): number {
  return text.slice(0, index).split("\n").length
}

/** Extracts markdown link and image targets: [text](target), ![alt](target "title"). */
function extractMarkdownLinkTargets(markdown: string): Located[] {
  const out: Located[] = []
  const regex = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(markdown)) !== null) {
    out.push({ lineNumber: lineNumberAt(markdown, match.index), value: match[1] })
  }
  return out
}

/**
 * The skill-local path-token shape (references/, scripts/, assets/). The
 * character class excludes template placeholder characters, so
 * placeholder-bearing path tokens (`scripts/<name>`) are skipped by
 * construction while placeholder ARGUMENTS after a clean path token do not
 * suppress it.
 */
const LOCAL_PATH_TOKEN = /^(references|scripts|assets)\/[A-Za-z0-9._/-]+$/

/**
 * Strips the shell wrapping a whitespace token may carry around a skill-local
 * path: surrounding quotes and a platform-variable prefix (`${VAR}/`,
 * `${VAR:-default}/`, or `$VAR/`). The repo's documented cross-platform
 * invocation style (AGENTS.md "Platform-Specific Variables in Skills") writes
 * bundled-script calls as `bash "${CLAUDE_SKILL_DIR:-.}/scripts/x.sh"`, so
 * the quote/`$`/`{` characters of the wrapping must not hide the
 * `scripts/x.sh` remainder from the existence check. Unwrapping happens
 * BEFORE any placeholder gate sees the token: a real invocation's remainder
 * is placeholder-free, while a templated remainder (`.../scripts/<name>`)
 * still fails the token shape by construction.
 */
function stripShellWrapping(token: string): string {
  return token
    .replace(/^["']/, "")
    .replace(/["']$/, "")
    .replace(/^\$(?:\{[A-Za-z_][A-Za-z0-9_]*(?::-[^}]*)?\}|[A-Za-z_][A-Za-z0-9_]*)\//, "")
}

/** Whitespace-delimited tokens of `text` whose unwrapped form matches the skill-local path shape. */
function localPathTokensIn(text: string): string[] {
  return text
    .split(/\s+/)
    .map(stripShellWrapping)
    .filter((token) => LOCAL_PATH_TOKEN.test(token))
}

/**
 * Extracts skill-local path tokens from backtick code spans. The span may BE
 * the path (`scripts/run.sh`) or embed it in a command (`bash scripts/run.sh
 * ARG`, `python3 scripts/foo.py <arg>`): each whitespace-delimited token
 * matching the path shape is extracted, so a deleted or renamed script is
 * caught even when mentioned only as an executable command.
 */
function extractLocalPathCodeSpans(markdown: string): Located[] {
  const out: Located[] = []
  const spanRegex = /`([^`\n]+)`/g
  let match: RegExpExecArray | null
  while ((match = spanRegex.exec(markdown)) !== null) {
    const lineNumber = lineNumberAt(markdown, match.index)
    for (const token of localPathTokensIn(match[1])) out.push({ lineNumber, value: token })
  }
  return out
}

/**
 * Extracts `@`-include targets from prose (the at-include syntax that inlines
 * a file at load time, e.g. `@./references/persona-catalog.md` in
 * ce-code-review's "Included References"). These are load-bearing — a deleted
 * target breaks the skill at load — yet invisible to the other extractors:
 * no backticks, no markdown-link syntax, and the `@`/`./` prefix fails the
 * bare token shape. Placeholder-bearing targets are excluded by the token
 * character class, as everywhere else.
 */
function extractAtIncludeTargets(markdown: string): Located[] {
  const out: Located[] = []
  const regex = /(?:^|\s)@(\.\/)?((?:references|scripts|assets)\/[A-Za-z0-9._/-]+)/g
  let match: RegExpExecArray | null
  while ((match = regex.exec(markdown)) !== null) {
    // match.index may sit on the leading whitespace; number the line of the @.
    out.push({
      lineNumber: lineNumberAt(markdown, match.index + match[0].indexOf("@")),
      value: match[2],
    })
  }
  return out
}

/**
 * Extracts skill-local path tokens from INSIDE fenced code blocks (the Rule 2
 * fence policy — see the header). Backticks within a fenced line are treated
 * as token separators so inline-code path mentions in fenced pseudocode
 * (`see \`references/x.md\``) tokenize cleanly; markdown-link syntax never
 * yields a candidate because its brackets/parentheses fail the token shape.
 */
function extractFencedLocalPathTokens(markdown: string): Located[] {
  const out: Located[] = []
  for (const { lineNumber, value } of partitionFencedCodeBlocks(markdown).fencedLines) {
    for (const token of localPathTokensIn(value.replace(/`/g, " "))) {
      out.push({ lineNumber, value: token })
    }
  }
  return out
}

function isExternalLinkTarget(target: string): boolean {
  return /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")
}

function isTemplatePlaceholderPath(target: string): boolean {
  return /[<>*{}$]/.test(target)
}

/** Strips a #fragment suffix from a link target. */
function withoutFragment(target: string): string {
  const hash = target.indexOf("#")
  return hash === -1 ? target : target.slice(0, hash)
}

/**
 * True when a reference target escapes the skill directory. Absolute and
 * home-anchored targets always escape. Relative targets escape only when
 * they resolve outside the skill root from BOTH the containing file's
 * directory (`fileDirWithinSkill`, posix-relative to the skill root, "" for
 * SKILL.md itself) and the skill root.
 */
function escapesSkillDir(target: string, fileDirWithinSkill: string): boolean {
  if (target.startsWith("/") || target.startsWith("~")) return true
  const fromFile = path.posix.normalize(path.posix.join(fileDirWithinSkill, target))
  const fromRoot = path.posix.normalize(target)
  const escapes = (p: string) => p === ".." || p.startsWith("../")
  return escapes(fromFile) && escapes(fromRoot)
}

const INSTALLED_PLUGIN_PATH_REGEX = /(~|\$HOME)\/\.claude\/plugins\//

type SelfContainmentViolation = { lineNumber: number; detail: string }

/** Rule 1 scanner for one markdown file's content. */
function findSelfContainmentViolations(
  markdown: string,
  fileDirWithinSkill: string,
): SelfContainmentViolation[] {
  const stripped = stripFencedCodeBlocks(markdown)
  const out: SelfContainmentViolation[] = []
  for (const { lineNumber, value } of extractMarkdownLinkTargets(stripped)) {
    if (isExternalLinkTarget(value) || isTemplatePlaceholderPath(value)) continue
    if (escapesSkillDir(withoutFragment(value), fileDirWithinSkill)) {
      out.push({ lineNumber, detail: `link target escapes the skill directory: ${value}` })
    }
  }
  const lines = stripped.split("\n")
  for (let i = 0; i < lines.length; i++) {
    if (INSTALLED_PLUGIN_PATH_REGEX.test(lines[i])) {
      out.push({
        lineNumber: i + 1,
        detail: `installed-plugin path (~/.claude/plugins/...): ${lines[i].trim().slice(0, 120)}`,
      })
    }
  }
  return out
}

/** Rule 2 candidate extractor: skill-local paths that must exist on disk. */
function extractLocalReferenceCandidates(markdown: string): Located[] {
  const stripped = stripFencedCodeBlocks(markdown)
  const out: Located[] = []
  for (const { lineNumber, value } of extractMarkdownLinkTargets(stripped)) {
    if (isExternalLinkTarget(value) || isTemplatePlaceholderPath(value)) continue
    const target = withoutFragment(value)
    if (target === "" || target.startsWith("/") || target.startsWith("~")) continue
    out.push({ lineNumber, value: target })
  }
  for (const span of extractLocalPathCodeSpans(stripped)) {
    if (isTemplatePlaceholderPath(span.value)) continue
    out.push(span)
  }
  for (const target of extractAtIncludeTargets(stripped)) {
    out.push(target)
  }
  for (const token of extractFencedLocalPathTokens(markdown)) {
    if (isTemplatePlaceholderPath(token.value)) continue
    out.push(token)
  }
  return out
}

/**
 * Resolves a Rule 2 candidate against a base directory and returns the
 * result only when it stays inside the skill directory; otherwise null.
 * Containment is checked BEFORE any disk access so a `..` candidate that
 * lands on a real file in a sibling skill is rejected rather than treated
 * as existing — that is precisely the cross-skill reference Rule 2 exists
 * to catch.
 */
function resolveInsideSkill(skillAbsPath: string, baseDir: string, target: string): string | null {
  const resolved = path.resolve(baseDir, target)
  if (resolved === skillAbsPath || resolved.startsWith(skillAbsPath + path.sep)) return resolved
  return null
}

// Rule 4 helpers ------------------------------------------------------------

const PLATFORM_VAR_REGEX = /\$\{?((?:CLAUDE|CODEX)_[A-Z][A-Z0-9_]*)/g

type PlatformVarOccurrence = { lineNumber: number; variable: string; graceful: boolean }

// Shell test operators that count as guarding a platform variable: `-n`/`-z`
// (set / unset) and `-f`/`-e`/`-d` (path existence). Defined once so the three
// guard matchers below stay in lockstep when the set changes.
const GUARD_TEST = `\\[\\s*-[nzefd]\\s+`
const PLATFORM_VAR_CAPTURE = `\\$\\{?((?:CLAUDE|CODEX)_[A-Z][A-Z0-9_]*)\\b`

/**
 * Skill-directory variables — used to locate a bundled file. For these, a
 * `${VAR:-default}` shell default is NOT a graceful fallback: the default
 * (e.g. `.`) resolves to the project CWD on non-Claude targets and silently
 * misses the bundled script (issue #943). They must use an existence guard
 * (so the off-Claude branch is explicit) or carry an acknowledged reason —
 * a plain `${VAR:-.}` bundled-script path must not pass the convention.
 */
const SKILL_DIR_VARS = new Set(["CLAUDE_SKILL_DIR", "CLAUDE_PLUGIN_ROOT"])

/**
 * True when the occurrence on this line is gracefully handled *by the line
 * itself*: a `${VAR:-...}` shell default (for ordinary vars only — skill-dir
 * vars are excluded, see SKILL_DIR_VARS), or a `[ -n/-z/-f/-e/-d "...$VAR..." ]`
 * test (existence/non-empty guard).
 */
function isGracefulPlatformVarUse(line: string, variable: string): boolean {
  if (!SKILL_DIR_VARS.has(variable) && new RegExp(`\\$\\{${variable}:-`).test(line)) return true
  return new RegExp(`${GUARD_TEST}"[^"]*\\$\\{?${variable}\\b[^"]*"\\s*\\]`).test(line)
}

/** Platform variables the markdown guards with a `[ -n/-z/-f/-e/-d "...$VAR..." ]` test anywhere. */
function fileGuardedVars(markdown: string): Set<string> {
  const guarded = new Set<string>()
  const guardForm = new RegExp(`${GUARD_TEST}"[^"]*${PLATFORM_VAR_CAPTURE}[^"]*"\\s*\\]`, "g")
  let match: RegExpExecArray | null
  while ((match = guardForm.exec(markdown)) !== null) guarded.add(match[1])
  return guarded
}

/** Matches the opening of a guard block, e.g. `if [ -f "${CLAUDE_SKILL_DIR}/scripts/x" ]; then`. */
const GUARD_BLOCK_OPEN = new RegExp(`\\bif\\b.*${GUARD_TEST}"[^"]*${PLATFORM_VAR_CAPTURE}`, "g")

/** Collects every platform variable a line opens an `if [ -X "$VAR..." ]` guard for. */
function guardsOpenedOnLine(line: string): Set<string> {
  const opened = new Set<string>()
  let match: RegExpExecArray | null
  GUARD_BLOCK_OPEN.lastIndex = 0
  while ((match = GUARD_BLOCK_OPEN.exec(line)) !== null) opened.add(match[1])
  return opened
}

/**
 * Gracefulness is context-sensitive (issue #943). Fence parsing reuses
 * `partitionFencedCodeBlocks` so it follows the same markdown model as the
 * rest of this file (4-backtick outer fences, `~~~`, etc.):
 *
 * - Inside a fenced code block (an *executable* context), a use is graceful
 *   only if the line itself guards the variable, or the line sits inside an
 *   open `if [ -f "${VAR}/..." ]; then ... fi` guard block. Block-scoped on
 *   purpose: a second, *unguarded* script invocation in the same file is still
 *   reported, not masked by an unrelated guard. A self-contained single-line
 *   guard (`if ...; then bash X; fi`) covers only its own line — the `fi`
 *   closes the block so later lines are not treated as guarded.
 * - Outside code fences (a *prose* mention, e.g. "resolves via `${VAR}`"), a
 *   use is graceful if the line itself is graceful or the file guards the
 *   variable somewhere — so explanatory prose in a skill that does guard the
 *   variable does not generate noise.
 */
function findPlatformVarOccurrences(markdown: string): PlatformVarOccurrence[] {
  const out: PlatformVarOccurrence[] = []
  const { prose, fencedLines } = partitionFencedCodeBlocks(markdown)
  const fileGuarded = fileGuardedVars(markdown)

  // Prose occurrences (fenced lines are blanked in `prose`).
  const proseLines = prose.split("\n")
  for (let i = 0; i < proseLines.length; i++) {
    const line = proseLines[i]
    if (!line) continue
    let match: RegExpExecArray | null
    PLATFORM_VAR_REGEX.lastIndex = 0
    while ((match = PLATFORM_VAR_REGEX.exec(line)) !== null) {
      const variable = match[1]
      out.push({
        lineNumber: i + 1,
        variable,
        graceful: isGracefulPlatformVarUse(line, variable) || fileGuarded.has(variable),
      })
    }
  }

  // Fenced (executable) occurrences, with block-scoped guard tracking.
  let activeGuard = new Set<string>()
  let prevLineNumber = -2
  for (const { lineNumber, value: line } of fencedLines) {
    if (lineNumber !== prevLineNumber + 1) activeGuard = new Set() // new fenced block
    prevLineNumber = lineNumber
    const openedHere = guardsOpenedOnLine(line)
    const lineGuard = new Set([...activeGuard, ...openedHere])
    let match: RegExpExecArray | null
    PLATFORM_VAR_REGEX.lastIndex = 0
    while ((match = PLATFORM_VAR_REGEX.exec(line)) !== null) {
      const variable = match[1]
      out.push({
        lineNumber,
        variable,
        graceful: isGracefulPlatformVarUse(line, variable) || lineGuard.has(variable),
      })
    }
    // A `fi` on this line closes the block (covers single-line guards); otherwise
    // any guard opened here stays active for subsequent lines in this block.
    if (/\bfi\b/.test(line)) activeGuard = new Set()
    else for (const variable of openedHere) activeGuard.add(variable)
  }

  out.sort((a, b) => a.lineNumber - b.lineNumber)
  return out
}

/**
 * Acknowledged non-graceful platform-variable uses, keyed
 * `<repo-relative file>#<VARIABLE>` -> written reason naming the prose
 * fallback that lives in the file.
 *
 * Whether prose constitutes a real fallback is an editorial judgment. An
 * earlier revision automated it with a fallback-keyword list and a line
 * window; that failed legitimate rewordings ("if the variable is empty")
 * and could be satisfied by coincidental keywords. The judgment now happens
 * once, at review time, when an entry is added here — and the stale-entry
 * test below forces removal when the underlying use disappears.
 */
const PLATFORM_VAR_ACKNOWLEDGED = new Map<string, string>()

/** Rule 4 scanner for one markdown file: every non-graceful occurrence. */
function findPlatformVarViolations(markdown: string): PlatformVarOccurrence[] {
  return findPlatformVarOccurrences(markdown).filter((o) => !o.graceful)
}

// ---------------------------------------------------------------------------
// Repo scans
// ---------------------------------------------------------------------------

const skillDirs = listSkillDirs()

describe("skill self-containment (AGENTS.md 'File References in Skills')", () => {
  for (const skill of skillDirs) {
    test(`${skill.relPath} has no file references escaping the skill directory`, () => {
      const offenders: string[] = []
      for (const filePath of listMarkdownFiles(skill.absPath)) {
        const fileRel = path.relative(REPO_ROOT, filePath)
        if (INSTALLED_PLUGIN_PATH_EXEMPTIONS.has(fileRel)) continue
        const fileDirWithinSkill = path
          .relative(skill.absPath, path.dirname(filePath))
          .split(path.sep)
          .join("/")
        const content = readFileSync(filePath, "utf8")
        for (const violation of findSelfContainmentViolations(content, fileDirWithinSkill)) {
          offenders.push(`  ${fileRel}:${violation.lineNumber} — ${violation.detail}`)
        }
      }
      expect(
        offenders,
        `Skills must be self-contained: no \`../\` traversal out of the skill, no absolute paths, no installed-plugin (~/.claude/plugins/...) paths — see ${AGENTS_MD_REF} "File References in Skills". Duplicate shared files into each skill or reference the other skill semantically ("load the ce-X skill"). If the file's purpose is reading installed-plugin machine state, add it to INSTALLED_PLUGIN_PATH_EXEMPTIONS in tests/skill-conventions.test.ts with a written reason.\nOffending references:\n${offenders.join("\n")}`,
      ).toEqual([])
    })
  }
})

describe("skill reference integrity (AGENTS.md 'File References in Skills')", () => {
  for (const skill of skillDirs) {
    test(`${skill.relPath} only mentions skill-local paths that exist on disk`, () => {
      const missing: string[] = []
      for (const filePath of listMarkdownFiles(skill.absPath)) {
        const fileRel = path.relative(REPO_ROOT, filePath)
        const content = readFileSync(filePath, "utf8")
        for (const { lineNumber, value } of extractLocalReferenceCandidates(content)) {
          const containedCandidates = [
            resolveInsideSkill(skill.absPath, skill.absPath, value),
            resolveInsideSkill(skill.absPath, path.dirname(filePath), value),
          ].filter((p): p is string => p !== null)
          if (containedCandidates.length === 0) {
            missing.push(`  ${fileRel}:${lineNumber} — ${value} (resolves outside the skill directory)`)
            continue
          }
          const exists = (p: string) => {
            try {
              statSync(p)
              return true
            } catch {
              return false
            }
          }
          if (!containedCandidates.some(exists)) {
            missing.push(`  ${fileRel}:${lineNumber} — ${value}`)
          }
        }
      }
      expect(
        missing,
        `Every references/, scripts/, or assets/ path (and relative markdown link) mentioned in a skill must exist inside that skill's directory — see ${AGENTS_MD_REF} "File References in Skills". A path that exists only in ANOTHER skill is a cross-skill reference: duplicate the file into this skill or replace the file-level pointer with semantic wording ("the <name> reference in the ce-X skill" without a path).\nMissing paths:\n${missing.join("\n")}`,
      ).toEqual([])
    })
  }
})

describe("skill frontmatter limits (Anthropic skill spec)", () => {
  test("skill invocation classification matches the intended model/user split", () => {
    const actualUserInvoked = new Set<string>()
    const actualModelInvoked = new Set<string>()
    for (const skill of skillDirs) {
      const skillMdPath = path.join(skill.absPath, "SKILL.md")
      const raw = readFileSync(skillMdPath, "utf8")
      const { data } = parseFrontmatter(raw, skillMdPath)
      const name = typeof data.name === "string" ? data.name : path.basename(skill.absPath)
      if (data["disable-model-invocation"] === true) {
        actualUserInvoked.add(name)
      } else {
        actualModelInvoked.add(name)
      }
    }

    const missingUserInvoked = [...EXPECTED_USER_INVOKED_SKILLS].filter((name) => !actualUserInvoked.has(name))
    const unexpectedUserInvoked = [...actualUserInvoked].filter((name) => !EXPECTED_USER_INVOKED_SKILLS.has(name))
    const disabledRequiredCallees = [...REQUIRED_MODEL_INVOKED_CALLEES].filter((name) => !actualModelInvoked.has(name))

    expect(
      missingUserInvoked,
      `These skills should be user-invoked only via disable-model-invocation: true:\n${missingUserInvoked.join("\n")}`,
    ).toEqual([])
    expect(
      unexpectedUserInvoked,
      `Unexpected user-invoked skills. If intentional, update EXPECTED_USER_INVOKED_SKILLS and verify no model-routed caller depends on them:\n${unexpectedUserInvoked.join("\n")}`,
    ).toEqual([])
    expect(
      disabledRequiredCallees,
      `These skills must remain model-invoked because pipelines or sibling skills call them:\n${disabledRequiredCallees.join("\n")}`,
    ).toEqual([])
  })

  for (const skill of skillDirs) {
    const skillMdPath = path.join(skill.absPath, "SKILL.md")
    const raw = readFileSync(skillMdPath, "utf8")
    const { data } = parseFrontmatter(raw, skillMdPath)

    test(`${skill.relPath} frontmatter description is at most ${DESCRIPTION_CHAR_BUDGET} characters (Anthropic skill spec)`, () => {
      const description = typeof data.description === "string" ? data.description : ""
      expect(description, `${skill.relPath}/SKILL.md must declare a frontmatter description`).not.toBe("")
      expect(
        description.length,
        `${skill.relPath}/SKILL.md description is ${description.length} characters; the Anthropic skill spec caps descriptions at ${DESCRIPTION_CHAR_BUDGET} and some harnesses reject longer ones.`,
      ).toBeLessThanOrEqual(DESCRIPTION_CHAR_BUDGET)
    })

    test(`${skill.relPath} frontmatter name is at most ${NAME_CHAR_BUDGET} characters (Anthropic skill spec)`, () => {
      const name = typeof data.name === "string" ? data.name : ""
      expect(name, `${skill.relPath}/SKILL.md must declare a frontmatter name`).not.toBe("")
      expect(
        name.length,
        `${skill.relPath}/SKILL.md name is ${name.length} characters; the Anthropic skill spec caps names at ${NAME_CHAR_BUDGET}.`,
      ).toBeLessThanOrEqual(NAME_CHAR_BUDGET)
    })
  }

  test("installed-plugin path exemption list only names existing files", () => {
    const stale = [...INSTALLED_PLUGIN_PATH_EXEMPTIONS.keys()].filter((rel) => {
      try {
        statSync(path.join(REPO_ROOT, rel))
        return false
      } catch {
        return true
      }
    })
    expect(stale, `Remove stale INSTALLED_PLUGIN_PATH_EXEMPTIONS entries:\n${stale.join("\n")}`).toEqual([])
  })
})

describe("platform-variable fallback (AGENTS.md 'Platform-Specific Variables in Skills')", () => {
  for (const skill of skillDirs) {
    test(`${skill.relPath} platform variables degrade gracefully or are acknowledged`, () => {
      const offenders: string[] = []
      for (const filePath of listMarkdownFiles(skill.absPath)) {
        const fileRel = path.relative(REPO_ROOT, filePath)
        const content = readFileSync(filePath, "utf8")
        for (const { lineNumber, variable } of findPlatformVarViolations(content)) {
          if (PLATFORM_VAR_ACKNOWLEDGED.has(`${fileRel}#${variable}`)) continue
          offenders.push(`  ${fileRel}:${lineNumber} — \${${variable}} with no fallback`)
        }
      }
      expect(
        offenders,
        `Platform variables (\${CLAUDE_*}, \${CODEX_*}) must not be assumed to resolve — see ${AGENTS_MD_REF} "Platform-Specific Variables in Skills". An ordinary var may use a shell default (\${VAR:-...}); a skill-directory var (CLAUDE_SKILL_DIR / CLAUDE_PLUGIN_ROOT) used to locate a bundled file must NOT — its default silently misses the script off-Claude (#943) — so guard it with an existence test inside a code block ([ -f "\${VAR}/path" ]). If the fallback genuinely lives in prose (a platform var resolved at runtime with a documented fallback, or a core-script skill pinned via allowed-tools), write that prose first, then acknowledge the use in PLATFORM_VAR_ACKNOWLEDGED in tests/skill-conventions.test.ts with a reason naming the fallback. Note: \`!\` load-time pre-resolution is banned outright (tests/skill-shell-safety.test.ts) and is never a valid fallback here.\nOffending occurrences:\n${offenders.join("\n")}`,
      ).toEqual([])
    })
  }

  test("acknowledged platform-variable entries match current non-graceful uses", () => {
    const current = new Set<string>()
    for (const skill of skillDirs) {
      for (const filePath of listMarkdownFiles(skill.absPath)) {
        const fileRel = path.relative(REPO_ROOT, filePath)
        for (const { variable } of findPlatformVarViolations(readFileSync(filePath, "utf8"))) {
          current.add(`${fileRel}#${variable}`)
        }
      }
    }
    const stale = [...PLATFORM_VAR_ACKNOWLEDGED.keys()].filter((key) => !current.has(key))
    expect(
      stale,
      `PLATFORM_VAR_ACKNOWLEDGED entries must correspond to a current non-graceful use — remove stale entries from tests/skill-conventions.test.ts:\n${stale.join("\n")}`,
    ).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// Synthetic fixtures: prove violations are caught and valid content passes
// (mutation-resistance layer).
// ---------------------------------------------------------------------------

describe("stripFencedCodeBlocks", () => {
  test("blanks fenced content while preserving line numbers", () => {
    const sample = "before\n```bash\n[link](../escape.md)\n```\nafter"
    const stripped = stripFencedCodeBlocks(sample)
    expect(stripped.split("\n").length).toBe(5)
    expect(stripped).not.toContain("../escape.md")
    expect(stripped).toContain("after")
  })

  test("an outer four-backtick fence swallows inner three-backtick fences", () => {
    const sample = "````markdown\n```bash\nrm -rf /\n```\nstill fenced [x](../out.md)\n````\nfree"
    const stripped = stripFencedCodeBlocks(sample)
    expect(stripped).not.toContain("../out.md")
    expect(stripped).toContain("free")
  })

  test("leaves prose outside fences untouched", () => {
    const sample = "see `references/foo.md` for details"
    expect(stripFencedCodeBlocks(sample)).toBe(sample)
  })
})

describe("extractMarkdownLinkTargets", () => {
  test("captures link and image targets with line numbers", () => {
    const sample = "intro\n[doc](references/a.md) and ![img](assets/b.png)\n"
    expect(extractMarkdownLinkTargets(sample)).toEqual([
      { lineNumber: 2, value: "references/a.md" },
      { lineNumber: 2, value: "assets/b.png" },
    ])
  })

  test("captures titles-stripped targets", () => {
    expect(extractMarkdownLinkTargets('[d](references/a.md "Title")')).toEqual([
      { lineNumber: 1, value: "references/a.md" },
    ])
  })
})

describe("extractLocalPathCodeSpans", () => {
  test("matches skill-local references/, scripts/, assets/ spans", () => {
    const sample = "Read `references/walkthrough.md`, run `scripts/get-pr-comments`, embed `assets/logo.png`."
    expect(extractLocalPathCodeSpans(sample).map((s) => s.value)).toEqual([
      "references/walkthrough.md",
      "scripts/get-pr-comments",
      "assets/logo.png",
    ])
  })

  test("extracts path tokens embedded in command spans", () => {
    const sample =
      "Run `bash scripts/run.sh ARG`, then `python3 scripts/extract.py --out report.json`."
    expect(extractLocalPathCodeSpans(sample).map((s) => s.value)).toEqual([
      "scripts/run.sh",
      "scripts/extract.py",
    ])
  })

  test("placeholder arguments do not suppress a clean path token", () => {
    expect(extractLocalPathCodeSpans("run `python3 scripts/validate.py <output-path>`").map((s) => s.value)).toEqual([
      "scripts/validate.py",
    ])
  })

  test("unwraps quoted and variable-prefixed path tokens (skill-root-relative by convention)", () => {
    expect(
      extractLocalPathCodeSpans(
        'invoke `bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create <branch>`',
      ).map((s) => s.value),
    ).toEqual(["scripts/worktree-manager.sh"])
    expect(
      extractLocalPathCodeSpans("run `bash $CLAUDE_SKILL_DIR/scripts/setup.sh`").map((s) => s.value),
    ).toEqual(["scripts/setup.sh"])
    expect(
      extractLocalPathCodeSpans('see `cat "references/guide.md"`').map((s) => s.value),
    ).toEqual(["references/guide.md"])
  })

  test("skips placeholder-bearing path tokens", () => {
    expect(extractLocalPathCodeSpans("invoked via `bash scripts/<name>`")).toEqual([])
    expect(extractLocalPathCodeSpans("read `references/${topic}.md`")).toEqual([])
  })

  test("skips variable-prefixed tokens whose remainder is a placeholder", () => {
    expect(extractLocalPathCodeSpans('run `bash "${CLAUDE_SKILL_DIR:-.}/scripts/<name>"`')).toEqual([])
    expect(extractLocalPathCodeSpans("read `$CLAUDE_PLUGIN_ROOT/references/${topic}.md`")).toEqual([])
  })

  test("extracts multiple path tokens from one span", () => {
    expect(
      extractLocalPathCodeSpans("run `cp references/template.md assets/copy.md`").map((s) => s.value),
    ).toEqual(["references/template.md", "assets/copy.md"])
  })

  test("ignores bare filenames, home paths, and absolute paths", () => {
    const sample =
      "see `walkthrough.md`, store in `~/coding-tutor-tutorials/x.md`, use `/tmp/scratch`, ls `the scripts/ dir`"
    expect(extractLocalPathCodeSpans(sample)).toEqual([])
  })
})

describe("extractAtIncludeTargets", () => {
  test("extracts prose at-include targets with and without ./", () => {
    const sample = "### Persona Catalog\n\n@./references/persona-catalog.md\n\n@references/other.md\n"
    expect(extractAtIncludeTargets(sample)).toEqual([
      { lineNumber: 3, value: "references/persona-catalog.md" },
      { lineNumber: 5, value: "references/other.md" },
    ])
  })

  test("skips placeholder-bearing targets and non-path at-tokens", () => {
    expect(extractAtIncludeTargets("@./references/<topic>.md")).toEqual([])
    expect(extractAtIncludeTargets("@message = Message.find(params[:id])")).toEqual([])
    expect(extractAtIncludeTargets("email user@scripts.example.com")).toEqual([])
  })
})

describe("extractFencedLocalPathTokens", () => {
  test("extracts a real script invocation from a fenced bash block", () => {
    const sample = "intro\n```bash\nbash scripts/clean-gone\n```\nafter"
    expect(extractFencedLocalPathTokens(sample)).toEqual([
      { lineNumber: 3, value: "scripts/clean-gone" },
    ])
  })

  test("treats backticks inside fenced lines as token separators", () => {
    const sample = "```\n(see `references/codex-delegation-workflow.md`)\n```"
    expect(extractFencedLocalPathTokens(sample).map((t) => t.value)).toEqual([
      "references/codex-delegation-workflow.md",
    ])
  })

  test("unwraps quoted variable-prefixed invocations (the documented cross-platform style)", () => {
    const sample = [
      "```bash",
      'bash "${CLAUDE_SKILL_DIR:-.}/scripts/worktree-manager.sh" create <branch-name> [from-branch]',
      'bash "${CLAUDE_SKILL_DIR}/scripts/upstream-version.sh"',
      "```",
    ].join("\n")
    expect(extractFencedLocalPathTokens(sample).map((t) => t.value)).toEqual([
      "scripts/worktree-manager.sh",
      "scripts/upstream-version.sh",
    ])
  })

  test("skips placeholder-bearing tokens and markdown-link syntax", () => {
    const sample = [
      "```bash",
      "bash scripts/<name>",
      'bash "${CLAUDE_SKILL_DIR:-.}/scripts/<generated-name>"',
      "```",
      "```markdown",
      "[guide](references/guide.md)",
      "![Before](url-1)",
      "```",
    ].join("\n")
    expect(extractFencedLocalPathTokens(sample)).toEqual([])
  })

  test("ignores path tokens outside fences (those belong to the code-span extractor)", () => {
    expect(extractFencedLocalPathTokens("run `scripts/run.sh` in prose")).toEqual([])
  })
})

describe("escapesSkillDir", () => {
  test("flags ../ traversal out of the skill from SKILL.md", () => {
    expect(escapesSkillDir("../other-skill/references/schema.yaml", "")).toBe(true)
  })

  test("flags absolute and home-anchored targets", () => {
    expect(escapesSkillDir("/home/user/plugins/skills/other/file.md", "references")).toBe(true)
    expect(escapesSkillDir("~/.claude/plugins/cache/m/p/1.0.0/skills/other/file.md", "")).toBe(true)
  })

  test("allows ../ that stays inside the skill (references/ -> scripts/)", () => {
    expect(escapesSkillDir("../scripts/get-pr-comments", "references")).toBe(false)
  })

  test("allows skill-root-relative paths", () => {
    expect(escapesSkillDir("references/foo.md", "")).toBe(false)
    expect(escapesSkillDir("references/foo.md", "references")).toBe(false)
  })
})

describe("findSelfContainmentViolations", () => {
  test("catches an escaping markdown link", () => {
    const violations = findSelfContainmentViolations("line\n[steal](../sibling-skill/SKILL.md)\n", "")
    expect(violations.length).toBe(1)
    expect(violations[0].lineNumber).toBe(2)
  })

  test("catches installed-plugin path mentions in prose", () => {
    const violations = findSelfContainmentViolations(
      "Read `~/.claude/plugins/cache/marketplace/plugin/1.0.0/skills/other/file.md` for context.",
      "",
    )
    expect(violations.length).toBe(1)
  })

  test("ignores documentation examples inside fenced code blocks", () => {
    const sample = "```\n[bad](../outside.md)\ncat ~/.claude/plugins/installed_plugins.json\n```\n"
    expect(findSelfContainmentViolations(sample, "")).toEqual([])
  })

  test("ignores external URLs, anchors, and placeholder templates", () => {
    const sample =
      "[a](https://example.com) [b](#section) [c](references/<name>.md) [d](mailto:x@y.z)"
    expect(findSelfContainmentViolations(sample, "")).toEqual([])
  })

  test("passes clean skill-local references", () => {
    const sample = "Read `references/foo.md` and [the guide](references/guide.md#usage)."
    expect(findSelfContainmentViolations(sample, "")).toEqual([])
  })
})

describe("extractLocalReferenceCandidates", () => {
  test("collects relative link targets and span path tokens (bare and command-embedded), stripping fragments", () => {
    const sample =
      "[guide](references/guide.md#setup)\nRead `references/foo.md` and run `bash scripts/run.sh <ARG>`."
    expect(extractLocalReferenceCandidates(sample).map((c) => c.value)).toEqual([
      "references/guide.md",
      "references/foo.md",
      "scripts/run.sh",
    ])
  })

  test("skips fenced templates, placeholders, externals, and absolute targets", () => {
    const sample =
      "```\n![Before](url-1)\n```\n[t](references/<topic>.md) [u](https://x.dev) [v](/abs/file.md)"
    expect(extractLocalReferenceCandidates(sample)).toEqual([])
  })

  test("includes fenced script invocations: an existing script passes, a missing one is caught", () => {
    // Extraction is what makes a fenced mention visible to the existence
    // check; resolution + statSync against the real skill then demonstrates
    // the pass/caught split the repo scan enforces.
    const sample = "```bash\nbash scripts/session-history/extract-metadata.py\nbash scripts/deleted-tool.sh\n```"
    expect(extractLocalReferenceCandidates(sample).map((c) => c.value)).toEqual([
      "scripts/session-history/extract-metadata.py",
      "scripts/deleted-tool.sh",
    ])
    const skillRoot = path.join(SKILLS_ROOT, "ce-compound")
    const existing = resolveInsideSkill(skillRoot, skillRoot, "scripts/session-history/extract-metadata.py")
    const missing = resolveInsideSkill(skillRoot, skillRoot, "scripts/deleted-tool.sh")
    expect(existing).not.toBeNull()
    expect(statSync(existing!).isFile()).toBe(true)
    expect(missing).not.toBeNull()
    expect(() => statSync(missing!)).toThrow()
  })

  test("skips fenced placeholder-bearing path tokens", () => {
    expect(extractLocalReferenceCandidates("```bash\nbash scripts/<generated-name>\n```")).toEqual([])
  })

  test("collects prose at-include targets (load-time inlining)", () => {
    const sample = "### Subagent Template\n\n@./references/subagent-template.md\n"
    expect(extractLocalReferenceCandidates(sample).map((c) => c.value)).toEqual([
      "references/subagent-template.md",
    ])
  })

  test("variable-prefixed invocations are extracted and anchor at the skill root", () => {
    // The documented cross-platform style: the variable prefix means
    // "skill-root-relative" (AGENTS.md "Platform-Specific Variables in
    // Skills"), so the unwrapped remainder must resolve at the skill root —
    // demonstrated against a real bundled script (ce-compound's).
    const sample =
      '```bash\nbash "${CLAUDE_SKILL_DIR:-.}/scripts/validate-frontmatter.py"\n```'
    expect(extractLocalReferenceCandidates(sample).map((c) => c.value)).toEqual([
      "scripts/validate-frontmatter.py",
    ])
    const skillRoot = path.join(SKILLS_ROOT, "ce-compound")
    const resolved = resolveInsideSkill(skillRoot, skillRoot, "scripts/validate-frontmatter.py")
    expect(resolved).not.toBeNull()
    expect(statSync(resolved!).isFile()).toBe(true)
  })
})

describe("resolveInsideSkill", () => {
  const skillRoot = path.join(
    SKILLS_ROOT,
    "ce-resolve-pr-feedback",
  )

  test("rejects ../ traversal to a sibling skill even when the target exists there", () => {
    const sibling = "../ce-plan/references/plan-handoff.md"
    // The target genuinely exists in the sibling skill — existence outside
    // the skill must not satisfy Rule 2; it is the cross-skill reference.
    expect(statSync(path.resolve(skillRoot, sibling)).isFile()).toBe(true)
    expect(resolveInsideSkill(skillRoot, skillRoot, sibling)).toBeNull()
  })

  test("rejects obfuscated in-prefix traversal (references/../../other-skill/...)", () => {
    expect(
      resolveInsideSkill(skillRoot, skillRoot, "references/../../ce-plan/references/plan-handoff.md"),
    ).toBeNull()
  })

  test("accepts in-skill ../ traversal (references/ -> scripts/)", () => {
    expect(
      resolveInsideSkill(skillRoot, path.join(skillRoot, "references"), "../scripts/get-pr-comments"),
    ).toBe(path.join(skillRoot, "scripts", "get-pr-comments"))
  })

  test("accepts skill-root-relative paths", () => {
    expect(resolveInsideSkill(skillRoot, skillRoot, "references/targeted-mode.md")).toBe(
      path.join(skillRoot, "references", "targeted-mode.md"),
    )
  })
})

describe("findPlatformVarOccurrences / isGracefulPlatformVarUse", () => {
  test("flags a bare ${CLAUDE_PLUGIN_ROOT} as non-graceful", () => {
    const occurrences = findPlatformVarOccurrences("python3 ${CLAUDE_PLUGIN_ROOT}/scripts/x.py")
    expect(occurrences).toEqual([
      { lineNumber: 1, variable: "CLAUDE_PLUGIN_ROOT", graceful: false },
    ])
  })

  test("treats ${VAR:-default} as graceful for ordinary platform vars", () => {
    const occurrences = findPlatformVarOccurrences('echo "${CODEX_SANDBOX:-0}"')
    expect(occurrences).toEqual([{ lineNumber: 1, variable: "CODEX_SANDBOX", graceful: true }])
  })

  test("does NOT treat ${CLAUDE_SKILL_DIR:-.} as graceful (issue #943 regression)", () => {
    // A skill-dir var with a `:-` shell default silently misses the bundled
    // script off-Claude — it must use an existence guard, not `:-`.
    const occurrences = findPlatformVarOccurrences('bash "${CLAUDE_SKILL_DIR:-.}/scripts/x.sh"')
    expect(occurrences).toEqual([{ lineNumber: 1, variable: "CLAUDE_SKILL_DIR", graceful: false }])
  })

  test("treats [ -n \"$VAR\" ] existence guards as graceful", () => {
    const occurrences = findPlatformVarOccurrences('if [ -n "$CODEX_SANDBOX" ] || [ -n "$CODEX_SESSION_ID" ]; then')
    expect(occurrences.map((o) => o.graceful)).toEqual([true, true])
  })

  test("ignores credential-style env vars like GEMINI_API_KEY", () => {
    expect(findPlatformVarOccurrences("export GEMINI_API_KEY=$GEMINI_API_KEY")).toEqual([])
  })
})

describe("findPlatformVarViolations", () => {
  test("reports every non-graceful occurrence (acknowledgment happens via the registry, not the scanner)", () => {
    // A `!` pre-resolution line embedding a platform var is exactly the shape
    // this scanner must flag: the `${CLAUDE_PLUGIN_ROOT}` occurrence is
    // reported regardless of the surrounding `!` (which is itself banned by
    // tests/skill-shell-safety.test.ts). The prose fallback below is not judged
    // by the scanner — a genuine runtime use would be acknowledged in
    // PLATFORM_VAR_ACKNOWLEDGED with a reason.
    const preResolutionWithPlatformVar = [
      '**Plugin version (pre-resolved):** !`jq -r .version "${CLAUDE_PLUGIN_ROOT}/.claude-plugin/plugin.json"`',
      "",
      "If the line above resolved to a semantic version (e.g., `2.42.0`), use it.",
      "Otherwise (empty, a literal command string, or an error), use the versionless fallback.",
      "Do not attempt to resolve the version at runtime.",
    ].join("\n")
    expect(findPlatformVarViolations(preResolutionWithPlatformVar)).toEqual([
      { lineNumber: 1, variable: "CLAUDE_PLUGIN_ROOT", graceful: false },
    ])
  })

  test("reports occurrences inside fenced code blocks too", () => {
    const sample = [
      "```bash",
      "python3 ${CLAUDE_PLUGIN_ROOT}/scripts/x.py",
      "```",
    ].join("\n")
    expect(findPlatformVarViolations(sample).map((v) => v.variable)).toEqual(["CLAUDE_PLUGIN_ROOT"])
  })

  test("graceful uses are not reported", () => {
    expect(findPlatformVarViolations('echo "${CODEX_SANDBOX:-0}"')).toEqual([])
  })

  test("a ${CLAUDE_SKILL_DIR:-.} bundled-script path IS reported (issue #943)", () => {
    expect(
      findPlatformVarViolations('bash "${CLAUDE_SKILL_DIR:-.}/scripts/x.sh"').map((v) => v.variable),
    ).toEqual(["CLAUDE_SKILL_DIR"])
  })

  test("an existence-guarded bundled-script block reports no violations (issue #943)", () => {
    // The guard line opens the block; the guarded call on the next line is
    // graceful because it sits inside the open `if [ -f ... ]; then ... fi`.
    const sample = [
      '```bash',
      'if [ -f "${CLAUDE_SKILL_DIR}/scripts/x.sh" ]; then',
      '  bash "${CLAUDE_SKILL_DIR}/scripts/x.sh" create feat/login',
      'else',
      '  echo "unavailable on this platform"',
      'fi',
      '```',
    ].join("\n")
    expect(findPlatformVarViolations(sample)).toEqual([])
  })

  test("a guarded script does NOT mask a second unguarded script of the same var (block-scoped)", () => {
    // x.py is guarded; y.py — after `fi`, outside any guard — must still be
    // reported, or the convention would miss issue #943's bug for y.py.
    const sample = [
      '```bash',
      'if [ -f "${CLAUDE_SKILL_DIR}/scripts/x.py" ]; then',
      '  python3 "${CLAUDE_SKILL_DIR}/scripts/x.py"',
      'fi',
      'python3 "${CLAUDE_SKILL_DIR}/scripts/y.py"',
      '```',
    ].join("\n")
    const violations = findPlatformVarViolations(sample)
    expect(violations.map((v) => v.lineNumber)).toEqual([5])
  })

  test("a single-line guard does not leak gracefulness to later lines in the same fence", () => {
    // The guard and call are one line; the `fi` closes the block, so the
    // following unguarded y.py must still be reported (regression: an earlier
    // version cleared the guard only on a line that was exactly `fi`).
    const sample = [
      '```bash',
      'if [ -f "${CLAUDE_SKILL_DIR}/scripts/x.py" ]; then python3 "${CLAUDE_SKILL_DIR}/scripts/x.py"; fi',
      'python3 "${CLAUDE_SKILL_DIR}/scripts/y.py"',
      '```',
    ].join("\n")
    expect(findPlatformVarViolations(sample).map((v) => v.lineNumber)).toEqual([3])
  })

  test("prose mentions of a guarded var are not reported (no acknowledgment noise)", () => {
    // The executable use is guarded in a fence; the later prose sentence
    // mentioning the same var must not be flagged.
    const sample = [
      '```bash',
      'if [ -f "${CLAUDE_SKILL_DIR}/scripts/x.sh" ]; then bash "${CLAUDE_SKILL_DIR}/scripts/x.sh"; fi',
      '```',
      '',
      'On Claude Code `${CLAUDE_SKILL_DIR}` resolves to the skill directory.',
    ].join("\n")
    expect(findPlatformVarViolations(sample)).toEqual([])
  })

  test("a bare ${VAR} use with no existence guard anywhere is still reported", () => {
    const sample = [
      '```bash',
      'python3 "${CLAUDE_SKILL_DIR}/scripts/x.py" out.md',
      '```',
    ].join("\n")
    expect(findPlatformVarViolations(sample).map((v) => v.variable)).toEqual(["CLAUDE_SKILL_DIR"])
  })
})
