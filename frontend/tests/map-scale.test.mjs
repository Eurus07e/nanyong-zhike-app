import assert from 'node:assert/strict'
import test from 'node:test'

import { adjustMapScale, formatMapScale } from '../src/map-scale.ts'


test('adjusts the curriculum map scale in fixed steps and clamps both bounds', () => {
  assert.equal(adjustMapScale(1, -1), 0.9)
  assert.equal(adjustMapScale(0.9, 1), 1)
  assert.equal(adjustMapScale(1, 1), 1)
  assert.equal(adjustMapScale(0.7, -1), 0.7)
})


test('formats the curriculum map scale as a whole percentage', () => {
  assert.equal(formatMapScale(1.1), '110%')
})
