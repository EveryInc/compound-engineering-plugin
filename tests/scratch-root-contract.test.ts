import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { describe, expect, test } from "bun:test"

const SKILLS_ROOT = path.join(process.cwd(), "skills")

function contractFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name)
    if (entry.isDirectory()) return contractFiles(absolute)
    return entry.isFile() && /\.(md|py|sh)$/.test(entry.name) ? [absolute] : []
  })
}

const RUNTIME_FILES = contractFiles(SKILLS_ROOT)
const ROOT_ASSIGNMENT = 'SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)"'

describe("owner-scoped scratch root", () => {
  test("runtime assets use the uid-scoped root, not the legacy shared root", () => {
    const offenders = RUNTIME_FILES
      .filter((file) => readFileSync(file, "utf8").includes("/tmp/compound-engineering/"))
      .map((file) => path.relative(process.cwd(), file))
    expect(offenders).toEqual([])
    expect(RUNTIME_FILES.some((file) => readFileSync(file, "utf8").includes(ROOT_ASSIGNMENT))).toBe(true)
    const panel = readFileSync(
      path.join(SKILLS_ROOT, "ce-pov", "references/cross-model-panel.md"),
      "utf8",
    )
    expect(panel).toContain("caller passes this panel the resolved absolute `$SCRATCH_DIR`")
    expect(panel).toContain('chmod 600 "$PAYLOAD_PATH"')
  })

  test("per-run mktemp call sites do not use macOS forms that ignore TMPDIR", () => {
    const forbidden = [
      /\$\(\s*mktemp\s*\)/,
      /\$\(\s*mktemp\s+-d\s*\)/,
      /\$\(\s*mktemp(?:\s+-d)?\s+-t\b/,
    ]
    const offenders = RUNTIME_FILES.flatMap((file) =>
      readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          forbidden.some((pattern) => pattern.test(line))
            ? [`${path.relative(process.cwd(), file)}:${index + 1}`]
            : [],
        ),
    )
    expect(offenders).toEqual([])
  })

  test("every shell root assignment enforces private ownership without helper copies", () => {
    const helperCopies = RUNTIME_FILES.filter((file) => file.endsWith("scripts/scratch-root.py"))
    expect(helperCopies).toEqual([])

    for (const file of RUNTIME_FILES) {
      const content = readFileSync(file, "utf8")
      let offset = content.indexOf(ROOT_ASSIGNMENT)
      while (offset >= 0) {
        const block = content.slice(offset, offset + 700)
        expect(block).toMatch(/(?:\[ ! -L "\$SCRATCH_ROOT" \]|if \[ -L "\$SCRATCH_ROOT" \])/)
        // `(umask 077; mkdir -p …)`, not `install -d -m 700 …`: the latter fails outright on
        // native Windows Git Bash ("cannot change permissions"), which trips the guard's own
        // `|| exit 1` and makes every skill's scratch setup abort on a supported shell (#1285).
        // Same end state on POSIX — created 0700, then re-asserted by the chmod below — and it
        // is already the pattern every sub-directory in these blocks uses.
        expect(block).toContain('(umask 077; mkdir -p "$SCRATCH_ROOT")')
        expect(block).not.toContain("install -d")
        expect(block).toMatch(/\[ !? ?-O "\$SCRATCH_ROOT" \]/)
        expect(block).toContain('chmod 700 "$SCRATCH_ROOT"')
        offset = content.indexOf(ROOT_ASSIGNMENT, offset + ROOT_ASSIGNMENT.length)
      }

      const assignment = /\b(RUN_DIR|SCRATCH_DIR|MEDIA_DIR|STATE_DIR|HANDOFF_DIR|PROBE_DIR)="\$SCRATCH_ROOT\/[^"]+"/g
      for (const match of content.matchAll(assignment)) {
        const variable = match[1]
        const block = content.slice(match.index!, match.index! + 500)
        expect(block).toContain(`(umask 077; mkdir -p "$${variable}")`)
        expect(block).toContain(`chmod 700 "$${variable}"`)
      }
    }
  })

  test("the shell guard creates mode 0700 and rejects a symlink", () => {
    const script = String.raw`
root="$1/root"
umask 0777
mkdir -p "$root" || exit 8
chmod 755 "$root" || exit 8
[ ! -L "$root" ] && (umask 077; mkdir -p "$root") && [ ! -L "$root" ] && [ -O "$root" ] && chmod 700 "$root" || exit 9
run="$root/skill/run"
(umask 077; mkdir -p "$run") || exit 10
chmod 700 "$run" || exit 11
touch "$run/artifact" || exit 11
for dir in "$root" "$root/skill" "$run"; do
  mode=$(stat -c '%a' "$dir" 2>/dev/null)
  case "$mode" in ''|*[!0-7]*) mode=$(stat -f '%Lp' "$dir" 2>/dev/null) ;; esac
  [ "$mode" = 700 ] || exit 12
done
target="$1/target"
install -d -m 700 "$target"
link="$1/link"
ln -s "$target" "$link"
[ ! -L "$link" ] && (umask 077; mkdir -p "$link") && [ ! -L "$link" ] && [ -O "$link" ] && chmod 700 "$link" && exit 13
exit 0
`
    const parent = mkdtempSync(path.join(tmpdir(), "ce-scratch-contract-"))
    try {
      const result = spawnSync("sh", ["-c", script, "sh", parent], { encoding: "utf8" })
      expect(result.status, result.stderr).toBe(0)
    } finally {
      spawnSync("chmod", ["-R", "u+rwx", parent])
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test("peer runner defaults to the effective-uid root", () => {
    const runner = path.join(SKILLS_ROOT, "ce-doc-review", "scripts/peer-job-runner.py")
    const driver = String.raw`
import importlib.util, os, sys
os.environ.pop("CE_PEER_JOBS_ROOT", None)
spec = importlib.util.spec_from_file_location("peer_job_runner", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.jobs_root_base())
`
    const result = spawnSync("python3", ["-c", driver, runner], { encoding: "utf8" })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe(`/tmp/compound-engineering-${process.getuid!()}`)
  })

  // Same sandbox state as the shell preamble's fallback (#1294): the /tmp root cannot be created
  // or written, so the runner must resolve its jobs root under $TMPDIR — and to the same path the
  // shell preamble picks, or `status`/`wait`/`result` look in a root no job was started in.
  test("peer runner falls back to the TMPDIR root when the /tmp root is unusable", () => {
    const runner = path.join(SKILLS_ROOT, "ce-doc-review", "scripts/peer-job-runner.py")
    const parent = mkdtempSync(path.join(tmpdir(), "ce-peer-fallback-"))
    const driver = String.raw`
import importlib.util, os, sys
os.environ.pop("CE_PEER_JOBS_ROOT", None)
spec = importlib.util.spec_from_file_location("peer_job_runner", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
primary = os.path.join(sys.argv[2], "primary")
open(primary, "w").close()          # occupies the path: mkdir cannot create it
mod.DEFAULT_ROOT = primary
os.environ["TMPDIR"] = os.path.join(sys.argv[2], "sandbox-tmp")
os.mkdir(os.environ["TMPDIR"])
print(mod.jobs_root_base())
`
    try {
      const result = spawnSync("python3", ["-c", driver, runner, parent], { encoding: "utf8" })
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout.trim()).toBe(
        path.join(parent, "sandbox-tmp", `compound-engineering-${process.getuid!()}`),
      )
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test("ce-work runs root falls back to the TMPDIR root when the /tmp root is unusable", () => {
    const script = path.join(SKILLS_ROOT, "ce-work", "scripts/unit_workspace_state.py")
    const parent = mkdtempSync(path.join(tmpdir(), "ce-work-fallback-"))
    const driver = String.raw`
import os, sys
sys.path.insert(0, os.path.dirname(sys.argv[1]))
os.environ.pop("CE_PEER_JOBS_ROOT", None); os.environ.pop("CE_WORK_RUNS_ROOT", None)
import unit_workspace_state as state
primary = os.path.join(sys.argv[2], "primary")
open(primary, "w").close()
state.OWNER_SCRATCH_ROOT = primary
os.environ["TMPDIR"] = os.path.join(sys.argv[2], "sandbox-tmp")
os.mkdir(os.environ["TMPDIR"])
print(state.ensure_root())
`
    try {
      const result = spawnSync("python3", ["-c", driver, script, parent], { encoding: "utf8" })
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout.trim()).toBe(
        path.join(parent, "sandbox-tmp", `compound-engineering-${process.getuid!()}`, "ce-work"),
      )
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test("peer runner secures newly created directories under a restrictive umask", () => {
    const runner = path.join(SKILLS_ROOT, "ce-doc-review", "scripts/peer-job-runner.py")
    const parent = mkdtempSync(path.join(tmpdir(), "ce-peer-root-"))
    const driver = String.raw`
import importlib.util, os, stat, sys
spec = importlib.util.spec_from_file_location("peer_job_runner", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
base = os.path.join(sys.argv[2], "root")
path = os.path.join(base, "skill", "run", "jobs")
os.mkdir(base, 0o755)
os.chmod(base, 0o755)
os.umask(0o777)
mod.ensure_owned_dirs(base, path)
assert all(stat.S_IMODE(os.lstat(p).st_mode) == 0o700 for p in (
    base, os.path.join(base, "skill"), os.path.join(base, "skill", "run"), path
))
`
    try {
      const result = spawnSync("python3", ["-c", driver, runner, parent], { encoding: "utf8" })
      expect(result.status, result.stderr).toBe(0)
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })
})
