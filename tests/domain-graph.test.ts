import { afterEach, describe, expect, setDefaultTimeout, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, symlinkSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"

setDefaultTimeout(30_000)

const REPO_ROOT = path.join(__dirname, "..")
const SCRIPT = path.join(REPO_ROOT, "skills/ce-compound-refresh/scripts/domain-graph.py")
const FIXTURES = path.join(__dirname, "fixtures/domain-graph")

const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0)) rmSync(directory, { recursive: true, force: true })
})

function scratchDir(prefix: string): string {
  const directory = mkdtempSync(path.join(tmpdir(), `domain-graph-${prefix}-`))
  scratch.push(directory)
  return directory
}

/**
 * Resolve a working Python 3 by probing execution, never by hardcoding
 * `python3` (docs/solutions/conventions/resolve-python-interpreter-not-python3.md).
 */
function resolvePython(): string {
  for (const candidate of ["python3", "python", "py"]) {
    if (spawnSync(candidate, ["-c", ""], { encoding: "utf8" }).status === 0) return candidate
  }
  throw new Error("no working Python 3 interpreter on PATH")
}

const PYTHON = resolvePython()

type Run = { code: number; stdout: string; stderr: string }

function run(args: string[]): Run {
  const result = spawnSync(PYTHON, [SCRIPT, ...args], { encoding: "utf8" })
  return { code: result.status ?? -1, stdout: result.stdout ?? "", stderr: result.stderr ?? "" }
}

function runJson(args: string[]): { run: Run; json: any } {
  const result = run(args)
  let json: any
  try {
    json = JSON.parse(result.stdout)
  } catch {
    throw new Error(`stdout was not JSON (exit ${result.code}): ${result.stdout}\n${result.stderr}`)
  }
  return { run: result, json }
}

function fixture(name: string): string {
  return path.join(FIXTURES, name)
}

function codes(findings: Array<{ code: string }>): string[] {
  return findings.map((finding) => finding.code)
}

function terms(entries: Array<{ term: string }>): string[] {
  return entries.map((entry) => entry.term)
}

/** Deterministic snapshot of every file in a tree, for the read-only invariant. */
function snapshotTree(root: string): string {
  const entries: string[] = []
  const walk = (directory: string) => {
    const children = readdirSync(directory, { withFileTypes: true })
      .sort((a, b) => a.name.localeCompare(b.name))
    for (const entry of children) {
      const absolute = path.join(directory, entry.name)
      const relative = path.relative(root, absolute).split(path.sep).join("/")
      if (entry.isSymbolicLink()) entries.push(`symlink ${relative}`)
      else if (entry.isDirectory()) {
        entries.push(`dir ${relative}`)
        walk(absolute)
      } else entries.push(`file ${relative} ${readFileSync(absolute, "utf8")}`)
    }
  }
  walk(root)
  return entries.join("\n")
}

const ALL_FIXTURES = readdirSync(FIXTURES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort()

describe("domain-graph path safety", () => {
  test("rejects an absolute context link with its own finding code", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("unsafe-links")])
    expect(codes(json.findings)).toContain("index-link-absolute")
  })

  test("rejects a traversing context link with its own finding code", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("unsafe-links")])
    expect(codes(json.findings)).toContain("index-link-traversal")
  })

  test("reports a missing link target separately from an unsafe one", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("unsafe-links")])
    expect(codes(json.findings)).toContain("index-link-missing")
  })

  test("rejects a symlinked context link whose realpath escapes the repo", () => {
    const outside = scratchDir("outside")
    const repo = scratchDir("symlink-repo")
    writeFileSync(path.join(outside, "CONCEPTS.md"), "# Outside\n\n### Secret\nA term outside the repository.\n")
    try {
      symlinkSync(outside, path.join(repo, "escaped"))
    } catch {
      return // Windows runners without symlink privilege: nothing to assert.
    }
    writeFileSync(
      path.join(repo, "CONCEPTS.md"),
      [
        "# Concepts",
        "",
        "## Contexts",
        "",
        "- [Escaped](escaped/CONCEPTS.md) -- owns nothing this repository governs.",
        "",
      ].join("\n"),
    )
    const { json } = runJson(["validate", "--repo-root", repo])
    expect(codes(json.findings)).toContain("index-link-symlink-escape")
    expect(codes(json.findings)).not.toContain("index-link-missing")
  })

  test("rejects a traversing --docs-root at argument parsing", () => {
    const result = run(["inventory", "--repo-root", fixture("simple"), "--docs-root", "../evil"])
    expect(result.code).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("docs-root-traversal")
  })

  test("rejects an absolute --docs-root at argument parsing", () => {
    const result = run(["inventory", "--repo-root", fixture("simple"), "--docs-root", "/etc"])
    expect(result.code).toBe(2)
    expect(result.stdout).toBe("")
    expect(result.stderr).toContain("docs-root-absolute")
  })
})

