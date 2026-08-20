import { afterAll, describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { extractBashBlocks } from "./fenced-blocks"

const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-resolve-pr-feedback")
const FULL_MODE = readFileSync(path.join(SKILL_DIR, "references", "full-mode.md"), "utf8")
const TARGETED_MODE = readFileSync(path.join(SKILL_DIR, "references", "targeted-mode.md"), "utf8")
const REPLY_SCRIPT = path.join(SKILL_DIR, "scripts", "reply-to-pr-thread")

const blocks = extractBashBlocks(FULL_MODE).map((b) => b.body)
const replyBlock = blocks.find((b) => b.includes("scripts/reply-to-pr-thread"))

const tempDirs: string[] = []
afterAll(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true })
})

function fakeGhFixture() {
  const dir = mkdtempSync(path.join(tmpdir(), "ce-reply-"))
  tempDirs.push(dir)
  const capture = path.join(dir, "args.txt")
  const fakeGh = path.join(dir, "gh")
  writeFileSync(fakeGh, `#!/usr/bin/env bash
printf 'CALL\\0' >> ${JSON.stringify(capture)}
printf '%s\\0' "$@" >> ${JSON.stringify(capture)}
case "$*" in
  *"/replies"*)
    printf '%s\\n' '{"id":2002,"html_url":"https://github.com/o/r/pull/42#discussion_r2002","pull_request_review_id":3003}'
    ;;
  *"/reviews"*)
    if [ "$FAKE_PENDING_REVIEW" = "1" ]; then
      printf '%s\\n' 'pending-review-1'
    fi
    ;;
  *)
    echo "unexpected gh invocation: $*" >&2
    exit 1
    ;;
esac
`)
  chmodSync(fakeGh, 0o755)
  return { dir, capture }
}

function readCalls(capture: string): string[][] {
  const records = readFileSync(capture, "utf8").split("\0").filter(Boolean)
  const calls: string[][] = []
  for (const record of records) {
    if (record === "CALL") calls.push([])
    else calls.at(-1)!.push(record)
  }
  return calls
}

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

  test("full mode verifies submitted visibility and rechecks pending state before resolve", () => {
    const verifySection = FULL_MODE.slice(
      FULL_MODE.indexOf("scripts/reply-to-pr-thread"),
      FULL_MODE.indexOf("scripts/resolve-pr-thread"),
    )
    expect(verifySection).toContain("pulls/comments/REPLY_COMMENT_ID")
    expect(verifySection).toContain("--jq .body")
    expect(verifySection).toContain("--jq '.pull_request_review_id // empty'")
    expect(verifySection).not.toContain("--jq '{body, pull_request_review_id}'")
    expect(verifySection).toContain("reviews/REVIEW_ID --jq .state")
    expect(verifySection).toContain(".pending_review // empty")
    expect(verifySection).toMatch(/`\\n\\n`/)
    expect(verifySection).toMatch(/do not resolve/i)
  })

  test("full mode reconciles visible replies and thread resolution independently", () => {
    expect(FULL_MODE).toMatch(/visible, submitted substantive reply[^.]+authoritative thread resolution/i)
    expect(FULL_MODE).toMatch(/resolution-pending[\s\S]{0,220}do not repost[^;]+reapply/i)
    expect(FULL_MODE).toMatch(/only resolution-pending[^.]+skip steps 3-6[^.]+step 7/i)
    expect(FULL_MODE).toMatch(/resolution-pending[^.]+skips only step 1[^.]+runs steps 2-4/i)
    expect(FULL_MODE).toMatch(/do not judge, fix, or post again/i)
    expect(TARGETED_MODE).toMatch(/completion check before judgment[\s\S]{0,260}complete the missing resolution without posting again/i)
  })

  test("top-level PR comment replies also use a heredoc body", () => {
    const commentBlock = blocks.find((b) => b.includes("gh pr comment"))
    expect(commentBlock).toBeDefined()
    expect(commentBlock!).toContain("<<'EOF'")
    expect(commentBlock!).not.toContain("--body \"REPLY_TEXT\"")
  })

  test("reply-to-pr-thread uses the direct REST reply endpoint and preserves newlines", () => {
    const { dir, capture } = fakeGhFixture()
    const body = "> reviewer said this\n\nFixed in abc1234 — added the null check."
    const result = spawnSync("bash", [REPLY_SCRIPT, "42", "1001", "o/r"], {
      input: body,
      encoding: "utf8",
      env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
    })

    expect(result.status, result.stderr).toBe(0)
    const calls = readCalls(capture)
    expect(calls[0]).toEqual([
      "api",
      "--method",
      "POST",
      "repos/o/r/pulls/42/comments/1001/replies",
      "-f",
      `body=${body}`,
    ])
    expect(calls[1]).toEqual([
      "api",
      "--paginate",
      "repos/o/r/pulls/42/reviews",
      "--jq",
      '.[] | select(.state == "PENDING") | .id',
    ])
    const bodyArg = calls[0]!.find((a) => a.startsWith("body="))
    expect(bodyArg).toBe(`body=${body}`)
    expect(bodyArg).toContain("\n\n")
    expect(bodyArg).not.toContain("\\n")
    expect(calls.flat()).not.toContain("graphql")
    expect(calls.flat().join(" ")).not.toContain("addPullRequestReviewThreadReply")
    expect(calls.some((call) => call.includes("resolveReviewThread"))).toBe(false)
    expect(calls.some((call) => call.includes("/reviews") && call.includes("POST"))).toBe(false)
  })

  test("reply-to-pr-thread fails closed if a pending review appears after posting", () => {
    const { dir, capture } = fakeGhFixture()
    const result = spawnSync("bash", [REPLY_SCRIPT, "42", "1001", "o/r"], {
      input: "Reply body",
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        FAKE_PENDING_REVIEW: "1",
      },
    })

    expect(result.status).toBe(2)
    expect(result.stderr).toMatch(/pending review appeared after posting/i)
    const calls = readCalls(capture)
    expect(calls).toHaveLength(2)
    expect(calls.flat()).not.toContain("graphql")
    expect(calls.some((call) => call.includes("resolveReviewThread"))).toBe(false)
  })

  test("a body composed with escaped newlines is detectable in what gh would post", () => {
    const escaped = "> reviewer said this\\n\\nFixed in abc1234."
    // This is the failure the read-back step catches: no real break, literal backslash-n.
    expect(escaped.includes("\n")).toBe(false)
    expect(/\\n\\n/.test(escaped)).toBe(true)
  })
})
