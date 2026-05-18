import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(
  process.cwd(),
  "plugins/compound-engineering/skills/ce-code-review/SKILL.md",
)
const SKILL_BODY = readFileSync(SKILL_PATH, "utf8")

const awkMatch = SKILL_BODY.match(
  /awk -v host="<base-host>" -v repo="<base-repo>" '\n(?<program>[\s\S]*?\n  })'\)/,
)
const AWK_PROGRAM = awkMatch?.groups?.program ?? ""

async function matchRemote(
  remotes: string,
  host: string,
  repo: string,
): Promise<string> {
  const proc = Bun.spawn(
    ["awk", "-v", `host=${host}`, "-v", `repo=${repo}`, AWK_PROGRAM],
    {
      stdin: new TextEncoder().encode(remotes),
      stdout: "pipe",
      stderr: "pipe",
    },
  )
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  const exitCode = await proc.exited

  expect(stderr).toBe("")
  expect(exitCode).toBe(0)
  return stdout.trim()
}

describe("ce-code-review PR base remote matcher", () => {
  test("extracts the embedded AWK matcher from SKILL.md", () => {
    expect(AWK_PROGRAM).not.toBe("")
  })

  test("matches HTTPS remotes on a ported GitHub Enterprise host", async () => {
    await expect(
      matchRemote(
        "base https://ghe.acme.com:8443/Org/Repo.git (fetch)\n",
        "ghe.acme.com:8443",
        "org/repo",
      ),
    ).resolves.toBe("base")
  })

  test("matches ssh URL remotes on a ported GitHub Enterprise host", async () => {
    await expect(
      matchRemote(
        "base ssh://git@ghe.acme.com:8443/Org/Repo.git (fetch)\n",
        "ghe.acme.com:8443",
        "org/repo",
      ),
    ).resolves.toBe("base")
  })

  test("allows scp-form SSH remotes to omit the PR URL port", async () => {
    await expect(
      matchRemote(
        [
          "wrongport https://ghe.acme.com:9443/Org/Repo.git (fetch)",
          "base git@ghe.acme.com:Org/Repo.git (fetch)",
        ].join("\n") + "\n",
        "ghe.acme.com:8443",
        "org/repo",
      ),
    ).resolves.toBe("base")
  })

  test("does not match a different port for URL-form remotes", async () => {
    await expect(
      matchRemote(
        "wrongport https://ghe.acme.com:9443/Org/Repo.git (fetch)\n",
        "ghe.acme.com:8443",
        "org/repo",
      ),
    ).resolves.toBe("")
  })
})
