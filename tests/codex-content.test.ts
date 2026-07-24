import { describe, expect, test } from "bun:test"
import {
  normalizeCodexName,
  transformContentForCodex,
  type CodexInvocationTargets,
} from "../src/utils/codex-content"

describe("normalizeCodexName", () => {
  const cases = [
    { input: "Security Reviewer", expected: "security-reviewer" },
    { input: "  spaces  ", expected: "spaces" },
    { input: "foo/bar", expected: "foo-bar" },
    { input: "foo\\bar", expected: "foo-bar" },
    { input: "foo:bar", expected: "foo-bar" },
    { input: "foo bar", expected: "foo-bar" },
    { input: "foo\nbar", expected: "foo-bar" },
    { input: "a---b", expected: "a-b" },
    { input: "-leading-", expected: "leading" },
    { input: "", expected: "item" },
    { input: "   ", expected: "item" },
    { input: "!!!", expected: "item" },
    { input: "UPPER_CASE", expected: "upper_case" },
    { input: "foo.bar", expected: "foo-bar" },
    { input: "foo@bar", expected: "foo-bar" },
    { input: "éè", expected: "item" },
    { input: "aéb", expected: "a-b" },
    { input: " workflows:plan ", expected: "workflows-plan" },
  ]

  for (const { input, expected } of cases) {
    test(`normalizes ${JSON.stringify(input)} to ${JSON.stringify(expected)}`, () => {
      expect(normalizeCodexName(input)).toBe(expected)
    })
  }
})