describe("domain-graph slug safety", () => {
  test("sends unslugifiable context names to unresolved and composes no path for them", () => {
    const { json } = runJson(["plan-migration", "--repo-root", fixture("unslugifiable")])
    const unresolved = json.unresolved.filter((entry: any) => entry.reason === "context-slug-invalid")
    expect(unresolved.map((entry: any) => entry.term).sort()).toEqual(["Channel Order", "Invoice", "Ledger Entry"])
    const serialized = JSON.stringify(json)
    expect(serialized).not.toContain("Billing/Payments/")
    expect(serialized).not.toContain("contexts/..")
    expect(serialized).not.toContain("Retail & Wholesale/")
    const glossaryWrites = json.manifest.writes.filter((write: any) => write.kind === "context-glossary")
    expect(glossaryWrites.length).toBeGreaterThan(0)
    for (const write of glossaryWrites) {
      expect(write.path).toMatch(/^docs\/contexts\/[a-z0-9]+(-[a-z0-9]+)*\/CONCEPTS\.md$/)
    }
  })

  test("slugifies a legal multi-word context name rather than rejecting it", () => {
    const { json } = runJson(["plan-migration", "--repo-root", fixture("unslugifiable")])
    expect(json.mapping["Shipment"].context).toBe("order-fulfillment")
    expect(json.mapping["Shipment"].destination).toBe("docs/contexts/order-fulfillment/CONCEPTS.md")
  })

  test("composes the context path under the supplied --docs-root", () => {
    const { json } = runJson([
      "plan-migration",
      "--repo-root",
      fixture("legacy-invariants"),
      "--docs-root",
      "reference/domain",
    ])
    expect(json.mapping["Shipment"].destination).toBe("reference/domain/contexts/logistics/CONCEPTS.md")
  })
})

describe("domain-graph flat glossary", () => {
  test("inventory lists the root terms with their aliases and invariants", () => {
    const { run: result, json } = runJson(["inventory", "--repo-root", fixture("simple")])
    expect(result.code).toBe(0)
    expect(json.schema).toBe("ce.domain-graph.inventory/v1")
    expect(json.root.present).toBe(true)
    expect(json.root.isIndex).toBe(false)
    expect(terms(json.root.terms)).toEqual(["Reservation", "Party", "Table"])
    const reservation = json.root.terms[0]
    expect(reservation.aliases).toEqual(["Booking", "appointment"])
    expect(reservation.invariants).toEqual(["a Reservation owns exactly one Party."])
    expect(json.contexts).toEqual([])
    expect(json.blockedState).toBe("none")
  })

  test("validate reports zero findings on a flat glossary", () => {
    const { run: result, json } = runJson(["validate", "--repo-root", fixture("simple")])
    expect(json.findings).toEqual([])
    expect(result.code).toBe(0)
  })
})

