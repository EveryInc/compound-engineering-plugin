// Formats a month label for the monthly statement header.
export function monthLabel(date: Date): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
  return `${months[date.getMonth() + 1]} ${date.getFullYear()}`
}
