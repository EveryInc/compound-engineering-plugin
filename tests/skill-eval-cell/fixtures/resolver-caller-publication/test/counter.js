import assert from 'node:assert/strict'
import { test } from 'node:test'
import { increment } from '../src/counter.js'

test('increment adds exactly one, including at zero and negative values', () => {
  for (const value of [-2, 0, 5]) assert.equal(increment(value), value + 1)
})
