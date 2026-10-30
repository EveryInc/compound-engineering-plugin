import { afterAll, expect, test } from "bun:test"
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { discoverTests, selectTests, TEST_GROUPS } from "../scripts/test-scope"

const roots: string[] = []
afterAll(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })))
const grouped = Object.values(TEST_GROUPS).flatMap((group) => group.tests)
const baseline = "tests/new.test.ts"
const runnable = [baseline, ...grouped]

test.each([
  ["src/converters/codex.ts", []], ["docs/plans/example.md", []], ["skills/ce-debug/SKILL.md", []],
  ["skills/ce-work/SKILL.md", ["cross-model", "workspace"]],
  ["skills/ce-code-review/references/schema.json", ["cross-model"]],
  ["skills/ce-babysit-pr/scripts/pr-snapshot", ["babysit"]],
  ["skills/ce-prototype/SKILL.md", ["prototype"]],
  ["docs/guides/ce-plan.md", ["setup"]], ["README.md", ["setup"]],
  [".compound-engineering/config.example.yaml", ["setup"]],
  ["skills/ce-polish/references/health.md", ["setup"]],
  ["tests/skills/peer-job-runner.test.ts", ["cross-model"]], [baseline, []],
] as [string, (keyof typeof TEST_GROUPS)[]][])("%s selects owned groups plus baseline", (file, groups) => {
  const result = selectTests([file], runnable)
  expect(result.mode).toBe("selected")
  expect(result.groups).toEqual(groups)
  expect(result.files).toContain(baseline)
  expect(result.files).toHaveLength(1 + groups.flatMap((name) => TEST_GROUPS[name as keyof typeof TEST_GROUPS].tests).length)
})

test.each(["tests/helpers/process.ts", "tests/fixtures/example.test.ts", "scripts/run-tests.ts", "package.json", "bunfig.toml", ".github/workflows/ci.yml", "skills/other/scripts/run.sh", "docs/../script.ts", "/docs/a.md", "unknown"])("%s retains full coverage", (file) => {
  expect(selectTests([file], runnable).mode).toBe("full")
})

test("unavailable and empty evidence is full", () => {
  expect(selectTests(null, runnable).mode).toBe("full")
  expect(selectTests([], runnable).mode).toBe("full")
})

test("both sides of an owner move select groups and deleted tests are not executed", () => {
  const result = selectTests(["skills/ce-babysit-pr/old.md", "skills/ce-prototype/new.md", "tests/skills/ce-prototype-server.test.ts"], [baseline, "tests/ce-babysit-pr-snapshot.test.ts"])
  expect(result.groups).toEqual(["babysit", "prototype"])
  expect(result.files).toEqual(["tests/ce-babysit-pr-snapshot.test.ts", baseline])
})

test("discovery includes new Bun test names and honors fixture exclusions", () => {
  const root = mkdtempSync(path.join(tmpdir(), "test-scope-"))
  roots.push(root)
  const files = [baseline, ...grouped, "tests/new_spec.ts", "tests/new_test.js", "tests/skill-eval-cell/fixtures/hidden.test.ts", "node_modules/vendor.test.ts"]
  for (const file of files) {
    mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
    writeFileSync(path.join(root, file), "")
  }
  writeFileSync(path.join(root, "bunfig.toml"), '[test]\npathIgnorePatterns = ["tests/skill-eval-cell/fixtures/**"]\n')
  const discovered = discoverTests(root)
  expect(discovered).toEqual([...runnable, "tests/new_spec.ts", "tests/new_test.js"].sort())
  const selected = selectTests(["src/index.ts"], discovered)
  expect(selected.files).toEqual([baseline, "tests/new_spec.ts", "tests/new_test.js"].sort())
  expect(new Set([...selected.files, ...grouped]).size).toBe(discovered.length)
})
