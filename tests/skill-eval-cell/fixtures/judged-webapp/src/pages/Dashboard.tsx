import { useEffect, useState } from "react"
import { PageLoader } from "../components/PageLoader"

export function DashboardPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => { fetch("/api/dashboard").then(() => setReady(true)) }, [])
  if (!ready) return <PageLoader />
  return <main className="dashboard">Dashboard</main>
}
