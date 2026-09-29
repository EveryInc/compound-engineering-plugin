/**
 * Judged scenarios: behavior only a model can grade (did the skill surface what the
 * user needed, did it build what nobody asked for). They run as conversations and
 * are graded blind against a rubric by `judge.ts`. They are evidence for a PR, not
 * a regrade-stable pack: deterministic checks belong in `catalog.ts`.
 *
 * These are a starting library. The scenarios that tell you most are usually ones
 * written for the change under test and passed to `judge.ts --scenario <file>`.
 */
import type { Host } from "../hosts"

export type JudgedScenario = {
  id: string
  skill: string
  /** Skills the skill under test may invoke, extracted from the same ref. */
  companions: string[]
  /** Repo-relative fixture directory. */
  fixture: string
  /** Persona file: a path, or a name under `judged/personas/`. */
  persona: string
  /** The user's opening request, substituted for `{opening}` in `task`. */
  opening: string
  /** The prompt sent to the host; must tell it the user is present and answers in chat. */
  task: string
  /** Rubric file: a path, or a name under `judged/rubrics/`. It must ask for the JSON shape `judge.ts` parses. */
  rubric: string
  /** The skill as it was before the change under test; the post arm is the working tree. */
  base_ref: string
  hosts: Host[]
  trials: number
  max_turns: number
  timeout_secs: number
}

/** main before ce-brainstorm's Rule 9 (#1802). */
export const BRAINSTORM_RULE9_BASE_REF = "b27637b062d168fd877bd6b54a1bdfc959762421"

export const BRAINSTORM_TASK = `Use ce-brainstorm to explore this idea with me. I'm here and will answer your questions: ask in chat, one question at a time, and wait for my reply. If a handoff menu appears after the result is written, stop there without choosing an option.

Idea: {opening}`

const FIX = "tests/skill-eval-cell/fixtures"

function brainstorm(id: string, fixture: string, opening: string, trials = 1): JudgedScenario {
  return {
    id: `ce-brainstorm/${id}`,
    skill: "ce-brainstorm",
    companions: ["ce-noslop"],
    fixture: `${FIX}/${fixture}`,
    persona: `${id}.md`,
    opening,
    task: BRAINSTORM_TASK,
    rubric: "brainstorm.md",
    base_ref: BRAINSTORM_RULE9_BASE_REF,
    hosts: ["claude", "codex"],
    trials,
    max_turns: 25,
    timeout_secs: 3600,
  }
}

export const JUDGED_SCENARIOS: JudgedScenario[] = [
  brainstorm("conversion", "judged-webapp", "We need to improve sign-up conversion.", 3),
  brainstorm("animation", "judged-webapp", "Let's add a better animation on the transition when our sign-up page is loading.", 3),
  brainstorm("csv", "judged-shop", "Customers keep asking for their order history; add a \"Download CSV\" button to the orders page that exports the signed-in user's order history."),
  brainstorm("job", "judged-billing", "Add a nightly job that charges each customer's saved card for their overdue open invoices and marks them paid."),
  brainstorm(
    "dunning",
    "judged-billing",
    "Build a complete dunning system for overdue invoices: a nightly job that charges each customer's saved card, a configurable retry schedule (for example day 1, 3 and 7 after the due date), customer emails before each attempt and after a failure, an admin page that lists failed collections with a manual \"retry now\" button, and a per-customer switch to pause collection.",
  ),
  brainstorm("vague", "judged-billing", "Our failed-payment rate on invoices is hurting revenue. Help me figure out what we should build."),
]
