import { describe, expect, test, beforeAll } from "bun:test"
import path from "path"

const SCRIPTS_DIR = path.join(
  import.meta.dir,
  "..",
  "plugins",
  "compound-engineering",
  "hooks",
  "scripts"
)
const VALIDATE_BASH = path.join(SCRIPTS_DIR, "validate-bash.sh")
const PROTECT_ENV = path.join(SCRIPTS_DIR, "protect-env-files.sh")

interface HookOutput {
  hookSpecificOutput?: {
    hookEventName: string
    permissionDecision: string
    permissionDecisionReason: string
  }
}

async function runHook(
  script: string,
  input: Record<string, unknown>
): Promise<{ stdout: string; exitCode: number; parsed: HookOutput | null }> {
  const proc = Bun.spawn(["bash", script], {
    stdin: "pipe",
    stdout: "pipe",
    stderr: "pipe",
  })

  const jsonInput = JSON.stringify(input)
  proc.stdin.write(jsonInput)
  proc.stdin.end()

  const stdout = await new Response(proc.stdout).text()
  const exitCode = await proc.exited

  let parsed: HookOutput | null = null
  const trimmed = stdout.trim()
  if (trimmed.length > 0) {
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      parsed = null
    }
  }

  return { stdout: trimmed, exitCode, parsed }
}

let jqAvailable = false

beforeAll(async () => {
  try {
    const proc = Bun.spawn(["which", "jq"], { stdout: "pipe", stderr: "pipe" })
    await proc.exited
    jqAvailable = proc.exitCode === 0
  } catch {
    jqAvailable = false
  }
})

describe("hook scripts", () => {
  test("jq is available", () => {
    if (!jqAvailable) {
      console.warn("jq not found - skipping hook script tests")
    }
    expect(jqAvailable).toBe(true)
  })

  describe("validate-bash.sh", () => {
    test("normal command -> allow (silent)", async () => {
      const { stdout, exitCode } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "ls -la" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("non-force git push -> allow (silent)", async () => {
      const { stdout, exitCode } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "git push origin main" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("git push --force -> ask", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "git push --force origin main" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Force push"
      )
    })

    test("git push -f -> ask", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "git push -f origin main" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Force push"
      )
    })

    test("git reset --hard -> ask", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "git reset --hard" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Hard reset"
      )
    })

    test("rm -rf src/components -> ask", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -rf src/components" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Recursive delete"
      )
    })

    test("rm -fr dist/build -> ask", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -fr dist/build" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Recursive delete"
      )
    })

    test("rm -rf / -> deny", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -rf /" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("deny")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Catastrophic delete"
      )
    })

    test("rm -rf ~ -> deny", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -rf ~" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("deny")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Catastrophic delete"
      )
    })

    test("rm -rf $HOME -> deny", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -rf $HOME" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("deny")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Catastrophic delete"
      )
    })

    test("rm -rf node_modules -> allow (safe target)", async () => {
      const { stdout, exitCode } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -rf node_modules" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("rm -rf .cache -> allow (safe target)", async () => {
      const { stdout, exitCode } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "rm -rf .cache" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("empty command -> allow (silent)", async () => {
      const { stdout, exitCode } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("piped cd && rm -rf -> ask", async () => {
      const { exitCode, parsed } = await runHook(VALIDATE_BASH, {
        tool_input: { command: "cd /tmp && rm -rf important" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "Recursive delete"
      )
    })
  })

  describe("protect-env-files.sh", () => {
    test(".env -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: ".env" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        ".env"
      )
    })

    test(".env.local -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: ".env.local" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        ".env"
      )
    })

    test(".env.production -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: ".env.production" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        ".env"
      )
    })

    test("src/index.ts -> allow (silent)", async () => {
      const { stdout, exitCode } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "src/index.ts" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("cert.pem -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "cert.pem" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "certificate"
      )
    })

    test("private.key -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "private.key" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "key file"
      )
    })

    test("credentials.json -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "credentials.json" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "credentials"
      )
    })

    test("secret.yml -> ask", async () => {
      const { exitCode, parsed } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "secret.yml" },
      })
      expect(exitCode).toBe(0)
      expect(parsed?.hookSpecificOutput?.permissionDecision).toBe("ask")
      expect(parsed?.hookSpecificOutput?.permissionDecisionReason).toContain(
        "secrets config"
      )
    })

    test("src/env-utils.ts -> allow (silent)", async () => {
      const { stdout, exitCode } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "src/env-utils.ts" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })

    test("empty file_path -> allow (silent)", async () => {
      const { stdout, exitCode } = await runHook(PROTECT_ENV, {
        tool_input: { file_path: "" },
      })
      expect(exitCode).toBe(0)
      expect(stdout).toBe("")
    })
  })
})