describe("domain-graph index grammar", () => {
  test("accepts the same term defined differently in two contexts", () => {
    const { run: result, json } = runJson(["validate", "--repo-root", fixture("multi-context")])
    expect(json.findings).toEqual([])
    expect(result.code).toBe(0)
  })

  test("inventory exposes both sides of a polyseme and the shared vocabulary", () => {
    const { json } = runJson(["inventory", "--repo-root", fixture("multi-context")])
    expect(json.root.isIndex).toBe(true)
    expect(json.contexts.map((context: any) => context.slug)).toEqual(["scheduling", "billing"])
    const scheduling = json.contexts[0].glossary.terms.find((term: any) => term.term === "Order")
    const billing = json.contexts[1].glossary.terms.find((term: any) => term.term === "Order")
    expect(scheduling.definition).toContain("sequence of courses")
    expect(billing.definition).toContain("line items")
    expect(scheduling.definition).not.toBe(billing.definition)
    expect(json.sharedVocabulary.map((entry: any) => entry.term)).toEqual(["Venue"])
  })

  test("inventory exposes the cross-context relation entries", () => {
    const { json } = runJson(["inventory", "--repo-root", fixture("multi-context")])
    expect(json.relations).toHaveLength(1)
    expect(json.relations[0].from).toBe("Scheduling")
    expect(json.relations[0].to).toBe("Billing")
    expect(json.relations[0].description).toContain("billable visit")
  })

  test("flags the same term defined twice inside one context", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("duplicate-term")])
    const duplicates = json.findings.filter((entry: any) => entry.code === "duplicate-term-in-context")
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].term).toBe("Seating")
    expect(duplicates[0].path).toBe("docs/contexts/scheduling/CONCEPTS.md")
  })

  test("treats a prose `## Contexts` section as a collision, not an index", () => {
    const { json: report } = runJson(["validate", "--repo-root", fixture("malformed-index")])
    expect(codes(report.findings)).toEqual(["index-collision"])

    const { json } = runJson(["inventory", "--repo-root", fixture("malformed-index")])
    expect(json.root.hasContextsSection).toBe(true)
    expect(json.root.isIndex).toBe(false)
    expect(json.root.collision).toBe(true)
    expect(json.contexts).toEqual([])
    expect(terms(json.root.terms)).toEqual(["Reservation", "Party"])
  })

  test("flags a duplicate context entry in the index", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("duplicate-context")])
    const duplicates = json.findings.filter((entry: any) => entry.code === "index-duplicate-context")
    expect(duplicates).toHaveLength(1)
    expect(duplicates[0].context).toBe("Scheduling")
  })
})

