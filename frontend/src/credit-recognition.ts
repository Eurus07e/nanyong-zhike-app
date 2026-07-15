import type { Grade, GradeSummary, ProgramCourse, ProgramNode } from './types'

type GeneralCategory = '人工智能通识核心课' | '人文与社会科学' | '自然科学与技术' | '美育' | '劳动教育' | '其他通识'
export type GraduationCategory = '通识通修课程' | '学科专业课程' | '多元发展课程' | '毕业论文/设计'
type CourseMatchObserver = (course: ProgramCourse, sourceGrades: Grade[]) => void

export type GeneralEducationRecognition = {
  requiredCredits: number | null
  directCredits: number
  readingBonusCredits: number
  readingAverage: number | null
  earnedCredits: number
  categoryCredits: Record<string, number>
  categoryRequirements: Record<string, number>
  courses: Array<{ grade: Grade; category: GeneralCategory }>
  readingCourses: Grade[]
}

export function isGeneralEducationNode(node: ProgramNode) {
  const name = String(node.KZM || '')
  const note = String(node.XDYQC || node.XDYQ || node.BZ || '')
  if (name.includes('通识通修')) return false
  return /通识.*(?:课程|教育|选修)|通识课/.test(name)
    || (/人文与社会科学/.test(note) && /自然科学与技术/.test(note))
}

export function recognizeGeneralEducation(node: ProgramNode, grades: Grade[]): GeneralEducationRecognition | null {
  if (!isGeneralEducationNode(node)) return null
  const note = String(node.XDYQC || node.XDYQ || node.BZ || '')
  const passedGeneral = deduplicateLatest(grades.filter((grade) => gradePassed(grade) && isGeneralEducationGrade(grade)))
  const readingRequirement = requirementAfter(note, '悦读(?:经典)?计划')
  const readingCandidates = readingRequirement == null
    ? []
    : passedGeneral.filter((grade) => String(grade.XGXKLBDM_DISPLAY || '').includes('悦读'))
  const readingSet = new Set(readingCandidates)
  const courses = passedGeneral.map((grade) => ({ grade, category: generalCategory(grade) }))
  const directCourses = courses.filter(({ grade }) => !readingSet.has(grade))
  const directCredits = round(directCourses.reduce((sum, item) => sum + numeric(item.grade.XF), 0))
  const categoryRequirements = parseCategoryRequirements(note)
  const categoryCredits: Record<string, number> = {}
  Object.keys(categoryRequirements).forEach((category) => { categoryCredits[category] = 0 })
  directCourses.forEach(({ grade, category }) => {
    if (category === '其他通识') return
    categoryCredits[category] = round((categoryCredits[category] || 0) + numeric(grade.XF))
  })

  const scoredReading = readingCandidates.filter((grade) => numericOrNull(grade.ZCJ) != null)
  const readingComplete = readingRequirement != null && readingCandidates.length >= 3 && scoredReading.length >= 3
  const readingCourses = readingComplete ? scoredReading.slice(0, 3) : readingCandidates
  const readingAverage = readingComplete
    ? round(readingCourses.reduce((sum, grade) => sum + numeric(grade.ZCJ), 0) / readingCourses.length)
    : null
  const readingBonusCredits = readingComplete ? readingRequirement : 0
  if (readingBonusCredits) {
    categoryCredits['人文与社会科学'] = round((categoryCredits['人文与社会科学'] || 0) + readingBonusCredits)
  }

  return {
    requiredCredits: positiveNumber(node.ZSXDXF) ?? requirementAfter(note, '通识课程'),
    directCredits,
    readingBonusCredits,
    readingAverage,
    earnedCredits: round(directCredits + readingBonusCredits),
    categoryCredits,
    categoryRequirements,
    courses,
    readingCourses,
  }
}

