import type { AcademicProfile, Program, ProgramCourse, ScheduleCourse } from './types'

export const weekdays = ['周一', '周二', '周三', '周四', '周五', '周六', '周日'] as const
export const periods = [
  { key: '1', label: '1-2', time: '08:00-09:50' },
  { key: '3', label: '3-4', time: '10:10-12:00' },
  { key: '5', label: '5-6', time: '14:00-15:50' },
  { key: '7', label: '7-8', time: '16:10-18:00' },
  { key: '9', label: '9-11', time: '18:30-21:20' },
] as const

export type ScheduleSlot = {
  day: string
  period: string
  weeks: string
  room: string
  raw: string
  course: ScheduleCourse
}

export function parseSchedule(courses: ScheduleCourse[]): ScheduleSlot[] {
  return courses.flatMap((course) =>
    (course.ZCXQJCDD || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((raw) => {
        const match = raw.match(/(周[一二三四五六日])\s+(\d+)(?:-\d+)?节\s+(.+?周(?:\([单双]\))?)\s+(.+)$/)
        if (!match) return null
        return {
          day: match[1],
          period: match[2],
          weeks: match[3],
          room: match[4],
          raw,
          course,
        }
      })
      .filter((slot): slot is ScheduleSlot => slot !== null),
  )
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
