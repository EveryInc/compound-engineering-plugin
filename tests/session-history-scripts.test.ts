import { describe, expect, test } from "bun:test"
import fs from "fs"
import os from "os"
import path from "path"

const SCRIPTS_DIR = path.join(
  __dirname,
  "../skills/ce-compound/scripts/session-history"
)
const FIXTURES_DIR = path.join(__dirname, "fixtures/session-history")

async function runScript(
  scriptName: string,
  args: string[] = [],
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName)
  const proc = Bun.spawn(["python3", scriptPath, ...args], {
    stdin: stdin ? new TextEncoder().encode(stdin) : undefined,
    stdout: "pipe",
    stderr: "pipe",
  })
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited
  return { stdout, stderr, exitCode }
}

async function writeFixture(targetPath: string, fixtureName: string): Promise<void> {
  await fs.promises.mkdir(path.dirname(targetPath), { recursive: true })
  const fixture = await Bun.file(path.join(FIXTURES_DIR, fixtureName)).text()
  await fs.promises.writeFile(targetPath, fixture)
}

function parseJsonLines(output: string): any[] {
  return output
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
}

function createBranchedPiSession(): string {
  const lines = [
    {
      type: "session",
      version: 3,
      id: "test-pi-branched-session",
      timestamp: "2026-04-07T09:00:00.000Z",
      cwd: "/Users/test/Code/my-repo",
    },
    {
      type: "message",
      id: "root-user",
      parentId: null,
      timestamp: "2026-04-07T09:01:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "fix the shared auth flow" }],
        timestamp: 1775542860000,
      },
    },
    {
      type: "message",
      id: "abandoned-user",
      parentId: "root-user",
      timestamp: "2026-04-07T09:02:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "abandoned_branch_keyword only" }],
        timestamp: 1775542920000,
      },
    },
    {
      type: "message",
      id: "abandoned-bash",
      parentId: "abandoned-user",
      timestamp: "2026-04-07T09:02:10.000Z",
      message: {
        role: "bashExecution",
        command: "bun test abandoned-branch.test.ts",
        output: "abandoned branch failed",
        exitCode: 1,
        cancelled: false,
        timestamp: 1775542930000,
      },
    },
    {
      type: "message",
      id: "active-user",
      parentId: "root-user",
      timestamp: "2026-04-07T09:03:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "active_branch_keyword only" }],
        timestamp: 1775542980000,
      },
    },
    {
      type: "message",
      id: "active-bash",
      parentId: "active-user",
      timestamp: "2026-04-07T09:03:10.000Z",
      message: {
        role: "bashExecution",
        command: "bun test active-branch.test.ts",
        output: "active branch failed",
        exitCode: 1,
        cancelled: false,
        timestamp: 1775542990000,
      },
    },
  ]
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`
}

function createPiSummaryContextSession(): string {
  const lines = [
    {
      type: "session",
      version: 3,
      id: "test-pi-summary-session",
      timestamp: "2026-04-07T09:00:00.000Z",
      cwd: "/Users/test/Code/my-repo",
    },
    {
      type: "message",
      id: "old-user",
      parentId: null,
      timestamp: "2026-04-07T09:01:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "old_compacted_keyword only" }],
        timestamp: 1775542860000,
      },
    },
    {
      type: "message",
      id: "old-bash",
      parentId: "old-user",
      timestamp: "2026-04-07T09:02:30.000Z",
      message: {
        role: "bashExecution",
        command: "bun test old-compacted.test.ts",
        output: "old compacted failure",
        exitCode: 1,
        cancelled: false,
        timestamp: 1775542950000,
      },
    },
    {
      type: "message",
      id: "kept-user",
      parentId: "old-bash",
      timestamp: "2026-04-07T09:02:40.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "kept_after_compaction_keyword only" }],
        timestamp: 1775542960000,
      },
    },
    {
      type: "compaction",
      id: "compact1",
      parentId: "kept-user",
      timestamp: "2026-04-07T09:03:00.000Z",
      summary: "compaction_summary_keyword survived in summary",
      firstKeptEntryId: "kept-user",
      tokensBefore: 50000,
    },
    {
      type: "branch_summary",
      id: "branch-summary1",
      parentId: "compact1",
      timestamp: "2026-04-07T09:04:00.000Z",
      fromId: "abandoned-user",
      summary: "branch_summary_keyword from the abandoned path",
    },
    {
      type: "custom_message",
      id: "custom-message1",
      parentId: "branch-summary1",
      timestamp: "2026-04-07T09:05:00.000Z",
      customType: "test-extension",
      content: [{ type: "text", text: "custom_message_keyword injected context" }],
      display: true,
    },
  ]
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`
}

function createPiToolCallAndCustomSession(): string {
  const lines = [
    {
      type: "session",
      version: 3,
      id: "test-pi-toolcall-custom-session",
      timestamp: "2026-04-07T09:00:00.000Z",
      cwd: "/Users/test/Code/my-repo",
    },
    {
      type: "message",
      id: "user1",
      parentId: null,
      timestamp: "2026-04-07T09:01:00.000Z",
      message: {
        role: "user",
        content: [{ type: "text", text: "please check the failing auth flow" }],
        timestamp: 1775542860000,
      },
    },
    {
      type: "message",
      id: "assistant-tool",
      parentId: "user1",
      timestamp: "2026-04-07T09:02:00.000Z",
      message: {
        role: "assistant",
        content: [
          {
            type: "toolCall",
            id: "toolu_pi_1",
            name: "bash",
            arguments: {
              command: "bun test tests/auth-expiry.test.ts",
            },
          },
          {
            type: "toolCall",
            id: "toolu_pi_2",
            name: "readFile",
            arguments: {
              path: "src/auth/session-expiry.ts",
            },
          },
        ],
        timestamp: 1775542920000,
      },
    },
    {
      type: "message",
      id: "custom1",
      parentId: "assistant-tool",
      timestamp: "2026-04-07T09:03:00.000Z",
      message: {
        role: "custom",
        content: [
          {
            type: "text",
            text: "custom_role_keyword extension-injected context",
          },
        ],
        timestamp: 1775542980000,
      },
    },
  ]
  return `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`
}

