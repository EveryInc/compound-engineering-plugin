import { afterAll, describe, expect, test } from "bun:test"
import { execFileSync } from "child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { extractBashBlocks } from "./fenced-blocks"

const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-resolve-pr-feedback")
const FULL_MODE = readFileSync(path.join(SKILL_DIR, "references", "full-mode.md"), "utf8")
const REPLY_SCRIPT = path.join(SKILL_DIR, "scripts", "reply-to-pr-thread")

const blocks = extractBashBlocks(FULL_MODE).map((b) => b.body)
const replyBlock = blocks.find((b) => b.includes("scripts/reply-to-pr-thread"))

const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

describe("ce-resolve-pr-feedback reply bodies keep real newlines", () => {
  test("the reply example feeds a quoted heredoc, not echo", () => {
    expect(replyBlock).toBeDefined()
    // `echo "REPLY_TEXT"` emits a body whose escape sequences stay literal, so a composed
    // "> quote\n\nparagraph" reaches GitHub as one line containing backslash-n.
    expect(replyBlock!).not.toMatch(/\becho\b/)
    expect(replyBlock!).not.toMatch(/\bprintf\b/)
    expect(replyBlock!).toContain("<<'EOF'")
  })

  test("the reply example is multiline Markdown: a quote line, a blank line, then a paragraph", () => {
    const body = replyBlock!.split("<<'EOF'\n")[1]!.split("\nEOF")[0]!.split("\n")
    expect(body[0]!.startsWith(">")).toBe(true)
    expect(body[1]!.trim()).toBe("")
    expect(body.slice(2).join("\n").trim().length).toBeGreaterThan(0)
    expect(replyBlock!).not.toContain("\\n")
  })

  test("full mode reads the posted body back and blocks resolve on literal \\n", () => {
    const verifySection = FULL_MODE.slice(
      FULL_MODE.indexOf("scripts/reply-to-pr-thread"),
      FULL_MODE.indexOf("scripts/resolve-pr-thread"),
    )
    expect(verifySection).toContain("pulls/comments/COMMENT_ID --jq .body")
    expect(verifySection).toMatch(/`\\n\\n`/)
    expect(verifySection).toMatch(/do not resolve/i)
  })

  test("top-level PR comment replies also use a heredoc body", () => {
    const commentBlock = blocks.find((b) => b.includes("gh pr comment"))
    expect(commentBlock).toBeDefined()
    expect(commentBlock!).toContain("<<'EOF'")
    expect(commentBlock!).not.toContain("--body \"REPLY_TEXT\"")
  })

  test("reply-to-pr-thread passes stdin through to gh with newlines intact", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-reply-"))
    tempDirs.push(dir)
    const capture = path.join(dir, "args.txt")
    const fakeGh = path.join(dir, "gh")
    // Records every argv entry on its own NUL-delimited record so an embedded newline in
    // the body argument is distinguishable from the separator.
    writeFileSync(fakeGh, `#!/usr/bin/env bash\nprintf '%s\\0' "$@" > ${JSON.stringify(capture)}\n`)
    chmodSync(fakeGh, 0o755)

    const body = "> reviewer said this\n\nFixed in abc1234 — added the null check."
    execFileSync("bash", [REPLY_SCRIPT, "PRRT_test"], {
      input: body,
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
      stdio: ["pipe", "ignore", "pipe"],
    })

    const args = readFileSync(capture, "utf8").split("\0")
    const bodyArg = args.find((a) => a.startsWith("body="))
    expect(bodyArg).toBe(`body=${body}`)
    expect(bodyArg).toContain("\n\n")
    expect(bodyArg).not.toContain("\\n")
  })

  test("a body composed with escaped newlines is detectable in what gh would post", () => {
    const escaped = "> reviewer said this\\n\\nFixed in abc1234."
    // This is the failure the read-back step catches: no real break, literal backslash-n.
    expect(escaped.includes("\n")).toBe(false)
    expect(/\\n\\n/.test(escaped)).toBe(true)
  })
})
