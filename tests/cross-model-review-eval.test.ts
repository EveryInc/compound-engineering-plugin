import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests the deterministic carrier of the cross-model review eval runner (U2).
// The model-driven arms and judge are NOT exercised here — their quality is
// validated by the human-confirmation step (U6), per the plan. These tests
// assert structure and behavior of the pure pieces, following the
// Bun.spawn(["python3", ...]) pattern from tests/session-history-scripts.test.ts.

const REPO_ROOT = join(import.meta.dir, "..");
const RUNNER = join(REPO_ROOT, "scripts/eval/cross_model_review/run_arms.py");
const ARMS = join(REPO_ROOT, "scripts/eval/cross_model_review/arms.py");
const FIX = join(REPO_ROOT, "tests/fixtures/cross-model-review");

async function spawn(script: string, args: string[]) {
	const proc = Bun.spawn(["python3", script, ...args], { stdout: "pipe", stderr: "pipe" });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

const run = (args: string[]) => spawn(RUNNER, args);
const arms = (args: string[]) => spawn(ARMS, args);

function tmpFile(name: string, content: string) {
	const dir = mkdtempSync(join(tmpdir(), "cmre-"));
	const p = join(dir, name);
	writeFileSync(p, content);
	return p;
}

describe("record validation", () => {
	test("a schema-conformant record validates", async () => {
		const { stdout, exitCode } = await run(["validate-record", join(FIX, "sample-record-valid.json")]);
		const out = JSON.parse(stdout);
		expect(out.valid).toBe(true);
		expect(out.errors).toHaveLength(0);
		expect(exitCode).toBe(0);
	});

	test("a malformed record is rejected with errors and a nonzero exit", async () => {
		const { stdout, exitCode } = await run(["validate-record", join(FIX, "sample-record-invalid.json")]);
		const out = JSON.parse(stdout);
		expect(out.valid).toBe(false);
		// bad arm enum, missing producer, trial < 1 — at least three distinct errors
		expect(out.errors.length).toBeGreaterThanOrEqual(3);
		expect(exitCode).toBe(1);
	});
});

describe("corpus status / below-N detection (AE3)", () => {
	test("a corpus below the pre-registered minimum N is flagged inconclusive, not decidable", async () => {
		const { stdout } = await run(["corpus-status", join(FIX, "manifest-below-n.json")]);
		const out = JSON.parse(stdout);
		expect(out.corpus_n).toBe(2);
		expect(out.minimum_corpus_n).toBe(8);
		expect(out.below_n).toBe(true);
		expect(out.outcome_floor).toBe("inconclusive");
	});

	test("the stub manifest (minimum N unset) is not flagged below-N", async () => {
		const { stdout } = await run(["corpus-status", join(FIX, "corpus-manifest.json")]);
		const out = JSON.parse(stdout);
		expect(out.below_n).toBe(false);
		expect(out.outcome_floor).toBe("decidable");
	});
});

describe("label stripping for the blinded judge (H3 / FE4)", () => {
	test("identifying fields are removed; doc_id and findings survive", async () => {
		const { stdout } = await run(["strip-labels", join(FIX, "sample-record-valid.json")]);
		const out = JSON.parse(stdout);
		for (const field of ["arm", "trial", "latency_ms", "model", "cost", "producer", "status"]) {
			expect(out).not.toHaveProperty(field);
		}
		expect(out.doc_id).toBe("known-failure-1");
		expect(out.findings).toHaveLength(1);
	});
});

describe("circuit breaker (H4)", () => {
	test("disables an arm at the failure threshold, not before", async () => {
		const below = JSON.parse((await run(["breaker-check", "2"])).stdout);
		const at = JSON.parse((await run(["breaker-check", "3"])).stdout);
		expect(below.disable).toBe(false);
		expect(at.disable).toBe(true);
	});
});

describe("shared run-dir store: ingest + pool (P1 seam)", () => {
	test("an orchestrator record is ingested and pooled from the shared run dir", async () => {
		const runDir = mkdtempSync(join(tmpdir(), "cmre-"));
		const ingest = JSON.parse((await run(["ingest", runDir, join(FIX, "sample-record-valid.json")])).stdout);
		expect(ingest.written).toBeTruthy();
		expect(existsSync(ingest.written)).toBe(true);

		const pooled = JSON.parse((await run(["pool", runDir])).stdout);
		expect(pooled.total).toBe(1);
		expect(pooled.by_arm.b_isolated).toBe(1);
		expect(pooled.invalid).toBe(0);
	});

	test("ingesting a malformed record fails and writes nothing", async () => {
		const runDir = mkdtempSync(join(tmpdir(), "cmre-"));
		const { stdout, exitCode } = await run(["ingest", runDir, join(FIX, "sample-record-invalid.json")]);
		const out = JSON.parse(stdout);
		expect(out.written).toBeNull();
		expect(exitCode).toBe(1);
		expect(JSON.parse((await run(["pool", runDir])).stdout).total).toBe(0);
	});
});

describe("cross-model arm invocation assembly (R2 / U3)", () => {
	const doc = join(FIX, "sample-doc.md");
	const rubric = join(FIX, "sample-rubric.md");
	const context = join(FIX, "sample-context.md");

	test("document content is passed via stdin, never interpolated into argv", async () => {
		const out = JSON.parse((await arms(["build-invocation", "b_isolated", "codex", doc, rubric])).stdout);
		expect(Array.isArray(out.argv)).toBe(true);
		expect(out.doc_in_argv).toBe(false);
		expect(out.stdin_len).toBeGreaterThan(0);
	});

	test("arm b is isolated from the repo: clean cwd + --skip-git-repo-check, no context", async () => {
		const out = JSON.parse((await arms(["build-invocation", "b_isolated", "codex", doc, rubric])).stdout);
		expect(out.isolated_from_repo).toBe(true);
		expect(out.skip_git_repo_check).toBe(true);
		expect(out.cwd).not.toBe(REPO_ROOT);
		expect(out.argv).toContain("--skip-git-repo-check");
		expect(out.stdin_has_context).toBe(false);
	});

	test("arm c also runs from a clean cwd; its only added context is the fixed set via stdin", async () => {
		const out = JSON.parse((await arms(["build-invocation", "c_fixed_context", "agy", doc, rubric, "--context", context])).stdout);
		expect(out.isolated_from_repo).toBe(true);
		expect(out.stdin_has_context).toBe(true);
		expect(out.cwd).not.toBe(REPO_ROOT);
		expect(out.argv).toEqual(["agy", "--print", expect.any(String)]);
	});

	test("gemini arm: clean cwd, -p instruction in argv, read-only (plan) mode, doc on stdin not argv", async () => {
		const out = JSON.parse((await arms(["build-invocation", "c_fixed_context", "gemini", doc, rubric, "--context", context])).stdout);
		expect(out.isolated_from_repo).toBe(true);
		expect(out.stdin_has_context).toBe(true);
		expect(out.doc_in_argv).toBe(false);
		expect(out.argv[0]).toBe("gemini");
		expect(out.argv).toContain("-p");
		// read-only mode so the reviewer never edits files
		expect(out.argv).toContain("--approval-mode");
		expect(out.argv).toContain("plan");
	});
});

describe("arm-b isolation probe (AD2 / P1)", () => {
	test("a leaked sentinel is detected; a clean output is not", async () => {
		const sentinel = "SENTINEL-7f3a9";
		const leaked = tmpFile("leaked.txt", `The config value is ${sentinel}, which I read.`);
		const clean = tmpFile("clean.txt", "I have no access to that configuration value.");
		expect(JSON.parse((await arms(["detect-leak", sentinel, leaked])).stdout).leaked).toBe(true);
		expect(JSON.parse((await arms(["detect-leak", sentinel, clean])).stdout).leaked).toBe(false);
	});
});

describe("findings parsing (U3)", () => {
	test("a JSON array of objects parses into findings", async () => {
		const f = tmpFile("out.json", JSON.stringify([{ id: "a", text: "one" }, { text: "two" }]));
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(2);
		expect(out[0]).toEqual({ id: "a", text: "one" });
		expect(out[1].text).toBe("two");
	});

	test("markdown bullets parse into findings", async () => {
		const f = tmpFile("out.md", "Critique:\n- first issue\n- second issue\n");
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(2);
		expect(out[0].text).toBe("first issue");
	});

	test("numbered lists parse into findings (smoke-found gap)", async () => {
		const f = tmpFile("out.md", "1. **Premise** is unsupported.\n2) Cheaper alternative ignored.\n");
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(2);
		expect(out[0].text).toBe("**Premise** is unsupported.");
		expect(out[1].text).toBe("Cheaper alternative ignored.");
	});

	test("free-form prose becomes a single finding", async () => {
		const f = tmpFile("out.txt", "This plan's premise is unconvincing.");
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(1);
		expect(out[0].id).toBe("f1");
	});

	test("blank-line-separated prose paragraphs split into findings (codex prose shape)", async () => {
		const f = tmpFile("out.txt", "Critical: the dataset IAM is unspecified.\n\nCritical: the subject column is untrusted.\n\nHigh: the key leaks in ps.");
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(3);
		expect(out[0].text).toContain("IAM");
		expect(out[2].text).toContain("key leaks");
	});

	test("a fenced ```json array parses (the structured path the arm instruction requests)", async () => {
		const f = tmpFile("out.md", '```json\n["the dataset IAM is unspecified", "the subject column is untrusted"]\n```');
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(2);
		expect(out[0].text).toContain("IAM");
	});

	test("single-newline prose is NOT split (verbose models wrap one finding across lines)", async () => {
		// counts from unstructured prose are best-effort; we under-count rather than over-count
		const f = tmpFile("out.txt", "This is a long finding that the model\nwrapped across two lines without a blank line.");
		const out = JSON.parse((await arms(["parse-findings", f])).stdout).findings;
		expect(out).toHaveLength(1);
	});
});

describe("cross-arm dedup (U5)", () => {
	test("findings with the same normalized text merge and record contributing arms", async () => {
		const out = JSON.parse((await run(["dedup", join(FIX, "findings-pool.json")])).stdout);
		expect(out).toHaveLength(2);
		expect(out[0].arms).toEqual(["a_baseline", "b_isolated"]);
		expect(out[0].count).toBe(2);
		expect(out[1].arms).toEqual(["c_fixed_context"]);
	});
});

describe("blind-integrity verdict (R5 / U5)", () => {
	test("at-chance arm guessing is not confounded; well-above-chance is", async () => {
		const near = JSON.parse((await run(["integrity-verdict", "30", "100", "4"])).stdout);
		const high = JSON.parse((await run(["integrity-verdict", "60", "100", "4"])).stdout);
		expect(near.chance).toBeCloseTo(0.25);
		expect(near.confounded).toBe(false);
		expect(high.confounded).toBe(true);
	});
});

describe("aggregation -> three-way decision (U6 / R7 / R9)", () => {
	test("an arm clearing the pre-registered threshold yields build:<arm>", async () => {
		const out = JSON.parse((await run(["aggregate", join(FIX, "scored-build.json"), join(FIX, "manifest-decidable.json")])).stdout);
		expect(out.outcome).toBe("build:c_fixed_context");
		expect(out.winning_arm).toBe("c_fixed_context");
		expect(out.per_arm.c_fixed_context.known_failure).toBe(2);
		expect(out.below_n).toBe(false);
	});

	test("a corpus below minimum N is inconclusive even if an arm clears the threshold", async () => {
		const out = JSON.parse((await run(["aggregate", join(FIX, "scored-build.json"), join(FIX, "manifest-below-n.json")])).stdout);
		expect(out.below_n).toBe(true);
		expect(out.outcome).toBe("inconclusive");
	});

	test("negative-control movement forces inconclusive (harness stability problem)", async () => {
		const out = JSON.parse((await run(["aggregate", join(FIX, "scored-control-moved.json"), join(FIX, "manifest-decidable.json")])).stdout);
		expect(out.control_moved).toBe(true);
		expect(out.outcome).toBe("inconclusive");
	});
});

// GT-match scoring (code-review breakpoint): the judge classifies findings blind,
// deciding per finding whether it describes the document's ground_truth.bug; the
// runner re-attaches arms afterward (blind preserved) to a per-(arm,doc) hit. This
// is the sharper operationalization of the known-failure axis that a concrete fix
// commit unlocks over plan review's forward-rated decision_changing (R7).
function tmpJson(name: string, value: unknown) {
	const dir = mkdtempSync(join(tmpdir(), "cmre-gt-"));
	const p = join(dir, name);
	writeFileSync(p, JSON.stringify(value));
	return p;
}

describe("GT-match pool: globally-unique, arm-opaque finding ids", () => {
	const records = () =>
		tmpJson("records.json", [
			{ arm: "c_fixed_context", doc_id: "kf-1", findings: [{ id: "f1", text: "the real collation bug" }] },
			{ arm: "a_baseline", doc_id: "kf-1", findings: [{ id: "f1", text: "an unrelated nit" }] },
		]);

	test("two arms reusing the same local finding id get distinct uids; the pool hides the arm", async () => {
		const pool = JSON.parse((await run(["gt-pool", records()])).stdout);
		const uids = pool.pool.map((p: { uid: string }) => p.uid);
		expect(new Set(uids).size).toBe(2); // distinct despite both being "f1"
		expect(pool.pool.every((p: Record<string, unknown>) => !("arm" in p))).toBe(true); // blind
	});

	test("a verdict credits only the arm whose finding it is, not a same-local-id sibling (the bug)", async () => {
		const pool = JSON.parse((await run(["gt-pool", records()])).stdout);
		const provFile = tmpJson("prov.json", pool.provenance);
		// the uid whose provenance is the c_fixed_context finding
		const cUid = Object.entries(pool.provenance).find(
			([, p]) => (p as { arm: string }).arm === "c_fixed_context",
		)![0];
		const verdicts = tmpJson("verdicts.json", [{ uid: cUid, matches_bug: true }]);
		const out = JSON.parse((await run(["gt-resolve", provFile, verdicts])).stdout);
		const byArm = Object.fromEntries(out.map((r: { arm: string; gt_hit: boolean }) => [r.arm, r.gt_hit]));
		expect(byArm.c_fixed_context).toBe(true);
		expect(byArm.a_baseline).toBe(false); // NOT credited despite sharing local id "f1"
	});
});

describe("GT-match: per-arm known-failure score (R7 primary metric)", () => {
	test("hits are counted only on known_failure docs", async () => {
		const manifest = tmpJson("m.json", {
			docs: [
				{ id: "kf-1", subset: "known_failure", ground_truth: { bug: "x" } },
				{ id: "kf-2", subset: "known_failure", ground_truth: { bug: "y" } },
				{ id: "nc-1", subset: "negative_control" },
			],
		});
		const matches = tmpJson("am.json", [
			{ arm: "c_fixed_context", doc_id: "kf-1", gt_hit: true },
			{ arm: "c_fixed_context", doc_id: "kf-2", gt_hit: true },
			{ arm: "a_baseline", doc_id: "kf-1", gt_hit: false },
			{ arm: "a_baseline", doc_id: "kf-2", gt_hit: false },
			{ arm: "b_isolated", doc_id: "nc-1", gt_hit: true },
		]);
		const out = JSON.parse((await run(["gt-score", manifest, matches])).stdout);
		expect(out.known_failure_n).toBe(2);
		expect(out.per_arm.c_fixed_context.hits).toBe(2);
		expect(out.per_arm.a_baseline.hits).toBe(0);
		expect(out.per_arm.b_isolated.scored).toBe(0); // nc-1 is not a known_failure doc
	});
});

describe("finding-yield metric (the value GT-match alone misses)", () => {
	test("tallies per-arm total / unique-actionable / decision-changing from blind verdicts", async () => {
		const prov = tmpJson("prov.json", {
			g1: { arm: "b_isolated", doc_id: "d1" },
			g2: { arm: "b_isolated", doc_id: "d1" },
			g3: { arm: "a_baseline", doc_id: "d1" },
		});
		const verdicts = tmpJson("v.json", [
			{ uid: "g1", actionable: true, decision_changing: true },
			{ uid: "g2", actionable: true, duplicate: true }, // actionable but a duplicate -> not unique-actionable
			{ uid: "g3", actionable: false },
		]);
		const out = JSON.parse((await run(["yield-score", prov, verdicts])).stdout);
		expect(out.b_isolated.total).toBe(2);
		expect(out.b_isolated.unique_actionable).toBe(1); // g1 only; g2 is a duplicate
		expect(out.b_isolated.decision_changing).toBe(1);
		expect(out.a_baseline.total).toBe(1);
		expect(out.a_baseline.unique_actionable).toBe(0); // g3 not actionable
		expect(out.c_fixed_context.total).toBe(0); // arms with no findings still reported at zero
	});
});

describe("aggregation uses GT-match hits as the known-failure metric", () => {
	test("gt_hit drives build:<arm> and takes precedence over decision_changing", async () => {
		const manifest = tmpJson("m.json", {
			pre_registration: { go_threshold: 2, minimum_corpus_n: 2, trials_per_arm: 3 },
			docs: [
				{ id: "kf-1", subset: "known_failure" },
				{ id: "kf-2", subset: "known_failure" },
			],
		});
		const scored = tmpJson("s.json", [
			{ arm: "c_fixed_context", doc_id: "kf-1", subset: "known_failure", gt_hit: true },
			{ arm: "c_fixed_context", doc_id: "kf-2", subset: "known_failure", gt_hit: true },
			// gt_hit:false must NOT count even though decision_changing is true
			{ arm: "a_baseline", doc_id: "kf-1", subset: "known_failure", gt_hit: false, decision_changing: true },
		]);
		const out = JSON.parse((await run(["aggregate", scored, manifest])).stdout);
		expect(out.outcome).toBe("build:c_fixed_context");
		expect(out.per_arm.c_fixed_context.known_failure).toBe(2);
		expect(out.per_arm.a_baseline.known_failure).toBe(0);
	});
});