export function mergeGeneralEducationCourseDisplay(
  plannedCourses: ProgramCourse[],
  recognition: GeneralEducationRecognition,
) {
  const merged = [...plannedCourses]
  const knownCodes = new Set(
    plannedCourses.map((course) => String(course.KCH || '').trim()).filter(Boolean),
  )

  recognition.courses.forEach(({ grade }) => {
    const code = String(grade.KCH || '').trim()
    if (code && knownCodes.has(code)) return
    merged.push({
      ...grade,
      KCH: code,
      KCM: String(grade.KCM || '课程'),
      XF: grade.XF || 0,
      __recognizedGeneralCourse: true,
    })
    if (code) knownCodes.add(code)
  })

  const recognizedCodes = new Set(
    recognition.courses
      .map(({ grade }) => String(grade.KCH || '').trim())
      .filter(Boolean),
  )
  Object.entries(recognition.categoryRequirements).forEach(([category, required]) => {
    const gap = round(required - (recognition.categoryCredits[category] || 0))
    if (gap <= 0) return
    const listedUnmatchedCredits = merged.reduce((sum, course) => {
      const code = String(course.KCH || '').trim()
      if (recognizedCodes.has(code) || generalCategory(course as Grade) !== category) return sum
      return sum + numeric(course.XF)
    }, 0)
    const missingCredits = round(gap - listedUnmatchedCredits)
    if (missingCredits <= 0) return
    merged.push({
      KCH: `GENERAL_REQUIREMENT_${category}`,
      KCM: requirementPlaceholderName(category),
      XF: missingCredits,
      __requirementPlaceholder: true,
      __generalCategory: category,
    })
  })

  return merged
}

export function applyGeneralEducationRecognition(
  summary: GradeSummary,
  grades: Grade[],
  recognition: GeneralEducationRecognition | null,
  assignments: ReadonlyMap<Grade, GraduationCategory> = new Map(),
): GradeSummary {
  if (!recognition && assignments.size === 0) return summary

  const targets = new Map(assignments)
  recognition?.courses.forEach(({ grade }) => targets.set(grade, '通识通修课程'))
  let categories = summary.categories.map((item) => ({ ...item }))
  let graduationCategories = summary.graduationCategories.map((item) => ({ ...item }))
  targets.forEach((target, grade) => {
    const sourceName = String(grade.KCXZDM_DISPLAY || '未分类')
    const sourceCategory = graduationCategoryForName(sourceName)
    if (sourceCategory === target) return
    const credit = numeric(grade.XF)
    categories = moveCredits(categories, sourceName, categoryLabelForGraduation(target), credit)
    graduationCategories = moveCredits(graduationCategories, sourceCategory, target, credit)
  })

  const readingGrades = recognition?.courses
    .map(({ grade }) => grade)
    .filter((grade) => String(grade.XGXKLBDM_DISPLAY || '').includes('悦读')) || []
  const readingSet = new Set(readingGrades)
  const readingSourceCredits = round(readingGrades.reduce((sum, grade) => sum + numeric(grade.XF), 0))
  const bonus = recognition?.readingBonusCredits || 0
  const readingAverage = recognition?.readingAverage
  const readingDelta = round(bonus - readingSourceCredits)
  if (readingDelta) {
    categories = adjustCredits(categories, (item) => item.name.includes('通识'), '通识', readingDelta)
    graduationCategories = adjustCredits(graduationCategories, (item) => item.name === '通识通修课程', '通识通修课程', readingDelta)
  }

  let weightedAverage = summary.weightedAverage
  let gpa = summary.gpa
  if (readingGrades.length) {
    let weightedScore = 0
    let scoredCredits = 0
    grades.forEach((grade) => {
      if (readingSet.has(grade)) return
      const score = numericOrNull(grade.ZCJ)
      const credit = numeric(grade.XF)
      if (score == null || !credit) return
      weightedScore += score * credit
      scoredCredits += credit
    })
    if (bonus && readingAverage != null) {
      weightedScore += readingAverage * bonus
      scoredCredits += bonus
    }
    weightedAverage = scoredCredits ? round(weightedScore / scoredCredits) : null
    gpa = weightedAverage == null ? null : round(weightedAverage / 20)
  }

  let terms = summary.terms.map((item) => ({ ...item }))
  readingGrades.forEach((grade) => {
    const term = String(grade.XNXQDM_DISPLAY || grade.XNXQDM || '')
    if (term) terms = adjustCredits(terms, (item) => item.name === term, term, -numeric(grade.XF))
  })
  const readingTerm = recognition?.readingCourses
    .map((grade) => String(grade.XNXQDM_DISPLAY || grade.XNXQDM || ''))
    .filter(Boolean)
    .sort()
    .at(-1)
  if (readingTerm && bonus) terms = adjustCredits(terms, (item) => item.name === readingTerm, readingTerm, bonus)

  return {
    ...summary,
    earnedCredits: round(summary.earnedCredits + readingDelta),
    weightedAverage,
    gpa,
    categories,
    graduationCategories,
    terms,
  }
}

