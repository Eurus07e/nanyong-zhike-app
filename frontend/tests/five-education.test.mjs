import assert from 'node:assert/strict'
import test from 'node:test'

import { formatDuration, moduleProgress, radarPoints, radarPolygon } from '../src/five-education.ts'


test('builds five finite radar points from values and per-axis maxima', () => {
  const points = radarPoints([2, 4, 6, 8, 10], [10, 10, 10, 10, 10], 100, 100, 80)

  assert.equal(points.length, 5)
  assert.deepEqual(points[0], { x: 100, y: 84 })
  assert.ok(points.every(({ x, y }) => Number.isFinite(x) && Number.isFinite(y)))
  assert.equal(radarPolygon(points).split(' ').length, 5)
})


test('keeps all-zero radar axes at the center', () => {
  assert.deepEqual(
    radarPoints([0, 0, 0, 0, 0], [0, 0, 0, 0, 0], 100, 100, 80),
    [
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
      { x: 100, y: 100 },
    ],
  )
})


test('does not fabricate progress for a zero requirement', () => {
  assert.equal(moduleProgress({ actualDuration: 3, requiredDuration: 0 }), null)
  assert.equal(moduleProgress({ actualDuration: 3, requiredDuration: 6 }), 0.5)
  assert.equal(moduleProgress({ actualDuration: 9, requiredDuration: 6 }), 1)
})


test('formats durations without noisy trailing zeroes', () => {
  assert.equal(formatDuration(8), '8')
  assert.equal(formatDuration(8.5), '8.5')
  assert.equal(formatDuration(0), '0')
})
