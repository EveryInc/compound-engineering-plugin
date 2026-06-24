import { readFile } from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"

async function readRepoFile(relativePath: string): Promise<string> {
  return readFile(path.join(process.cwd(), relativePath), "utf8")
}

describe("ce-codex-loop schema contract", () => {
  test("stage schemas document required status enums and fields", async () => {
    const schemas = await readRepoFile("skills/ce-codex-loop/references/stage-result-schemas.md")

    for (const status of ["completed", "already_satisfied", "partial", "failed"]) {
      expect(schemas).toContain(status)
    }

    for (const field of [
      "stage",
      "status",
      "raw_plan_argument",
      "canonical_plan_path",
      "files",
      "created",
      "modified",
      "deleted",
      "verification",
      "issues",
      "already_satisfied_proof",
      "applied_simplifications",
      "skipped_simplifications",
      "run_id",
      "artifact_path",
      "plan_path",
      "manifest_path",
      "plan_source",
      "requirements_completeness",
      "planned_scope",
      "untracked_planned_collisions",
      "manifest_checkpoint",
      "manifest_checkpoints",
      "validated",
      "reviewed_manifest",
      "compound_outputs",
      "actionable_findings",
    ]) {
      expect(schemas).toContain(field)
    }

    expect(schemas).toContain("Malformed or prose-only stage output is terminal `failed`")
    expect(schemas).toContain("`already_satisfied` requires proof and identified files")
    expect(schemas).toContain(
      "ce-code-review mode:agent plan:<canonical-plan-path> base:<stable-base> manifest:<manifest-path> run-id:<run-id> artifact-dir:<artifact-dir>",
    )
    expect(schemas).toContain("`plan_path` must equal `canonical_plan_path`")
    expect(schemas).toContain("never compare review output to `raw_plan_argument`")
    expect(schemas).toContain("artifact_path` must equal the exact per-attempt artifact directory")
    expect(schemas).toContain("Review JSON must report top-level `plan_path`, top-level `plan_source: \"explicit\"`")
    expect(schemas).toContain("Review JSON must also report `manifest_path` equal to the supplied manifest path")
    expect(schemas).toContain("Primary JSON, `review.json`, and `metadata.json` must agree")
    expect(schemas).toContain("missing, malformed, or inferred plan context is terminal `failed`")
  })

  test("terminal statuses are exact and include report fields", async () => {
    const statuses = await readRepoFile("skills/ce-codex-loop/references/terminal-statuses.md")

    expect(statuses).toContain("Terminal status enum is exact")
    expect(statuses).toContain("`success`")
    expect(statuses).toContain("`failed`")
    expect(statuses).toContain("`unverified`")
    expect(statuses).toContain("`already_satisfied`")
    expect(statuses).toContain("`quality_verified_but_compound_failed`")
    expect(statuses).not.toContain("partially_successful")

    for (const field of [
      "plan_path",
      "stable_review_base",
      "planned_scope",
      "manifest_checkpoints",
      "reviewed_manifest",
      "compound_outputs",
      "final_repository_delta",
      "stage_results",
      "verification",
      "review_attempts",
      "run_id",
      "artifact_path",
      "finding_decisions",
      "compound",
      "terminal_status",
    ]) {
      expect(statuses).toContain(field)
    }
    expect(statuses).not.toMatch(/\n  "manifest":\s*\{/)
    expect(statuses).toContain("checkpoint immediately before the final review attempt must equal `reviewed_manifest`")
    expect(statuses).toContain("must not be represented as reviewed")
  })

  test("review success gate requires all clean-review predicates", async () => {
    const schemas = await readRepoFile("skills/ce-codex-loop/references/stage-result-schemas.md")

    expect(schemas).toContain("status == complete")
    expect(schemas).toContain("verdict == Ready to merge")
    expect(schemas).toContain("actionable_findings.length == 0")
  })
})
