export function slugFor(name) {
  return name.trim().toLowerCase().replaceAll(" ", "-")
}
