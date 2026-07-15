import assert from 'node:assert/strict'
import test from 'node:test'

import {
  applyGeneralEducationRecognition,
  buildGraduationCategoryAssignments,
  buildCourseMatches,
  mergeGeneralEducationCourseDisplay,
  recognizeGeneralEducation,
} from '../src/credit-recognition.ts'

const generalNode = {
  KZH: 'general',
  FKZH: 'root',
  KZM: '通识课程',
  KZLXDM: '01',
  ZSXDXF: 11,
  XDYQC: '通识课程至少需要修读11学分，其中必修学分如下：（1）“人工智能通识核心课”模块1学分；（2）“人文与社会科学”模块至少3学分，其中须至少包含“悦读经典计划”1学分；（3）“自然科学与技术”模块至少3学分，其中须至少包含“科学之光”育人项目1学分；（4）美育2学分、劳动教育2学分。',
}

const directGeneralGrades = [
  { KCH: 'H1', KCM: '人文课', XF: '2', ZCJ: '90', SFJG: '1', KCXZDM_DISPLAY: '通识', BY9_DISPLAY: '通识课-人文与社会科学', XNXQDM: '2025-2026-1' },
  { KCH: 'N1', KCM: '自然课', XF: '2', ZCJ: '88', SFJG: '1', KCXZDM_DISPLAY: '通识', BY9_DISPLAY: '通识课-自然科学与技术', XNXQDM: '2025-2026-1' },
  { KCH: 'AI1', KCM: '人工智能通识与应用', XF: '1', ZCJ: '92', SFJG: '1', KCXZDM_DISPLAY: '通识', XGXKLBDM_DISPLAY: '通识课', XNXQDM: '2025-2026-1' },
  { KCH: 'A1', KCM: '媒体人文', XF: '2', ZCJ: '86', SFJG: '1', KCXZDM_DISPLAY: '通识', XGXKLBDM_DISPLAY: '美育课程', XNXQDM: '2025-2026-2' },
  { KCH: 'L1', KCM: '大学生劳动教育（理论部分）', XF: '1', ZCJ: '95', SFJG: '1', KCXZDM_DISPLAY: '通识', XNXQDM: '2025-2026-1' },
  { KCH: 'S1', KCM: '科学之光', XF: '1', ZCJ: '89', SFJG: '1', KCXZDM_DISPLAY: '通识', XGXKLBDM_DISPLAY: '科学之光', BY9_DISPLAY: '通识课-自然科学与技术', XNXQDM: '2025-2026-1' },
]

const readingGrades = [
  { KCH: 'R1', KCM: '阅读一', XF: '0', ZCJ: '80', SFJG: '1', KCXZDM_DISPLAY: '通识', XGXKLBDM_DISPLAY: '悦读计划', XNXQDM: '2025-2026-1' },
  { KCH: 'R2', KCM: '阅读二', XF: '0', ZCJ: '90', SFJG: '1', KCXZDM_DISPLAY: '通识', XGXKLBDM_DISPLAY: '悦读计划', XNXQDM: '2025-2026-1' },
  { KCH: 'R3', KCM: '阅读三', XF: '0', ZCJ: '100', SFJG: '1', KCXZDM_DISPLAY: '通识', XGXKLBDM_DISPLAY: '悦读计划', XNXQDM: '2025-2026-2' },
]

test('recognizes official general education categories and the completed reading plan', () => {
  const recognition = recognizeGeneralEducation(generalNode, [...directGeneralGrades, ...readingGrades])

  assert.equal(recognition?.requiredCredits, 11)
  assert.equal(recognition?.directCredits, 9)
  assert.equal(recognition?.readingBonusCredits, 1)
  assert.equal(recognition?.readingAverage, 90)
  assert.equal(recognition?.earnedCredits, 10)
  assert.deepEqual(recognition?.categoryCredits, {
    '人工智能通识核心课': 1,
    '人文与社会科学': 3,
    '自然科学与技术': 3,
    '美育': 2,
    '劳动教育': 1,
  })
})

test('adds recognized open courses and missing requirement slots to the general course display', () => {
  const recognition = recognizeGeneralEducation(generalNode, [...directGeneralGrades, ...readingGrades])
  const planned = directGeneralGrades.slice(0, 4).map((grade) => ({ ...grade }))

  const displayed = mergeGeneralEducationCourseDisplay(planned, recognition)
  const codes = displayed.map((course) => course.KCH)
  const laborPractice = displayed.find((course) => course.KCM === '大学生劳动教育（实践部分）')

  assert.equal(codes.filter((code) => code === 'H1').length, 1)
  assert.ok(codes.includes('L1'))
  assert.ok(codes.includes('S1'))
  assert.ok(codes.includes('R1'))
  assert.equal(laborPractice?.XF, 1)
  assert.equal(laborPractice?.__requirementPlaceholder, true)
})

