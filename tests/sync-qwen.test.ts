import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import type { ClaudeHomeConfig } from "../src/parsers/claude-home"
import { syncToQwen } from "../src/sync/qwen"

describe("syncToQwen", () => {
  test("defaults ambiguous remote URLs to httpUrl and warns", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-qwen-"))
    const warnings: string[] = []
    const originalWarn = console.warn
    console.warn = (message?: unknown) => {
      warnings.push(String(message))
    }

    try {
      const config: ClaudeHomeConfig = {
        skills: [],
        mcpServers: {
          remote: { url: "https://example.com/mcp", headers: { Authorization: "Bearer token" } },
        },
      }

      await syncToQwen(config, tempRoot)
    } finally {
      console.warn = originalWarn
    }

    const content = JSON.parse(
      await fs.readFile(path.join(tempRoot, "settings.json"), "utf8"),
    ) as {
      mcpServers: Record<string, { httpUrl?: string; url?: string; headers?: Record<string, string> }>
    }

    expect(content.mcpServers.remote?.httpUrl).toBe("https://example.com/mcp")
    expect(content.mcpServers.remote?.url).toBeUndefined()
    expect(content.mcpServers.remote?.headers).toEqual({ Authorization: "Bearer token" })
    expect(warnings.some((warning) => warning.includes("ambiguous remote transport"))).toBe(true)
  })

  test("uses legacy url only for explicit SSE servers and preserves existing settings", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "sync-qwen-sse-"))
    await fs.writeFile(
      path.join(tempRoot, "settings.json"),
      JSON.stringify({
        theme: "dark",
        mcpServers: {
          existing: { command: "node" },
        },
      }, null, 2),
    )

    const config: ClaudeHomeConfig = {
      skills: [],
      mcpServers: {
        legacy: { type: "sse", url: "https://example.com/sse" },
      },
    }

    await syncToQwen(config, tempRoot)

    const content = JSON.parse(
      await fs.readFile(path.join(tempRoot, "settings.json"), "utf8"),
    ) as {
      theme: string
      mcpServers: Record<string, { command?: string; httpUrl?: string; url?: string }>
    }

    expect(content.theme).toBe("dark")
    expect(content.mcpServers.existing?.command).toBe("node")
    expect(content.mcpServers.legacy?.url).toBe("https://example.com/sse")
    expect(content.mcpServers.legacy?.httpUrl).toBeUndefined()
  })
})