describe("transformContentForCodex", () => {
  const emptyTargets: CodexInvocationTargets = {
    promptTargets: {},
    skillTargets: {},
  }

  describe("Task agent calls", () => {
    test("known agent with args becomes a custom-agent spawn", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task repo-researcher(find X)", targets)).toBe(
        "Spawn the custom agent `repo-researcher` with task: find X",
      )
    })

    test("known agent with zero args omits the task clause", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task repo-researcher()", targets)).toBe(
        "Spawn the custom agent `repo-researcher`",
      )
    })

    test("preserves leading list prefix", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("- Task repo-researcher(find X)", targets)).toBe(
        "- Spawn the custom agent `repo-researcher` with task: find X",
      )
    })

    test("unknown agent falls back to a skill invocation", () => {
      expect(transformContentForCodex("Task repo-researcher(find X)", emptyTargets)).toBe(
        "Use the $repo-researcher skill to: find X",
      )
    })

    test("namespaced agent matches on the last two segments", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "research-ce-repo-researcher": "research-ce-repo-researcher" },
      }
      expect(
        transformContentForCodex(
          "Task compound-engineering:research:ce-repo-researcher(find X)",
          targets,
        ),
      ).toBe("Spawn the custom agent `research-ce-repo-researcher` with task: find X")
    })

    test("namespaced agent matches on the final segment when no longer key exists", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "ce-repo-researcher": "ce-repo-researcher" },
      }
      expect(
        transformContentForCodex(
          "Task compound-engineering:research:ce-repo-researcher()",
          targets,
        ),
      ).toBe("Spawn the custom agent `ce-repo-researcher`")
    })

    test("namespaced unknown agent uses the final segment as the skill name", () => {
      expect(
        transformContentForCodex(
          "Task compound-engineering:research:unknown-agent(find X)",
          emptyTargets,
        ),
      ).toBe("Use the $unknown-agent skill to: find X")
    })

    test("unknown agent with zero args omits the task clause", () => {
      expect(transformContentForCodex("Task unknown-agent()", emptyTargets)).toBe(
        "Use the $unknown-agent skill",
      )
    })

    test("leaves uppercase agent names unchanged", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task Repo-Researcher(find X)", targets)).toBe(
        "Task Repo-Researcher(find X)",
      )
    })

    test("leaves calls missing the opening parenthesis", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task repo researcher(find X)", targets)).toBe(
        "Task repo researcher(find X)",
      )
    })

    test("leaves calls with a space before the parenthesis", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task repo-researcher (find X)", targets)).toBe(
        "Task repo-researcher (find X)",
      )
    })

    test("does not match Task calls that are not at the start of a line", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("inline Task repo-researcher(find X)", targets)).toBe(
        "inline Task repo-researcher(find X)",
      )
    })

    test("leaves calls with an unbalanced closing parenthesis", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task repo-researcher(find X", targets)).toBe(
        "Task repo-researcher(find X",
      )
    })

    test("stops args at the first closing parenthesis and leaves the rest intact", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(transformContentForCodex("Task repo-researcher(a(b))", targets)).toBe(
        "Spawn the custom agent `repo-researcher` with task: a(b)",
      )
    })
  })

  describe("slash commands", () => {
    test("known prompt target becomes /prompts:<target>", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: { "todo-resolve": "todo-resolve" },
        skillTargets: {},
      }
      expect(transformContentForCodex("Run /todo-resolve", targets)).toBe(
        "Run /prompts:todo-resolve",
      )
    })

    test("known skill target becomes a skill reference", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: { "ce-plan": "ce-plan" },
      }
      expect(transformContentForCodex("Run /ce-plan", targets)).toBe("Run the ce-plan skill")
    })

    test("unknown slash command defaults to /prompts:<normalized>", () => {
      expect(transformContentForCodex("Run /unknown-cmd", emptyTargets)).toBe(
        "Run /prompts:unknown-cmd",
      )
    })

    test("unknown slash commands are preserved when requested", () => {
      expect(
        transformContentForCodex("Run /unknown-cmd", emptyTargets, {
          unknownSlashBehavior: "preserve",
        }),
      ).toBe("Run /unknown-cmd")
    })

    test("leaves bare reserved path roots untouched", () => {
      const roots = ["dev", "tmp", "etc", "usr", "var", "bin", "home"]
      for (const root of roots) {
        const line = `config lives in /${root}.`
        expect(transformContentForCodex(line, emptyTargets)).toBe(line)
      }
    })

    test("leaves multi-segment absolute paths untouched", () => {
      expect(transformContentForCodex("See /usr/local/bin/tool", emptyTargets)).toBe(
        "See /usr/local/bin/tool",
      )
    })

    test("leaves URL paths untouched", () => {
      expect(
        transformContentForCodex("Run https://example.com/path", emptyTargets),
      ).toBe("Run https://example.com/path")
    })

    test("leaves slash-prefixed routes inside URL queries and fragments untouched", () => {
      const line =
        "See https://example.com/#/ce-plan or https://example.com?next=/unknown-cmd"
      expect(transformContentForCodex(line, emptyTargets)).toBe(line)
    })

    test("preserves full URL spans while transforming commands outside them", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: { "ce-work": "ce-work" },
      }
      expect(
        transformContentForCodex(
          "See https://example.com/#!/ce-plan or https://example.com?next=(/unknown-cmd, then /ce-work",
          targets,
        ),
      ).toBe(
        "See https://example.com/#!/ce-plan or https://example.com?next=(/unknown-cmd, then the ce-work skill",
      )
    })

    test("ignores slashes preceded by a word character", () => {
      expect(
        transformContentForCodex("paths like a/b and foo/bar", emptyTargets),
      ).toBe("paths like a/b and foo/bar")
    })

    test("handles multiple slash commands in one line", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: { "ce-plan": "ce-plan", "ce-work": "ce-work" },
      }
      expect(transformContentForCodex("Run /ce-plan, then /ce-work.", targets)).toBe(
        "Run the ce-plan skill, then the ce-work skill.",
      )
    })

    test("matches slash commands case-insensitively using normalized keys", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: { plan: "workflows-plan" },
        skillTargets: {},
      }
      expect(transformContentForCodex("Run /PLAN", targets)).toBe(
        "Run /prompts:workflows-plan",
      )
    })

    test("preserves underscores in command names", () => {
      expect(transformContentForCodex("Run /my_command", emptyTargets)).toBe(
        "Run /prompts:my_command",
      )
    })

    test("transforms slash commands inside parentheses", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: { plan: "plan" },
        skillTargets: {},
      }
      expect(transformContentForCodex("(see /plan)", targets)).toBe("(see /prompts:plan)")
    })

    test("transforms slash commands inside double quotes", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: { plan: "plan" },
        skillTargets: {},
      }
      expect(transformContentForCodex('href="/plan"', targets)).toBe('href="/prompts:plan"')
    })

    test("consumes a trailing colon with the command name", () => {
      expect(transformContentForCodex("Run /plan:", emptyTargets)).toBe(
        "Run /prompts:plan",
      )
    })

    test("transforms slash commands inside markdown links", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: { plan: "plan" },
        skillTargets: {},
      }
      expect(transformContentForCodex("[link](/plan)", targets)).toBe(
        "[link](/prompts:plan)",
      )
    })

    test("handles namespaced slash commands that map to skills", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: { "workflows-work": "ce-work" },
      }
      expect(transformContentForCodex("Run /workflows:work", targets)).toBe(
        "Run the ce-work skill",
      )
    })
  })

  describe("backticked agent names", () => {
    test("matches two-segment namespaced agents", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "research-ce-repo-researcher": "research-ce-repo-researcher" },
      }
      expect(transformContentForCodex("`research:ce-repo-researcher`", targets)).toBe(
        "custom agent `research-ce-repo-researcher`",
      )
    })

    test("matches three-segment namespaced agents", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "research-ce-repo-researcher": "research-ce-repo-researcher" },
      }
      expect(
        transformContentForCodex(
          "`compound-engineering:research:ce-repo-researcher`",
          targets,
        ),
      ).toBe("custom agent `research-ce-repo-researcher`")
    })

    test("does not match single-segment backticked agents", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "ce-repo-researcher": "ce-repo-researcher" },
      }
      expect(transformContentForCodex("`ce-repo-researcher`", targets)).toBe(
        "`ce-repo-researcher`",
      )
    })

    test("leaves four-segment backticked names unchanged", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "a-b-c": "a-b-c" },
      }
      expect(transformContentForCodex("`a:b:c:d`", targets)).toBe("`a:b:c:d`")
    })

    test("matches case-insensitively", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "research-ce-repo-researcher": "research-ce-repo-researcher" },
      }
      expect(transformContentForCodex("`Research:Ce-Repo-Researcher`", targets)).toBe(
        "custom agent `research-ce-repo-researcher`",
      )
    })
  })

  describe("@ agent references", () => {
    test("known @-references become custom agent mentions", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("@security-reviewer", targets)).toBe(
        "custom agent `security-reviewer`",
      )
    })

    test("unknown @-references become $skill skill", () => {
      expect(transformContentForCodex("@security-reviewer", emptyTargets)).toBe(
        "$security-reviewer skill",
      )
    })

    test("matches @-references case-insensitively", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("@Security-Reviewer", targets)).toBe(
        "custom agent `security-reviewer`",
      )
    })

    test("leaves @-mentions that are preceded by a word character", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("user@security-reviewer", targets)).toBe(
        "user@security-reviewer",
      )
    })

    test("leaves longer hyphenated agent-like tokens unchanged", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("@security-reviewer-helper", targets)).toBe(
        "@security-reviewer-helper",
      )
    })

    test("leaves agent-like tokens with a trailing digit unchanged", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("@security-reviewer2", targets)).toBe(
        "@security-reviewer2",
      )
    })

    test("leaves agent-like tokens with a trailing underscore unchanged", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("@security-reviewer_helper", targets)).toBe(
        "@security-reviewer_helper",
      )
    })

    test("still transforms @-mentions after a non-word character", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "security-reviewer": "security-reviewer" },
      }
      expect(transformContentForCodex("(see @security-reviewer)", targets)).toBe(
        "(see custom agent `security-reviewer`)",
      )
    })

    test("leaves @-mentions that lack the required suffix", () => {
      expect(transformContentForCodex("@user", emptyTargets)).toBe("@user")
    })

    test("leaves namespaced @-mentions", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: {},
        agentTargets: { "ce-security-reviewer": "ce-security-reviewer" },
      }
      expect(
        transformContentForCodex(
          "@compound-engineering:review:ce-security-reviewer",
          targets,
        ),
      ).toBe("@compound-engineering:review:ce-security-reviewer")
    })
  })

  describe("path rewrites", () => {
    test("rewrites .claude/ to .codex/", () => {
      expect(transformContentForCodex("Read .claude/config.local.md", emptyTargets)).toBe(
        "Read .codex/config.local.md",
      )
    })

    test("rewrites ~/.claude/ to ~/.codex/", () => {
      expect(
        transformContentForCodex("Read ~/.claude/config.local.md", emptyTargets),
      ).toBe("Read ~/.codex/config.local.md")
    })

    test("leaves .claude without a trailing slash", () => {
      expect(transformContentForCodex("Read .claude", emptyTargets)).toBe("Read .claude")
    })

    test("leaves .claude-plugin paths alone", () => {
      expect(
        transformContentForCodex(
          "Read .claude-plugin/marketplace.json",
          emptyTargets,
        ),
      ).toBe("Read .claude-plugin/marketplace.json")
    })

    test("leaves uppercase .CLAUDE/ alone", () => {
      expect(transformContentForCodex("Read .CLAUDE/config.md", emptyTargets)).toBe(
        "Read .CLAUDE/config.md",
      )
    })

    test("applies both home and general rewrite rules", () => {
      expect(
        transformContentForCodex("~/.claude/.claude/file.md", emptyTargets),
      ).toBe("~/.codex/.codex/file.md")
    })
  })

  describe("combined and edge-case behavior", () => {
    test("applies Task, slash, and path transforms in order", () => {
      const targets: CodexInvocationTargets = {
        promptTargets: {},
        skillTargets: { "ce-plan": "ce-plan" },
        agentTargets: { "repo-researcher": "repo-researcher" },
      }
      expect(
        transformContentForCodex(
          "Task repo-researcher(go) then run /ce-plan from ~/.claude/config.",
          targets,
        ),
      ).toBe(
        "Spawn the custom agent `repo-researcher` with task: go then run the ce-plan skill from ~/.codex/config.",
      )
    })

    test("degrades gracefully when targets are omitted", () => {
      expect(transformContentForCodex("Task repo-researcher(find X)")).toBe(
        "Use the $repo-researcher skill to: find X",
      )
      expect(transformContentForCodex("Run /unknown")).toBe("Run /prompts:unknown")
    })

    test("returns empty and whitespace-only bodies unchanged", () => {
      expect(transformContentForCodex("", emptyTargets)).toBe("")
      expect(transformContentForCodex("   ", emptyTargets)).toBe("   ")
    })
  })
})
