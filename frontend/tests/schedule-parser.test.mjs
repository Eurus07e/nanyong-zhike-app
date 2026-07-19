import assert from 'node:assert/strict'
import test from 'node:test'

import { isValidSchedulePayload, layoutScheduleSlots, parseSchedule } from '../src/utils.ts'

const course = (overrides = {}) => ({
  KCH: '00000030',
  JXBID: '2026202710000003006',
  JXBMC: '形势与政策06班',
  KCM: '形势与政策',
  SKJS: '张田田、王浩宇',
  XF: '.25',
  PKDWDM_DISPLAY: '马克思主义学院',
  KCFLDM_DISPLAY: '通修课程',
  ...overrides,
})

test('accepts only schedule payloads with an array of course objects', () => {
  assert.equal(isValidSchedulePayload({ rows: [] }), true)
  assert.equal(isValidSchedulePayload({ rows: [course()] }), true)
  assert.equal(isValidSchedulePayload([]), false)
  assert.equal(isValidSchedulePayload({}), false)
  assert.equal(isValidSchedulePayload({ rows: 'bad' }), false)
  assert.equal(isValidSchedulePayload({ rows: [null] }), false)
})

test('keeps comma-separated discrete weeks in one visible schedule slot', () => {
  const result = parseSchedule([course({
    ZCXQJCDD: '周一 7-8节 4周,8周,12周,16周 苏教D202',
  })])

  assert.equal(result.slots.length, 1)
  assert.equal(result.slots[0].day, '周一')
  assert.equal(result.slots[0].startPeriod, 7)
  assert.equal(result.slots[0].endPeriod, 8)
  assert.equal(result.slots[0].weeks, '4周,8周,12周,16周')
  assert.equal(result.slots[0].room, '苏教D202')
  assert.deepEqual(result.unrecognized, [])
})

test('parses supported day period week and room variants', () => {
  const cases = [
    ['星期三 第3至4节 第1至18周 教301', '周三', 3, 4, '第1至18周', '教301'],
    ['周五 5~7节 4-18周 馆3-203', '周五', 5, 7, '4-18周', '馆3-203'],
    ['周三 第9节 2-16周（双） 新教-107', '周三', 9, 9, '2-16周（双）', '新教-107'],
    ['周四 1-2节 4、8、12、16周', '周四', 1, 2, '4、8、12、16周', '地点待定'],
    ['周天 3节 3周 大礼堂', '周日', 3, 3, '3周', '大礼堂'],
    ['周二 3-4节 第4周 教室A', '周二', 3, 4, '第4周', '教室A'],
    ['周六 1-2节 第4周,第8周,第12周 教室B', '周六', 1, 2, '第4周,第8周,第12周', '教室B'],
    ['周一 1-2节 单周 教300', '周一', 1, 2, '单周', '教300'],
    ['周二 3-4节 双周 教301', '周二', 3, 4, '双周', '教301'],
    ['周三 5-6节 1-16周 （单） 教302', '周三', 5, 6, '1-16周 （单）', '教302'],
    ['周四 7-8节 1-16周 双周 教303', '周四', 7, 8, '1-16周 双周', '教303'],
    ['周一第1-2节 1-16周,A楼', '周一', 1, 2, '1-16周', 'A楼'],
    ['星期一第1至2节 1至16周；仙林A101', '周一', 1, 2, '1至16周', '仙林A101'],
    ['星期日 第6节', '周日', 6, 6, '周次待定', '地点待定'],
    ['周二 10－11节 教102', '周二', 10, 11, '周次待定', '教102'],
  ]

  for (const [raw, day, start, end, weeks, room] of cases) {
    const result = parseSchedule([course({ ZCXQJCDD: raw })])
    assert.equal(result.slots.length, 1, raw)
    assert.equal(result.slots[0].day, day, raw)
    assert.equal(result.slots[0].startPeriod, start, raw)
    assert.equal(result.slots[0].endPeriod, end, raw)
    assert.equal(result.slots[0].weeks, weeks, raw)
    assert.equal(result.slots[0].room, room, raw)
    assert.deepEqual(result.unrecognized, [], raw)
  }
})

test('splits only delimited schedule markers and retains internal commas', () => {
  const result = parseSchedule([course({
    ZCXQJCDD: '周一 1-2节 1-17周（单） 仙林A101；星期四 第3至4节 2-16周(双) 鼓楼B202',
  })])

  assert.deepEqual(result.slots.map((slot) => [slot.day, slot.weeks, slot.room]), [
    ['周一', '1-17周（单）', '仙林A101'],
    ['周四', '2-16周(双)', '鼓楼B202'],
  ])
  assert.deepEqual(result.unrecognized, [])
})

