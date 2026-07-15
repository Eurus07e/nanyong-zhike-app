import assert from 'node:assert/strict'
import test from 'node:test'

import {
  aggregateNodeCourses,
  buildProgramTree,
  classifyProgramNodesForYear,
  collectCourseLeafIds,
  parseProgramRequirements,
  resolveProgramRequirements,
  summarizeProgramNode,
} from '../src/program-requirements.ts'

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
  })
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
  })
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

test('uses program text instead of misleading parent pool totals', () => {
  const requirements = parseProgramRequirements(detailText)
  const summary = summarizeProgramNode(nodes[0], nodes, coursesByNode, requirements)

  assert.equal(summary.requiredCredits, 59)
  assert.equal(summary.requiredCourses, null)
  assert.equal(summary.source, 'program-text')
})

test('fills a fixed course group from its actual course list when raw totals are empty', () => {
  const summary = summarizeProgramNode(nodes[3], nodes, coursesByNode, parseProgramRequirements(detailText))

  assert.equal(summary.requiredCourses, 13)
  assert.equal(summary.requiredCredits, 36)
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

test('fills required credits from actual courses when a fixed node only provides required course count', () => {
  const fixedNode = { KZH: 'fixed-count', FKZH: '-1', KZM: '固定课程', KZLXDM: '01', ZSXDMS: 2 }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { 'fixed-count': [{ KCH: 'FC1', KCM: '固定课程一', XF: 2 }, { KCH: 'FC2', KCM: '固定课程二', XF: 3 }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, 2)
  assert.equal(summary.requiredCredits, 5)
  assert.equal(summary.source, 'required-fields')
})

test('fills required course count from actual courses when a fixed node only provides required credits', () => {
  const fixedNode = { KZH: 'fixed-credits', FKZH: '-1', KZM: '固定课程', KZLXDM: '01', ZSXDXF: 5 }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { 'fixed-credits': [{ KCH: 'FC1', KCM: '固定课程一', XF: 2 }, { KCH: 'FC2', KCM: '固定课程二', XF: 3 }] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, 2)
  assert.equal(summary.requiredCredits, 5)
  assert.equal(summary.source, 'required-fields')
})

test('keeps node pool totals when a successful course response is empty', () => {
  const fixedNode = { KZH: 'empty-response', FKZH: '-1', KZM: '固定课程', KZLXDM: '01', KCZMS: 3, KCZXF: 6 }
  const summary = summarizeProgramNode(
    fixedNode,
    [fixedNode],
    { 'empty-response': [] },
    parseProgramRequirements(''),
  )

  assert.equal(summary.requiredCourses, 3)
  assert.equal(summary.requiredCredits, 6)
  assert.equal(summary.poolCourses, 3)
  assert.equal(summary.poolCredits, 6)
  assert.equal(summary.source, 'node-fields')
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
