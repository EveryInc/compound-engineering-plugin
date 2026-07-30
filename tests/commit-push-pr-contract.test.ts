import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-commit-push-pr contract", () => {
  test("reconciles the complete branch scope before composition", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    expect(content).not.toContain("Read every commit")
    const sizingSection = content.match(
      /## Step A: Size the description([\s\S]+?)## Step B:/,
    )?.[1]
    expect(sizingSection).toContain(
      "complete oneline commit list and final three-dot diff",
    )
    expect(sizingSection).toContain("scope map")
    expect(sizingSection).toContain("umbrella outcome")
    expect(sizingSection).toContain("consult the fuller messages only")
    const titleSection = content.match(
      /## Step B: Compose the title([\s\S]+?)## Step B1:/,
    )?.[1]
    expect(titleSection).toContain("scope map")
    expect(titleSection).toContain("umbrella outcome")
    const auditSection = content.match(
      /## Step E: Pre-apply coverage audit([\s\S]+)\s*$/,
    )?.[1]
    expect(auditSection).toContain("scope map")
    expect(auditSection).toContain("every material outcome")
  })

  test("repository PR-body contracts set structure without replacing editorial guidance", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    const contractIndex = content.indexOf("## Project PR-body contract")
    expect(contractIndex).toBeGreaterThan(-1)
    expect(contractIndex).toBeLessThan(content.indexOf("## Step Pre-A"))
    expect(content).toMatch(/template as a minimum.+exact\/template-only body/is)
    expect(content).toContain("add no sections beyond those the project permits")
    expect(content).toMatch(/structural floor.+sizes the content within it/is)
    expect(content).toMatch(/Step C:[\s\S]+preserve that structure.+sections it permits/i)
    expect(content).toMatch(/project PR-body contract supplies a heading or location for the opening.+place it there without inventing or renaming a heading/is)
    expect(content).toMatch(/Otherwise, the opening goes under `## Summary`.+bare paragraph/is)
    expect(content).toMatch(/Step E:[\s\S]+except for headings, fields, checklists, or boilerplate.+requires/i)
  })

  test("existing PR rewrites carry the old body into composition", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    // Existing-PR detection uses `gh pr list` (exits 0, returns `[]` when none)
    // rather than `gh pr view` (exits 1 with no PR, which aborted `!` load).
    expect(content).toContain("gh pr list --head <branch> --state open --json number,url,title,body,state,headRefName,headRepositoryOwner")
    // Multi-fork same-branch matches are disambiguated by head owner, not index 0 (PR #1109 review).
    expect(content).toContain("do **not** blindly take index 0")
    expect(content).toContain("Note the URL and body from that entry")
    expect(content).toContain("If Step 1 found an existing PR, pass its URL to Step 4")
    expect(content).toContain("existing body")
    expect(content).toMatch(/preserve.+Related.+Fixes/is)
  })

  test("requires related work references to use tracker-specific closing semantics", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    expect(content).toContain("## Step B1: Resolve related work references")
    expect(content).toContain("closing reference")
    expect(content).toContain("non-closing reference")
    expect(content).toContain("Do not invent a closing keyword")
    expect(content).toMatch(/git log\s+--format=fuller/)
    expect(content).toContain("full commit messages")
    expect(content).toContain("Do not put a non-closing reference next to close/fix/resolve/address/report wording")
    expect(content).toContain("Use the table's non-closing reference labels exactly")
    expect(content).toContain("Non-closing references always get their own sentence or `## Related` block")
    expect(content).toContain("For a non-closing reference, the tracker ID appears only in that related-reference sentence or block, never in the summary/opening/body prose")
    expect(content).toContain('Bad: "closing one corruption path from #123"')
    expect(content).toContain('Bad: "This addresses the retry-related corruption path reported in #123."')
    expect(content).toContain('Good: "This covers the duplicate-row retry path; concurrent cancellation remains follow-up work."')

    expect(content).toContain("GitHub Issues")
    expect(content).toContain("Fixes #123")
    expect(content).toContain("Fixes owner/repo#123")
    expect(content).toMatch(/target.+default branch/i)

    expect(content).toContain("Linear")
    expect(content).toContain("Fixes ENG-123")
    expect(content).toContain("Related to ENG-123")
    expect(content).toMatch(/PR description.+not.+comment/i)
  })

  test("adds generic Compound Engineering branding only on an explicit signal", async () => {
    const reference = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )
    const skill = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    expect(reference).toContain("Built_with-Compound_Engineering")
    expect(reference).not.toContain("MODEL_SLUG")
    expect(reference).not.toMatch(/\| Harness \|/)
    expect(reference).not.toMatch(/model slug/i)
    expect(reference).toMatch(/new PR body.+resolved branding gate is on/is)
    expect(reference).toMatch(/otherwise omit/is)
    expect(reference).toMatch(/existing PR body.+preserve.+verbatim/is)
    expect(reference).toMatch(/never add one when absent/is)
    expect(reference).toMatch(/explicitly asks.+remove or replace/is)
    expect(skill).toMatch(/branding-only delta.+explicitly request/is)
    expect(skill).toMatch(/branding is \*\*off unless.+branding:on/is)
    expect(skill).toContain("normalize that natural-language request to `branding:on`")
    expect(skill).toContain("If both tokens are present, stop and report the conflict")
    expect(skill).not.toContain("pr_branding")
    expect(skill).toMatch(/branding:on\|off/)
  })

  test("babysit handoff is default-on with off-switches and drivable fork PRs", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    // Default-on: auto-invoke, announce, never block on a yes/no.
    expect(content).toMatch(/auto-invoke `ce-babysit-pr`/i)
    expect(content).toMatch(/never block on a yes\/no/i)
    // Off is the explicit choice: per-run token + standing config opt-out.
    expect(content).toContain("babysit:off")
    expect(content).toContain("auto_babysit: false")
    // Hard-off cases (orchestrated, no PR, non-GitHub, non-pushable head).
    expect(content).toMatch(/do not fire/i)
    expect(content).toMatch(/mode:pipeline/)
    expect(content).toMatch(/head branch you cannot push to/i)
    // Fork PRs are drivable, gated on head-pushability (not fork-ness); base read / head push.
    expect(content).toMatch(/fork PRs are drivable/i)
    expect(content).toMatch(/reads state on the \*\*base\*\* repo/i)
    expect(content).toMatch(/pushes fixes to the \*\*head\*\* repo/i)
  })

  test("config template and example keep branding out of ambient configuration", async () => {
    for (const p of [
      "skills/ce-setup/references/config-template.yaml",
      ".compound-engineering/config.local.example.yaml",
    ]) {
      const template = await readRepoFile(p)
      expect(template).toContain("auto_babysit")
      expect(template).not.toContain("pr_branding")
    }
  })

  test("wires Jira ticket ID resolution, branch naming, and stacked prefix", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    // Step 0.5 exists and resolves a ticket ID from branch, commit, plan, or ask.
    expect(content).toContain("Step 0.5: Resolve Jira ticket ID and PR prefix")
    expect(content).toMatch(/Current branch name.*\[A-Z\]\[A-Z0-9_\]\+-\\d\+/s)
    expect(content).toMatch(/Recent commit subject.*git log --oneline -10/s)
    expect(content).toMatch(/Plan artifact frontmatter.*jira_ticket:/s)
    expect(content).toMatch(/Blocking ask.*optional.*HVD-9554/s)
    // Ask prompt illustrates all three accepted forms (bare, CI/CD # suffix, revision/hotfix suffix).
    expect(content).toContain("HVD-9554#")
    expect(content).toContain("HVD-9554-2")

    // PR_PREFIX resolution: env var preferred, git for-each-ref inference, ask.
    expect(content).toContain("GITHUB_PR_PREFIX_USERNAME")
    expect(content).toMatch(/git for-each-ref --format='\%\(refname:short\)' refs\/heads\//)
    expect(content).toMatch(/Never silently take the first prefix when multiple distinct values appear/)
    // Env var is the preferred resolution path (written to shell profile by ce-setup).
    expect(content).toMatch(/GITHUB_PR_PREFIX_USERNAME` env var \(preferred\)/)

    // Branch naming: <pr-prefix>/<TICKET-or-TICKET-with-suffix> when ticket known (suffix preserved on the branch).
    expect(content).toMatch(/branch name is `<pr-prefix>\/<TICKET-or-TICKET-with-suffix>`/)

    // Stacked prefix shape on commits and PR titles — the BARE ticket ID is the leading token.
    expect(content).toMatch(/Commit subject: `<bare-TICKET-ID> <type>\(<scope>\): <subject>`/)
    expect(content).toMatch(/PR title: `<bare-TICKET-ID> <type>\(<scope>\): <subject>`/)
    expect(content).toContain("HVD-9554 feat(ui): add matches preview popover")
    // Bare ID is never the suffix-bearing variant in commit/PR titles.
    expect(content).toMatch(/never the suffix-bearing variant/)

    // Suffix normalization: # and -<alphanumeric-segment> stripped to bare ID; suffix preserved on branch only.
    expect(content).toMatch(/Strip the trailing `#`/)
    expect(content).toMatch(/strip a trailing `-<segment>`/)

    // No-ticket path is the existing conventional-commits shape, unchanged.
    expect(content).toMatch(/empty, commit\/PR formatting is the existing conventional-commits shape/)

    // Inherited short-circuit: existing Jira-branch + PR skips the asks.
    expect(content).toContain("Inherited short-circuit")
  })

  test("branch-creation reference ties branch naming to the Jira ticket path", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/branch-creation.md",
    )

    expect(content).toMatch(/Jira ticket known.*<pr-prefix>\/<TICKET-or-TICKET-with-suffix>/s)
    expect(content).toMatch(/No ticket.*content-derived name/s)
    // Suffix preserved on the branch; bare ID prefixes commits/PR titles.
    expect(content).toMatch(/suffix is preserved .*\*?\*?on the branch name/i)
  })

  test("ce-commit stacks the ticket prefix, normalizes suffixes, and inherits without asking", async () => {
    const content = await readRepoFile("skills/ce-commit/SKILL.md")

    // ce-commit inherits the ticket from branch / commit — it does NOT ask the user.
    expect(content).toMatch(/Resolve a Jira ticket ID before composing the subject/)
    expect(content).toMatch(/current branch name.*\[A-Z\]\[A-Z0-9_\]\+-\\d\+/s)
    expect(content).toMatch(/most recent commit subject.*git log --oneline -10/s)
    expect(content).toContain("Do not ask the user for a ticket ID")

    // Suffix normalization mirrored: # and revision/hotfix suffixes stripped to bare ID.
    expect(content).toContain("HVD-9554#")
    expect(content).toContain("HVD-9554-2")
    expect(content).toMatch(/normalized to the bare `HVD-9554`/)

    // Stacked prefix shape uses the bare ID.
    expect(content).toMatch(/`<bare-TICKET-ID> <type>\(<scope>\): <subject>`/)
    expect(content).toContain("HVD-9554 feat(ui): add borders to word boxes")

    // Branch creation from default uses <pr-prefix>/<TICKET-or-TICKET-with-suffix> when ticket known.
    expect(content).toMatch(/branch name is `<pr-prefix>\/<TICKET-or-TICKET-with-suffix>` instead of a content-derived name/)
    expect(content).toContain("GITHUB_PR_PREFIX_USERNAME")
    // Env var is the preferred path (exported in shell profile by ce-setup).
    expect(content).toMatch(/GITHUB_PR_PREFIX_USERNAME` env var \(preferred/)
  })

  test("config templates document shell-profile credentials under 'Hive Based Configurations'", async () => {
    for (const p of [
      "skills/ce-setup/references/config-template.yaml",
      ".compound-engineering/config.local.example.yaml",
    ]) {
      const template = await readRepoFile(p)
      expect(template).toContain("Hive Based Configurations")
      // jira_ticket frontmatter field is documented.
      expect(template).toContain("jira_ticket")
      // Branch naming with suffix preservation is documented.
      expect(template).toMatch(/<pr-prefix>\/<TICKET-ID>/)
      // Credentials live in shell profile, not in this YAML file.
      expect(template).toMatch(/Credentials live in your shell profile, NOT here/)
      expect(template).toMatch(/~\/\.zshrc/)
      // The three credential keys are NOT active config lines (they're env vars now).
      expect(template).not.toMatch(/^GITHUB_PR_PREFIX_USERNAME=$/m)
      expect(template).not.toMatch(/^JIRA_API_TOKEN=$/m)
      expect(template).not.toMatch(/^JIRA_USERNAME=$/m)
    }
  })
})

describe("PR concept teaching contract", () => {
  test("SKILL.md wires the teaching gate, pipeline mode, and trailer", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")
    const trailerStart = content.indexOf("**User-runnable invocation rendering.**")
    const trailerEnd = content.indexOf("**Babysit handoff", trailerStart)
    const trailer = content.slice(trailerStart, trailerEnd)

    // Non-interactive modifier for orchestrated callers
    expect(content).toContain("mode:pipeline")
    expect(content).toContain("suppress every blocking ask")

    // Config gate: both keys, active-key-only resolution, single-gate semantics
    expect(content).toContain("pr_teaching_section")
    expect(content).toContain("pr_teaching_archive")
    expect(content).toContain("active (non-commented)")
    expect(content).toContain("Step B2")

    // Machine-readable trailer + host-rendered interactive offer
    expect(trailerStart).toBeGreaterThan(-1)
    expect(trailerEnd).toBeGreaterThan(trailerStart)
    expect(trailer).toContain("New concepts:")
    expect(trailer).toContain("using the rendering rule above")
    expect(trailer).toContain("$ce-explain <name>")
    expect(trailer).toContain("/ce-explain <name>")
    expect(trailer).toMatch(/default to `\/ce-explain <name>`[\s\S]{0,220}Codex[\s\S]{0,160}output one form only/i)
  })

  test("SKILL.md archival transition guards ordering, gitignore, and modes", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    expect(content).toContain("docs/explainers/")
    expect(content).toContain("input_shape: concept")
    expect(content).toContain("docs(explainer): teach")
    // Declined rewrite must not leave a stray committed-but-unlinked doc
    expect(content).toContain("declined rewrite skips archival")
    // Never force-add an ignored path
    expect(content).toContain("never `git add -f`")
  })

  test("reference composes the section via Step B2 with base-ref novelty checks", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    expect(content).toContain("## Step B2: Judge new concepts")
    // Self-detection trap: novelty is judged against the base ref
    expect(content).toContain("never the working tree")
    expect(content).toMatch(/git grep[^\n]*<base-remote>\/<base>/)
    // Negative constraint keeps absence the common case
    expect(content).toContain("absence is the common case")
    // Section heading and its slot in Step C's assembly order
    expect(content).toContain("## New concepts")
    expect(content).toContain("New concepts section when Step B2 produced one")
    // Rewrite preservation mirrors the Demo/Screenshots rule
    expect(content).toMatch(/preserve an existing `## New concepts` section/i)
  })

  test("config template documents both teaching keys", async () => {
    const template = await readRepoFile("skills/ce-setup/references/config-template.yaml")

    expect(template).toContain("pr_teaching_section")
    expect(template).toContain("pr_teaching_archive")
  })
})