describe("domain-graph blocked states", () => {
  test("reports dual-canonical when a legacy glossary coexists with root vocabulary", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("dual-canonical")])
    expect(json.blockedState).toBe("dual-canonical")
    expect(codes(json.findings)).toContain("legacy-dual-canonical")
  })

  test("maps unambiguous legacy terms and leaves shared ones for arbitration", () => {
    const { json } = runJson(["plan-migration", "--repo-root", fixture("dual-canonical")])
    expect(Object.keys(json.mapping).sort()).toEqual(["Reservation", "Seating"])
    expect(json.mapping["Reservation"].destination).toBe("docs/contexts/scheduling/CONCEPTS.md")
    expect(json.unresolved).toEqual([
      { term: "Invoice", reason: "defined-in-root-and-legacy", candidates: ["Billing"] },
    ])
    expect(json.manifest.deletions).toEqual([
      "CONTEXT-MAP.md",
      "docs/billing/CONTEXT.md",
      "docs/scheduling/CONTEXT.md",
    ])
  })

  test("reports legacy-only when no root glossary carries vocabulary", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("legacy-only")])
    expect(json.blockedState).toBe("legacy-only")
    expect(codes(json.findings)).toContain("legacy-only")
  })

  test("finds legacy glossaries stored beside code, not only under docs/", () => {
    // The convention these files come from puts CONTEXT.md next to the module it
    // describes (src/ordering/CONTEXT.md), so a discovery pass scoped to the repo
    // root plus docs/ misses them entirely -- no block fires and the next capture
    // manufactures a second canonical glossary. A behavioral eval caught exactly
    // that gap in the prose contract; this pins the mechanical half.
    const { json } = runJson(["validate", "--repo-root", fixture("legacy-beside-code")])
    expect(json.blockedState).toBe("legacy-only")

    const { json: inventory } = runJson(["inventory", "--repo-root", fixture("legacy-beside-code")])
    const bearing = inventory.legacy.files
      .filter((file: { vocabularyBearing: boolean }) => file.vocabularyBearing)
      .map((file: { path: string }) => file.path)
      .sort()
    expect(bearing).toEqual(["src/fulfilment/CONTEXT.md", "src/ordering/CONTEXT.md"])
  })

  test("reports no blocked state for a legacy file that bears no vocabulary", () => {
    const { run: result, json } = runJson(["validate", "--repo-root", fixture("non-vocabulary-legacy")])
    expect(json.blockedState).toBe("none")
    expect(json.findings).toEqual([])
    expect(result.code).toBe(0)

    const { json: inventory } = runJson(["inventory", "--repo-root", fixture("non-vocabulary-legacy")])
    expect(inventory.legacy.files).toHaveLength(1)
    expect(inventory.legacy.files[0].path).toBe("docs/project/CONTEXT.md")
    expect(inventory.legacy.files[0].vocabularyBearing).toBe(false)
  })

  test("reports exactly the pending legacy-coexistence finding after apply", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("post-apply")])
    expect(codes(json.findings)).toEqual(["legacy-coexistence-pending"])
    expect(json.blockedState).toBe("legacy-coexistence-pending")
  })

  test("reports zero findings once the legacy files are removed", () => {
    const { run: result, json } = runJson(["validate", "--repo-root", fixture("migrated")])
    expect(json.findings).toEqual([])
    expect(result.code).toBe(0)
  })

  test("plan-migration on a migrated tree is empty", () => {
    const { json } = runJson(["plan-migration", "--repo-root", fixture("migrated")])
    expect(json.mapping).toEqual({})
    expect(json.unresolved).toEqual([])
    expect(json.manifest).toEqual({ writes: [], referenceUpdates: [], deletions: [] })
  })
})

describe("domain-graph legacy references and invariants", () => {
  test("reports a repo file that references a legacy file and blocks deletion readiness", () => {
    const { json: inventory } = runJson(["inventory", "--repo-root", fixture("dual-canonical")])
    expect(inventory.legacy.references).toEqual([
      { path: "docs/architecture.md", target: "CONTEXT-MAP.md", occurrences: 1 },
    ])

    const { json } = runJson(["validate", "--repo-root", fixture("dual-canonical")])
    const pending = json.findings.filter((entry: any) => entry.code === "legacy-reference-pending")
    expect(pending).toHaveLength(1)
    expect(pending[0].path).toBe("docs/architecture.md")
  })

  test("inventory exposes the invariants extracted from a legacy glossary", () => {
    const { json } = runJson(["inventory", "--repo-root", fixture("legacy-invariants")])
    const shipment = json.legacy.files[0].terms.find((term: any) => term.term === "Shipment")
    expect(shipment.invariants).toEqual([
      "a Shipment is dispatched to exactly one address.",
      "a dispatched Shipment can no longer change its carrier.",
    ])
  })

  test("flags an invariant a supplied mapping drops", () => {
    const { json: plan } = runJson(["plan-migration", "--repo-root", fixture("legacy-invariants")])
    const directory = scratchDir("mapping")

    const faithful = path.join(directory, "faithful.json")
    writeFileSync(faithful, JSON.stringify(plan))
    const { json: kept } = runJson(["validate", "--repo-root", fixture("legacy-invariants"), "--mapping", faithful])
    expect(codes(kept.findings)).not.toContain("invariant-dropped")

    plan.mapping["Shipment"].invariants = ["a Shipment is dispatched to exactly one address."]
    const dropped = path.join(directory, "dropped.json")
    writeFileSync(dropped, JSON.stringify(plan))
    const { json } = runJson(["validate", "--repo-root", fixture("legacy-invariants"), "--mapping", dropped])
    const missing = json.findings.filter((entry: any) => entry.code === "invariant-dropped")
    expect(missing).toHaveLength(1)
    expect(missing[0].term).toBe("Shipment")
    expect(missing[0].message).toContain("can no longer change its carrier")
  })
})

