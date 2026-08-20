import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  renameSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs"
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

const makeUnpackedCapture = (root: string) => {
  const capture = path.join(root, "riffrec-capture")
  mkdirSync(capture)
  writeFileSync(
    path.join(capture, "session.json"),
    JSON.stringify({ url: "https://example.test/checkout", duration_seconds: 12 }),
  )
  writeFileSync(
    path.join(capture, "events.json"),
    JSON.stringify({ events: [{ type: "navigation", t: 3, url: "https://example.test/checkout" }] }),
  )
  writeFileSync(path.join(capture, "recording.webm"), "recording-bytes")
  writeFileSync(path.join(capture, "voice.webm"), "voice-bytes")
  return capture
}

describe("analyze_riffrec_zip unpacked capture input", () => {
  test("normalizes a capture directory and analyzes its synchronized metadata", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-unpacked-"))
    const capture = makeUnpackedCapture(tmp)
    const output = path.join(tmp, "analysis-output")
    const run = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "0"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(run.status).toBe(0)
    expect(run.stderr).toBe("")
    const analysis = JSON.parse(readFileSync(path.join(output, "analysis.json"), "utf8"))
    expect(analysis.source_kind).toBe("riffrec_directory")
    expect(analysis.event_counts).toEqual({ navigation: 1 })
    expect(readFileSync(path.join(output, "raw", "session.json"), "utf8")).toBe(
      readFileSync(path.join(capture, "session.json"), "utf8"),
    )
    expect(readFileSync(path.join(output, "raw", "events.json"), "utf8")).toBe(
      readFileSync(path.join(capture, "events.json"), "utf8"),
    )
    expect(readFileSync(path.join(output, "raw", "recording.webm"), "utf8")).toBe("recording-bytes")
    expect(readFileSync(path.join(output, "analysis.md"), "utf8")).toContain(
      "- Source kind: `riffrec_directory`",
    )

    renameSync(
      path.join(capture, "recording.webm"),
      path.join(capture, "renamed-recording.webm"),
    )
    unlinkSync(path.join(capture, "voice.webm"))
    writeFileSync(
      path.join(capture, "events.json"),
      JSON.stringify({ events: [{ type: "click", t: 6, element: { id: "checkout" } }] }),
    )

    const rerun = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "0"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(rerun.status).toBe(0)
    expect(rerun.stderr).toBe("")
    expect(readdirSync(path.join(output, "raw")).sort()).toEqual(readdirSync(capture).sort())
    expect(existsSync(path.join(output, "raw", "recording.webm"))).toBe(false)
    expect(existsSync(path.join(output, "raw", "voice.webm"))).toBe(false)
    expect(readFileSync(path.join(output, "raw", "renamed-recording.webm"), "utf8")).toBe(
      "recording-bytes",
    )
    const rerunAnalysis = JSON.parse(readFileSync(path.join(output, "analysis.json"), "utf8"))
    expect(rerunAnalysis.event_counts).toEqual({ click: 1 })
  })

  test.skipIf(process.platform === "win32")(
    "replaces frame evidence for no-ffmpeg and no-video reruns",
    () => {
      const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-frame-snapshot-"))
      const capture = makeUnpackedCapture(tmp)
      const output = path.join(tmp, "analysis-output")
      const fakeBin = path.join(tmp, "bin")
      const fakeFfmpeg = path.join(fakeBin, "ffmpeg")
      mkdirSync(fakeBin)
      writeFileSync(
        fakeFfmpeg,
        '#!/bin/sh\nfor arg in "$@"; do output="$arg"; done\nprintf frame > "$output"\n',
      )
      chmodSync(fakeFfmpeg, 0o755)
      const python = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], {
        encoding: "utf8",
      }).stdout.trim()
      expect(python).not.toBe("")
      const env = { ...process.env, PATH: fakeBin }

      const initialRun = spawnSync(
        python,
        [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "1"],
        { encoding: "utf8", cwd: tmp, env },
      )

      expect(initialRun.status).toBe(0)
      expect(initialRun.stderr).toBe("")
      const initialFrames = readdirSync(path.join(output, "frames"))
      expect(initialFrames).toHaveLength(1)
      const staleFrame = initialFrames[0]
      expect(staleFrame.endsWith(".png")).toBe(true)
      expect(readFileSync(path.join(output, "source-materials.md"), "utf8")).toContain(staleFrame)

      const disabledFfmpeg = `${fakeFfmpeg}.disabled`
      renameSync(fakeFfmpeg, disabledFfmpeg)
      const noFfmpegRun = spawnSync(
        python,
        [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "1"],
        { encoding: "utf8", cwd: tmp, env },
      )

      expect(noFfmpegRun.status).toBe(0)
      expect(noFfmpegRun.stderr).toBe("")
      expect(readdirSync(path.join(output, "frames"))).toEqual([])
      expect(existsSync(path.join(output, "frames", staleFrame))).toBe(false)
      const noFfmpegManifest = readFileSync(path.join(output, "source-materials.md"), "utf8")
      expect(noFfmpegManifest).not.toContain(staleFrame)
      expect(noFfmpegManifest).not.toContain("All frame files:")

      renameSync(disabledFfmpeg, fakeFfmpeg)
      const repopulateRun = spawnSync(
        python,
        [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "1"],
        { encoding: "utf8", cwd: tmp, env },
      )
      expect(repopulateRun.status).toBe(0)
      const repopulatedFrames = readdirSync(path.join(output, "frames"))
      expect(repopulatedFrames).toHaveLength(1)

      unlinkSync(path.join(capture, "recording.webm"))
      const noVideoRun = spawnSync(
        python,
        [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "1"],
        { encoding: "utf8", cwd: tmp, env },
      )

      expect(noVideoRun.status).toBe(0)
      expect(noVideoRun.stderr).toBe("")
      expect(readdirSync(path.join(output, "frames"))).toEqual([])
      const noVideoManifest = readFileSync(path.join(output, "source-materials.md"), "utf8")
      expect(noVideoManifest).not.toContain(repopulatedFrames[0])
      expect(noVideoManifest).not.toContain("All frame files:")
      expect(readdirSync(output).some((entry) => entry.startsWith(".frames.staging-"))).toBe(false)
      expect(readdirSync(output).some((entry) => entry.startsWith(".frames.previous-"))).toBe(false)
    },
  )

  test("reports the required capture markers for an unsupported directory", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-unsupported-"))
    const capture = path.join(tmp, "not-a-capture")
    mkdirSync(capture)
    const run = spawnSync("python3", [CANONICAL_SCRIPT, capture, "--no-transcribe"], {
      encoding: "utf8",
      cwd: tmp,
    })

    expect(run.status).toBe(2)
    expect(run.stderr).toContain("Unsupported source directory")
    expect(run.stderr).toContain("events.json, session.json")
    expect(run.stderr).not.toContain("IsADirectoryError")
  })

  test.skipIf(process.platform === "win32")("rejects symlinks inside an unpacked capture", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-symlink-"))
    const capture = makeUnpackedCapture(tmp)
    const output = path.join(tmp, "analysis-output")
    const initialRun = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe", "--max-moments", "0"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(initialRun.status).toBe(0)
    const completedSession = readFileSync(path.join(output, "raw", "session.json"), "utf8")
    const completedRawEntries = readdirSync(path.join(output, "raw")).sort()

    const outside = path.join(tmp, "outside.txt")
    writeFileSync(outside, "must-not-copy")
    symlinkSync(outside, path.join(capture, "outside-link"))
    writeFileSync(
      path.join(capture, "session.json"),
      JSON.stringify({ url: "https://example.test/mutated", duration_seconds: 99 }),
    )
    const run = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(run.status).toBe(2)
    expect(run.stderr).toContain("contains a symlink")
    expect(existsSync(path.join(output, "raw", "outside-link"))).toBe(false)
    expect(readFileSync(path.join(output, "raw", "session.json"), "utf8")).toBe(completedSession)
    expect(readdirSync(path.join(output, "raw")).sort()).toEqual(completedRawEntries)
    expect(readdirSync(output).some((entry) => entry.startsWith(".raw.staging-"))).toBe(false)
  })

  test.skipIf(process.platform === "win32")("rejects a symlinked raw destination", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-raw-symlink-"))
    const capture = makeUnpackedCapture(tmp)
    const output = path.join(tmp, "analysis-output")
    const outside = path.join(tmp, "outside-raw")
    mkdirSync(output)
    mkdirSync(outside)
    symlinkSync(outside, path.join(output, "raw"))

    const run = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(run.status).toBe(2)
    expect(run.stderr).toContain("Raw output directory must not be a symlink")
    expect(readdirSync(outside)).toEqual([])
    expect(readdirSync(output).some((entry) => entry.startsWith(".raw.staging-"))).toBe(false)
  })

  test.skipIf(process.platform === "win32")("rejects a symlinked frames destination", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-frames-symlink-"))
    const capture = makeUnpackedCapture(tmp)
    const output = path.join(tmp, "analysis-output")
    const outside = path.join(tmp, "outside-frames")
    mkdirSync(output)
    mkdirSync(outside)
    symlinkSync(outside, path.join(output, "frames"))

    const run = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(run.status).toBe(2)
    expect(run.stderr).toContain("Frames output directory must not be a symlink")
    expect(readdirSync(outside)).toEqual([])
    expect(existsSync(path.join(output, "raw"))).toBe(false)
  })

  test("rejects output nested inside the source capture", () => {
    const tmp = mkdtempSync(path.join(tmpdir(), "ce-riffrec-recursive-output-"))
    const capture = makeUnpackedCapture(tmp)
    const output = path.join(capture, "analysis-output")
    const run = spawnSync(
      "python3",
      [CANONICAL_SCRIPT, capture, "--output-dir", output, "--no-transcribe"],
      { encoding: "utf8", cwd: tmp },
    )

    expect(run.status).toBe(2)
    expect(run.stderr).toContain("must be outside the unpacked capture directory")
    expect(existsSync(output)).toBe(false)
  })
})

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

// --- Byte-identity parity for duplicated skill assets ---
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
