import { afterEach, beforeEach, describe, expect, spyOn, test } from "bun:test"
import fs from "fs/promises"
import os from "os"
import path from "path"
import { cleanupCurrentManagedFile } from "../src/targets/managed-artifacts"

describe("cleanupCurrentManagedFile", () => {
  let root: string
  let store: string
  let warn: ReturnType<typeof spyOn>

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), "managed-file-guard-"))
    store = path.join(root, "store")
    await fs.mkdir(store)
    warn = spyOn(console, "warn").mockImplementation(() => {})
  })

  afterEach(async () => {
    warn.mockRestore()
    await fs.rm(root, { recursive: true, force: true })
  })

  const warned = () => warn.mock.calls.map((call: unknown[]) => String(call[0]))

  test("does not preserve a missing target", async () => {
    expect(await cleanupCurrentManagedFile(path.join(store, "a.md"), [], "a.md")).toBe(false)
    expect(warned()).toEqual([])
  })

  test("preserves a symlinked target and leaves its link target alone", async () => {
    const userFile = path.join(root, "mine.md")
    await fs.writeFile(userFile, "user content")
    const target = path.join(store, "a.md")
    await fs.symlink(userFile, target)

    expect(await cleanupCurrentManagedFile(target, ["a.md"], "a.md", { unlinkOwned: true })).toBe(true)
    expect(warned()[0]).toContain("existing user-managed symlink")
    expect(await fs.readlink(target)).toBe(userFile)
    expect(await fs.readFile(userFile, "utf8")).toBe("user content")
  })

  test("does not preserve an existing file when ownership is not tracked, and keeps it", async () => {
    const target = path.join(store, "a.md")
    await fs.writeFile(target, "old")

    expect(await cleanupCurrentManagedFile(target, null, "a.md", { unlinkOwned: true })).toBe(false)
    expect(await fs.readFile(target, "utf8")).toBe("old")
  })

  test("preserves a file missing from the owned list", async () => {
    const target = path.join(store, "a.md")
    await fs.writeFile(target, "user content")

    expect(await cleanupCurrentManagedFile(target, ["other.md"], "a.md", { unlinkOwned: true })).toBe(true)
    expect(warned()[0]).toContain("existing unmanaged file")
    expect(await fs.readFile(target, "utf8")).toBe("user content")
  })

  test("leaves an owned file in place when unlinking is off", async () => {
    const target = path.join(store, "a.md")
    await fs.writeFile(target, "old")

    expect(await cleanupCurrentManagedFile(target, ["a.md"], "a.md")).toBe(false)
    expect(await fs.readFile(target, "utf8")).toBe("old")
  })

  test("unlinks an owned file so a hardlink elsewhere keeps its content", async () => {
    const target = path.join(store, "a.md")
    await fs.writeFile(target, "old")
    const hardlink = path.join(root, "linked.md")
    await fs.link(target, hardlink)

    expect(await cleanupCurrentManagedFile(target, ["a.md"], "a.md", { unlinkOwned: true })).toBe(false)
    expect(await fs.stat(target).catch(() => null)).toBeNull()
    await fs.writeFile(target, "new")
    expect(await fs.readFile(hardlink, "utf8")).toBe("old")
  })

  test("preserves a target reached through a subdirectory that escapes the store", async () => {
    const outside = path.join(root, "outside")
    await fs.mkdir(outside)
    await fs.symlink(outside, path.join(store, "nested"))
    const target = path.join(store, "nested", "a.md")

    expect(await cleanupCurrentManagedFile(target, ["nested/a.md"], "nested/a.md", { storeDir: store })).toBe(true)
    expect(warned()[0]).toContain("resolves outside the managed store")
  })
})
