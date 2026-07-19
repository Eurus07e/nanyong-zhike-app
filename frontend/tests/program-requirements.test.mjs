import assert from 'node:assert/strict'
import test from 'node:test'

import * as programRequirements from '../src/program-requirements.ts'

const {
  aggregateNodeCourses,
  buildProgramTree,
  classifyProgramNodesForYear,
  collectCourseLeafIds,
  formatCourseCredit,
  courseCreditValue,
  parseProgramRequirements,
  resolveProgramRequirements,
  summarizeProgramNode,
} = programRequirements

function resolveProgramNodeCreditRequirement(summary) {
  assert.equal(typeof programRequirements.resolveProgramNodeCreditRequirement, 'function')
  return programRequirements.resolveProgramNodeCreditRequirement(summary)
}

const detailText = [
  '应修总学分 144 学分。',
  '通识通修课程应修 59 学分；',
  '学科专业课程应修 49 学分；',
  '多元发展课程应修 30 学分；',
  '毕业论文/设计应修 6 学分。',
].join('')

const nodes = [
  { KZH: 'general', FKZH: '-1', KZM: '通识通修课程', KCZMS: 26, KCZXF: 34, PX: 1 },
  { KZH: 'general-fixed', FKZH: 'general', KZM: '通修课程', PX: 1 },
  { KZH: 'discipline', FKZH: '-1', KZM: '学科专业课程', KCZMS: 7, KCZXF: 16, PX: 2 },
  { KZH: 'foundation', FKZH: 'discipline', KZM: '学科基础课程', KZLXDM: '01', KCZMS: 0, KCZXF: null, PX: 1 },
  { KZH: 'core', FKZH: 'discipline', KZM: '专业核心课程', KZLXDM: '01', ZSXDMS: 7, ZSXDXF: 13, PX: 2 },
  { KZH: 'development', FKZH: '-1', KZM: '多元发展课程', KCZMS: 27, KCZXF: 55, PX: 3 },
  { KZH: 'elective', FKZH: 'development', KZM: '专业选修课程', KZLXDM: '01', KCZMS: 27, KCZXF: 55, ZSXDMS: 15, ZSXDXF: 30, PX: 1 },
  { KZH: 'practice', FKZH: 'development', KZM: '实践课程', KZLXDM: '01', KCZMS: 2, KCZXF: 6, ZSXDMS: 1, ZSXDXF: 3, PX: 2 },
  { KZH: 'thesis', FKZH: '-1', KZM: '毕业论文/设计', KZLXDM: '01', KCZMS: 0, KCZXF: null, PX: 4 },
]

const foundationCourses = Array.from({ length: 13 }, (_, index) => ({
  KCH: `F${index + 1}`,
  KCM: `学科基础 ${index + 1}`,
  XF: index === 0 ? 6 : 2.5,
}))

const coursesByNode = {
  foundation: foundationCourses,
  core: Array.from({ length: 7 }, (_, index) => ({ KCH: `C${index + 1}`, KCM: `专业核心 ${index + 1}`, XF: index === 0 ? 1 : 2 })),
  elective: Array.from({ length: 27 }, (_, index) => ({ KCH: `E${index + 1}`, KCM: `专业选修 ${index + 1}`, XF: index === 0 ? 3 : 2 })),
  practice: [
    { KCH: 'P1', KCM: '创新实践一', XF: 3 },
    { KCH: 'P2', KCM: '创新实践二', XF: 3 },
  ],
  thesis: [{ KCH: 'T1', KCM: '毕业论文', XF: 6 }],
}

test('parses the authoritative graduation requirements from program text', () => {
  assert.deepEqual(parseProgramRequirements(detailText), {
    total: 144,
    categories: {
      '通识通修课程': 59,
      '学科专业课程': 49,
      '多元发展课程': 30,
      '毕业论文/设计': 6,
    },
    categoryOptions: {
      '通识通修课程': [59],
      '学科专业课程': [49],
      '多元发展课程': [30],
      '毕业论文/设计': [6],
    },
  })
})

