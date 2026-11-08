import { db } from "../db"
import { requireOwner } from "../auth"

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const user = await requireOwner(req, params.id)
  await db.projects.update({ where: { id: params.id }, data: { archivedAt: new Date(), archivedBy: user.id } })
  return Response.json({ ok: true })
}