export function buildGraduationCategoryAssignments(
  nodes: ProgramNode[],
  coursesByNode: Record<string, ProgramCourse[]>,
  grades: Grade[],
) {
  const byId = new Map(nodes.map((node) => [node.KZH, node]))
  const assignments = new Map<Grade, GraduationCategory>()
  const used = new Set<Grade>()
  Object.entries(coursesByNode)
    .sort(([left], [right]) => (byId.get(left)?.PX || 0) - (byId.get(right)?.PX || 0))
    .forEach(([nodeId, courses]) => {
      const node = byId.get(nodeId)
      if (!node) return
      let root = node
      const visited = new Set<string>()
      while (root.FKZH && root.FKZH !== '-1' && !visited.has(root.KZH)) {
        visited.add(root.KZH)
        const parent = byId.get(root.FKZH)
        if (!parent) break
        root = parent
      }
      const target = graduationCategoryForName(root.KZM)
      const available = grades.filter((grade) => !used.has(grade))
      buildCourseMatches(node, courses, available, (_course, sources) => {
        sources.forEach((grade) => {
          if (used.has(grade)) return
          used.add(grade)
          assignments.set(grade, target)
        })
      })
    })
  return assignments
}

export function dynamicRecognitionCourseNodeIds(nodes: ProgramNode[]) {
  const byId = new Map(nodes.map((node) => [node.KZH, node]))
  return nodes.filter((node) => {
    if (node.KZLXDM !== '01') return false
    const names = [node.KZM]
    let current = node
    const visited = new Set<string>()
    while (current.FKZH && current.FKZH !== '-1' && !visited.has(current.KZH)) {
      visited.add(current.KZH)
      const parent = byId.get(current.FKZH)
      if (!parent) break
      names.push(parent.KZM)
      current = parent
    }
    return /英语|外语|公共语言|语言能力|foreign language|体育/i.test(names.join(' '))
  }).map((node) => node.KZH)
}

