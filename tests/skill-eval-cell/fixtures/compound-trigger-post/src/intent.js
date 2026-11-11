import { askClassifier } from "./classifier.js"

const HOWTO_HINT = /\b(how|setup|set up|configure|enable|install)\b/i

// Ask the classifier only when the cheap hint matches; fall back to the hint when it is down.
export async function isHowToQuery(query, run) {
  if (run.howTo !== undefined) return run.howTo
  if (!HOWTO_HINT.test(query)) return (run.howTo = false)
  try {
    const { probability } = await askClassifier("Is the user asking how to set up or use a tool?", query)
    run.howTo = probability >= 0.62
  } catch {
    run.howTo = true
  }
  return run.howTo
}