test('does not duplicate a requirement slot already listed by the program', () => {
  const recognition = recognizeGeneralEducation(generalNode, [...directGeneralGrades, ...readingGrades])
  const practice = { KCH: 'LABOR-PRACTICE', KCM: '大学生劳动教育（实践部分）', XF: 1 }

  const displayed = mergeGeneralEducationCourseDisplay([practice], recognition)

  assert.equal(displayed.filter((course) => course.KCM === '大学生劳动教育（实践部分）').length, 1)
  assert.equal(displayed[0].__requirementPlaceholder, undefined)
})

test('does not award reading credit until three classified courses have numeric scores', () => {
  const recognition = recognizeGeneralEducation(generalNode, [...directGeneralGrades, ...readingGrades.slice(0, 2)])

  assert.equal(recognition?.readingBonusCredits, 0)
  assert.equal(recognition?.readingAverage, null)
  assert.equal(recognition?.earnedCredits, 9)
})

test('does not apply a reading rule to a program that does not require it', () => {
  const node = { ...generalNode, XDYQC: '通识课程至少修读 8 学分，其中人文与社会科学 2 学分。', ZSXDXF: 8 }
  const recognition = recognizeGeneralEducation(node, [...directGeneralGrades, ...readingGrades])

  assert.equal(recognition?.readingBonusCredits, 0)
})

test('uses the official university category instead of guessing the AI module from the course name', () => {
  const recognition = recognizeGeneralEducation(generalNode, [{
    KCH: 'AI-OFFICIAL',
    KCM: '计算思维导论',
    XF: '1',
    ZCJ: '91',
    SFJG: '1',
    KCXZDM_DISPLAY: '通识',
    XGXKLBDM_DISPLAY: '人工智能通识核心课',
    XNXQDM: '2025-2026-1',
  }])

  assert.equal(recognition?.categoryCredits['人工智能通识核心课'], 1)
})

test('keeps a course classified by official general-education fields even when its nature label differs', () => {
  const recognition = recognizeGeneralEducation(generalNode, [{
    KCH: 'GENERAL-OFFICIAL',
    KCM: '现代社会专题',
    XF: '2',
    ZCJ: '87',
    SFJG: '1',
    KCXZDM_DISPLAY: '通修',
    BY9_DISPLAY: '通识课-人文与社会科学',
    XNXQDM: '2025-2026-1',
  }])

  assert.equal(recognition?.directCredits, 2)
  assert.equal(recognition?.categoryCredits['人文与社会科学'], 2)
})

test('recognizes a differently named general-education node from another cohort', () => {
  const node = { ...generalNode, KZM: '通识教育课程' }
  const recognition = recognizeGeneralEducation(node, directGeneralGrades)

  assert.equal(recognition?.requiredCredits, 11)
  assert.equal(recognition?.directCredits, 9)
})

test('does not mistake the top general curriculum category for its general-education leaf', () => {
  const node = { ...generalNode, KZM: '通识通修课程' }

  assert.equal(recognizeGeneralEducation(node, directGeneralGrades), null)
})

test('prefers an official general-education category over a conflicting course name', () => {
  const recognition = recognizeGeneralEducation(generalNode, [{
    KCH: 'H-AI-NAME',
    KCM: '人工智能与现代社会',
    XF: '2',
    ZCJ: '90',
    SFJG: '1',
    KCXZDM_DISPLAY: '通识',
    BY9_DISPLAY: '通识课-人文与社会科学',
    XNXQDM: '2025-2026-1',
  }])

  assert.equal(recognition?.categoryCredits['人工智能通识核心课'], 0)
  assert.equal(recognition?.categoryCredits['人文与社会科学'], 2)
})

test('counts only the latest passed attempt of the same general-education course', () => {
  const recognition = recognizeGeneralEducation(generalNode, [
    { KCH: 'H-RETAKE', KCM: '人文专题', XF: '2', ZCJ: '70', SFJG: '1', KCXZDM_DISPLAY: '通识', BY9_DISPLAY: '通识课-人文与社会科学', XNXQDM: '2024-2025-2' },
    { KCH: 'H-RETAKE', KCM: '人文专题', XF: '2', ZCJ: '92', SFJG: '1', KCXZDM_DISPLAY: '通识', BY9_DISPLAY: '通识课-人文与社会科学', XNXQDM: '2025-2026-1' },
  ])

  assert.equal(recognition?.directCredits, 2)
  assert.equal(recognition?.courses.length, 1)
})

