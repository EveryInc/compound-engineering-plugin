// Runs inside a Convex Node action. The action stays open for the whole
// stream; Convex bills while idle on I/O and hard-kills the action at 10
// minutes, so the loop races a 570s soft deadline to leave time to fail the
// digest row cleanly.
export async function generateDigest(runId: string) {
  const row = await createGenerating(runId)
  const result = await streamText({ model: primary(), prompt: buildPrompt(row) })
  return completeDigest(row, result)
}
