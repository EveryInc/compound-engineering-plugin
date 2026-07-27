import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

// The cross-model peer wall-clock budget is expressed in three nested windows:
// the worker script's own hard backstop, the peer-job-runner supervisor window,
// and the orchestrator's aggregate deadline. They must stay one budget derived
// from ONE knob (`CROSS_MODEL_HARD_SECS`). When they drift, the tightest window
// silently reaps a healthy, still-streaming peer and the peer's full spend is
// wasted for no usable output — the failure mode is invisible in the review
// output, so it needs a mechanical guard rather than review vigilance.

const REPO_ROOT = path.join(__dirname, "../..")
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

const SCRIPTS = {
  "ce-code-review": "skills/ce-code-review/scripts/cross-model-adversarial-review.sh",
  "ce-doc-review": "skills/ce-doc-review/scripts/cross-model-doc-review.sh",
  "ce-pov": "skills/ce-pov/scripts/cross-model-pov.sh",
} as const

// References that document a `start` invocation and therefore own the derivation.
// Every skill whose worker reads CROSS_MODEL_HARD_SECS belongs here: a start path
// that omits the runner derivation leaves peer-job-runner.py on its own 630s
// default, which then reaps the worker the raised knob was meant to keep alive.
const DISPATCH_REFS = {
  "ce-code-review": "skills/ce-code-review/references/cross-model-review.md",
  "ce-doc-review": "skills/ce-doc-review/references/cross-model-review.md",
  "ce-pov": "skills/ce-pov/references/cross-model-panel.md",
} as const

const DEADLINE_GRACE = 10 // orchestrator deadline sits this far past the script cap
const RUNNER_GRACE = 30 // runner supervisor window sits this far past the script cap

function caps(rel: string): { idle: number; hard: number } {
  const src = read(rel)
  const idle = src.match(/IDLE_SECS="\$\{CROSS_MODEL_IDLE_SECS:-(\d+)\}"/)
  const hard = src.match(/HARD_SECS="\$\{CROSS_MODEL_HARD_SECS:-(\d+)\}"/)
  if (!idle || !hard) throw new Error(`missing IDLE_SECS/HARD_SECS defaults in ${rel}`)
  return { idle: Number(idle[1]), hard: Number(hard[1]) }
}

describe("cross-model peer budget", () => {
  test("the idle cap is the liveness guard, so it fires before the hard backstop", () => {
    for (const [skill, rel] of Object.entries(SCRIPTS)) {
      const { idle, hard } = caps(rel)
      expect(idle, `${skill} idle cap`).toBeLessThan(hard)
    }
  })

  test("ce-code-review and ce-doc-review keep identical caps (kernel parity)", () => {
    expect(caps(SCRIPTS["ce-code-review"])).toEqual(caps(SCRIPTS["ce-doc-review"]))
  })

  test("the adopted luna/xhigh tier gets a backstop clear of its observed tail", () => {
    // Benchmarked tail (max ~419s) was measured on small single-file diffs; a
    // large-diff run streams well past it, so the backstop needs real headroom.
    expect(caps(SCRIPTS["ce-code-review"]).hard).toBeGreaterThanOrEqual(1200)
  })

  test("the documented start call derives both outer windows from the one knob", () => {
    for (const [skill, rel] of Object.entries(DISPATCH_REFS)) {
      const doc = read(rel)
      const { hard } = caps(SCRIPTS[skill as keyof typeof SCRIPTS])

      // The snippet's own default must equal the script's default.
      expect(doc, `${skill} start snippet default`).toContain(
        `PEER_HARD="\${CROSS_MODEL_HARD_SECS:-${hard}}"`,
      )
      // Runner supervisor window: outermost.
      expect(doc, `${skill} runner window`).toContain(
        `CE_PEER_HARD_SECS="$(( PEER_HARD + ${RUNNER_GRACE} ))"`,
      )
      // Orchestrator deadline: printed so the orchestrator never invents one.
      expect(doc, `${skill} deadline receipt`).toContain(
        `echo "peer-deadline-secs=$(( PEER_HARD + ${DEADLINE_GRACE} ))"`,
      )
      // The worker inherits the same resolved value, not its own default.
      expect(doc, `${skill} worker inheritance`).toContain('CROSS_MODEL_HARD_SECS="$PEER_HARD"')
    }
  })

  test("the runner window is the outermost of the three", () => {
    expect(RUNNER_GRACE).toBeGreaterThan(DEADLINE_GRACE)
  })

  test("ce-code-review states the derived deadline default consistently", () => {
    const { hard } = caps(SCRIPTS["ce-code-review"])
    expect(read(DISPATCH_REFS["ce-code-review"])).toContain(`${hard + DEADLINE_GRACE}s by default`)
  })

  test("ce-pov states its derived aggregate-deadline default", () => {
    const { hard } = caps(SCRIPTS["ce-pov"])
    expect(read(DISPATCH_REFS["ce-pov"])).toContain(`${hard + DEADLINE_GRACE}s by default`)
  })

  test("no orchestrator may bound its total wait below the derived deadline", () => {
    // The other half of the one-knob contract: widening the budget is worthless if
    // the waiting side still stops early. A single bounded slice (capped at the
    // idle window) cannot reach a deadline several times its length, so each
    // orchestrator must repeat slices until terminal or the deadline is spent.
    const banned = [
      /issue one bounded `wait`/,
      /do not start repeated/i,
      /the documented single `wait`/,
    ]
    for (const [skill, rel] of Object.entries(DISPATCH_REFS)) {
      const doc = read(rel)
      for (const pattern of banned) {
        expect(doc, `${skill} must not cap total peer waiting (${pattern})`).not.toMatch(pattern)
      }
      expect(doc, `${skill} must repeat bounded waits to the deadline`).toMatch(
        /[Rr]epeat|until every job is terminal/,
      )
    }
  })

  test("no skill hardcodes a peer deadline or backstop in prose", () => {
    const docs = [
      ...Object.values(DISPATCH_REFS),
      "skills/ce-code-review/SKILL.md",
      "skills/ce-doc-review/references/cross-model-eval.md",
      "skills/ce-pov/references/cross-model-panel.md",
    ]
    // A bare "<n>s deadline" / "<n> seconds have elapsed" / "backstop <n>s" is the
    // drift shape: it survives a knob change and then reaps a healthy peer.
    const banned = [/\b\d{3,}s deadline\b/, /\b\d{3,} seconds have elapsed\b/, /backstop \d{3,}s\b/]
    for (const rel of docs) {
      const doc = read(rel)
      for (const pattern of banned) {
        expect(doc, `${rel} must not hardcode a peer budget (${pattern})`).not.toMatch(pattern)
      }
    }
  })
})
