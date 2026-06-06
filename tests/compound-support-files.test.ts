import { readFile } from "fs/promises";
import path from "path";
import { describe, expect, test } from "bun:test";
import { load } from "js-yaml";

const PLUGIN_ROOT = path.join(process.cwd(), "plugins", "compound-engineering", "skills");
const AGENTS_ROOT = path.join(process.cwd(), ".agents", "skills", "ce-compound");

/**
 * Canonical copies live in ce-compound; mirrors must stay identical.
 *
 * U1/U2 added new reference files that must also stay in sync.
 */
const SHARED_SUPPORT_FILES = [
  "references/schema.yaml",
  "references/yaml-schema.md",
  "references/mode-matrix.md",
  "references/execution-timing.md",
  "references/platform-tools.md",
  "references/concepts-vocabulary.md",
  "assets/resolution-template.md",
];

/** U6: the four guardrail scripts must stay identical across copies. */
const SHARED_SCRIPTS = [
  "scripts/validate-frontmatter.py",
  "scripts/validate-schema.py",
  "scripts/check-duplicates.py",
  "scripts/validate-concepts.py",
];

const SKILLS_WITH_COPIES = ["ce-compound", "ce-compound-refresh"];

describe("ce-compound support file drift", () => {
  for (const file of SHARED_SUPPORT_FILES) {
    test(`${file} is identical across ${SKILLS_WITH_COPIES.join(", ")}`, async () => {
      const contents = await Promise.all(
        SKILLS_WITH_COPIES.map((skill) => readFile(path.join(PLUGIN_ROOT, skill, file), "utf8")),
      );

      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0]);
      }
    });
  }
});

describe("ce-compound script drift", () => {
  const SCRIPT_SKILLS = ["ce-compound", ".agents/skills/ce-compound"];
  for (const file of SHARED_SCRIPTS) {
    test(`${file} is identical across ${SCRIPT_SKILLS.join(", ")}`, async () => {
      const contents = await Promise.all(
        SCRIPT_SKILLS.map((skill) => readFile(path.join(process.cwd(), skill, file), "utf8")),
      );

      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0]);
      }
    });
  }
});

// Format-rendering refs (markdown-rendering.md, html-rendering.md) are
// byte-duplicated across ce-plan and ce-brainstorm. There is no cross-skill
// shared-file mechanism (see plugins/compound-engineering/AGENTS.md
// "Runtime vs Authoring Context"); both copies must stay identical so the
// agent renders artifacts the same way regardless of which skill composed
// them.
const RENDERING_SKILLS = ["ce-plan", "ce-brainstorm"];

/** Root scripts/ is a CWD-level copy of the validation scripts (R5 path fix).
 *  It must stay byte-identical to .agents/skills/ce-compound/scripts/
 *  so `python3 scripts/validate-*.py` resolves correctly from repo root.
 */
describe("root scripts/ drift against .agents canonical copy", () => {
  const ROOT_SCRIPTS = [
    "scripts/validate-frontmatter.py",
    "scripts/validate-schema.py",
    "scripts/check-duplicates.py",
    "scripts/validate-concepts.py",
  ];
  for (const file of ROOT_SCRIPTS) {
    test(`${file} matches .agents/skills/ce-compound/${file}`, async () => {
      const [root, agents] = await Promise.all([
        readFile(path.join(process.cwd(), file), "utf8"),
        readFile(path.join(AGENTS_ROOT, file), "utf8"),
      ]);
      expect(root).toBe(agents);
    });
  }
});
const RENDERING_REFS = ["references/markdown-rendering.md", "references/html-rendering.md"];

describe("format-rendering ref drift across ce-plan and ce-brainstorm", () => {
  for (const ref of RENDERING_REFS) {
    test(`${ref} is identical across ${RENDERING_SKILLS.join(", ")}`, async () => {
      const contents = await Promise.all(
        RENDERING_SKILLS.map((skill) => readFile(path.join(PLUGIN_ROOT, skill, ref), "utf8")),
      );

      for (let i = 1; i < contents.length; i++) {
        expect(contents[i]).toBe(contents[0]);
      }
    });
  }
});

/**
 * Regression tests for the YAML-safety quoting rule for array items.
 *
 * Array items in frontmatter fields like `symptoms:` that start with a YAML
 * reserved indicator (`, [, *, &, !, |, >, %, @, ?) or contain `: ` must be
 * wrapped in double quotes — otherwise strict YAML parsers reject the file.
 * See issue #606.
 */
