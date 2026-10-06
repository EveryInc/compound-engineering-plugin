import { afterEach, describe, expect, test } from "bun:test"
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { adapterSpecsFromPackage, bumpAcpxPin, describeBump } from "../scripts/bump-acpx-pin"

const OLD_SPECS = "@agentclientprotocol/codex-acp@^1.1.5 @agentclientprotocol/claude-agent-acp@^0.81.2"
const NEW_SPECS = "@agentclientprotocol/codex-acp@^1.2.0 @agentclientprotocol/claude-agent-acp@^0.81.2"

const WORKER = `#!/usr/bin/env bash
# --- acpx transport (keep byte-identical across migrated peer workers) -----
ACPX_VERSION="0.19.4"
ACPX_SCOPE=""
run() { npx -y "acpx@$ACPX_VERSION" "$@"; }   # ACPX_VERSION="0.19.4" in a comment stays
# --- end acpx transport
`
const CHECK_HEALTH = `#!/usr/bin/env bash
ACPX_VERSION="0.19.4"
ACPX_ADAPTER_SPECS="${OLD_SPECS}"
echo "acpx@$ACPX_VERSION $ACPX_ADAPTER_SPECS"
`
const PIN = `// ACPX_PIN mirrors the workers' ACPX_VERSION\nexport const ACPX_PIN = "0.19.4"\n`
const SKILL_MD = `Run \`npx acpx@0.19.4\`.\nACPX_VERSION="0.19.4"\n`

const roots: string[] = []
afterEach(() => roots.splice(0).forEach((root) => rmSync(root, { recursive: true, force: true })))

function fixture(files: Record<string, string>) {
  const root = mkdtempSync(path.join(tmpdir(), "bump-acpx-pin-"))
  roots.push(root)
  for (const [rel, content] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true })
    writeFileSync(path.join(root, rel), content)
  }
  return root
}

const TREE = {
  "skills/ce-pov/scripts/cross-model-pov.sh": WORKER,
  "skills/ce-doc-review/scripts/nested/cross-model-doc-review.sh": WORKER,
  "skills/ce-setup/scripts/check-health": CHECK_HEALTH,
  "skills/ce-pov/SKILL.md": SKILL_MD,
  "skills/ce-pov/scripts/unrelated.sh": "echo hi\n",
  "tests/helpers/acpx-pin.ts": PIN,
}

const read = (root: string, rel: string) => readFileSync(path.join(root, rel), "utf8")

