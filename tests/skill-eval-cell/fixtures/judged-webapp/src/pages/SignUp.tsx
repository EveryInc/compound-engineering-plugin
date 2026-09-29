import { useEffect, useState } from "react"
import { PageLoader } from "../components/PageLoader"

// Sign-up flow: account details -> email verification -> workspace setup.
export function SignUpPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => { fetch("/api/signup/config").then(() => setReady(true)) }, [])
  if (!ready) return <PageLoader />
  return <main className="signup">Sign up</main>
}
