import assert from 'node:assert/strict'
import test from 'node:test'

import {
  filterFiveEducationActivities,
  formatActivityDate,
  formatDuration,
  moduleProgress,
  radarPoints,
  radarPolygon,
  sortFiveEducationActivities,
} from '../src/five-education.ts'


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


const activities = [
  {
    id: '2', title: '劳动实践', organizer: '后勤服务集团', location: '鼓楼校区',
    category: '劳', module: '基础实践', approvalStatus: '审核通过', reviewStatus: '已评价',
    recognitionStatus: '已提交', recognizedDuration: 2, activityStart: '2026-05-30T05:00:00Z',
  },
  {
    id: '1', title: '智能讲座', organizer: '新生学院', location: '仙林校区',
    category: '智', module: '', approvalStatus: '审核通过', reviewStatus: '未评价',
    recognitionStatus: '', recognizedDuration: 0, activityStart: '2026-04-22T00:00:00Z',
  },
]


test('filters activities across useful fields and status', () => {
  assert.deepEqual(filterFiveEducationActivities(activities, '后勤', 'all').map((item) => item.id), ['2'])
  assert.deepEqual(filterFiveEducationActivities(activities, '', 'recognized').map((item) => item.id), ['2'])
  assert.deepEqual(filterFiveEducationActivities(activities, '', 'pending-review').map((item) => item.id), ['1'])
})


test('sorts activities by time and title without mutating source', () => {
  assert.deepEqual(sortFiveEducationActivities(activities, 'time-asc').map((item) => item.id), ['1', '2'])
  assert.deepEqual(sortFiveEducationActivities(activities, 'time-desc').map((item) => item.id), ['2', '1'])
  assert.equal(activities[0].id, '2')
})


test('formats invalid upstream dates as a stable fallback', () => {
  assert.equal(formatActivityDate(null), '时间待上游确认')
  assert.equal(formatActivityDate('not-a-date'), '时间待上游确认')
  assert.match(formatActivityDate('2026-05-30T05:00:00Z'), /2026/)
})
