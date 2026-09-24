import { describe, expect, test } from "bun:test"
import { promises as fs } from "fs"
import path from "path"

// Mechanical guards on the ce-polish live-mode prose (U9): every skill-local
// path the live files name resolves inside the skill, SKILL.md stays under
// the Codex prompt ceiling, live mode adds no skill directory, and the seams the
// helper (U8) and the loop tests depend on are named where the agent reads
// them. Behavioral judgment (the F1-F3 dry read) is a fresh-agent eval, not
// this file.

const repoRoot = path.join(import.meta.dir, "..", "..")
const skillDir = path.join(repoRoot, "skills", "ce-polish")
const referencesDir = path.join(skillDir, "references")
const scriptsDir = path.join(skillDir, "scripts")
const SKILL_MD_BYTE_CEILING = 8000

// riffrec main commit the fixtures and contract mirror refer to (tests/fixtures/ce-polish-live/SOURCE.md).
const RIFFREC_REFERENCE_SHA = "1393c17082e3b6a5b04d219fc6ae9083018c96a2"
// First npm release of riffrec that carries live mode; install-riffrec.md installs `riffrec@^` this.
const RIFFREC_MIN_VERSION = "2.2.1"

const LIVE_FILES = ["live-start.md", "live-loop.md", "live-remote.md", "install-riffrec.md", "live-stream-contract.md"]

async function read(relative: string): Promise<string> {
  return fs.readFile(path.join(skillDir, relative), "utf8")
}