// ---------------------------------------------------------------------------
// extract-metadata.py
// ---------------------------------------------------------------------------
describe("extract-metadata", () => {
  test("detects Claude Code platform and extracts branch", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      path.join(FIXTURES_DIR, "claude-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const session = lines.find((l) => !l._meta)
    expect(session.platform).toBe("claude")
    expect(session.branch).toBe("feat/auth-fix")
    expect(session.session).toBe("test-claude-session-1")
    expect(session.ts).toContain("2026-04-05")
  })

  test("detects Codex platform and extracts CWD", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      path.join(FIXTURES_DIR, "codex-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const session = lines.find((l) => !l._meta)
    expect(session.platform).toBe("codex")
    expect(session.cwd).toBe("/Users/test/Code/my-repo")
    expect(session.model).toBe("gpt-5.4")
    expect(session.session).toBe("test-codex-session-1")
  })

  test("detects Cursor platform", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      path.join(FIXTURES_DIR, "cursor-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const session = lines.find((l) => !l._meta)
    expect(session.platform).toBe("cursor")
  })

  test("detects Pi platform and extracts CWD", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      path.join(FIXTURES_DIR, "pi-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const session = lines.find((l) => !l._meta)
    expect(session.platform).toBe("pi")
    expect(session.cwd).toBe("/Users/test/Code/my-repo")
    expect(session.session).toBe("test-pi-session-1")
    expect(session.ts).toContain("2026-04-07")
    expect(session.last_ts).toContain("2026-04-07T09:01:20")
  })

  test("batch mode processes multiple files", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      path.join(FIXTURES_DIR, "claude-session.jsonl"),
      path.join(FIXTURES_DIR, "codex-session.jsonl"),
      path.join(FIXTURES_DIR, "cursor-session.jsonl"),
      path.join(FIXTURES_DIR, "pi-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const meta = lines.find((l) => l._meta)
    expect(meta.files_processed).toBe(4)
    expect(meta.parse_errors).toBe(0)
    const platforms = lines.filter((l) => !l._meta).map((l) => l.platform)
    expect(platforms).toContain("claude")
    expect(platforms).toContain("codex")
    expect(platforms).toContain("cursor")
    expect(platforms).toContain("pi")
  })

  test("--cwd-filter excludes non-matching Codex sessions", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      "--cwd-filter",
      "other-repo",
      path.join(FIXTURES_DIR, "codex-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const meta = lines.find((l) => l._meta)
    expect(meta.filtered_by_cwd).toBe(1)
    const sessions = lines.filter((l) => !l._meta)
    expect(sessions.length).toBe(0)
  })

  test("--cwd-filter keeps matching Codex sessions", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      "--cwd-filter",
      "my-repo",
      path.join(FIXTURES_DIR, "codex-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const sessions = lines.filter((l) => !l._meta)
    expect(sessions.length).toBe(1)
    expect(sessions[0].cwd).toContain("my-repo")
  })

  test("--cwd-filter keeps matching Pi sessions", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      "--cwd-filter",
      "my-repo",
      path.join(FIXTURES_DIR, "pi-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const sessions = lines.filter((l) => !l._meta)
    expect(sessions.length).toBe(1)
    expect(sessions[0].cwd).toContain("my-repo")
  })

  test("--cwd-filter excludes sibling Pi repos when given an absolute repo root", async () => {
    const tempDir = await fs.promises.mkdtemp(
      path.join(os.tmpdir(), "pi-cwd-filter-")
    )
    const sessionPath = path.join(tempDir, "pi-sibling-session.jsonl")
    const sibling = (await Bun.file(
      path.join(FIXTURES_DIR, "pi-session.jsonl")
    ).text()).replace(
      '"cwd":"/Users/test/Code/my-repo"',
      '"cwd":"/Users/test/Code/my-repo-old"'
    )

    try {
      await fs.promises.writeFile(sessionPath, sibling)
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--cwd-filter",
        "/Users/test/Code/my-repo",
        sessionPath,
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      expect(lines.filter((l) => !l._meta).length).toBe(0)
      expect(lines.find((l) => l._meta).filtered_by_cwd).toBe(1)
    } finally {
      await fs.promises.rm(tempDir, { recursive: true, force: true })
    }
  })

  test("reports clean zero-file result for empty stdin", async () => {
    const { stdout, exitCode } = await runScript(
      "extract-metadata.py",
      [],
      ""
    )
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const meta = lines.find((l) => l._meta)
    expect(meta.files_processed).toBe(0)
    expect(meta.parse_errors).toBe(0)
  })

  // --keyword mode: opt-in full-file content scan. When set, sessions with zero
  // matches are excluded and each emitted session line carries match_count plus
  // per-keyword counts so the caller can rank candidates without re-scanning.
  describe("--keyword mode", () => {
    test("filters to sessions matching a single keyword", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "middleware",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
        path.join(FIXTURES_DIR, "codex-session.jsonl"),
        path.join(FIXTURES_DIR, "cursor-session.jsonl"),
        path.join(FIXTURES_DIR, "pi-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      // All four fixtures mention middleware.
      expect(sessions.length).toBe(4)
      for (const session of sessions) {
        expect(session.match_count).toBeGreaterThan(0)
        expect(session.keyword_matches.middleware).toBeGreaterThan(0)
      }
    })

    test("excludes sessions with zero matches and counts them in _meta", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "no_such_token_xyz_42",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
        path.join(FIXTURES_DIR, "codex-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      expect(sessions.length).toBe(0)
      const meta = lines.find((l) => l._meta)
      expect(meta.files_processed).toBe(2)
      expect(meta.files_matched).toBe(0)
    })

    test("supports multiple comma-separated keywords with OR semantics", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "auth,no_such_token_xyz_42",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      expect(sessions.length).toBe(1)
      expect(sessions[0].keyword_matches.auth).toBeGreaterThan(0)
      expect(sessions[0].keyword_matches.no_such_token_xyz_42).toBe(0)
    })

    test("keyword match is case-insensitive", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "AUTH",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      expect(sessions.length).toBe(1)
      expect(sessions[0].keyword_matches.AUTH).toBeGreaterThan(0)
    })

    test("Pi bashExecution commands are searchable but output is not", async () => {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "pi-bash-keyword-")
      )
      const sessionPath = path.join(tempDir, "pi-bash-session.jsonl")
      const lines = [
        {
          type: "session",
          version: 3,
          id: "test-pi-bash-session",
          timestamp: "2026-04-07T09:00:00.000Z",
          cwd: "/Users/test/Code/my-repo",
        },
        {
          type: "message",
          id: "msg1",
          parentId: null,
          timestamp: "2026-04-07T09:01:00.000Z",
          message: {
            role: "bashExecution",
            command: "bun test tests/auth.test.ts",
            output: "do_not_index_tool_output_token",
            exitCode: 0,
            cancelled: false,
            timestamp: 1775542860000,
          },
        },
      ]

      try {
        await fs.promises.writeFile(
          sessionPath,
          `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`
        )

        const commandResult = await runScript("extract-metadata.py", [
          "--keyword",
          "auth.test.ts",
          sessionPath,
        ])
        expect(commandResult.exitCode).toBe(0)
        const commandLines = parseJsonLines(commandResult.stdout)
        const commandSessions = commandLines.filter((l) => !l._meta)
        expect(commandSessions.length).toBe(1)
        expect(commandSessions[0].keyword_matches["auth.test.ts"]).toBe(1)

        const outputResult = await runScript("extract-metadata.py", [
          "--keyword",
          "do_not_index_tool_output_token",
          sessionPath,
        ])
        expect(outputResult.exitCode).toBe(0)
        const outputLines = parseJsonLines(outputResult.stdout)
        expect(outputLines.filter((l) => !l._meta).length).toBe(0)
        expect(outputLines.find((l) => l._meta).files_matched).toBe(0)
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      }
    })

    test("Pi assistant toolCall targets are searchable", async () => {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "pi-toolcall-keyword-")
      )
      const sessionPath = path.join(tempDir, "pi-toolcall-session.jsonl")

      try {
        await fs.promises.writeFile(
          sessionPath,
          createPiToolCallAndCustomSession()
        )

        for (const keyword of ["auth-expiry.test.ts", "session-expiry.ts"]) {
          const { stdout, exitCode } = await runScript("extract-metadata.py", [
            "--keyword",
            keyword,
            sessionPath,
          ])
          expect(exitCode).toBe(0)
          const lines = parseJsonLines(stdout)
          expect(lines.filter((l) => !l._meta).length).toBe(1)
          expect(lines.find((l) => l._meta).files_matched).toBe(1)
        }
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      }
    })

    test("Pi custom-role message content is searchable", async () => {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "pi-custom-keyword-")
      )
      const sessionPath = path.join(tempDir, "pi-custom-session.jsonl")

      try {
        await fs.promises.writeFile(
          sessionPath,
          createPiToolCallAndCustomSession()
        )

        const { stdout, exitCode } = await runScript("extract-metadata.py", [
          "--keyword",
          "custom_role_keyword",
          sessionPath,
        ])
        expect(exitCode).toBe(0)
        const lines = parseJsonLines(stdout)
        expect(lines.filter((l) => !l._meta).length).toBe(1)
        expect(lines.find((l) => l._meta).files_matched).toBe(1)
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      }
    })

    test("Pi keyword matching only scans the active branch", async () => {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "pi-branch-keyword-")
      )
      const sessionPath = path.join(tempDir, "pi-branched-session.jsonl")

      try {
        await fs.promises.writeFile(sessionPath, createBranchedPiSession())

        const activeResult = await runScript("extract-metadata.py", [
          "--keyword",
          "active_branch_keyword",
          sessionPath,
        ])
        expect(activeResult.exitCode).toBe(0)
        const activeLines = parseJsonLines(activeResult.stdout)
        expect(activeLines.filter((l) => !l._meta).length).toBe(1)
        expect(activeLines.find((l) => l._meta).files_matched).toBe(1)

        const abandonedResult = await runScript("extract-metadata.py", [
          "--keyword",
          "abandoned_branch_keyword",
          sessionPath,
        ])
        expect(abandonedResult.exitCode).toBe(0)
        const abandonedLines = parseJsonLines(abandonedResult.stdout)
        expect(abandonedLines.filter((l) => !l._meta).length).toBe(0)
        expect(abandonedLines.find((l) => l._meta).files_matched).toBe(0)
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      }
    })

    test("Pi keyword matching scans context summaries and honors compaction firstKeptEntryId", async () => {
      const tempDir = await fs.promises.mkdtemp(
        path.join(os.tmpdir(), "pi-summary-keyword-")
      )
      const sessionPath = path.join(tempDir, "pi-summary-session.jsonl")

      try {
        await fs.promises.writeFile(sessionPath, createPiSummaryContextSession())

        for (const keyword of [
          "compaction_summary_keyword",
          "branch_summary_keyword",
          "custom_message_keyword",
          "kept_after_compaction_keyword",
        ]) {
          const { stdout, exitCode } = await runScript("extract-metadata.py", [
            "--keyword",
            keyword,
            sessionPath,
          ])
          expect(exitCode).toBe(0)
          const lines = parseJsonLines(stdout)
          expect(lines.filter((l) => !l._meta).length).toBe(1)
          expect(lines.find((l) => l._meta).files_matched).toBe(1)
        }

        const compactedResult = await runScript("extract-metadata.py", [
          "--keyword",
          "old_compacted_keyword",
          sessionPath,
        ])
        expect(compactedResult.exitCode).toBe(0)
        const compactedLines = parseJsonLines(compactedResult.stdout)
        expect(compactedLines.filter((l) => !l._meta).length).toBe(0)
        expect(compactedLines.find((l) => l._meta).files_matched).toBe(0)
      } finally {
        await fs.promises.rm(tempDir, { recursive: true, force: true })
      }
    })

    test("emits files_matched in _meta and preserves files_processed", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "middleware",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
        path.join(FIXTURES_DIR, "codex-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const meta = lines.find((l) => l._meta)
      expect(meta.files_processed).toBe(2)
      expect(meta.files_matched).toBe(2)
      expect(meta.parse_errors).toBe(0)
    })

    test("without --keyword, output shape is unchanged (no match_count field)", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const session = lines.find((l) => !l._meta)
      expect(session.match_count).toBeUndefined()
      expect(session.keyword_matches).toBeUndefined()
      const meta = lines.find((l) => l._meta)
      expect(meta.files_matched).toBeUndefined()
    })

    // Content-only scanning: --keyword must match against user/assistant text,
    // not JSONL metadata fields or tool-call internals. Otherwise common topic
    // words like "session" false-positive on every file via sessionId.
    test("does not match JSONL metadata field names", async () => {
      // sessionId, gitBranch, uuid, parentUuid, timestamp are JSONL field names
      // present in every Claude session file. None should match.
      for (const metaToken of ["sessionId", "gitBranch", "parentUuid"]) {
        const { stdout, exitCode } = await runScript("extract-metadata.py", [
          "--keyword",
          metaToken,
          path.join(FIXTURES_DIR, "claude-session.jsonl"),
        ])
        expect(exitCode).toBe(0)
        const lines = parseJsonLines(stdout)
        const sessions = lines.filter((l) => !l._meta)
        if (sessions.length > 0) {
          expect(sessions[0].keyword_matches[metaToken]).toBe(0)
        }
      }
    })

    test("does not match against tool_use names or tool inputs", async () => {
      // The Claude fixture invokes Read and Edit tools. Those tool names should
      // not produce matches — they are tool-call internals, not user content.
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "Edit",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      // Either excluded entirely (zero match) or match_count: 0
      if (sessions.length > 0) {
        expect(sessions[0].keyword_matches.Edit).toBe(0)
      }
    })

    test("does not match Codex system_instruction wrapper text", async () => {
      // The Codex fixture's first user message is wrapped in
      // <system_instruction>You are working inside Conductor.</system_instruction>
      // which is Codex/Conductor boilerplate, not user-authored content.
      // "Conductor" only appears inside that wrapper, so it must not match.
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "Conductor",
        path.join(FIXTURES_DIR, "codex-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      // Either excluded entirely (zero match) or match_count: 0
      if (sessions.length > 0) {
        expect(sessions[0].keyword_matches.Conductor).toBe(0)
      }
    })

    test("--cwd-filter is applied before keyword scan (skips full-file scan for filtered sessions)", async () => {
      // Codex discovery returns sessions across all repos, so --cwd-filter
      // must be evaluated before the expensive full-file keyword scan to
      // avoid scanning sessions that are immediately discarded. Verify the
      // observable contract: a session that fails --cwd-filter is counted
      // in filtered_by_cwd and never reaches the keyword filter, so
      // files_matched stays 0 even though --keyword was supplied.
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--cwd-filter",
        "other-repo",
        "--keyword",
        "auth",
        path.join(FIXTURES_DIR, "codex-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      expect(sessions.length).toBe(0)
      const meta = lines.find((l) => l._meta)
      expect(meta.filtered_by_cwd).toBe(1)
      expect(meta.files_matched).toBe(0)
    })

    test("empty input with --keyword still emits files_matched: 0", async () => {
      // The empty-stdin (xargs-empty) branch must include files_matched when
      // --keyword is supplied, so callers relying on its presence to short-
      // circuit in zero-match scans get a consistent shape.
      const { stdout, exitCode } = await runScript(
        "extract-metadata.py",
        ["--keyword", "anything"],
        ""
      )
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const meta = lines.find((l) => l._meta)
      expect(meta.files_processed).toBe(0)
      expect(meta.parse_errors).toBe(0)
      expect(meta.files_matched).toBe(0)
    })

    test("matches against actual user/assistant content", async () => {
      // The Claude fixture's first user message says "fix the auth bug" and
      // assistant text mentions "auth module" and "middleware". These ARE
      // user-visible content and must match.
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "auth",
        path.join(FIXTURES_DIR, "claude-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      expect(sessions.length).toBe(1)
      expect(sessions[0].keyword_matches.auth).toBeGreaterThan(0)
    })

    test("matches Pi string-form user content", async () => {
      const { stdout, exitCode } = await runScript("extract-metadata.py", [
        "--keyword",
        "expiry",
        path.join(FIXTURES_DIR, "pi-session.jsonl"),
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      expect(sessions.length).toBe(1)
      expect(sessions[0].keyword_matches.expiry).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// extract-skeleton.py
// ---------------------------------------------------------------------------
describe("extract-skeleton", () => {
  test("extracts Claude user and assistant messages", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[user] fix the auth bug")
    expect(stdout).toContain("[assistant] I'll investigate the auth module.")
    expect(stdout).toContain(
      "[assistant] The middleware fix is applied and working."
    )
  })

  test("extracts Claude tool calls with targets", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    expect(stdout).toContain("[tool] Read")
    expect(stdout).toContain("auth.ts")
  })

  test("detects Claude sessions whose metadata preamble exceeds ten records", async () => {
    // Issue #923: current Claude Code session files front-load more than ten
    // non-message metadata records (last-prompt, custom-title, attachments,
    // ...) before the first user/assistant record. Detection must keep
    // scanning until a decisive record appears — a scan capped at the first
    // ten lines misroutes these sessions to the codex handler and returns an
    // empty skeleton with parse_errors: 0.
    const preamble = [
      "last-prompt",
      "custom-title",
      "agent-name",
      "mode",
      "permission-mode",
      "attachment",
      "attachment",
      "attachment",
      "attachment",
      "attachment",
      "attachment",
      "attachment",
    ]
      .map((t) => JSON.stringify({ type: t, value: "x" }))
      .join("\n")
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      preamble + "\n" + fixture
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[user] fix the auth bug")
    expect(stdout).toContain("[assistant] I'll investigate the auth module.")
  })

  test("strips local-command-stdout from Claude output", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    expect(stdout).not.toContain("local-command-stdout")
    expect(stdout).not.toContain("Server restarted")
  })

  test("strips task-notification from Claude output", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    expect(stdout).not.toContain("task-notification")
    expect(stdout).not.toContain("abc123")
  })

  test("strips local-command-caveat from Claude output", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    expect(stdout).not.toContain("local-command-caveat")
    expect(stdout).not.toContain("Caveat: The messages below")
  })

  test("extracts Codex user and assistant messages", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "codex-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    expect(stdout).toContain("[user] Fix the auth bug in middleware")
    expect(stdout).not.toContain("system_instruction")
    expect(stdout).toContain(
      "[assistant] Reading the middleware file to understand the auth flow."
    )
  })

  test("deduplicates Codex function_call/exec_command_end", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "codex-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    // Should have exec results (from exec_command_end) but not function_call entries
    const toolLines = stdout
      .split("\n")
      .filter((l: string) => l.includes("[tool]"))
    // Each exec_command_end produces one tool line
    expect(toolLines.length).toBeGreaterThan(0)
    // function_call lines should NOT appear (they're skipped)
    expect(stdout).not.toContain("exec_command:")
  })

  test("extracts Cursor messages and strips user_query tags", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "cursor-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    expect(stdout).toContain("[user] Explain the auth middleware")
    expect(stdout).not.toContain("user_query")
    expect(stdout).toContain("[assistant] The auth middleware validates JWT")
  })

  test("skips Cursor [REDACTED] blocks", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "cursor-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    // [REDACTED] on its own should not appear as an assistant message
    const assistantLines = stdout
      .split("\n")
      .filter((l: string) => l.includes("[assistant]"))
    for (const line of assistantLines) {
      expect(line).not.toMatch(/\[assistant\]\s*\[REDACTED\]$/)
    }
  })

  test("extracts Pi user, assistant, and tool messages", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "pi-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[user] fix the auth bug in middleware")
    expect(stdout).toContain("[assistant] Let me look at the auth middleware.")
    expect(stdout).toContain("[assistant] Found the issue.")
    expect(stdout).toContain("[user] also add a regression test for the expiry check")
    expect(stdout).toContain("[tool] read /Users/test/Code/my-repo/src/auth.ts -> ok")
    expect(stdout).toContain("[tool] edit /Users/test/Code/my-repo/src/auth.ts -> error")
    expect(stdout).not.toContain("internal reasoning should not be extracted")
    expect(stdout).not.toContain("file contents here")
  })

  test("extracts Pi bashExecution commands", async () => {
    const lines = [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "test-pi-bash-session",
        timestamp: "2026-04-07T09:00:00.000Z",
        cwd: "/Users/test/Code/my-repo",
      }),
      JSON.stringify({
        type: "message",
        id: "bash1",
        parentId: null,
        timestamp: "2026-04-07T09:02:00.000Z",
        message: {
          role: "bashExecution",
          command: "bun test tests/session-history-scripts.test.ts",
          output: "56 pass\n0 fail",
          exitCode: 0,
          cancelled: false,
          truncated: false,
          timestamp: 1775542920000,
        },
      }),
      JSON.stringify({
        type: "message",
        id: "bash2",
        parentId: "bash1",
        timestamp: "2026-04-07T09:03:00.000Z",
        message: {
          role: "bashExecution",
          command: "bun test tests/missing.test.ts",
          output: "1 test failed",
          exitCode: 1,
          cancelled: false,
          truncated: false,
          timestamp: 1775542980000,
        },
      }),
    ]
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      lines.join("\n")
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[tool] bash bun test tests/session-history-scripts.test.ts -> ok")
    expect(stdout).toContain("[tool] bash bun test tests/missing.test.ts -> error(exit 1)")
    const meta = JSON.parse(stdout.trim().split("\n").at(-1)!)
    expect(meta.tool).toBe(2)
    expect(meta.parse_errors).toBe(0)
  })

  test("filters Pi skeleton extraction to the active branch", async () => {
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      createBranchedPiSession()
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("fix the shared auth flow")
    expect(stdout).toContain("active_branch_keyword")
    expect(stdout).toContain("active-branch.test.ts")
    expect(stdout).not.toContain("abandoned_branch_keyword")
    expect(stdout).not.toContain("abandoned-branch.test.ts")
  })

  test("mirrors Pi compaction context in skeleton extraction", async () => {
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      createPiSummaryContextSession()
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("compaction_summary_keyword")
    expect(stdout).toContain("branch_summary_keyword")
    expect(stdout).toContain("custom_message_keyword")
    expect(stdout).toContain("kept_after_compaction_keyword")
    expect(stdout).not.toContain("old_compacted_keyword")
    expect(stdout).not.toContain("old-compacted.test.ts")
    expect(stdout.indexOf("compaction_summary_keyword")).toBeLessThan(
      stdout.indexOf("kept_after_compaction_keyword")
    )
  })

  test("extracts Pi custom-role messages in skeleton output", async () => {
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      createPiToolCallAndCustomSession()
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("custom_role_keyword")
  })

  test("outputs _meta with stats", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-skeleton.py", [], fixture)
    const lines = stdout.trim().split("\n")
    const meta = JSON.parse(lines[lines.length - 1])
    expect(meta._meta).toBe(true)
    expect(meta.user).toBeGreaterThan(0)
    expect(meta.assistant).toBeGreaterThan(0)
    expect(meta.parse_errors).toBe(0)
  })

  test("collapses 3+ consecutive same-tool calls", async () => {
    // Create a fixture with 4 consecutive Read calls
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "Reading multiple files." },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/a/file1.ts" },
            },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/a/file2.ts" },
            },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/a/file3.ts" },
            },
            {
              type: "tool_use",
              name: "Read",
              input: { file_path: "/a/file4.ts" },
            },
          ],
        },
        timestamp: "2026-04-05T10:00:00.000Z",
      }),
      JSON.stringify({
        type: "user",
        message: {
          role: "user",
          content: [
            { type: "tool_result", tool_use_id: "t1", is_error: false },
            { type: "tool_result", tool_use_id: "t2", is_error: false },
            { type: "tool_result", tool_use_id: "t3", is_error: false },
            { type: "tool_result", tool_use_id: "t4", is_error: false },
            { type: "text", text: "looks good" },
          ],
        },
        timestamp: "2026-04-05T10:00:01.000Z",
      }),
    ]
    const { stdout } = await runScript(
      "extract-skeleton.py",
      [],
      lines.join("\n")
    )
    expect(stdout).toContain("[tools] 4x Read")
    expect(stdout).toContain("all ok")
  })

  // Regression: issue #805 — some Claude Code / MCP tool inputs put a dict in
  // fields the summarizer slices (`command`, `query`, `prompt`, `pattern`).
  // `dict[:80]` raises TypeError: unhashable type: 'slice'. The fix guards
  // every slice with isinstance(value, str); dict-shaped fields fall through
  // to the next candidate or empty target without crashing the extraction.
  test("does not crash when Claude tool input has a dict-shaped query", async () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "t1",
              name: "WebSearch",
              input: { query: { foo: "bar" } },
            },
          ],
        },
        timestamp: "2026-05-08T10:00:00.000Z",
      }),
    ]
    const { stdout, exitCode, stderr } = await runScript(
      "extract-skeleton.py",
      [],
      lines.join("\n")
    )
    expect(exitCode).toBe(0)
    expect(stderr).not.toContain("TypeError")
    expect(stdout).toContain("[tool] WebSearch")
    const metaLine = stdout.trim().split("\n").at(-1)!
    expect(JSON.parse(metaLine).parse_errors).toBe(0)
  })

  test("dict-shaped command/prompt/pattern fields do not crash and fall back to empty target", async () => {
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "c1",
              name: "Bash",
              input: { command: { cmd: "ls" } },
            },
            {
              type: "tool_use",
              id: "p1",
              name: "Task",
              input: { prompt: { description: "x" } },
            },
            {
              type: "tool_use",
              id: "g1",
              name: "Grep",
              input: { pattern: { regex: "foo" } },
            },
          ],
        },
        timestamp: "2026-05-08T10:00:01.000Z",
      }),
    ]
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      lines.join("\n")
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[tool] Bash")
    expect(stdout).toContain("[tool] Task")
    expect(stdout).toContain("[tool] Grep")
  })

  test("falls through dict-shaped query to a later string field", async () => {
    // When `query` is a dict, the summarizer must skip it and try `prompt`.
    const lines = [
      JSON.stringify({
        type: "assistant",
        message: {
          role: "assistant",
          content: [
            {
              type: "tool_use",
              id: "x1",
              name: "MCPTool",
              input: {
                query: { structured: true },
                prompt: "fallback prompt text",
              },
            },
          ],
        },
        timestamp: "2026-05-08T10:00:02.000Z",
      }),
    ]
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      lines.join("\n")
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("fallback prompt text")
  })

  test("dict-shaped Cursor tool inputs do not crash", async () => {
    // Same exposure exists in handle_cursor's tool_use path.
    const lines = [
      JSON.stringify({
        role: "assistant",
        message: {
          content: [
            {
              type: "tool_use",
              name: "search",
              input: { pattern: { regex: "foo" }, glob_pattern: { type: "x" } },
            },
          ],
        },
      }),
    ]
    const { stdout, exitCode, stderr } = await runScript(
      "extract-skeleton.py",
      [],
      lines.join("\n")
    )
    expect(exitCode).toBe(0)
    expect(stderr).not.toContain("TypeError")
    expect(stdout).toContain("[tool] search")
  })
})

