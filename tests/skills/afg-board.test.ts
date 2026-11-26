import { afterAll, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import path from "node:path"
import { cleanup, HANDS_OFF, ME, World } from "../helpers/afg-world"

setDefaultTimeout(60_000)
afterAll(cleanup)

const BOARD = path.join(__dirname, "../../skills/afg/scripts/board.py")
function board(w: World) {
  const home = path.join(w.root, "ce")
  const r = spawnSync("python3", [BOARD], { cwd: w.repo, env: { ...w.env, COMPOUND_ENGINEERING_HOME: home }, encoding: "utf8" })
  if (r.status !== 0) throw new Error(r.stderr)
  return { out: JSON.parse(r.stdout).repos[0], md: readFileSync(path.join(home, "afg/board.md"), "utf8") }
}

test("every open pull request and unlanded commit has one next step and someone to take it", () => {
  const w = new World(HANDS_OFF + "autonomous_ignored_checks: [old/preview]\n").begin()
  const job = (what: string, ...more: string[]) => w.run(["job", "--token", w.token, "--motion", "stack", "--what", what, ...more]).json.job
  const ours = job("ours", "--opens-pr")
  const head = w.pr(7, { "app.rb": "two\n" }, { login: ME })
  w.run(["adopt", "--token", w.token, "--job", ours, "--pr", "7", "--head", head])
  w.pr(8, { "b.rb": "two\n" }, { login: ME })
  w.w.prs[7].statusCheckRollup = [{ name: "old/preview", conclusion: "FAILURE" }, { name: "ci", conclusion: "SUCCESS" }]
  w.w.prs[8].statusCheckRollup = [{ name: "ci", conclusion: "FAILURE" }]
  w.save()
  job("not built yet")
  w.run(["park", "--token", w.token, "--item", "idea:x", "--why", "because", "--recommend", "do it", "--needs", "fact", "--tried", "looked"])
  const { out, md } = board(w)
  expect(out.running).toBe(true)
  expect(out.run.map((i: any) => [i.kind, i.step])).toEqual([
    ["pr", "test, review and land it"],
    ["job", "finish it, or end it when its worker is gone"],
  ])
  expect(md).toContain("Your own pull requests:\n- [#8](u)")
  expect(md).toContain("`idea:x` because: do it")
})
