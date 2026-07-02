import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, existsSync, readFileSync } from "node:fs"
import { access } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"

const PLUGIN_ROOT = path.join(__dirname, "../skills")

// safe_extract is byte-duplicated across the consuming skills (parity-guarded
// below). Behavior is identical, so exercise the canonical
// ce-riffrec-feedback-analysis copy for the security check.
const CANONICAL_SCRIPT = path.join(
  PLUGIN_ROOT,
  "ce-riffrec-feedback-analysis/scripts/analyze_riffrec_zip.py",
)

// Drives safe_extract(zip, dest=<tmp>/raw) against a zip whose only member is
// named `../rawX/evil.txt`. That member resolves to a SIBLING of dest
// (`rawX` vs `raw`), which the pre-fix bare-`startswith` containment check
// waves through — a zip-slip escape. A correct separator-safe check raises.
const DRIVER = `
import sys, zipfile, importlib.util
from pathlib import Path

script_path, tmp = sys.argv[1], Path(sys.argv[2])
zip_path = tmp / "payload.zip"
with zipfile.ZipFile(zip_path, "w") as archive:
    archive.writestr("../rawX/evil.txt", "PWNED")

spec = importlib.util.spec_from_file_location("analyze_riffrec_zip", script_path)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

dest = tmp / "raw"
try:
    module.safe_extract(zip_path, dest)
    print("EXTRACT_RETURNED_NO_ERROR")
except Exception as exc:
    print("SAFE_EXTRACT_RAISED", type(exc).__name__)
`

describe("analyze_riffrec_zip safe_extract zip-slip guard", () => {
  test("rejects a member that resolves to a sibling of the destination", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-sweep-zipslip-"))
    const run = spawnSync("python3", ["-c", DRIVER, CANONICAL_SCRIPT, tmp], {
      encoding: "utf8",
    })

    // The malicious member must never land on disk as a sibling of dest.
    const escaped = path.join(tmp, "rawX", "evil.txt")
    expect(existsSync(escaped)).toBe(false)

    // And safe_extract must reject it via the containment guard specifically
    // (RuntimeError), not fail for some unrelated reason that also happens to
    // skip the write.
    expect(run.stdout).toContain("SAFE_EXTRACT_RAISED RuntimeError")
    expect(run.stdout).not.toContain("EXTRACT_RETURNED_NO_ERROR")
  })
})

// --- Byte-identity parity (modeled on repo-profile-cache-parity.test.ts) ---
// The analyzer script has no cross-skill import mechanism (see AGENTS.md "File
// References in Skills"), so it is byte-duplicated into every consuming skill.
// All copies must stay identical.
const SHARED_ASSETS = ["scripts/analyze_riffrec_zip.py"]

const CONSUMER_SKILLS = ["ce-riffrec-feedback-analysis", "ce-sweep"]

describe("analyze_riffrec_zip shared-asset parity", () => {
  for (const asset of SHARED_ASSETS) {
    test(`${asset} exists in every consumer and is byte-identical`, async () => {
      const contents = await Promise.all(
        CONSUMER_SKILLS.map(async (skill) => {
          const p = path.join(PLUGIN_ROOT, skill, asset)
          await access(p) // fails the test if a consumer is missing the copy
          return readFileSync(p, "utf8")
        }),
      )
      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0])
      }
    })
  }
})
