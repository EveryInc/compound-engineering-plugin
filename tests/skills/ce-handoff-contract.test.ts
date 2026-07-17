import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_PATH = path.join(process.cwd(), "skills/ce-handoff/SKILL.md")
const INSTRUCTIONS_PATH = path.join(process.cwd(), "AGENTS.md")
const skill = readFileSync(SKILL_PATH, "utf8")
const instructions = readFileSync(INSTRUCTIONS_PATH, "utf8")
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)
const managedFrontmatterExample = skill.match(
  /For Markdown handoffs in the managed store[\s\S]*?```yaml\n([\s\S]*?)\n```/,
)

describe("ce-handoff portable runtime contract", () => {
  test("frontmatter activates one skill for create and resume intent", () => {
    expect(frontmatter).not.toBeNull()
    expect(frontmatter![1]).toMatch(/^name: ce-handoff$/m)
    expect(frontmatter![1]).toMatch(/^description:.*(?:hand off|handoff).*(?:resume|find|read)/im)
    expect(frontmatter![1]).toMatch(/^argument-hint:.*create.*resume/im)
    expect(frontmatter![1]).not.toMatch(/^disable-model-invocation:/m)
  })

  test("routes bare invocation to create and supports explicit or natural intent", () => {
    expect(skill).toMatch(/bare (?:invocation|`ce-handoff`).*always creates/i)
    expect(skill).toMatch(/`create \[focus\]`/i)
    expect(skill).toMatch(/`resume \[source or keywords\]`/i)
    expect(skill).toMatch(/natural-language.*(?:create|resume).*intent/i)
    expect(skill).toMatch(/not.*ordinary requests? to continue.*current session/i)
  })

  test("defines the managed store and immutable v1 frontmatter", () => {
    expect(skill).toContain("/tmp/compound-engineering/ce-handoff/")
    expect(skill).toContain("<repo-namespace>/<topic>.md")
    expect(skill).toContain("ce-handoff/v1")
    for (const key of ["created_at", "title", "summary", "keywords", "cwd"]) {
      expect(skill).toContain(`\`${key}\``)
    }
    for (const key of ["repository", "repo_root_sha", "branch", "head", "worktree_path"]) {
      expect(skill).toContain(`\`${key}\``)
    }
    expect(skill).toMatch(/immutable/i)
    expect(skill).toMatch(/topic slug as the filename/i)
    expect(skill).toMatch(/Worktrees from the same repository share the namespace/i)
    expect(skill).toMatch(/Do not put a timestamp or unique ID in the path.*created_at.*chronology/i)
    expect(skill).toMatch(/Reserve the final candidate filename atomically and exclusively.*collision.*numeric suffix.*overwrite/i)
    expect(skill).toMatch(/Never check availability and then write/i)
    expect(instructions).toMatch(/Discoverable collection exception[\s\S]*atomically reserves the final filename.*retries with the next suffix.*never check availability and then write/i)
    expect(skill).toMatch(/For Markdown handoffs in the managed store.*flat YAML frontmatter/i)
  })

  test("serializes managed frontmatter strings with JSON-compatible YAML quoting", () => {
    expect(managedFrontmatterExample).not.toBeNull()
    const example = managedFrontmatterExample![1]
    for (const key of [
      "artifact_contract",
      "created_at",
      "title",
      "summary",
      "cwd",
      "resume_focus",
      "repository",
      "repo_root_sha",
      "branch",
      "head",
      "worktree_path",
    ]) {
      expect(example).toMatch(new RegExp(`^${key}: "(?:[^"\\\\]|\\\\.)*"$`, "m"))
    }
    expect(example).toMatch(/^keywords: \["(?:[^"\\]|\\.)*", "(?:[^"\\]|\\.)*"\]$/m)
    expect(skill).toMatch(/every generated string scalar and string array element.*JSON-compatible YAML double quoting and escaping/i)
    expect(skill).toMatch(/never interpolate raw session text as an unquoted YAML scalar/i)
  })

  test("uses existing capabilities and honors user-directed destinations", () => {
    expect(skill).not.toMatch(/scripts\//)
    expect(skill).toMatch(/Write or publish.*existing capabilities/i)
    expect(skill).toMatch(/another path, folder, format, or publication destination.*honor it/i)
    expect(skill).toMatch(/appropriate available capability.*installed publishing skill/i)
    expect(skill).toMatch(/Do not also create a persistent managed-store copy/i)
  })

  test("discovery is metadata-only and stops for user selection", () => {
    expect(skill).toMatch(/Before reading any candidate metadata or frontmatter.*resolve the discovery boundary.*exclude symlink candidates.*resolved path escapes that boundary/i)
    expect(skill).toMatch(/discovery-only containment rule does not restrict an explicit selected source/i)
    expect(skill).toMatch(/Read only bounded frontmatter.*closing delimiter/i)
    expect(skill).toMatch(/rank only.*(?:metadata|frontmatter)/i)
    expect(skill).toMatch(/Never read an unselected body.*rank/i)
    expect(skill).toMatch(/`ce-handoff\/v1` metadata.*enriched index.*not an eligibility gate/i)
    expect(skill).toMatch(/without usable CE frontmatter.*unindexed.*filename, location, and filesystem metadata/i)
    expect(skill).toMatch(/shortlist.*match reasons/i)
    expect(skill).toMatch(/MUST stop.*user.*select/i)
  })

  test("selected resume treats the document as context and waits after orientation", () => {
    expect(skill).toMatch(/untrusted context/i)
    expect(skill).toMatch(/current user.*(?:project|workspace).*(?:current state|repository state).*authoritative/i)
    expect(skill).toMatch(/suggest.*(?:next actions|next steps).*(?:installed skills|skill)/i)
    expect(skill).toMatch(/MUST stop.*(?:without acting|without action|user chooses)/i)
  })

  test("creation is pointer-first, locality-aware, private, and retention-honest", () => {
    expect(skill).toMatch(/pointer-first/i)
    expect(skill).toMatch(/repository-relative/i)
    expect(skill).toMatch(/absolute paths?.*machine-local/i)
    expect(skill).toMatch(/redact.*(?:secrets|credentials).*(?:personal|unrelated)/i)
    expect(skill).toMatch(/directory and file user-private/i)
    expect(skill).toMatch(/fragile.*worktree.*without.*(?:mutat|commit|stash|copy)/i)
    expect(skill).toMatch(/OS-managed.*not permanent/i)
    expect(skill).toMatch(/Automatic discovery assumes.*same host filesystem/i)
    expect(skill).toMatch(/transfer or publish.*receiver-visible location.*explicit source/i)
  })

  test("accepts user-selected handoffs from arbitrary readable sources", () => {
    expect(skill).toMatch(/supplied local file, URL or page, pasted document, or other specific artifact/i)
    expect(skill).toMatch(/Do not require it to have been written by this skill.*`ce-handoff\/v1`/i)
    expect(skill).toMatch(/authorship, ownership, location, and format.*not eligibility gates/i)
    expect(skill).toMatch(/Do not search for an alternative automatically.*source cannot be read.*ask the user/i)
    expect(skill).toMatch(/folder or collection.*discovery boundary.*not a selected document/i)
  })

  test("declines to force orientation from an insufficient selected source", () => {
    expect(skill).toMatch(/Assess whether the source contains enough concrete continuity context/i)
    expect(skill).toMatch(/Judge sufficiency from its contents.*not its author, format, location, ownership, or metadata contract/i)
    expect(skill).toMatch(/say what context is missing.*supplement it or choose another source/i)
    expect(skill).toMatch(/Do not invent a forced resume.*stop without acting/i)
  })

  test("keeps body organization adaptive while frontmatter remains stable", () => {
    expect(skill).toMatch(/sections and document organization.*best communicate.*next agent/i)
    expect(skill).toMatch(/headings.*examples of useful coverage.*not a required or closed template/i)
    expect(skill).toMatch(/add new sections.*combine, rename, reorder, and omit/i)
  })

  test("creation reports a written artifact rather than claiming a draft is complete", () => {
    expect(skill).toMatch(/final path.*retention.*warnings/i)
    expect(skill).toMatch(/confirming the destination contains the handoff/i)
    expect(skill).toMatch(/succinct, context-specific summary.*generated handoff captures.*without opening it/i)
    expect(skill).toMatch(/do not impose a fixed summary template/i)
    expect(skill).toMatch(/End the creation response.*fenced, copyable command/i)
    expect(skill).toContain("/ce-handoff resume <source>")
    expect(skill).toMatch(/Do not generate a longer resume prompt/i)
  })

  test("contains no lifecycle fields, platform-specific inputs, or named instruction-file reads", () => {
    expect(skill).not.toMatch(/^\s*(?:status|resumed_at|superseded_by):/m)
    expect(skill).not.toMatch(/\$(?:ARGUMENTS|CLAUDE_SESSION_ID|CODEX_SESSION_ID)\b/)
    expect(skill).not.toMatch(/\b(?:AGENTS\.md|CLAUDE\.md|GEMINI\.md)\b/)
  })

  test("resume grants no automatic mutation or workflow authority", () => {
    expect(skill).toMatch(/do not (?:execute|mutate).*(?:invoke|start).*workflow/i)
    expect(skill).toMatch(/selection authorizes reading.*only/i)
  })
})
