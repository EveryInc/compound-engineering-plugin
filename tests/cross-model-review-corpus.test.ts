import { describe, expect, test, beforeAll } from "bun:test";
import { mkdtempSync, existsSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Tests the deterministic pieces of the known-bug corpus builder (code-review
// breakpoint). The git WALK in `scan` is exercised against a constructed temp
// repo (deterministic — we author the commits), mirroring how the model arms in
// cross-model-review-eval.test.ts are kept out of the unit surface. The pure
// parsers (revert-SHA, PR numbers, hunk ranges, regression subjects, entry
// conformance) are the rigor-bearing logic: a bug there silently mis-attributes
// a corpus item, so they are tested directly.

const REPO_ROOT = join(import.meta.dir, "..");
const BUILDER = join(REPO_ROOT, "scripts/eval/cross_model_review/build_corpus.py");

async function spawn(cmd: string[]) {
	const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe" });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

const build = (args: string[]) => spawn(["python3", BUILDER, ...args]);

function tmpFile(name: string, content: string) {
	const dir = mkdtempSync(join(tmpdir(), "cmre-corpus-"));
	const p = join(dir, name);
	writeFileSync(p, content);
	return p;
}

describe("revert-SHA extraction (Tier-1 attribution: git-generated reverts)", () => {
	test("a git revert body yields the culprit SHA", async () => {
		const body = tmpFile(
			"body.txt",
			'Revert "feat: add widget"\n\nThis reverts commit 0123456789abcdef0123456789abcdef01234567.\n',
		);
		const out = JSON.parse((await build(["parse-revert-sha", body])).stdout);
		expect(out.culprit_sha).toBe("0123456789abcdef0123456789abcdef01234567");
	});

	test("a body with no revert line yields null (falls to a weaker attribution)", async () => {
		const body = tmpFile("body.txt", 'revert: "refactor(cli)!: rename skills"\n\nThis broke flat-install.\n');
		const out = JSON.parse((await build(["parse-revert-sha", body])).stdout);
		expect(out.culprit_sha).toBeNull();
	});
});

describe("PR-number extraction (Tier-1 attribution: conventional reverts)", () => {
	test("a reverted-PR subject yields the culprit PR number", async () => {
		const f = tmpFile("subj.txt", 'revert: "refactor(cli)!: rename all skills (#503)"');
		const out = JSON.parse((await build(["parse-pr-numbers", f])).stdout);
		expect(out.prs).toEqual([503]);
		expect(out.last).toBe(503);
	});

	test("multiple references are all captured, in order", async () => {
		const f = tmpFile("subj.txt", "fix: undo #100 which regressed after #95 (#214)");
		const out = JSON.parse((await build(["parse-pr-numbers", f])).stdout);
		expect(out.prs).toEqual([100, 95, 214]);
		expect(out.last).toBe(214);
	});

	test("no reference yields an empty list and null last", async () => {
		const f = tmpFile("subj.txt", "fix: tidy up");
		const out = JSON.parse((await build(["parse-pr-numbers", f])).stdout);
		expect(out.prs).toEqual([]);
		expect(out.last).toBeNull();
	});
});

describe("hunk-range parsing (feeds blame attribution: Tier-2/3)", () => {
	test("pre-image line ranges are extracted per file, defaulting omitted counts to 1", async () => {
		const diff = tmpFile(
			"fix.diff",
			[
				"diff --git a/foo.txt b/foo.txt",
				"index 1111111..2222222 100644",
				"--- a/foo.txt",
				"+++ b/foo.txt",
				"@@ -3,2 +3,3 @@ some context",
				"-old line",
				"+new line",
				"+another",
				"@@ -10 +11,2 @@",
				"-x",
				"+y",
				"+z",
				"",
			].join("\n"),
		);
		const out = JSON.parse((await build(["parse-hunk-ranges", diff])).stdout);
		expect(out.files).toHaveLength(1);
		expect(out.files[0].file).toBe("foo.txt");
		expect(out.files[0].old_ranges).toEqual([
			[3, 2],
			[10, 1],
		]);
	});

	test("a pure-addition hunk (old count 0) contributes no blameable range", async () => {
		const diff = tmpFile(
			"add.diff",
			["diff --git a/new.txt b/new.txt", "--- a/new.txt", "+++ b/new.txt", "@@ -0,0 +1,2 @@", "+a", "+b", ""].join("\n"),
		);
		const out = JSON.parse((await build(["parse-hunk-ranges", diff])).stdout);
		expect(out.files[0].old_ranges).toEqual([]);
	});
});

describe("regression-subject detection (Tier-2 named-regression signal)", () => {
	test("a subject naming a break is flagged with the matched term", async () => {
		const f = tmpFile("s.txt", "fix: remove close-stale-PR step that broke release creation");
		const out = JSON.parse((await build(["is-regression-subject", f])).stdout);
		expect(out.is_regression).toBe(true);
		expect(out.matched).toContain("broke");
	});

	test("an ordinary feature subject is not flagged", async () => {
		const f = tmpFile("s.txt", "feat(ce-plan): introduced a deepening pass");
		const out = JSON.parse((await build(["is-regression-subject", f])).stdout);
		expect(out.is_regression).toBe(false);
	});
});

describe("corpus-entry conformance (the manifest gate, mirrors validate-record)", () => {
	const validEntry = {
		id: "kf-0123456",
		path: "corpus/diffs/kf-0123456.diff",
		subset: "known_failure",
		ground_truth: {
			bug: "renaming all skills/agents to ce- prefix broke flat-install allow-lists",
			fix_commit: "af80bf23",
			culprit_pr: 503,
			surfaced_after_days: 4,
			attribution: "revert",
			trust: "high",
		},
	};

	test("a well-formed known-failure entry validates", async () => {
		const f = tmpFile("entry.json", JSON.stringify(validEntry));
		const out = JSON.parse((await build(["validate-entry", f])).stdout);
		expect(out.valid).toBe(true);
		expect(out.errors).toHaveLength(0);
	});

	test("missing bug, bad attribution, and no culprit are each reported, nonzero exit", async () => {
		const bad = {
			id: "x",
			path: "p",
			subset: "known_failure",
			ground_truth: { fix_commit: "abc", attribution: "vibes", trust: "high" },
		};
		const f = tmpFile("bad.json", JSON.stringify(bad));
		const { stdout, exitCode } = await build(["validate-entry", f]);
		const out = JSON.parse(stdout);
		expect(out.valid).toBe(false);
		// missing bug, bad attribution enum, and neither culprit_pr nor culprit_sha
		expect(out.errors.length).toBeGreaterThanOrEqual(3);
		expect(exitCode).toBe(1);
	});
});

describe("scan: end-to-end Tier-1 revert discovery on a constructed repo", () => {
	let repo: string;
	let outDir: string;

	async function git(args: string[], cwd: string, env: Record<string, string> = {}) {
		const proc = Bun.spawn(["git", ...args], {
			cwd,
			env: { ...process.env, ...env },
			stdout: "pipe",
			stderr: "pipe",
		});
		await new Response(proc.stdout).text();
		await new Response(proc.stderr).text();
		await proc.exited;
	}

	beforeAll(async () => {
		repo = mkdtempSync(join(tmpdir(), "cmre-gitrepo-"));
		outDir = mkdtempSync(join(tmpdir(), "cmre-out-"));
		const id = { GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" };
		await git(["init", "-q", "-b", "main"], repo);
		writeFileSync(join(repo, "f.txt"), "v1\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "chore: seed"], repo, id);
		// the culprit change that will be reverted
		writeFileSync(join(repo, "f.txt"), "v2-broken\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "feat: change behavior (#42)"], repo, id);
		// the team reverts it -> the Tier-1 ground-truth signal
		await git(["revert", "--no-edit", "HEAD"], repo, id);
	});

	test("emits one known-failure entry attributed to the revert, with a materialized diff", async () => {
		const { stdout, exitCode } = await build(["scan", "--repo", repo, "--out-dir", outDir]);
		expect(exitCode).toBe(0);
		const out = JSON.parse(stdout);
		expect(out.stats.reverts_found).toBe(1);
		expect(out.entries).toHaveLength(1);

		const e = out.entries[0];
		expect(e.subset).toBe("known_failure");
		expect(e.ground_truth.attribution).toBe("revert");
		expect(e.ground_truth.trust).toBe("high");
		// the reverted commit carried (#42) in its subject -> captured as the culprit PR
		expect(e.ground_truth.culprit_pr).toBe(42);
		expect(typeof e.ground_truth.surfaced_after_days).toBe("number");
		// the culprit diff was written where the entry points, so an arm can review it
		expect(existsSync(e.path)).toBe(true);
	});

	test("every emitted entry passes the conformance gate", async () => {
		const { stdout } = await build(["scan", "--repo", repo, "--out-dir", outDir]);
		const out = JSON.parse(stdout);
		for (const e of out.entries) {
			const f = tmpFile("e.json", JSON.stringify(e));
			expect(JSON.parse((await build(["validate-entry", f])).stdout).valid).toBe(true);
		}
	});
});

describe("numstat parsing (culprit size gate)", () => {
	test("sums changed lines and counts files; binary (-) lines count as files with 0 lines", async () => {
		const f = tmpFile("ns.txt", "5\t2\tfoo.php\n0\t3\tbar.js\n-\t-\timg.png\n");
		const out = JSON.parse((await build(["parse-numstat", f])).stdout);
		expect(out.files).toBe(3);
		expect(out.changed_lines).toBe(10);
	});
});

describe("scan-fixes quality gate: size cap, foundational exclusion, shared-culprit dedup", () => {
	let repo: string;
	let outDir: string;

	async function git(args: string[], cwd: string, env: Record<string, string> = {}) {
		const proc = Bun.spawn(["git", ...args], { cwd, env: { ...process.env, ...env }, stdout: "pipe", stderr: "pipe" });
		await new Response(proc.stdout).text();
		await new Response(proc.stderr).text();
		await proc.exited;
	}
	function write(name: string, body: string) {
		writeFileSync(join(repo, name), body);
	}

	beforeAll(async () => {
		repo = mkdtempSync(join(tmpdir(), "cmre-gate-"));
		outDir = mkdtempSync(join(tmpdir(), "cmre-gateout-"));
		const id = { GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" };
		await git(["init", "-q", "-b", "main"], repo);
		// small culprit: 4-line file (two later fixes will both blame it -> dedup)
		write("small.php", "<?php\n$a = 1;\n$b = 2;\n$c = 3;\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "feat(small): add"], repo, id);
		// oversize culprit: 30-line file
		write("big.php", "<?php\n" + Array.from({ length: 29 }, (_, i) => `$x${i} = ${i};`).join("\n") + "\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "feat(big): add"], repo, id);
		// fix A modifies small.php line 3 -> blames the small feat
		write("small.php", "<?php\n$a = 1;\n$b = 20;\n$c = 3;\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "fix(small): correct b"], repo, id);
		// fix B modifies small.php line 4 -> also blames the small feat (shared culprit)
		write("small.php", "<?php\n$a = 1;\n$b = 20;\n$c = 30;\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "fix(small): correct c"], repo, id);
		// fix C modifies big.php -> blames the oversize feat
		write("big.php", "<?php\n$x0 = 100;\n" + Array.from({ length: 28 }, (_, i) => `$x${i + 1} = ${i + 1};`).join("\n") + "\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "fix(big): correct x0"], repo, id);
	});

	test("oversize culprits are excluded and fixes sharing a culprit are deduped", async () => {
		const { stdout, exitCode } = await build([
			"scan-fixes", "--repo", repo, "--out-dir", outDir,
			"--max-culprit-lines", "20", "--max-culprit-files", "5",
		]);
		expect(exitCode).toBe(0);
		const out = JSON.parse(stdout);
		expect(out.stats.fixes_scanned).toBe(3);
		expect(out.stats.entries_emitted).toBe(1); // one distinct, in-cap culprit survives
		expect(out.stats.filtered_oversize).toBe(1); // the 30-line culprit
		expect(out.stats.filtered_dup).toBe(1); // the second fix sharing the small culprit
	});
});

describe("to-manifest (assemble a manifest skeleton from scan output)", () => {
	test("wraps entries as docs with null pre-registration for the human to fill (R9)", async () => {
		const scan = tmpFile(
			"scan.json",
			JSON.stringify({
				entries: [
					{ id: "kf-1", path: "a.diff", subset: "known_failure", ground_truth: { bug: "x" } },
					{ id: "kf-2", path: "b.diff", subset: "known_failure", ground_truth: { bug: "y" } },
				],
				stats: {},
			}),
		);
		const out = JSON.parse((await build(["to-manifest", scan])).stdout);
		expect(out.docs).toHaveLength(2);
		expect(out.docs[0].id).toBe("kf-1");
		expect(out.pre_registration.go_threshold).toBeNull();
		expect(out.pre_registration.minimum_corpus_n).toBeNull();
		expect(out.pre_registration.trials_per_arm).toBe(3);
		expect(out.arms).toContain("c_fixed_context");
	});
});

describe("code-path filter (keeps a code-review corpus free of doc fixes)", () => {
	test("source files are code; markdown and docs/ paths are not", async () => {
		const cases: [string, boolean][] = [
			["lib/payments.php", true],
			["src/routes/+page.svelte", true],
			["main.py", true],
			["README.md", false],
			["docs/plans/x.md", false],
			["CHANGELOG.md", false],
		];
		for (const [path, expected] of cases) {
			const f = tmpFile("p.txt", path);
			expect(JSON.parse((await build(["is-code-path", f])).stdout).is_code).toBe(expected);
		}
	});
});

describe("scan-fixes: Tier-3 fix->blame emission on a constructed repo", () => {
	let repo: string;
	let outDir: string;
	let featSha: string;

	async function git(args: string[], cwd: string, env: Record<string, string> = {}) {
		const proc = Bun.spawn(["git", ...args], {
			cwd,
			env: { ...process.env, ...env },
			stdout: "pipe",
			stderr: "pipe",
		});
		const out = await new Response(proc.stdout).text();
		await new Response(proc.stderr).text();
		await proc.exited;
		return out.trim();
	}

	beforeAll(async () => {
		repo = mkdtempSync(join(tmpdir(), "cmre-fixrepo-"));
		outDir = mkdtempSync(join(tmpdir(), "cmre-fixout-"));
		const id = { GIT_AUTHOR_NAME: "T", GIT_AUTHOR_EMAIL: "t@e", GIT_COMMITTER_NAME: "T", GIT_COMMITTER_EMAIL: "t@e" };
		await git(["init", "-q", "-b", "main"], repo);
		// the feature that introduces the (later-buggy) code lines -> the culprit
		writeFileSync(join(repo, "calc.php"), "<?php\nfunction r($x){ return round($x); }\n// end\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "feat(calc): add rounding helper"], repo, id);
		featSha = await git(["rev-parse", "HEAD"], repo);
		// the fix that modifies a line the feature introduced -> blames back to featSha
		writeFileSync(join(repo, "calc.php"), "<?php\nfunction r($x){ return round($x, 2); }\n// end\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "fix(calc): wrong rounding precision"], repo, id);
		// a docs-only fix that must NOT enter a code-review corpus
		writeFileSync(join(repo, "README.md"), "typo fixed\n");
		await git(["add", "."], repo);
		await git(["commit", "-q", "-m", "fix(docs): typo"], repo, id);
	});

	test("emits a blame-attributed entry whose culprit is the introducing feature; docs fix excluded", async () => {
		const { stdout, exitCode } = await build(["scan-fixes", "--repo", repo, "--out-dir", outDir]);
		expect(exitCode).toBe(0);
		const out = JSON.parse(stdout);
		expect(out.stats.fixes_scanned).toBe(2); // both fix commits walked
		expect(out.entries).toHaveLength(1); // only the code fix yields a culprit

		const e = out.entries[0];
		expect(e.ground_truth.attribution).toBe("blame");
		expect(e.ground_truth.trust).toBe("needs_confirmation");
		expect(e.ground_truth.culprit_sha).toBe(featSha); // blamed back to the feature
		expect(e.ground_truth.bug).toContain("rounding"); // the fix subject = the bug to catch
		expect(existsSync(e.path)).toBe(true);
	});

	test("every emitted blame entry passes the conformance gate", async () => {
		const { stdout } = await build(["scan-fixes", "--repo", repo, "--out-dir", outDir]);
		const out = JSON.parse(stdout);
		for (const e of out.entries) {
			const f = tmpFile("e.json", JSON.stringify(e));
			expect(JSON.parse((await build(["validate-entry", f])).stdout).valid).toBe(true);
		}
	});
});
