import type { AcademicProfile, Program, ProgramCourse, ScheduleCourse } from './types'

export const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
export const periods = [
  { key: 1, label: '第1节', time: '08:00-08:50' },
  { key: 2, label: '第2节', time: '09:00-09:50' },
  { key: 3, label: '第3节', time: '10:10-11:00' },
  { key: 4, label: '第4节', time: '11:10-12:00' },
  { key: 5, label: '第5节', time: '14:00-14:50' },
  { key: 6, label: '第6节', time: '15:00-15:50' },
  { key: 7, label: '第7节', time: '16:10-17:00' },
  { key: 8, label: '第8节', time: '17:10-18:00' },
  { key: 9, label: '第9节', time: '18:30-19:20' },
  { key: 10, label: '第10节', time: '19:30-20:20' },
  { key: 11, label: '第11节', time: '20:30-21:20' },
  { key: 12, label: '第12节', time: '21:30-22:20' },
] as const

export type ScheduleSlot = {
  day: typeof weekdays[number]
  startPeriod: number
  endPeriod: number
  weeks: string
  room: string
  raw: string
  course: ScheduleCourse
}

export type UnrecognizedSchedule = {
  course: ScheduleCourse
  rawParts: string[]
}

export type ScheduleParseResult = {
  slots: ScheduleSlot[]
  unrecognized: UnrecognizedSchedule[]
}

export type SchedulePayload = { rows: ScheduleCourse[] }

export function isValidSchedulePayload(value: unknown): value is SchedulePayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const rows = (value as { rows?: unknown }).rows
  return Array.isArray(rows) && rows.every((row) =>
    row !== null && typeof row === 'object' && !Array.isArray(row)
  )
}

const scheduleMarkerPattern = /(?:周|星期)[一二三四五六日天]|自由时间/g
const scheduleDayPeriodPattern = /^(?:周|星期)([一二三四五六日天])\s*第?\s*(\d{1,2})(?:\s*(?:-|至)\s*第?\s*(\d{1,2}))?\s*节\s*/
const scheduleWeekPattern = /^((?:(?:第?\s*\d{1,2}\s*(?:-|至)\s*第?\s*\d{1,2}周|第?\s*\d{1,2}周(?:\s*[,，、]\s*第?\s*\d{1,2}周)*|第?\s*\d{1,2}(?:\s*[,，、]\s*第?\s*\d{1,2})+周)(?:\s*(?:[（(]\s*[单双](?:周)?\s*[）)]|[单双]周))?|[单双]周))(?:(?:\s*[,，;；]\s*|\s+)(.*))?$/
const scheduleWeekLookingPattern = /^(?:第?\s*\d{1,2}(?:\s*(?:-|至|[,，、])\s*第?\s*\d{1,2})*\s*周|[单双]周)/

function normalizeSchedulePunctuation(value: string) {
  return value.replace(/[－—–~～]/g, '-')
}

function isValidSchedulePeriodRange(startPeriod: number, endPeriod: number) {
  return startPeriod >= 1 && startPeriod <= 12 && endPeriod >= startPeriod && endPeriod <= 12
}

function matchScheduleDayPeriod(value: string) {
  const normalized = normalizeSchedulePunctuation(value)
  const match = normalized.match(scheduleDayPeriodPattern)
  if (!match) return null
  const startPeriod = Number(match[2])
  const endPeriod = Number(match[3] || match[2])
  if (!isValidSchedulePeriodRange(startPeriod, endPeriod)) return null
  return {
    normalized,
    day: `周${match[1] === '天' ? '日' : match[1]}` as typeof weekdays[number],
    startPeriod,
    endPeriod,
    prefixLength: match[0].length,
  }
}

function splitScheduleParts(value: string) {
  const starts: number[] = []
  for (const match of value.matchAll(scheduleMarkerPattern)) {
    const index = match.index
    const hasSeparator = index === 0 || /[,，;；\n]\s*$/.test(value.slice(0, index))
    const hasValidPeriod = match[0] === '自由时间'
      || matchScheduleDayPeriod(value.slice(index)) !== null
    if (hasSeparator && hasValidPeriod) starts.push(index)
  }
  if (!starts.length) return [value.trim()].filter(Boolean)
  const prefix = value.slice(0, starts[0]).replace(/[,，;；\s]+$/, '').trim()
  const parts = starts.map((start, index) => value
    .slice(start, starts[index + 1] ?? value.length)
    .replace(/[,，;；\s]+$/, '')
    .trim())
  return (prefix ? [prefix, ...parts] : parts).filter(Boolean)
}

function parseSchedulePart(raw: string, course: ScheduleCourse): ScheduleSlot | null {
  const dayPeriod = matchScheduleDayPeriod(raw)
  if (!dayPeriod) return null
  const { day, endPeriod, normalized, prefixLength, startPeriod } = dayPeriod

  const tail = normalized.slice(prefixLength).trim()
  const weekMatch = tail.match(scheduleWeekPattern)
  if (!weekMatch && scheduleWeekLookingPattern.test(tail)) return null
  const weeks = weekMatch?.[1].trim() || '周次待定'
  const room = (weekMatch ? weekMatch[2] : tail)?.trim() || '地点待定'
  return {
    day,
    startPeriod,
    endPeriod,
    weeks,
    room,
    raw,
    course,
  }
}

