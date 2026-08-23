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
//
// The runner derives its own supervisor hard window (#1271). Orchestrator prose
// only prints the aggregate deadline (`knob + 10`); it must not re-derive
// CE_PEER_HARD_SECS (that arithmetic failed repeatedly under #1267).

const REPO_ROOT = path.join(__dirname, "../..")
const read = (rel: string) => readFileSync(path.join(REPO_ROOT, rel), "utf8")

const SCRIPTS = {
  "ce-code-review": "skills/ce-code-review/scripts/cross-model-adversarial-review.sh",
  "ce-doc-review": "skills/ce-doc-review/scripts/cross-model-doc-review.sh",
  "ce-pov": "skills/ce-pov/scripts/cross-model-pov.sh",
} as const

// References that document a `start` invocation and therefore own the deadline
// print. Runner hard-window derivation lives in peer-job-runner.py, not here.
const DISPATCH_REFS = {
  "ce-code-review": "skills/ce-code-review/references/cross-model-review.md",
  "ce-doc-review": "skills/ce-doc-review/references/cross-model-review.md",
} as const

const POV_REF = "skills/ce-pov/references/cross-model-panel.md"
const RUNNER = "skills/ce-doc-review/scripts/peer-job-runner.py"

const DEADLINE_GRACE = 10 // orchestrator deadline sits this far past the script cap
const RUNNER_GRACE = 30 // runner supervisor window sits this far past the knob
const RUNNER_HARD_FLOOR = 1230 // clears the highest worker default (review :-1200)

function caps(rel: string): { idle: number; hard: number } {
  const src = read(rel)
  const idle = src.match(/IDLE_SECS="\$\{CROSS_MODEL_IDLE_SECS:-(\d+)\}"/)
  const hard = src.match(/^HARD_SECS="\$\{CROSS_MODEL_HARD_SECS:-(\d+)\}"/m)
  if (!idle || !hard) throw new Error(`missing IDLE_SECS/HARD_SECS defaults in ${rel}`)
  return { idle: Number(idle[1]), hard: Number(hard[1]) }
}

