import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-code-review run correlation", () => {
  test("documents caller-provided run id and artifact dir tokens", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")
    const docs = await readRepoFile("docs/skills/ce-code-review.md")

    expect(content).toContain("run-id:<id>")
    expect(content).toContain("artifact-dir:<path>")
    expect(content).toContain("Validate `run-id:` for path safety")
    expect(content).toContain("fail closed on collisions")
    expect(content).toContain("Do not recover by newest modification time")

    expect(docs).toContain("run-id:<id>")
    expect(docs).toContain("artifact-dir:<path>")
  })

  test("JSON output and metadata carry matching correlation fields", async () => {
    const content = await readRepoFile("skills/ce-code-review/SKILL.md")

    expect(content).toContain('"run_id": "<run-id>"')
    expect(content).toContain('"artifact_path": "/tmp/compound-engineering/ce-code-review/<run-id>/"')
    expect(content).toContain("review.json")
    expect(content).toContain("metadata.json")
    expect(content).toContain("wrong-run artifact is ignored")
  })
})