// ---------------------------------------------------------------------------
// extract-errors.py
// ---------------------------------------------------------------------------
describe("extract-errors", () => {
  test("extracts Claude tool errors", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[error]")
    expect(stdout).toContain("String to replace not found")
  })

  test("Claude errors are summarized, not raw", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-errors.py", [], fixture)
    const errorLines = stdout
      .split("\n")
      .filter((l: string) => l.includes("[error]"))
    for (const line of errorLines) {
      // No line should exceed 250 chars (200 char summary + timestamp + prefix)
      expect(line.length).toBeLessThan(250)
    }
  })

  test("extracts Codex command errors", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "codex-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[error]")
    expect(stdout).toContain("exit=1")
  })

  test("Cursor produces no errors (tool results not logged)", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "cursor-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    const lines = stdout.trim().split("\n")
    const meta = JSON.parse(lines[lines.length - 1])
    expect(meta.errors_found).toBe(0)
  })

  test("extracts Pi tool result errors", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "pi-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("[error] tool=edit: String to replace not found")
    const lines = stdout.trim().split("\n")
    const meta = JSON.parse(lines[lines.length - 1])
    expect(meta.errors_found).toBe(1)
    expect(meta.parse_errors).toBe(0)
  })

  test("extracts Pi bashExecution errors", async () => {
    const lines = [
      JSON.stringify({
        type: "session",
        version: 3,
        id: "test-pi-bash-session",
        timestamp: "2026-04-07T09:00:00.000Z",
        cwd: "/Users/test/Code/my-repo",
      }),
      JSON.stringify({
        type: "message",
        id: "bash1",
        parentId: null,
        timestamp: "2026-04-07T09:02:00.000Z",
        message: {
          role: "bashExecution",
          command: "bun test tests/session-history-scripts.test.ts",
          output: "1 test failed\nerror: expected 0 failures",
          exitCode: 1,
          cancelled: false,
          truncated: false,
          timestamp: 1775542920000,
        },
      }),
    ]
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      lines.join("\n")
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain(
      "[error] exit=1 cmd=bun test tests/session-history-scripts.test.ts: 1 test failed"
    )
    const meta = JSON.parse(stdout.trim().split("\n").at(-1)!)
    expect(meta.errors_found).toBe(1)
    expect(meta.parse_errors).toBe(0)
  })

  test("filters Pi error extraction to the active branch", async () => {
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      createBranchedPiSession()
    )
    expect(exitCode).toBe(0)
    expect(stdout).toContain("active-branch.test.ts")
    expect(stdout).not.toContain("abandoned-branch.test.ts")
    const meta = JSON.parse(stdout.trim().split("\n").at(-1)!)
    expect(meta.errors_found).toBe(1)
  })

  test("filters Pi error extraction to post-compaction context", async () => {
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      [],
      createPiSummaryContextSession()
    )
    expect(exitCode).toBe(0)
    expect(stdout).not.toContain("old-compacted.test.ts")
    const meta = JSON.parse(stdout.trim().split("\n").at(-1)!)
    expect(meta.errors_found).toBe(0)
  })

  test("outputs _meta with error count", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout } = await runScript("extract-errors.py", [], fixture)
    const lines = stdout.trim().split("\n")
    const meta = JSON.parse(lines[lines.length - 1])
    expect(meta._meta).toBe(true)
    expect(meta.errors_found).toBeGreaterThan(0)
    expect(meta.parse_errors).toBe(0)
  })
})