test('awards exactly the plan reading credit when reading rows carry fractional credits', () => {
  const recognition = recognizeGeneralEducation(generalNode, readingGrades.map((grade) => ({ ...grade, XF: '0.33' })))

  assert.equal(recognition?.readingBonusCredits, 1)
  assert.equal(recognition?.directCredits, 0)
  assert.equal(recognition?.earnedCredits, 1)
})

test('adds the reading credit and average to overview totals and grade point', () => {
  const recognition = recognizeGeneralEducation(generalNode, [...directGeneralGrades, ...readingGrades])
  const summary = {
    earnedCredits: 9,
    weightedAverage: 90,
    gpa: 4.5,
    degreeGpa: null,
    degreeGpaUnavailableReason: '',
    passedCourses: 9,
    categories: [{ name: '通识', credits: 9 }],
    graduationCategories: [{ name: '通识通修课程', credits: 9 }],
    terms: [{ name: '2025-2026-1', credits: 9 }],
  }
  const adjusted = applyGeneralEducationRecognition(summary, [...directGeneralGrades, ...readingGrades], recognition)
  const weightedScore = directGeneralGrades.reduce((sum, grade) => sum + Number(grade.ZCJ) * Number(grade.XF), 0)
  const expectedAverage = Number(((weightedScore + 90) / 10).toFixed(2))

  assert.equal(adjusted.earnedCredits, 10)
  assert.equal(adjusted.weightedAverage, expectedAverage)
  assert.equal(adjusted.gpa, Number((expectedAverage / 20).toFixed(2)))
  assert.equal(adjusted.categories[0].credits, 10)
  assert.equal(adjusted.graduationCategories[0].credits, 10)
})

test('replaces fractional reading-course credits instead of counting them twice', () => {
  const fractionalReading = readingGrades.map((grade) => ({ ...grade, XF: '0.33' }))
  const recognition = recognizeGeneralEducation(generalNode, fractionalReading)
  const summary = {
    earnedCredits: 0.99,
    weightedAverage: 90,
    gpa: 4.5,
    degreeGpa: null,
    degreeGpaUnavailableReason: '',
    passedCourses: 3,
    categories: [{ name: '通识', credits: 0.99 }],
    graduationCategories: [
      { name: '通识通修课程', credits: 0.99 },
      { name: '多元发展课程', credits: 0 },
    ],
    terms: [
      { name: '2025-2026-1', credits: 0.66 },
      { name: '2025-2026-2', credits: 0.33 },
    ],
  }

  const adjusted = applyGeneralEducationRecognition(summary, fractionalReading, recognition)

  assert.equal(adjusted.earnedCredits, 1)
  assert.equal(adjusted.weightedAverage, 90)
  assert.equal(adjusted.gpa, 4.5)
  assert.equal(adjusted.categories.find((item) => item.name === '通识')?.credits, 1)
  assert.equal(adjusted.graduationCategories.find((item) => item.name === '通识通修课程')?.credits, 1)
  assert.equal(adjusted.terms.find((item) => item.name === '2025-2026-1')?.credits, 0)
  assert.equal(adjusted.terms.find((item) => item.name === '2025-2026-2')?.credits, 1)
})

test('moves officially classified general education out of a conflicting raw nature', () => {
  const grade = {
    KCH: 'GENERAL-OFFICIAL-NATURE',
    KCM: '现代社会专题',
    XF: '2',
    ZCJ: '87',
    SFJG: '1',
    KCXZDM_DISPLAY: '专业选修课程',
    BY9_DISPLAY: '通识课-人文与社会科学',
    XNXQDM: '2025-2026-1',
  }
  const recognition = recognizeGeneralEducation(generalNode, [grade])
  const summary = {
    earnedCredits: 2,
    weightedAverage: 87,
    gpa: 4.35,
    degreeGpa: null,
    degreeGpaUnavailableReason: '',
    passedCourses: 1,
    categories: [{ name: '专业选修课程', credits: 2 }],
    graduationCategories: [
      { name: '通识通修课程', credits: 0 },
      { name: '多元发展课程', credits: 2 },
    ],
    terms: [{ name: '2025-2026-1', credits: 2 }],
  }

  const adjusted = applyGeneralEducationRecognition(summary, [grade], recognition)

  assert.equal(adjusted.earnedCredits, 2)
  assert.equal(adjusted.categories.find((item) => item.name === '专业选修课程')?.credits, 0)
  assert.equal(adjusted.categories.find((item) => item.name === '通识')?.credits, 2)
  assert.equal(adjusted.graduationCategories.find((item) => item.name === '通识通修课程')?.credits, 2)
  assert.equal(adjusted.graduationCategories.find((item) => item.name === '多元发展课程')?.credits, 0)
})

