import { describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import {
  compareObjective,
  decide,
  gatePasses,
  median,
} from "../../skills/ce-optimize/scripts/decide.mjs"

setDefaultTimeout(20_000)

const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-optimize")
const DECIDE = path.join(SKILL_DIR, "scripts", "decide.mjs")
const MEASURE = path.join(SKILL_DIR, "scripts", "measure.sh")
const SCHEMA = readFileSync(path.join(SKILL_DIR, "references", "optimize-spec-schema.yaml"), "utf8")
const LOG_SCHEMA = readFileSync(path.join(SKILL_DIR, "references", "experiment-log-schema.yaml"), "utf8")
const EXAMPLE = readFileSync(
  path.join(SKILL_DIR, "references", "example-expensive-benchmark-spec.yaml"),
  "utf8",
)
const LOOP = readFileSync(path.join(SKILL_DIR, "references", "loop.md"), "utf8")
const MEASUREMENT = readFileSync(path.join(SKILL_DIR, "references", "measurement.md"), "utf8")

const BASELINE_WALL = 372.869
const OBSERVED = {
  nestedConcurrency2: 722.742,
  pythonSerialized: 513.811,
  reusedStub: 494.657,
  nestedConcurrency8: 924.515,
}

function hardSpec(overrides: Record<string, unknown> = {}) {
  return {
    primary: { name: "wall_seconds", direction: "minimize", type: "hard" },
    degenerate_gates: [{ name: "suite_passed", check: "== 1" }],
    comparison: { method: "absolute", noise_threshold: 0.02 },
    ...overrides,
  }
}

function snapshot(wall: number, extras: Record<string, unknown> = {}) {
  return {
    gates: { suite_passed: 1 },
    metrics: {
      wall_seconds: { aggregate: wall, samples: [wall] },
    },
    sample_count: 1,
    ...extras,
  }
}

describe("ce-optimize decide helpers", () => {
  test("median matches the configured aggregation for odd and even samples", () => {
    expect(median([504.309, 368.915, 372.869])).toBe(372.869)
    expect(median([1, 2, 3, 4])).toBe(2.5)
  })

  test("gate operators match the spec schema", () => {
    expect(gatePasses(1, "== 1")).toBe(true)
    expect(gatePasses(0.95, ">= 1.0")).toBe(false)
    expect(gatePasses(0, "<= 0")).toBe(true)
    expect(gatePasses(1, "!= 0")).toBe(true)
    expect(gatePasses("not-a-number", "!= 0")).toBe(false)
    expect(gatePasses(NaN, "!= 0")).toBe(false)
  })
})

describe("legacy single-primary absolute comparison", () => {
  const spec = hardSpec()
  const baseline = snapshot(10)

  test("a delta inside noise_threshold is inconclusive, not a keep", () => {
    const result = decide({ spec, baseline, candidate: snapshot(9.99) })
    expect(result.decision).toBe("inconclusive")
    expect(result.eligible).toBe(false)
    expect(result.next_measurement).toBe("none")
  })

  test("an improvement above noise_threshold is a keep", () => {
    const result = decide({ spec, baseline, candidate: snapshot(9.97) })
    expect(result.decision).toBe("keep")
    expect(result.eligible).toBe(true)
    expect(result.improved_objectives).toEqual(["wall_seconds"])
  })

  test("a clear regression is a revert", () => {
    const result = decide({ spec, baseline, candidate: snapshot(10.05) })
    expect(result.decision).toBe("revert")
    expect(result.eligible).toBe(false)
    expect(result.violated_objectives).toEqual(["wall_seconds"])
  })

  test("a failed degenerate gate is degenerate even if the primary improved", () => {
    const result = decide({
      spec,
      baseline,
      candidate: { gates: { suite_passed: 0 }, metrics: { wall_seconds: { aggregate: 1, samples: [1] } } },
    })
    expect(result.decision).toBe("degenerate")
    expect(result.eligible).toBe(false)
  })

  test("a non-finite gate value fails != instead of passing as NaN", () => {
    const spec = hardSpec({
      degenerate_gates: [{ name: "valid", check: "!= 0" }],
    })
    const result = decide({
      spec,
      baseline: snapshot(10, { gates: { valid: 1 } }),
      candidate: {
        gates: { valid: "not-a-number" },
        metrics: { wall_seconds: { aggregate: 1, samples: [1] } },
      },
    })
    expect(result.decision).toBe("degenerate")
    expect(result.eligible).toBe(false)
    expect(result.violated_objectives).toContain("valid")
  })

  test("a canonical nested spec keeps a clear primary improvement", () => {
    const spec = {
      metric: {
        primary: { name: "wall_seconds", direction: "minimize", type: "hard" },
        degenerate_gates: [{ name: "suite_passed", check: "== 1" }],
      },
      measurement: {
        stability: {
          mode: "stable",
          noise_threshold: 0.02,
          comparison: { method: "absolute" },
        },
      },
    }
    const result = decide({ spec, baseline: snapshot(10), candidate: snapshot(9.97) })
    expect(result.decision).toBe("keep")
    expect(result.eligible).toBe(true)
    expect(result.improved_objectives).toEqual(["wall_seconds"])
  })

  test("a nested spec with required objectives keeps a CI-only win", () => {
    const spec = {
      metric: {
        primary: { name: "local_wall_seconds", direction: "minimize", type: "hard" },
        objectives: [{ name: "ci_critical_path_seconds", direction: "minimize", role: "required" }],
        degenerate_gates: [{ name: "suite_passed", check: "== 1" }],
      },
      measurement: {
        stability: {
          comparison: { method: "relative", relative_threshold: 0.05 },
        },
      },
    }
    const result = decide({
      spec,
      baseline: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 100, samples: [100] },
          ci_critical_path_seconds: { aggregate: 120, samples: [120] },
        },
      },
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 101, samples: [101] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
        },
      },
    })
    expect(result.decision).toBe("keep")
    expect(result.improved_objectives).toEqual(["ci_critical_path_seconds"])
  })

  test("a payload with no primary is an error, not an empty-required inconclusive", () => {
    const result = decide({
      spec: { degenerate_gates: [{ name: "suite_passed", check: "== 1" }] },
      baseline: snapshot(10),
      candidate: snapshot(1),
    })
    expect(result.decision).toBe("error")
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("primary")
  })

  test("the declared stability noise_threshold is the absolute bar when comparison omits it", () => {
    const spec = hardSpec({
      comparison: { method: "absolute" },
      measurement: { stability: { noise_threshold: 0.05 } },
    })
    const insideDefault = decide({ spec, baseline, candidate: snapshot(9.97) })
    expect(insideDefault.decision).toBe("inconclusive")
    expect(insideDefault.eligible).toBe(false)

    const aboveDeclared = decide({ spec, baseline, candidate: snapshot(9.94) })
    expect(aboveDeclared.decision).toBe("keep")
  })

  test("a non-finite required aggregate is an error, not an eligible keep", () => {
    const spec = hardSpec({
      primary: { name: "local_wall_seconds", direction: "minimize", type: "hard" },
      objectives: [{ name: "ci_critical_path_seconds", direction: "minimize", role: "required" }],
    })
    const result = decide({
      spec,
      baseline: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 100, samples: [100] },
          ci_critical_path_seconds: { aggregate: 120, samples: [120] },
        },
      },
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: "bad", samples: ["bad"] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
        },
      },
    })
    expect(result.decision).toBe("error")
    expect(result.eligible).toBe(false)
    expect(result.reason).toContain("local_wall_seconds")
  })
})