// ---------------------------------------------------------------------------
// --output PATH mode: extract-skeleton.py and extract-errors.py
//
// When --output PATH is set, scripts write extracted bytes to PATH and emit
// only a one-line _meta status to stdout (with wrote/bytes fields).
// This lets ce-compound's internal session-history flow route bulk extraction content to a scratch file
// without round-tripping through orchestrator tool results. Without --output,
// stdout-mode behavior is preserved (covered by tests above).
// ---------------------------------------------------------------------------
describe("--output PATH mode", () => {
  function tmpFile(): string {
    return path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "ce-session-history-test-")),
      "out.txt"
    )
  }

  test("extract-skeleton writes file and emits status to stdout", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const outPath = tmpFile()
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      ["--output", outPath],
      fixture
    )
    expect(exitCode).toBe(0)

    // stdout receives only a one-line _meta status with wrote/bytes
    const stdoutLines = stdout.trim().split("\n").filter((l) => l.trim())
    expect(stdoutLines).toHaveLength(1)
    const status = JSON.parse(stdoutLines[0])
    expect(status._meta).toBe(true)
    expect(status.wrote).toBe(outPath)
    expect(status.bytes).toBeGreaterThan(0)
    expect(status.parse_errors).toBe(0)

    // The file contains the actual extracted body, ending with the inner _meta line
    const body = fs.readFileSync(outPath, "utf-8")
    expect(body.length).toBe(status.bytes)
    const bodyLines = body.trim().split("\n")
    const innerMeta = JSON.parse(bodyLines[bodyLines.length - 1])
    expect(innerMeta._meta).toBe(true)
    expect(body).not.toMatch(/"wrote":/) // status field is stdout-only
  })

  test("extract-errors writes file and emits status to stdout", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const outPath = tmpFile()
    const { stdout, exitCode } = await runScript(
      "extract-errors.py",
      ["--output", outPath],
      fixture
    )
    expect(exitCode).toBe(0)

    const stdoutLines = stdout.trim().split("\n").filter((l) => l.trim())
    expect(stdoutLines).toHaveLength(1)
    const status = JSON.parse(stdoutLines[0])
    expect(status._meta).toBe(true)
    expect(status.wrote).toBe(outPath)
    expect(status.bytes).toBeGreaterThan(0)
    expect(status.errors_found).toBeGreaterThan(0)

    const body = fs.readFileSync(outPath, "utf-8")
    expect(body).toContain("[error]")
    expect(body.length).toBe(status.bytes)
  })

  test("extract-skeleton stdout-mode still works when --output is omitted", async () => {
    const fixture = await Bun.file(
      path.join(FIXTURES_DIR, "claude-session.jsonl")
    ).text()
    const { stdout, exitCode } = await runScript(
      "extract-skeleton.py",
      [],
      fixture
    )
    expect(exitCode).toBe(0)
    // No status JSON with `wrote` field — stdout has the body and ends with inner _meta
    expect(stdout).not.toMatch(/"wrote":/)
    const lines = stdout.trim().split("\n")
    const meta = JSON.parse(lines[lines.length - 1])
    expect(meta._meta).toBe(true)
    expect(meta).not.toHaveProperty("wrote")
  })
})

