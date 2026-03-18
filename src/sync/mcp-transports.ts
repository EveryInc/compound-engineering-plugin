import type { ClaudeMcpServer } from "../types/claude"

function getTransportType(server: ClaudeMcpServer): string {
  return server.type?.toLowerCase().trim() ?? ""
}

export function hasExplicitSseTransport(server: ClaudeMcpServer): boolean {
  const type = getTransportType(server)
  return type.includes("sse")
}

export function hasExplicitHttpTransport(server: ClaudeMcpServer): boolean {
  const type = getTransportType(server)
  return type.includes("http") || type.includes("streamable")
}

export function hasExplicitRemoteTransport(server: ClaudeMcpServer): boolean {
  return hasExplicitSseTransport(server) || hasExplicitHttpTransport(server)
}
