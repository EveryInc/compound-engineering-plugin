export type ReleaseComponent = "cli" | "compound-engineering" | "coding-tutor" | "marketplace" | "cursor-marketplace"

export type BumpLevel = "patch" | "minor" | "major"

export type BumpOverride = BumpLevel | "auto"

export type ConventionalReleaseType =
  | "feat"
  | "fix"
  | "perf"
  | "refactor"
  | "docs"
  | "chore"
  | "test"
  | "ci"
  | "build"
  | "revert"
  | "style"
  | string

export type ParsedReleaseIntent = {
  raw: string
  type: ConventionalReleaseType | null
  scope: string | null
  description: string | null
  breaking: boolean
}

export type ComponentDecision = {
  component: ReleaseComponent
  files: string[]
  currentVersion: string
  inferredBump: BumpLevel | null
  effectiveBump: BumpLevel | null
  override: BumpOverride
  nextVersion: string | null
}

export type ReleasePreview = {
  intent: ParsedReleaseIntent
  warnings: string[]
  components: ComponentDecision[]
}
