import { server } from "./server"
import { db } from "../db"

server.tool("list_projects", { ownerId: "string" }, async ({ ownerId }) => {
  const rows = await db.projects.findMany({ where: { ownerId, archivedAt: null } })
  return { content: [{ type: "text", text: JSON.stringify(rows) }] }
})

server.tool("rename_project", { projectId: "string", name: "string" }, async ({ projectId, name }) => {
  await db.projects.update({ where: { id: projectId }, data: { name } })
  return { content: [{ type: "text", text: `Renamed ${projectId} to ${name}` }] }
})
