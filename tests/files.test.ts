import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import os from "os"
import path from "path"
import {
  assertSafePathComponent,
  backupFile,
  captureManagedPathSnapshot,
  removeFileIfExists,
  removeManagedPathIfExists,
  restoreManagedPathSnapshot,
  writeFileAtomicIfChanged,
} from "../src/utils/files"

describe("managed file mutations", () => {
  test("rejects unsafe path components before path joins", () => {
    expect(() => assertSafePathComponent("prompt-one", "prompt name")).not.toThrow()
    expect(() => assertSafePathComponent("../escape", "prompt name")).toThrow("Unsafe prompt name")
    expect(() => assertSafePathComponent("nested/path", "prompt name")).toThrow("Unsafe prompt name")
  })

  test("rejects binary writes through symlinked ancestor directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "files-write-ancestor-symlink-"))
    const externalRoot = path.join(tempRoot, "external")
    const managedRoot = path.join(tempRoot, "managed")
    const symlinkedDir = path.join(managedRoot, "compound-engineering")
    const targetPath = path.join(symlinkedDir, "mcporter.json")

    await fs.mkdir(externalRoot, { recursive: true })
    await fs.mkdir(managedRoot, { recursive: true })
    await fs.symlink(externalRoot, symlinkedDir)

    await expect(writeFileAtomicIfChanged({
      filePath: targetPath,
      content: Buffer.from("hello\n"),
    })).rejects.toThrow("symlinked ancestor")

    await expect(fs.access(path.join(externalRoot, "mcporter.json"))).rejects.toBeDefined()
  })

  test("rejects managed deletes through symlinked ancestor directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "files-delete-ancestor-symlink-"))
    const externalRoot = path.join(tempRoot, "external")
    const managedRoot = path.join(tempRoot, "managed")
    const symlinkedDir = path.join(managedRoot, "compound-engineering")
    const targetPath = path.join(symlinkedDir, "mcporter.json")

    await fs.mkdir(externalRoot, { recursive: true })
    await fs.mkdir(managedRoot, { recursive: true })
    await fs.writeFile(path.join(externalRoot, "mcporter.json"), "external\n")
    await fs.symlink(externalRoot, symlinkedDir)

    await expect(removeManagedPathIfExists(targetPath)).rejects.toThrow("symlinked ancestor")

    expect(await fs.readFile(path.join(externalRoot, "mcporter.json"), "utf8")).toBe("external\n")
  })

  test("rejects plain file deletes through symlinked ancestor directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "files-plain-delete-ancestor-symlink-"))
    const externalRoot = path.join(tempRoot, "external")
    const managedRoot = path.join(tempRoot, "managed")
    const symlinkedDir = path.join(managedRoot, "compound-engineering")
    const targetPath = path.join(symlinkedDir, "mcporter.json")

    await fs.mkdir(externalRoot, { recursive: true })
    await fs.mkdir(managedRoot, { recursive: true })
    await fs.writeFile(path.join(externalRoot, "mcporter.json"), "external\n")
    await fs.symlink(externalRoot, symlinkedDir)

    await expect(removeFileIfExists(targetPath)).rejects.toThrow("symlinked ancestor")

    expect(await fs.readFile(path.join(externalRoot, "mcporter.json"), "utf8")).toBe("external\n")
  })

  test("preserves source permissions when creating backups", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "files-backup-perms-"))
    const sourcePath = path.join(tempRoot, "mcporter.json")

    await fs.writeFile(sourcePath, "{}\n", { mode: 0o600 })
    await fs.chmod(sourcePath, 0o600)

    const backupPath = await backupFile(sourcePath)
    expect(backupPath).toBeDefined()

    const stats = await fs.stat(backupPath!)
    expect(stats.mode & 0o777).toBe(0o600)
  })

  test("rejects snapshot restore through symlinked ancestor directories", async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "files-restore-ancestor-symlink-"))
    const managedRoot = path.join(tempRoot, "managed")
    const safeParent = path.join(managedRoot, "prompts")
    const targetPath = path.join(safeParent, "plan-review.md")
    const snapshotRoot = path.join(tempRoot, "snapshots")
    const externalRoot = path.join(tempRoot, "external")

    await fs.mkdir(safeParent, { recursive: true })
    await fs.mkdir(snapshotRoot, { recursive: true })
    await fs.mkdir(externalRoot, { recursive: true })
    await fs.writeFile(targetPath, "original\n")

    const snapshot = await captureManagedPathSnapshot(targetPath, snapshotRoot)

    await fs.rename(safeParent, `${safeParent}-bak`)
    await fs.symlink(externalRoot, safeParent)

    await expect(restoreManagedPathSnapshot(snapshot)).rejects.toThrow("symlinked ancestor")

    await expect(fs.access(path.join(externalRoot, "plan-review.md"))).rejects.toBeDefined()
  })
})