test('applies dynamic PE slot recognition to overview graduation categories', () => {
  const nodes = [
    { KZH: 'general-root', FKZH: '-1', KZM: '通识通修课程', KZLXDM: '02' },
    { KZH: 'pe', FKZH: 'general-root', KZM: '大学体育', KZLXDM: '01' },
  ]
  const slot = { KCH: '00040000A', KCM: '体育（一）', XF: '0.75', XNXQ: '2025-2026-1' }
  const grade = { KCH: '00042050', KCM: '体适能', XF: '0.75', ZCJ: '90', SFJG: '1', KCXZDM_DISPLAY: '专业选修课程', XNXQDM: '2025-2026-1' }
  const assignments = buildGraduationCategoryAssignments(nodes, { pe: [slot] }, [grade])
  const summary = {
    earnedCredits: 0.75,
    weightedAverage: 90,
    gpa: 4.5,
    degreeGpa: null,
    degreeGpaUnavailableReason: '',
    passedCourses: 1,
    categories: [{ name: '专业选修课程', credits: 0.75 }],
    graduationCategories: [
      { name: '通识通修课程', credits: 0 },
      { name: '多元发展课程', credits: 0.75 },
    ],
    terms: [{ name: '2025-2026-1', credits: 0.75 }],
  }

  assert.equal(assignments.get(grade), '通识通修课程')
  const adjusted = applyGeneralEducationRecognition(summary, [grade], null, assignments)
  assert.equal(adjusted.graduationCategories.find((item) => item.name === '通识通修课程')?.credits, 0.75)
  assert.equal(adjusted.graduationCategories.find((item) => item.name === '多元发展课程')?.credits, 0)
})

test('matches concrete PE grades to generic slots by term and credit once each', () => {
  const node = { KZH: 'pe', FKZH: 'root', KZM: '大学体育' }
  const slots = [
    { KCH: '00040000A', KCM: '体育（一）', XF: '0.75', XNXQ: '2025-2026-1' },
    { KCH: '00040000B', KCM: '体育（二）', XF: '0.75', XNXQ: '2025-2026-2' },
    { KCH: '00040000C', KCM: '体育（三）', XF: '0.75', XNXQ: '2026-2027-1' },
  ]
  const grades = [
    { KCH: '00042050', KCM: '体适能', XF: '0.75', SFJG: '1', XNXQDM: '2025-2026-2' },
    { KCH: '00042050', KCM: '体适能', XF: '0.75', SFJG: '1', XNXQDM: '2025-2026-1' },
  ]
  const matches = buildCourseMatches(node, slots, grades)

  assert.equal(matches.get(slots[0])?.XNXQDM, '2025-2026-1')
  assert.equal(matches.get(slots[1])?.XNXQDM, '2025-2026-2')
  assert.equal(matches.has(slots[2]), false)
})

test('does not consume a PE grade from a different term as a fallback', () => {
  const node = { KZH: 'pe', FKZH: 'root', KZM: '大学体育' }
  const slot = { KCH: '00040000D', KCM: '体育（四）', XF: '0.75', XNXQ: '2027-2028-2' }
  const grades = [
    { KCH: '00042050', KCM: '体适能', XF: '0.75', SFJG: '1', XNXQDM: '2025-2026-1' },
  ]

  assert.equal(buildCourseMatches(node, [slot], grades).has(slot), false)
})

test('derives a changed PE slot code family from that cohort program', () => {
  const node = { KZH: 'pe-new', FKZH: 'root', KZM: '体育必修模块' }
  const slot = { KCH: '991100-A', KCM: '体育专项（一）', XF: '1', XNXQ: '2028-2029-1' }
  const grade = { KCH: '991199-B', KCM: '专项训练', XF: '1', ZCJ: '合格', SFJG: '1', XNXQDM: '2028-2029-1' }

  assert.equal(buildCourseMatches(node, [slot], [grade]).get(slot)?.KCH, grade.KCH)
})

