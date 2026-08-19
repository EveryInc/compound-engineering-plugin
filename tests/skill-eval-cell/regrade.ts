import fs from "node:fs"
import { scenarioById } from "./catalog"
import { gradeArm, type EvalArm } from "./grade"

const packPath = process.argv[2]
if (!packPath) {
  console.error("usage: bun tests/skill-eval-cell/regrade.ts <pack.json>")
  process.exit(2)
}
const pack = JSON.parse(fs.readFileSync(packPath, "utf8"))
for (const [id, row] of Object.entries(pack.scenarios as Record<string, any>)) {
  const scenario = scenarioById(id)
  if (!scenario) continue
  for (const [arm, info] of Object.entries(row.arms as Record<string, any>)) {
    const graded = gradeArm({ out: info.out, scenario, arm: arm as EvalArm })
    info.grades = graded.grades
    info.ok = graded.ok
    info.pointer_ok = graded.pointer_ok
  }
}
fs.writeFileSync(packPath, `${JSON.stringify(pack, null, 2)}\n`)
console.log(packPath)
