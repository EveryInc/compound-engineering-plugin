import { useEffect, useState } from "react"
import { PageLoader } from "../components/PageLoader"

export function OnboardingPage() {
  const [ready, setReady] = useState(false)
  useEffect(() => { fetch("/api/onboarding").then(() => setReady(true)) }, [])
  if (!ready) return <PageLoader />
  return <main className="onboarding">Onboarding</main>
}
