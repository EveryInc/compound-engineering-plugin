import { describe, expect, test } from "bun:test"
import fs from "node:fs"
import path from "node:path"

const ROOT = path.join(import.meta.dir, "..", "..", "skills")
const read = (skill: string, rel = "SKILL.md") =>
  fs.readFileSync(path.join(ROOT, skill, rel), "utf8")

describe("remaining skill body extractions", () => {
  test("ce-test-xcode keeps completion and routing inline while references own procedure", () => {
    const body = read("ce-test-xcode")
    const setup = read("ce-test-xcode", "references/setup-and-build.md")
    const run = read("ce-test-xcode", "references/test-and-report.md")

    expect(body).toMatch(/^description: "Test .* Use when /m)
    expect(body).toContain("**Done:**")
    expect(body).toContain("references/setup-and-build.md")
    expect(body).toContain("references/test-and-report.md")
    expect(body).not.toContain("mcp__xcodebuildmcp__")
    expect(run).toContain("xcrun simctl openurl")
    expect(setup).toContain("An empty argument or `current`")
    expect(run).toContain("An unanswered check is `SKIP`")
    expect(run).toContain("Only an applied fix triggers rebuild and retest")
    expect(setup).toContain("Testing does not authorize installing or configuring it")
  })

  test("ce-polish loads startup mechanics and routes local commit ownership", () => {
    const body = read("ce-polish")
    const run = read("ce-polish", "references/run.md")

    expect(body).toMatch(/^description: "Polish .* Use when /m)
    expect(body).toContain("**Done:**")
    expect(body).toContain("references/run.md")
    expect(body).toContain("invoke `ce-commit`")
    expect(body).not.toContain("agent-browser")
    expect(run).toContain("scripts/read-launch-json.sh")
    expect(run).toContain("scripts/resolve-port.sh")
    expect(run).toContain("command, working directory, and port are resolved")
    expect(run).toContain("a response from some other process is not success")
    expect(run).toContain("active harness")
  })

  test("Riffrec uses one portable analyzer invocation for both analysis paths", () => {
    const body = read("ce-riffrec-feedback-analysis")
    const analyzer = read("ce-riffrec-feedback-analysis", "references/analyzer.md")
    const quick = read("ce-riffrec-feedback-analysis", "references/quick-bug-report.md")
    const extensive = read("ce-riffrec-feedback-analysis", "references/extensive-analysis.md")

    expect(body).toMatch(/^description: "Analyze .* Use when .* Use for /m)
    expect(body).not.toMatch(/^description: .*\.(?:mp4|mov|webm|m4a|mp3|wav)/m)
    expect(body).toContain("**Done:**")
    expect(body).toContain("references/analyzer.md")
    expect(body).toContain("unless the user explicitly asked only to extract or analyze artifacts")
    expect(analyzer).toContain("for c in python3 python py")
    expect(analyzer).toContain('"$PY" "$SKILL_DIR/scripts/analyze_riffrec_zip.py"')
    expect(analyzer).toContain('OUTPUT_DIR=""')
    expect(analyzer).toContain('[ -z "$OUTPUT_DIR" ]')
    expect(analyzer).not.toContain("<input>")
    expect(quick).not.toMatch(/\bpython3?\b/)
    expect(extensive).toContain("leave it empty so the analyzer owns its default")
    expect(extensive).not.toMatch(/\bpython3?\b/)
  })
})
