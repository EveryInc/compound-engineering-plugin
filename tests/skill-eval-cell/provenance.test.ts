import { expect, test } from "bun:test"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fingerprint, valueHash, prepareOutput, containedPath, writeJSON, graderFingerprint, GRADER_FILES } from "./provenance"

function inTemp(work: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-provenance-test-"))
  try { work(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test("JSON object order is stable; array order is significant", () => {
  expect(valueHash({ b: 2, a: [1, 2] })).toBe(valueHash({ a: [1, 2], b: 2 }))
  expect(valueHash([1, 2])).not.toBe(valueHash([2, 1]))
})

test("fingerprint does not depend on absolute root or creation order", () => inTemp((dir) => {
  const a = path.join(dir, "a"), b = path.join(dir, "b")
  fs.mkdirSync(a); fs.mkdirSync(b)
  fs.writeFileSync(path.join(a, "two"), "2"); fs.writeFileSync(path.join(a, "one"), "1")
  fs.writeFileSync(path.join(b, "one"), "1"); fs.writeFileSync(path.join(b, "two"), "2")
  expect(fingerprint(a).sha256).toBe(fingerprint(b).sha256)
}))

test("byte edits, renames and empty directory changes change the fingerprint", () => inTemp((dir) => {
  const f = path.join(dir, "data")
  fs.writeFileSync(f, "a"); const a = fingerprint(dir).sha256
  fs.writeFileSync(f, "b"); const b = fingerprint(dir).sha256
  fs.renameSync(f, path.join(dir, "other")); const c = fingerprint(dir).sha256
  fs.mkdirSync(path.join(dir, "empty")); const d = fingerprint(dir).sha256
  expect(new Set([a, b, c, d]).size).toBe(4)
}))

test("mtime changes do not change fingerprints", () => inTemp((dir) => {
  const f = path.join(dir, "data")
  fs.writeFileSync(f, "same"); const before = fingerprint(dir).sha256
  fs.utimesSync(f, 1000, 1000)
  expect(fingerprint(dir).sha256).toBe(before)
}))

test("git internals are explicitly excluded", () => inTemp((dir) => {
  fs.mkdirSync(path.join(dir, ".git")); const before = fingerprint(dir).sha256
  fs.writeFileSync(path.join(dir, ".git", "config"), "private remote")
  expect(fingerprint(dir).sha256).toBe(before)
}))

test("missing selected fingerprint roots fail closed", () => inTemp((dir) => {
  expect(() => fingerprint(dir, ["missing"])).toThrow()
}))

test("reserved output cannot be reused", () => inTemp((dir) => {
  const out = path.join(dir, "out")
  expect(prepareOutput(out)).toBe(out)
  expect(() => prepareOutput(out)).toThrow(/empty/)
}))

test("nonempty outputs keep their original bytes", () => inTemp((dir) => {
  fs.writeFileSync(path.join(dir, "result"), "keep")
  expect(() => prepareOutput(dir)).toThrow(/empty/)
  expect(fs.readFileSync(path.join(dir, "result"), "utf8")).toBe("keep")
}))

test("exclusive reports refuse overwrites", () => inTemp((dir) => {
  const file = path.join(dir, "report.json")
  writeJSON(file, { original: true }, true)
  expect(() => writeJSON(file, { original: false }, true)).toThrow()
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ original: true })
}))

test("collector snapshots replace only their owned destination with valid JSON", () => inTemp((dir) => {
  const file = path.join(dir, "pack.json")
  writeJSON(file, { stage: 1 }); writeJSON(file, { stage: 2 })
  expect(JSON.parse(fs.readFileSync(file, "utf8"))).toEqual({ stage: 2 })
  expect(fs.readdirSync(dir)).toEqual(["pack.json"])
}))

test("relative paths cannot escape the pack", () => inTemp((dir) => {
  for (const rel of ["", "..", "../x", "/etc/passwd", "C:\\temp", "a/../../b", "a//b"]) {
    expect(() => containedPath(dir, rel)).toThrow()
  }
  fs.mkdirSync(path.join(dir, "inside"))
  expect(containedPath(dir, "inside")).toBe(path.join(fs.realpathSync(dir), "inside"))
}))

test("grader fingerprint changes when a dependency changes", () => inTemp((dir) => {
  for (const name of GRADER_FILES) fs.writeFileSync(path.join(dir, name), "old")
  const before = graderFingerprint(dir).sha256
  fs.writeFileSync(path.join(dir, "hosts.ts"), "new")
  expect(graderFingerprint(dir).sha256).not.toBe(before)
}))

if (process.platform !== "win32") {
  test("symlink targets are not followed and symlink paths are refused", () => inTemp((dir) => {
    const outside = path.join(dir, "outside"), root = path.join(dir, "root")
    fs.mkdirSync(outside); fs.mkdirSync(root)
    fs.writeFileSync(path.join(outside, "secret"), "first")
    fs.symlinkSync(outside, path.join(root, "link"))
    const before = fingerprint(root)
    fs.writeFileSync(path.join(outside, "secret"), "second")
    expect(fingerprint(root).sha256).toBe(before.sha256)
    expect(before.entries.length).toBe(1)
    expect(() => containedPath(root, "link/secret")).toThrow(/symlink/)
    expect(() => prepareOutput(path.join(root, "link"))).toThrow()
  }))
  test("executable-bit changes affect fingerprints", () => inTemp((dir) => {
    const file = path.join(dir, "script")
    fs.writeFileSync(file, "echo hello", { mode: 0o644 })
    const before = fingerprint(dir).sha256
    fs.chmodSync(file, 0o755)
    expect(fingerprint(dir).sha256).not.toBe(before)
  }))
}
