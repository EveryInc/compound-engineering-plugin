import { describe, expect, test } from "bun:test"
import path from "path"

const INVENTORY_SCRIPTS_DIR = path.join(
  __dirname,
  "../plugins/compound-engineering/skills/ce-session-inventory/scripts"
)
const EXTRACT_SCRIPTS_DIR = path.join(
  __dirname,
  "../plugins/compound-engineering/skills/ce-session-extract/scripts"
)
const FIXTURES_DIR = path.join(__dirname, "fixtures/session-history")

function scriptsDirFor(scriptName: string): string {
  if (scriptName === "extract-metadata.py" || scriptName === "discover-sessions.sh") {
    return INVENTORY_SCRIPTS_DIR
  }
  return EXTRACT_SCRIPTS_DIR
}

async function runScript(
  scriptName: string,
  args: string[] = [],
  stdin?: string
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = path.join(scriptsDirFor(scriptName), scriptName)
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

function parseJsonLines(output: string): any[] {
  return output
    .trim()
    .split("\n")
    .filter((l) => l.trim())
    .map((l) => JSON.parse(l))
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

  test("batch mode processes multiple files", async () => {
    const { stdout, exitCode } = await runScript("extract-metadata.py", [
      path.join(FIXTURES_DIR, "claude-session.jsonl"),
      path.join(FIXTURES_DIR, "codex-session.jsonl"),
      path.join(FIXTURES_DIR, "cursor-session.jsonl"),
    ])
    expect(exitCode).toBe(0)
    const lines = parseJsonLines(stdout)
    const meta = lines.find((l) => l._meta)
    expect(meta.files_processed).toBe(3)
    expect(meta.parse_errors).toBe(0)
    const platforms = lines.filter((l) => !l._meta).map((l) => l.platform)
    expect(platforms).toContain("claude")
    expect(platforms).toContain("codex")
    expect(platforms).toContain("cursor")
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
      ])
      expect(exitCode).toBe(0)
      const lines = parseJsonLines(stdout)
      const sessions = lines.filter((l) => !l._meta)
      // All three fixtures mention middleware.
      expect(sessions.length).toBe(3)
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
// Cross-platform auto-detection
// ---------------------------------------------------------------------------
describe("auto-detection", () => {
  test("all three scripts detect the correct platform", async () => {
    const fixtures = ["claude-session", "codex-session", "cursor-session"]
    const expected = ["claude", "codex", "cursor"]

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
    ...args: string[]
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const scriptPath = path.join(scriptsDirFor("discover-sessions.sh"), "discover-sessions.sh")
    const proc = Bun.spawn(["bash", scriptPath, ...args], {
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
      "nonexistent-repo-xyz",
      "7",
      "--platform",
      "claude"
    )
    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files.length).toBe(0)
  })

  test("returns zero files for nonexistent repo on cursor", async () => {
    const { stdout, stderr, exitCode } = await runDiscover(
      "nonexistent-repo-xyz",
      "7",
      "--platform",
      "cursor"
    )
    expect(exitCode).toBe(0)
    expect(stderr).toBe("")
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    expect(files.length).toBe(0)
  })

  test("all output lines are .jsonl files", async () => {
    const { stdout, exitCode } = await runDiscover(
      "compound-engineering-plugin",
      "7"
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
      "compound-engineering-plugin",
      "7",
      "--platform",
      "claude"
    )
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    for (const file of files) {
      expect(file).toContain(".claude/projects")
    }
  })

  test("--platform codex restricts to codex dirs only", async () => {
    const { stdout } = await runDiscover(
      "compound-engineering-plugin",
      "7",
      "--platform",
      "codex"
    )
    const files = stdout.trim().split("\n").filter((l) => l.trim())
    for (const file of files) {
      expect(file).toMatch(/\.codex\/sessions|\.agents\/sessions/)
    }
  })

  test("fails on unknown platform", async () => {
    const { exitCode, stderr } = await runDiscover(
      "compound-engineering-plugin",
      "7",
      "--platform",
      "windsurf"
    )
    expect(exitCode).toBe(1)
    expect(stderr).toContain("Unknown platform")
  })
})
