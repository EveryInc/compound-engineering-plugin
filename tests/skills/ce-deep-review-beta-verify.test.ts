import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// RU4: the deterministic quote-grep verification backstop. verify-findings.py grounds each raw
// cross-model finding against the plan -> CONFIRMED / NOT-FOUND-IN-DOC / NEEDS-HUMAN. Pure function
// of (finding text, doc); blind to the producing model; authoritative. Mechanical -> runs current
// source.

const REPO = join(import.meta.dir, "..", "..");
const VERIFY = join(REPO, "plugins/compound-engineering/skills/ce-deep-review-beta/scripts/verify-findings.py");

const DOC = [
	"# Plan",
	"",
	"The premise is to remove the terminal hop so the deep review actually gets run.",
	"agy is the default non-codex arm; its read-only floor is a macOS seatbelt.",
].join("\n");

function docFile(text = DOC): string {
	const p = join(mkdtempSync(join(tmpdir(), "verify-doc-")), "plan.md");
	writeFileSync(p, text);
	return p;
}

async function py(args: string[]) {
	const proc = Bun.spawn(["python3", VERIFY, ...args], { stdout: "pipe", stderr: "pipe" });
	const stdout = await new Response(proc.stdout).text();
	const exitCode = await proc.exited;
	return { out: stdout.trim() ? JSON.parse(stdout) : null, exitCode };
}

describe("RU4 verify-findings: verify-one verdicts", () => {
	const doc = docFile();

	test("CONFIRMED when a substantial verbatim quote exists in the doc", async () => {
		const { out } = await py(["verify-one", doc, 'The plan says "remove the terminal hop" up front.']);
		expect(out.verdict).toBe("CONFIRMED");
		expect(out.grounding_quote).toBe("remove the terminal hop");
	});

	test("NOT-FOUND-IN-DOC when a claimed quote is absent", async () => {
		const { out } = await py(["verify-one", doc, 'It states "we will migrate to blockchain consensus".']);
		expect(out.verdict).toBe("NOT-FOUND-IN-DOC");
		expect(out.grounding_quote).toBeNull();
	});

	test("NEEDS-HUMAN when there is no substantial quote (paraphrase / implication)", async () => {
		const { out } = await py(["verify-one", doc, "The migration lacks a rollback strategy."]);
		expect(out.verdict).toBe("NEEDS-HUMAN");
	});

	test("a lone identifier/filename quote does not trivially CONFIRM", async () => {
		const { out } = await py(["verify-one", doc, "The `agy` arm is referenced."]);
		expect(out.verdict).toBe("NEEDS-HUMAN");
	});

	test("normalization: smart quotes + collapsed whitespace still match (no false NOT-FOUND)", async () => {
		// finding uses smart quotes and extra spacing around the same phrase
		const { out } = await py(["verify-one", doc, 'The doc: “remove   the terminal   hop”.']);
		expect(out.verdict).toBe("CONFIRMED");
	});

	test("normalization: markdown emphasis in the doc still matches an unemphasized verbatim quote", async () => {
		// A real-run artifact: a finding quotes a phrase the doc wrote with *italic* / **bold** markers.
		// The emphasis carries no content, so the verbatim quote must still CONFIRM (not false NOT-FOUND).
		const emph = docFile("# Plan\n\nThe decision: the order *is* the container — no **freeform projects**.");
		const { out: star } = await py(["verify-one", emph, 'It quotes "the order is the container" verbatim.']);
		expect(star.verdict).toBe("CONFIRMED");
		// underscore emphasis (_italic_) folds symmetrically
		const us = docFile("# Plan\n\nThe rule: _no freeform client projects_ exist in this system.");
		const { out: under } = await py(["verify-one", us, 'The doc states "no freeform client projects" plainly.']);
		expect(under.verdict).toBe("CONFIRMED");
	});
});

describe("RU4 verify-findings: verify-records is blind to the producing model + aggregates", () => {
	test("same finding text -> same verdict regardless of the model in the filename (model-blind)", async () => {
		const doc = docFile();
		const dir = mkdtempSync(join(tmpdir(), "verify-recs-"));
		const finding = { id: "f1", text: 'cites "remove the terminal hop"' };
		// identical finding under two different model labels
		writeFileSync(join(dir, "codex__coherence.json"), JSON.stringify({ findings: [finding] }));
		writeFileSync(join(dir, "agy__coherence.json"), JSON.stringify({ findings: [finding] }));
		const { out } = await py(["verify-records", doc, dir]);
		const verdicts = out.verified.map((r: { verdict: string }) => r.verdict);
		expect(verdicts).toEqual(["CONFIRMED", "CONFIRMED"]); // model label did not change the verdict
		expect(out.counts.CONFIRMED).toBe(2);
	});

	test("counts tally the three verdicts across a mixed records dir", async () => {
		const doc = docFile();
		const dir = mkdtempSync(join(tmpdir(), "verify-recs-"));
		writeFileSync(
			join(dir, "agy__security.json"),
			JSON.stringify({
				findings: [
					{ id: "a", text: 'quotes "remove the terminal hop" correctly' }, // CONFIRMED
					{ id: "b", text: 'claims "the plan mandates zero-downtime cutover"' }, // NOT-FOUND
					{ id: "c", text: "vague concern about scope creep" }, // NEEDS-HUMAN
				],
			}),
		);
		const { out } = await py(["verify-records", doc, dir]);
		expect(out.counts).toEqual({ "CONFIRMED": 1, "NOT-FOUND-IN-DOC": 1, "NEEDS-HUMAN": 1 });
	});
});

describe("RU6b verifier-rate measurement (deterministic; <=5% gate)", () => {
	const CORPUS = join(REPO, "plugins/compound-engineering/skills/ce-deep-review-beta/references/calibration/verifier-corpus.json");

	test("the committed corpus has >=10 grounded and >=10 confabulated items", () => {
		const c = JSON.parse(readFileSync(CORPUS, "utf8"));
		const grounded = c.items.filter((i: { expected: string }) => i.expected === "CONFIRMED").length;
		const confab = c.items.filter((i: { expected: string }) => i.expected === "NOT-FOUND-IN-DOC").length;
		expect(grounded).toBeGreaterThanOrEqual(10);
		expect(confab).toBeGreaterThanOrEqual(10);
	});

	test("verifier clears the <=5% gate on the corpus (false-CONFIRM and false-NOT-FOUND)", async () => {
		const { out } = await py(["measure", CORPUS]);
		expect(out.false_confirm_rate).toBeLessThanOrEqual(0.05);
		expect(out.false_not_found_rate).toBeLessThanOrEqual(0.05);
		expect(out.eligible).toBe(true);
	});
});