// ---------------------------------------------------------------------------
// Cross-platform auto-detection
// ---------------------------------------------------------------------------
describe("auto-detection", () => {
  test("all supported platforms are auto-detected", async () => {
    const fixtures = ["claude-session", "codex-session", "cursor-session", "pi-session"]
    const expected = ["claude", "codex", "cursor", "pi"]

    for (let i = 0; i < fixtures.length; i++) {
      const fixturePath = path.join(FIXTURES_DIR, `${fixtures[i]}.jsonl`)

      // metadata script
      const meta = await runScript("extract-metadata.py", [fixturePath])
      const metaLines = parseJsonLines(meta.stdout)
      const session = metaLines.find((l) => !l._meta)
      expect(session?.platform).toBe(expected[i])

      // skeleton script - just verify it produces output without errors
      const content = await Bun.file(fixturePath).text()
      const skel = await runScript("extract-skeleton.py", [], content)
      expect(skel.exitCode).toBe(0)
      // The last line is the _meta JSON; other lines are plain text
      const skelLines = skel.stdout.trim().split("\n")
      const skelMeta = JSON.parse(skelLines[skelLines.length - 1])
      expect(skelMeta._meta).toBe(true)
      expect(skelMeta.parse_errors).toBe(0)
    }
  }, { timeout: 30_000 })
})