describe("domain-graph sibling domain-truth files", () => {
  test("a healthy sibling DOMAIN.md is inventoried and raises no finding", () => {
    const { json: inventory } = runJson(["inventory", "--repo-root", fixture("domain-sibling")])
    expect(inventory.domainTruth).toEqual([
      {
        path: "docs/contexts/scheduling/DOMAIN.md",
        context: "scheduling",
        siblingGlossary: "docs/contexts/scheduling/CONCEPTS.md",
        siblingGlossaryPresent: true,
        definesTerms: false,
        definedTerms: [],
        verification: {
          stamped: false,
          verifiedAgainst: null,
          lastVerified: null,
          resolvable: null,
          commitsBehindHead: null,
        },
      },
    ])

    const { run: result, json } = runJson(["validate", "--repo-root", fixture("domain-sibling")])
    expect(result.code).toBe(0)
    expect(json.findings).toEqual([])
  })

  test("headings in a DOMAIN.md are rule anchors, never term definitions", () => {
    // The canonical template writes one `### <concept>` anchor per rule
    // cluster; extraction treating those as definitions would flag every
    // healthy domain-truth file.
    const { json } = runJson(["inventory", "--repo-root", fixture("domain-sibling")])
    expect(json.domainTruth[0].definesTerms).toBe(false)
  })

  test("a DOMAIN.md that defines terms is reported per definition", () => {
    const { run: result, json } = runJson(["validate", "--repo-root", fixture("domain-faults")])
    expect(result.code).toBe(1)
    const defines = json.findings.filter((entry: any) => entry.code === "domain-defines-terms")
    expect(defines.map((entry: any) => entry.term).sort()).toEqual(["Dunning", "Grace period"])
    for (const entry of defines) {
      expect(entry.path).toBe("docs/contexts/billing/DOMAIN.md")
    }
  })

  test("a canonical DOMAIN.md without its sibling glossary is an orphan", () => {
    const { json } = runJson(["validate", "--repo-root", fixture("domain-faults")])
    const orphans = json.findings.filter((entry: any) => entry.code === "domain-orphan")
    expect(orphans).toHaveLength(1)
    expect(orphans[0].path).toBe("docs/contexts/orphan/DOMAIN.md")
  })
})

