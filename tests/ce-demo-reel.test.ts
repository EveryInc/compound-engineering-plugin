import { describe, expect, test, beforeAll, afterAll } from "bun:test"
import { promises as fs } from "fs"
import path from "path"
import os from "os"

const SCRIPT = path.join(
  process.cwd(),
  "plugins",
  "compound-engineering",
  "skills",
  "ce-demo-reel",
  "scripts",
  "capture-demo.py",
)

async function run(
  ...args: string[]
): Promise<{ exitCode: number; stdout: string; stderr: string }> {
  const proc = Bun.spawn(["python3", SCRIPT, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const exitCode = await proc.exited
  const stdout = await new Response(proc.stdout).text()
  const stderr = await new Response(proc.stderr).text()
  return { exitCode, stdout, stderr }
}

/** Create a minimal valid PNG (1x1 pixel, solid color). */
function createTestPng(color: [number, number, number]): Buffer {
  const [r, g, b] = color

  // Raw RGB pixel data: 1 row, filter byte 0, then RGB
  const rawData = Buffer.from([0, r, g, b])

  // Compress with zlib
  const compressed = Bun.deflateSync(rawData, { level: 0 })
  const cmf = 0x78
  const flg = 0x01
  let s1 = 1
  let s2 = 0
  for (const byte of rawData) {
    s1 = (s1 + byte) % 65521
    s2 = (s2 + s1) % 65521
  }
  const adler32 = Buffer.alloc(4)
  adler32.writeUInt32BE((s2 << 16) | s1)
  const zlibData = Buffer.concat([Buffer.from([cmf, flg]), compressed, adler32])

  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])

  function chunk(type: string, data: Buffer): Buffer {
    const len = Buffer.alloc(4)
    len.writeUInt32BE(data.length)
    const typeB = Buffer.from(type, "ascii")
    const body = Buffer.concat([typeB, data])
    const crc = crc32(body)
    const crcB = Buffer.alloc(4)
    crcB.writeUInt32BE(crc >>> 0)
    return Buffer.concat([len, body, crcB])
  }

  // IHDR: 1x1, 8-bit RGB (color type 2)
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(1, 0)
  ihdr.writeUInt32BE(1, 4)
  ihdr[8] = 8  // bit depth
  ihdr[9] = 2  // color type: RGB
  ihdr[10] = 0
  ihdr[11] = 0
  ihdr[12] = 0

  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", zlibData),
    chunk("IEND", Buffer.alloc(0)),
  ])
}

function crc32(data: Buffer): number {
  let crc = 0xffffffff
  for (const byte of data) {
    crc ^= byte
    for (let j = 0; j < 8; j++) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1
    }
  }
  return (crc ^ 0xffffffff) >>> 0
}

// --- Preflight ---

