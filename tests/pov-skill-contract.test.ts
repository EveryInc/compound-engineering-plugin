import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

const ROOT = process.cwd()

async function skillFile(relative: string): Promise<string> {
  return readFile(path.join(ROOT, "skills/ce-pov", relative), "utf8")
}

function between(content: string, start: string, end: string): string {
  const from = content.indexOf(start)
  const to = content.indexOf(end, from + start.length)
  if (from < 0 || to <= from) throw new Error(`missing contract region: ${start} -> ${end}`)
  return content.slice(from, to)
}

function compact(content: string): string {
  return content.replace(/\s+/g, " ")
}

describe("ce-pov subject-shape contract", () => {
  test("the activation contract names all three POV shapes and avoids generic repo profiling", async () => {
    const skill = await skillFile("SKILL.md")

    expect(skill).toContain("external-adoption question")
    expect(skill).toContain("holistic take")
    expect(skill).toContain("approach set")
    expect(skill).toContain("Send scouts directly to candidate-specific current evidence")
    expect(skill).not.toContain("repo-profile-cache")
  })

  test("licenses bounded inline grounding while keeping the prior-decision scan mandatory", async () => {
    const skill = await skillFile("SKILL.md")
    const phaseOne = between(skill, "### Phase 1: Ground", "### Phase 2: Verify Grounding")

    expect(phaseOne).toContain("Send scouts directly to candidate-specific current evidence")
    expect(phaseOne).toMatch(/bounded reads.*instead of dispatching scouts/)
    expect(phaseOne).toMatch(/a pointer to check, never self-verifying/)
    expect(phaseOne).toMatch(/unscoped or noisy grounding still dispatches/)
    expect(phaseOne).toMatch(/prior-decision scan.*stays mandatory on either path/)
  })

  test("semantic cross-model requests activate without the oracle shorthand", async () => {
    const skill = await skillFile("SKILL.md")
    const frontmatter = skill.split("---", 3)[1] ?? ""

    expect(frontmatter).toContain("consult other models")
    expect(frontmatter).toContain("reconcile their opinions")
  })

  test("the always-loaded Phase 0 frame names the document and approach intents", async () => {
    const skill = await skillFile("SKILL.md")
    const phaseZero = between(skill, "### Phase 0: Frame and Classify", "### Phase 1: Ground")

    expect(phaseZero).toContain("Document-take")
    expect(phaseZero).toContain("Approach-set")
  })

  test("keeps user-facing copy decision-oriented without exposing project internals", async () => {
    const skill = await skillFile("SKILL.md")
    const userCopy = between(skill, "## User-facing communication", "## Interaction Method")

    expect(userCopy).toContain("person deciding")
    expect(userCopy).toContain("decision, question, or recommendation")
    expect(userCopy).toContain("internal workflow vocabulary")
    expect(userCopy).toContain('"this project" or "the repository"')
    expect(userCopy).toMatch(/never promote.*directory.*worktree.*checkout.*branch/i)
  })

  test("intake and boundaries distinguish takes, findings reviews, and supplied approaches", async () => {
    const [intake, boundaries] = await Promise.all([
      skillFile("references/intake.md"),
      skillFile("references/boundaries.md"),
    ])

    expect(intake).toContain("**Document-take**")
    expect(intake).toContain("**Approach-set**")
    expect(boundaries).toContain('"review this doc"')
    expect(boundaries).toContain('"what do you think of this doc?"')
    expect(boundaries).toContain("`ce-doc-review`")
    expect(boundaries).toContain("Options supplied")
    expect(boundaries).toContain("`ce-ideate`")
  })

  test("method keeps adoption grades and defines honest non-adoption outcomes", async () => {
    const method = await skillFile("references/method.md")

    for (const grade of ["**Adopt**", "**Trial**", "**Hold**", "**Reject**", "**Not-our-problem**"]) {
      expect(method).toContain(grade)
    }
    expect(method).toContain('**"Blocked — insufficient project grounding"**')
    expect(method).toContain('**"Blocked — external evidence unavailable"**')
    expect(method).toContain('**"Either is viable"**')
    expect(method).toContain("Never manufacture certainty with a scorecard")
  })
})

