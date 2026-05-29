import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// RU5: reconcile.py — the verified-sidecar helpers. `rotate` is the data-loss-risk surface (it
// deletes old rotations), so it gets the most coverage: keep-N by ISO infix, never touch the base
// or the -draft sidecar. `render-cross-model` is deterministic by-lens verdict-tagged Markdown.

const REPO = join(import.meta.dir, "..", "..");
const RECONCILE = join(REPO, "plugins/compound-engineering/skills/ce-deep-review-beta/scripts/reconcile.py");

async function py(args: string[]) {
	const proc = Bun.spawn(["python3", RECONCILE, ...args], { stdout: "pipe", stderr: "pipe" });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

function scratch(): string {
	return mkdtempSync(join(tmpdir(), "reconcile-"));
}

describe("RU5 reconcile rotate: keep-N, data-loss-safe", () => {
	test("rotates the base out, keeps the 5 newest rotations, deletes older; spares base+draft", async () => {
		const d = scratch();
		const base = join(d, "plan.md.deep-review.md");
		const draft = join(d, "plan.md.deep-review-draft.md");
		writeFileSync(base, "BASE");
		writeFileSync(draft, "DRAFT");
		for (const iso of ["2026-05-01T000000Z", "2026-05-02T000000Z", "2026-05-03T000000Z", "2026-05-04T000000Z", "2026-05-05T000000Z", "2026-05-06T000000Z"]) {
			writeFileSync(join(d, `plan.md.deep-review.${iso}.md`), `rot ${iso}`);
		}
		const { stdout, exitCode } = await py(["rotate", base, "--now", "2026-05-29T030000Z", "--keep", "5"]);
		expect(exitCode).toBe(0);
		const res = JSON.parse(stdout);

		// base was renamed to the new rotation, then pruned set keeps the 5 newest infixes
		expect(existsSync(base)).toBe(false);
		expect(existsSync(draft)).toBe(true); // never touched
		expect(readFileSync(draft, "utf8")).toBe("DRAFT");
		expect(existsSync(join(d, "plan.md.deep-review.2026-05-29T030000Z.md"))).toBe(true); // newest kept
		expect(existsSync(join(d, "plan.md.deep-review.2026-05-01T000000Z.md"))).toBe(false); // oldest pruned
		expect(existsSync(join(d, "plan.md.deep-review.2026-05-02T000000Z.md"))).toBe(false);
		expect(existsSync(join(d, "plan.md.deep-review.2026-05-03T000000Z.md"))).toBe(true);
		expect(res.pruned.length).toBe(2);
		expect(res.kept.length).toBe(5);
	});

	test("no existing base -> nothing renamed, pruning still bounds rotations to keep", async () => {
		const d = scratch();
		for (const iso of ["2026-05-01T000000Z", "2026-05-02T000000Z", "2026-05-03T000000Z"]) {
			writeFileSync(join(d, `plan.md.deep-review.${iso}.md`), "r");
		}
		const { stdout } = await py(["rotate", join(d, "plan.md.deep-review.md"), "--now", "2026-05-29T030000Z", "--keep", "2"]);
		const res = JSON.parse(stdout);
		expect(res.rotated).toBeNull(); // no base to rotate
		expect(res.kept.length).toBe(2);
		expect(res.pruned.length).toBe(1);
	});

	test("refuses a path that is not a .deep-review.md sidecar", async () => {
		const d = scratch();
		const { exitCode, stderr } = await py(["rotate", join(d, "plan.md"), "--now", "2026-05-29T030000Z"]);
		expect(exitCode).not.toBe(0);
		expect(stderr).toMatch(/deep-review\.md/);
	});
});

describe("RU5 reconcile render-cross-model: deterministic by-lens, verdict-tagged", () => {
	test("groups by lens in canonical order, tags verdicts, shows grounding quote on CONFIRMED", async () => {
		const d = scratch();
		const vr = join(d, "vr.json");
		writeFileSync(vr, JSON.stringify({
			verified: [
				{ model: "codex", lens: "security", id: "s1", text: "secret-read-exfil", verdict: "NEEDS-HUMAN", grounding_quote: null },
				{ model: "agy", lens: "coherence", id: "c1", text: "arm drift", verdict: "CONFIRMED", grounding_quote: "remove the terminal hop" },
				{ model: "codex", lens: "coherence", id: "c2", text: "phantom CI step", verdict: "NOT-FOUND-IN-DOC", grounding_quote: null },
			],
		}));
		const { stdout, exitCode } = await py(["render-cross-model", vr]);
		expect(exitCode).toBe(0);
		// coherence section precedes security (canonical lens order)
		expect(stdout.indexOf("### Coherence")).toBeLessThan(stdout.indexOf("### Security"));
		// CONFIRMED precedes NOT-FOUND within coherence (verdict order)
		expect(stdout.indexOf("[CONFIRMED]")).toBeLessThan(stdout.indexOf("[NOT-FOUND-IN-DOC]"));
		expect(stdout).toContain("**[CONFIRMED]** (agy) arm drift");
		expect(stdout).toContain('grounding quote: "remove the terminal hop"');
		expect(stdout).toContain("**[NEEDS-HUMAN]** (codex) secret-read-exfil");
	});
});
