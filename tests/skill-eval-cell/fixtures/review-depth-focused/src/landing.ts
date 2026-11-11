export interface BranchPolicy {
  status: "known" | "unknown"
  requiresPullRequest: boolean
  reason?: string
}

export interface LandingInput {
  policy: BranchPolicy
  instructionsRequirePullRequest: boolean
  operatorRequestedReview: boolean
}

export type LandingPath = "push-main" | "open-pr" | "blocked"

export function inspectBranchPolicy(protection: unknown, error?: string): BranchPolicy {
  if (error) {
    if (error.includes("Branch not protected")) {
      return { status: "known", requiresPullRequest: false }
    }
    return { status: "unknown", requiresPullRequest: true, reason: error }
  }
  const body = protection as { required_pull_request_reviews?: unknown } | null
  const requiresPullRequest = Boolean(body && body.required_pull_request_reviews)
  return { status: "known", requiresPullRequest }
}

export function decideLandingPath(input: LandingInput): { path: LandingPath; reasons: string[] } {
  const reasons: string[] = []
  if (input.policy.status === "unknown") {
    return { path: "blocked", reasons: ["branch policy could not be read"] }
  }
  if (input.policy.requiresPullRequest) reasons.push("branch protection requires a pull request")
  if (input.instructionsRequirePullRequest) reasons.push("repository instructions require a pull request")
  if (input.operatorRequestedReview) reasons.push("operator asked for review")
  if (reasons.length > 0) return { path: "open-pr", reasons }
  return { path: "push-main", reasons }
}
