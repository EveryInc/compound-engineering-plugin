export function ArchiveButton({ projectId, onArchived }: { projectId: string; onArchived: () => void }) {
  async function archive() {
    const res = await fetch(`/api/projects/${projectId}/archive`, { method: "POST" })
    if (res.ok) onArchived()
  }
  return <button onClick={archive}>Archive project</button>
}