test('parses full-width numbers and slash-separated track requirements', () => {
  const requirements = parseProgramRequirements('专业应修总学分１５０，其中学科专业课程（必修）４７／６４学分。')

  assert.equal(requirements.total, 150)
  assert.deepEqual(requirements.categoryOptions['学科专业课程'], [47, 64])
  assert.equal(requirements.categories['学科专业课程'], 47)
})

test('recognizes official category aliases and hyphen/range separators', () => {
  const requirements = parseProgramRequirements(
    '应修总学分 144 学分；通修课程 58 至 62 学分；专业核心课程 47 学分；多元发展选修课程 19-21 学分；毕业论文 4 学分。',
  )

  assert.deepEqual(requirements.categoryOptions['通识通修课程'], [58, 62])
  assert.deepEqual(requirements.categoryOptions['学科专业课程'], [47])
  assert.deepEqual(requirements.categoryOptions['多元发展课程'], [19, 21])
  assert.deepEqual(requirements.categoryOptions['毕业论文/设计'], [4])
})

test('formats numeric course credits and marks missing sentinels for confirmation', () => {
  assert.equal(formatCourseCredit('３．５ 学分'), '3.5')
  assert.equal(formatCourseCredit('.25'), '0.25')
  assert.equal(formatCourseCredit('/'), '待确认')
  assert.equal(formatCourseCredit('N/A'), '待确认')
  assert.equal(formatCourseCredit('－'), '待确认')
  assert.equal(courseCreditValue('N/A'), null)
  assert.equal(courseCreditValue('—'), null)
  assert.equal(courseCreditValue('3.5'), 3.5)
  assert.equal(formatCourseCredit(null), '待确认')
})

test('fills all graduation categories from top-level required credits and derives their complete total', () => {
  const fallbackNodes = [
    { KZH: 'general', FKZH: '-1', KZM: '通识通修课程', ZSXDXF: 59, KCZXF: 159 },
    { KZH: 'discipline', FKZH: '-1', KZM: '学科专业课程', ZSXDXF: 49, KCZXF: 149 },
    { KZH: 'development', FKZH: '-1', KZM: '多元发展课程', ZSXDXF: 30, KCZXF: 130 },
    { KZH: 'thesis', FKZH: '-1', KZM: '毕业论文/设计', ZSXDXF: 6, KCZXF: 106 },
  ]

  assert.deepEqual(resolveProgramRequirements('', fallbackNodes), {
    total: 144,
    categories: {
      '通识通修课程': 59,
      '学科专业课程': 49,
      '多元发展课程': 30,
      '毕业论文/设计': 6,
    },
    categoryOptions: {
      '通识通修课程': [59],
      '学科专业课程': [49],
      '多元发展课程': [30],
      '毕业论文/设计': [6],
    },
  })
})

test('maps official top-level node aliases when program text is empty', () => {
  const fallbackNodes = [
    { KZH: 'general', FKZH: '-1', KZM: '通修课程', ZSXDXF: 59 },
    { KZH: 'foundation', FKZH: '-1', KZM: '学科基础课程', ZSXDXF: 13 },
    { KZH: 'core', FKZH: '-1', KZM: '专业核心课程', ZSXDXF: 34 },
    { KZH: 'development', FKZH: '-1', KZM: '多元发展选修课程', ZSXDXF: 34 },
    { KZH: 'thesis', FKZH: '-1', KZM: '毕业论文（必修）', ZSXDXF: 4 },
  ]

  const requirements = resolveProgramRequirements('', fallbackNodes)

  assert.deepEqual(requirements.categories, {
    '通识通修课程': 59,
    '学科专业课程': 47,
    '多元发展课程': 34,
    '毕业论文/设计': 4,
  })
  assert.equal(requirements.total, 144)
})

test('keeps split discipline subcategory node credits instead of repeating their sum', () => {
  const nodes = [
    { KZH: 'foundation', FKZH: '-1', KZM: '学科基础课程', ZSXDXF: 13 },
    { KZH: 'core', FKZH: '-1', KZM: '专业核心课程', ZSXDXF: 34 },
  ]
  const requirements = resolveProgramRequirements('', nodes)

  assert.equal(summarizeProgramNode(nodes[0], nodes, {}, requirements).requiredCredits, 13)
  assert.equal(summarizeProgramNode(nodes[1], nodes, {}, requirements).requiredCredits, 34)
})