describe("domain-graph verification stamps", () => {
  test("a well-formed stamp outside a git toplevel degrades to null resolution, no finding", () => {
    // The fixture tree sits inside this repository's checkout; the resolver
    // must not borrow the enclosing repo's history to judge the stamp.
    const { json: inventory } = runJson(["inventory", "--repo-root", fixture("domain-stamped")])
    expect(inventory.domainTruth[0].verification).toEqual({
      stamped: true,
      verifiedAgainst: "deadbeefdeadbeefdeadbeefdeadbeefdeadbeef",
      lastVerified: "2026-08-13",
      resolvable: null,
      commitsBehindHead: null,
    })

    const { run: result, json } = runJson(["validate", "--repo-root", fixture("domain-stamped")])
    expect(result.code).toBe(0)
    expect(json.findings).toEqual([])
  })

  test("frontmatter is excluded from term-definition scanning", () => {
    const { json } = runJson(["inventory", "--repo-root", fixture("domain-stamped")])
    expect(json.domainTruth[0].definesTerms).toBe(false)
  })

  test("malformed stamp values are reported per key", () => {
    const { run: result, json } = runJson(["validate", "--repo-root", fixture("domain-stamp-faults")])
    expect(result.code).toBe(1)
    const malformed = json.findings.filter((entry: any) => entry.code === "domain-stamp-malformed")
    expect(malformed).toHaveLength(2)
    expect(malformed[0].path).toBe("DOMAIN.md")
  })

  test("inside a real git toplevel the stamp resolves and unknown commits are findings", () => {
    const repo = scratchDir("stamp-git")
    const git = (args: string[]) =>
      spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" })
    git(["init", "-q"])
    git(["-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "--allow-empty", "-m", "seed"])
    const head = git(["rev-parse", "HEAD"]).stdout.trim()

    writeFileSync(path.join(repo, "CONCEPTS.md"), "# Concepts\n\n### Slot\n\nA bookable interval.\n")
    const stamped = (sha: string) =>
      `---\nverified_against: ${sha}\nlast_verified: 2026-08-13\n---\n\n# Domaine\n\n## Invariants\n\n### Slot\n\n- A **Slot** rule.\n`
    writeFileSync(path.join(repo, "DOMAIN.md"), stamped(head))

    const { json: ok } = runJson(["validate", "--repo-root", repo])
    expect(codes(ok.findings)).not.toContain("domain-stamp-unresolvable")
    const { json: inventory } = runJson(["inventory", "--repo-root", repo])
    expect(inventory.domainTruth[0].verification.resolvable).toBe(true)
    expect(inventory.domainTruth[0].verification.commitsBehindHead).toBe(0)

    writeFileSync(path.join(repo, "DOMAIN.md"), stamped("deadbeefdeadbeefdeadbeefdeadbeefdeadbeef"))
    const { json: bad } = runJson(["validate", "--repo-root", repo])
    expect(codes(bad.findings)).toContain("domain-stamp-unresolvable")
  })
})

describe("domain-graph bold-term legacy extraction", () => {
  test("a Pocock bold-term CONTEXT.md is vocabulary-bearing and blocks", () => {
    // The `**Term** (qualifier):` shape is the dominant legacy glossary
    // format in the wild; missing it reports a vocabulary-bearing file as
    // empty, so no dual-canonical block ever fires.
    const { json: inventory } = runJson(["inventory", "--repo-root", fixture("legacy-bold-terms")])
    const legacy = inventory.legacy.files[0]
    expect(legacy.vocabularyBearing).toBe(true)
    expect(terms(legacy.terms)).toEqual(["Address", "EntityAddress", "Blank recipient"])

    const address = legacy.terms.find((entry: any) => entry.term === "Address")
    expect(address.definition).toBe(
      "A reusable postal address block. The single reusable postal model.",
    )
    expect(address.aliases).toEqual(["Entry", "ItemAddress", "location"])

    const { json } = runJson(["validate", "--repo-root", fixture("legacy-bold-terms")])
    expect(codes(json.findings)).toContain("legacy-dual-canonical")
  })
})

describe("domain-graph read-only and determinism contract", () => {
  test("every subcommand leaves each fixture tree byte-identical", () => {
    expect(ALL_FIXTURES.length).toBeGreaterThan(5)
    for (const name of ALL_FIXTURES) {
      const before = snapshotTree(fixture(name))
      for (const command of ["inventory", "validate", "plan-migration"]) {
        const result = run([command, "--repo-root", fixture(name)])
        expect([0, 1]).toContain(result.code)
      }
      expect(snapshotTree(fixture(name))).toBe(before)
    }
  })

  test("repeated runs over an unchanged tree are byte-identical", () => {
    for (const command of ["inventory", "validate", "plan-migration"]) {
      const first = run([command, "--repo-root", fixture("dual-canonical")])
      const second = run([command, "--repo-root", fixture("dual-canonical")])
      expect(second.stdout).toBe(first.stdout)
      expect(second.code).toBe(first.code)
    }
  })
})
