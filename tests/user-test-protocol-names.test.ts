import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const REPO_ROOT = path.join(__dirname, "..")

type NameSource = {
  source: string
  values: Set<string>
}

function readRel(relativePath: string): string {
  return readFileSync(path.join(REPO_ROOT, relativePath), "utf8")
}

function quotedNames(text: string): Set<string> {
  return new Set(
    [...text.matchAll(/`([^`]+)`|"([^"]+)"|'([^']+)'/g)]
      .map((match) => match[1] ?? match[2] ?? match[3])
      .filter((value) => value.length > 0),
  )
}

function sorted(values: Set<string>): string[] {
  return [...values].sort()
}

function extractPythonSetConstant(source: string, constantName: string): Set<string> {
  const pattern = new RegExp(`${constantName}\\s*=\\s*\\{([\\s\\S]*?)\\}`, "m")
  const match = source.match(pattern)
  if (!match) {
    throw new Error(`Missing Python set constant ${constantName}`)
  }
  return new Set([...match[1].matchAll(/"([^"]+)"/g)].map((item) => item[1]))
}

function pythonFunction(source: string, functionName: string): string {
  const start = source.indexOf(`def ${functionName}(`)
  if (start === -1) {
    throw new Error(`Missing Python function ${functionName}`)
  }
  const rest = source.slice(start)
  const next = rest.slice(1).search(/\ndef [a-zA-Z_][a-zA-Z0-9_]*\(/)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

function engineValidationErrorCodes(source: string): Set<string> {
  const snippets = [
    pythonFunction(source, "validate_anomaly_reconciliation"),
    pythonFunction(source, "validate_ledger_digest"),
    pythonFunction(source, "ledger_ranges_and_markers"),
    pythonFunction(source, "validate_ledger_tiling"),
    pythonFunction(source, "validate_evidence"),
    pythonFunction(source, "validate_final_execution_index"),
  ]
  const markerStart = source.indexOf("marker_present = migration_defaults_marker_present()")
  const markerEnd = source.indexOf("errors.extend(validate_full_ledger_gates", markerStart)
  if (markerStart === -1 || markerEnd === -1) {
    throw new Error("Missing commit-engine marker/ledger validation routing block")
  }
  snippets.push(source.slice(markerStart, markerEnd))
  return new Set(
    [...snippets.join("\n").matchAll(/"code"\s*:\s*"([^"]+)"/g)].map(
      (match) => match[1],
    ),
  )
}

function engineWarningSentinels(source: string): Set<string> {
  return new Set(
    [...source.matchAll(/(?:print\(|\b)(["'])(MIGRATION-DEFAULTS-WARN)\1/g)].map(
      (match) => match[2],
    ),
  )
}

function markdownSection(source: string, heading: string): string {
  const start = source.indexOf(heading)
  if (start === -1) {
    throw new Error(`Missing markdown heading ${heading}`)
  }
  const rest = source.slice(start)
  const next = rest.slice(1).search(/\n## /)
  return next === -1 ? rest : rest.slice(0, next + 1)
}

function between(source: string, startText: string, endText: string): string {
  const start = source.indexOf(startText)
  const end = source.indexOf(endText, start + startText.length)
  if (start === -1 || end === -1) {
    throw new Error(`Missing markdown range ${startText} -> ${endText}`)
  }
  return source.slice(start, end)
}

function tableRow(source: string, needle: string): string {
  const row = source.split(/\r?\n/).find((line) => line.includes(needle))
  if (!row) {
    throw new Error(`Missing table row containing ${needle}`)
  }
  return row
}

function anomalyLedgerNameSets(source: string): {
  validationErrorCodes: Set<string>
  warningSentinels: Set<string>
  dispositions: Set<string>
  evidenceTypes: Set<string>
} {
  const validationSection = markdownSection(source, "## Validation Names")
  const errorCodeBlock = between(
    validationSection,
    "Validation error codes:",
    "Warning sentinel:",
  )
  const warningBlock = validationSection.slice(
    validationSection.indexOf("Warning sentinel:"),
  )
  const reconciliationSection = markdownSection(source, "## Phase 4 Reconciliation")
  const evidenceSection = markdownSection(source, "## Evidence Entries")
  return {
    validationErrorCodes: quotedNames(errorCodeBlock),
    warningSentinels: quotedNames(warningBlock),
    dispositions: new Set(
      [...quotedNames(tableRow(reconciliationSection, "`disposition`"))].filter(
        (value) => value !== "disposition",
      ),
    ),
    evidenceTypes: new Set(
      evidenceSection
        .split(/\r?\n/)
        .map((line) => line.match(/^\|\s*`([^`]+)`\s*\|/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => match[1]),
    ),
  }
}

function schemaNameSets(source: string): {
  dispositions: Set<string>
  evidenceTypes: Set<string>
} {
  const v11Section = markdownSection(source, "## Evidence and Ledger Fields (v11 additions)")
  const dispositionRow = tableRow(v11Section, "`anomalies[].disposition`")
  const evidenceTypeRow = tableRow(v11Section, "`areas[].evidence[].type`")
  return {
    dispositions: new Set(
      [...dispositionRow.matchAll(/`([^`]+)`/g)]
        .map((match) => match[1])
        .filter((value) => value !== "anomalies[].disposition"),
    ),
    evidenceTypes: new Set(
      [...evidenceTypeRow.matchAll(/`([^`]+)`/g)]
        .map((match) => match[1])
        .filter((value) => value !== "areas[].evidence[].type"),
    ),
  }
}

function assertNameSetsEqual(
  label: string,
  sources: NameSource[],
  expectedSize: number,
): void {
  if (sources.length < 2) {
    throw new Error(`${label} needs at least two sources`)
  }
  for (const source of sources) {
    if (source.values.size === 0) {
      throw new Error(`${label} missing from ${source.source}`)
    }
  }
  const baseline = sorted(sources[0].values)
  if (baseline.length !== expectedSize) {
    throw new Error(
      `${label} expected ${expectedSize} names but ${sources[0].source} has ${baseline.length}: ${baseline.join(", ")}`,
    )
  }
  for (const source of sources.slice(1)) {
    const actual = sorted(source.values)
    if (actual.join("\0") !== baseline.join("\0")) {
      throw new Error(
        `${label} drift between ${sources[0].source} and ${source.source}: expected [${baseline.join(", ")}], got [${actual.join(", ")}]`,
      )
    }
  }
}

describe("ce-user-test v11 protocol name anti-drift", () => {
  const commitEngine = readRel("skills/ce-user-test/scripts/commit-engine.py")
  const eval4 = readRel("skills/ce-user-test-eval/scripts/eval4-ledger-coverage.py")
  const anomalyLedger = anomalyLedgerNameSets(
    readRel("skills/ce-user-test/references/anomaly-ledger.md"),
  )
  const lastRunSchema = schemaNameSets(
    readRel("skills/ce-user-test/references/last-run-schema.md"),
  )

  const validationErrorSources: NameSource[] = [
    {
      source: "commit-engine.py ledger validation code literals",
      values: engineValidationErrorCodes(commitEngine),
    },
    {
      source: "eval4-ledger-coverage.py VALIDATION_ERROR_CODES",
      values: extractPythonSetConstant(eval4, "VALIDATION_ERROR_CODES"),
    },
    {
      source: "anomaly-ledger.md Validation Names",
      values: anomalyLedger.validationErrorCodes,
    },
  ]

  const warningSentinelSources: NameSource[] = [
    {
      source: "commit-engine.py warning sentinel output",
      values: engineWarningSentinels(commitEngine),
    },
    {
      source: "eval4-ledger-coverage.py WARNING_SENTINELS",
      values: extractPythonSetConstant(eval4, "WARNING_SENTINELS"),
    },
    {
      source: "anomaly-ledger.md Warning sentinel",
      values: anomalyLedger.warningSentinels,
    },
  ]

  const dispositionSources: NameSource[] = [
    {
      source: "commit-engine.py DISPOSITIONS",
      values: extractPythonSetConstant(commitEngine, "DISPOSITIONS"),
    },
    {
      source: "eval4-ledger-coverage.py DISPOSITIONS",
      values: extractPythonSetConstant(eval4, "DISPOSITIONS"),
    },
    {
      source: "anomaly-ledger.md reconciliation table",
      values: anomalyLedger.dispositions,
    },
    {
      source: "last-run-schema.md anomalies disposition row",
      values: lastRunSchema.dispositions,
    },
  ]

  const evidenceTypeSources: NameSource[] = [
    {
      source: "commit-engine.py EVIDENCE_TYPES",
      values: extractPythonSetConstant(commitEngine, "EVIDENCE_TYPES"),
    },
    {
      source: "eval4-ledger-coverage.py EVIDENCE_TYPES",
      values: extractPythonSetConstant(eval4, "EVIDENCE_TYPES"),
    },
    {
      source: "anomaly-ledger.md evidence table",
      values: anomalyLedger.evidenceTypes,
    },
    {
      source: "last-run-schema.md evidence type row",
      values: lastRunSchema.evidenceTypes,
    },
  ]

  test("shared v11 protocol names stay byte-identical across code and references", () => {
    assertNameSetsEqual("validation error codes", validationErrorSources, 10)
    assertNameSetsEqual("warning sentinels", warningSentinelSources, 1)
    assertNameSetsEqual("disposition values", dispositionSources, 4)
    assertNameSetsEqual("evidence types", evidenceTypeSources, 4)
  })

  test("set equality helper detects a single-source drift", () => {
    const drifted = dispositionSources.map((source, index) => ({
      source: index === 0 ? `${source.source} scratch drift` : source.source,
      values: new Set(index === 0 ? [...source.values, "scratch-drift"] : source.values),
    }))

    expect(() => assertNameSetsEqual("disposition values", drifted, 4)).toThrow(
      /disposition values/,
    )
  })
})
