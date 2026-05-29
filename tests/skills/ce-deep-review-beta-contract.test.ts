import { readFile } from "fs/promises";
import path from "path";
import { describe, expect, test } from "bun:test";
import { parseFrontmatter } from "../../src/utils/frontmatter";

const SKILL = "plugins/compound-engineering/skills/ce-deep-review-beta/SKILL.md";

async function read(rel: string): Promise<string> {
	return readFile(path.join(process.cwd(), rel), "utf8");
}

describe("ce-deep-review-beta contract (thin slice)", () => {
	test("beta frontmatter: name, [BETA] description, disable-model-invocation, argument-hint", async () => {
		const { data } = parseFrontmatter(await read(SKILL));
		expect(data.name).toBe("ce-deep-review-beta");
		expect(typeof data.description).toBe("string");
		expect(data.description as string).toMatch(/^\[BETA\]/);
		expect(data["disable-model-invocation"]).toBe(true);
		expect(typeof data["argument-hint"]).toBe("string");
	});

	test("pass 1 invokes ce-doc-review headless and has a failure-UX stop", async () => {
		const c = await read(SKILL);
		expect(c).toContain('Skill("ce-doc-review", "mode:headless');
		expect(c).toMatch(/Pass 1 failed/);
		// gate must not open without panel results
		expect(c).toMatch(/[Dd]o not open the consent gate/);
	});

	test("AskUserQuestion is preloaded for the consent gate", async () => {
		const c = await read(SKILL);
		expect(c).toContain("select:AskUserQuestion");
	});

	test("consent gate is per-model opt-in (default none) with egress = consent", async () => {
		const c = await read(SKILL);
		expect(c).toMatch(/multi-select/i);
		expect(c).toMatch(/default none/i);
		// egress is gated by --models BEFORE the run, never post-hoc
		expect(c).toContain("--models");
		expect(c).toMatch(/never\s+filter records post-hoc/i);
	});

	test("consent gate labels carry the egress verb (classifier legibility) + dispatch has a block fallback", async () => {
		const c = await read(SKILL);
		// option labels must name the egress + vendor, not bare model names (OD-4 legibility)
		expect(c).toMatch(/Send the plan to codex \(OpenAI\)/);
		expect(c).toMatch(/Send the plan to agy \(Antigravity\)/);
		// the dispatch must document a fallback for the auto-mode egress classifier block
		expect(c).toMatch(/egress classifier|harness blocks this call/i);
		expect(c).toMatch(/allowed-tools` is not sufficient|allowed-tools is not sufficient/i);
	});

	test("verified output: writes the reserved .deep-review.md (skill_phase: verified), rotates, spares the draft", async () => {
		const c = await read(SKILL);
		expect(c).toContain(".deep-review.md");
		expect(c).toContain("skill_phase: verified");
		expect(c).toContain("verification: quote-grep-backstop");
		// rotation runs before the fresh write (data-loss-safe keep-5)
		expect(c).toMatch(/reconcile\.py" rotate/);
		// the historical thin-slice draft is left in place, not overwritten
		expect(c).toMatch(/deep-review-draft\.md.*(in place|historical)/i);
	});

	test("graceful gitleaks degradation is documented inline", async () => {
		const c = await read(SKILL);
		expect(c).toMatch(/gitleaks-scan\.sh/);
		expect(c).toMatch(/unavailable/);
		expect(c).toMatch(/Do NOT block|does NOT block|do not block/i);
		expect(c).toContain("content_preview: unavailable");
	});

	test("Phase 3.5 verification: quote-grep backstop, three verdicts, authoritative + model-blind", async () => {
		const c = await read(SKILL);
		expect(c).toContain("verify-findings.py");
		expect(c).toMatch(/CONFIRMED/);
		expect(c).toMatch(/NOT-FOUND-IN-DOC/);
		expect(c).toMatch(/NEEDS-HUMAN/);
		// the deterministic backstop is authoritative and must not be overridden by a model
		expect(c).toMatch(/authoritative/i);
		expect(c).toMatch(/blind to the producing model/i);
	});
});
