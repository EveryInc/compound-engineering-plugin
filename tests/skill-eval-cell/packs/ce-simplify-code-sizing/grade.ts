// Grade one ce-simplify-code sizing run.
// Usage: bun grade.ts <run-out-dir> <host> <scenario> <arm>
// Prints one JSON line: the observations and, for the post arm, each failed expectation.
import fs from "node:fs"
import path from "node:path"
import { claudeRun, codexRun, runCompleted, type Thread } from "../lfg-stage-cost/collect"

const [out, host, scenario, arm] = process.argv.slice(2)
const hostDir = path.join(out, "hosts", host)
const workspace = path.join(hostDir, "workspace")
const fixture = path.join(path.dirname(path.dirname(out)), "fixtures", path.basename(out))
const read = (p: string) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "")

const manifest = path.join(out, "input-manifest.json")
const started = fs.existsSync(manifest) ? Date.parse(JSON.parse(read(manifest)).started_at) : 0
const thread = host === "codex" ? codexRun(workspace, started - 60_000) : claudeRun(workspace)

const countAgents = (t: Thread): number => Object.values(t.children).reduce((n, c) => n + 1 + countAgents(c), 0)
const texts = (t: Thread): string[] => t.turns.flatMap((turn) => turn.calls.flatMap((c) => ("text" in c ? [c.text] : [])))
const simplifyRead = /skills\/ce-simplify-code\/(SKILL\.md|references\/)|"skill"\s*:\s*"(?:[a-z-]+:)?ce-simplify-code"/
const stdout = read(path.join(hostDir, "stdout.txt"))
const fn = (src: string, name: string) => src.match(new RegExp(`export function ${name}\\b[\\s\\S]*?\\n\\}\\n`))?.[0] ?? null
const same = (rel: string) => read(path.join(workspace, rel)) === read(path.join(fixture, rel))

const obs = {
  completed: runCompleted(hostDir),
  found_log: Boolean(thread),
  agents: thread ? countAgents(thread) : null,
  simplify_read: thread ? texts(thread).some((t) => simplifyRead.test(t)) : null,
  names_single_pass: /single[- ]pass(?! with)/i.test(stdout),
  src_unchanged: same("src/orders.ts") && same("src/money.ts"),
  plan_unchanged: same("docs/plans/2026-11-04-discount-plan.md"),
  pre_sha_untouched: ["taxFor", "shippingFor", "grandTotal"].every(
    (name) => fn(read(path.join(workspace, "src/orders.ts")), name) === fn(read(path.join(fixture, "src/orders.ts")), name),
  ),
}

const expect: Record<string, [string, boolean][]> = {
  cut12: [["one reviewer or inline", (obs.agents ?? 9) <= 1], ["summary names single-pass", obs.names_single_pass]],
  cut12noise: [
    ["one reviewer or inline", (obs.agents ?? 9) <= 1],
    ["summary names single-pass", obs.names_single_pass],
    ["plan untouched", obs.plan_unchanged],
  ],
  cut45: [["full team (3+ reviewers)", (obs.agents ?? 0) >= 3], ["summary names a mode", /full[- ]team|single[- ]pass/i.test(stdout)]],
  nocut12: [["full team (3+ reviewers)", (obs.agents ?? 0) >= 3], ["no single-pass", !obs.names_single_pass]],
  s_bare12: [["tree unchanged", obs.src_unchanged], ["full team (3+ reviewers)", (obs.agents ?? 0) >= 3], ["no single-pass", !obs.names_single_pass]],
  lfg5: [["no agents", obs.agents === 0], ["tree unchanged", obs.src_unchanged], ["reports the skip", /skip/i.test(stdout)]],
  lfg_ae6: [
    ["ce-simplify-code read", obs.simplify_read === true],
    ["one reviewer or inline", (obs.agents ?? 9) <= 1],
    ["summary names single-pass", obs.names_single_pass],
    ["pre-SHA code untouched", obs.pre_sha_untouched],
  ],
}
const checks = [["run completed", obs.completed] as [string, boolean], ...(expect[scenario] ?? [])]
const failed = checks.filter(([, ok]) => !ok).map(([name]) => name)
console.log(JSON.stringify({ scenario, arm, host, run: path.basename(out), ...obs, pass: failed.length === 0, failed }))
if (arm === "post" && failed.length) process.exitCode = 1
