import { describe, expect, test } from "bun:test"
import { readFileSync, readdirSync } from "fs"
import path from "path"

// ce-proof's body was cut to fit Codex's 8000-byte skill prompt budget, with the
// endpoint recipes moved to references/api.md and the end-to-end flows to
// references/workflows.md. Guards split by load-time: credential, privacy, and
// mutation rules that must fire before any reference is read are pinned against
// SKILL.md; relocated recipe detail is pinned against the whole skill corpus.
const SKILL_DIR = path.join(import.meta.dir, "..", "..", "skills", "ce-proof")
const body = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")
const corpus = [
  body,
  ...readdirSync(path.join(SKILL_DIR, "references")).map((f) =>
    readFileSync(path.join(SKILL_DIR, "references", f), "utf8"),
  ),
].join("\n")

describe("ce-proof always-loaded body pins", () => {
  test("states its outcome and done bar", () => {
    expect(body).toContain("**Outcome:**")
    expect(body).toContain("**Done:**")
  })

  test("keeps the credential split and the revocation signals", () => {
    expect(body).toContain("everyday bearer")
    expect(body).toContain("persist `ownerSecret` for the session")
    expect(body).toContain('code: "DOCUMENT_DELETE_FORBIDDEN"')
    expect(body).toContain('reason: "CREDENTIAL_NOT_OWNER"')
    expect(body).toContain('reason: "DOCUMENT_HAS_NO_OWNER"')
  })

  test("keeps the privacy rules that a content wipe would otherwise violate", () => {
    // Emptying markdown leaves comment quotes readable to any share credential.
    expect(body).toContain("scrub comment marks")
    expect(body).toMatch(/never put secrets/i)
  })

  test("keeps the mutation constraints that also govern the MCP path", () => {
    expect(body).toContain("no delete-comment op")
    expect(body).toContain("orphaned")
    expect(body).toContain("TARGET_AMBIGUOUS")
    expect(body).toContain("partial: true")
  })

  test("gates both references at their point of use, MCP included", () => {
    expect(body).toContain("before the first Proof read or mutation, HTTP or MCP")
    expect(body).toContain("references/workflows.md")
  })
})

describe("ce-proof relocated recipes stay greppable in the corpus", () => {
  for (const invariant of [
    "https://www.proofeditor.ai/share/markdown",
    "/api/agent/{slug}/v3/edit",
    "/api/agent/{slug}/presence",
    "/api/documents/{slug}/title",
    "set_document",
    "modify_suggestion",
    "SUGGESTION_OWNERSHIP_MISSING",
    "at most 100 operations",
    "2 MiB",
    "mutationReady",
    "--rawfile",
    "report_bug",
  ]) {
    test(`corpus keeps: ${invariant}`, () => {
      expect(corpus).toContain(invariant)
    })
  }
})