describe("bump-acpx-pin", () => {
  test("updates every pin copy and the adapter specs, leaving unrelated lines untouched", () => {
    const root = fixture(TREE)
    const result = bumpAcpxPin(root, "0.20.0", NEW_SPECS)

    const bumpedWorker = WORKER.replace('ACPX_VERSION="0.19.4"\n', 'ACPX_VERSION="0.20.0"\n')
    expect(read(root, "skills/ce-pov/scripts/cross-model-pov.sh")).toBe(bumpedWorker)
    expect(read(root, "skills/ce-doc-review/scripts/nested/cross-model-doc-review.sh")).toBe(bumpedWorker)
    expect(read(root, "skills/ce-setup/scripts/check-health")).toBe(
      CHECK_HEALTH.replace('"0.19.4"', '"0.20.0"').replace(OLD_SPECS, NEW_SPECS),
    )
    expect(read(root, "tests/helpers/acpx-pin.ts")).toBe(PIN.replace("0.19.4", "0.20.0"))
    expect(read(root, "skills/ce-pov/SKILL.md")).toBe(SKILL_MD)
    expect(result.changedFiles).toEqual([
      "skills/ce-doc-review/scripts/nested/cross-model-doc-review.sh",
      "skills/ce-pov/scripts/cross-model-pov.sh",
      "skills/ce-setup/scripts/check-health",
      "tests/helpers/acpx-pin.ts",
    ])
    const summary = describeBump(result)
    expect(summary).toContain("- `@agentclientprotocol/codex-acp@^1.2.0` (changed, was `@agentclientprotocol/codex-acp@^1.1.5`)")
    expect(summary).toContain("- `@agentclientprotocol/claude-agent-acp@^0.81.2` (unchanged)")
  })

  test("a second run is a no-op", () => {
    const root = fixture(TREE)
    bumpAcpxPin(root, "0.20.0", NEW_SPECS)
    const after = Object.keys(TREE).map((rel) => read(root, rel))
    const again = bumpAcpxPin(root, "0.20.0", NEW_SPECS)
    expect(again.changedFiles).toEqual([])
    expect(Object.keys(TREE).map((rel) => read(root, rel))).toEqual(after)
  })

  test.each([
    ["single-quoted pin", "skills/ce-pov/scripts/cross-model-pov.sh", WORKER.replace('"0.19.4"\nACPX_SCOPE', "'0.19.4'\nACPX_SCOPE")],
    ["trailing comment", "skills/ce-pov/scripts/cross-model-pov.sh", WORKER.replace('"0.19.4"\nACPX_SCOPE', '"0.19.4"  # pin\nACPX_SCOPE')],
    ["unquoted specs", "skills/ce-setup/scripts/check-health", CHECK_HEALTH.replace(`"${OLD_SPECS}"`, OLD_SPECS)],
    ["pin helper reshaped", "tests/helpers/acpx-pin.ts", `export const ACPX_PIN: string = "0.19.4"\n`],
  ])("a pin copy with unexpected formatting fails loudly (%s) and writes nothing", (_name, rel, content) => {
    const root = fixture({ ...TREE, [rel]: content })
    expect(() => bumpAcpxPin(root, "0.20.0", NEW_SPECS)).toThrow(/unexpected pin format/)
    for (const [file, original] of Object.entries({ ...TREE, [rel]: content })) expect(read(root, file)).toBe(original)
  })

  const { "skills/ce-pov/scripts/cross-model-pov.sh": _pov, "skills/ce-doc-review/scripts/nested/cross-model-doc-review.sh": _doc, "skills/ce-setup/scripts/check-health": _health, ...WITHOUT_SCRIPT_PINS } = TREE
  test.each([
    ["pin copies disagree", { ...TREE, "skills/ce-pov/scripts/cross-model-pov.sh": WORKER.replace('ACPX_VERSION="0.19.4"\n', 'ACPX_VERSION="0.19.3"\n') }, /pin copies disagree/],
    ["adapter spec copies disagree", { ...TREE, "skills/other/scripts/specs.sh": `ACPX_ADAPTER_SPECS="${NEW_SPECS}"\n` }, /adapter spec copies disagree/],
    ["one file assigns the pin twice", { ...TREE, "skills/ce-pov/scripts/cross-model-pov.sh": `${WORKER}ACPX_VERSION="0.19.4"\n` }, /2 assignments of the same pin/],
    ["no script carries the pin", WITHOUT_SCRIPT_PINS, /no ACPX_VERSION copy found/],
  ])("fails loudly and writes nothing when %s", (_name, files, error) => {
    const root = fixture(files as Record<string, string>)
    expect(() => bumpAcpxPin(root, "0.20.0", NEW_SPECS)).toThrow(error)
    for (const [file, original] of Object.entries(files as Record<string, string>)) expect(read(root, file)).toBe(original)
  })

  test("refuses a package whose agent registry it cannot read", () => {
    const root = fixture({
      "package.json": JSON.stringify({ name: "acpx", version: "0.20.0" }),
      "dist/agent-registry-abc123.js": "const AGENT_DEFINITIONS = {};\n",
    })
    expect(() => adapterSpecsFromPackage(root, "0.20.0")).toThrow(/ACP_ADAPTER_PACKAGE_RANGES not found/)
  })

  test("derives adapter specs from an extracted acpx package", () => {
    const root = fixture({
      "package.json": JSON.stringify({ name: "acpx", version: "0.20.0" }),
      "dist/agent-registry-abc123.js": `const ACP_ADAPTER_PACKAGE_RANGES = {
\tpi: "^0.0.33",
\tcodex: "^1.2.0",
\tclaude: "^0.81.2"
};
const AGENT_DEFINITIONS = {
\tcodex: { package: { packageName: "@agentclientprotocol/codex-acp", packageRange: ACP_ADAPTER_PACKAGE_RANGES.codex } },
\tclaude: { package: {
\t\tpackageName: "@agentclientprotocol/claude-agent-acp",
\t\tpackageRange: ACP_ADAPTER_PACKAGE_RANGES.claude
\t} }
};
`,
    })
    expect(adapterSpecsFromPackage(root, "0.20.0")).toBe(NEW_SPECS)
    expect(() => adapterSpecsFromPackage(root, "0.21.0")).toThrow(/expected 0.21.0/)
  })
})
