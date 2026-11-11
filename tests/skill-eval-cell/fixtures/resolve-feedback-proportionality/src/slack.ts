export async function postToSlack(channel: string, text: string): Promise<void> {
  await fetch("https://slack.internal/post", { method: "POST", body: JSON.stringify({ channel, text }) })
}