describe("multi-objective acceptance", () => {
  const spec = hardSpec({
    primary: { name: "local_wall_seconds", direction: "minimize", type: "hard", target: 300 },
    objectives: [
      { name: "local_wall_seconds", direction: "minimize", role: "required", target: 300 },
      { name: "ci_critical_path_seconds", direction: "minimize", role: "required", target: 90 },
      { name: "runner_minutes", direction: "minimize", role: "required", target: 40 },
    ],
    comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
  })

  const baseline = {
    gates: { suite_passed: 1 },
    metrics: {
      local_wall_seconds: { aggregate: BASELINE_WALL, samples: [BASELINE_WALL] },
      ci_critical_path_seconds: { aggregate: 120, samples: [120] },
      runner_minutes: { aggregate: 50, samples: [50] },
    },
  }

  test("a CI-only win that does not regress the other required objectives is eligible", () => {
    const result = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 370, samples: [370] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
          runner_minutes: { aggregate: 49, samples: [49] },
        },
      },
    })
    expect(result.eligible).toBe(true)
    expect(result.decision).toBe("keep")
    expect(result.improved_objectives).toEqual(["ci_critical_path_seconds"])
    expect(result.violated_objectives).toEqual([])
    expect(result.rank_score).toBeGreaterThan(0)
  })

  test("a CI win that regresses local wall beyond the threshold is not eligible", () => {
    const result = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 494.657, samples: [494.657] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
          runner_minutes: { aggregate: 49, samples: [49] },
        },
      },
    })
    expect(result.eligible).toBe(false)
    expect(result.decision).toBe("revert")
    expect(result.violated_objectives).toContain("local_wall_seconds")
  })

  test("the primary remains required when objectives omit it", () => {
    const spec = hardSpec({
      primary: { name: "local_wall_seconds", direction: "minimize", type: "hard" },
      objectives: [{ name: "ci_critical_path_seconds", direction: "minimize", role: "required" }],
      comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
    })
    const result = decide({
      spec,
      baseline: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 100, samples: [100] },
          ci_critical_path_seconds: { aggregate: 120, samples: [120] },
        },
      },
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 150, samples: [150] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
        },
      },
    })
    expect(result.eligible).toBe(false)
    expect(result.decision).toBe("revert")
    expect(result.violated_objectives).toContain("local_wall_seconds")
    expect(result.improved_objectives).toEqual(["ci_critical_path_seconds"])
  })

  test("a tolerated regression with no compensating gain is a revert, not inconclusive", () => {
    const spec = hardSpec({
      primary: { name: "local_wall_seconds", direction: "minimize", type: "hard" },
      objectives: [
        {
          name: "local_wall_seconds",
          direction: "minimize",
          role: "required",
          max_regression: { type: "relative", value: 0.1 },
        },
      ],
      comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
    })
    const result = decide({
      spec,
      baseline: snapshot(100, {
        metrics: { local_wall_seconds: { aggregate: 100, samples: [100] } },
      }),
      candidate: snapshot(107, {
        metrics: { local_wall_seconds: { aggregate: 107, samples: [107] } },
      }),
    })
    expect(result.eligible).toBe(false)
    expect(result.decision).toBe("revert")
    expect(result.violated_objectives).toEqual([])
    expect(result.comparisons.local_wall_seconds.verdict).toBe("regressed")
  })

  test("a looser max_regression is the violation bound, not the comparison threshold", () => {
    const spec = hardSpec({
      primary: { name: "local_wall_seconds", direction: "minimize", type: "hard" },
      objectives: [
        {
          name: "local_wall_seconds",
          direction: "minimize",
          role: "required",
          max_regression: { type: "relative", value: 0.1 },
        },
        { name: "ci_critical_path_seconds", direction: "minimize", role: "required" },
      ],
      comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
    })
    const result = decide({
      spec,
      baseline: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 100, samples: [100] },
          ci_critical_path_seconds: { aggregate: 120, samples: [120] },
        },
      },
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 107, samples: [107] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
        },
      },
    })
    expect(result.eligible).toBe(true)
    expect(result.decision).toBe("keep")
    expect(result.violated_objectives).toEqual([])
    expect(result.improved_objectives).toEqual(["ci_critical_path_seconds"])
  })

  test("target_reached requires every declared required target, not only the primary", () => {
    const almost = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 280, samples: [280] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
          runner_minutes: { aggregate: 45, samples: [45] },
        },
      },
    })
    expect(almost.eligible).toBe(true)
    expect(almost.target_reached).toBe(false)

    const done = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: 280, samples: [280] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
          runner_minutes: { aggregate: 38, samples: [38] },
        },
      },
    })
    expect(done.target_reached).toBe(true)
  })
})

