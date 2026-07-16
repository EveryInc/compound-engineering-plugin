import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const PLUGIN_ROOT = path.join(process.cwd(), "skills")

// The peer-job runner is byte-duplicated into every consuming review skill
// (the plugin has no cross-skill import mechanism — see AGENTS.md "File
// References in Skills"). All copies must stay identical.
const RUNNER_ASSETS = ["scripts/peer-job-runner.py"]

const CONSUMER_SKILLS = ["ce-doc-review", "ce-code-review", "ce-pov", "ce-work"]
const PEER_WORKERS = [
  "ce-doc-review/scripts/cross-model-doc-review.sh",
  "ce-code-review/scripts/cross-model-adversarial-review.sh",
  "ce-pov/scripts/cross-model-pov.sh",
]

describe("peer-job-runner shared-asset parity", () => {
  for (const asset of RUNNER_ASSETS) {
    test(`${asset} exists in every consumer and is byte-identical`, async () => {
      const contents = await Promise.all(
        CONSUMER_SKILLS.map(async (skill) => {
          const p = path.join(PLUGIN_ROOT, skill, asset)
          return readFile(p, "utf8")
        }),
      )
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })
  }

  test("peer-worker heartbeat lifecycle is identical and exits with its parent", async () => {
    const kernels = await Promise.all(
      PEER_WORKERS.map(async (worker) => {
        const body = await readFile(path.join(PLUGIN_ROOT, worker), "utf8")
        expect(body).toContain('wait "$_HEARTBEAT_PID" 2>/dev/null || true')
        const match = body.match(/start_heartbeat\(\) \{[\s\S]*?\n\}\n(?=\nrun_codex_cmd\(\))/)
        expect(match).not.toBeNull()
        return match![0]
      }),
    )
    expect(kernels[1]).toBe(kernels[0])
    expect(kernels[2]).toBe(kernels[0])
    expect(kernels[0]).toContain('parent_pid="$$"')
    expect(kernels[0]).toContain('while kill -0 "$parent_pid" 2>/dev/null')
  })
})
