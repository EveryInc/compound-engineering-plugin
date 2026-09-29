import { useEffect, useState } from "react"
import { PageLoader } from "../components/PageLoader"

export function LoginPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => { fetch("/api/login").then(() => setReady(true)) }, [])
  if (!ready) return <PageLoader />
  return <main className="login">Login</main>
}
