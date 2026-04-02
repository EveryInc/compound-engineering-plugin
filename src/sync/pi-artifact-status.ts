import type { PiSyncArtifactStatus } from "./commands"

export function isUnsupportedPiSyncArtifactError(error: unknown): error is Error {
  return error instanceof Error && error.message.startsWith("Unsupported ")
}

export function classifyUnsupportedPiSyncStatus(message: string): PiSyncArtifactStatus {
  if (message.startsWith("Unsupported unresolved first-party qualified ref for Pi sync:")) {
    return "retryable"
  }

  if (message.startsWith("Unsupported foreign qualified Task ref for Pi sync:")) {
    return "blocked-by-policy"
  }

  return "unsupported-final"
}