describe("noise-aware comparison from the observed suite run", () => {
  const spec = hardSpec({
    comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
  })
  const baseline = snapshot(BASELINE_WALL, {
    metrics: {
      wall_seconds: {
        aggregate: BASELINE_WALL,
        samples: [368.915, 372.869, 375.1, 380.2, 504.309],
      },
    },
  })

  test("each screened experiment is a revert or censor, not a keep", () => {
    for (const wall of Object.values(OBSERVED)) {
      const result = decide({ spec, baseline, candidate: snapshot(wall) })
      expect(result.eligible).toBe(false)
      expect(["revert", "censored"]).toContain(result.decision)
    }
  })

  test("a 2% improvement against a 5% relative threshold is inconclusive", () => {
    const result = decide({ spec, baseline, candidate: snapshot(BASELINE_WALL * 0.98) })
    expect(result.decision).toBe("inconclusive")
    expect(result.eligible).toBe(false)
  })

  test("paired comparison is inconclusive when sample ranges overlap", () => {
    const result = compareObjective({
      baselineValue: BASELINE_WALL,
      candidateValue: 360,
      baselineSamples: [368.915, 372.869, 504.309],
      candidateSamples: [355, 380],
      direction: "minimize",
      type: "hard",
      comparison: { method: "paired", noise_threshold: 10, relative_threshold: 0.05 },
      maxRegression: null,
    })
    expect(result.verdict).toBe("inconclusive")
  })
})

