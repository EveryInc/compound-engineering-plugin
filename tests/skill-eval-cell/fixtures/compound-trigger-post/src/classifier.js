export async function askClassifier(question, text) {
  const res = await fetch(process.env.CLASSIFIER_URL, { method: "POST", body: JSON.stringify({ question, text }) })
  return res.json()
}
