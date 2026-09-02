import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-commit-push-pr contract", () => {
  test("gates every commit publication on project-defined requirements", async () => {
    const skill = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    expect(skill).toContain("**Project publishing gate.**")
    expect(skill).toMatch(/project's active instructions and conventions already in context/)
    expect(skill).toMatch(/exact commit state being sent/)
    expect(skill).toMatch(/stop before the external write/)
    expect(skill).toMatch(/If none, proceed/)

    const publishSurfaces = await Promise.all(
      [
        ["skills/ce-commit-push-pr/references/commit-and-push.md", "git push -u origin HEAD"],
        ["skills/ce-commit-push-pr/references/stack-submit.md", "gh stack submit --auto --open"],
        ["skills/ce-commit-push-pr/references/apply-and-handoff.md", "then push"],
      ].map(async ([relativePath, publish]) => ({
        relativePath,
        publish,
        content: await readRepoFile(relativePath),
      })),
    )

    for (const { relativePath, publish, content } of publishSurfaces) {
      const gate = content.indexOf("Project publishing gate")
      const action = content.indexOf(publish)
      expect(gate, `${relativePath} must apply the publishing gate`).toBeGreaterThan(-1)
      expect(action, `${relativePath} must retain its publish transition`).toBeGreaterThan(-1)
      expect(gate, `${relativePath} must gate publication at the point of use`).toBeLessThan(action)
    }
  })

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

  test("elevates multi-PR program altitude with lead-in and lead-out", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    const sizingSection = content.match(
      /## Step A: Size the description([\s\S]+?)## Step B:/,
    )?.[1]
    expect(sizingSection).toBeDefined()
    expect(sizingSection).toContain("Program altitude")
    expect(sizingSection).toContain("lead-in")
    expect(sizingSection).toContain("lead-out")
    expect(sizingSection).toContain("Program outcome")
    expect(sizingSection).toMatch(/this PR's contribution/i)
    expect(sizingSection).toContain("Do **not** invent a series")
    expect(sizingSection).toMatch(
      /program → lead-in \(if any\) → this contribution → lead-out \(if any\)/,
    )
    // Bidirectional contrast: middle PR needs prior + residual, not local-only
    expect(sizingSection).toContain("too local for a middle PR")
    expect(sizingSection).toContain("Continues the session-revocation rewrite")
    // #1422 enforced "one idea" with a placement absolute (program never in the
    // opening's sentence). #1572 falsified it: a first-in-series change whose
    // local outcome is unmotivated without the program was rejected twice for
    // reading as if it had no point. Both directions stay pinned — the opening
    // must stand alone, and the program joins it only when it is what gives the
    // change its point.
    expect(sizingSection).toContain("outcome does not stand on its own")
    expect(content).not.toMatch(/never part of the opening's sentence/i)
    expect(content).not.toMatch(/never folded into the opening/i)

    const assemblySection = content.match(
      /## Step C: Assemble the body([\s\S]+?)## Step D:/,
    )?.[1]
    expect(assemblySection).toBeDefined()
    expect(assemblySection).toMatch(
      /reviewer who reads only it can say what this PR changes and why it takes this shape/i,
    )
    expect(assemblySection).toMatch(/does not stand on its own/i)
    // Both halves are required; the order is not. An earlier revision mandated
    // "the bigger picture first", which contradicted the local-first worked
    // example at the Step A bullet above and reinstated an ordering absolute of
    // the same class this block removes (#1576 review). Keep it gone.
    expect(assemblySection).toMatch(/either half may lead/i)
    expect(content).not.toMatch(/the bigger picture first/i)
    // The counter-failure: leading with the arc and losing the local outcome.
    expect(assemblySection).toMatch(
      /names the arc but leaves a reviewer unable to say what this PR changes/i,
    )

    const auditSection = content.match(
      /## Step E: Pre-apply coverage audit([\s\S]+)\s*$/,
    )?.[1]
    expect(auditSection).toBeDefined()
    expect(auditSection).toMatch(
      /program context was present.+lead place this PR on the arc/is,
    )
    expect(auditSection).toMatch(
      /program context was absent.+invent a multi-PR series/is,
    )
    // The audit used to check placement ("move program context out"), which
    // would have broken the accepted #1572 opening. It now checks legibility.
    expect(auditSection).toMatch(/reader who does not already know this project/i)
    expect(auditSection).toMatch(/reads as unmotivated without the program/i)
    expect(auditSection).toMatch(/which part of it this PR delivers/i)

    // Tracker refs stay separate from series narrative
    const relatedSection = content.match(
      /## Step B1: Resolve related work references([\s\S]+?)## Step B2:/,
    )?.[1]
    expect(relatedSection).toBeDefined()
    expect(relatedSection).toMatch(
      /Sibling PR \/ series narrative belongs in Step A's program altitude/i,
    )
  })

  test("judges altitude by the condition, and audits the umbrella itself", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    // #1594: an opening that named the mechanism ("personas now anchor their
    // checks to named canonical frameworks") passed every check. The core
    // principle enumerated moves/renames/adds, and a mechanism description is
    // none of the three, so it walked through the list. The condition replaces
    // the enumeration; the failing shape stays as a worked example.
    expect(content).toMatch(
      /If the lead describes what was edited rather than what is now different for someone using this/i,
    )
    expect(content).not.toMatch(/moves\/renames\/adds/i)
    expect(content).toContain("Bad (states how the work was done)")

    // #1595 review: an unconditional "naming the mechanism is the same failure"
    // contradicted the `TokenStore.invalidate` example under the prose rule and
    // Step E's carve-out for a mechanism that is itself the outcome, so a
    // literal agent could strip a correct atomicity or protocol lead. The
    // boundary is stated as a condition, pointing at the prose rule that
    // already owns it rather than restating the distinction a third time.
    expect(content).toMatch(
      /is how the work was done, while a mechanism that \*is\* what the reader gets stays/i,
    )

    // The map sets the altitude the title and opening inherit, so the umbrella
    // is stated as an outcome where it is named (Step A), not left to a
    // downstream check that can only compare against it.
    const sizingSection = content.match(
      /## Step A: Size the description([\s\S]+?)## Step B:/,
    )?.[1]
    expect(sizingSection).toMatch(
      /State the umbrella as what is now different for someone using this, never as the mechanism that produced it/i,
    )

    // #1457 made the opening auditable against the map but never tested the map.
    // The umbrella check runs before the two questions that compare against it.
    const auditSection = content.match(
      /## Step E: Pre-apply coverage audit([\s\S]+)\s*$/,
    )?.[1]
    expect(auditSection).toMatch(/Is the umbrella itself an outcome/i)
    expect(auditSection!.indexOf("Is the umbrella itself an outcome")).toBeLessThan(
      auditSection!.indexOf("Does the title express the umbrella outcome"),
    )

    // Asked for what *and* why, #1594's revision grew the opening to ~5
    // sentences rather than fusing them. Step C now says which way the why goes.
    const assemblySection = content.match(
      /## Step C: Assemble the body([\s\S]+?)## Step D:/,
    )?.[1]
    expect(assemblySection).toMatch(
      /why belongs inside that one idea when it is the reason the outcome takes its shape/i,
    )
    expect(assemblySection).toMatch(/past two sentences it is carrying a second idea/i)
  })

  test("scopes STE-inspired prose to non-load-bearing wording", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )

    expect(content).toContain("ASD-STE100 Simplified Technical English")
    expect(content).toMatch(
      /Prefer plain wording wherever domain terms are not load-bearing/i,
    )
    expect(content).toMatch(
      /Keep necessary technical jargon.+where they \*are\* the claim/is,
    )
    expect(content).toMatch(
      /do not dilute mechanism language into vague plain English/i,
    )
    // Contrast pins both failure directions: decorative jargon vs load-bearing terms
    expect(content).toContain("jargon without need")
    expect(content).toContain("jargon is the claim")
    expect(content).toContain("`TokenStore.invalidate` is now atomic under concurrent refresh.")

    const auditSection = content.match(
      /## Step E: Pre-apply coverage audit([\s\S]+)\s*$/,
    )?.[1]
    expect(auditSection).toBeDefined()
    expect(auditSection).toMatch(
      /domain jargon that is not load-bearing/i,
    )
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
    const contextRef = await readRepoFile("skills/ce-commit-push-pr/references/context.md")

    // Existing-PR detection uses `gh pr list` (exits 0, returns `[]` when none)
    // rather than `gh pr view` (exits 1 with no PR, which aborted `!` load).
    // The exact probe command moved into the context reference read before Step 1.
    expect(contextRef).toContain("gh pr list --head <branch> --state open --json number,url,title,body,state,isDraft,headRefName,headRepositoryOwner")
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

  test("appends a known plan unit id to the commit subject without hunting", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")

    // Commit-message construction lives in the reference Step 3 mandates.
    const commitRef = await readRepoFile("skills/ce-commit-push-pr/references/commit-and-push.md")
    expect(commitRef).toContain("append that unit's U-ID in parentheses — `(U3)` means unit 3")
    expect(commitRef).toContain("Do not hunt for a plan")
    expect(commitRef).toContain("Omit when the commit spans units")
  })

  test("adds generic Compound Engineering branding only on an explicit signal", async () => {
    const reference = await readRepoFile(
      "skills/ce-commit-push-pr/references/pr-description-writing.md",
    )
    // The body owns the gate default; the apply reference owns the no-op rule for a
    // branding-only delta, since that decision happens at apply time.
    const skill = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")
    const apply = await readRepoFile("skills/ce-commit-push-pr/references/apply-and-handoff.md")
    const compose = await readRepoFile("skills/ce-commit-push-pr/references/compose.md")

    expect(reference).toContain("Built_with-Compound_Engineering")
    expect(reference).not.toContain("MODEL_SLUG")
    expect(reference).not.toMatch(/\| Harness \|/)
    expect(reference).not.toMatch(/model slug/i)
    expect(reference).toMatch(/new PR body.+resolved branding gate is on/is)
    expect(reference).toMatch(/otherwise omit/is)
    expect(reference).toMatch(/existing PR body.+preserve.+verbatim/is)
    expect(reference).toMatch(/never add one when absent/is)
    expect(reference).toMatch(/explicitly asks.+remove or replace/is)
    expect(apply).toMatch(/branding-only delta.+explicitly request/is)
    expect(skill).toMatch(/branding is \*\*off unless.+branding:on/is)
    expect(compose).toContain("normalize that natural-language request to `branding:on`")
    // The gate lives in the compose reference the body mandates before Step 4.
    expect(compose).toContain("If both tokens are present, stop and report the conflict")
    expect(skill).not.toContain("pr_branding")
    expect(skill).toMatch(/branding:on\|off/)
  })

  test("babysit handoff is default-on with off-switches and drivable fork PRs", async () => {
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/apply-and-handoff.md",
    )

    // Default-on: completion gate, announce, transfer ownership, never ask yes/no.
    expect(content).toMatch(/completion gate/i)
    expect(content).toMatch(/automatic handoff/i)
    expect(content).toMatch(/never ask yes\/no/i)
    // Off is the explicit choice: per-run token + standing config opt-out.
    expect(content).toContain("babysit:off")
    // The standing opt-out must be READ at the handoff, not merely named: naming it
    // while the only config read lived in the Step 4 reference is how a run reached
    // the gate and handed off against `auto_babysit: false` (#1601).
    expect(content).toContain("auto_babysit")
    expect(content).toContain("<!-- ce-config-layers:start -->")
    expect(content).toContain(".compound-engineering/config.local.yaml")
    // A skipped handoff is a successful terminal, not a blocked one -- otherwise the
    // completion gate's "stop and report it blocked" swallows the opt-out.
    expect(content).toMatch(/opted out[^.]{0,120}successful terminal/i)
    // Hard-off cases (orchestrated, no PR, non-GitHub, non-pushable head).
    expect(content).toMatch(/do not fire/i)
    expect(content).toMatch(/mode:pipeline/)
    expect(content).toMatch(/head branch you cannot push to/i)
    // Fork PRs are drivable, gated on head-pushability (not fork-ness); base read / head push.
    expect(content).toMatch(/fork PRs are drivable/i)
    expect(content).toMatch(/reads state on the \*\*base\*\* repo/i)
    expect(content).toMatch(/pushes fixes to the \*\*head\*\* repo/i)
    // Opting out disables new monitoring, not an already-returned human decision gate.
    expect(content).toMatch(/`babysit:off`[^.]{0,240}(does not|must not)[^.]{0,160}(suppress|hide)/i)
    expect(content).toContain("## Needs your decision")
    expect(content).toMatch(/needs-human[^.]{0,240}unchanged/i)
  })

  test("config template and example keep branding out of ambient configuration", async () => {
    for (const p of [
      "skills/ce-setup/references/config-template.yaml",
      ".compound-engineering/config.example.yaml",
    ]) {
      const template = await readRepoFile(p)
      expect(template).toContain("auto_babysit")
      expect(template).not.toContain("pr_branding")
    }
  })
})

