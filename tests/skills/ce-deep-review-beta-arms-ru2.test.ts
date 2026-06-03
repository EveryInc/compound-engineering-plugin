import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, chmodSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// RU2 + RU3 cross-model harness behavior.
// RU2: gemini -> agy migration. agy is the non-codex arm but is macOS-ONLY (read-only floor is a
// macOS seatbelt) -> platform-gate + REPO_DIR plumbing + off-mac refusal.
// RU3: parallel-across-models in panel-critique.sh + --models semantics (default = all available;
// unavailable / off-platform arms warn-SKIP, never fatal).
// All pinned at the script level (mechanical -- runs current source, unlike SKILL.md prose which
// caches at session start).

const REPO = join(import.meta.dir, "..", "..");
const ENV_DETECT = join(REPO, "plugins/compound-engineering/skills/ce-deep-review-beta/scripts/env-detect.sh");
const PANEL = join(REPO, "scripts/eval/cross_model_review/panel-critique.sh");
const ARMS = join(REPO, "scripts/eval/cross_model_review/arms.py");

async function run(cmd: string[], env?: Record<string, string>) {
	const proc = Bun.spawn(cmd, { stdout: "pipe", stderr: "pipe", env: { ...process.env, ...(env ?? {}) } });
	const stdout = await new Response(proc.stdout).text();
	const stderr = await new Response(proc.stderr).text();
	const exitCode = await proc.exited;
	return { stdout, stderr, exitCode };
}

// A directory holding a `uname` stub that always reports the given OS, prepended to PATH so
// env-detect's `uname -s` sees it while real binaries (codex/gemini) still resolve.
function unameStubDir(osName: string): string {
	const dir = mkdtempSync(join(tmpdir(), "uname-stub-"));
	const stub = join(dir, "uname");
	writeFileSync(stub, `#!/bin/sh\necho ${osName}\n`);
	chmodSync(stub, 0o755);
	return dir;
}

function tmpDir(): string {
	return mkdtempSync(join(tmpdir(), "ru3-"));
}

// A throwaway plan doc so panel-critique has a real file to (not) send. The arms below all SKIP
// before any egress, so the content never leaves the machine.
function planFile(): string {
	const p = join(tmpDir(), "plan.md");
	writeFileSync(p, "# Tiny plan\n\nA risky migration with no rollback.\n");
	return p;
}

describe("RU2 env-detect: agy detection + macOS platform-gate", () => {
	test("emits codex + agy keys; gemini was retired from the skill", async () => {
		const { stdout, exitCode } = await run(["bash", ENV_DETECT]);
		expect(exitCode).toBe(0);
		const rec = JSON.parse(stdout);
		expect(rec).toHaveProperty("agy");
		expect(rec).toHaveProperty("codex");
		expect(rec).not.toHaveProperty("gemini");
	});

	test("off-darwin -> agy is 'unavailable' (platform-gated, never offered)", async () => {
		const stub = unameStubDir("Linux");
		const { stdout } = await run(["bash", ENV_DETECT], { PATH: `${stub}:${process.env.PATH}` });
		expect(JSON.parse(stdout).agy).toBe("unavailable");
	});

	test("on darwin -> agy is NOT 'unavailable' (it is gated only off-mac)", async () => {
		const stub = unameStubDir("Darwin");
		const { stdout } = await run(["bash", ENV_DETECT], { PATH: `${stub}:${process.env.PATH}` });
		expect(JSON.parse(stdout).agy).not.toBe("unavailable");
		expect(["ok", "unauthed", "missing"]).toContain(JSON.parse(stdout).agy);
	});
});

describe("RU2 panel-critique: default arms + REPO_DIR export", () => {
	const src = readFileSync(PANEL, "utf8");
	test("default model loop is codex + agy", () => {
		expect(src).toMatch(/models="codex agy"/);
	});
	test("exports CMRE_REPO_DIR resolved from the plan's repo root", () => {
		expect(src).toContain("export CMRE_REPO_DIR");
		expect(src).toMatch(/git -C "\$plan_dir" rev-parse --show-toplevel/);
	});
});

describe("RU2 arms.py: REPO_DIR honored + off-mac agy hard-guard", () => {
	test("_repo_root honors CMRE_REPO_DIR (reviewed plan's repo, not arms.py location)", async () => {
		const py = `import importlib.util,os
s=importlib.util.spec_from_file_location('arms',${JSON.stringify(ARMS)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
print(m._repo_root())`;
		const { stdout } = await run(["python3", "-c", py], { CMRE_REPO_DIR: "/tmp/some/plan/repo" });
		// realpath canonicalizes /tmp -> /private/tmp on macOS; assert the path ends with the override.
		expect(stdout.trim()).toMatch(/\/some\/plan\/repo$/);
	});

	test("run_invocation refuses the agy arm when the seatbelt prefix is empty (off-mac / missing template)", async () => {
		// Monkeypatch agy_sandbox_prefix to simulate the off-darwin / missing-template case, then
		// confirm run_invocation returns a refusal (status error) instead of running agy unfloored.
		const py = `import importlib.util,json
s=importlib.util.spec_from_file_location('arms',${JSON.stringify(ARMS)});m=importlib.util.module_from_spec(s);s.loader.exec_module(m)
m.agy_sandbox_prefix=lambda:([],None)
spec=m.build_invocation('b_isolated','agy','doc text','rubric text')
res=m.run_invocation(spec,5)
print(json.dumps({'status':res['status'],'refused':'refused' in res['stderr'],'findings':res['findings']}))`;
		const { stdout } = await run(["python3", "-c", py]);
		const res = JSON.parse(stdout);
		expect(res.status).toBe("error");
		expect(res.refused).toBe(true);
		expect(res.findings).toEqual([]);
	});
});

describe("RU3 panel-critique: parallel-across-models + --models semantics", () => {
	const src = readFileSync(PANEL, "utf8");

	test("forks one background subshell per model and waits on all", () => {
		expect(src).toMatch(/run_model\(\)/);
		expect(src).toMatch(/run_model "\$cli" &/);
		expect(src).toMatch(/for pid in \$pids; do wait "\$pid"; done/);
	});

	test("unavailable arms warn-skip (not fatal): two bogus arms -> exit 0, no records", async () => {
		const out = tmpDir();
		const { stdout, exitCode } = await run(["bash", PANEL, "--models", "bogusA,bogusB", planFile()], {
			CMRE_OUT_DIR: out,
		});
		expect(exitCode).toBe(0);
		expect(stdout).toMatch(/bogusA.*SKIP — bogusA not installed/);
		expect(stdout).toMatch(/bogusB.*SKIP — bogusB not installed/);
		expect(existsSync(join(out, "records", "bogusA__coherence.json"))).toBe(false);
	});

	test("agy off-macOS is SKIPped (floor is macOS-only), exit 0, no record", async () => {
		const stub = unameStubDir("Linux");
		const out = tmpDir();
		const { stdout, exitCode } = await run(["bash", PANEL, "--models", "agy", planFile()], {
			PATH: `${stub}:${process.env.PATH}`,
			CMRE_OUT_DIR: out,
		});
		expect(exitCode).toBe(0);
		expect(stdout).toMatch(/agy.*SKIP — agy is macOS-only/);
		expect(existsSync(join(out, "records", "agy__coherence.json"))).toBe(false);
	});
});
