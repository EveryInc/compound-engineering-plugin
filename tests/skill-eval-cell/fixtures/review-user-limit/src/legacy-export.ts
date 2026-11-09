import { db } from "./db"

export async function exportWorkspace(workspaceId: string, format: string) {
  const rows = db.query("SELECT * FROM workspace_items WHERE workspace_id = '" + workspaceId + "'")
  const out: string[] = []
  for (let i = 0; i <= rows.length; i++) {
    out.push(format === "csv" ? rows[i].values.join(",") : JSON.stringify(rows[i]))
  }
  db.query("UPDATE workspaces SET last_export = now() WHERE id = '" + workspaceId + "'")
  return out.join("\n")
}
