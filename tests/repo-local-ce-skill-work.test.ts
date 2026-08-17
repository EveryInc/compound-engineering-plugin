import { describe, expect, test } from "bun:test"
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from "fs"
import path from "path"

// The repo-local `ce-skill-work` skill is how the skill lifecycle (author / edit /
// review / respond) is delivered to agents working in this checkout. It is not
// part of the distributed plugin (plugin skills live under `skills/`), so none
// of the plugin-facing tests see it. This guard pins the three facts the
// AGENTS.md pointer depends on: the skill exists at the harness-neutral
// `.agents/skills` path (which Codex and Cursor both discover), the Claude Code
// skills folder is a symlink to `.agents/skills`, and AGENTS.md still routes skill work to it.

const ROOT = process.cwd()
const AGENTS_SKILL = path.join(ROOT, ".agents", "skills", "ce-skill-work")
const CLAUDE_SKILL = path.join(ROOT, ".claude", "skills", "ce-skill-work")

describe("repo-local ce-skill-work skill", () => {
  test("exists at the .agents/skills path with a job-plus-condition description", () => {
    const skill = readFileSync(path.join(AGENTS_SKILL, "SKILL.md"), "utf8")
    expect(skill).toMatch(/^---\nname: ce-skill-work\ndescription: "/)
    const description = skill.split("\n")[2]
    // Activation contract: the job, then the routing condition, then the adjacent negative —
    // not a workflow summary and not a synonym list of phrasings.
    expect(description).toMatch(/skill-authoring standard/)
    expect(description).toMatch(/Use (for|when) any change to, or judgment about, a file under skills\/\*\*/)
    expect(description).toMatch(/Not for src\/, tests\/, or scripts\/ code/)
    for (const ref of ["new-skill", "edit-skill", "review-skill", "respond-to-review", "evaluate"]) {
      expect(existsSync(path.join(AGENTS_SKILL, "references", `${ref}.md`))).toBe(true)
      expect(skill).toContain(`references/${ref}.md`)
    }
  })

  test(".claude/skills is a symlink to the whole .agents/skills folder", () => {
    expect(lstatSync(AGENTS_SKILL).isSymbolicLink()).toBe(false)
    const claudeSkills = path.join(ROOT, ".claude", "skills")
    expect(lstatSync(claudeSkills).isSymbolicLink()).toBe(true)
    expect(readlinkSync(claudeSkills)).toBe(path.join("..", ".agents", "skills"))
    expect(realpathSync(CLAUDE_SKILL)).toBe(realpathSync(AGENTS_SKILL))
  })

  test("SKILL.md maps each of the four modes to its reference and shapes the report per mode", () => {
    const skill = readFileSync(path.join(AGENTS_SKILL, "SKILL.md"), "utf8")
    expect(skill).toMatch(/Creating a new skill \| `references\/new-skill\.md`/)
    expect(skill).toMatch(/Changing an existing skill \| `references\/edit-skill\.md`/)
    expect(skill).toMatch(/Reviewing a skill change \| `references\/review-skill\.md`/)
    expect(skill).toMatch(/Acting on review feedback for a skill \| `references\/respond-to-review\.md`/)
    expect(skill).toMatch(/\*\*Review mode:\*\*[^\n]*never has changed-block entries/)
  })

  test("description guidance requires the pointer shape and rejects catalogs", () => {
    const skill = readFileSync(path.join(AGENTS_SKILL, "SKILL.md"), "utf8")
    const newSkill = readFileSync(path.join(AGENTS_SKILL, "references", "new-skill.md"), "utf8")
    const reviewSkill = readFileSync(path.join(AGENTS_SKILL, "references", "review-skill.md"), "utf8")
    const evaluate = readFileSync(path.join(AGENTS_SKILL, "references", "evaluate.md"), "utf8")
    const guide = readFileSync(
      path.join(ROOT, "docs", "solutions", "skill-design", "portable-agent-skill-authoring.md"),
      "utf8",
    )
    const agents = readFileSync(path.join(ROOT, "AGENTS.md"), "utf8")
    const ownDescription = skill.match(/^description: "(.+)"$/m)?.[1] ?? ""
    const catalogFailure = [
      "\"This skill should be used when a user wants media from a yt-dlp-supported URL ",
      "such as YouTube, Twitter/X, TikTok, and similar sites downloaded, audio extracted, ",
      "playlists archived, or 403/bot-check failures fixed.\"",
    ].join("")

    for (const content of [skill, newSkill, reviewSkill, evaluate, guide]) {
      expect(content).toContain("context pointer")
      expect(content).toMatch(/leading (prompt )?word/i)
      expect(content).toMatch(/one (positive )?trigger per genuinely distinct branch/i)
    }

    expect(newSkill).toContain("Use this skill's own frontmatter as the shape")
    expect(newSkill).not.toContain("Lead with the job in one clause")
    expect(newSkill.match(/^Contrast pair \(the only description example\):$/gm) ?? []).toHaveLength(1)
    expect(newSkill).toContain(`- Good: "${ownDescription}"`)
    expect(newSkill).toContain(`- Bad (failure): ${catalogFailure}`)
    expect(newSkill).toContain(
      "Why it fails: identity boilerplate + one branch written as a site/capability catalog.",
    )
    expect(reviewSkill).toMatch(/identity-boilerplate opener[\s\S]*catalog[\s\S]*is a Change/)
    expect(reviewSkill).toContain("Use the single contrast pair in `references/new-skill.md`")
    expect(evaluate).toMatch(/description-restraint fixture/)
    expect(evaluate).toContain("single contrast pair in `references/new-skill.md`")
    expect(evaluate).toMatch(/Passing behavior is a context pointer/)
    expect(guide).toMatch(/Do not open with identity boilerplate/)
    expect(agents).toMatch(/model-invoked description that opens with identity boilerplate or catalogs one branch/)
  })

  test("AGENTS.md routes all four activities to the skill and keeps the reviewer rules bots read", () => {
    const agents = readFileSync(path.join(ROOT, "AGENTS.md"), "utf8")
    expect(agents).toMatch(/Before creating, editing, reviewing, or acting on review feedback for anything under `skills\/\*\*`, invoke the repo-local `ce-skill-work` skill/)
    expect(agents).toContain(".agents/skills/ce-skill-work/")
    expect(agents).toContain("`.claude/skills` is a symlink to `.agents/skills`")
    expect(agents).toMatch(/### Reviewing a skill change \(bots and humans\)/)
    expect(agents).toMatch(/A case a stated condition already covers is not a finding/)
  })
})
