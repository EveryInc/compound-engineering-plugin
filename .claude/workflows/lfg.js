/**
 * lfg — the /lfg pipeline, re-imagined as a compounding multi-agent loop.
 *
 * The shipped `/lfg` skill is linear and amnesiac: plan -> work -> review -> test
 * -> commit -> PR -> watch CI. It is autonomous, but every task starts from zero
 * and ends without teaching the next one anything.
 *
 * This workflow keeps the same end-to-end autonomy, adds the two halves that make
 * it *compound*, and fans out the phases the Workflow engine can parallelize.
 * Each phase is named after the compound-engineering step / skill it runs:
 *
 *   Riffrec       — ce-riffrec-feedback-analysis: if a recording is present, find
 *                   + analyze it and fold its findings into the task. (compound IN)
 *   Research      — ce-* researcher agents in parallel (learnings, repo, git
 *                   history, best practices), distilled into one brief. (compound IN)
 *   Ideate        — ce-ideate, run as a 3-lens judge panel -> chosen direction.
 *   Plan          — ce-plan: a durable implementation plan under docs/plans/.
 *   Doc Review    — ce-doc-review: adversarially stress-test the plan (fatal -> abort).
 *   Work          — ce-work: execute the plan.
 *   Code Review   — ce-code-review: persona reviewers per dimension, deduped by
 *                   file:line, adversarially verified; severity gate.
 *   Autofix       — apply confirmed blocker/high/medium findings (defer low to PR).
 *   Re-review     — re-review the fix diff for regressions the fixes introduced.
 *   Simplify      — ce-simplify-code: behavior-preserving cleanup.
 *   Test          — suite/build/lint + ce-test-browser (web) / simulator (iOS).
 *   Dogfood       — ce-dogfood-beta: ALWAYS exercise the product as a user.
 *   Commit & PR   — ce-commit-push-pr (+ ce-demo-reel), then monitor CI until green.
 *   Compound      — ce-compound: capture the learning so the next Research starts
 *                   ahead. (compound OUT)
 *
 * Run it:  Workflow({ name: "lfg", args: "<feature description>" })
 *          Workflow({ name: "lfg", args: { task: "...", dryRun: true } })  // test
 * Watch:   /workflows
 *
 * Every mutating phase runs NON-INTERACTIVELY (no blocking questions) because a
 * background workflow has no user to answer. Read-only phases use the plugin's
 * ce-* agents directly via agentType; orchestration-heavy phases spawn generic
 * agents that invoke the corresponding ce-* skill. Skills flagged
 * disable-model-invocation (ce-test-xcode, ce-dogfood-beta) cannot be invoked
 * from a workflow, so their behavior is inlined into Test/Dogfood instead.
 */

export const meta = {
  name: 'lfg',
  description: 'Compounding autonomous engineering pipeline named in compound-engineering steps: Riffrec, Research, Ideate, Plan, Doc Review, Work, Code Review, Autofix, Re-review, Simplify, Test, Dogfood, Commit & PR, Compound. Recalls prior learnings in and captures a durable learning out, watching CI to green.',
  whenToUse: 'Hands-off execution of a software task when you want the full compound-engineering loop (institutional recall in, durable learning out, CI watched to green) rather than a single linear pass. Pass the feature description (or a Riffrec bundle path) as args. Add { dryRun: true } to stop before Commit & PR / CI / Compound.',
  phases: [
    { title: 'Riffrec', detail: 'ce-riffrec-feedback-analysis — if a recording is present, find + analyze it and fold its findings into the task' },
    { title: 'Research', detail: 'Parallel ce-* researchers (learnings, repo, git history, best practices) distilled into one brief' },
    { title: 'Ideate', detail: 'ce-ideate as a 3-lens judge panel (MVP / risk / leverage) -> chosen direction' },
    { title: 'Plan', detail: 'ce-plan writes a durable plan grounded in research + direction' },
    { title: 'Doc Review', detail: 'ce-doc-review — adversarially stress-test the plan (fatal -> abort)' },
    { title: 'Work', detail: 'ce-work executes the plan with the Doc Review concerns in view' },
    { title: 'Code Review', detail: 'ce-code-review — persona reviewers per dimension, dedup by file:line, adversarially verify, severity gate' },
    { title: 'Autofix', detail: 'Apply confirmed blocker/high/medium findings; defer low to the PR' },
    { title: 'Re-review', detail: 'Re-review the fix diff for regressions the fixes introduced; fix them' },
    { title: 'Simplify', detail: 'ce-simplify-code — behavior-preserving cleanup of the corrected code' },
    { title: 'Test', detail: 'Suite/build/lint + ce-test-browser (web) / simulator (iOS)' },
    { title: 'Dogfood', detail: 'ce-dogfood-beta — always exercise the product as a user across surfaces; fix breakage, add regression tests' },
    { title: 'Commit & PR', detail: 'ce-commit-push-pr (+ ce-demo-reel), then monitor CI and fix until green' },
    { title: 'Compound', detail: 'ce-compound captures the learning when something non-obvious happened' },
  ],
}