describe("cost-aware measurement ladder", () => {
  const spec = hardSpec({
    stability_mode: "ladder",
    ladder: {
      smoke_command: "python tools/eval/measure.py --smoke",
      exploratory_pairs: 1,
      confirmation_repeats: 5,
      futility: { worse_factor: 1.2 },
    },
    comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
  })
  const baseline = snapshot(BASELINE_WALL)

  test("a failed smoke test is degenerate before any timed run", () => {
    const result = decide({
      spec,
      baseline,
      candidate: { ...snapshot(1), smoke_passed: false },
    })
    expect(result.decision).toBe("degenerate")
    expect(result.next_measurement).toBe("none")
    expect(result.reason).toContain("smoke")
  })

  test("the first 1.9x-worse sample is censored instead of spending the five-run protocol", () => {
    const result = decide({
      spec,
      baseline,
      candidate: { ...snapshot(OBSERVED.nestedConcurrency2), smoke_passed: true, sample_count: 1 },
    })
    expect(result.decision).toBe("censored")
    expect(result.next_measurement).toBe("none")
  })

  test("elapsed-time futility does not censor an eligible required-objective win", () => {
    const spec = hardSpec({
      primary: { name: "local_wall_seconds", direction: "minimize", type: "hard" },
      objectives: [
        { name: "local_wall_seconds", direction: "minimize", role: "required" },
        { name: "ci_critical_path_seconds", direction: "minimize", role: "required" },
      ],
      stability_mode: "ladder",
      ladder: {
        smoke_command: "python tools/eval/measure.py --smoke",
        exploratory_pairs: 1,
        confirmation_repeats: 5,
        futility: { worse_factor: 1.2, after_elapsed_seconds: 415 },
      },
      comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
    })
    const result = decide({
      spec,
      baseline: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: BASELINE_WALL, samples: [BASELINE_WALL] },
          ci_critical_path_seconds: { aggregate: 120, samples: [120] },
        },
      },
      candidate: {
        gates: { suite_passed: 1 },
        metrics: {
          local_wall_seconds: { aggregate: BASELINE_WALL + 1, samples: [BASELINE_WALL + 1] },
          ci_critical_path_seconds: { aggregate: 80, samples: [80] },
        },
        smoke_passed: true,
        sample_count: 5,
        elapsed_seconds: 415,
      },
    })
    expect(result.eligible).toBe(true)
    expect(result.decision).toBe("keep")
    expect(result.improved_objectives).toEqual(["ci_critical_path_seconds"])
  })

  test("an elapsed-time futility bound censors an already-noncompetitive live run", () => {
    const result = decide({
      spec: {
        ...spec,
        ladder: { ...spec.ladder, futility: { worse_factor: 1.2, after_elapsed_seconds: 415 } },
      },
      baseline,
      candidate: {
        ...snapshot(420),
        smoke_passed: true,
        sample_count: 1,
        elapsed_seconds: 415,
      },
    })
    expect(result.decision).toBe("censored")
  })

  test("a promising first pair asks for confirmation instead of keeping on one sample", () => {
    const result = decide({
      spec,
      baseline,
      candidate: { ...snapshot(300), smoke_passed: true, sample_count: 1 },
    })
    expect(result.decision).toBe("promising")
    expect(result.eligible).toBe(true)
    expect(result.next_measurement).toBe("confirm")
  })

  test("an inconclusive first pair asks for one more sample, not the full protocol", () => {
    const result = decide({
      spec,
      baseline,
      candidate: { ...snapshot(BASELINE_WALL * 0.98), smoke_passed: true, sample_count: 1 },
    })
    expect(result.decision).toBe("inconclusive")
    expect(result.next_measurement).toBe("add_sample")
  })

  test("confirmation samples default to repeat_count when confirmation_repeats is omitted", () => {
    const spec = hardSpec({
      stability_mode: "ladder",
      repeat_count: 3,
      ladder: {
        smoke_command: "python tools/eval/measure.py --smoke",
        exploratory_pairs: 1,
        futility: { worse_factor: 1.2 },
      },
      comparison: { method: "relative", relative_threshold: 0.05, noise_threshold: 10 },
    })
    const result = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: { wall_seconds: { aggregate: 300, samples: [298, 300, 301] } },
        sample_count: 3,
        smoke_passed: true,
      },
    })
    expect(result.decision).toBe("keep")
    expect(result.next_measurement).toBe("none")
  })

  test("a confirmed promising candidate becomes a keep after the full protocol", () => {
    const result = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: { wall_seconds: { aggregate: 300, samples: [298, 300, 301, 299, 302] } },
        sample_count: 5,
        smoke_passed: true,
      },
    })
    expect(result.decision).toBe("keep")
    expect(result.next_measurement).toBe("none")
  })
})