// Only routes that cannot stream (today: grok-cli with --json-schema) stay on
// UNGUARDED_HARD_SECS. Claude/cursor-family stream and share HARD_SECS + IDLE_SECS
// via run_timeout_cmd's idle poll (#1270).
function unguardedHard(rel: string): number | null {
  const m = read(rel).match(/UNGUARDED_HARD_SECS="\$\{CROSS_MODEL_HARD_SECS:-(\d+)\}"/)
  return m ? Number(m[1]) : null
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

  test("grok-cli stays hard-only below the raised backstop", () => {
    for (const [skill, rel] of Object.entries(SCRIPTS)) {
      const { hard } = caps(rel)
      const unguarded = unguardedHard(rel)
      const src = read(rel)
      if (!/run_timeout_cmd\(\)/.test(src)) continue
      // Streaming routes share HARD_SECS; only grok-cli keeps the unguarded bound.
      // Retry-aware workers pass a remaining attempt budget derived from the same
      // route-specific source instead of reopening the full cap.
      if (src.includes("ATTEMPT_HARD_SECS")) {
        expect(src, `${skill} must derive grok-cli from UNGUARDED`).toContain(
          'if [ "$1" = "grok-cli" ]; then printf \'%s\\n\' "$UNGUARDED_HARD_SECS"',
        )
        expect(src, `${skill} must hard-only grok-cli`).toContain(
          'run_timeout_cmd "" "$attempt_hard" no-idle',
        )
        expect(src, `${skill} must idle-guard claude`).toContain(
          'run_timeout_cmd "$PROMPT_FILE" "$attempt_hard" idle',
        )
      } else {
        expect(src, `${skill} must hard-only grok-cli`).toContain(
          'run_timeout_cmd "" "$UNGUARDED_HARD_SECS" no-idle',
        )
        expect(src, `${skill} must idle-guard claude`).toContain(
          'run_timeout_cmd "$PROMPT_FILE" "$HARD_SECS" idle',
        )
      }
      if (hard > 600) {
        expect(unguarded, `${skill} must keep UNGUARDED for grok-cli`).not.toBeNull()
        expect(unguarded!, `${skill} unguarded cap`).toBeLessThanOrEqual(600)
      }
      if (unguarded !== null) expect(unguarded, `${skill} unguarded cap`).toBeLessThanOrEqual(hard)
    }
  })

  test("run_timeout_cmd idle mode polls PEERLOG like run_codex_cmd", () => {
    for (const [skill, rel] of Object.entries(SCRIPTS)) {
      const src = read(rel)
      const body = src.slice(src.indexOf("run_timeout_cmd() {"))
      const fn = body.slice(0, body.indexOf("\n}\n") + 1)
      expect(fn, `${skill} idle mode must poll PEERLOG`).toContain('wc -c <"$PEERLOG"')
      expect(fn, `${skill} idle mode must reap on IDLE_SECS`).toContain('"$IDLE_SECS"')
      expect(fn, `${skill} must accept no-idle for grok-cli`).toContain('idle_mode="${3:-idle}"')
    }
  })

  test("streaming adapters use stream-json; grok-cli stays on buffered json", () => {
    for (const [skill, rel] of Object.entries(SCRIPTS)) {
      const src = read(rel)
      expect(src, `${skill} claude streams`).toMatch(
        /claude[\s\S]*?--output-format stream-json --verbose/,
      )
      expect(src, `${skill} cursor-family streams`).toContain("--output-format stream-json")
      // grok-cli schema path remains buffered json (schema vs stream mutual exclusion).
      expect(src, `${skill} grok-cli stays json`).toMatch(
        /grok-cli\)[\s\S]*?--json-schema "\$SCHEMA_REF" --output-format json/,
      )
    }
  })

  test("the adopted luna/xhigh tier gets a backstop clear of its observed tail", () => {
    // Benchmarked tail (max ~419s) was measured on small single-file diffs; a
    // large-diff run streams well past it, so the backstop needs real headroom.
    expect(caps(SCRIPTS["ce-code-review"]).hard).toBeGreaterThanOrEqual(1200)
  })

  test("the runner derives its hard window from CROSS_MODEL_HARD_SECS", () => {
    // Behavioral cases live in tests/fixtures/peer-job-runner-unit.py
    // (HardDefaultFromCrossModel). This pins the formula constants so a prose
    // reversion cannot quietly restore a static 630 default.
    const src = read(RUNNER)
    expect(src).toContain(`_RUNNER_HARD_FLOOR = ${RUNNER_HARD_FLOOR}`)
    expect(src).toContain(`_RUNNER_HARD_GRACE = ${RUNNER_GRACE}`)
    expect(src).toContain("def _derived_hard_default()")
    expect(src).toMatch(/max\(_RUNNER_HARD_FLOOR,\s*cross \+ _RUNNER_HARD_GRACE\)/)
    expect(src).toContain('_env_num("CE_PEER_HARD_SECS", _derived_hard_default(), float)')
  })

  test("the runner floor clears every skill's worker hard default", () => {
    for (const [skill, rel] of Object.entries(SCRIPTS)) {
      const { hard } = caps(rel)
      expect(
        RUNNER_HARD_FLOOR,
        `${skill}: runner floor must sit at/above worker default + grace`,
      ).toBeGreaterThanOrEqual(hard + RUNNER_GRACE)
    }
  })

  test("the runner window is the outermost of the three", () => {
    expect(RUNNER_GRACE).toBeGreaterThan(DEADLINE_GRACE)
    expect(RUNNER_HARD_FLOOR).toBeGreaterThan(caps(SCRIPTS["ce-code-review"]).hard + DEADLINE_GRACE)
  })

  test("start snippets derive only the orchestrator deadline, not the runner window", () => {
    for (const [skill, rel] of Object.entries(DISPATCH_REFS)) {
      const doc = read(rel)
      const { hard } = caps(SCRIPTS[skill as keyof typeof SCRIPTS])

      // Orchestrator deadline receipt — still printed at dispatch.
      expect(doc, `${skill} deadline receipt`).toContain(
        `echo "peer-deadline-secs=$(( \${CROSS_MODEL_HARD_SECS:-${hard}} + ${DEADLINE_GRACE} ))"`,
      )
      // Runner derivation moved into peer-job-runner.py (#1271). Clear ambient
      // CE_PEER_HARD_SECS so a stale export cannot undercut it; never set a
      // numeric value or invent PEER_HARD arithmetic here.
      expect(doc, `${skill} must not derive CE_PEER_HARD_SECS in prose`).not.toContain(
        'CE_PEER_HARD_SECS="$((',
      )
      expect(doc, `${skill} must not invent PEER_HARD`).not.toContain("PEER_HARD=")
      // The worker must keep its OWN route-aware defaults.
      expect(doc, `${skill} must not forward a resolved cap to the worker`).not.toContain(
        'CROSS_MODEL_HARD_SECS="$PEER_HARD"',
      )

      // Deadline print is load-bearing and shell state does not persist between
      // tool calls, so it must sit in the same fenced block as `start`.
      const blocks = doc.match(/```bash\n[\s\S]*?```/g) ?? []
      const startBlocks = blocks.filter((b) => /peer-job-runner\.py"? start|start --skill/.test(b))
      expect(startBlocks.length, `${skill} documents a start block`).toBeGreaterThan(0)
      for (const b of startBlocks) {
        expect(b, `${skill} must print peer-deadline-secs in the same shell as start`).toContain(
          "peer-deadline-secs=$((",
        )
        expect(b, `${skill} must clear ambient CE_PEER_HARD_SECS on start`).toMatch(
          /CE_PEER_HARD_SECS=\s/,
        )
        expect(b, `${skill} must not set a numeric CE_PEER_HARD_SECS`).not.toMatch(
          /CE_PEER_HARD_SECS=\d/,
        )
      }
    }
  })

  test("ce-code-review states the derived deadline default consistently", () => {
    const { hard } = caps(SCRIPTS["ce-code-review"])
    expect(read(DISPATCH_REFS["ce-code-review"])).toContain(`${hard + DEADLINE_GRACE}s by default`)
  })

  test("ce-pov states its aggregate-deadline default", () => {
    const { hard } = caps(SCRIPTS["ce-pov"])
    expect(read(POV_REF)).toContain(`${hard + DEADLINE_GRACE}s by default`)
  })

  test("ce-pov does not ask the orchestrator to raise CE_PEER_HARD_SECS", () => {
    const doc = read(POV_REF)
    expect(doc).toContain("widens the runner window automatically")
    expect(doc).toContain("CE_PEER_HARD_SECS=")
    expect(doc).not.toMatch(/also requires raising\s*`?CE_PEER_HARD_SECS/)
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
      POV_REF,
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
