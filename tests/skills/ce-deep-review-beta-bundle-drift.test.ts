import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ce-deep-review-beta bundles a copy of the canonical cross-model harness (so the installed skill
// is self-contained per AGENTS.md). This is the CI-enforced drift gate: if the canonical files
// change (INCLUDING eval-only changes -- arms.py / panel-critique.sh are shared with the eval
// workflow) without re-running scripts/bundle-harness.sh, this fails. Equality is normalized
// (line endings + trailing whitespace) rather than raw bytes, which is brittle across editors.

const REPO = join(import.meta.dir, "..", "..");
const CANON = join(REPO, "scripts/eval/cross_model_review");
const BUNDLE = join(REPO, "plugins/compound-engineering/skills/ce-deep-review-beta/scripts");

const norm = (s: string) =>
	s.replace(/\r\n/g, "\n").split("\n").map((l) => l.replace(/[ \t]+$/, "")).join("\n").replace(/\n+$/, "\n");

// canonical (relative to CANON)  ->  bundled (relative to BUNDLE)
const FILES: [string, string][] = [
	["panel-critique.sh", "panel-critique.sh"],
	["arms.py", "arms.py"],
	["validation/agy-readonly.sb.tmpl", "validation/agy-readonly.sb.tmpl"],
];

describe("ce-deep-review-beta bundled harness is in sync with canonical (re-run bundle-harness.sh after canonical edits)", () => {
	for (const [canon, bundled] of FILES) {
		test(`${bundled} matches canonical`, () => {
			const c = norm(readFileSync(join(CANON, canon), "utf8"));
			const b = norm(readFileSync(join(BUNDLE, bundled), "utf8"));
			expect(b).toBe(c);
		});
	}
});