export function buildCourseMatches(node: ProgramNode, courses: ProgramCourse[], grades: Grade[], onMatch?: CourseMatchObserver) {
  const passedGrades = grades.filter(gradePassed)
  const matches = new Map<ProgramCourse, Grade>()
  const usedGrades = new Set<Grade>()

  courses.forEach((course) => {
    const exact = passedGrades.find((grade) => !usedGrades.has(grade) && grade.KCH === course.KCH)
    if (!exact) return
    matches.set(course, exact)
    usedGrades.add(exact)
    onMatch?.(course, [exact])
  })

  if (isLanguageGroup(node, courses)) {
    const courseFamilies = new Set(courses.map((course) => courseCodeFamily(course.KCH)).filter(Boolean))
    const remainingGrades = passedGrades
      .filter((grade) => !usedGrades.has(grade))
      .sort((left, right) => gradeTermCode(left).localeCompare(gradeTermCode(right)) || String(left.KCM || '').localeCompare(String(right.KCM || ''), 'zh-CN'))
    courses.filter((course) => !matches.has(course)).forEach((course) => {
      const targetCredits = numeric(course.XF)
      const terms = plannedTerms(course)
      const candidates = remainingGrades.filter((grade) =>
        isLanguageGrade(grade, courseFamilies)
        && (!terms.length || terms.includes(gradeTermCode(grade)))
      )
      const bundle = findCreditBundle(candidates, targetCredits)
      if (!bundle?.length) return
      const equivalent = combineEquivalentGrades(bundle, course)
      matches.set(course, equivalent)
      onMatch?.(course, bundle)
      bundle.forEach((grade) => {
        usedGrades.add(grade)
        const index = remainingGrades.indexOf(grade)
        if (index >= 0) remainingGrades.splice(index, 1)
      })
    })
    return matches
  }

  if (!isPhysicalEducationGroup(node, courses)) return matches
  const courseFamilies = new Set(courses.map((course) => courseCodeFamily(course.KCH)).filter(Boolean))
  const remainingGrades = passedGrades
    .filter((grade) => !usedGrades.has(grade) && isPhysicalEducationGrade(grade, courseFamilies))
    .sort((left, right) => gradeTermCode(left).localeCompare(gradeTermCode(right)) || String(left.KCM || '').localeCompare(String(right.KCM || ''), 'zh-CN'))
  const openSlots = courses
    .filter((course) => !matches.has(course))
    .sort((left, right) => left.KCH.localeCompare(right.KCH))

  openSlots.forEach((course) => {
    const gradeIndex = remainingGrades.findIndex((grade) => sportGradeMatchesSlot(grade, course))
    if (gradeIndex < 0) return
    const grade = remainingGrades[gradeIndex]
    matches.set(course, grade)
    onMatch?.(course, [grade])
    remainingGrades.splice(gradeIndex, 1)
  })
  openSlots.filter((course) => !matches.has(course)).forEach((course) => {
    if (plannedTerms(course).length) return
    const gradeIndex = remainingGrades.findIndex((grade) => numeric(grade.XF) === numeric(course.XF))
    if (gradeIndex < 0) return
    const grade = remainingGrades[gradeIndex]
    matches.set(course, grade)
    onMatch?.(course, [grade])
    remainingGrades.splice(gradeIndex, 1)
  })
  return matches
}

export function gradePassed(grade: Grade) {
  return grade.SFJG === '1' || grade.SFJG_DISPLAY === '是'
}

function parseCategoryRequirements(note: string) {
  const labels: Array<[string, string]> = [
    ['人工智能通识核心课', '人工智能通识(?:核心课)?'],
    ['人文与社会科学', '人文与社会科学'],
    ['自然科学与技术', '自然科学与技术'],
    ['美育', '美育'],
    ['劳动教育', '劳动教育'],
  ]
  return Object.fromEntries(labels.flatMap(([name, pattern]) => {
    const value = requirementAfter(note, pattern)
    return value == null ? [] : [[name, value]]
  }))
}

function requirementAfter(text: string, labelPattern: string) {
  const match = text.match(new RegExp(`${labelPattern}[^，。；;]{0,28}?(\\d+(?:\\.\\d+)?)\\s*学分`))
  return match ? Number(match[1]) : null
}

function generalCategory(grade: Grade): GeneralCategory {
  const name = String(grade.KCM || '')
  const internal = String(grade.BY9_DISPLAY || '')
  const university = String(grade.XGXKLBDM_DISPLAY || '')
  const official = `${internal} ${university}`
  if (/人工智能/.test(official)) return '人工智能通识核心课'
  if (/劳动/.test(official)) return '劳动教育'
  if (/美育/.test(official)) return '美育'
  if (/人文与社会科学/.test(internal) || /悦读/.test(university)) return '人文与社会科学'
  if (/自然科学与技术/.test(internal) || /科学之光/.test(university)) return '自然科学与技术'
  if (/人工智能/.test(name)) return '人工智能通识核心课'
  if (/劳动/.test(name)) return '劳动教育'
  return '其他通识'
}

function requirementPlaceholderName(category: string) {
  if (category === '劳动教育') return '大学生劳动教育（实践部分）'
  if (category === '人工智能通识核心课') return '人工智能通识核心课（培养方案要求）'
  return `${category}课程（培养方案要求）`
}