test('keeps program text authoritative over conflicting node required credits', () => {
  const conflictingNodes = [
    { KZH: 'general', FKZH: '-1', KZM: '通识通修课程', ZSXDXF: 1 },
    { KZH: 'discipline', FKZH: '-1', KZM: '学科专业课程', ZSXDXF: 1 },
    { KZH: 'development', FKZH: '-1', KZM: '多元发展课程', ZSXDXF: 1 },
    { KZH: 'thesis', FKZH: '-1', KZM: '毕业论文/设计', ZSXDXF: 1 },
  ]

  assert.deepEqual(
    resolveProgramRequirements(detailText, conflictingNodes),
    parseProgramRequirements(detailText),
  )
})

test('does not derive a total from course pool credits when a required category is unknown', () => {
  const incompleteNodes = [
    { KZH: 'general', FKZH: '-1', KZM: '通识通修课程', ZSXDXF: 59 },
    { KZH: 'discipline', FKZH: '-1', KZM: '学科专业课程', ZSXDXF: 49 },
    { KZH: 'development', FKZH: '-1', KZM: '多元发展课程', ZSXDXF: 30 },
    { KZH: 'thesis', FKZH: '-1', KZM: '毕业论文/设计', KCZXF: 6 },
  ]

  const requirements = resolveProgramRequirements('', incompleteNodes)
  assert.equal(requirements.total, null)
  assert.equal(requirements.categories['毕业论文/设计'], null)
})

test('uses complete fixed course-pool credits when a module has no required field', () => {
  const moduleNodes = [
    { KZH: 'root', FKZH: '-1', KZM: '通识通修课程', KZLXDM: '02' },
    { KZH: 'common', FKZH: 'root', KZM: '通修课程', KZLXDM: '02', KCZMS: 2 },
    { KZH: 'common-a', FKZH: 'common', KZM: '通修课程 A', KZLXDM: '01' },
    { KZH: 'common-b', FKZH: 'common', KZM: '通修课程 B', KZLXDM: '01' },
  ]
  const courses = {
    'common-a': [{ KCH: 'A', KCM: '课程 A', XF: '3' }],
    'common-b': [{ KCH: 'B', KCM: '课程 B', XF: '5' }],
  }

  const summary = summarizeProgramNode(moduleNodes[1], moduleNodes, courses, parseProgramRequirements(''))

  assert.equal(summary.requiredCredits, null)
  assert.equal(summary.poolCredits, 8)
  assert.deepEqual(resolveProgramNodeCreditRequirement(summary), {
    values: [8],
    source: 'fixed-course-list',
  })
})

