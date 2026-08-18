import { readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(process.cwd(), "skills/ce-handoff")
const SKILL_PATH = path.join(SKILL_DIR, "SKILL.md")
const REFERENCE_NAMES = ["create.md", "resume.md"]
const INSTRUCTIONS_PATH = path.join(process.cwd(), "AGENTS.md")
/**
 * `skill` is the always-loaded body: rules that must control behavior from the prompt window
 * without any reference read. `corpus` is body + references: invariants that were relocated to
 * a required-read reference still have to exist somewhere, and this is where they are asserted.
 * Do not convert a body pin to a corpus grep without deciding the rule can wait for a read.
 */
const skill = readFileSync(SKILL_PATH, "utf8")
const corpus = [
  skill,
  ...REFERENCE_NAMES.map((name) => readFileSync(path.join(SKILL_DIR, "references", name), "utf8")),
].join("\n")
const instructions = readFileSync(INSTRUCTIONS_PATH, "utf8")
const frontmatter = skill.match(/^---\n([\s\S]*?)\n---/)
const managedFrontmatterExample = corpus.match(
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
    expect(corpus).toContain('HANDOFF_DIR="$SCRATCH_ROOT/ce-handoff/<repo-namespace>"')
    expect(corpus).toContain('SCRATCH_ROOT="/tmp/compound-engineering-$(id -u)"')
    expect(corpus).toContain("$HANDOFF_DIR/<topic>.md")
    expect(corpus).toContain("ce-handoff/v1")
    for (const key of ["created_at", "title", "summary", "keywords", "cwd"]) {
      expect(corpus).toContain(`\`${key}\``)
    }
    for (const key of ["repository", "repo_root_sha", "branch", "head", "worktree_path"]) {
      expect(corpus).toContain(`\`${key}\``)
    }
    expect(corpus).toMatch(/immutable/i)
    expect(corpus).toMatch(/topic slug as the filename/i)
    expect(corpus).toMatch(/Worktrees from the same repository share the namespace/i)
    expect(corpus).toMatch(/Do not put a timestamp or unique ID in the path.*created_at.*chronology/i)
    expect(corpus).toMatch(/Reserve the final candidate filename atomically and exclusively.*collision.*numeric suffix.*overwrite/i)
    expect(corpus).toMatch(/Never check availability and then write/i)
    expect(instructions).toMatch(/Discoverable collection exception[\s\S]*atomically reserves the final filename.*retries with the next suffix.*never check availability and then write/i)
    expect(corpus).toMatch(/For Markdown handoffs in the managed store.*flat YAML frontmatter/i)
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
    expect(corpus).toMatch(/every generated string scalar and string array element.*JSON-compatible YAML double quoting and escaping/i)
    expect(corpus).toMatch(/never interpolate raw session text as an unquoted YAML scalar/i)
  })

  test("uses existing capabilities and honors user-directed destinations", () => {
    expect(corpus).not.toMatch(/scripts\/(?!scratch-root\.py)/)
    expect(skill).toMatch(/Write or publish.*existing capabilities/i)
    expect(skill).toMatch(/another path, folder, format, or publication destination.*honor it/i)
    expect(skill).toMatch(/appropriate available capability.*installed publishing skill/i)
    expect(skill).toMatch(/Do not also create a persistent managed-store copy/i)
  })

  test("discovery is metadata-only and stops for user selection", () => {
    expect(skill).toMatch(/Before reading any candidate metadata or frontmatter.*resolve the discovery boundary.*exclude symlink candidates.*resolved path escapes that boundary/i)
    expect(skill).toMatch(/discovery-only containment rule does not restrict an explicit selected source/i)
    expect(corpus).toMatch(/do not inspect the body of a candidate without frontmatter.*check only its first line.*unindexed.*filename, location, and filesystem metadata/i)
    expect(corpus).toMatch(/candidate beginning with the exact frontmatter opener `---`.*at most the first 64 lines or 16 KiB.*whichever comes first.*closing delimiter/i)
    expect(corpus).toMatch(/no closing delimiter.*within those bounds.*unindexed.*do not read farther/i)
    expect(skill).toMatch(/rank only.*(?:metadata|frontmatter)/i)
    expect(skill).toMatch(/Never read an unselected body.*rank/i)
    expect(corpus).toMatch(/`ce-handoff\/v1` metadata.*enriched index.*not an eligibility gate/i)
    expect(corpus).toMatch(/shortlist.*match reasons/i)
    expect(skill).toMatch(/MUST stop.*user.*select/i)
  })

  test("selected resume treats the document as context and waits after orientation", () => {
    expect(skill).toMatch(/untrusted context/i)
    expect(skill).toMatch(/carry the user's weight only where the source attributes them to the user/i)
    expect(skill).toMatch(/the rest is its writer's own reading, whoever wrote it/i)
    expect(skill).toMatch(/current user.*(?:project|workspace).*(?:current state|repository state).*authoritative/i)
    expect(skill).toMatch(/recommend how to continue from this handoff's actual continuity reason/i)
    expect(skill).toMatch(/Do not default to an implementation-resume menu/i)
    expect(skill).toMatch(/numbered choice list only for mutually exclusive forks/i)
    expect(skill).toMatch(/Keep related pieces of one continuation.*single recommendation/i)
    expect(skill).toMatch(/do not invent alternate options for symmetry/i)
    expect(skill).toMatch(/MUST stop.*(?:without acting|without action).*(?:confirms or redirects|user chooses)/i)
  })

  test("creation is pointer-first, locality-aware, private, and retention-honest", () => {
    expect(skill).toMatch(/pointer-first/i)
    expect(skill).toMatch(/repository-relative/i)
    expect(skill).toMatch(/absolute paths?.*machine-local/i)
    expect(skill).toMatch(/redact.*(?:secrets|credentials).*(?:personal|unrelated)/i)
    expect(corpus).toMatch(/directory and file user-private/i)
    expect(skill).toMatch(/fragile.*worktree.*without.*(?:mutat|commit|stash|copy)/i)
    expect(skill).toMatch(/OS-managed.*not permanent/i)
    expect(corpus).toMatch(/Automatic discovery assumes.*same host filesystem/i)
    expect(corpus).toMatch(/transfer or publish.*receiver-visible location.*explicit source/i)
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
    expect(corpus).toMatch(/sections and document organization.*best communicate.*next agent/i)
    expect(corpus).toMatch(/headings.*examples of useful coverage.*not a required or closed template/i)
    expect(corpus).toMatch(/add new sections.*combine, rename, reorder, and omit/i)
    expect(corpus).toMatch(/Plausible next steps.*exclusive forks as alternatives.*related sequential work as one path/i)
  })

  test("create body prefers verifiable status, specific pointers, and residual traps", () => {
    expect(corpus).toMatch(/complete, in progress.*not started/i)
    expect(corpus).toMatch(/Failed approaches already abandoned.*wrong paths the next agent is likely to retry/i)
    expect(corpus).toMatch(/Default the body to ground truth/i)
    expect(corpus).toMatch(/Prefer that status framing over work orders/i)
    expect(corpus).toMatch(/Orientation aids that load context without granting action authority/i)
    expect(corpus).toMatch(/Carry explicit directives only when the user asked/i)
    expect(corpus).toMatch(/The handoff is your account of the session.*the user's, your inference, or your own call/i)
    expect(corpus).toMatch(/name what specifically matters there.*line range when that narrows/i)
  })

  test("creation reports a written artifact rather than claiming a draft is complete", () => {
    expect(skill).toMatch(/final path.*retention.*warnings/i)
    expect(skill).toMatch(/confirming the destination contains the handoff/i)
    expect(corpus).toMatch(/succinct, context-specific summary.*generated handoff captures.*without opening it/i)
    expect(corpus).toMatch(/do not impose a fixed summary template/i)
    expect(skill).toMatch(/End the creation response.*fenced, copyable command/i)
    expect(skill).toContain("/ce-handoff resume <source>")
    expect(corpus).toMatch(/Do not generate a longer resume prompt/i)
  })

  test("contains no lifecycle fields, platform-specific inputs, or named instruction-file reads", () => {
    expect(corpus).not.toMatch(/^\s*(?:status|resumed_at|superseded_by):/m)
    expect(corpus).not.toMatch(/\$(?:ARGUMENTS|CLAUDE_SESSION_ID|CODEX_SESSION_ID)\b/)
    expect(corpus).not.toMatch(/\b(?:AGENTS\.md|CLAUDE\.md|GEMINI\.md)\b/)
  })

  test("resume grants no automatic mutation or workflow authority", () => {
    expect(skill).toMatch(/do not (?:execute|mutate).*(?:invoke|start).*workflow/i)
    expect(skill).toMatch(/selection authorizes reading.*only/i)
  })
})
