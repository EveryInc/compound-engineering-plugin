import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "child_process"
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "fs"
import os from "os"
import path from "path"

const script = path.join(import.meta.dir, "..", "..", "skills", "ce-compound", "scripts", "prepare-worktree.py")
const skillDir = path.join(import.meta.dir, "..", "..", "skills", "ce-compound")
const python = ["python3", "python", "py"].find((candidate) => spawnSync(candidate, ["-c", "import sys; sys.exit(sys.version_info < (3, 9))"], { encoding: "utf8" }).status === 0)
const fixtures: string[] = []

function command(cwd: string, executable: string, args: string[]) {
  const result = spawnSync(executable, args, { cwd, encoding: "utf8" })
  return { status: result.status, stdout: result.stdout, stderr: result.stderr }
}

function git(cwd: string, ...args: string[]) {
  const result = command(cwd, "git", args)
  if (result.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${result.stderr}`)
  return result.stdout.trim()
}

function fixture() {
  const parent = mkdtempSync(path.join(os.tmpdir(), "ce-compound-worktree-test-"))
  fixtures.push(parent)
  const repo = path.join(parent, "source")
  git(parent, "init", "-b", "main", repo)
  writeFileSync(path.join(repo, "fix.txt"), "verified fix\n")
  git(repo, "add", "fix.txt")
  git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "fix")
  return repo
}

function prepare(cwd: string, ...args: string[]) {
  if (!python) throw new Error("Python 3 is required for ce-compound worktree tests")
  const result = command(cwd, python, [script, "prepare", ...args])
  const data = result.status === 0 ? JSON.parse(result.stdout) : null
  return { ...result, data }
}

afterEach(() => {
  for (const dir of fixtures.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("ce-compound worktree preflight", () => {
  test("isolates a clean primary default checkout without writing to it", () => {
    const repo = fixture()
    const before = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
    const result = prepare(repo, "--ticket", "RM-1520")

    expect(result.status).toBe(0)
    expect(result.data.worktree).not.toBe(repo)
    expect(result.data.reused).toBe(false)
    expect(git(result.data.worktree, "branch", "--show-current")).toStartWith("ce-compound/")
    expect(git(repo, "branch", "--show-current")).toBe("main")
    expect(git(repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe(before)
  })

  test("isolates a protected branch in an unowned linked worktree", () => {
    const repo = fixture()
    const linked = path.join(path.dirname(repo), "linked")
    git(repo, "worktree", "add", "-b", "develop", linked, "HEAD")
    const result = prepare(linked, "--ticket", "RM-1520")

    expect(result.status).toBe(0)
    expect(result.data.worktree).not.toBe(linked)
    expect(git(linked, "branch", "--show-current")).toBe("develop")
  })

  test("leaves staged, unstaged, and untracked source changes byte-for-byte intact", () => {
    const repo = fixture()
    writeFileSync(path.join(repo, "fix.txt"), "staged content\n")
    git(repo, "add", "fix.txt")
    writeFileSync(path.join(repo, "fix.txt"), "unstaged content\n")
    writeFileSync(path.join(repo, "other.txt"), "user file\n")
    const before = git(repo, "status", "--porcelain=v1", "--untracked-files=all")
    const stagedBefore = git(repo, "show", ":fix.txt")
    const result = prepare(repo, "--ticket", "RM-1520")

    expect(result.status).toBe(0)
    expect(git(repo, "status", "--porcelain=v1", "--untracked-files=all")).toBe(before)
    expect(git(repo, "show", ":fix.txt")).toBe(stagedBefore)
    expect(readFileSync(path.join(repo, "fix.txt"), "utf8")).toBe("unstaged content\n")
    expect(readFileSync(path.join(repo, "other.txt"), "utf8")).toBe("user file\n")
    expect(readFileSync(path.join(result.data.worktree, "fix.txt"), "utf8")).toBe("verified fix\n")
    expect(result.data.source_dirty).toBe(true)
  })

  test("reuses the same owned worktree, including ticketless invocation from it", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    const second = prepare(repo, "--ticket", "RM-1520")
    expect(second.status).toBe(0)
    expect(second.data.worktree).toBe(first.data.worktree)
    expect(second.data.reused).toBe(true)
    git(first.data.worktree, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "later")
    const fromOwned = prepare(first.data.worktree)
    expect(fromOwned.status).toBe(0)
    expect(fromOwned.data.worktree).toBe(first.data.worktree)
    expect(fromOwned.data.reused).toBe(true)
  })

  test("does not reuse a ticket's worktree from another source checkout", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    const secondSource = path.join(path.dirname(repo), "other-source")
    git(repo, "worktree", "add", "-b", "other-fix", secondSource, "HEAD")
    const blocked = prepare(secondSource, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("bound to another source checkout")
    expect(readFileSync(path.join(first.data.worktree, "fix.txt"), "utf8")).toBe("verified fix\n")
  })

  test("resumes a recorded partial output and rejects unrelated dirt", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    const owned = first.data.worktree
    const allowance = command(owned, python!, [script, "allow-write", "--path", "docs/solutions/workflow/lesson.md"])
    expect(allowance.status).toBe(0)
    const target = path.join(owned, "docs", "solutions", "workflow", "lesson.md")
    const draft = path.join(path.dirname(repo), "draft.md")
    writeFileSync(draft, "partial learning\n")
    const written = command(owned, python!, [script, "commit-write", "--path", "docs/solutions/workflow/lesson.md", "--input", draft])
    expect(written.status).toBe(0)
    const repeated = command(owned, python!, [script, "commit-write", "--path", "docs/solutions/workflow/lesson.md", "--input", draft])
    expect(repeated.status).toBe(0)
    expect(JSON.parse(repeated.stdout).already_written).toBe(true)
    const resumed = prepare(repo, "--ticket", "RM-1520")
    expect(resumed.status).toBe(0)
    expect(resumed.data.worktree).toBe(owned)
    expect(resumed.data.partial_outputs).toContain("docs/solutions/workflow/lesson.md")

    writeFileSync(path.join(owned, "stranger.txt"), "unrelated\n")
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("unrelated")
    expect(readFileSync(path.join(owned, "stranger.txt"), "utf8")).toBe("unrelated\n")
  })

  test("rejects ownership mismatch without cleanup", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    const manifest = first.data.manifest
    const original = readFileSync(manifest, "utf8")
    const changed = JSON.parse(original)
    changed.task = "other-ticket"
    writeFileSync(manifest, JSON.stringify(changed))
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("ownership")
    expect(readFileSync(path.join(first.data.worktree, "fix.txt"), "utf8")).toBe("verified fix\n")
  })

  test("rejects an owned worktree switched to a different branch", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    git(first.data.worktree, "switch", "-c", "another-task")
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("wrong branch")
    expect(git(first.data.worktree, "branch", "--show-current")).toBe("another-task")
  })

  test("rejects a task branch registered in another worktree", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    const moved = path.join(path.dirname(repo), "moved-owned")
    git(repo, "worktree", "move", first.data.worktree, moved)
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("occupied")
    expect(git(moved, "branch", "--show-current")).toBe(first.data.branch)
  })

  test("rejects a worktree path collision without deleting it", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    git(repo, "worktree", "remove", first.data.worktree)
    mkdirSync(first.data.worktree, { recursive: true })
    writeFileSync(path.join(first.data.worktree, "user.txt"), "occupied\n")
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("occupied")
    expect(readFileSync(path.join(first.data.worktree, "user.txt"), "utf8")).toBe("occupied\n")
  })

  test("rejects a dangling symlink at the planned worktree path", () => {
    if (process.platform === "win32") return // Creating symlinks requires host-specific privileges.
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    git(repo, "worktree", "remove", first.data.worktree)
    symlinkSync(path.join(path.dirname(repo), "missing-target"), first.data.worktree)
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("occupied")
  })

  test("rejects a worktree parent writable by other users", () => {
    if (process.platform === "win32") return
    const repo = fixture()
    const parent = path.join(path.dirname(repo), ".ce-compound-worktrees")
    mkdirSync(parent)
    chmodSync(parent, 0o777)
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("not private to this user")
    expect(git(repo, "branch", "--show-current")).toBe("main")
  })

  test("resumes preparation from the recorded intent after an interrupted add", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    git(repo, "worktree", "remove", first.data.worktree)
    git(repo, "branch", "-D", first.data.branch)
    const resumed = prepare(repo, "--ticket", "RM-1520")
    expect(resumed.status).toBe(0)
    expect(resumed.data.worktree).toBe(first.data.worktree)
    expect(git(resumed.data.worktree, "branch", "--show-current")).toBe(first.data.branch)
  })

  test("will not attach an existing branch without its ownership record", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    expect(first.status).toBe(0)
    git(repo, "worktree", "remove", first.data.worktree)
    rmSync(first.data.manifest)
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("without prior ownership")
    expect(git(repo, "show-ref", "--verify", `refs/heads/${first.data.branch}`)).not.toBe("")
    const retry = prepare(repo, "--ticket", "RM-1520")
    expect(retry.status).not.toBe(0)
    expect(retry.stderr).toContain("without prior ownership")
  })

  test("refuses a write path outside the prepared worktree", () => {
    const repo = fixture()
    const prepared = prepare(repo, "--ticket", "RM-1520")
    expect(prepared.status).toBe(0)
    const blocked = command(prepared.data.worktree, python!, [script, "allow-write", "--path", "../outside.md"])
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("inside the prepared worktree")
    expect(git(prepared.data.worktree, "status", "--porcelain=v1", "--untracked-files=all")).toBe("")
  })

  test("reports dirty original source when preparation resumes inside the owned tree", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    writeFileSync(path.join(repo, "fix.txt"), "uncommitted source fix\n")
    const resumed = prepare(first.data.worktree)
    expect(resumed.status).toBe(0)
    expect(resumed.data.source_root).toBe(repo)
    expect(resumed.data.source_dirty).toBe(true)
    expect(resumed.data.partial_outputs).toEqual([])
  })

  test("blocks reuse when the source commits a fix absent from the owned branch", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    writeFileSync(path.join(repo, "fix.txt"), "new committed fix\n")
    git(repo, "add", "fix.txt")
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "later fix")
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("does not contain the source checkout's current commit")
    expect(readFileSync(path.join(first.data.worktree, "fix.txt"), "utf8")).toBe("verified fix\n")
  })

  test("records expected output bytes and rejects later edits to that path", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    const owned = first.data.worktree
    const target = "docs/solutions/workflow/lesson.md"
    const draft = path.join(path.dirname(repo), "draft.md")
    writeFileSync(draft, "owned lesson\n")
    expect(command(owned, python!, [script, "allow-write", "--path", target]).status).toBe(0)
    expect(command(owned, python!, [script, "commit-write", "--path", target, "--input", draft]).status).toBe(0)
    expect(prepare(repo, "--ticket", "RM-1520").status).toBe(0)
    writeFileSync(path.join(owned, target), "later user edit\n")
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("changed outside its intended write")
    expect(readFileSync(path.join(owned, target), "utf8")).toBe("later user edit\n")
  })

  test("updates an existing tracked output without changing the original checkout", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    const draft = path.join(path.dirname(repo), "draft.md")
    writeFileSync(draft, "revised learning\n")
    expect(command(first.data.worktree, python!, [script, "allow-write", "--path", "fix.txt"]).status).toBe(0)
    expect(command(first.data.worktree, python!, [script, "commit-write", "--path", "fix.txt", "--input", draft]).status).toBe(0)
    expect(readFileSync(path.join(first.data.worktree, "fix.txt"), "utf8")).toBe("revised learning\n")
    expect(readFileSync(path.join(repo, "fix.txt"), "utf8")).toBe("verified fix\n")
    expect(prepare(repo, "--ticket", "RM-1520").data.partial_outputs).toContain("fix.txt")
  })

  test("rejects staged index changes to a recorded output", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    const owned = first.data.worktree
    expect(command(owned, python!, [script, "allow-write", "--path", "fix.txt"]).status).toBe(0)
    writeFileSync(path.join(owned, "fix.txt"), "staged user change\n")
    git(owned, "add", "fix.txt")
    writeFileSync(path.join(owned, "fix.txt"), "verified fix\n")
    const blocked = prepare(repo, "--ticket", "RM-1520")
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("staged index changes")
    expect(git(owned, "show", ":fix.txt")).toBe("staged user change")
  })

  test("resumes an interrupted atomic output write without accepting other files", () => {
    const repo = fixture()
    const first = prepare(repo, "--ticket", "RM-1520")
    const owned = first.data.worktree
    const target = "docs/solutions/workflow/lesson.md"
    const draft = path.join(path.dirname(repo), "draft.md")
    writeFileSync(draft, "completed lesson\n")
    expect(command(owned, python!, [script, "allow-write", "--path", target]).status).toBe(0)
    const manifest = JSON.parse(readFileSync(first.data.manifest, "utf8"))
    const temp = path.join(owned, manifest.write_intents[target].temp)
    mkdirSync(path.dirname(temp), { recursive: true })
    writeFileSync(temp, "interrupted bytes")
    const resumed = prepare(repo, "--ticket", "RM-1520")
    expect(resumed.status).toBe(0)
    expect(resumed.data.pending_writes).toContain(target)
    expect(command(owned, python!, [script, "allow-write", "--path", target]).status).toBe(0)
    expect(command(owned, python!, [script, "commit-write", "--path", target, "--input", draft]).status).toBe(0)
    expect(readFileSync(path.join(owned, target), "utf8")).toBe("completed lesson\n")
    expect(prepare(repo, "--ticket", "RM-1520").status).toBe(0)
  })

  test("rejects an unowned ignored file at the proposed output path", () => {
    const repo = fixture()
    writeFileSync(path.join(repo, ".gitignore"), "private.md\n")
    git(repo, "add", ".gitignore")
    git(repo, "-c", "user.name=Test", "-c", "user.email=test@example.com", "-c", "commit.gpgsign=false", "commit", "-m", "ignore")
    const first = prepare(repo, "--ticket", "RM-1520")
    writeFileSync(path.join(first.data.worktree, "private.md"), "private user content\n")
    const blocked = command(first.data.worktree, python!, [script, "allow-write", "--path", "private.md"])
    expect(blocked.status).not.toBe(0)
    expect(blocked.stderr).toContain("ignored or unowned")
    expect(readFileSync(path.join(first.data.worktree, "private.md"), "utf8")).toBe("private user content\n")
  })
})

describe("ce-compound skill write boundary", () => {
  test("preflight runs before artifact-root creation and both writing modes register outputs", () => {
    const skill = readFileSync(path.join(skillDir, "SKILL.md"), "utf8")
    const preflight = readFileSync(path.join(skillDir, "references", "worktree-preflight.md"), "utf8")
    const assembly = readFileSync(path.join(skillDir, "references", "assembly.md"), "utf8")
    const lightweight = readFileSync(path.join(skillDir, "references", "lightweight.md"), "utf8")
    const research = readFileSync(path.join(skillDir, "references", "research.md"), "utf8")
    const refresh = readFileSync(path.join(skillDir, "references", "refresh-and-discoverability.md"), "utf8")
    const sessionHistory = readFileSync(path.join(skillDir, "references", "session-history.md"), "utf8")
    expect(skill.indexOf("## Worktree preflight")).toBeGreaterThan(skill.indexOf("## Mode Detection"))
    expect(skill.indexOf("## Worktree preflight")).toBeLessThan(skill.indexOf("## Artifact Root"))
    expect(skill).toContain("Documentation skipped")
    expect(skill).toContain("references/worktree-preflight.md")
    expect(preflight).toContain("allow-write --path")
    expect(preflight).toContain("commit-write --path")
    expect(preflight).toContain("Documentation skipped")
    expect(assembly).toContain("`allow-write` operation")
    expect(assembly).toContain("`commit-write` operation")
    expect(lightweight).toContain("`allow-write` operation")
    expect(lightweight).toContain("`commit-write` operation")
    expect(research).toContain("preflight's absolute `worktree` into every Phase 1 subagent prompt")
    expect(research).toContain("working directory set to the preflight's `worktree`")
    expect(refresh).toContain("do not invoke it automatically from this isolated capture")
    expect(sessionHistory).toContain("use `source_root` as the session-history repo filter")
  })
})
