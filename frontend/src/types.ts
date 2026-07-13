export type Session = { username: string; expiresAt: number }

export type Grade = {
  XNXQDM?: string
  XNXQDM_DISPLAY?: string
  KCH?: string
  KCM?: string
  XF?: string
  KCXZDM_DISPLAY?: string
  ZCJ?: string
  SFJG?: string
  SFJG_DISPLAY?: string
}

export type GradePage = { totalSize: number; rows: Grade[] }

export type GradeSummary = {
  earnedCredits: number
  weightedAverage: number | null
  gpa: number | null
  degreeGpa: number | null
  degreeGpaUnavailableReason: string
  passedCourses: number
  categories: { name: string; credits: number }[]
  graduationCategories: { name: string; credits: number }[]
  terms: { name: string; credits: number }[]
}

export type AcademicRanking = {
  averageScore: number
  rank: number
  majorTotal: number
  rankPercent: number
}

export type AcademicProfile = {
  grade: string
  majorCode: string
  majorName: string
  departmentCode: string
  departmentName: string
}

export type Term = { DM: string; MC: string }

export type ScheduleCourse = {
  KCH: string
  JXBID: string
  JXBMC: string
  KCM?: string | null
  SKJS?: string
  ZCXQJCDD?: string
  PKDWDM_DISPLAY?: string
  XF?: string
  KCFLDM_DISPLAY?: string
  KCFL1_DISPLAY?: string
  XKLY_DISPLAY?: string
}

export type Program = {
  PYFADM: string
  PYFAMC: string
  NJDM?: string
  NJDM_DISPLAY?: string
  DWDM?: string
  DWDM_DISPLAY?: string
  ZYDM?: string
  ZYDM_DISPLAY?: string
  XDLXDM?: string
  XDLXDM_DISPLAY?: string
  PYCCDM_DISPLAY?: string
  KSXNDM_DISPLAY?: string
  KSXQDM_DISPLAY?: string
  FATS?: string
  PYMB?: string
  XDYQ?: string
  ZGKC?: string
  XZNX?: number
}

export type ProgramNode = {
  KZH: string
  FKZH: string
  KZM: string
  KZLXDM?: string
  KZLXDM_DISPLAY?: string
  KCLBDM_DISPLAY?: string
  KCZXF?: number | null
  ZSXDXF?: number | null
  KCZMS?: number | null
  XDYQC?: string | null
  XDYQ?: string | null
  BZ?: string | null
  PX?: number | null
}

export type ProgramCourse = {
  KCH: string
  KCM: string
  XF?: number | string | null
  XNXQDM_DISPLAY?: string | null
  JYXQ?: string | null
  XNXQ?: string | null
  XDQX_DISPLAY?: string | null
  KKYX_DISPLAY?: string | null
  [key: string]: unknown
}

export type ReviewResult = {
  courseName: string
  teacher: string
  review: string
  sources: string[]
}

export type ReviewResponse = {
  items: ReviewResult[]
  total: number
  query: string
}