// ---------------------------------------------------------------------------
// Schemas — agents that return data are forced through StructuredOutput so the
// script gets validated objects, not prose it has to parse.
// ---------------------------------------------------------------------------

const RIFFREC_SCHEMA = {
  type: 'object',
  properties: {
    found: { type: 'boolean' },
    path: { type: ['string', 'null'], description: 'Path to the Riffrec bundle/zip analyzed' },
    feedback: { type: 'string', description: "Structured product feedback extracted: bugs, UX issues, repro steps, the user's spoken intent" },
  },
  required: ['found'],
}

const APPROACH_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    approach: { type: 'string', description: 'How this lens would implement the task' },
    firstStep: { type: 'string' },
    risks: { type: 'array', items: { type: 'string' } },
    why: { type: 'string', description: 'Why this lens favors this approach' },
  },
  required: ['name', 'approach'],
}

const DIRECTION_SCHEMA = {
  type: 'object',
  properties: {
    winner: { type: 'string', description: 'Which candidate approach won' },
    direction: { type: 'string', description: 'The synthesized direction the planner should follow' },
    rationale: { type: 'string' },
    graftedIdeas: { type: 'array', items: { type: 'string' }, description: 'Best ideas pulled from the runner-up lenses' },
    watchOuts: { type: 'array', items: { type: 'string' } },
  },
  required: ['direction', 'rationale'],
}

const PLAN_SCHEMA = {
  type: 'object',
  properties: {
    planPath: { type: ['string', 'null'], description: 'Repo-relative path to the plan written under docs/plans/, or null if none was written' },
    assumptions: { type: 'array', items: { type: 'string' } },
  },
  required: ['planPath'],
}

const PLANCHECK_SCHEMA = {
  type: 'object',
  properties: {
    fatal: { type: 'boolean', description: 'True only if the plan is fundamentally unbuildable against this codebase' },
    concerns: {
      type: 'array',
      items: {
        type: 'object',
        properties: { issue: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] } },
        required: ['issue', 'severity'],
      },
    },
  },
  required: ['fatal', 'concerns'],
}

const BUILD_SCHEMA = {
  type: 'object',
  properties: {
    changed: { type: 'boolean', description: 'Whether any files were actually created or modified' },
    summary: { type: 'string' },
    files: { type: 'array', items: { type: 'string' } },
    surfaces: {
      type: 'array',
      items: { type: 'string', enum: ['web-ui', 'ios', 'cli', 'api', 'library', 'docs', 'other'] },
      description: 'Observable surfaces this change touches — drives which validations and dogfood mode run',
    },
  },
  required: ['changed', 'summary'],
}

const FINDINGS_SCHEMA = {
  type: 'object',
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          file: { type: 'string' },
          line: { type: ['integer', 'null'] },
          severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] },
          rationale: { type: 'string' },
          suggestedFix: { type: 'string' },
        },
        required: ['title', 'severity'],
      },
    },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object',
  properties: {
    isReal: { type: 'boolean', description: 'True only if the finding can be confirmed from the actual code' },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoning: { type: 'string' },
  },
  required: ['isReal', 'reasoning'],
}

const FIX_SCHEMA = {
  type: 'object',
  properties: {
    fixed: { type: 'array', items: { type: 'string' } },
    residual: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, reason: { type: 'string' } },
        required: ['title', 'reason'],
      },
    },
  },
  required: ['fixed', 'residual'],
}

const SIMPLIFY_SCHEMA = {
  type: 'object',
  properties: {
    applied: { type: 'array', items: { type: 'string' }, description: 'Simplifications applied' },
    testsPassed: { type: 'boolean' },
    notes: { type: 'string' },
  },
  required: ['notes'],
}

const VERIFY_SCHEMA = {
  type: 'object',
  properties: {
    passed: { type: 'boolean' },
    checksRun: { type: 'array', items: { type: 'string' } },
    surfacesValidated: { type: 'array', items: { type: 'string' } },
    notes: { type: 'string' },
  },
  required: ['passed', 'notes'],
}

const DOGFOOD_SCHEMA = {
  type: 'object',
  properties: {
    issuesFound: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, severity: { type: 'string', enum: ['blocker', 'high', 'medium', 'low'] } },
        required: ['title'],
      },
    },
    fixed: { type: 'array', items: { type: 'string' } },
    residual: {
      type: 'array',
      items: {
        type: 'object',
        properties: { title: { type: 'string' }, reason: { type: 'string' } },
        required: ['title', 'reason'],
      },
    },
    notes: { type: 'string' },
  },
  required: ['notes'],
}

const SHIP_SCHEMA = {
  type: 'object',
  properties: {
    prNumber: { type: ['integer', 'null'] },
    prUrl: { type: ['string', 'null'] },
    branch: { type: ['string', 'null'] },
  },
  required: ['prNumber'],
}