test('matches two same-term foundation academic English grades to one four-credit slot', () => {
  const node = { KZH: 'english', FKZH: 'root', KZM: '大学英语' }
  const slots = [
    { KCH: '00020010A', KCM: '大学英语（一）', XF: '4', XNXQ: '2025-2026-1' },
    { KCH: '00020010B', KCM: '大学英语（二）', XF: '4', XNXQ: '2025-2026-2' },
  ]
  const grades = [
    { KCH: '00020022A', KCM: '基础学术英语-读写', XF: '2', ZCJ: '90', SFJG: '1', KCXZDM_DISPLAY: '通修', XNXQDM: '2025-2026-1' },
    { KCH: '00020032A', KCM: '基础学术英语-听说', XF: '2', ZCJ: '88', SFJG: '1', KCXZDM_DISPLAY: '通修', XNXQDM: '2025-2026-1' },
  ]
  const matches = buildCourseMatches(node, slots, grades)
  const equivalent = matches.get(slots[0])

  assert.equal(equivalent?.XF, '4')
  assert.equal(equivalent?.ZCJ, '89')
  assert.match(String(equivalent?.KCM), /基础学术英语-读写.*基础学术英语-听说/)
  assert.equal(matches.has(slots[1]), false)
})

test('derives language equivalents from each program instead of one student course list', () => {
  const node = { KZH: 'language', FKZH: 'root', KZM: '外国语言课程' }
  const slots = [
    { KCH: '12030010A', KCM: '大学英语（一）', XF: '3', XNXQ: '2027-2028-1' },
  ]
  const grades = [
    { KCH: '12039998A', KCM: 'Academic Writing', XF: '1.5', ZCJ: '86', SFJG: '1', XNXQDM: '2027-2028-1' },
    { KCH: 'EL999', KCM: '综合英语研讨', XF: '1.5', ZCJ: '90', SFJG: '1', XNXQDM: '2027-2028-1' },
    { KCH: 'MATH101', KCM: '高等数学', XF: '1.5', ZCJ: '99', SFJG: '1', XNXQDM: '2027-2028-1' },
  ]
  const matches = buildCourseMatches(node, slots, grades)
  const equivalent = matches.get(slots[0])

  assert.equal(equivalent?.XF, '3')
  assert.equal(equivalent?.ZCJ, '88')
  assert.match(String(equivalent?.KCM), /Academic Writing/)
  assert.match(String(equivalent?.KCM), /综合英语研讨/)
  assert.doesNotMatch(String(equivalent?.KCM), /高等数学/)
})

test('does not fabricate a numeric language score when one equivalent course is pass-fail', () => {
  const node = { KZH: 'english', FKZH: 'root', KZM: '大学英语' }
  const slot = { KCH: '00020010A', KCM: '大学英语（一）', XF: '4', XNXQ: '2025-2026-1' }
  const grades = [
    { KCH: '00020022A', KCM: '英语读写', XF: '2', ZCJ: '90', SFJG: '1', XNXQDM: '2025-2026-1' },
    { KCH: '00020032A', KCM: '英语听说', XF: '2', ZCJ: '合格', SFJG: '1', XNXQDM: '2025-2026-1' },
  ]

  assert.equal(buildCourseMatches(node, [slot], grades).get(slot)?.ZCJ, '已通过')
})

test('accepts an official university-English classification across course catalogs', () => {
  const node = { KZH: 'english', FKZH: 'root', KZM: '公共语言模块' }
  const slot = { KCH: 'PLAN-ENGLISH', KCM: '语言能力（一）', XF: '2', XNXQ: '2029-2030-1' }
  const grade = { KCH: 'NEW-CATALOG-8', KCM: 'Academic Communication', XF: '2', ZCJ: '88', SFJG: '1', KCFLDM_DISPLAY: '大学英语课程', XNXQDM: '2029-2030-1' }

  assert.equal(buildCourseMatches(node, [slot], [grade]).get(slot)?.KCH, grade.KCH)
})

test('does not use an explicitly classified professional elective as a language equivalent', () => {
  const node = { KZH: 'english', FKZH: 'root', KZM: '大学英语' }
  const slot = { KCH: '00020010A', KCM: '大学英语（一）', XF: '2', XNXQ: '2025-2026-1' }
  const grade = { KCH: 'BIZ900', KCM: '商务英语专题', XF: '2', ZCJ: '95', SFJG: '1', KCFLDM_DISPLAY: '专业选修课程', XNXQDM: '2025-2026-1' }

  assert.equal(buildCourseMatches(node, [slot], [grade]).has(slot), false)
})

test('does not infer university English from the name when the grade nature is professional elective', () => {
  const node = { KZH: 'english', FKZH: 'root', KZM: '大学英语' }
  const slot = { KCH: '00020010A', KCM: '大学英语（一）', XF: '2', XNXQ: '2025-2026-1' }
  const grade = { KCH: 'BIZ901', KCM: '商务英语专题', XF: '2', ZCJ: '95', SFJG: '1', KCXZDM_DISPLAY: '专业选修课程', XNXQDM: '2025-2026-1' }

  assert.equal(buildCourseMatches(node, [slot], [grade]).has(slot), false)
})