describe("ce-pov cross-model panel contract", () => {
  test("loads the panel protocol before deciding whether to offer", async () => {
    const skill = await skillFile("SKILL.md")
    const phaseThree = between(skill, "### Phase 3: Point of View", "### Phase 4: Follow-up")

    expect(phaseThree).toContain("may qualify for a proactive offer")
    expect(phaseThree).toContain("before resolving participation or deciding whether to offer")
    expect(phaseThree).toContain("authorizes the panel protocol's normal read-only consultation")
    expect(phaseThree).toContain("Announce the selected peers before dispatch")
    expect(phaseThree).toMatch(/ask only when a retry adds an unexpected recipient or intermediary/)
    expect(phaseThree).toContain("shared working tree")
  })

  test("forms an independent solo POV before the panel and emits only after it finishes", async () => {
    const skill = await skillFile("SKILL.md")
    const phaseThree = between(skill, "### Phase 3: Point of View", "### Phase 4: Follow-up")

    const formSolo = phaseThree.indexOf("form ce-pov's own independent POV")
    const runPanel = phaseThree.indexOf("finish the panel branch")
    const emitFinal = phaseThree.indexOf("Only then emit")

    expect(formSolo).toBeGreaterThan(-1)
    expect(runPanel).toBeGreaterThan(formSolo)
    expect(emitFinal).toBeGreaterThan(runPanel)
    expect(phaseThree).toContain("Freeze that position")
    expect(phaseThree).toMatch(/Keep it out of an independent peer's initial context/)
    expect(phaseThree).toMatch(/critique that position|reconciliation round/)
  })

  test("discloses panel status after any summons even when no panel runs", async () => {
    const skill = await skillFile("SKILL.md")
    const panel = await skillFile("references/cross-model-panel.md")
    const phaseThree = between(skill, "### Phase 3: Point of View", "### Phase 4: Follow-up")

    expect(phaseThree).toContain("states which peers ran")
    expect(phaseThree).toMatch(/caller's paraphrase in one channel never cancels/)
    expect(phaseThree).toMatch(/no summons keeps the solo result unchanged with no panel note/)
    expect(panel).toMatch(/summons was present but the panel branch never entered/)
  })

  test("follow-up covers every subject shape while retaining adoption tier gates", async () => {
    const skill = await skillFile("SKILL.md")
    const phaseFour = skill.slice(skill.indexOf("### Phase 4: Follow-up"))

    expect(phaseFour).toContain("active subject shape")
    expect(phaseFour).toContain("Document take")
    expect(phaseFour).toContain("Approach-set position")
    expect(phaseFour).toContain("For adoption subjects")
    expect(phaseFour).toContain("Tier 1")
    expect(phaseFour).toContain("Tier 2/3")
  })

  test("warm invocations return a POV block without proactive follow-up", async () => {
    const skill = await skillFile("SKILL.md")
    const phaseFour = skill.slice(skill.indexOf("### Phase 4: Follow-up"))

    expect(phaseFour).toContain("output the POV block")
    expect(phaseFour).not.toContain("output the verdict block")
  })

  test("uses the JSON Schema draft supported by the Claude CLI", async () => {
    const schema = JSON.parse(await skillFile("references/pov-schema.json"))

    expect(schema.$schema).toBe("http://json-schema.org/draft-07/schema#")
  })

  test("requires explicit movement and an independence receipt", async () => {
    const schema = JSON.parse(await skillFile("references/pov-schema.json"))

    expect(schema.required).toContain("movement")
    expect(schema.properties.movement.enum).toEqual(["initial", "moved", "held"])
    expect(schema.properties.independence_verified.type).toBe("boolean")
    expect(schema.properties.cross_model_target.type).toBe("string")
    expect(schema.properties.cross_model_harness.type).toBe("string")
    expect(schema.properties.serving_family.type).toBe("string")
  })

  test("pins participation counts and the complete stop-rule enum", async () => {
    const panel = await skillFile("references/cross-model-panel.md")

    expect(panel).toContain("shorthand for the panel behavior, not a keyword gate")
    expect(panel).toMatch(/consult other models.*independent peer opinions.*reconcile their disagreement/s)
    expect(panel).toMatch(/Named peers:\*\* exact and uncapped/)
    expect(panel).toContain("up to two reachable")
    for (const stop of ["**`confident`**", "**`no-movement`**", "**`limit-reached`**"]) {
      expect(panel).toContain(stop)
    }
    expect(panel).toMatch(/Route `confident` to\s+the \*\*Confident\*\* disclosure/)
    expect(panel).toMatch(/Route `no-movement` and `limit-reached` to\s+the \*\*Stalemate\*\* disclosure/)
    expect(panel).toContain("effective user-authorized finite limit")
    expect(panel).not.toContain("`cap-2`")
  })

  test("pins material dissent for every subject and bounded reconcile context", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const prose = compact(panel)

    expect(prose).toContain("different adoption grade")
    expect(prose).toContain("different selected approach")
    expect(prose).toContain("document bottom lines that imply different reader actions")
    expect(prose).toContain("full original subject")
    expect(prose).toMatch(/five succinct.*source-attributed evidence bullets per voice/)
  })

  test("pins fixed-route announcement and bounded authority without secrecy claims", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const prose = compact(panel)

    expect(prose).toContain("Resolve one concrete target")
    expect(prose).toContain("Announce the selected target and route")
    expect(prose).toMatch(/Invoking `oracle` authorizes.*read-only consultation/)
    expect(prose).toMatch(/retry would add an unexpected recipient or intermediary.*ask/)
    expect(prose).toMatch(/read-only|may not mutate/)
    expect(prose).toContain("cooperative")
    expect(prose).toMatch(/never promise that secrets.*are inaccessible/)
    expect(panel).not.toContain("privacy notice")
    expect(prose).toMatch(/Do not recite.*CLI versions.*commit hashes.*route health/)
    expect(prose).toContain("return failure to the host")
  })

  test("keeps initial independent payloads blind while critique and reconciliation expose positions", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const dispatch = between(panel, "## 4. Dispatch, wait, reap, and collect", "## 5. Detect dissent")
    const prose = compact(dispatch)

    expect(prose).toMatch(/initial `independent` round, exclude ce-pov's position and every other voice's conclusion/)
    expect(prose).toMatch(/proposal, document, or approach set.*subject.*fully available/)
    expect(prose).toMatch(/host's own argument.*is reconcile-round material, not round-1 material/)
    expect(prose).toMatch(/Define round-1 evidence by provenance/)
    expect(prose).toContain("rejecting every supplied option, or the framing itself, is a valid position")
    expect(prose).toContain("present the options symmetrically in the payload's own words")
    expect(prose).toMatch(/For `skeptic` mode, include ce-pov's position/)
    expect(prose).toMatch(/Reconciliation payloads.*include already-formed positions/)
    expect(prose).toMatch(/Do not duplicate readable files/)
  })

  test("packages a prior-opinion subject as first-class without capitulating", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const invocation = await skillFile("references/invocation.md")
    const prose = compact(panel)

    expect(panel).toContain("Prior-opinion subjects")
    expect(prose).toMatch(/already-formed position.*that position is the subject artifact and ships in the payload/)
    expect(prose).toMatch(/enter convergence \(unlike `skeptic` mode/)
    expect(panel).toContain("never capitulated to")
    expect(invocation).toContain("not a revision prompt")
  })

  test("grounds initial peers in the subject and shared tree without a host-curated project floor", async () => {
    const peer = await skillFile("references/agents/pov-peer.md")
    const prose = compact(peer)

    expect(prose).toMatch(/supplied subject.*shared working tree/)
    expect(prose).toContain("Do not require or infer a host-curated project summary")
    expect(prose).not.toContain("verified project floor")
    expect(prose).not.toContain("shared project floor")
  })

  test("uses the default reconciliation cap as a user-extensible checkpoint", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const reconcile = between(panel, "## 5. Detect dissent", "## 6. Decide and disclose")
    const prose = compact(reconcile)

    expect(prose).toMatch(/independent initial round plus at most two reconcile exchanges/)
    expect(prose).toMatch(/"one pass" or "one round" means no reconcile exchange/)
    expect(prose).toContain("cap stops automatic dispatch")
    expect(prose).toMatch(/Recommend a specific number of additional exchanges only when/)
    expect(prose).toMatch(/Further rounds require user approval/)
    expect(prose).toMatch(/new finite cap, never an open-ended loop/)
  })

  test("names the peer result artifact and pins result-path at job start", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const prose = compact(panel)

    expect(panel).toContain("pov-<target>.json")
    expect(prose).toContain("grok-cli`/`grok-cursor` collapsing to `grok`")
    expect(prose).toMatch(/Pass exactly that\s+path as `--result-path`/)
  })

  test("keeps include and exclude path filters explicitly cooperative in the worker prompt", async () => {
    const worker = await skillFile("scripts/cross-model-pov.sh")
    const scopePrompt = between(worker, '<repository-read-scope enforcement=', "<subject-payload>")

    expect(scopePrompt).toContain("cooperative-unless-adapter-supported")
    expect(scopePrompt).toContain("INCLUDE_PATHS")
    expect(scopePrompt).toContain("EXCLUDE_PATHS")
  })

  test("pins fail-closed host attestation and classified skip evidence", async () => {
    const panel = await skillFile("references/cross-model-panel.md")

    expect(panel).toContain("host-provided markers and serving evidence")
    expect(panel).toContain("automatic discovery excludes")
    expect(panel).toContain("rather than guessing")
    expect(panel).toContain("ownership-checked `result`")
    expect(panel).toContain("`peer skip evidence`")
    expect(panel).toContain("quota, authentication, or route failure")
  })

  test("documents complete bounded wait invocations without a separate shell sleep", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const prose = compact(panel)

    expect(panel).toContain("wait --max-secs 30 --json <job-ids...>")
    expect(panel).toContain("wait --max-secs 10 --json <job-ids...>")
    expect(prose).toMatch(/`--skill`, `--run-id`, and `--label` are start-only/)
    expect(prose).toMatch(/Do not add a separate shell sleep.*`wait` itself provides the bounded polling delay/)
  })

  test("pins repository grounding, snapshot identity, and common reconcile evidence", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const prose = compact(panel)

    expect(prose).toContain("repository root")
    expect(prose).toContain("ordered include and exclude")
    expect(prose).toContain("cooperative")
    expect(prose).toContain("committed revision")
    expect(prose).toContain("dirty and untracked")
    expect(prose).toContain("before every reconcile dispatch")
    expect(prose).toContain("before final fold-in")
    for (const classification of ["`verified`", "`contradicted`", "`unverifiable`"]) {
      expect(panel).toContain(classification)
    }
  })

  test("pins Cursor-default identity and bounded adaptability without silent recipient changes", async () => {
    const panel = await skillFile("references/cross-model-panel.md")
    const prose = compact(panel)

    expect(prose).toContain("Cursor default/Auto")
    expect(prose).toContain("Composer")
    expect(prose).toContain("Routing is adaptable only inside hard boundaries")
    expect(prose).toContain("declared preferred mapping first")
    expect(prose).toContain("same requested target")
    expect(prose).toContain("independence_verified")
    expect(prose).toMatch(/unexpected recipient or intermediary.*ask/)
    expect(prose).toContain("return failure to the host")
  })

  test("pins the four-part downstream handoff conjunction", async () => {
    const panel = await skillFile("references/cross-model-panel.md")

    expect(panel).toContain("original prompt explicitly authorized")
    expect(panel).toContain("non-stalemated")
    expect(panel).toMatch(/inherited\s+scope/)
    expect(panel).toContain("non-destructive")
    expect(panel).toContain("otherwise authorized")
  })

  test("the worker rejects output without non-empty string position and reasoning", async () => {
    const worker = await skillFile("scripts/cross-model-pov.sh")
    const usableOutputGate = between(worker, "out_missing_or_invalid()", "# Backward-compatible matrix")

    expect(usableOutputGate).toContain('(.position|type)=="string" and (.position|length)>0')
    expect(usableOutputGate).toContain('(.reasoning|type)=="string" and (.reasoning|length)>0')
    expect(usableOutputGate).toContain('.movement=="initial"')
    expect(usableOutputGate).toContain('.movement=="moved"')
    expect(usableOutputGate).toContain('.movement=="held"')
  })
})
