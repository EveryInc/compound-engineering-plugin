import { describe, expect, test } from "bun:test";
import path from "path";
import fs from "fs/promises";

const AGENTS_SKILL = path.join(process.cwd(), ".agents", "skills", "ce-compound");
const SCRIPTS_DIR = path.join(AGENTS_SKILL, "scripts");

async function runScript(
  scriptName: string,
  args: string[] = [],
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const scriptPath = path.join(SCRIPTS_DIR, scriptName);
  const proc = Bun.spawn(["python3", scriptPath, ...args], {
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout, stderr, exitCode };
}

async function writeTemp(content: string, suffix: string): Promise<string> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), `ce-compound-test-`));
  const filePath = path.join(tmpDir, suffix);
  await fs.writeFile(filePath, content);
  return filePath;
}

import os from "os";

// ---------------------------------------------------------------------------
// validate-frontmatter.py
// ---------------------------------------------------------------------------
describe("validate-frontmatter.py", () => {
  test("passes on a well-formed doc", async () => {
    const docPath = await writeTemp(
      '---\ntitle: "A good doc"\nmodule: test\nsymptoms:\n  - foo\n---\n\nBody here\n',
      "valid.md",
    );
    const scriptPath = path.join(SCRIPTS_DIR, "validate-frontmatter.py");
    const proc = Bun.spawn(["python3", scriptPath, docPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(0);
    expect(stdout).toContain("OK");
    expect(stderr).toBe("");
  });

  test("fails when frontmatter delimiter is missing", async () => {
    const docPath = await writeTemp("No frontmatter here\n", "bad.md");
    const scriptPath = path.join(SCRIPTS_DIR, "validate-frontmatter.py");
    const proc = Bun.spawn(["python3", scriptPath, docPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(stderr).toContain("frontmatter delimiter");
  });

  test("flags an unquoted colon value as unsafe", async () => {
    const docPath = await writeTemp(
      "---\ntitle: foo: bar\nmodule: test\n---\n\nBody\n",
      "unsafe.md",
    );
    const scriptPath = path.join(SCRIPTS_DIR, "validate-frontmatter.py");
    const proc = Bun.spawn(["python3", scriptPath, docPath], {
      stdout: "pipe",
      stderr: "pipe",
    });
    const stdout = await new Response(proc.stdout).text();
    const stderr = await new Response(proc.stderr).text();
    const exitCode = await proc.exited;
    expect(exitCode).toBe(1);
    expect(stderr).toContain("quote it");
  });
});

// ---------------------------------------------------------------------------
// validate-schema.py
// ---------------------------------------------------------------------------
describe("validate-schema.py", () => {
  test("passes on a complete valid doc", async () => {
    const docPath = await writeTemp(
      "---\nmodule: test\ndate: 2026-01-01\nproblem_type: best_practice\ncomponent: cli\nseverity: medium\ntags:\n  - alpha\n---\n\nBody\n",
      "valid.md",
    );
    const { exitCode, stdout, stderr } = await runScript("validate-schema.py", [docPath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("OK");
    expect(stderr).toBe("");
  });

  test("reports a missing required field", async () => {
    const docPath = await writeTemp(
      "---\ndate: 2026-01-01\nproblem_type: best_practice\ncomponent: cli\nseverity: medium\n---\n\nBody\n",
      "missing.md",
    );
    const { exitCode, stderr } = await runScript("validate-schema.py", [docPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("missing required field");
    expect(stderr).toContain("module");
  });

  test("rejects an invalid component enum", async () => {
    const docPath = await writeTemp(
      "---\nmodule: test\ndate: 2026-01-01\nproblem_type: best_practice\ncomponent: rails_model\nseverity: medium\n---\n\nBody\n",
      "enum.md",
    );
    const { exitCode, stderr } = await runScript("validate-schema.py", [docPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not in allowed enum values");
  });

  test("rejects a malformed date", async () => {
    const docPath = await writeTemp(
      "---\nmodule: test\ndate: 2026/01/01\nproblem_type: best_practice\ncomponent: cli\nseverity: medium\n---\n\nBody\n",
      "date.md",
    );
    const { exitCode, stderr } = await runScript("validate-schema.py", [docPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("YYYY-MM-DD");
  });

  test("rejects symptoms outside 1-5 bounds", async () => {
    const docPath = await writeTemp(
      "---\nmodule: test\ndate: 2026-01-01\nproblem_type: build_error\ncomponent: cli\nseverity: medium\nsymptoms:\n  - one\n  - two\n  - three\n  - four\n  - five\n  - six\nroot_cause: missing_index\nresolution_type: code_fix\n---\n\nBody\n",
      "symptoms.md",
    );
    const { exitCode, stderr } = await runScript("validate-schema.py", [docPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("maximum 5 allowed");
  });
});

// ---------------------------------------------------------------------------
// check-duplicates.py
// ---------------------------------------------------------------------------
describe("check-duplicates.py", () => {
  test("outputs valid JSON array with ranked candidates", async () => {
    const docPath = await writeTemp(
      "---\ntitle: N plus one\nmodule: test\ndate: 2026-01-01\nproblem_type: performance_issue\ncomponent: cli\nseverity: medium\ntags:\n  - performance\n  - rails\n---\n\nBody\n",
      "target.md",
    );
    const { exitCode, stdout, stderr } = await runScript("check-duplicates.py", [docPath]);
    expect(exitCode).toBe(0);
    expect(stderr).toBe("");
    const parsed = JSON.parse(stdout);
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed.length).toBeGreaterThanOrEqual(0);
    if (parsed.length > 0) {
      expect(parsed[0]).toHaveProperty("path");
      expect(typeof parsed[0].path).toBe("string");
      expect(parsed[0]).toHaveProperty("score");
      expect(typeof parsed[0].score).toBe("number");
      expect(parsed[0]).toHaveProperty("matched_by");
      expect(Array.isArray(parsed[0].matched_by)).toBe(true);
    }
  });

  test("excludes the target file from its own candidate list", async () => {
    const docPath = await writeTemp(
      "---\ntitle: N plus one queries fix\ndate: 2026-01-01\nproblem_type: performance_issue\ncomponent: cli\nseverity: medium\ntags:\n  - performance\n---\n\nBody\n",
      "self.md",
    );
    const { stdout } = await runScript("check-duplicates.py", [docPath]);
    const parsed = JSON.parse(stdout);
    const selfHit = parsed.find((c: { path: string }) => c.path === docPath);
    expect(selfHit).toBeUndefined();
  });

  test("candidates are sorted by descending score", async () => {
    const docPath = await writeTemp(
      "---\ntitle: N plus one queries\ndate: 2026-01-01\nproblem_type: performance_issue\ncomponent: cli\nseverity: medium\ntags:\n  - performance\n---\n\nBody\n",
      "rank.md",
    );
    const { stdout } = await runScript("check-duplicates.py", [docPath]);
    const parsed = JSON.parse(stdout);
    if (parsed.length > 1) {
      for (let i = 1; i < parsed.length; i++) {
        expect(parsed[i - 1].score).toBeGreaterThanOrEqual(parsed[i].score);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// validate-concepts.py
// ---------------------------------------------------------------------------
describe("validate-concepts.py", () => {
  test("passes on a structurally valid CONCEPTS.md", async () => {
    const conceptsPath = await writeTemp(
      "# Concepts\n\n## Foo\n### Avoid\nShort def.\n\n## Bar\n### Synonym\nShort def.\n\n## Relationships\n\n## Flagged ambiguities\n",
      "concepts.md",
    );
    const { exitCode, stdout, stderr } = await runScript("validate-concepts.py", [conceptsPath]);
    expect(exitCode).toBe(0);
    expect(stdout).toContain("structure valid");
    expect(stderr).toBe("");
  });

  test("fails when missing the Concepts heading", async () => {
    const conceptsPath = await writeTemp(
      "## Foo\n### Avoid\nShort def.\n\n## Flagged ambiguities\n",
      "bad.md",
    );
    const { exitCode, stderr } = await runScript("validate-concepts.py", [conceptsPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("# Concepts");
  });

  test("reports a missing subsection under an entry", async () => {
    const conceptsPath = await writeTemp(
      "# Concepts\n\n## Foo\nShort def with no subsection at all.\n\n## Flagged ambiguities\n",
      "subsection.md",
    );
    const { exitCode, stderr } = await runScript("validate-concepts.py", [conceptsPath]);
    expect(exitCode).toBe(1);
    expect(stderr).toContain("no ### subsection");
  });
});
