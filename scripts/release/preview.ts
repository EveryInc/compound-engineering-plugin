#!/usr/bin/env bun
import { buildReleasePreview } from "../../src/release/components"
import type { BumpOverride, ReleaseComponent } from "../../src/release/types"

function parseArgs(argv: string[]): {
  title: string
  files: string[]
  overrides: Partial<Record<ReleaseComponent, BumpOverride>>
  json: boolean
} {
  let title = ""
  const files: string[] = []
  const overrides: Partial<Record<ReleaseComponent, BumpOverride>> = {}
  let json = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--title") {
      title = argv[index + 1] ?? ""
      index += 1
      continue
    }
    if (arg === "--file") {
      const file = argv[index + 1]
      if (file) files.push(file)
      index += 1
      continue
    }
    if (arg === "--override") {
      const raw = argv[index + 1] ?? ""
      const [component, value] = raw.split("=")
      if (component && value) {
        overrides[component as ReleaseComponent] = value as BumpOverride
      }
      index += 1
      continue
    }
    if (arg === "--json") {
      json = true
    }
  }

  return { title, files, overrides, json }
}

function formatPreview(preview: Awaited<ReturnType<typeof buildReleasePreview>>): string {
  const lines: string[] = []
  lines.push(`Release intent: ${preview.intent.raw || "(missing title)"}`)
  if (preview.intent.type) {
    lines.push(
      `Parsed as: type=${preview.intent.type}${preview.intent.scope ? `, scope=${preview.intent.scope}` : ""}${preview.intent.breaking ? ", breaking=true" : ""}`,
    )
  }

  if (preview.warnings.length > 0) {
    lines.push("", "Warnings:")
    for (const warning of preview.warnings) {
      lines.push(`- ${warning}`)
    }
  }

  if (preview.components.length === 0) {
    lines.push("", "No releasable components detected.")
    return lines.join("\n")
  }

  lines.push("", "Components:")
  for (const component of preview.components) {
    lines.push(`- ${component.component}`)
    lines.push(`  current: ${component.currentVersion}`)
    lines.push(`  inferred bump: ${component.inferredBump ?? "none"}`)
    lines.push(`  override: ${component.override}`)
    lines.push(`  effective bump: ${component.effectiveBump ?? "none"}`)
    lines.push(`  next: ${component.nextVersion ?? "unchanged"}`)
    lines.push(`  files: ${component.files.join(", ")}`)
  }

  return lines.join("\n")
}

const args = parseArgs(process.argv.slice(2))
const preview = await buildReleasePreview({
  title: args.title,
  files: args.files,
  overrides: args.overrides,
})

if (args.json) {
  console.log(JSON.stringify(preview, null, 2))
} else {
  console.log(formatPreview(preview))
}
