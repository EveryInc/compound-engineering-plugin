import { test } from "bun:test"
import assert from "node:assert/strict"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fingerprint, valueHash, prepareOutput, containedPath, writeJSON, graderFingerprint } from "./provenance"

function inTemp(work: (dir: string) => void) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ce-provenance-test-"))
  try { work(dir) } finally { fs.rmSync(dir, { recursive: true, force: true }) }
}

test("JSON object order is stable; array order is significant", () => {
  assert.equal(valueHash({ b: 2, a: [1, 2] }), valueHash({ a: [1, 2], b: 2 }))
  assert.notEqual(valueHash([1, 2]), valueHash([2, 1]))
})

test("fingerprint does not depend on absolute root or creation order", () => inTemp((dir) => {
  const a = path.join(dir, "a"), b = path.join(dir, "b")
  fs.mkdirSync(a); fs.mkdirSync(b)
  fs.writeFileSync(path.join(a, "two"), "2"); fs.writeFileSync(path.join(a, "one"), "1")
  fs.writeFileSync(path.join(b, "one"), "1"); fs.writeFileSync(path.join(b, "two"), "2")
  assert.equal(fingerprint(a).sha256, fingerprint(b).sha256)
}))

test("byte edits, renames and empty directory changes change the fingerprint", () => inTemp((dir) => {
  const f = path.join(dir, "data")
  fs.writeFileSync(f, "a"); const a = fingerprint(dir).sha256
  fs.writeFileSync(f, "b"); const b = fingerprint(dir).sha256
  fs.renameSync(f, path.join(dir, "other")); const c = fingerprint(dir).sha256
  fs.mkdirSync(path.join(dir, "empty")); const d = fingerprint(dir).sha256
  assert.equal(new Set([a, b, c, d]).size, 4)
}))

test("mtime changes do not change fingerprints", () => inTemp((dir) => {
  const f = path.join(dir, "data")
  fs.writeFileSync(f, "same"); const before = fingerprint(dir).sha256
  fs.utimesSync(f, 1000, 1000)
  assert.equal(fingerprint(dir).sha256, before)
}))

test("git internals are explicitly excluded", () => inTemp((dir) => {
  fs.mkdirSync(path.join(dir, ".git")); const before = fingerprint(dir).sha256
  fs.writeFileSync(path.join(dir, ".git", "config"), "private remote")
  assert.equal(fingerprint(dir).sha256, before)
}))

test("missing selected fingerprint roots fail closed", () => inTemp((dir) => {
  assert.throws(() => fingerprint(dir, ["missing"]))
}))

test("reserved output cannot be reused", () => inTemp((dir) => {
  const out = path.join(dir, "out")
  assert.equal(prepareOutput(out), out)
  assert.throws(() => prepareOutput(out), /empty/)
}))

test("nonempty outputs keep their original bytes", () => inTemp((dir) => {
  fs.writeFileSync(path.join(dir, "result"), "keep")
  assert.throws(() => prepareOutput(dir), /empty/)
  assert.equal(fs.readFileSync(path.join(dir, "result"), "utf8"), "keep")
}))

test("exclusive reports refuse overwrites", () => inTemp((dir) => {
  const file = path.join(dir, "report.json")
  writeJSON(file, { original: true }, true)
  assert.throws(() => writeJSON(file, { original: false }, true))
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { original: true })
}))

test("collector snapshots replace only their owned destination with valid JSON", () => inTemp((dir) => {
  const file = path.join(dir, "pack.json")
  writeJSON(file, { stage: 1 }); writeJSON(file, { stage: 2 })
  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), { stage: 2 })
  assert.deepEqual(fs.readdirSync(dir), ["pack.json"])
}))

test("relative paths cannot escape the pack", () => inTemp((dir) => {
  for (const rel of ["", "..", "../x", "/etc/passwd", "C:\\temp", "a/../../b", "a//b"]) {
    assert.throws(() => containedPath(dir, rel))
  }
  fs.mkdirSync(path.join(dir, "inside"))
  assert.equal(containedPath(dir, "inside"), path.join(fs.realpathSync(dir), "inside"))
}))

test("grader fingerprint changes when a dependency changes", () => inTemp((dir) => {
  for (const name of ["grade.ts", "hosts.ts", "path-shim.ts"]) fs.writeFileSync(path.join(dir, name), "old")
  const before = graderFingerprint(dir).sha256
  fs.writeFileSync(path.join(dir, "hosts.ts"), "new")
  assert.notEqual(graderFingerprint(dir).sha256, before)
}))

if (process.platform !== "win32") {
  test("symlink targets are not followed and symlink paths are refused", () => inTemp((dir) => {
    const outside = path.join(dir, "outside"), root = path.join(dir, "root")
    fs.mkdirSync(outside); fs.mkdirSync(root)
    fs.writeFileSync(path.join(outside, "secret"), "first")
    fs.symlinkSync(outside, path.join(root, "link"))
    const before = fingerprint(root)
    fs.writeFileSync(path.join(outside, "secret"), "second")
    assert.equal(fingerprint(root).sha256, before.sha256)
    assert.equal(before.entries.length, 1)
    assert.throws(() => containedPath(root, "link/secret"), /symlink/)
    assert.throws(() => prepareOutput(path.join(root, "link")))
  }))
  test("executable-bit changes affect fingerprints", () => inTemp((dir) => {
    const file = path.join(dir, "script")
    fs.writeFileSync(file, "echo hello", { mode: 0o644 })
    const before = fingerprint(dir).sha256
    fs.chmodSync(file, 0o755)
    assert.notEqual(fingerprint(dir).sha256, before)
  }))
}
