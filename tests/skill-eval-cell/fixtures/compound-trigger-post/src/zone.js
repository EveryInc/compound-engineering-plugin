export function fromZonedTime(local, zone) {
  const guess = new Date(`${local}Z`)
  const offset = new Date(guess.toLocaleString("en-US", { timeZone: zone })).getTime() - new Date(guess.toLocaleString("en-US", { timeZone: "UTC" })).getTime()
  return new Date(guess.getTime() - offset)
}