const CI_SCHEMA = {
  type: 'object',
  properties: {
    green: { type: 'boolean' },
    repaired: { type: ['string', 'null'], description: 'One-line summary of the CI failure repaired this attempt, or null if no code fix was possible' },
  },
  required: ['green'],
}

const COMPOUND_SCHEMA = {
  type: 'object',
  properties: {
    docPath: { type: ['string', 'null'], description: 'Repo-relative path to the learning written under docs/solutions/' },
    summary: { type: 'string' },
  },
  required: ['summary'],
}

const NON_INTERACTIVE = 'Run NON-INTERACTIVELY: do NOT call AskUserQuestion or any blocking question tool — there is no user to answer. Make and record reasonable assumptions instead, and keep going.'

// ---------------------------------------------------------------------------
// Helpers (no Date.now/Math.random — those are unavailable in workflow scripts).
// ---------------------------------------------------------------------------

const SEVERITY_RANK = { blocker: 3, high: 2, medium: 1, low: 0 }
const AUTO_FIX_SEVERITIES = ['blocker', 'high', 'medium']

// Collapse findings that point at the same file:line (two reviewers flagging the
// same spot) into the highest-severity one, so Autofix doesn't make conflicting
// edits on the same line. Findings without a line are kept distinct (index-keyed).
function dedupeFindings(items) {
  const seen = new Map()
  items.forEach((f, idx) => {
    const key = (f.file && f.line != null)
      ? `${f.file}:${f.line}`
      : `${f.file || '?'}::${(f.title || 'untitled').toLowerCase()}::${idx}`
    const prev = seen.get(key)
    if (!prev || (SEVERITY_RANK[f.severity] || 0) > (SEVERITY_RANK[prev.severity] || 0)) {
      seen.set(key, f)
    }
  })
  return [...seen.values()]
}

// Review a scope across dimensions in parallel, dedup, then adversarially verify
// every survivor. Used by both Code Review and the post-fix Re-review.
async function reviewAndVerify(dims, scopePrompt, phaseName) {
  const raw = ((await parallel(dims.map(d => () =>
    agent(
      `${scopePrompt}\n\nReview specifically for ${d.key} issues. Only report issues you can tie to specific code. Return structured findings.`,
      { agentType: d.type, label: `${phaseName.toLowerCase()}:${d.key}`, phase: phaseName, schema: FINDINGS_SCHEMA }
    ).then(r => ((r && r.findings) || []).map(f => ({ ...f, dimension: d.key })))
  ))).filter(Boolean)).flat()

  const unique = dedupeFindings(raw)
  const verified = await parallel(unique.map(f => () =>
    parallel(Array.from({ length: SKEPTICS }, (_, i) => () =>
      agent(
        `(skeptic ${i + 1} of ${SKEPTICS}) Adversarially verify this ${f.dimension} finding against the ACTUAL code in the working tree. Try to REFUTE it. Default to isReal=false if you cannot confirm it directly from the code.\n\nFinding:\n${JSON.stringify(f)}`,
        { label: `verify:${f.dimension}`, phase: phaseName, schema: VERDICT_SCHEMA }
      )
    )).then(votes => {
      const valid = votes.filter(Boolean)
      const real = valid.filter(v => v.isReal).length
      return { ...f, verifiedReal: valid.length > 0 && real * 2 > valid.length }
    })
  ))
  return { raw, confirmed: verified.filter(Boolean).filter(f => f.verifiedReal) }
}

// ---------------------------------------------------------------------------
// Resolve the task and flags from args. Accepts a string (the task), an object
// { task, dryRun }, or a string containing a [dry-run] marker. Dry run stops
// before Commit & PR / CI / Compound — useful for testing the pipeline without
// opening a PR or writing to docs/solutions/.
// ---------------------------------------------------------------------------

let task = null
let DRY_RUN = false
if (typeof args === 'string' && args.trim()) {
  task = args.trim()
} else if (args && typeof args === 'object' && typeof args.task === 'string' && args.task.trim()) {
  task = args.task.trim()
  DRY_RUN = !!args.dryRun
}
if (task && task.indexOf('[dry-run]') !== -1) {
  DRY_RUN = true
  task = task.replace('[dry-run]', '').trim()
}

if (!task) {
  log('No feature description provided. Run with the task as args, e.g. Workflow({ name: "lfg", args: "Add a dark-mode toggle to settings" }). Add { dryRun: true } (or a [dry-run] marker) to stop before Commit & PR / CI / Compound.')
  return { error: 'missing-task' }
}

const THOROUGH = budget.total ? budget.total > 400000 : false
const SKEPTICS = THOROUGH ? 3 : 1
log(`lfg starting${DRY_RUN ? ' [DRY RUN — no commit/PR/CI/compound]' : ''}${THOROUGH ? ' (thorough)' : ''}: ${task}`)

// ---------------------------------------------------------------------------
// Riffrec (compound IN). If a Riffrec product-feedback recording is available,
// find and analyze it first so the pipeline works on what a real user surfaced.
// ---------------------------------------------------------------------------

