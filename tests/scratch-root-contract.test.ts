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
const ROOT_ASSIGNMENT = 'SCRATCH_ROOT="${TMPDIR:-/tmp}/compound-engineering-$(id -u)"'

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

  test("peer runner defaults to the effective-uid root under TMPDIR or /tmp", () => {
    const runner = path.join(SKILLS_ROOT, "ce-doc-review", "scripts/peer-job-runner.py")
    const driver = String.raw`
import importlib.util, os, sys
os.environ.pop("CE_PEER_JOBS_ROOT", None)
# Unset host TMPDIR so the fallback path is deterministic in CI/dev sandboxes.
os.environ.pop("TMPDIR", None)
spec = importlib.util.spec_from_file_location("peer_job_runner", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.jobs_root_base())
`
    const result = spawnSync("python3", ["-c", driver, runner], { encoding: "utf8" })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe(`/tmp/compound-engineering-${process.getuid!()}`)
  })

  test("peer runner prefers TMPDIR when set (Claude Code sandbox)", () => {
    const runner = path.join(SKILLS_ROOT, "ce-doc-review", "scripts/peer-job-runner.py")
    const driver = String.raw`
import importlib.util, os, sys
os.environ.pop("CE_PEER_JOBS_ROOT", None)
os.environ["TMPDIR"] = "/tmp/claude-sandbox-test"
spec = importlib.util.spec_from_file_location("peer_job_runner", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
print(mod.jobs_root_base())
`
    const result = spawnSync("python3", ["-c", driver, runner], { encoding: "utf8" })
    expect(result.status, result.stderr).toBe(0)
    expect(result.stdout.trim()).toBe(
      `/tmp/claude-sandbox-test/compound-engineering-${process.getuid!()}`,
    )
  })

  test("peer runner resume discovers jobs under owner-checked legacy /tmp when TMPDIR differs", () => {
    const runner = path.join(SKILLS_ROOT, "ce-doc-review", "scripts/peer-job-runner.py")
    const parent = mkdtempSync(path.join(tmpdir(), "ce-peer-legacy-fallback-"))
    const driver = String.raw`
import importlib.util, os, sys
os.environ.pop("CE_PEER_JOBS_ROOT", None)
tmpdir_parent = sys.argv[2]
preferred = os.path.join(tmpdir_parent, "claude-sandbox")
legacy = os.path.join(tmpdir_parent, "legacy-tmp")
os.makedirs(preferred, mode=0o700)
os.makedirs(legacy, mode=0o700)
os.environ["TMPDIR"] = preferred
uid = os.geteuid() if hasattr(os, "geteuid") else os.getuid()
spec = importlib.util.spec_from_file_location("peer_job_runner", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
# Hermetic roots: preferred under TMPDIR-like path, legacy under a distinct tree.
mod.DEFAULT_ROOT = os.path.join(preferred, f"compound-engineering-{uid}")
mod.LEGACY_DEFAULT_ROOT = os.path.join(legacy, f"compound-engineering-{uid}")
assert mod.jobs_root_base() == os.path.abspath(mod.DEFAULT_ROOT)
job_id = "20260801T000000Z-deadbeef"
legacy_job = os.path.join(mod.LEGACY_DEFAULT_ROOT, "ce-doc-review", "run-1", "jobs", job_id)
os.makedirs(legacy_job, mode=0o700)
resolved = mod.resolve_job_dir(job_id, "ce-doc-review")
assert os.path.samefile(resolved, legacy_job), (resolved, legacy_job)
# New writes stay under preferred TMPDIR root.
assert mod.skill_runs_root("ce-doc-review").startswith(os.path.abspath(mod.DEFAULT_ROOT))
print("ok")
`
    try {
      const result = spawnSync("python3", ["-c", driver, runner, parent], { encoding: "utf8" })
      expect(result.status, result.stderr + result.stdout).toBe(0)
      expect(result.stdout.trim()).toBe("ok")
    } finally {
      spawnSync("chmod", ["-R", "u+rwx", parent])
      rmSync(parent, { recursive: true, force: true })
    }
  })

  test("ce-work run_dir falls back to owner-checked legacy /tmp when primary lacks the run", () => {
    const state = path.join(SKILLS_ROOT, "ce-work", "scripts/unit_workspace_state.py")
    const parent = mkdtempSync(path.join(tmpdir(), "ce-work-legacy-fallback-"))
    const driver = String.raw`
import importlib.util, os, stat, sys
os.environ.pop("CE_WORK_RUNS_ROOT", None)
os.environ.pop("CE_PEER_JOBS_ROOT", None)
tmpdir_parent = sys.argv[2]
preferred = os.path.join(tmpdir_parent, "claude-sandbox")
legacy = os.path.join(tmpdir_parent, "legacy-tmp")
os.makedirs(preferred, mode=0o700)
os.makedirs(legacy, mode=0o700)
os.environ["TMPDIR"] = preferred
uid = os.geteuid() if hasattr(os, "geteuid") else os.getuid()
spec = importlib.util.spec_from_file_location("unit_workspace_state", sys.argv[1])
mod = importlib.util.module_from_spec(spec)
spec.loader.exec_module(mod)
mod.OWNER_SCRATCH_ROOT = os.path.join(preferred, f"compound-engineering-{uid}")
mod.DEFAULT_RUNS_ROOT = os.path.join(mod.OWNER_SCRATCH_ROOT, "ce-work")
mod.LEGACY_OWNER_SCRATCH_ROOT = os.path.join(legacy, f"compound-engineering-{uid}")
mod.LEGACY_RUNS_ROOT = os.path.join(mod.LEGACY_OWNER_SCRATCH_ROOT, "ce-work")
os.makedirs(mod.LEGACY_OWNER_SCRATCH_ROOT, mode=0o700)
os.makedirs(mod.LEGACY_RUNS_ROOT, mode=0o700)
run_id = "run-legacy-1"
legacy_run = os.path.join(mod.LEGACY_RUNS_ROOT, run_id)
os.makedirs(legacy_run, mode=0o700)
# New default root still prefers TMPDIR.
assert mod.runs_root() == mod.DEFAULT_RUNS_ROOT
assert mod.run_dir(run_id) == legacy_run
# Unknown ids stay on the preferred write root.
assert mod.run_dir("brand-new-run") == os.path.join(mod.DEFAULT_RUNS_ROOT, "brand-new-run")
print("ok")
`
    try {
      const result = spawnSync("python3", ["-c", driver, state, parent], { encoding: "utf8" })
      expect(result.status, result.stderr + result.stdout).toBe(0)
      expect(result.stdout.trim()).toBe("ok")
    } finally {
      spawnSync("chmod", ["-R", "u+rwx", parent])
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
