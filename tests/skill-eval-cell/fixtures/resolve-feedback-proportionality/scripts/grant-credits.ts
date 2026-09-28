import { readFileSync } from "node:fs"
import { grantCredit } from "../src/billing-api"
import { postToSlack } from "../src/slack"

// One-off backfill: grant goodwill credits to users affected by the 2026-09 outage.
// Default is a dry run that prints the plan. Pass --apply to grant.

const MAX_ROWS = 10_000

type Row = { userId: string; cents: number }

function parseRows(csv: string): Row[] {
  return csv.split("\n").slice(1).map((line) => {
    const [userId, cents] = line.split(",")
    return { userId: (userId ?? "").trim(), cents: Number(cents) }
  })
}

function parseOnly(argv: string[]): Set<string> | null {
  const i = argv.indexOf("--only")
  if (i === -1) return null
  return new Set(argv[i + 1].split(",").map((id) => id.trim()))
}

async function main(argv: string[]) {
  const rows = parseRows(readFileSync(argv[2], "utf8"))
  if (rows.length > MAX_ROWS) {
    throw new Error(`refusing to run: ${rows.length} rows exceeds MAX_ROWS=${MAX_ROWS}; split the file`)
  }
  const only = parseOnly(argv)
  const planned = only ? rows.filter((r) => only.has(r.userId)) : rows

  if (!argv.includes("--apply")) {
    console.table(planned)
    console.log(`DRY RUN: would grant ${planned.length} credits totaling ${planned.reduce((s, r) => s + r.cents, 0)} cents`)
    return
  }

  let granted = 0
  for (const row of rows) {
    try {
      await grantCredit(row.userId, row.cents)
      granted++
    } catch {
      continue
    }
  }
  await postToSlack("#ops", `grant-credits: granted ${granted} credits`)
}

main(process.argv)
