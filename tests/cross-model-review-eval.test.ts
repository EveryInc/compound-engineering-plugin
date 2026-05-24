import { describe, expect, test } from "bun:test";
import { mkdtempSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests the deterministic carrier of the cross-model review eval runner (U2).
// The model-driven arms and judge are NOT exercised here — their quality is
// validated by the human-confirmation step (U6), per the plan. These tests
// assert structure and behavior of the pure pieces, following the
// Bun.spawn(["python3", ...]) pattern from tests/session-history-scripts.test.ts.

const REPO_ROOT = join(import.meta.dir, "..");
const RUNNER = join(REPO_ROOT, "scripts/eval/cross_model_review/run_arms.py");
const FIX = join(REPO_ROOT, "tests/fixtures/cross-model-review");

async function run(args: string[]) {
	const proc = Bun.spawn(["python3", RUNNER, ...args], { stdout: "pipe", stderr: "pipe" });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
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
