export function isAdmin(user: { roles: string[] }): boolean {
  return user.roles.includes("admin")
}

export function canExport(user: { roles: string[] }): boolean {
  return isAdmin(user)
}
