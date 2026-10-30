import { existsSync, readFileSync } from "node:fs"
import path from "node:path"

export const TEST_GROUPS = {
  "cross-model": {
    inputs: ["skills/ce-work/", "skills/ce-code-review/", "skills/ce-doc-review/", "skills/ce-pov/"],
    tests: [
      "tests/skills/ce-work-cross-model-routes.test.ts",
      "tests/skills/ce-code-review-cross-model-routes.test.ts",
      "tests/skills/ce-doc-review-cross-model-routes.test.ts",
      "tests/skills/ce-pov-cross-model-routes.test.ts",
      "tests/skills/ce-work-cross-model-integration.test.ts",
      "tests/skills/peer-job-runner.test.ts",
    ],
  },
  workspace: {
    inputs: ["skills/ce-work/"],
    tests: [
      "tests/skills/ce-work-unit-workspace-fallback.test.ts",
      "tests/skills/ce-work-unit-workspace-init.test.ts",
      "tests/skills/ce-work-unit-workspace-retries.test.ts",
      "tests/skills/ce-work-unit-workspace-transport.test.ts",
      "tests/skills/ce-work-unit-workspace-verification.test.ts",
      "tests/skills/ce-work-unit-workspace-warm-checkout.test.ts",
    ],
  },
  babysit: { inputs: ["skills/ce-babysit-pr/"], tests: ["tests/ce-babysit-pr-snapshot.test.ts"] },
  setup: {
    inputs: ["skills/ce-setup/", "skills/ce-polish/", "docs/guides/", "README.md", ".compound-engineering/config.example.yaml"],
    tests: ["tests/skills/ce-setup-check-health.test.ts"],
  },
  prototype: { inputs: ["skills/ce-prototype/"], tests: ["tests/skills/ce-prototype-server.test.ts"] },
}

type Group = keyof typeof TEST_GROUPS
export type TestSelection = { mode: "full" | "selected"; reason: string; groups: Group[]; files: string[]; total: number }
const testName = /(?:\.(?:test|spec)|_(?:test|spec))\.[cm]?[jt]sx?$/

export function discoverTests(cwd = process.cwd()): string[] {
  const configPath = path.join(cwd, "bunfig.toml")
  const config = existsSync(configPath) ? Bun.TOML.parse(readFileSync(configPath, "utf8")) as { test?: { root?: unknown; pathIgnorePatterns?: unknown } } : {}
  if (config.test?.root !== undefined) throw new Error("custom test root requires full discovery")
  const patterns = config.test?.pathIgnorePatterns ?? []
  if (!Array.isArray(patterns) || patterns.some((pattern) => typeof pattern !== "string")) throw new Error("invalid test exclusions")
  const ignored = patterns.map((pattern: string) => new Bun.Glob(pattern))
  return [...new Bun.Glob("**/*").scanSync({ cwd, dot: true, onlyFiles: true })]
    .filter((file) => !file.split("/").some((part) => part === "node_modules" || part === ".git") && testName.test(file) && !ignored.some((glob) => glob.match(file)))
    .sort()
}

export function selectTests(changed: readonly string[] | null, runnable: readonly string[]): TestSelection {
  const allGroups = Object.keys(TEST_GROUPS) as Group[]
  const full = (reason: string): TestSelection => ({ mode: "full", reason, groups: allGroups, files: [...runnable].sort(), total: runnable.length })
  if (!changed?.length) return full("missing or empty change evidence")
  const selected = new Set<Group>()
  for (const file of changed) {
    if (file.split("/").some((part) => part === ".." || part === "." || part === "") || file.includes("\\")) return full("invalid changed path")
    // Helpers and fixtures can feed any group, including those nested under skills.
    if (file.startsWith("tests/") && /(?:^|\/)(?:helpers|fixtures)\//.test(file)) return full("shared test input")
    const owners = allGroups.filter((name) => {
      const group = TEST_GROUPS[name]
      return group.tests.includes(file) || group.inputs.some((input) => input.endsWith("/") ? file.startsWith(input) : file === input)
    })
    if (owners.length) {
      owners.forEach((name) => selected.add(name))
    } else if (!(file.startsWith("src/") || file.startsWith("docs/") || /^skills\/.*\.md$/.test(file) ||
      (file.startsWith("tests/") && testName.test(file)) || ["CHANGELOG.md", "CONCEPTS.md"].includes(file))) {
      return full("unknown or shared input")
    }
  }
  const excluded = new Set(allGroups.filter((name) => !selected.has(name)).flatMap((name) => TEST_GROUPS[name].tests))
  return { mode: "selected", reason: "known inputs", groups: allGroups.filter((name) => selected.has(name)), files: runnable.filter((file) => !excluded.has(file)).sort(), total: runnable.length }
}
