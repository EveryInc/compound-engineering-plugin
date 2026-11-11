import { readFileSync } from "node:fs"

// One-off: move tickets from the retired "billing-v1" label to "billing".
// Default is a dry run that prints the plan. Pass --apply to write.

type Row = { ticketId: string }

async function setLabel(ticketId: string): Promise<void> {
  const res = await fetch(`https://support.internal/api/tickets/${ticketId}/labels`, {
    method: "PUT",
    body: JSON.stringify({ labels: ["billing"] }),
  })
  if (!res.ok) throw new Error(`relabel failed for ${ticketId}: ${res.status}`)
}

async function main(argv: string[]) {
  const rows: Row[] = readFileSync(argv[2], "utf8").trim().split("\n").slice(1).map((l) => ({ ticketId: l.trim() }))
  if (!argv.includes("--apply")) {
    console.log(`DRY RUN: would relabel ${rows.length} tickets`)
    for (const r of rows) console.log(r.ticketId)
    return
  }
  for (const [i, r] of rows.entries()) {
    await setLabel(r.ticketId)
    console.log(`${i + 1}/${rows.length} ${r.ticketId}`)
  }
}

main(process.argv)
