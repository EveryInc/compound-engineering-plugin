// Immutable measurement harness. Prints one JSON object:
//   comparisons: element comparisons dedupe performed on the fixed workload
//   correct:     1 when the output matches the reference, else 0
const { dedupe } = require("../src/dedupe.js")

const items = []
let seed = 7
for (let i = 0; i < 2000; i++) {
  seed = (seed * 1103515245 + 12345) % 2147483648
  items.push(seed % 400)
}

let comparisons = 0
const got = dedupe(items, () => {
  comparisons++
})

const expected = []
const seen = new Set()
for (const item of items) {
  if (!seen.has(item)) {
    seen.add(item)
    expected.push(item)
  }
}
const correct = got.length === expected.length && got.every((v, i) => v === expected[i]) ? 1 : 0

console.log(JSON.stringify({ comparisons, correct }))
