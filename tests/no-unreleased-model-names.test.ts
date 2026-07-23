import { readFileSync } from "fs"
import { execFileSync } from "child_process"
import path from "path"
import { describe, expect, test } from "bun:test"

/**
 * This repository is PUBLIC. Pre-release / early-access model identifiers are
 * covered by NDA until the model ships, so they must never land here — not in
 * skills, docs, tests, fixtures, plans, or CI config.
 *
 * The realistic leak path is not malice, it is transcription: someone measures
 * a plugin change against an unreleased model, then pastes the resulting table,
 * benchmark row, transcript, config snippet, or model-comparison doc into
 * `docs/`. Every one of those carries the raw model id.
 *
 * WHY THIS GUARD MATCHES A SHAPE AND NOT A LIST:
 * A test that enumerated the actual codenames would publish them in this file —
 * it would be the leak it exists to prevent. So the pattern matches the *form*
 * of an early-access model id instead. Do NOT "improve" this test by adding
 * real codenames to an allowlist or a comment; that defeats its entire purpose.
 *
 * Released, publicly-announced model ids (claude-opus-4-8, claude-sonnet-5,
 * claude-haiku-4-5, claude-fable-5, gpt-*, gemini-*, grok-*) are fine and are
 * deliberately NOT matched here.
 *
 * If this test fails: remove the identifier and describe the model
 * behaviour-neutrally instead ("a current frontier model", "the model under
 * evaluation"). Measured numbers are fine to keep — it is the *name* that is
 * confidential, so anonymize the label and keep the data.
 */

const REPO_ROOT = path.resolve(import.meta.dir, "..")

// Assembled from fragments so this file does not itself contain the literal
// suffix it forbids, which would make the guard self-tripping.
const EAP_SUFFIX = ["e", "a", "p"].join("")

/**
 * Matches an early-access model identifier by shape:
 *   <vendor-or-word>-<codename>-<suffix>   e.g. a three-part hyphenated id
 *   <codename>-<suffix>                    e.g. a bare two-part id
 *
 * A hyphen is required before the suffix, so ordinary English words that end in
 * those three letters ("cheap", "heap", "reap") never match.
 */
const MODEL_ID_SHAPE = new RegExp(`\\b[a-z][a-z0-9]*-${EAP_SUFFIX}\\b`, "i")

/** The bare acronym, uppercase and standalone — flags NDA-adjacent prose. */
const ACRONYM = new RegExp(`\\b${EAP_SUFFIX.toUpperCase()}\\b`)

/** Paths exempt because they legitimately discuss the guard itself. */
const EXEMPT = new Set(["tests/no-unreleased-model-names.test.ts"])

/** Extensions we do not scan: binaries and dependency lockfiles. */
const SKIP_EXT = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".ico", ".pdf", ".mp4", ".mov",
  ".woff", ".woff2", ".ttf", ".zip", ".gz", ".lock",
])

function trackedFiles(): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: REPO_ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
  return out.split("\0").filter(Boolean)
}

describe("no unreleased model identifiers in a public repo", () => {
  test("no tracked file contains an early-access model id shape", () => {
    const offenders: string[] = []

    for (const rel of trackedFiles()) {
      if (EXEMPT.has(rel)) continue
      if (SKIP_EXT.has(path.extname(rel).toLowerCase())) continue
      if (rel === "bun.lock" || rel.endsWith("package-lock.json")) continue

      let body: string
      try {
        body = readFileSync(path.join(REPO_ROOT, rel), "utf8")
      } catch {
        continue // unreadable or binary; nothing to assert
      }

      const lines = body.split("\n")
      lines.forEach((line, i) => {
        if (MODEL_ID_SHAPE.test(line) || ACRONYM.test(line)) {
          // Report the location only. Echoing the matched text into test output
          // would leak the identifier into CI logs, which are also public.
          offenders.push(`${rel}:${i + 1}`)
        }
      })
    }

    expect(
      offenders,
      offenders.length
        ? `Possible unreleased-model identifier at:\n  ${offenders.join("\n  ")}\n` +
          `Remove the identifier and describe the model behaviour-neutrally. ` +
          `Keep any measured numbers; anonymize the label.`
        : undefined,
    ).toEqual([])
  })
})