phase('Riffrec')
const riffrec = await agent(
  `Determine whether a Riffrec product-feedback recording is available for this task, then act.\n\nTask:\n${task}\n\nLook for a \`riffrec-*.zip\` or a bundle containing session.json + events.json + recording.webm + voice.webm — in any path named in the task, the repo root, the current directory, or ~/Downloads.\n- If you find one, invoke the ce-riffrec-feedback-analysis skill to analyze it, and return found=true, the path, and the structured product feedback (bugs, UX issues, repro steps, the user's spoken intent).\n- If none exists, return found=false and stop — do not fabricate feedback. ${NON_INTERACTIVE}`,
  { label: 'riffrec', phase: 'Riffrec', schema: RIFFREC_SCHEMA }
)
const riffrecFeedback = (riffrec && riffrec.found && riffrec.feedback) ? riffrec.feedback : ''
const taskBrief = riffrecFeedback
  ? `${task}\n\nThis work is grounded in a Riffrec user-session recording${riffrec.path ? ` (${riffrec.path})` : ''}. Product feedback extracted from it:\n${riffrecFeedback}`
  : task
log(riffrecFeedback
  ? `Riffrec recording analyzed${riffrec.path ? `: ${riffrec.path}` : ''} — folding its feedback into the task.`
  : 'No Riffrec recording found — proceeding from the task description.')

// ---------------------------------------------------------------------------
// Research (compound IN). Four read-only ce-* researchers in parallel, then a
// synthesis pass that distills them into one tight brief.
// ---------------------------------------------------------------------------

phase('Research')
const researchSpecs = [
  {
    type: 'compound-engineering:ce-learnings-researcher',
    label: 'research:learnings',
    prompt: `<work-context>\n${taskBrief}\n</work-context>\n\nFind every applicable past learning in docs/solutions/ for this task. Return the distilled learnings, the conventions to honor, and any prior bug fixes that bear on it. Cite each by its repo-relative path.`,
  },
  {
    type: 'compound-engineering:ce-repo-research-analyst',
    label: 'research:repo',
    prompt: `Research how THIS repository is structured and which existing patterns, modules, and conventions a change implementing the following task should follow:\n\n${taskBrief}\n\nReturn the relevant files, the patterns to mirror, and the seams where the change belongs.`,
  },
  {
    type: 'compound-engineering:ce-git-history-analyzer',
    label: 'research:history',
    prompt: `Trace the git history relevant to this task and surface why the affected code looks the way it does, prior attempts, and any landmines:\n\n${taskBrief}`,
  },
  {
    type: 'compound-engineering:ce-best-practices-researcher',
    label: 'research:external',
    prompt: `Gather external best practices and community conventions relevant to implementing:\n\n${taskBrief}\n\nReturn concrete, actionable guidance — not a literature review.`,
  },
]
const research = (await parallel(researchSpecs.map(s => () =>
  agent(s.prompt, { agentType: s.type, label: s.label, phase: 'Research' })
))).filter(Boolean)

let researchBrief = '(no institutional research available)'
let landmines = []
if (research.length) {
  const synthesis = await agent(
    `Synthesize these ${research.length} research findings into ONE tight brief for the engineer who will plan and build this task: "${task}".\n\nFindings:\n${research.join('\n\n---\n\n')}\n\nReturn a brief with: (1) constraints to honor, (2) existing patterns to mirror (with paths), (3) prior art / past learnings, (4) KNOWN LANDMINES to avoid. Keep it dense — no preamble.`,
    { label: 'research:synthesis', phase: 'Research' }
  )
  researchBrief = synthesis || research.join('\n\n---\n\n')
  const probe = researchBrief.toLowerCase().indexOf('landmine')
  if (probe !== -1) landmines = [researchBrief.slice(probe, probe + 600)]
} else {
  log('Research returned nothing (ce-* research agents may be unavailable). Continuing without institutional grounding.')
}

// ---------------------------------------------------------------------------
// Ideate (ce-ideate, run as a judge panel). Three lenses in parallel, then a judge.
// ---------------------------------------------------------------------------

phase('Ideate')
const LENSES = [
  { key: 'mvp', framing: 'the SIMPLEST thing that fully satisfies the requirement — minimize new abstractions and surface area' },
  { key: 'risk', framing: 'the approach that most REDUCES risk — name the failure modes, data/migration hazards, and how to de-risk each' },
  { key: 'leverage', framing: 'the approach that best REUSES the existing patterns surfaced in research and compounds future work' },
]
const candidates = (await parallel(LENSES.map(l => () =>
  agent(
    `Task:\n${taskBrief}\n\nInstitutional research:\n${researchBrief}\n\nPropose an implementation approach through this lens: ${l.framing}. Be concrete about the first change and the boundaries. ${NON_INTERACTIVE}`,
    { label: `ideate:${l.key}`, phase: 'Ideate', schema: APPROACH_SCHEMA }
  )
))).filter(Boolean)

