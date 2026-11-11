import { existsSync, lstatSync, readFileSync, readlinkSync, readdirSync } from "fs"
import path from "path"
import { describe, expect, test } from "bun:test"

// The docs site under site/ is a build layer over files that live elsewhere in
// the repo. These pins hold the invariants that a build alone does not prove:
// the symlinks point at the canonical sources, the domain file is exact, the
// site loads nothing third-party beyond what the theme ships, and the homepage
// derives its host and skill lists from repo data instead of hand-written names.

const root = process.cwd()
const site = path.join(root, "site")

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8")
}

describe("docs site scaffold", () => {
  test("symlinks adopt the canonical sources in place", () => {
    const expected: Record<string, string> = {
      "site/_guides": "../docs/guides",
      "site/assets": "../assets",
      "site/install.md": "../README.md",
      "site/upgrading.md": "../docs/install/upgrading.md",
    }
    for (const [link, target] of Object.entries(expected)) {
      const full = path.join(root, link)
      expect(lstatSync(full).isSymbolicLink()).toBe(true)
      expect(readlinkSync(full)).toBe(target)
    }
  })

  test("site is built for the every.to path, with no custom-domain CNAME", () => {
    const config = read("site/_config.yml")
    expect(config).toMatch(/^url: https:\/\/every\.to$/m)
    expect(config).toMatch(/^baseurl: \/compound-engineering$/m)
    expect(existsSync(path.join(site, "CNAME"))).toBe(false)
  })

  test("site config loads no analytics and no Google Fonts", () => {
    const config = read("site/_config.yml")
    for (const key of ["google_analytics", "gtag", "plausible", "fathom", "umami", "posthog"]) {
      expect(config).not.toContain(key)
    }
    expect(config).not.toMatch(/google_fonts_url:\s*https?:/)
    expect(config).toMatch(/edit_link:\s*\n\s*enabled:\s*false/)
  })

  test("homepage names no skill or host literally", () => {
    const index = read("site/index.md")
    const skills = new Set(
      readdirSync(path.join(root, "skills"), { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name),
    )
    // CSS class names like ce-home-section are fine; skill names are not.
    const tokens = index.match(/\bce-[a-z0-9-]+\b/g) ?? []
    expect(tokens.filter((token) => skills.has(token))).toEqual([])
    for (const host of ["Cursor", "Codex", "Kimi", "Cline", "Devin", "Copilot", "OpenCode"]) {
      expect(index).not.toContain(host)
    }
  })

  test("every skill directory has a guide the site will adopt", () => {
    const skills = readdirSync(path.join(root, "skills"), { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name !== "guides")
      .map((entry) => entry.name)
    const guides = new Set(readdirSync(path.join(site, "_guides")))
    for (const skill of skills) {
      expect(guides.has(`${skill}.md`)).toBe(true)
    }
  })
})