function scheduleCourseIdentity(course: ScheduleCourse) {
  return course.JXBID || `${course.KCH}-${course.JXBMC}`
}

export function parseSchedule(courses: ScheduleCourse[]): ScheduleParseResult {
  const slots: ScheduleSlot[] = []
  const unrecognized: UnrecognizedSchedule[] = []
  const seenPartsByCourse = new Map<string, Set<string>>()
  const unrecognizedByCourse = new Map<string, UnrecognizedSchedule>()
  for (const course of courses) {
    const courseIdentity = scheduleCourseIdentity(course)
    const seenParts = seenPartsByCourse.get(courseIdentity) || new Set<string>()
    seenPartsByCourse.set(courseIdentity, seenParts)
    const rawParts: string[] = []
    for (const raw of splitScheduleParts(course.ZCXQJCDD?.trim() || '未提供上课安排')) {
      if (seenParts.has(raw)) continue
      seenParts.add(raw)
      rawParts.push(raw)
    }
    const rejected: string[] = []
    for (const raw of rawParts) {
      const slot = parseSchedulePart(raw, course)
      if (slot) slots.push(slot)
      else rejected.push(raw)
    }
    if (rejected.length) {
      const existing = unrecognizedByCourse.get(courseIdentity)
      if (existing) existing.rawParts.push(...rejected)
      else {
        const item = { course, rawParts: rejected }
        unrecognizedByCourse.set(courseIdentity, item)
        unrecognized.push(item)
      }
    }
  }
  return { slots, unrecognized }
}

export type PositionedScheduleSlot = ScheduleSlot & {
  lane: number
  laneCount: number
}

const weekdayOrder = new Map(weekdays.map((day, index) => [day, index]))

export function layoutScheduleSlots(slots: ScheduleSlot[]): PositionedScheduleSlot[] {
  const sorted = slots.map((slot, index) => ({ slot, index })).sort((left, right) =>
    (weekdayOrder.get(left.slot.day) ?? weekdays.length) - (weekdayOrder.get(right.slot.day) ?? weekdays.length)
    || left.slot.startPeriod - right.slot.startPeriod
    || left.slot.endPeriod - right.slot.endPeriod
    || left.index - right.index)
  const positioned: PositionedScheduleSlot[] = []

  for (let groupStart = 0; groupStart < sorted.length;) {
    const day = sorted[groupStart].slot.day
    let groupEnd = groupStart + 1
    let latestPeriod = sorted[groupStart].slot.endPeriod
    while (groupEnd < sorted.length) {
      const next = sorted[groupEnd].slot
      if (next.day !== day || next.startPeriod > latestPeriod) break
      latestPeriod = Math.max(latestPeriod, next.endPeriod)
      groupEnd += 1
    }

    const laneEnds: number[] = []
    const group = sorted.slice(groupStart, groupEnd).map(({ slot }) => {
      let lane = laneEnds.findIndex((endPeriod) => endPeriod < slot.startPeriod)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = slot.endPeriod
      return { slot, lane }
    })
    for (const { slot, lane } of group) {
      positioned.push({ ...slot, lane, laneCount: laneEnds.length })
    }
    groupStart = groupEnd
  }

  return positioned
}

export function courseDisplayName(course: ScheduleCourse) {
  return course.KCM || course.JXBMC.replace(/\d+班$/, '')
}

export function courseTerm(course: ProgramCourse) {
  const values = [
    course.XNXQDM_DISPLAY,
    course.XNXQ,
    course.JYXQ,
    course.XDQX_DISPLAY,
    course.XNXQDM,
    course.JYXDQX,
  ]
  return values.find((value) => typeof value === 'string' && value.trim()) as string | undefined
}

export function gradeYear(username: string) {
  const prefix = username.slice(0, 2)
  return /^\d{2}$/.test(prefix) ? `20${prefix}` : String(new Date().getFullYear())
}

export function programBrowserStorageKey(username: string) {
  return `nanyong-program-browser-${username}`
}

export function selectOwnedProgram(programs: Program[], profile: AcademicProfile) {
  const matchingCode = programs.filter((program) =>
    profile.majorCode && program.ZYDM === profile.majorCode
  )
  const majorName = normalizeIdentity(profile.majorName)
  const candidates = matchingCode.length ? matchingCode : programs.filter((program) =>
    normalizeIdentity(program.ZYDM_DISPLAY || '') === majorName
  )
  if (!candidates.length) return undefined

  const matchingDepartment = candidates.filter((program) =>
    (profile.departmentCode && program.DWDM === profile.departmentCode)
    || normalizeIdentity(program.DWDM_DISPLAY || '') === normalizeIdentity(profile.departmentName)
  )
  const scoped = matchingDepartment.length ? matchingDepartment : candidates
  return scoped.find((program) => program.XDLXDM_DISPLAY === '主修')
    || scoped.find((program) => program.PYFAMC.includes('主修'))
    || scoped[0]
}

function normalizeIdentity(value: string) {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s_*()（）·—-]+/g, '')
}