describe("judge minimum as a comparison floor", () => {
  test("a relative judge gain below minimum_improvement is not a keep", () => {
    const spec = hardSpec({
      primary: { name: "mean_score", direction: "maximize", type: "judge" },
      comparison: { method: "relative", relative_threshold: 0.05 },
      minimum_improvement: 0.3,
    })
    const baseline = {
      gates: { suite_passed: 1 },
      metrics: { mean_score: { aggregate: 4.0, samples: [4.0] } },
    }
    const belowFloor = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: { mean_score: { aggregate: 4.25, samples: [4.25] } },
      },
    })
    expect(belowFloor.decision).toBe("inconclusive")
    expect(belowFloor.eligible).toBe(false)

    const aboveFloor = decide({
      spec,
      baseline,
      candidate: {
        gates: { suite_passed: 1 },
        metrics: { mean_score: { aggregate: 4.4, samples: [4.4] } },
      },
    })
    expect(aboveFloor.decision).toBe("keep")
    expect(aboveFloor.eligible).toBe(true)
  })
})

describe("decide.mjs CLI", () => {
  test("prints a JSON decision for a file path", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "ce-optimize-decide-"))
    const inputPath = path.join(dir, "input.json")
    writeFileSync(
      inputPath,
      JSON.stringify({
        spec: hardSpec(),
        baseline: snapshot(10),
        candidate: snapshot(9.97),
      }),
    )
    const result = spawnSync("node", [DECIDE, inputPath], { encoding: "utf8" })
    expect(result.status, result.stderr).toBe(0)
    expect(JSON.parse(result.stdout).decision).toBe("keep")
  })
})

describe("measure.sh futility censor", () => {
  test("CE_OPTIMIZE_CENSOR_AFTER exits 125 instead of waiting for the full timeout", () => {
    const result = spawnSync("bash", [MEASURE, "sleep 10", "30", "."], {
      encoding: "utf8",
      env: { ...process.env, CE_OPTIMIZE_CENSOR_AFTER: "1" },
    })
    expect(result.status).toBe(125)
    expect(result.stderr).toContain("censored")
  })
})

describe("schema and skill pins", () => {
  test("the spec schema documents optional objectives, comparison, and ladder", () => {
    expect(SCHEMA).toContain("objectives:")
    expect(SCHEMA).toContain("comparison.method, when set, must be one of: absolute, relative, paired")
    expect(SCHEMA).toContain("- ladder")
    expect(SCHEMA).toContain("worse_factor")
    expect(SCHEMA).toContain("A spec without metric.objectives keeps single-primary acceptance")
    expect(SCHEMA).toContain("The primary is always a required comparison")
    expect(SCHEMA).toContain("each additional objective is a hard metric")
    expect(SCHEMA).toContain("Always hard. Additional objectives come from the measurement command.")
  })

  test("the experiment log schema includes inconclusive and censored outcomes", () => {
    expect(LOG_SCHEMA).toContain("- inconclusive")
    expect(LOG_SCHEMA).toContain("- censored")
    expect(LOG_SCHEMA).toContain("- promising")
  })

  test("the expensive-benchmark example declares three required hard targets and a ladder", () => {
    expect(EXAMPLE).toContain("name: reduce-test-suite-wall-time")
    expect(EXAMPLE).toContain("local_wall_seconds")
    expect(EXAMPLE).toContain("ci_critical_path_seconds")
    expect(EXAMPLE).toContain("runner_minutes")
    expect(EXAMPLE).toContain("mode: ladder")
    expect(EXAMPLE).toContain("method: relative")
  })

  test("the loop and measurement references send comparison through decide.mjs", () => {
    expect(LOOP).toContain("scripts/decide.mjs")
    expect(MEASUREMENT).toContain("scripts/decide.mjs")
    expect(LOOP).toContain("every declared required target")
    expect(LOOP).toContain("every required objective value")
    expect(LOOP).toContain("the spec as loaded")
    expect(LOOP).toContain("elapsed wall time itself proves the primary cannot win")
    expect(MEASUREMENT).toContain("Spend only the measurement the current decision needs")
  })
})