describe("ce-compound YAML safety rule presence", () => {
  for (const skill of SKILLS_WITH_COPIES) {
    test(`${skill}/references/schema.yaml validation_rules includes YAML-safety entry`, async () => {
      const raw = await readFile(path.join(PLUGIN_ROOT, skill, "references/schema.yaml"), "utf8");
      const parsed = load(raw) as { validation_rules?: string[] } | null;
      expect(parsed).not.toBeNull();
      expect(Array.isArray(parsed?.validation_rules)).toBe(true);
      const hasSafetyRule = (parsed?.validation_rules ?? []).some((rule) =>
        /array.*(quote|reserved indicator)|reserved indicator.*quote|YAML[- ]safety/i.test(rule),
      );
      expect(hasSafetyRule).toBe(true);
    });

    test(`${skill}/references/yaml-schema.md contains YAML Safety Rules section`, async () => {
      const raw = await readFile(
        path.join(PLUGIN_ROOT, skill, "references/yaml-schema.md"),
        "utf8",
      );
      expect(/^##\s+YAML\s+Safety\s+Rules/im.test(raw)).toBe(true);
      // Concrete example stays present so the rule remains actionable.
      expect(raw).toMatch(/"`sudo dscacheutil/);
    });

    test(`${skill}/assets/resolution-template.md references YAML safety rules`, async () => {
      const raw = await readFile(
        path.join(PLUGIN_ROOT, skill, "assets/resolution-template.md"),
        "utf8",
      );
      expect(/YAML[- ]safety/i.test(raw)).toBe(true);
      expect(raw).toMatch(/yaml-schema\.md/);
    });
  }

  test("ce-compound/SKILL.md points at YAML Safety Rules in both frontmatter-writing spots", async () => {
    const raw = await readFile(path.join(PLUGIN_ROOT, "ce-compound", "SKILL.md"), "utf8");
    // Match the distinctive write-path pointer phrase, not generic yaml-schema.md
    // references (which also appear in the support-files list and inputs section).
    // Both Full-mode Phase 2 step 5 and Lightweight mode step 3 must carry the
    // pointer so dropping either one is caught.
    const pointer = /YAML[- ]safety\s+quoting\s+rule\s+for\s+array\s+items/gi;
    const pointerMatches = raw.match(pointer) ?? [];
    expect(pointerMatches.length).toBeGreaterThanOrEqual(2);

    // Each pointer must sit in the frontmatter-write step (step 5 of Full mode,
    // step 3 of Lightweight mode), not drift to an unrelated location. Both
    // steps carry the "YAML frontmatter" phrase adjacent to the pointer.
    const frontmatterAdjacent =
      raw.match(
        /YAML\s+frontmatter[\s\S]{0,400}?YAML[- ]safety\s+quoting\s+rule\s+for\s+array\s+items/gi,
      ) ?? [];
    expect(frontmatterAdjacent.length).toBeGreaterThanOrEqual(2);
  });

  test("ce-compound-refresh per-action-flows reference points at YAML-safety rules in the Replace flow", async () => {
    // The Replace Flow content lives in references/per-action-flows.md after the
    // Phase 4 extraction; SKILL.md keeps a stub that delegates to it.
    const raw = await readFile(
      path.join(PLUGIN_ROOT, "ce-compound-refresh", "references", "per-action-flows.md"),
      "utf8",
    );
    // Anchor to the Replace Flow section so a drifted or deleted pointer is
    // caught even if the phrase still appears elsewhere in the file.
    const replaceFlowMatch = raw.match(/##\s+Replace\s+Flow\b([\s\S]*?)(?=\n##\s+\w|$)/);
    expect(replaceFlowMatch).not.toBeNull();
    const replaceFlow = replaceFlowMatch?.[1] ?? "";
    expect(/YAML[- ]safety/i.test(replaceFlow)).toBe(true);
    expect(replaceFlow).toMatch(/yaml-schema\.md/);
  });
});

describe(".agents SKILL.md critical-structure alignment", () => {
  test(".agents skill file contains the required frontmatter", async () => {
    const raw = await readFile(path.join(AGENTS_ROOT, "SKILL.md"), "utf8");
    // Frontmatter block must be present and include the `ce-compound` marker.
    expect(raw.startsWith("---")).toBe(true);
    expect(raw).toMatch(/^name:\s*ce-compound/m);
    expect(raw).toMatch(/^description:/m);
    expect(raw).toMatch(/argument-hint:/m);
  });

  test(".agents skill file references platform-tools and mode-matrix", async () => {
    const raw = await readFile(path.join(AGENTS_ROOT, "SKILL.md"), "utf8");
    expect(raw).toMatch(/references\/platform-tools\.md/);
    expect(raw).toMatch(/references\/mode-matrix\.md/);
  });

  test("plugin SKILL.md references the new U7 references", async () => {
    const raw = await readFile(path.join(PLUGIN_ROOT, "ce-compound", "SKILL.md"), "utf8");
    expect(raw).toMatch(/references\/platform-tools\.md/);
    expect(raw).toMatch(/references\/execution-timing\.md/);
    expect(raw).toMatch(/references\/mode-matrix\.md/);
  });
});
