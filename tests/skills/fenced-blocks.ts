export type FencedBashBlock = { line: number; body: string }

/**
 * Extract ```bash fenced blocks from markdown, handling fences indented inside markdown
 * lists (the opening indent is stripped from each body line and the closing fence must
 * match that same indent). `line` is the 1-based line of the opening fence.
 */
export function extractBashBlocks(markdown: string): FencedBashBlock[] {
  const blocks: FencedBashBlock[] = []
  const lines = markdown.split("\n")
  for (let i = 0; i < lines.length; i++) {
    const open = /^(\s*)```bash\s*$/.exec(lines[i]!)
    if (!open) continue
    const indent = open[1]!
    const close = new RegExp(`^${indent}\`\`\`\\s*$`)
    const start = i
    const body: string[] = []
    i++
    while (i < lines.length && !close.test(lines[i]!)) {
      const ln = lines[i]!
      body.push(ln.startsWith(indent) ? ln.slice(indent.length) : ln)
      i++
    }
    blocks.push({ line: start + 1, body: body.join("\n") })
  }
  return blocks
}