const direction = await agent(
  `Task:\n${taskBrief}\n\nCandidate approaches:\n${JSON.stringify(candidates, null, 2)}\n\nPick the single strongest approach for THIS codebase, then graft in the best ideas from the runner-up lenses. Output the synthesized direction the planner should follow, plus watch-outs. ${NON_INTERACTIVE}`,
  { label: 'ideate:judge', phase: 'Ideate', schema: DIRECTION_SCHEMA }
)
log(`Direction: ${direction && direction.winner ? direction.winner : 'synthesized'}`)

// ---------------------------------------------------------------------------
// Plan (ce-plan). Writes the durable plan. GATE: a plan file must exist.
// ---------------------------------------------------------------------------

phase('Plan')
const planResult = await agent(
  `Invoke the ce-plan skill to produce a durable implementation plan for this task. ${NON_INTERACTIVE}\n\nTask:\n${taskBrief}\n\nChosen direction (from Ideate's judge):\n${JSON.stringify(direction)}\n\nInstitutional research to fold into the plan (cite the docs/solutions learnings you used):\n${researchBrief}\n\nAfter ce-plan finishes, return ONLY the repo-relative path to the plan file it wrote under docs/plans/.`,
  { label: 'plan', phase: 'Plan', schema: PLAN_SCHEMA }
)
const planPath = planResult && planResult.planPath
if (!planPath) {
  log('Plan phase produced no plan file — aborting before work (mirrors the /lfg plan gate).')
  return { error: 'no-plan', research: researchBrief, direction }
}
log(`Plan written: ${planPath}`)

// ---------------------------------------------------------------------------
// Doc Review (ce-doc-review). Adversarially stress-test the plan. A genuinely
// fatal plan aborts; non-fatal concerns are fed into Work.
// ---------------------------------------------------------------------------

phase('Doc Review')
const planCheck = await agent(
  `Invoke the ce-doc-review approach to adversarially stress-test the plan at ${planPath} against THIS codebase. Will it survive contact with reality — do the referenced files/APIs exist, are the boundaries right, are there migration/ordering hazards? Known landmines from research:\n${JSON.stringify(landmines)}\n\nReturn fatal=true ONLY if the plan is fundamentally unbuildable as written; otherwise list concerns by severity. ${NON_INTERACTIVE}`,
  { label: 'doc-review', phase: 'Doc Review', schema: PLANCHECK_SCHEMA }
)
if (planCheck && planCheck.fatal) {
  log('Doc Review judged the plan fatally unbuildable — aborting before work. Concerns recorded.')
  return { error: 'plan-fatal', planPath, concerns: planCheck.concerns }
}
const planConcerns = (planCheck && planCheck.concerns) || []
if (planConcerns.length) log(`Doc Review raised ${planConcerns.length} non-fatal concern(s) — feeding into Work.`)

// ---------------------------------------------------------------------------
// Work (ce-work). Execute the plan, with Doc Review concerns in view.
// GATE: real changes must exist before Code Review.
// ---------------------------------------------------------------------------

phase('Work')
const build = await agent(
  `Invoke the ce-work skill to execute the plan at ${planPath}. Implement the full feature, following the codebase's existing patterns and the conventions surfaced in research. Address these Doc Review concerns as you go:\n${JSON.stringify(planConcerns)}\n${NON_INTERACTIVE}\n\nWhen done, report whether files actually changed, a concise summary, the files touched, and which observable surfaces (web-ui / ios / cli / api / library / docs) the change affects.`,
  { label: 'work', phase: 'Work', schema: BUILD_SCHEMA }
)
if (!build || !build.changed) {
  log('Work phase made no code changes — aborting before review (mirrors the /lfg work gate).')
  return { error: 'no-changes', planPath, build }
}
const surfaces = (build.surfaces || []).map(s => String(s).toLowerCase())
const surfaceList = surfaces.length ? surfaces.join(', ') : 'none detected'
log(`Work: ${build.summary}${surfaces.length ? ` [surfaces: ${surfaceList}]` : ''}`)

// ---------------------------------------------------------------------------
// Code Review (ce-code-review). Persona reviewers per dimension -> dedup ->
// adversarial verify -> severity gate.
// ---------------------------------------------------------------------------

phase('Code Review')
const DIMENSIONS = [
  { key: 'correctness', type: 'compound-engineering:ce-correctness-reviewer' },
  { key: 'security', type: 'compound-engineering:ce-security-reviewer' },
  { key: 'performance', type: 'compound-engineering:ce-performance-reviewer' },
  { key: 'maintainability', type: 'compound-engineering:ce-maintainability-reviewer' },
  { key: 'testing', type: 'compound-engineering:ce-testing-reviewer' },
  { key: 'reliability', type: 'compound-engineering:ce-reliability-reviewer' },
]
const landmineHint = landmines.length ? ` Known landmines from research — check these specifically: ${JSON.stringify(landmines)}.` : ''
const reviewScope = `Review the current uncommitted diff (the working tree vs the base branch) for issues introduced by this change. The change implements: ${task}.${landmineHint}`
const { raw: rawFindings, confirmed } = await reviewAndVerify(DIMENSIONS, reviewScope, 'Code Review')