function isGeneralEducationGrade(grade: Grade) {
  const classification = `${grade.KCXZDM_DISPLAY || ''} ${grade.KCFLDM_DISPLAY || ''} ${grade.KCFL1_DISPLAY || ''} ${grade.BY9_DISPLAY || ''} ${grade.XGXKLBDM_DISPLAY || ''}`
  return /通识|悦读|科学之光|美育|劳动教育/.test(classification)
}

function deduplicateLatest(grades: Grade[]) {
  const byCourse = new Map<string, Grade>()
  grades.forEach((grade) => {
    const key = String(grade.KCH || grade.KCM || '')
    const current = byCourse.get(key)
    if (!current || gradeTermCode(grade) > gradeTermCode(current)) byCourse.set(key, grade)
  })
  return [...byCourse.values()].sort((left, right) => gradeTermCode(left).localeCompare(gradeTermCode(right)) || String(left.KCH || '').localeCompare(String(right.KCH || '')))
}

function graduationCategoryForName(name: string): GraduationCategory {
  if (name.includes('毕业')) return '毕业论文/设计'
  if (name.includes('选修') && !name.includes('通识')) return '多元发展课程'
  if (['平台', '学科', '专业'].some((label) => name.includes(label))) return '学科专业课程'
  return '通识通修课程'
}

function categoryLabelForGraduation(category: GraduationCategory) {
  if (category === '学科专业课程') return '学科专业'
  if (category === '多元发展课程') return '多元发展'
  if (category === '毕业论文/设计') return '毕业论文/设计'
  return '通识'
}

function moveCredits(items: Array<{ name: string; credits: number }>, sourceName: string, targetName: string, credits: number) {
  if (!credits || sourceName === targetName) return items
  const source = items.find((item) => item.name === sourceName)
  if (!source) return items
  const moved = Math.min(numeric(source.credits), credits)
  if (!moved) return items
  let foundTarget = false
  const next = items.map((item) => {
    if (item.name === sourceName) return { ...item, credits: round(Math.max(0, item.credits - moved)) }
    if (item.name !== targetName) return item
    foundTarget = true
    return { ...item, credits: round(item.credits + moved) }
  })
  if (!foundTarget) next.push({ name: targetName, credits: round(moved) })
  return next
}

function adjustCredits(items: Array<{ name: string; credits: number }>, matches: (item: { name: string; credits: number }) => boolean, fallbackName: string, credits: number) {
  let found = false
  const next = items.map((item) => {
    if (!matches(item)) return item
    found = true
    return { ...item, credits: round(Math.max(0, item.credits + credits)) }
  })
  if (!found && credits > 0) next.push({ name: fallbackName, credits: round(credits) })
  return next
}

const PHYSICAL_EDUCATION_COURSE_CODES = new Set([
  '00040020A', '00040020C', '00040030A', '00040030C', '00040050A', '00040050C',
  '00040070A', '00040070B', '00040070C', '00040090A', '00040090C', '00040100A',
  '00040100C', '00040110A', '00040110B', '00040110C', '00040120A', '00040120C',
  '00040130', '00040140', '00040160', '00040200A', '00040200C', '00040210',
  '00040220A', '00040220C', '00040230A', '00040230C', '00040240', '00040280A',
  '00040280C', '00040290A', '00040310C', '00040330C', '00040460', '00040460C',
  '00041010', '00041010A', '00042020', '00042030', '00042050', '00042070',
  '00042080C', '00042100A', '00042100C', '00042110C', '00042120A', '00042130',
  '00042150',
])
const PHYSICAL_EDUCATION_NAMES = ['体育', '体适能', '游泳', '篮球', '足球', '排球', '羽毛球', '乒乓球', '网球', '健美操', '瑜伽', '武术', '太极', '跆拳道', '健身', '飞盘', '定向越野']

function isPhysicalEducationGroup(node: ProgramNode, courses: ProgramCourse[]) {
  return /体育/.test(`${node.KZM} ${courses.map((course) => course.KCM).join(' ')}`)
}

