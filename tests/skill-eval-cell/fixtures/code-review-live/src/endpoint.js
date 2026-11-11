export async function downloadLink(id, accountId, load, sign) {
  const record = await load(id)
  if (!record) throw Object.assign(new Error("Not found"), { status: 404 })
  return { url: await sign(record.id) }
}