describe("ce-polish live-mode prose", () => {
  test("every skill-local path named in SKILL.md and the live references resolves inside the skill", async () => {
    const files = ["SKILL.md", ...LIVE_FILES.map((file) => `references/${file}`)]
    const seen = new Set<string>()
    for (const file of files) {
      const text = await read(file)
      for (const match of text.matchAll(/(?<![\w.-])((?:references|scripts)\/[\w./-]+\.(?:md|sh|js))/g)) {
        const relative = match[1]
        seen.add(relative)
        expect(relative, `${file} references ${relative}`).not.toContain("..")
        expect(await fs.exists(path.join(skillDir, relative)), `${file} -> ${relative}`).toBe(true)
      }
      expect(text, file).not.toMatch(/\.\.\/[\w-]+\/(?:references|scripts|assets)/)
      expect(text, file).not.toContain("${CLAUDE_")
    }
    for (const required of [
      "references/live-start.md", "references/live-loop.md", "references/live-remote.md",
      "references/install-riffrec.md", "scripts/live-endpoint.js", "scripts/detect-riffrec.sh",
    ]) {
      expect([...seen], required).toContain(required)
    }
  })

  test("every live reference and script exists; the prose invokes both scripts through an interpreter", async () => {
    for (const file of LIVE_FILES) expect(await fs.exists(path.join(referencesDir, file)), file).toBe(true)
    for (const script of ["live-endpoint.js", "detect-riffrec.sh"]) expect(await fs.exists(path.join(scriptsDir, script)), script).toBe(true)
    const start = await read("references/live-start.md")
    expect(start).toContain('bash "$SKILL_DIR/scripts/detect-riffrec.sh"')
    expect(start).toContain('node "$SKILL_DIR/scripts/live-endpoint.js" start')
    expect((await read("references/live-loop.md"))).toContain('node "$SKILL_DIR/scripts/live-endpoint.js" wait')
    expect((await read("scripts/detect-riffrec.sh")).startsWith("#!/usr/bin/env bash")).toBe(true)
    expect((await read("scripts/live-endpoint.js")).startsWith("#!/usr/bin/env node")).toBe(true)
  })

  test("SKILL.md stays under the 8,000-byte ceiling and keeps live mode in references (KTD19)", async () => {
    const skill = await read("SKILL.md")
    expect(Buffer.byteLength(skill, "utf8")).toBeLessThan(SKILL_MD_BYTE_CEILING)
    expect(skill).toMatch(/live or traditional/i)
    expect(skill).toContain("references/live-start.md")
    expect(skill).toContain("references/live-loop.md")
    // The disclosure line (R34): key, interviewer, local endpoint, setup commit that stays.
    expect(skill).toMatch(/OpenAI key/i)
    expect(skill).toMatch(/setup commit/i)
    // Loop mechanics and consent copy do not live in SKILL.md.
    for (const token of ["/checkpoints/", "wait-taken", "riffrec_live=", "--app-origin", "tls_required"]) {
      expect(skill, token).not.toContain(token)
    }
  })

  test("live mode lives inside ce-polish: the skill directory exists and every live reference sits under it", async () => {
    expect(await fs.exists(path.join(skillDir, "SKILL.md"))).toBe(true)
    for (const file of LIVE_FILES) expect(await fs.exists(path.join(referencesDir, file)), file).toBe(true)
  })

  test("live-start.md names the helper start, the fragment handoff, the detect script, and the key precondition (KTD3, KTD20, I4)", async () => {
    const start = await read("references/live-start.md")
    expect(start).toContain("scripts/live-endpoint.js\" start --root")
    expect(start).toContain("--app-origin")
    expect(start).toContain("#riffrec_live=<page_token>&endpoint=<endpoint-url>")
    expect(start).toContain("scripts/detect-riffrec.sh")
    expect(start).toContain("OPENAI_API_KEY")
    expect(start).toContain("state/brief.md")
    expect(start).toMatch(/3,000 characters/)
    // Resume semantics: the same start again reuses the stored tokens; the old URL
    // stands only while its origin does (a taken port hands the rebuild to live-loop.md).
    expect(start).toMatch(/reuses the stored tokens/i)
    expect(start).toMatch(/unless the old port was taken/i)
    expect(start).toMatch(/do not hand over a URL whose origin differs/i)
    // The start envelope fields and that the agent token never prints.
    for (const field of ["`url`", "`port`", "`page_token`"]) expect(start).toContain(field)
    expect(start).toMatch(/agent token never prints/i)
    // Consent decline (R35): stop, offer traditional, name the setup commit.
    expect(start).toMatch(/declines the consent screen/i)
  })

  test("live-loop.md carries the wake envelope, exit codes, ack-first, the agent routes, and the mode table (KTD7, KTD12, R37)", async () => {
    const loop = await read("references/live-loop.md")
    expect(loop).toContain("scripts/live-endpoint.js\" wait --root")
    for (const field of ["`checkpoint_id`", "`mode_at_checkpoint`", "`session_status`", "`units[]`", "`annotations[]`", "`answers[]`"]) expect(loop).toContain(field)
    for (const kind of ["`silence`", "`page_change`", "`send`", "`answer`", "`mode_change`", "`final`"]) expect(loop).toContain(kind)
    for (const code of ["**0**", "**1**", "**2**", "**3**"]) expect(loop).toContain(code)
    expect(loop).toContain("wait-taken")
    expect(loop).toContain("/checkpoints/<checkpoint_id>/ack")
    expect(loop).toContain("/units/<unit_id>/status")
    expect(loop).toContain("/units/<unit_id>/ask")
    expect(loop).toMatch(/Acknowledge first/i)
    // F1 (I4/KTD18): the agent token lives until stop; /session/end retires no token, so the link can run another session; page_lost is acked like any batch.
    expect(loop).toMatch(/agent token lives until `stop`/i)
    expect(loop).toMatch(/`\/session\/end` retires no token/i)
    expect(loop).toMatch(/start another session from the page with the same link/i)
    expect(loop).not.toMatch(/acknowledge it last/i)
    expect(loop).not.toMatch(/returns 404/i)
    expect(loop).toMatch(/never send an `Origin` header/i)
    expect(loop).toContain('"page_lost"')
    for (const mode of ["Instant", "Smart", "Collect"]) expect(loop).toContain(`| ${mode}`.replace("| ", ""))
    expect(loop).toMatch(/\| Class \| Instant \| Smart \| Collect \|/)
    // Statuses the agent posts; the helper must accept every one of them.
    for (const status of ['"accepted"', '"applied"', '"blocked"']) expect(loop).toContain(status)
    // An empty mode_change/final batch is work, and Collect applies at done.
    expect(loop).toMatch(/not a no-op/i)
    expect(loop).toMatch(/residual/i)
    expect(loop).toContain("state/log/")
    expect(loop).toContain("ce-commit")
  })

  test("install-riffrec.md mounts live={{}} with forceEnable and installs the npm release that carries live mode (I5, KTD20)", async () => {
    const install = await read("references/install-riffrec.md")
    expect(install).toContain("<RiffrecProvider forceEnable live={{}}>")
    expect(install).toContain(`\`RIFFREC_MIN_VERSION\` = \`${RIFFREC_MIN_VERSION}\``)
    expect(install).toContain(`<add verb> riffrec@^${RIFFREC_MIN_VERSION}`)
    // The git pin is gone; a leftover git spec in the host app is replaced, not installed.
    expect(install).not.toContain("RIFFREC_MIN_COMMIT")
    expect(install).not.toContain(RIFFREC_REFERENCE_SHA)
    expect(install).not.toMatch(/<add verb> kieranklaassen\/riffrec#/)
    // The detect step still proves the installed build, not the declared range.
    expect(install).toMatch(/dist\/index\.d\.ts/)
    expect(install).toContain("RiffrecLiveConfig")
    expect(install).toContain("LOOK_AT_SCREEN_TOOL")
    expect(install).toMatch(/`installed` and `live_build` must both be true/)
    expect(install).toMatch(/setup commit/i)
    // The endpoint origin is never written into source or config (KTD20).
    expect(install).toMatch(/nothing about the endpoint is written into source/i)
  })

  test("live-remote.md states the HTTPS rule for both origins and the tunnel recipes (R42)", async () => {
    const remote = await read("references/live-remote.md")
    expect(remote).toContain("--host 0.0.0.0")
    expect(remote).toContain("tls_required")
    expect(remote).toContain("X-Forwarded-Proto: https")
    for (const tunnel of ["Tailscale serve", "cloudflared", "ngrok"]) expect(remote).toContain(tunnel)
    expect(remote).toMatch(/microphone and screen capture will be refused until the URL is HTTPS/i)
    expect(remote).toMatch(/name the endpoint origin as the one that must become HTTPS/i)
  })

  test("live-stream-contract.md and the helper agree on the five interviewer tools and the schema version", async () => {
    const contract = await read("references/live-stream-contract.md")
    const helper = await read("scripts/live-endpoint.js")
    const tools = ["record_unit", "update_unit", "withdraw_unit", "relay_answer", "look_at_screen"]
    for (const tool of tools) {
      expect(contract).toContain(`\`${tool}\``)
      expect(helper).toMatch(new RegExp(`"?name"?: "${tool}"`))
    }
    // Exactly riffrec's five: the interviewer sees on request through
    // `look_at_screen` (R7 reversed); timing and state still never move through a tool.
    expect(helper.match(/^    "name": "([a-z_]+)",$/gm)?.map((line) => line.match(/"name": "([a-z_]+)"/)?.[1])).toEqual(tools)
    expect(helper).not.toMatch(/"?name"?: "(emit_checkpoint|report_state|capture_frame)"/)
    // The persona carries the [SCREEN CONTEXT] section the page checks for and
    // never tells the interviewer it cannot see the screen.
    expect(helper).toContain('"[SCREEN CONTEXT]"')
    expect(helper).not.toMatch(/without claiming to see the screen|You do not watch the screen/)
    // The handoff names what now goes to OpenAI beside audio and the brief.
    expect(await read("references/live-start.md")).toMatch(/screenshots of the page when you point at something or ask the interviewer to look go to OpenAI/)
    expect(contract).toContain("live/1")
    expect(helper).toContain('const SCHEMA_VERSION = "live/1"')
    // Abandoned credential paths stay gone (Definition of Done).
    expect(helper).not.toMatch(/cookie/i)
    expect(helper).not.toMatch(/EventSource/)
    expect(helper).not.toMatch(/screens\//)
    expect(helper).not.toMatch(/armSseGrace/)
    expect(helper).toContain("Authorization: Bearer")
  })
})