describe("capture-evidence.py", () => {
  describe("preflight", () => {
    test("returns JSON with tool availability", async () => {
      const { exitCode, stdout } = await run("preflight")
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result).toHaveProperty("agent_browser")
      expect(result).toHaveProperty("vhs")
      expect(result).toHaveProperty("silicon")
      expect(result).toHaveProperty("ffmpeg")
      expect(result).toHaveProperty("ffprobe")
      expect(typeof result.ffmpeg).toBe("boolean")
    })
  })

  // --- Detect ---

  describe("detect", () => {
    let tmpDir: string

    beforeAll(async () => {
      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-detect-"))
    })

    afterAll(async () => {
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true })
    })

    test("detects web-app from package.json with react", async () => {
      const dir = path.join(tmpDir, "webapp")
      await fs.mkdir(dir)
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" } }),
      )
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("web-app")
    })

    test("detects cli-tool from package.json with bin field", async () => {
      const dir = path.join(tmpDir, "clitool")
      await fs.mkdir(dir)
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ bin: { mycli: "./cli.js" } }),
      )
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("cli-tool")
    })

    test("detects desktop-app from electron dependency", async () => {
      const dir = path.join(tmpDir, "electron")
      await fs.mkdir(dir)
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ devDependencies: { electron: "^28.0.0", react: "^18.0.0" } }),
      )
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("desktop-app")
    })

    test("detects library when manifest exists but no web/CLI signals", async () => {
      const dir = path.join(tmpDir, "lib")
      await fs.mkdir(dir)
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ name: "my-utils", version: "1.0.0" }),
      )
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("library")
    })

    test("detects text-only when no manifest exists", async () => {
      const dir = path.join(tmpDir, "textonly")
      await fs.mkdir(dir)
      await fs.writeFile(path.join(dir, "README.md"), "# Hello")
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("text-only")
    })

    test("electron takes priority over web-app", async () => {
      const dir = path.join(tmpDir, "electron-react")
      await fs.mkdir(dir)
      await fs.writeFile(
        path.join(dir, "package.json"),
        JSON.stringify({ dependencies: { react: "^18.0.0" }, devDependencies: { electron: "^28.0.0" } }),
      )
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("desktop-app")
    })

    test("detects web-app from Gemfile with rails", async () => {
      const dir = path.join(tmpDir, "rails")
      await fs.mkdir(dir)
      await fs.writeFile(path.join(dir, "Gemfile"), 'gem "rails", "~> 7.0"')
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("web-app")
    })

    test("detects cli-tool from go.mod with cmd/ directory", async () => {
      const dir = path.join(tmpDir, "gocli")
      await fs.mkdir(dir)
      await fs.writeFile(path.join(dir, "go.mod"), "module example.com/mycli\n\ngo 1.21")
      await fs.mkdir(path.join(dir, "cmd"))
      const { exitCode, stdout } = await run("detect", "--repo-root", dir)
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.type).toBe("cli-tool")
    })
  })

  // --- Recommend ---

  describe("recommend", () => {
    const allTools = '{"agent_browser":true,"vhs":true,"silicon":true,"ffmpeg":true,"ffprobe":true}'
    const noTools = '{"agent_browser":false,"vhs":false,"silicon":false,"ffmpeg":false,"ffprobe":false}'

    test("web-app with browser + ffmpeg recommends browser-reel", async () => {
      const { exitCode, stdout } = await run(
        "recommend", "--project-type", "web-app", "--change-type", "states", "--tools", allTools,
      )
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.recommended).toBe("browser-reel")
    })

    test("cli-tool with motion + vhs recommends terminal-recording", async () => {
      const { exitCode, stdout } = await run(
        "recommend", "--project-type", "cli-tool", "--change-type", "motion", "--tools", allTools,
      )
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.recommended).toBe("terminal-recording")
    })

    test("cli-tool with states + silicon recommends screenshot-reel", async () => {
      const tools = '{"agent_browser":false,"vhs":false,"silicon":true,"ffmpeg":true,"ffprobe":true}'
      const { exitCode, stdout } = await run(
        "recommend", "--project-type", "cli-tool", "--change-type", "states", "--tools", tools,
      )
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.recommended).toBe("screenshot-reel")
    })

    test("library always recommends static-screenshots", async () => {
      const { exitCode, stdout } = await run(
        "recommend", "--project-type", "library", "--change-type", "states", "--tools", allTools,
      )
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.recommended).toBe("static-screenshots")
    })

    test("no tools always falls back to static-screenshots", async () => {
      const { exitCode, stdout } = await run(
        "recommend", "--project-type", "cli-tool", "--change-type", "motion", "--tools", noTools,
      )
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.recommended).toBe("static-screenshots")
    })

    test("available list includes only tiers with tools present", async () => {
      const tools = '{"agent_browser":false,"vhs":true,"silicon":false,"ffmpeg":true,"ffprobe":true}'
      const { exitCode, stdout } = await run(
        "recommend", "--project-type", "cli-tool", "--change-type", "motion", "--tools", tools,
      )
      expect(exitCode).toBe(0)
      const result = JSON.parse(stdout.trim())
      expect(result.available).toContain("terminal-recording")
      expect(result.available).toContain("static-screenshots")
      expect(result.available).not.toContain("browser-reel")
      expect(result.available).not.toContain("screenshot-reel")
    })
  })

  // --- Stitch arg validation ---

  describe("stitch arg validation", () => {
    test("stitch with no args fails", async () => {
      const { exitCode, stderr } = await run("stitch")
      expect(exitCode).not.toBe(0)
    })

    test("stitch fails on missing frame file", async () => {
      const { exitCode, stderr } = await run(
        "stitch", "out.gif", "/tmp/nonexistent-frame-abc123.png",
      )
      expect(exitCode).toBe(1)
      expect(stderr).toContain("Frame not found")
    })

    test("upload fails on missing file", async () => {
      const { exitCode, stderr } = await run(
        "upload", "/tmp/nonexistent-file-abc123.gif",
      )
      expect(exitCode).toBe(1)
      expect(stderr).toContain("File not found")
    })

    test("stitch fails fast when a frame is below the minimum size", async () => {
      // Regression: blank screenshots from SPAs were stitched and uploaded silently.
      // _stitch_frames must reject frames smaller than --min-frame-bytes (default 20480)
      // before invoking ffmpeg, naming the offending file.
      const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-blank-"))
      try {
        const tinyPng = createTestPng([10, 10, 10])
        const tinyPath = path.join(tmp, "blank.png")
        await fs.writeFile(tinyPath, tinyPng)

        const out = path.join(tmp, "out.gif")
        const { exitCode, stderr } = await run("stitch", out, tinyPath)

        expect(exitCode).toBe(1)
        expect(stderr).toContain("blank.png")
        expect(stderr.toLowerCase()).toContain("min")
      } finally {
        await fs.rm(tmp, { recursive: true, force: true })
      }
    })
  })

  // --- Stitch integration (requires ffmpeg) ---

  describe("stitch integration", () => {
    let tmpDir: string
    let hasFFmpeg: boolean

    beforeAll(async () => {
      const proc = Bun.spawn(["which", "ffmpeg"], {
        stdout: "pipe",
        stderr: "pipe",
      })
      hasFFmpeg = (await proc.exited) === 0

      if (!hasFFmpeg) return

      tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "evidence-test-"))

      const red = createTestPng([255, 0, 0])
      const green = createTestPng([0, 255, 0])
      const blue = createTestPng([0, 0, 255])

      await fs.writeFile(path.join(tmpDir, "frame1.png"), red)
      await fs.writeFile(path.join(tmpDir, "frame2.png"), green)
      await fs.writeFile(path.join(tmpDir, "frame3.png"), blue)
    })

    afterAll(async () => {
      if (tmpDir) await fs.rm(tmpDir, { recursive: true, force: true })
    })

    test("stitches frames into a GIF", async () => {
      if (!hasFFmpeg) {
        console.log("Skipping: ffmpeg not available")
        return
      }

      const output = path.join(tmpDir, "output.gif")
      const { exitCode, stdout } = await run(
        "stitch", "--duration", "0.5", "--min-frame-bytes", "0", output,
        path.join(tmpDir, "frame1.png"),
        path.join(tmpDir, "frame2.png"),
      )

      expect(exitCode).toBe(0)
      expect(stdout).toContain("Stitching 2 frames")
      expect(stdout).toContain("Created:")

      const stat = await fs.stat(output)
      expect(stat.size).toBeGreaterThan(0)

      const header = Buffer.alloc(6)
      const fh = await fs.open(output, "r")
      await fh.read(header, 0, 6)
      await fh.close()
      expect(header.toString("ascii").startsWith("GIF")).toBe(true)
    })

    test("stitches 3 frames into a GIF", async () => {
      if (!hasFFmpeg) {
        console.log("Skipping: ffmpeg not available")
        return
      }

      const output = path.join(tmpDir, "output3.gif")
      const { exitCode, stdout } = await run(
        "stitch", "--duration", "0.5", "--min-frame-bytes", "0", output,
        path.join(tmpDir, "frame1.png"),
        path.join(tmpDir, "frame2.png"),
        path.join(tmpDir, "frame3.png"),
      )

      expect(exitCode).toBe(0)
      expect(stdout).toContain("Stitching 3 frames")
    })

    test("default duration is used when --duration not specified", async () => {
      if (!hasFFmpeg) {
        console.log("Skipping: ffmpeg not available")
        return
      }

      const output = path.join(tmpDir, "output-default-dur.gif")
      const { exitCode, stdout } = await run(
        "stitch", "--min-frame-bytes", "0", output,
        path.join(tmpDir, "frame1.png"),
        path.join(tmpDir, "frame2.png"),
      )

      expect(exitCode).toBe(0)
      expect(stdout).toContain("Created:")
    })
  })
})