describe("PR concept teaching contract", () => {
  // Split by load-time: the body keeps the pipeline modifier and names the gate keys
  // at Step 4; the gate resolution and the printed trailer live in the two references
  // that step mandates (compose.md before composition, apply-and-handoff.md at apply).
  test("SKILL.md wires the teaching gate, pipeline mode, and trailer", async () => {
    const content = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")
    const compose = await readRepoFile("skills/ce-commit-push-pr/references/compose.md")
    const applyRef = await readRepoFile(
      "skills/ce-commit-push-pr/references/apply-and-handoff.md",
    )
    const trailerStart = applyRef.indexOf("**User-runnable invocation rendering.**")
    const trailerEnd = applyRef.indexOf("**Babysit handoff", trailerStart)
    const trailer =
      trailerEnd > trailerStart ? applyRef.slice(trailerStart, trailerEnd) : applyRef.slice(trailerStart)

    // Non-interactive modifier for orchestrated callers
    expect(content).toContain("mode:pipeline")
    expect(content).toContain("suppress every blocking ask")

    // Config gate: both keys, active-key-only resolution, single-gate semantics
    expect(content).toContain("pr_teaching_section")
    expect(content).toContain("pr_teaching_archive")
    expect(content).toContain("active (non-commented)")
    expect(compose).toContain("Step B2")

    // Machine-readable trailer + host-rendered interactive offer
    expect(trailerStart).toBeGreaterThan(-1)
    expect(trailerEnd).toBeGreaterThan(trailerStart)
    expect(trailer).toContain("New concepts:")
    expect(trailer).toContain("using the rendering rule above")
    expect(trailer).toContain("$ce-explain <name>")
    expect(trailer).toContain("/ce-explain <name>")
    expect(trailer).not.toContain("/skill:ce-explain")
    expect(trailer).toMatch(/default to `\/ce-explain <name>`[\s\S]{0,220}Codex[\s\S]{0,260}output one form only/i)
  })

  test("SKILL.md archival transition guards ordering, gitignore, and modes", async () => {
    // Archival executes inside Step 5, in the reference that step mandates.
    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/apply-and-handoff.md",
    )

    expect(content).toContain("<root>/explainers/")
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

  // Split by load-time: the body carries the completion gate (this run is not done
  // until ce-babysit-pr owns the PR, no substitute watch, blocked is a stop), and the
  // reference Step 5 mandates carries the handoff mechanics and the do-not-fire cases.
  test("babysit handoff requires ownership transfer, forbids substitutes, hard-fails on load failure", async () => {
    const body = await readRepoFile("skills/ce-commit-push-pr/SKILL.md")
    expect(body).toMatch(/not done.+until `ce-babysit-pr` owns/is)
    expect(body).toMatch(/Reporting the PR URL alone is not success/)
    expect(body).toContain("`ci-watcher`")
    expect(body).toContain("`gh pr checks --watch`")
    expect(body).toMatch(/cannot be loaded or started/i)

    const content = await readRepoFile(
      "skills/ce-commit-push-pr/references/apply-and-handoff.md",
    )

    const handoff = content.match(/\*\*Babysit handoff — default on; completion gate\.\*\*[\s\S]+?(?=\n\nA draft-only stack submit)/)?.[0]
    expect(handoff).toBeDefined()
    // Completion gate: PR URL alone is not done; ce-babysit-pr must own follow-on.
    expect(handoff).toMatch(/not done.+until `ce-babysit-pr` owns/is)
    expect(handoff).toMatch(/Reporting the PR URL alone is not success/)
    expect(handoff).toMatch(/\*\*Success\*\*.+`ce-babysit-pr` has started/is)
    // Harness-agnostic load: use the host's normal skill mechanism without a platform matrix.
    expect(handoff).toMatch(/host's normal skill-invocation mechanism/)
    expect(handoff).not.toContain("Claude Code `Skill` tool")
    // Observed drift (Nugget PR #1933): bare `pr-snapshot watch` instead of loading
    // ce-babysit-pr. Keep anti-reinvention at this seam.
    expect(handoff).toContain("Never start babysit mechanics yourself")
    expect(handoff).toContain("`pr-snapshot`")
    // Observed drift (Nugget PR #1983): Cursor agent substituted Task(ci-watcher)
    // when skill load failed. Name non-substitutes and require hard-fail.
    expect(handoff).toContain("`ci-watcher`")
    expect(handoff).toContain("`gh pr checks --watch`")
    expect(handoff).toMatch(/Handoff blocked/i)
    expect(handoff).toMatch(/cannot be loaded or started/i)
    expect(handoff).toMatch(/Do not invent a parallel or narrower watch/)

    // Observed drift (Nugget PR #1934): auto-babysit fired on a draft design PR, forcing the
    // session to improvise "never mark ready" caveats. Drafts are a not-ready signal; the
    // auto-handoff must not fire on them (explicit babysit tokens still force it).
    // Soft-degrade is checkpoint-only after successful ownership — not a failed-handoff fallback.
    // `$` alternative: the do-not-fire block is now the body's final paragraph.
    const doNotFire = content.match(/\*\*Do not fire \(auto-detected[\s\S]+?(?=\n\n|$)/)?.[0]
    expect(doNotFire).toBeDefined()
    expect(doNotFire).toContain("draft")
    expect(doNotFire).toContain("`babysit:continuous`")
    expect(doNotFire).toMatch(/after successful handoff only/i)
    expect(doNotFire).toMatch(/not a substitute for a failed handoff/i)
  })

  test("opt-in stack mode constructs or submits a stack and hands off with posture", async () => {
    const [skill, submit, cli] = await Promise.all([
      readRepoFile("skills/ce-commit-push-pr/SKILL.md"),
      readRepoFile("skills/ce-commit-push-pr/references/stack-submit.md"),
      readRepoFile("skills/ce-commit-push-pr/references/gh-stack-cli.md"),
    ])
    const applyRef = await readRepoFile(
      "skills/ce-commit-push-pr/references/apply-and-handoff.md",
    )

    expect(submit).toContain("Compose `<bottom-message>` and `<next-message>` with the same subject rule as Step 3")
    expect(submit).toContain("append that unit's U-ID in parentheses — `(U3)` means unit 3")
    expect(submit).toMatch(/named a parent PR or branch to stack on, classify it/i)
    expect(submit).toContain("references/gh-stack-cli.md")
    expect(submit).toMatch(/Classify by \*\*PR number\*\*.{0,140}pulls a stack down from GitHub/is)
    expect(submit).toMatch(/exit 0 — parent now checked out/i)
    expect(submit).toMatch(/exit 2 — nothing checked out/i)
    // Classification moves HEAD; construction reads the checked-out branch as the original.
    expect(submit).toMatch(/record your work branch and its tip \*\*before\*\* classifying and return to them before construction/i)
    expect(submit).toMatch(/plan the layers from your restored work branch, then check the parent out again/i)
    expect(submit).toMatch(/Exit \*\*5\*\* means that parent is not the top: residual/i)
    expect(submit).toMatch(/Never clear it with `gh stack top`/i)
    // The facts file must not prescribe the recovery Topology forbids.
    expect(cli).toMatch(/moving there with `gh stack top` is a\s+decision, not a fix/i)
    expect(submit).toMatch(/resolve `<parent-branch>` first/i)
    // Both conditions below regressed twice while this block was compressed.
    expect(submit).toMatch(/From a branch with no PR, fetch and verify that ref directly/i)
    expect(submit).toMatch(/make sure a local branch sits \*\*at `headRefOid`\*\*/i)
    expect(submit).toMatch(/verify it is at that commit and stop with a residual otherwise/i)
    expect(cli).toMatch(/reachability leaves the commit with no branch to name/i)
    expect(cli).toMatch(/no documented branch ordering, so do not derive position/i)
    expect(submit).toMatch(/only when `author` is the current user/i)
    expect(submit).toMatch(/in place of the generic one shown in construction/i)
    expect(submit).toMatch(/\*\*Unproven\*\* — a residual, not a guess/i)
    expect(cli).toMatch(/Existing branches are adopted;\s+missing ones are created/i)
    expect(submit).toMatch(/stop with a residual on a name that fails/i)
    expect(cli).toMatch(/gh stack version 0\.1\.0/i)
    expect(cli).toMatch(/--help` is authoritative/i)
    expect(cli).toMatch(/must run from the \*\*top\*\* branch.{0,120}exits \*\*5\*\*/is)
    expect(cli).toMatch(/Existing branches are adopted;\s+missing ones are created/i)
    expect(cli).toMatch(/gh stack link`\*\* — GitHub-only by design.{0,140}no local tracking/is)
    expect(cli).toMatch(/gh pr merge`\*\* on a stack member/i)
    expect(skill).toContain("## Stack mode (opt-in)")
    expect(skill).toContain("**Do not** proactively suggest PR stacks")
    expect(skill).toMatch(/explicit stack request is \*\*required intent\*\*.{0,120}not re-read it as a single PR/is)
    expect(skill).toMatch(/did \*\*not\*\* ask for one, \*\*refuse\*\* nonsense stacks/i)
    expect(skill).toContain("references/stack-submit.md")
    expect(skill).toMatch(/do not add `posture:` to this skill's argument-hint/i)
    // The body mandates the reference before Step 3; the probe -> topology ->
    // retrospective ordering is that reference's own contract.
    expect(skill).toMatch(/load `references\/stack-submit\.md` \*\*before Step 3\*\*/i)
    expect(submit).toMatch(/Probe[\s\S]{0,4000}Topology[\s\S]{0,8000}Retrospective/is)
    // Submission ownership is stated where submission happens.
    expect(submit).toMatch(/Step 5 exclusively owns stack submission[\s\S]{0,160}PRs created in this run/is)
    expect(skill).toMatch(/replaces ordinary Step 3/i)
    expect(skill).toContain("posture:stack-ready")
    expect(skill).toContain("posture:stack-land")
    expect(skill).toMatch(/bottom open non-draft/i)
    // The mid-stack existing-PR route runs at apply time, in the Step 5 reference.
    expect(applyRef).toMatch(/Stack mode[\s\S]{0,80}still follow the Submit section of `references\/stack-submit\.md`/i)
    // The pipeline exception is part of the do-not-fire list in the apply reference.
    expect(applyRef).toMatch(/mode:pipeline` \*\*except\*\* when this run completed a stack-mode submit/i)
    expect(applyRef).toMatch(/outer orchestrator[\s\S]{0,80}second bare babysit/i)
    expect(applyRef).toMatch(/mode:pipeline[\s\S]{0,160}started-only is not enough/i)
    expect(submit).toMatch(/authoritative parent tip/i)
    expect(submit).toContain('git checkout -b -- "<branch-name>" "<parent-tip>"')
    expect(submit).toMatch(/Do not hard-code `origin\/<parent>`/i)
    expect(submit).toMatch(/starts on the resolved default branch.+follow `references\/branch-creation\.md`/is)
    expect(submit).toMatch(/starts on an existing feature branch.+do not follow `references\/branch-creation\.md`/is)
    expect(submit).toMatch(/feature branch.+fetch the resolved base `<base>` from Topology.+verify the fetched remote-tracking tip/is)
    expect(submit).toMatch(/no remote-tracking branch to fetch or verify/i)
    expect(submit).toMatch(/stop with a residual on a name that fails/i)
    expect(submit).toMatch(/did not ask for a stack in this request.{0,80}standing preference alone is not asking/is)
    expect(submit).toMatch(/refuse the stack.{0,80}explicit request is not refusable/is)
    expect(submit).toMatch(/original tip.+recovery (ref|branch)/is)
    expect(submit).toMatch(/committed.+planned commit tip/is)
    expect(submit).toMatch(/uncommitted.+save.+tracked and untracked.+restore.+planned layer/is)
    expect(submit).toMatch(/do not treat.+feature commits.+unpushed commits.+local default/is)
    expect(submit).toMatch(/upstack.+do \*\*not\*\* follow `references\/branch-creation\.md`/is)
    expect(submit).toContain("## Retrospective construction")
    expect(submit).toMatch(/Before ordinary Step 3[\s\S]{0,180}do not run Submit/is)
    expect(submit).toMatch(/Step 5[\s\S]{0,100}only phase that runs Submit/is)
    expect(submit).toMatch(/complete change set/i)
    expect(submit).toMatch(/smallest useful set.+independently reviewable/is)
    expect(submit).not.toMatch(/2-3.+layers/is)
    expect(submit).toMatch(/dependency order/i)
    expect(submit).toMatch(/one safe topology is clear.+proceed/is)
    expect(submit).toMatch(/multiple reasonable topologies.+ask the user/is)
    expect(submit).toMatch(/mode:pipeline.+stop.+residual/is)
    expect(submit).toContain('gh stack init --base "<base>" "<bottom-branch>"')
    expect(submit).toContain('gh stack add "<next-branch>"')
    expect(submit).toMatch(/whole-file groups|existing commit boundaries/i)
    expect(submit).toMatch(/published history.+explicit confirmation/is)
    expect(submit).toMatch(/mode:pipeline.+do not split or rewrite.+residual.+explicit confirmation/is)
    expect(submit).toMatch(/after submit.+every PR created in this run.+explicit PR URL/is)
    expect(submit).toMatch(/new PR.+PR-description composition.+PR mode.+immediate parent.+exact head/is)
    expect(submit).toContain('gh pr edit "<pr-url>"')
    expect(submit).toMatch(/never rely on the restored current branch to select the PR/is)
    expect(submit).toMatch(/Existing stack PRs retain their titles and bodies.+explicitly requested a rewrite/is)
    expect(submit).toMatch(/mode:pipeline.+conservative no-rewrite default/is)
    expect(skill).not.toContain("`base:<layer-base>`")
    expect(submit).toMatch(/resolve.+`pr_teaching_archive`.+`archive:on\|off`.+before submit/is)
    expect(submit).toMatch(/archival is on.+stop.+before `gh stack submit`/is)
    expect(submit).toMatch(/do not create an explainer commit after submission/is)
    expect(submit).toMatch(/rerun with `archive:off`.+safe post-submit description path/is)
    expect(submit).toContain("gh stack submit --auto --open")
    expect(submit).toMatch(/existing draft/i)
    expect(submit).toMatch(/do \*\*not\*\* pass `--open`/i)
    expect(submit).not.toMatch(/does \*\*not\*\* invent commit-splitting/i)
    expect(submit).toMatch(/required[\s\S]{0,120}hard-stop/i)
    expect(submit).toMatch(/soft[\s\S]{0,120}single-PR/i)
    expect(submit).toMatch(/Forbidden on managed members/i)
  })
})
