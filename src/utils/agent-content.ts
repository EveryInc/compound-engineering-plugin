export function composeAgentBody(options: {
  body: string
  fallback: string
  capabilities?: string[]
}): string {
  const sections: string[] = []

  if (options.capabilities && options.capabilities.length > 0) {
    sections.push(
      `## Capabilities\n${options.capabilities.map((capability) => `- ${capability}`).join("\n")}`,
    )
  }

  const body = options.body.trim()
  sections.push(body.length > 0 ? body : options.fallback)

  return sections.join("\n\n")
}

export function normalizeToolSpecifier(tool: string): string {
  return tool.split("(", 1)[0]?.trim().toLowerCase() ?? ""
}

export function mapToolSpecifiers(
  tools: string[] | undefined,
  mapping: Record<string, string>,
): { mappedTools: string[] | undefined; unmappedTools: string[] } {
  if (!tools || tools.length === 0) {
    return { mappedTools: undefined, unmappedTools: [] }
  }

  const mapped: string[] = []
  const unmapped: string[] = []
  for (const tool of tools) {
    const mappedTool = mapping[normalizeToolSpecifier(tool)]
    if (!mappedTool) {
      if (!unmapped.includes(tool)) unmapped.push(tool)
      continue
    }
    if (mapped.includes(mappedTool)) continue
    mapped.push(mappedTool)
  }

  return {
    mappedTools: mapped.length > 0 ? mapped : undefined,
    unmappedTools: unmapped,
  }
}

export function formatToolMappingWarning(options: {
  sourceTools: string[]
  unmappedTools: string[]
  target: string
  fallback: string
}): string {
  if (options.unmappedTools.length === options.sourceTools.length) {
    return `Warning: ${options.target} has no mapping for Claude agent tools [${options.sourceTools.join(", ")}]. ${options.fallback}`
  }

  return `Warning: ${options.target} cannot preserve Claude agent tools [${options.unmappedTools.join(", ")}] from [${options.sourceTools.join(", ")}]. ${options.fallback}`
}

export function resolveStructuredAgentTools(options: {
  sourceTools: string[] | undefined
  mappedTools: string[] | undefined
  unmappedTools: string[]
  target: string
}): string[] {
  if (!options.sourceTools || options.sourceTools.length === 0) {
    return ["*"]
  }

  if (options.unmappedTools.length === 0 && options.mappedTools && options.mappedTools.length > 0) {
    return options.mappedTools
  }

  console.warn(
    formatToolMappingWarning({
      sourceTools: options.sourceTools,
      unmappedTools: options.unmappedTools,
      target: options.target,
      fallback: 'Falling back to ["*"] so the converted agent remains usable.',
    }),
  )
  return ["*"]
}
