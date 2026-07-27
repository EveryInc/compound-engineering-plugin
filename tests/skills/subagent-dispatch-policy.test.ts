import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const SKILLS = join(import.meta.dir, "..", "..", "skills");

// Skills whose research/review fan-out is load-bearing. A harness may carry a
// standing instruction not to call the agent-dispatch tool unless the user asked
// (observed on Claude Code, 2026-07); phrasing the fallback as a capability test
// ("where available") let the orchestrator self-assess its way to inline and
// report a reason that was never given. The contract is: attempt, then degrade.
const DISPATCH_SEAMS = [
  "ce-plan/SKILL.md",
  "ce-plan/references/deepening-workflow.md",
  "ce-doc-review/SKILL.md",
];

describe("subagent dispatch policy", () => {
  for (const seam of DISPATCH_SEAMS) {
    const body = readFileSync(join(SKILLS, seam), "utf8");

    test(`${seam} instructs an attempt before any fallback`, () => {
      expect(body).toMatch(
        /[Aa]ttempt (subagent dispatch|the dispatch) using whatever agent-dispatch tool this harness exposes|[Aa]ttempt the dispatch; fall back/,
      );
    });

    test(`${seam} does not gate dispatch on a self-assessed capability check`, () => {
      expect(body).not.toMatch(/where available; otherwise run the work inline/);
    });
  }
});