const toFix = confirmed.filter(f => AUTO_FIX_SEVERITIES.includes(f.severity))
const deferredNits = confirmed.filter(f => !AUTO_FIX_SEVERITIES.includes(f.severity))
log(`${rawFindings.length} raw -> ${confirmed.length} confirmed — ${toFix.length} to fix, ${deferredNits.length} low deferred to PR`)

// ---------------------------------------------------------------------------
// Autofix. Apply auto-fixable confirmed findings; record skipped + nits.
// ---------------------------------------------------------------------------

phase('Autofix')
let fix = { fixed: [], residual: [] }
if (toFix.length) {
  fix = await agent(
    `Apply fixes for these confirmed code-review findings in the working tree. Fix the ROOT cause — do not weaken tests, suppress warnings, or delete assertions. If you deliberately decide NOT to fix one, leave it and list it as residual with a reason. ${NON_INTERACTIVE}\n\nConfirmed findings:\n${JSON.stringify(toFix, null, 2)}`,
    { label: 'autofix', phase: 'Autofix', schema: FIX_SCHEMA }
  ) || fix
  log(`Fixed ${(fix.fixed || []).length}; residual ${(fix.residual || []).length}`)
} else {
  log('No auto-fixable findings — skipping Autofix.')
}
// Low-severity confirmed findings ride along as residual so they surface on the PR.
fix.residual = (fix.residual || []).concat(deferredNits.map(f => ({ title: `[${f.severity}] ${f.title}`, reason: f.rationale || 'deferred low-severity finding' })))

// ---------------------------------------------------------------------------
// Re-review. The fixes themselves can introduce regressions. Re-review the fix
// diff (correctness/reliability/testing) and repair confirmed ones. Bounded to
// one repair round to avoid churn.
// ---------------------------------------------------------------------------

phase('Re-review')
if ((fix.fixed || []).length) {
  const REGRESSION_DIMS = DIMENSIONS.filter(d => ['correctness', 'reliability', 'testing'].includes(d.key))
  const regScope = `The previous step applied code-review fixes to this branch. Review ONLY whether those FIXES introduced NEW problems — regressions, broken behavior, weakened or deleted tests. Files changed by the fixes: ${JSON.stringify(fix.fixed || [])}.`
  const { confirmed: regressions } = await reviewAndVerify(REGRESSION_DIMS, regScope, 'Re-review')
  const regToFix = regressions.filter(f => AUTO_FIX_SEVERITIES.includes(f.severity))
  if (regToFix.length) {
    const regFix = await agent(
      `Fix these regressions that the earlier code-review fixes introduced. Root cause only — do not weaken tests or suppress warnings. ${NON_INTERACTIVE}\n\nRegressions:\n${JSON.stringify(regToFix, null, 2)}`,
      { label: 're-review:fix', phase: 'Re-review', schema: FIX_SCHEMA }
    )
    if (regFix) {
      fix.fixed = (fix.fixed || []).concat(regFix.fixed || [])
      fix.residual = (fix.residual || []).concat(regFix.residual || [])
    }
    log(`Re-review caught ${regToFix.length} regression(s); repaired ${regFix ? (regFix.fixed || []).length : 0}.`)
  } else {
    log('Re-review found no confirmed regressions from the fixes.')
  }
} else {
  log('No fixes were applied — skipping Re-review.')
}

// ---------------------------------------------------------------------------
// Simplify (ce-simplify-code). Behavior-preserving cleanup of the corrected
// code. Runs after Autofix (never simplify broken code) and before Test.
// ---------------------------------------------------------------------------

phase('Simplify')
const simplify = await agent(
  `Invoke the ce-simplify-code skill on the changes made on this branch. Improve reuse, clarity, and efficiency WITHOUT changing behavior, then confirm the test suite still passes. ${NON_INTERACTIVE}\n\nReturn what you simplified, whether tests passed, and notes.`,
  { label: 'simplify', phase: 'Simplify', schema: SIMPLIFY_SCHEMA }
)
log(`Simplify: ${simplify ? simplify.notes : 'no result'}`)

// ---------------------------------------------------------------------------
// Test. Suite/build/lint + per-surface automated tests. Browser via the
// ce-test-browser skill (callable); iOS-simulator is inlined because
// ce-test-xcode is disable-model-invocation. (Hands-on exploration is Dogfood.)
// ---------------------------------------------------------------------------