test('requires a valid period after weekday markers before splitting', () => {
  for (const locationSuffix of ['周一至周五开放', '周一 13节开放', '周一 4-3节开放']) {
    const raw = `周二 3-4节 1-18周 教学楼A,${locationSuffix}`
    const result = parseSchedule([course({ ZCXQJCDD: raw })])

    assert.equal(result.slots.length, 1, raw)
    assert.equal(result.slots[0].room, `教学楼A,${locationSuffix}`, raw)
    assert.deepEqual(result.unrecognized, [], raw)
  }

  const invalid = parseSchedule([course({ ZCXQJCDD: '周一至周五开放' })])
  assert.deepEqual(invalid.slots, [])
  assert.deepEqual(invalid.unrecognized[0].rawParts, ['周一至周五开放'])
})

test('rejects malformed week-looking text instead of treating it as a room', () => {
  const raw = '周四 7-8节 1-16周（奇） 教303'
  const result = parseSchedule([course({ ZCXQJCDD: raw })])

  assert.deepEqual(result.slots, [])
  assert.deepEqual(result.unrecognized[0].rawParts, [raw])
})

test('accounts for every course in slots or the unrecognized list', () => {
  const courses = [
    course({ JXBID: 'fixed', ZCXQJCDD: '周二 3-4节 1-18周 苏教A207' }),
    course({ JXBID: 'free', ZCXQJCDD: '自由时间  1-3周 自由地点' }),
    course({ JXBID: 'empty', ZCXQJCDD: '' }),
    course({ JXBID: 'invalid', ZCXQJCDD: '周三 13节 1-18周 教101' }),
    course({ JXBID: 'partial', ZCXQJCDD: '周日 9-10节 5周 大礼堂,自由时间 4-18周 自由地点' }),
  ]
  const result = parseSchedule(courses)
  const visible = new Set([
    ...result.slots.map((slot) => slot.course.JXBID),
    ...result.unrecognized.map((item) => item.course.JXBID),
  ])

  assert.deepEqual(visible, new Set(courses.map((item) => item.JXBID)))
  assert.equal(result.slots.some((slot) => slot.course.JXBID === 'partial'), true)
  const partial = result.unrecognized.find((item) => item.course.JXBID === 'partial')
  assert.deepEqual(partial.rawParts, ['自由时间 4-18周 自由地点'])
  const empty = result.unrecognized.find((item) => item.course.JXBID === 'empty')
  assert.deepEqual(empty.rawParts, ['未提供上课安排'])
})

test('retains an unrecognized prefix before a later free-time marker', () => {
  const result = parseSchedule([course({
    ZCXQJCDD: '固定片段,自由时间 1-3周 自由地点',
  })])

  assert.deepEqual(result.slots, [])
  assert.deepEqual(result.unrecognized[0].rawParts, [
    '固定片段',
    '自由时间 1-3周 自由地点',
  ])
})

test('deduplicates identical raw parts per course while preserving distinct parts', () => {
  const fixed = '周一 3-4节 1-18周 教101'
  const distinct = '周三 5-6节 1-18周 教102'
  const free = '自由时间 1-3周 自由地点'
  const result = parseSchedule([
    course({ JXBID: 'duplicate', ZCXQJCDD: `${fixed},${fixed},${distinct},${free},${free}` }),
    course({ JXBID: 'duplicate', ZCXQJCDD: `${fixed},${free}` }),
  ])

  assert.deepEqual(result.slots.map((slot) => slot.raw), [fixed, distinct])
  assert.equal(result.unrecognized.length, 1)
  assert.deepEqual(result.unrecognized[0].rawParts, [free])
})

test('places overlapping courses in separate stable lanes', () => {
  const parsed = parseSchedule([
    course({ JXBID: 'long', ZCXQJCDD: '周一 3-5节 1-18周 教101' }),
    course({ JXBID: 'short', ZCXQJCDD: '周一 4节 1-18周 教102' }),
    course({ JXBID: 'later', ZCXQJCDD: '周一 6-7节 1-18周 教103' }),
  ])
  const originalOrder = parsed.slots.map((slot) => slot.course.JXBID)
  const laidOut = layoutScheduleSlots(parsed.slots)
  const long = laidOut.find((slot) => slot.course.JXBID === 'long')
  const short = laidOut.find((slot) => slot.course.JXBID === 'short')
  const later = laidOut.find((slot) => slot.course.JXBID === 'later')

  assert.deepEqual([long.lane, long.laneCount], [0, 2])
  assert.deepEqual([short.lane, short.laneCount], [1, 2])
  assert.deepEqual([later.lane, later.laneCount], [0, 1])
  assert.deepEqual(parsed.slots.map((slot) => slot.course.JXBID), originalOrder)
  assert.equal('lane' in parsed.slots[0], false)
  assert.deepEqual(layoutScheduleSlots(parsed.slots), laidOut)
})