test('does not derive a fixed denominator from a course list with unknown credits', () => {
  const node = { KZH: 'incomplete', FKZH: '-1', KZM: '固定课程', KZLXDM: '01' }
  const summary = summarizeProgramNode(
    node,
    [node],
    { incomplete: [{ KCH: 'A', KCM: '课程 A', XF: '2' }, { KCH: 'B', KCM: '课程 B', XF: '—' }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.poolCredits, null)
  assert.equal(resolveProgramNodeCreditRequirement(summary), null)
})

test('keeps an elective course pool without an authoritative denominator', () => {
  const node = { KZH: 'optional', FKZH: '-1', KZM: '专业选修课程', KZLXDM: '01' }
  const summary = summarizeProgramNode(
    node,
    [node],
    { optional: [{ KCH: 'A', KCM: '课程 A', XF: '3' }, { KCH: 'B', KCM: '课程 B', XF: '4' }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.isElectivePool, true)
  assert.equal(resolveProgramNodeCreditRequirement(summary), null)
})

test('uses program text instead of misleading parent pool totals', () => {
  const requirements = parseProgramRequirements(detailText)
  const summary = summarizeProgramNode(nodes[0], nodes, coursesByNode, requirements)

  assert.equal(summary.requiredCredits, 59)
  assert.equal(summary.requiredCourses, null)
  assert.equal(summary.source, 'program-text')
})

test('keeps track-specific requirements separate from descendant course-list totals', () => {
  const trackedText = [
    '专业应修总学分 150。',
    '励学班要求学科专业课程（必修）47 学分。',
    '励新班要求学科专业课程（必修）64 学分。',
  ].join('')
  const trackedNodes = [
    { KZH: 'discipline', FKZH: '-1', KZM: '学科专业课程', KZLXDM: '02', KCZMS: 20, KCZXF: 65 },
    { KZH: 'foundation', FKZH: 'discipline', KZM: '学科基础课程', KZLXDM: '01', KCZMS: 5, KCZXF: 13 },
    { KZH: 'core', FKZH: 'discipline', KZM: '专业核心课程', KZLXDM: '01', KCZMS: 15, KCZXF: 52 },
  ]
  const trackedCourses = {
    foundation: Array.from({ length: 5 }, (_, index) => ({ KCH: `F${index}`, KCM: `基础${index}`, XF: index === 0 ? 5 : 2 })),
    core: Array.from({ length: 15 }, (_, index) => ({ KCH: `C${index}`, KCM: `核心${index}`, XF: index === 0 ? 10 : 3 })),
  }
  const requirements = resolveProgramRequirements(trackedText, trackedNodes)

  const parent = summarizeProgramNode(trackedNodes[0], trackedNodes, trackedCourses, requirements)
  const foundation = summarizeProgramNode(trackedNodes[1], trackedNodes, trackedCourses, requirements)
  const core = summarizeProgramNode(trackedNodes[2], trackedNodes, trackedCourses, requirements)

  assert.deepEqual(requirements.categoryOptions['学科专业课程'], [47, 64])
  assert.equal(parent.requiredCredits, 47)
  assert.deepEqual(parent.requiredCreditOptions, [47, 64])
  assert.deepEqual(resolveProgramNodeCreditRequirement(parent), {
    values: [47, 64],
    source: 'required',
  })
  assert.equal(foundation.requiredCredits, null)
  assert.equal(foundation.poolCredits, 13)
  assert.equal(core.requiredCredits, null)
  assert.equal(core.poolCredits, 52)
  assert.equal(parent.isElectivePool, true)
  assert.equal(foundation.isElectivePool, true)
  assert.equal(core.isElectivePool, true)
})

test('keeps a fixed-looking course list as a pool when no required field is provided', () => {
  const fixedNode = { ...nodes[3], FKZH: '-1', KZM: '独立固定课程组' }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { foundation: foundationCourses },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, null)
  assert.equal(summary.requiredCredits, null)
  assert.equal(summary.poolCourses, 13)
  assert.equal(summary.poolCredits, 36)
  assert.equal(summary.isElectivePool, false)
  assert.equal(summary.source, 'course-list')
})

test('keeps elective requirements separate from the larger optional course pool', () => {
  const summary = summarizeProgramNode(nodes[6], nodes, coursesByNode, parseProgramRequirements(detailText))

  assert.equal(summary.requiredCourses, 15)
  assert.equal(summary.requiredCredits, 30)
  assert.equal(summary.poolCourses, 27)
  assert.equal(summary.poolCredits, 55)
  assert.equal(summary.isElectivePool, true)
  assert.equal(summary.source, 'required-fields')
})

test('uses required fields for a choose-one practice pool', () => {
  const summary = summarizeProgramNode(nodes[7], nodes, coursesByNode, parseProgramRequirements(detailText))

  assert.equal(summary.requiredCourses, 1)
  assert.equal(summary.requiredCredits, 3)
  assert.equal(summary.poolCourses, 2)
  assert.equal(summary.poolCredits, 6)
  assert.equal(summary.isElectivePool, true)
})

test('does not invent required credits when a node only provides required course count', () => {
  const fixedNode = { KZH: 'fixed-count', FKZH: '-1', KZM: '固定课程', KZLXDM: '01', ZSXDMS: 2 }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { 'fixed-count': [{ KCH: 'FC1', KCM: '固定课程一', XF: 2 }, { KCH: 'FC2', KCM: '固定课程二', XF: 3 }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, 2)
  assert.equal(summary.requiredCredits, null)
  assert.equal(summary.poolCredits, 5)
  assert.equal(summary.source, 'required-fields')
})

test('does not invent required course count when a node only provides required credits', () => {
  const fixedNode = { KZH: 'fixed-credits', FKZH: '-1', KZM: '固定课程', KZLXDM: '01', ZSXDXF: 5 }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { 'fixed-credits': [{ KCH: 'FC1', KCM: '固定课程一', XF: 2 }, { KCH: 'FC2', KCM: '固定课程二', XF: 3 }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, null)
  assert.equal(summary.requiredCredits, 5)
  assert.equal(summary.poolCourses, 2)
  assert.equal(summary.source, 'required-fields')
})

test('keeps node totals as pool metadata when a successful course response is empty', () => {
  const fixedNode = { KZH: 'empty-response', FKZH: '-1', KZM: '固定课程', KZLXDM: '01', KCZMS: 3, KCZXF: 6 }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { 'empty-response': [] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, null)
  assert.equal(summary.requiredCredits, null)
  assert.equal(summary.poolCourses, 3)
  assert.equal(summary.poolCredits, 6)
  assert.equal(summary.source, 'node-fields')
})

test('does not shrink node pool totals when a non-empty course response is shorter', () => {
  const poolNode = { KZH: 'short-response', FKZH: '-1', KZM: '课程范围', KZLXDM: '01', KCZMS: 3, KCZXF: 6 }
  const summary = summarizeProgramNode(
    poolNode,
    [poolNode],
    { 'short-response': [{ KCH: 'S1', KCM: '课程一', XF: 2 }, { KCH: 'S2', KCM: '课程二', XF: 2 }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.poolCourses, 3)
  assert.equal(summary.poolCredits, 6)
})

test('parses parenthesized prose and derives discipline total from named subcategories', () => {
  const computerText = [
    '专业应修总学分150，其中',
    '通识通修课程（通识通修课程清单所有通修课均为必修，通识课修读要求详见修课说明）62学分，',
    '学科基础课程（必修）43学分，专业核心课程（必修）9学分，',
    '毕业论文/设计（必修）8学分，其余为多元发展课程（选修）28学分。',
  ].join('')

  const requirements = parseProgramRequirements(computerText)

  assert.equal(requirements.total, 150)
  assert.equal(requirements.categories['通识通修课程'], 62)
  assert.equal(requirements.categories['学科专业课程'], 52)
  assert.deepEqual(requirements.categoryOptions['学科专业课程'], [52])
  assert.equal(requirements.categories['多元发展课程'], 28)
  assert.equal(requirements.categories['毕业论文/设计'], 8)
})

test('accepts an official category requirement written as 分 instead of 学分', () => {
  const requirements = parseProgramRequirements(
    '专业应修总学分145，其中通识通修课程（必修）51分，学科专业课程（必修）51学分。',
  )

  assert.equal(requirements.categories['通识通修课程'], 51)
  assert.equal(requirements.categories['学科专业课程'], 51)
})

test('keeps constrained descendants out of the fixed year timeline', () => {
  const trackedText = '专业应修总学分150。励学班要求学科专业课程47学分。励新班要求学科专业课程64学分。'
  const trackedNodes = [
    { KZH: 'discipline', FKZH: '-1', KZM: '学科专业课程', KZLXDM: '02', KCZMS: 20, KCZXF: 65 },
    { KZH: 'foundation', FKZH: 'discipline', KZM: '学科基础课程', KZLXDM: '01', KCZMS: 5, KCZXF: 13 },
    { KZH: 'core', FKZH: 'discipline', KZM: '专业核心课程', KZLXDM: '01', KCZMS: 15, KCZXF: 52 },
  ]
  const trackedCourses = {
    foundation: [{ KCH: 'F1', KCM: '基础', XF: 13 }],
    core: [{ KCH: 'C1', KCM: '核心', XF: 52 }],
  }
  const requirements = resolveProgramRequirements(trackedText, trackedNodes)
  const summaries = new Map(trackedNodes.map((node) => [
    node.KZH,
    summarizeProgramNode(node, trackedNodes, trackedCourses, requirements),
  ]))

  const groups = classifyProgramNodesForYear(trackedNodes, summaries)

  assert.deepEqual(groups.fixedCourseNodes, [])
  assert.deepEqual(groups.electivePoolNodes.map((node) => node.KZH), ['discipline'])
})

test('inherits an elective ancestor constraint in descendant course leaves', () => {
  const nestedNodes = [
    { KZH: 'root', FKZH: '-1', KZM: '学科专业课程' },
    { KZH: 'choice', FKZH: 'root', KZM: '方向模块', KCZMS: 2, KCZXF: 4, ZSXDMS: 1, ZSXDXF: 2 },
    { KZH: 'choice-a', FKZH: 'choice', KZM: '方向课程 A', KZLXDM: '01' },
    { KZH: 'choice-b', FKZH: 'choice', KZM: '方向课程 B', KZLXDM: '01' },
    { KZH: 'fixed', FKZH: 'root', KZM: '专业核心课程', KZLXDM: '01' },
  ]
  const nestedCourses = {
    'choice-a': [{ KCH: 'A1', KCM: '方向课程 A', XF: 2 }],
    'choice-b': [{ KCH: 'B1', KCM: '方向课程 B', XF: 2 }],
    fixed: [{ KCH: 'F1', KCM: '专业核心课程', XF: 3 }],
  }

  const summary = summarizeProgramNode(nestedNodes[2], nestedNodes, nestedCourses, parseProgramRequirements(''))

  assert.equal(summary.isElectivePool, true)
})

test('keeps only fixed leaves in the year timeline and uses the outer elective pool as its entry', () => {
  const nestedNodes = [
    { KZH: 'root', FKZH: '-1', KZM: '学科专业课程' },
    { KZH: 'choice', FKZH: 'root', KZM: '方向模块', KCZMS: 2, KCZXF: 4, ZSXDMS: 1, ZSXDXF: 2 },
    { KZH: 'choice-a', FKZH: 'choice', KZM: '方向课程 A', KZLXDM: '01' },
    { KZH: 'choice-b', FKZH: 'choice', KZM: '方向课程 B', KZLXDM: '01' },
    { KZH: 'fixed', FKZH: 'root', KZM: '专业核心课程', KZLXDM: '01' },
  ]
  const nestedCourses = {
    'choice-a': [{ KCH: 'A1', KCM: '方向课程 A', XF: 2 }],
    'choice-b': [{ KCH: 'B1', KCM: '方向课程 B', XF: 2 }],
    fixed: [{ KCH: 'F1', KCM: '专业核心课程', XF: 3 }],
  }
  const requirements = parseProgramRequirements('')
  const summaries = new Map(nestedNodes.map((node) => [
    node.KZH,
    summarizeProgramNode(node, nestedNodes, nestedCourses, requirements),
  ]))

  const groups = classifyProgramNodesForYear(nestedNodes, summaries)
  assert.deepEqual(groups.fixedCourseNodes.map((node) => node.KZH), ['fixed'])
  assert.deepEqual(groups.electivePoolNodes.map((node) => node.KZH), ['choice'])
})

test('collects descendant course leaves and reports partial course data', () => {
  assert.deepEqual(collectCourseLeafIds(nodes, 'discipline'), ['foundation', 'core'])

  const partial = aggregateNodeCourses(nodes, { foundation: foundationCourses }, 'discipline')
  assert.equal(partial.courses.length, 13)
  assert.deepEqual(partial.missingLeafIds, ['core'])
})

test('deduplicates repeated courses while preserving tree order', () => {
  const duplicate = { KCH: 'SHARED', KCM: '共同课程', XF: 2 }
  const aggregated = aggregateNodeCourses(nodes, {
    foundation: [duplicate, ...foundationCourses],
    core: [duplicate, coursesByNode.core[0]],
  }, 'discipline')

  assert.equal(aggregated.courses.filter((course) => course.KCH === 'SHARED').length, 1)
  assert.deepEqual(aggregated.missingLeafIds, [])
})

test('builds a stable tree ordered by node position', () => {
  const tree = buildProgramTree([...nodes].reverse())
  assert.deepEqual(tree.map((node) => node.KZH), ['general', 'discipline', 'development', 'thesis'])
  assert.deepEqual(tree.find((node) => node.KZH === 'discipline').children.map((node) => node.KZH), ['foundation', 'core'])
})
