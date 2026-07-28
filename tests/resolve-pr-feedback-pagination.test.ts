import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "fs"
import { tmpdir } from "os"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * The two GraphQL fetch scripts in ce-resolve-pr-feedback must paginate.
 *
 * Issue #798: previous versions used fixed `first: N` page sizes with no
 * cursor loop, so PRs with more than one page of review threads / comments /
 * reviews silently dropped everything past page 1. The skill then reported
 * "0 of 0 resolved" while real findings sat unanswered.
 *
 * `gh api graphql --paginate` follows only one `pageInfo` per response, so
 * `get-pr-comments` must issue a separate paginated query for each top-level
 * connection. `get-thread-for-comment` paginates the single `reviewThreads`
 * connection it queries.
 */

const SCRIPTS_DIR = path.join(
  process.cwd(),
  "skills/ce-resolve-pr-feedback/scripts",
)

const PAGE_INFO_SELECTION = /pageInfo\s*\{\s*hasNextPage\s+endCursor\s*\}/

function read(name: string): string {
  return readFileSync(path.join(SCRIPTS_DIR, name), "utf8")
}

describe("ce-resolve-pr-feedback scripts paginate GraphQL connections (issue #798)", () => {
  test("get-pr-comments leaves external identity classification to agent judgment", () => {
    const body = read("get-pr-comments")
    expect(body).not.toContain("$ci_bot_logins")
    expect(body).not.toContain('["codecov"]')
  })

  test("get-pr-comments uses --paginate for every top-level connection", () => {
    const body = read("get-pr-comments")
    const paginateCount = (body.match(/gh api graphql --paginate\b/g) ?? []).length
    expect(
      paginateCount,
      "get-pr-comments must issue three paginated queries (reviewThreads, comments, reviews); `gh api graphql --paginate` only follows the outermost pageInfo per response, so combining them in one query silently drops everything past page 1.",
    ).toBeGreaterThanOrEqual(3)
  })

  test("get-pr-comments paginates every connection it queries", () => {
    const body = read("get-pr-comments")
    for (const conn of ["reviewThreads", "comments", "reviews"]) {
      const re = new RegExp(`${conn}\\(first:\\s*\\d+,\\s*after:\\s*\\$endCursor\\)`)
      expect(
        re.test(body),
        `get-pr-comments must call ${conn}(first: N, after: $endCursor); fixed page sizes truncate on long-lived PRs.`,
      ).toBe(true)
    }
  })

  test("get-pr-comments selects pageInfo { hasNextPage endCursor } in each query", () => {
    const body = read("get-pr-comments")
    const matches = body.match(new RegExp(PAGE_INFO_SELECTION.source, "g")) ?? []
    expect(
      matches.length,
      "Each paginated GraphQL query must select pageInfo { hasNextPage endCursor } so `gh api graphql --paginate` can drive the cursor loop.",
    ).toBeGreaterThanOrEqual(3)
  })

  test("get-thread-for-comment paginates the reviewThreads connection", () => {
    const body = read("get-thread-for-comment")
    expect(
      body,
      "get-thread-for-comment must paginate reviewThreads, otherwise comment lookups fail on PRs with >100 threads.",
    ).toMatch(/gh api graphql --paginate\b/)
    expect(body).toMatch(/reviewThreads\(first:\s*\d+,\s*after:\s*\$endCursor\)/)
    expect(body).toMatch(PAGE_INFO_SELECTION)
  })

  test("get-thread-for-comment emits the matched thread context from a slurpfile", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-thread-lookup-"))
    const fakeGh = path.join(dir, "gh")
    const thread = {
      id: "thread-1",
      isResolved: false,
      isOutdated: true,
      path: "example.ts",
      line: null,
      originalLine: 42,
      startLine: null,
      originalStartLine: 40,
      comments: {
        nodes: [{
          id: "comment-1",
          author: { login: "reviewer" },
          body: "Please fix this.",
          createdAt: "2026-07-23T00:00:00Z",
          url: "https://github.com/o/r/pull/1#discussion_r1",
        }],
      },
    }

    writeFileSync(
      fakeGh,
      `#!/usr/bin/env bash\ncat <<'JSON'\n${JSON.stringify([{
        data: {
          repository: {
            pullRequest: {
              reviewThreads: {
                nodes: [thread],
                pageInfo: { hasNextPage: false, endCursor: null },
              },
            },
          },
        },
      }])}\nJSON\n`,
    )
    chmodSync(fakeGh, 0o755)

    try {
      const result = spawnSync(
        "bash",
        [path.join(SCRIPTS_DIR, "get-thread-for-comment"), "1", "comment-1", "o/r"],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
        },
      )

      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual(thread)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("get-pr-comments merges slurpfile pages without --argjson", () => {
    // Pins the ARG_MAX fix: payloads go through temp files + --slurpfile, so
    // jq must unwrap the extra slurp layer ($threads[0][]) correctly. A nesting
    // typo here silently empties Full Mode's feedback lists.
    const body = read("get-pr-comments")
    expect(body).toContain("--slurpfile")
    expect(body).not.toContain("--argjson")

    const dir = mkdtempSync(path.join(tmpdir(), "ce-pr-comments-"))
    const fakeGh = path.join(dir, "gh")
    const unresolved = {
      id: "thread-open",
      isResolved: false,
      isOutdated: false,
      path: "a.ts",
      line: 1,
      originalLine: 1,
      startLine: null,
      originalStartLine: null,
      comments: {
        nodes: [{
          id: "c1",
          author: { login: "reviewer" },
          body: "open finding",
          createdAt: "2026-07-23T00:00:00Z",
          url: "https://github.com/o/r/pull/1#discussion_r1",
        }],
      },
    }
    const resolved = {
      ...unresolved,
      id: "thread-done",
      isResolved: true,
      comments: {
        nodes: [{
          id: "c2",
          author: { login: "reviewer" },
          body: "resolved finding",
          createdAt: "2026-07-23T00:00:00Z",
          url: "https://github.com/o/r/pull/1#discussion_r2",
        }],
      },
    }

    const threadsPage = [{
      data: {
        repository: {
          pullRequest: {
            author: { login: "author" },
            reviewThreads: {
              nodes: [unresolved, resolved],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    }]
    const commentsPage = [{
      data: {
        repository: {
          pullRequest: {
            comments: {
              nodes: [
                { id: "pc1", author: { login: "reviewer" }, body: "top-level note" },
                { id: "pc2", author: { login: "author" }, body: "author reply" },
                { id: "pc3", author: { login: "bot" }, body: "   " },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    }]
    const reviewsPage = [{
      data: {
        viewer: { login: "resolver" },
        repository: {
          pullRequest: {
            reviews: {
              nodes: [
                {
                  id: "pending-1",
                  author: { login: "resolver" },
                  body: "",
                  state: "PENDING",
                },
                {
                  id: "submitted-1",
                  author: { login: "reviewer" },
                  body: "LGTM with nits",
                  state: "COMMENTED",
                },
              ],
              pageInfo: { hasNextPage: false, endCursor: null },
            },
          },
        },
      },
    }]

    writeFileSync(
      fakeGh,
      `#!/usr/bin/env bash
args="$*"
if [[ "$args" == *"query Threads"* ]]; then
  cat <<'JSON'
${JSON.stringify(threadsPage)}
JSON
elif [[ "$args" == *"query Comments"* ]]; then
  cat <<'JSON'
${JSON.stringify(commentsPage)}
JSON
elif [[ "$args" == *"query Reviews"* ]]; then
  cat <<'JSON'
${JSON.stringify(reviewsPage)}
JSON
else
  echo "unexpected gh invocation: $args" >&2
  exit 1
fi
`,
    )
    chmodSync(fakeGh, 0o755)

    try {
      const result = spawnSync(
        "bash",
        [path.join(SCRIPTS_DIR, "get-pr-comments"), "1", "o/r"],
        {
          encoding: "utf8",
          env: { ...process.env, PATH: `${dir}:${process.env.PATH}` },
        },
      )

      expect(result.status, result.stderr).toBe(0)
      expect(JSON.parse(result.stdout)).toEqual({
        pending_review: "pending-1",
        review_threads: [{ node: unresolved }],
        pr_comments: [
          { id: "pc1", author: { login: "reviewer" }, body: "top-level note" },
        ],
        review_bodies: [
          {
            id: "submitted-1",
            author: { login: "reviewer" },
            body: "LGTM with nits",
            state: "COMMENTED",
          },
        ],
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
