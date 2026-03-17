import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import { writeOpenClawBundle } from "../src/targets/openclaw"
import type { OpenClawBundle } from "../src/types/openclaw"

describe("writeOpenClawBundle", () => {
  test("writes openclaw.plugin.json with a configSchema", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-writer-"))
    const bundle: OpenClawBundle = {
      manifest: {
        id: "compound-engineering",
        name: "Compound Engineering",
        kind: "tool",
        configSchema: {
          type: "object",
          properties: {},
        },
        skills: [],
      },
      packageJson: {
        name: "openclaw-compound-engineering",
        version: "1.0.0",
      },
      entryPoint: "export default async function register() {}",
      skills: [],
      skillDirCopies: [],
      commands: [],
    }

    await writeOpenClawBundle(tempRoot, bundle)

    const manifest = JSON.parse(
      await fs.readFile(path.join(tempRoot, "openclaw.plugin.json"), "utf8"),
    )

    expect(manifest.configSchema).toEqual({
      type: "object",
      properties: {},
    })
  })
})