phase('Test')
const verify = await agent(
  `Validate the change end to end. ${NON_INTERACTIVE}\n\n` +
  `1. Run the project's automated checks (test suite, build, lint as applicable) and report pass/fail with any failing output.\n` +
  `2. Affected surfaces: ${surfaceList}. Run automated tests for each that applies, and SKIP the rest:\n` +
  `   - web-ui: invoke the ce-test-browser skill with mode:pipeline to test the affected pages.\n` +
  `   - ios: build and test on the simulator (XcodeBuildMCP / xcodebuild), capturing crashes from logs. (ce-test-xcode is disable-model-invocation, so perform its build-test-on-simulator behavior directly.)\n` +
  `   - cli / api / library: run the affected automated/integration tests for the changed entrypoint.\n` +
  `3. Fix any failures YOU introduced (root cause, not suppression), then re-run.\n\n` +
  `Return passed, the checks you ran, the surfaces you validated, and notes.`,
  { label: 'test', phase: 'Test', schema: VERIFY_SCHEMA }
)
log(`Test: ${verify && verify.passed ? 'passed' : 'see notes'} — ${verify ? verify.notes : 'no result'}`)

// ---------------------------------------------------------------------------
// Dogfood (ALWAYS, ce-dogfood-beta behavior). Exercise the product as a real
// user, adapted to whatever surface exists. Inlines ce-dogfood-beta's
// diff-scoped auto-fix behavior because that skill is disable-model-invocation.
// ---------------------------------------------------------------------------

phase('Dogfood')
const dogfood = await agent(
  `Dogfood this change as a real user — ALWAYS exercise the product, never skip. Adapt to the affected surface(s): ${surfaceList}.\n` +
  `   - web-ui: start/attach to the running app and drive it through the CHANGED user journeys via agent-browser (not just the happy path — bad input, edge states, back/forward).\n` +
  `   - ios: drive the changed flows on the simulator.\n` +
  `   - cli: actually run the changed commands the way a user would, including bad input and unusual flag combinations.\n` +
  `   - api / library: call the changed entrypoints as a consumer would, including misuse.\n` +
  (riffrecFeedback ? `   - Reproduce the exact issue reported in the Riffrec recording and confirm it is now fixed.\n` : '') +
  `Fix any UX/behavior breakage you find (root cause), add a regression test for each, and re-check until the changed journeys work. If there is genuinely nothing runnable to exercise (e.g., a pure docs change), say so explicitly in notes. ${NON_INTERACTIVE}\n\n` +
  `Return the issues you found, what you fixed, anything left unresolved (as residual), and notes.`,
  { label: 'dogfood', phase: 'Dogfood', schema: DOGFOOD_SCHEMA }
)
log(`Dogfood: ${dogfood ? `${(dogfood.issuesFound || []).length} issue(s), ${(dogfood.fixed || []).length} fixed` : 'no result'}`)

// ---------------------------------------------------------------------------
// Commit & PR (ce-commit-push-pr). Commit, push, open PR (+ ce-demo-reel for
// observable changes), then MONITOR CI and fix root causes until green.
// ---------------------------------------------------------------------------

phase('Commit & PR')
let ship = null
let ci = { green: null, repaired: null }
let ciNeededRepair = false
let ciAttempts = 0
if (DRY_RUN) {
  log('DRY RUN — skipping Commit & PR (no commit, PR, or CI). Changes remain in the working tree for inspection.')
} else {
  const residualForPr = (fix.residual || [])
    .concat((dogfood && dogfood.residual) || [])
    .concat(verify && verify.passed ? [] : [{ title: 'Local verification did not fully pass', reason: (verify && verify.notes) || 'see Test phase' }])
  const observable = surfaces.some(s => s === 'web-ui' || s === 'cli' || s === 'ios')
  ship = await agent(
    `Commit, push, and open a pull request for this work. This repo requires a feature branch and a PR — NEVER push to main directly. Invoke the ce-commit-push-pr skill. ${NON_INTERACTIVE}\n\n` +
    (observable
      ? `This change has an observable surface (${surfaceList}) — also invoke the ce-demo-reel skill to capture visual/CLI proof and include its markdown in the PR body.\n\n`
      : '') +
    `In the PR body, add a "## Residual Findings" section listing these unresolved items verbatim (omit the section if the list is empty):\n${JSON.stringify(residualForPr, null, 2)}\n\nReturn the PR number, URL, and branch.`,
    { label: 'commit-pr', phase: 'Commit & PR', schema: SHIP_SCHEMA }
  )

  // Monitor CI until green. Keep watching and fixing root causes; stop only if the
  // run is genuinely stuck (two consecutive attempts with no fix possible) or budget
  // is nearly exhausted — then record the failure on the PR. (Workflow's 1000-agent
  // cap is the ultimate backstop against a runaway loop.)
  if (ship && ship.prNumber) {
    log(`PR #${ship.prNumber} opened: ${ship.prUrl || ''} — monitoring CI until green.`)
    let green = false
    let stuck = 0
    const MAX_CI = budget.total ? 16 : 10
    while (!green && stuck < 2 && ciAttempts < MAX_CI) {
      if (budget.total && budget.remaining() < 40000) {
        log('Budget nearly exhausted — stopping CI monitor and recording state on the PR.')
        break
      }
      ciAttempts += 1
      const attempt = await agent(
        `Monitor CI for PR #${ship.prNumber} until it resolves: run \`gh pr checks ${ship.prNumber} --watch\`.\n` +
        `- If every check passes, return { green: true }.\n` +
        `- If any fail, enumerate them (\`gh pr checks ${ship.prNumber} --json name,state,conclusion,link\`), read each failing run's logs (\`gh run view <run-id> --log-failed\`), fix the ROOT cause in the working tree (never weaken or skip the failing assertion), commit \`fix(ci): <summary>\`, push, and return { green: false, repaired: <one-line summary> }.\n` +
        `- If you read the logs and there is genuinely NO code fix you can make (infra outage, flaky external dependency), return { green: false, repaired: null }.\n${NON_INTERACTIVE}`,
        { label: `ci:attempt-${ciAttempts}`, phase: 'Commit & PR', schema: CI_SCHEMA }
      )
      ci = attempt || ci
      green = !!(attempt && attempt.green)
      if (attempt && attempt.repaired) { ciNeededRepair = true; stuck = 0 }
      else if (!green) { stuck += 1 }
      log(green
        ? `CI green after ${ciAttempts} attempt(s).`
        : `CI red after attempt ${ciAttempts}${stuck ? ` (no fix possible — stuck ${stuck}/2)` : ' (fix pushed, re-watching)'}.`)
    }
    if (!green) {
      log(`CI not green after ${ciAttempts} attempt(s) — recording the failure on the PR for a human.`)
      await agent(
        `CI for PR #${ship.prNumber} is still failing. Append (or replace) a "## CI Failures Unresolved" section in the PR body listing each remaining failing check, a one-line failure summary, and its run/check URL. Use \`gh pr edit ${ship.prNumber} --body-file <tmpfile>\`. Do not loop or retry CI. ${NON_INTERACTIVE}`,
        { label: 'ci:record-unresolved', phase: 'Commit & PR' }
      )
    }
  } else {
    log('No PR was opened (ce-commit-push-pr returned no PR number) — skipping CI monitor.')
  }
}

