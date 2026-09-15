export type Role = "owner" | "admin" | "member" | "guest"

export interface Membership {
  userId: string
  workspaceId: string
  role: Role
  suspended?: boolean
}

export interface AccessRequest {
  userId: string
  workspaceId: string
  action: "read" | "write" | "admin"
}

const WRITE_ROLES: Role[] = ["owner", "admin", "member"]
const ADMIN_ROLES: Role[] = ["owner", "admin"]

export function canAccessWorkspace(request: AccessRequest, memberships: Membership[]): boolean {
  const membership = memberships.find(
    (m) => m.userId === request.userId && m.workspaceId === request.workspaceId,
  )
  if (!membership) return request.action === "read"
  if (membership.suspended) return false
  if (request.action === "read") return true
  if (request.action === "write") return WRITE_ROLES.includes(membership.role)
  return ADMIN_ROLES.includes(membership.role)
}
