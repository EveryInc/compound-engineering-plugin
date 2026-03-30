import { describe, expect, test } from "bun:test"
import {
  resolveClaudeFamilyAlias,
  normalizeModelWithProvider,
  addProviderPrefix,
  CLAUDE_FAMILY_ALIASES,
} from "../src/utils/model"

describe("resolveClaudeFamilyAlias", () => {
  test("resolves bare aliases to full Claude model names", () => {
    expect(resolveClaudeFamilyAlias("haiku")).toBe("claude-haiku-4-5")
    expect(resolveClaudeFamilyAlias("sonnet")).toBe("claude-sonnet-4-6")
    expect(resolveClaudeFamilyAlias("opus")).toBe("claude-opus-4-6")
  })

  test("passes through non-alias model names unchanged", () => {
    expect(resolveClaudeFamilyAlias("claude-sonnet-4-20250514")).toBe("claude-sonnet-4-20250514")
    expect(resolveClaudeFamilyAlias("gpt-5.4")).toBe("gpt-5.4")
    expect(resolveClaudeFamilyAlias("anthropic/claude-opus")).toBe("anthropic/claude-opus")
  })
})

describe("addProviderPrefix", () => {
  test("prefixes Claude models with anthropic/", () => {
    expect(addProviderPrefix("claude-sonnet-4-6")).toBe("anthropic/claude-sonnet-4-6")
    expect(addProviderPrefix("claude-haiku-4-5")).toBe("anthropic/claude-haiku-4-5")
  })

  test("prefixes OpenAI models with openai/", () => {
    expect(addProviderPrefix("gpt-5.4")).toBe("openai/gpt-5.4")
    expect(addProviderPrefix("o3-mini")).toBe("openai/o3-mini")
  })

  test("prefixes Google models with google/", () => {
    expect(addProviderPrefix("gemini-2.0")).toBe("google/gemini-2.0")
  })

  test("prefixes Qwen models with qwen/", () => {
    expect(addProviderPrefix("qwen-max")).toBe("qwen/qwen-max")
    expect(addProviderPrefix("qwen-3.5-plus")).toBe("qwen/qwen-3.5-plus")
  })

  test("defaults unknown models to anthropic/ prefix", () => {
    expect(addProviderPrefix("some-model")).toBe("anthropic/some-model")
  })

  test("passes through already-prefixed models unchanged", () => {
    expect(addProviderPrefix("anthropic/claude-opus")).toBe("anthropic/claude-opus")
    expect(addProviderPrefix("openai/gpt-5.4")).toBe("openai/gpt-5.4")
    expect(addProviderPrefix("google/gemini-2.0")).toBe("google/gemini-2.0")
  })
})

describe("normalizeModelWithProvider", () => {
  test("resolves bare aliases and adds provider prefix", () => {
    expect(normalizeModelWithProvider("sonnet")).toBe("anthropic/claude-sonnet-4-6")
    expect(normalizeModelWithProvider("haiku")).toBe("anthropic/claude-haiku-4-5")
    expect(normalizeModelWithProvider("opus")).toBe("anthropic/claude-opus-4-6")
  })

  test("adds provider prefix to full Claude model names", () => {
    expect(normalizeModelWithProvider("claude-sonnet-4-20250514")).toBe("anthropic/claude-sonnet-4-20250514")
  })

  test("passes through already-prefixed models unchanged", () => {
    expect(normalizeModelWithProvider("anthropic/claude-opus")).toBe("anthropic/claude-opus")
    expect(normalizeModelWithProvider("google/gemini-2.0")).toBe("google/gemini-2.0")
  })
})

describe("exported constants", () => {
  test("CLAUDE_FAMILY_ALIASES covers all three tiers", () => {
    expect(Object.keys(CLAUDE_FAMILY_ALIASES)).toEqual(["haiku", "sonnet", "opus"])
  })
})