function isPhysicalEducationGrade(grade: Grade, courseFamilies: Set<string>) {
  const code = String(grade.KCH || '')
  const name = String(grade.KCM || '')
  if (code.startsWith('00042140') || name.includes('体质健康测试')) return false
  const family = courseCodeFamily(code)
  return (family !== '' && courseFamilies.has(family))
    || PHYSICAL_EDUCATION_COURSE_CODES.has(code)
    || PHYSICAL_EDUCATION_NAMES.some((keyword) => name.includes(keyword))
    || (code.startsWith('0004') && numeric(grade.XF) <= 1)
}

function gradeTermCode(grade: Grade) {
  return String(grade.XNXQDM || grade.XNXQDM_DISPLAY || '')
}

function sportGradeMatchesSlot(grade: Grade, course: ProgramCourse) {
  return plannedTerms(course).includes(gradeTermCode(grade)) && numeric(grade.XF) === numeric(course.XF)
}

function plannedTerms(course: ProgramCourse) {
  return String(course.XNXQ || course.XNXQDM_DISPLAY || '').split(',').map((term) => term.trim()).filter(Boolean)
}

function isLanguageGroup(node: ProgramNode, courses: ProgramCourse[]) {
  return /英语|外语|公共语言|语言能力|foreign language/i.test(`${node.KZM} ${courses.map((course) => course.KCM).join(' ')}`)
}

function isLanguageGrade(grade: Grade, courseFamilies: Set<string>) {
  const family = courseCodeFamily(grade.KCH)
  const classification = `${grade.KCXZDM_DISPLAY || ''} ${grade.KCFLDM_DISPLAY || ''} ${grade.KCFL1_DISPLAY || ''}`
  if (/大学英语|公共英语|外语|英语课程|foreign language/i.test(classification)) return true
  if (/专业|选修/.test(classification)) return false
  return (family !== '' && courseFamilies.has(family)) || /英语|外语|english|foreign language/i.test(String(grade.KCM || ''))
}

function courseCodeFamily(value: unknown) {
  const code = String(value || '').trim()
  if (/^\d{4}/.test(code)) return code.slice(0, 4)
  return code.match(/^[A-Za-z]{2,}/)?.[0].toLocaleLowerCase('en-US') || ''
}

function findCreditBundle(candidates: Grade[], target: number, start = 0, selected: Grade[] = [], sum = 0): Grade[] | null {
  if (Math.abs(sum - target) < 0.001) return selected
  if (sum > target + 0.001 || selected.length >= 4) return null
  for (let index = start; index < candidates.length; index += 1) {
    const result = findCreditBundle(candidates, target, index + 1, [...selected, candidates[index]], sum + numeric(candidates[index].XF))
    if (result) return result
  }
  return null
}

function combineEquivalentGrades(grades: Grade[], course: ProgramCourse): Grade {
  const totalCredits = grades.reduce((sum, grade) => sum + numeric(grade.XF), 0)
  const scored = grades.filter((grade) => numericOrNull(grade.ZCJ) != null)
  const scoredCredits = scored.reduce((sum, grade) => sum + numeric(grade.XF), 0)
  const weightedScore = scored.reduce((sum, grade) => sum + numeric(grade.ZCJ) * numeric(grade.XF), 0)
  const average = scored.length === grades.length && scoredCredits ? round(weightedScore / scoredCredits) : null
  return {
    ...grades[0],
    KCH: grades.map((grade) => grade.KCH).filter(Boolean).join('+'),
    KCM: grades.map((grade) => grade.KCM).filter(Boolean).join(' + '),
    XF: String(course.XF ?? totalCredits),
    ZCJ: average == null ? '已通过' : String(average),
    XNXQDM: course.XNXQ || grades[0].XNXQDM,
  }
}

function positiveNumber(value: unknown) {
  const number = numericOrNull(value)
  return number != null && number > 0 ? number : null
}

function numeric(value: unknown) {
  return numericOrNull(value) || 0
}

function numericOrNull(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function round(value: number) {
  return Number(value.toFixed(2))
}
