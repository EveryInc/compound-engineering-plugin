import { existsSync, readFileSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

const SKILL_DIR = path.join(
  process.cwd(),
  "skills/ce-worktree",
)
const SKILL_BODY = readFileSync(path.join(SKILL_DIR, "SKILL.md"), "utf8")

describe("ce-worktree SKILL.md", () => {
  // Issue #946: ce-worktree was re-architected from a script-based creator into
  // a portable isolation guardrail. There must be no bundled script (it was the
  // root cause of the #943/#764 path-resolution bug class) and no dependence on
  // ${CLAUDE_SKILL_DIR}, so the skill works verbatim on every target.
  test("ships no bundled script and no ${CLAUDE_SKILL_DIR} dependence", () => {
    expect(
      existsSync(path.join(SKILL_DIR, "scripts")),
      "ce-worktree must not bundle a scripts/ directory — it is now a portable inline-git guardrail (issue #946). A bundled script reintroduces the cross-platform path-resolution bug class (#943/#764).",
    ).toBe(false)
    expect(
      SKILL_BODY.includes("CLAUDE_SKILL_DIR"),
      "ce-worktree/SKILL.md must not reference ${CLAUDE_SKILL_DIR} — the guardrail uses inline git only, so it resolves on every platform without a skill-dir variable.",
    ).toBe(false)
    expect(
      SKILL_BODY.includes("worktree-manager.sh"),
      "ce-worktree/SKILL.md must not reference the removed worktree-manager.sh script.",
    ).toBe(false)
  })

  // The guardrail must be portable to every target, so it must NOT gate itself
  // to Claude only. (Absence of the worktree-manager.sh allowed-tools pin is
  // covered by the whole-file check above.)
  test("is portable: no ce_platforms gate", () => {
    const frontmatter = SKILL_BODY.match(/^---\n([\s\S]*?)\n---/)
    expect(frontmatter, "ce-worktree/SKILL.md must have YAML frontmatter").not.toBeNull()
    expect(
      /^ce_platforms:/m.test(frontmatter![1]),
      "ce-worktree/SKILL.md must not declare `ce_platforms` — the inline-git guardrail is portable to all targets (issue #946).",
    ).toBe(false)
  })

  // The core value of the skill is the isolation-discipline judgment. Guard the
  // three load-bearing behaviors so they cannot silently regress.
  test("detects existing isolation before creating a worktree", () => {
    expect(
      SKILL_BODY.includes("git rev-parse --git-common-dir"),
      "ce-worktree/SKILL.md must compare against --git-common-dir to detect an existing linked worktree (Step 0).",
    ).toBe(true)
    // Must compare RESOLVED ABSOLUTE paths, not raw `git rev-parse` output:
    // from a subdirectory of a normal checkout, --git-dir is absolute while
    // --git-common-dir may be relative, so a raw string compare gives a false
    // "already isolated". Guard the canonicalized form so that can't regress.
    expect(
      SKILL_BODY.includes("--absolute-git-dir"),
      "ce-worktree/SKILL.md must compare the resolved absolute git dir (`--absolute-git-dir`) so a subdirectory CWD in a normal checkout is not misread as an existing worktree.",
    ).toBe(true)
    expect(
      SKILL_BODY.includes("git rev-parse --show-superproject-working-tree"),
      "ce-worktree/SKILL.md must include the submodule guard (--show-superproject-working-tree) so a submodule is not mistaken for a worktree.",
    ).toBe(true)
    expect(
      /work in place/i.test(SKILL_BODY),
      "ce-worktree/SKILL.md must instruct the agent to work in place when already isolated, rather than nesting a worktree.",
    ).toBe(true)
  })

  test("prefers the harness's native worktree tool before the git fallback", () => {
    expect(
      /native worktree (primitive|tool)/i.test(SKILL_BODY),
      "ce-worktree/SKILL.md must instruct the agent to prefer the harness's native worktree tool before falling back to git (avoids phantom state).",
    ).toBe(true)
  })

  test("documents an inline git fallback under .worktrees with gitignore safety", () => {
    expect(
      SKILL_BODY.includes("git worktree add"),
      "ce-worktree/SKILL.md must document the inline `git worktree add` fallback.",
    ).toBe(true)
    expect(
      SKILL_BODY.includes("git check-ignore -q .worktrees/"),
      "ce-worktree/SKILL.md must probe `git check-ignore -q .worktrees/` WITH the trailing slash, so an existing directory-only `.worktrees/` ignore rule is honored and the skill doesn't redundantly dirty `.gitignore` (PR #948 review).",
    ).toBe(true)
  })

  // PR #948 review: the fallback's relative `.worktrees/` and `.gitignore`
  // paths resolve against the agent's CWD, which may be a subdirectory — so the
  // skill must anchor at the repo root first, or it creates `src/.worktrees/...`
  // and edits `src/.gitignore` instead of the repo-root ones.
  test("anchors the git fallback at the repo root before using relative paths", () => {
    expect(
      SKILL_BODY.includes('cd "$(git rev-parse --show-toplevel)"'),
      "ce-worktree/SKILL.md must `cd \"$(git rev-parse --show-toplevel)\"` in the git fallback so relative `.worktrees`/`.gitignore` paths resolve at the repo root, not a subdirectory CWD.",
    ).toBe(true)
    expect(
      /run from the repo root/i.test(SKILL_BODY),
      "ce-worktree/SKILL.md Step 2 must explicitly instruct running the fallback from the repo root.",
    ).toBe(true)
  })

  // PR #948 review: `git fetch origin <branch>` exits 128 with no `origin`
  // remote / a local-only base. The fetch must be non-fatal so the flow
  // continues to the local-ref fallback it claims to handle.
  test("treats the base-branch fetch as best-effort / non-fatal", () => {
    expect(
      /non-fatal|best-effort/i.test(SKILL_BODY),
      "ce-worktree/SKILL.md must mark the `git fetch` step non-fatal so an absent `origin` remote falls through to the local base ref instead of aborting.",
    ).toBe(true)
  })

  // PR #948 review: on a sandbox/permission failure the requested isolation was
  // not created. The skill must not silently fall back to the current checkout —
  // the user chose isolation specifically to avoid touching it.
  test("on a sandbox/permission failure, asks rather than silently using the current checkout", () => {
    expect(
      /work in the current (directory|checkout) instead/i.test(SKILL_BODY),
      "ce-worktree/SKILL.md must not instruct the agent to silently work in the current checkout on a sandbox failure — that defeats the isolation contract.",
    ).toBe(false)
    // The confirmation is blocking, so it must route through the platform's
    // blocking-question tool (AGENTS.md > Cross-Platform User Interaction),
    // not a vague "ask the user" that can degrade to a non-blocking prompt.
    expect(
      SKILL_BODY.includes("AskUserQuestion") && SKILL_BODY.includes("request_user_input"),
      "ce-worktree/SKILL.md must route the sandbox-failure confirmation through the platform's blocking question tool (name AskUserQuestion / request_user_input / ask_user), per AGENTS.md > Cross-Platform User Interaction, rather than a non-blocking 'ask the user'.",
    ).toBe(true)
  })
})
