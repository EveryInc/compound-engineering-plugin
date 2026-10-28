import { afterAll, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { ACPX_MIN_VERSION } from "./helpers/acpx-pin"
import { supportedAcpxVersions } from "../scripts/test-acpx-contract"

setDefaultTimeout(20_000)
const roots: string[] = []
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))

test("the compatibility cohort contains every stable release between both tested bounds", () => {
  expect(supportedAcpxVersions([
    "0.21.1", "0.19.0", "0.13.2", "0.21.0", "0.14.0", "0.20.0-beta.1", "0.15.1",
  ], "0.14.0", "0.21.0")).toEqual(["0.14.0", "0.15.1", "0.19.0", "0.21.0"])
})

test.each([
  [null, "0.14.0", "0.21.0"],
  [["0.14.0", 21], "0.14.0", "0.21.0"],
  [["0.14.0", "0.21.0"], "0.14.0", "latest"],
  [["0.14.0", "0.21.0"], "0.21.0", "0.14.0"],
  [["0.21.0"], "0.14.0", "0.21.0"],
  [["0.14.0"], "0.14.0", "0.21.0"],
])("invalid or incomplete compatibility metadata fails closed (%j)", (versions, minimum, maximum) => {
  expect(() => supportedAcpxVersions(versions, minimum as string, maximum as string)).toThrow()
})

test.each([false, true])("the contract runner accounts for every version and propagates failure (%p)", (fail) => {
  const root = mkdtempSync(path.join(tmpdir(), "acpx-cohort-"))
  roots.push(root)
  const calls = path.join(root, "calls")
  writeFileSync(path.join(root, "npm"), `#!/bin/sh\nprintf '["${ACPX_MIN_VERSION}","0.21.0","0.21.1"]\\n'\n`)
  writeFileSync(path.join(root, "bun"), '#!/bin/sh\nprintf "%s\\n" "$ACPX_VERSION" >> "$CONTRACT_CALLS"\n[ "$ACPX_VERSION" != "$FAIL_ACPX_VERSION" ]\n')
  chmodSync(path.join(root, "npm"), 0o755)
  chmodSync(path.join(root, "bun"), 0o755)
  const run = spawnSync(process.execPath, [path.resolve("scripts/test-acpx-contract.ts")], {
    encoding: "utf8",
    env: {
      PATH: `${root}:${process.env.PATH}`,
      HOME: root,
      TMPDIR: root,
      CONTRACT_CALLS: calls,
      ACPX_MAX_VERSION: "0.21.0",
      FAIL_ACPX_VERSION: fail ? "0.21.0" : "",
    },
  })
  expect(readFileSync(calls, "utf8").trim().split("\n")).toEqual([ACPX_MIN_VERSION, "0.21.0"])
  expect(run.status).toBe(fail ? 1 : 0)
})
