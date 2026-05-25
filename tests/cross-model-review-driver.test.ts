import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// The driver wires the deterministic spine of the code-review eval: `plan`
// enumerates the per-(arm x doc x trial) work and the orchestrator handoff (it
// refuses to plan an un-pre-registered run, per R9); `finalize` runs the
// gt-resolve -> gt-score -> aggregate chain over ingested records + judge
// verdicts and renders the decision artifact. The model-driven arms (a/d) and
// judge are NOT run here (no claude -p) — finalize consumes their record/verdict
// files, so the whole driver is deterministic and unit-testable.

const REPO_ROOT = join(import.meta.dir, "..");
const DRIVER = join(REPO_ROOT, "scripts/eval/cross_model_review/drive_eval.py");

async function spawn(args: string[]) {
	const proc = Bun.spawn(["python3", DRIVER, ...args], { stdout: "pipe", stderr: "pipe" });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

function tmpDir() {
	return mkdtempSync(join(tmpdir(), "cmre-drv-"));
}
function tmpJson(value: unknown) {
	const p = join(tmpDir(), "f.json");
	writeFileSync(p, JSON.stringify(value));
	return p;
}
function writeRecord(dir: string, arm: string, docId: string, trial: number, findings: { id: string; text: string }[]) {
	const rec = { arm, doc_id: docId, trial, status: "ok", producer: "orchestrator", latency_ms: 1, findings };
	writeFileSync(join(dir, `${arm}__${docId}__t${trial}.json`), JSON.stringify(rec));
}

describe("plan: enumerate work units and the orchestrator handoff", () => {
	test("emits expected records, CLI-arm commands, and in-process todo; writes run-state", async () => {
		const manifest = tmpJson({
			pre_registration: { go_threshold: 2, minimum_corpus_n: 2, trials_per_arm: 3, arm_c_context_rule: "doc+CLAUDE.md" },
			docs: [
				{ id: "kf-1", subset: "known_failure", path: "d1.diff", ground_truth: { bug: "x" } },
				{ id: "nc-1", subset: "negative_control", path: "n1.diff" },
			],
		});
		const outDir = tmpDir();
		const { stdout, exitCode } = await spawn(["plan", manifest, "--out-dir", outDir, "--rubric", "rub.md", "--context", "ctx.md"]);
		const out = JSON.parse(stdout);
		expect(exitCode).toBe(0);
		expect(out.ok).toBe(true);
		expect(out.counts.expected_records).toBe(24); // 4 arms x 2 docs x 3 trials
		expect(out.counts.cli_commands).toBe(12); // 2 CLI arms x 2 docs x 3 trials
		expect(out.counts.in_process_records).toBe(12); // 2 in-process arms x 2 docs x 3 trials
		expect(existsSync(join(outDir, "run-state.json"))).toBe(true);
	});

	test("refuses to plan a run whose threshold/N are not pre-registered (R9)", async () => {
		const manifest = tmpJson({
			pre_registration: { go_threshold: null, minimum_corpus_n: null, trials_per_arm: 3, arm_c_context_rule: null },
			docs: [{ id: "kf-1", subset: "known_failure", path: "d1.diff", ground_truth: { bug: "x" } }],
		});
		const { stdout, exitCode } = await spawn(["plan", manifest, "--out-dir", tmpDir()]);
		const out = JSON.parse(stdout);
		expect(exitCode).toBe(1);
		expect(out.ok).toBe(false);
		expect(out.error.toLowerCase()).toContain("pre-regist");
	});
});

describe("finalize: gt-resolve -> gt-score -> aggregate -> decision artifact", () => {
	const manifest = () =>
		tmpJson({
			pre_registration: { go_threshold: 2, minimum_corpus_n: 2, trials_per_arm: 3, arm_c_context_rule: "x" },
			docs: [
				{ id: "kf-1", subset: "known_failure" },
				{ id: "kf-2", subset: "known_failure" },
			],
		});

	function recordsDirWithCWinningBoth() {
		const dir = tmpDir();
		for (const doc of ["kf-1", "kf-2"]) {
			writeRecord(dir, "c_fixed_context", doc, 1, [{ id: "f9", text: "the collation bug" }]);
			for (const arm of ["a_baseline", "b_isolated", "d_self_critic"]) {
				writeRecord(dir, arm, doc, 1, [{ id: "f1", text: "unrelated nit" }]);
			}
		}
		return dir;
	}

	test("a GT-match win on both known-failure docs yields build:<arm> and a written artifact", async () => {
		const dir = recordsDirWithCWinningBoth();
		const gtVerdicts = tmpJson([
			{ doc_id: "kf-1", finding_id: "f9", matches_bug: true },
			{ doc_id: "kf-2", finding_id: "f9", matches_bug: true },
		]);
		const artifact = join(tmpDir(), "decision.md");
		const { stdout, exitCode } = await spawn([
			"finalize", dir, manifest(),
			"--gt-verdicts", gtVerdicts,
			"--judge-family", "claude",
			"--out", artifact,
		]);
		const out = JSON.parse(stdout);
		expect(exitCode).toBe(0);
		expect(out.outcome).toBe("build:c_fixed_context");
		expect(out.per_arm.c_fixed_context.known_failure).toBe(2);
		expect(existsSync(artifact)).toBe(true);
	});

	test("a confounded blind-integrity check forces inconclusive regardless of hits", async () => {
		const dir = recordsDirWithCWinningBoth();
		const gtVerdicts = tmpJson([
			{ doc_id: "kf-1", finding_id: "f9", matches_bug: true },
			{ doc_id: "kf-2", finding_id: "f9", matches_bug: true },
		]);
		const { stdout } = await spawn([
			"finalize", dir, manifest(),
			"--gt-verdicts", gtVerdicts,
			"--integrity", "60,100", // 0.60 >> chance 0.25 -> confounded
			"--out", join(tmpDir(), "d.md"),
		]);
		const out = JSON.parse(stdout);
		expect(out.outcome).toBe("inconclusive");
	});
});