// ---------------------------------------------------------------------------
// discover-sessions.sh
// ---------------------------------------------------------------------------
describe("discover-sessions", () => {
  async function runDiscover(
    args: string[],
    env: Record<string, string> = {}
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const scriptPath = path.join(SCRIPTS_DIR, "discover-sessions.sh")
    const proc = Bun.spawn(["bash", scriptPath, ...args], {
      env: { ...process.env, ...env },
      stdout: "pipe",
      stderr: "pipe",
    })
    const stdout = await new Response(proc.stdout).text()
    const stderr = await new Response(proc.stderr).text()
    const exitCode = await proc.exited
    return { stdout, stderr, exitCode }
  }

  test("returns zero files for nonexistent repo without error", async () => {
    const { stdout, stderr, exitCode } = await runDiscover(
      ["nonexistent-repo-xyz", "7", "--platform", "claude"]
    )
    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files.length).toBe(0)
  })

  test("returns zero files for nonexistent repo on cursor", async () => {
    const { stdout, stderr, exitCode } = await runDiscover(
      ["nonexistent-repo-xyz", "7", "--platform", "cursor"]
    )
    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files.length).toBe(0)
  })

  test("all output lines are .jsonl files", async () => {
    const { stdout, exitCode } = await runDiscover(
      ["compound-engineering-plugin", "7"]
    )
    expect(exitCode).toBe(0)
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    if (files.length > 0) {
      for (const file of files) {
        expect(file).toMatch(/\.jsonl$/)
      }
    }
  })

  test("--platform claude restricts to claude dirs only", async () => {
    const { stdout } = await runDiscover(
      ["compound-engineering-plugin", "7", "--platform", "claude"]
    )
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    for (const file of files) {
      expect(file).toContain(".claude/projects")
    }
  })

  test("--platform codex restricts to codex dirs only", async () => {
    const { stdout } = await runDiscover(
      ["compound-engineering-plugin", "7", "--platform", "codex"]
    )
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    for (const file of files) {
      expect(file).toMatch(/\.codex\/sessions|\.agents\/sessions/)
    }
  })

  test("fails on unknown platform", async () => {
    const { exitCode, stderr } = await runDiscover(
      ["compound-engineering-plugin", "7", "--platform", "windsurf"]
    )
    expect(exitCode).toBe(1)
    expect(stderr).toContain("Unknown platform")
  })

  test("--platform pi discovers sessions under encoded CWD directories", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"))
    const sessionPath = path.join(
      tempHome,
      ".pi/agent/sessions/--Users-test-Code-my-repo--/2026-04-07T09-00-00-000Z_test.jsonl"
    )
    await writeFixture(sessionPath, "pi-session.jsonl")

    const { stdout, stderr, exitCode } = await runDiscover(
      ["my-repo", "7", "--platform", "pi"],
      { HOME: tempHome }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files).toEqual([sessionPath])
  })

  test("--platform pi with --cwd discovers only the exact encoded CWD directory", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"))
    const sessionPath = path.join(
      tempHome,
      ".pi/agent/sessions/--Users-test-Code-my-repo--/2026-04-07T09-00-00-000Z_test.jsonl"
    )
    const siblingPath = path.join(
      tempHome,
      ".pi/agent/sessions/--Users-test-Code-my-repo-old--/2026-04-07T09-00-00-000Z_test.jsonl"
    )
    await writeFixture(sessionPath, "pi-session.jsonl")
    await writeFixture(siblingPath, "pi-session.jsonl")

    const { stdout, stderr, exitCode } = await runDiscover(
      [
        "my-repo",
        "7",
        "--cwd",
        "/Users/test/Code/my-repo",
        "--platform",
        "pi",
      ],
      { HOME: tempHome }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files).toEqual([sessionPath])
  })

  test("--cwd works without an explicit --platform flag", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"))
    const sessionPath = path.join(
      tempHome,
      ".pi/agent/sessions/--Users-test-Code-my-repo--/2026-04-07T09-00-00-000Z_test.jsonl"
    )
    await writeFixture(sessionPath, "pi-session.jsonl")

    const { stdout, stderr, exitCode } = await runDiscover(
      ["my-repo", "7", "--cwd", "/Users/test/Code/my-repo"],
      { HOME: tempHome }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files).toEqual([sessionPath])
  })

  test("--platform pi with PI_CODING_AGENT_SESSION_DIR searches that directory directly", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"))
    const sessionBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sessions-"))
    const sessionPath = path.join(
      sessionBase,
      "2026-04-07T09-00-00-000Z_test.jsonl"
    )
    await writeFixture(sessionPath, "pi-session.jsonl")

    const { stdout, stderr, exitCode } = await runDiscover(
      [
        "my-repo",
        "7",
        "--cwd",
        "/Users/test/Code/my-repo",
        "--platform",
        "pi",
      ],
      {
        HOME: tempHome,
        PI_CODING_AGENT_SESSION_DIR: sessionBase,
      }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files).toEqual([sessionPath])
  })

  test("--platform pi honors PI_CODING_AGENT_SESSION_DIR", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"))
    const sessionBase = fs.mkdtempSync(path.join(os.tmpdir(), "pi-sessions-"))
    const sessionPath = path.join(
      sessionBase,
      "--Users-test-Code-my-repo--/2026-04-07T09-00-00-000Z_test.jsonl"
    )
    await writeFixture(sessionPath, "pi-session.jsonl")

    const { stdout, stderr, exitCode } = await runDiscover(
      ["my-repo", "7", "--platform", "pi"],
      { HOME: tempHome, PI_CODING_AGENT_SESSION_DIR: sessionBase }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files).toEqual([sessionPath])
  })

  test("--platform pi honors PI_CODING_AGENT_DIR sessions subdirectory", async () => {
    const tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pi-home-"))
    const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), "pi-agent-"))
    const sessionPath = path.join(
      agentDir,
      "sessions/--Users-test-Code-my-repo--/2026-04-07T09-00-00-000Z_test.jsonl"
    )
    await writeFixture(sessionPath, "pi-session.jsonl")

    const { stdout, stderr, exitCode } = await runDiscover(
      ["my-repo", "7", "--platform", "pi"],
      { HOME: tempHome, PI_CODING_AGENT_DIR: agentDir }
    )

    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files).toEqual([sessionPath])
  })
})