// ---------------------------------------------------------------------------
// Compound (compound OUT, ce-compound). Only when something non-obvious
// happened, so the knowledge base the next Research reads stays signal-dense.
// ---------------------------------------------------------------------------

phase('Compound')
const dogfoodIssues = dogfood ? (dogfood.issuesFound || []).length : 0
const worthCompounding =
  toFix.length > 0 || ciNeededRepair || THOROUGH || planConcerns.length > 0 ||
  !!riffrecFeedback || dogfoodIssues > 0 || !(verify && verify.passed)
let compound = null
if (DRY_RUN) {
  log('DRY RUN — skipping Compound (no docs/solutions write).')
} else if (worthCompounding) {
  compound = await agent(
    `Invoke the ce-compound skill with mode:headless to capture the durable learning from this task into docs/solutions/. Focus on what was NON-OBVIOUS: the approach chosen and why, any gotcha hit during work, review, simplify, test, dogfood, or CI, and how it connects to the learnings surfaced in research. ${NON_INTERACTIVE}\n\n` +
    `Task:\n${task}\n` +
    (riffrecFeedback ? `Riffrec-reported feedback that seeded this work:\n${riffrecFeedback}\n` : '') +
    `Direction taken:\n${JSON.stringify(direction)}\n` +
    `Doc Review concerns:\n${JSON.stringify(planConcerns)}\n` +
    `Dogfood issues:\n${JSON.stringify(dogfood ? dogfood.issuesFound || [] : [])}\n` +
    `Residual findings:\n${JSON.stringify(fix.residual || [])}\n` +
    `CI needed repair: ${ciNeededRepair}\n\n` +
    `Return the repo-relative path to the learning doc written.`,
    { label: 'compound', phase: 'Compound', schema: COMPOUND_SCHEMA }
  )
  log(`Compounded learning: ${compound && compound.docPath ? compound.docPath : '(no doc path returned)'}`)
} else {
  log('Nothing non-obvious happened — skipping Compound to keep docs/solutions signal-dense.')
}

// ---------------------------------------------------------------------------
// Summary returned to the caller.
// ---------------------------------------------------------------------------

return {
  task,
  dryRun: DRY_RUN,
  riffrec: riffrec && riffrec.found ? { path: riffrec.path } : null,
  researchSources: research.length,
  direction: direction && (direction.winner || direction.direction),
  planPath,
  docReviewConcerns: planConcerns.length,
  work: build.summary,
  surfaces,
  rawFindings: rawFindings.length,
  confirmedFindings: confirmed.length,
  fixed: (fix.fixed || []).length,
  deferredNits: deferredNits.length,
  residual: fix.residual || [],
  simplified: simplify ? (simplify.applied || []).length : 0,
  testPassed: !!(verify && verify.passed),
  dogfood: dogfood ? { issues: dogfoodIssues, fixed: (dogfood.fixed || []).length } : null,
  pr: ship ? { number: ship.prNumber, url: ship.prUrl, branch: ship.branch } : null,
  ciGreen: ci.green,
  ciAttempts,
  ciNeededRepair,
  learningDoc: compound && compound.docPath,
}
