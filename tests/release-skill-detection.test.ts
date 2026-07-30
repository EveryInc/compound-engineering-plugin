import { describe, expect, test } from "bun:test"
import {
  buildSkillEntries,
  findNewSkillsBetweenRefs,
  findPreviousMinorTag,
  lookbackTagDisplay,
  readSkillDescription,
} from "../scripts/release/skill-detection"

const REPO_ROOT = process.cwd()

describe("findPreviousMinorTag", () => {
  test("returns the most recent tag whose minor is strictly less than the current", () => {
    const tags = ["v3.21.1", "v3.21.0", "v3.20.2", "v3.20.1", "v3.20.0"]
    expect(findPreviousMinorTag("v3.21.1", tags)).toBe("v3.20.2")
  })

  test("returns the latest tag in the prior minor cycle when called for a hypothetical new minor", () => {
    const tags = ["v3.22.0", "v3.21.1", "v3.21.0", "v3.20.2", "v3.20.1", "v3.20.0"]
    expect(findPreviousMinorTag("v3.22.0", tags)).toBe("v3.21.1")
  })

  test("skips same-minor tags — only counts tags with strictly lower minor", () => {
    const tags = ["v3.21.1", "v3.21.0"]
    expect(findPreviousMinorTag("v3.21.1", tags)).toBeNull()
  })

  test("returns null when current tag is malformed", () => {
    expect(findPreviousMinorTag("not-a-tag", ["v3.21.1"])).toBeNull()
  })

  test("returns null when no prior-minor tag exists", () => {
    expect(findPreviousMinorTag("v1.0.0", ["v1.0.0"])).toBeNull()
  })

  test("ignores non-semver tags in the input list", () => {
    const tags = ["random-tag", "v3.20.2", "v3.20.1", "v3.21.0"]
    expect(findPreviousMinorTag("v3.21.0", tags)).toBe("v3.20.2")
  })
})

describe("findNewSkillsBetweenRefs", () => {
  test("detects skills added between v3.20.2 and HEAD on this repo", () => {
    const skills = findNewSkillsBetweenRefs("v3.20.2")
    // ce-fix-bugs was added in v3.21.0 (after v3.20.2, before HEAD)
    expect(skills).toContain("ce-fix-bugs")
    // ce-jira-update was added before v3.20.0, so it's NOT in this range
    expect(skills).not.toContain("ce-jira-update")
  })

  test("returns ce-fix-bugs for v3.21.2..HEAD because PR #14 modified its SKILL.md after that tag", () => {
    // Note: findNewSkillsBetweenRefs tracks any change to skills/<name>/SKILL.md
    // (additions AND modifications), so a modification to ce-fix-bugs/SKILL.md
    // after v3.21.2 surfaces ce-fix-bugs here. This is the intended behavior —
    // the release "What's new" section wants to call out materially-changed
    // skills, not just newly-added ones.
    const skills = findNewSkillsBetweenRefs("v3.21.2")
    expect(skills).toContain("ce-fix-bugs")
  })

  test("returns sorted output for stable test assertions", () => {
    const skills = findNewSkillsBetweenRefs("v3.20.2")
    const sorted = [...skills].sort()
    expect(skills).toEqual(sorted)
  })
})

describe("readSkillDescription", () => {
  test("extracts the description field from a real skill's YAML frontmatter", () => {
    const desc = readSkillDescription("ce-fix-bugs", REPO_ROOT)
    expect(desc.startsWith("Work through every open checklist item on a Jira ticket")).toBe(true)
  })

  test("extracts the description field from ce-jira-update", () => {
    const desc = readSkillDescription("ce-jira-update", REPO_ROOT)
    expect(desc.startsWith("Update a Jira ticket's description and Test Behaviors")).toBe(true)
  })

  test("returns fallback for a missing skill file", () => {
    expect(readSkillDescription("nonexistent-skill", REPO_ROOT)).toBe("(no description available)")
  })

  test("strips surrounding quotes if the frontmatter description is quoted", () => {
    const desc = readSkillDescription("ce-fix-bugs", REPO_ROOT)
    expect(desc.startsWith('"') || desc.startsWith("'")).toBe(false)
  })
})

describe("lookbackTagDisplay", () => {
  test("passes semver tags through unchanged", () => {
    expect(lookbackTagDisplay("v3.21.0")).toBe("v3.21.0")
    expect(lookbackTagDisplay("v1.2.3")).toBe("v1.2.3")
  })

  test("shortens non-tag refs to first 7 chars", () => {
    expect(lookbackTagDisplay("22b0f4071eac7061d888cb6f70b09127e93be8bf")).toBe("22b0f40")
  })
})

describe("buildSkillEntries", () => {
  test("emits a per-skill bullet with name, description, docs link, and usage hint", () => {
    const [entry] = buildSkillEntries(["ce-fix-bugs"], REPO_ROOT)
    expect(entry.name).toBe("ce-fix-bugs")
    expect(entry.description.startsWith("Work through every open checklist")).toBe(true)
    expect(entry.docsPath).toBe("docs/skills/ce-fix-bugs.md")
    expect(entry.bullet).toContain("`ce-fix-bugs`")
    expect(entry.bullet).toContain("`docs/skills/ce-fix-bugs.md`")
    expect(entry.bullet).toContain("/ce-fix-bugs")
  })

  test("marks docs path as null when the docs page is missing", () => {
    const [entry] = buildSkillEntries(["ce-fix-bugs-temp"], REPO_ROOT)
    expect(entry.docsPath).toBeNull()
    expect(entry.bullet).toContain("not yet documented")
  })

  test("preserves order of the input list", () => {
    // Force a deterministic input: two known skills, picked in a specific order.
    const entries = buildSkillEntries(["ce-jira-update", "ce-fix-bugs"], REPO_ROOT)
    expect(entries.map((e) => e.name)).toEqual(["ce-jira-update", "ce-fix-bugs"])
  })
})
