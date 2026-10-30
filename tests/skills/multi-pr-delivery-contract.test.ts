import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

// A live 8-PR plan showed standalone ce-work stopping after PR1 because no skill
// said how a multi-PR plan is built, published, gated on deploys, or resumed.
describe("multi-PR plan delivery contract", () => {
  test("ce-work routes a standalone multi-PR run to its delivery reference, not return-to-caller", async () => {
    const intake = await read("skills/ce-work/references/work-intake.md")
    expect(intake).toContain("references/multi-pr-delivery.md")
    const delivery = await read("skills/ce-work/references/multi-pr-delivery.md")
    expect(delivery).toContain("mode:return-to-caller")
    expect(delivery).toContain("main thread")
    expect(delivery).toContain("plan_group:")
  })

  test("ce-code-review accepts a plan_group token that scopes plan completeness", async () => {
    expect(await read("skills/ce-code-review/references/modes-and-output.md")).toContain("`plan_group:")
    expect(await read("skills/ce-code-review/references/intent-and-plan.md")).toContain("`plan_group:")
  })

  test("ce-plan PR groups carry a Waits on line with deploy dependencies", async () => {
    const structure = await read("skills/ce-plan/references/structure.md")
    expect(structure).toContain("`Waits on:`")
    expect(structure).toMatch(/Safe after every merge[^\n]*deploy/)
  })

  test("lfg does not carry a stack-land grant past a deploy dependency", async () => {
    const shipping = await read("skills/lfg/references/shipping.md")
    // The posture is chosen by ce-commit-push-pr from land intent in step 9, so the gate must sit there.
    const step9 = shipping.slice(shipping.indexOf("## Step 9 — what LFG passes"), shipping.indexOf("## Step 10"))
    expect(step9).toMatch(/deploy dependency, leave land intent out[^\n]*posture:stack-ready/)
  })

  test("ce-doc-review records non-interactive leftovers and removes resolved entries", async () => {
    const defer = await read("skills/ce-doc-review/references/open-questions-defer.md")
    expect(defer).not.toContain("Interactive mode only.")
    expect(defer).toContain("Non-interactive mode")
    expect(defer).toContain("do not block implementation")
    expect(defer).toContain("removal rule")
    for (const file of ["walkthrough.md", "bulk-preview.md"]) {
      expect(await read(`skills/ce-doc-review/references/${file}`)).toContain("removal rule")
    }
  })
})
