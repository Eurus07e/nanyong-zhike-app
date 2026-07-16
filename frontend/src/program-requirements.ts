import type { ProgramCourse, ProgramNode } from './types'

export type ProgramRequirements = {
  total: number | null
  categories: Record<string, number | null>
  categoryOptions: Record<string, number[]>
}

export type ProgramTreeNode = ProgramNode & { children: ProgramTreeNode[] }

export type ProgramNodeSummary = {
  requiredCourses: number | null
  requiredCredits: number | null
  poolCourses: number | null
  poolCredits: number | null
  moduleCount: number
  isElectivePool: boolean
  requiredCreditOptions?: number[]
  source: 'program-text' | 'required-fields' | 'course-list' | 'node-fields' | 'children' | 'unknown'
}

export type AggregatedNodeCourses = {
  courses: ProgramCourse[]
  leafIds: string[]
  missingLeafIds: string[]
}

const GRADUATION_CATEGORIES = [
  '通识通修课程',
  '学科专业课程',
  '多元发展课程',
  '毕业论文/设计',
] as const

export function parseProgramRequirements(text: string): ProgramRequirements {
  const compact = text.replace(/\s+/g, ' ')
  const valuesAfter = (label: string) => {
    const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const matches = compact.matchAll(new RegExp(
      `${escaped}(?:[（(][^）)]{0,160}[）)])?[^，。；;\\d]{0,30}?(\\d+(?:\\.\\d+)?)\\s*学?分`,
      'g',
    ))
    return [...new Set([...matches].map((match) => Number(match[1])))]
  }
  const totalMatch = compact.match(/(?:应修总学分|总学分)[^，。；;\d]{0,12}(\d+(?:\.\d+)?)(?:\s*学分)?/)
  const categoryOptions = Object.fromEntries(GRADUATION_CATEGORIES.map((name) => [name, valuesAfter(name)]))
  if (!categoryOptions['学科专业课程'].length) {
    const foundation = valuesAfter('学科基础课程')
    const core = valuesAfter('专业核心课程')
    if (foundation.length && foundation.length === core.length) {
      categoryOptions['学科专业课程'] = foundation.map((value, index) => normalizeNumber(value + core[index]))
    }
  }
  return {
    total: totalMatch ? Number(totalMatch[1]) : null,
    categories: Object.fromEntries(GRADUATION_CATEGORIES.map((name) => [name, categoryOptions[name][0] ?? null])),
    categoryOptions,
  }
}

export function resolveProgramRequirements(text: string, nodes: ProgramNode[]): ProgramRequirements {
  const parsed = parseProgramRequirements(text)
  const topLevelNodes = new Map(nodes
    .filter((node) => node.FKZH === '-1')
    .map((node) => [node.KZM, node]))
  const categories = Object.fromEntries(GRADUATION_CATEGORIES.map((name) => [
    name,
    parsed.categories[name] ?? positiveNumber(topLevelNodes.get(name)?.ZSXDXF),
  ]))
  const categoryOptions = Object.fromEntries(GRADUATION_CATEGORIES.map((name) => {
    const fallback = positiveNumber(topLevelNodes.get(name)?.ZSXDXF)
    return [name, parsed.categoryOptions[name].length ? parsed.categoryOptions[name] : fallback == null ? [] : [fallback]]
  }))
  return {
    total: parsed.total ?? sumComplete(GRADUATION_CATEGORIES.map((name) => categories[name])),
    categories,
    categoryOptions,
  }
}

export function buildProgramTree(nodes: ProgramNode[]): ProgramTreeNode[] {
  const map = new Map(nodes.map((node) => [node.KZH, { ...node, children: [] as ProgramTreeNode[] }]))
  const roots: ProgramTreeNode[] = []
  map.forEach((node) => {
    const parent = map.get(node.FKZH)
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  })
  const sort = (items: ProgramTreeNode[]) => {
    items.sort(compareNodes)
    items.forEach((item) => sort(item.children))
  }
  sort(roots)
  return roots
}

export function collectCourseLeafIds(nodes: ProgramNode[], nodeId: string): string[] {
  const byParent = new Map<string, ProgramNode[]>()
  nodes.forEach((node) => {
    const siblings = byParent.get(node.FKZH) || []
    siblings.push(node)
    byParent.set(node.FKZH, siblings)
  })
  byParent.forEach((items) => items.sort(compareNodes))
  const result: string[] = []
  const visited = new Set<string>()
  const visit = (id: string) => {
    if (visited.has(id)) return
    visited.add(id)
    const node = nodes.find((item) => item.KZH === id)
    if (!node) return
    if (node.KZLXDM === '01') {
      result.push(id)
      return
    }
    ;(byParent.get(id) || []).forEach((child) => visit(child.KZH))
  }
  visit(nodeId)
  return result
}

export function aggregateNodeCourses(
  nodes: ProgramNode[],
  coursesByNode: Record<string, ProgramCourse[] | undefined>,
  nodeId: string,
): AggregatedNodeCourses {
  const leafIds = collectCourseLeafIds(nodes, nodeId)
  const missingLeafIds = leafIds.filter((id) => !Object.hasOwn(coursesByNode, id))
  const unique = new Map<string, ProgramCourse>()
  leafIds.forEach((id) => {
    ;(coursesByNode[id] || []).forEach((course) => {
      const key = course.KCH
        ? `code:${course.KCH}`
        : `name:${course.KCM}|term:${course.XNXQ || course.XNXQDM_DISPLAY || ''}`
      if (!unique.has(key)) unique.set(key, course)
    })
  })
  return { courses: [...unique.values()], leafIds, missingLeafIds }
}

export function summarizeProgramNode(
  node: ProgramNode,
  nodes: ProgramNode[],
  coursesByNode: Record<string, ProgramCourse[] | undefined>,
  requirements: ProgramRequirements,
): ProgramNodeSummary {
  return summarize(
    node,
    nodes,
    coursesByNode,
    requirements,
    new Set(),
    hasElectiveAncestor(node, nodes, coursesByNode, requirements),
  )
}

export function classifyProgramNodesForYear(
  nodes: ProgramNode[],
  summaries: ReadonlyMap<string, ProgramNodeSummary>,
) {
  const byId = new Map(nodes.map((node) => [node.KZH, node]))
  const hasElectiveAncestor = (node: ProgramNode) => {
    const visited = new Set<string>()
    let parent = byId.get(node.FKZH)
    while (parent && !visited.has(parent.KZH)) {
      if (summaries.get(parent.KZH)?.isElectivePool) return true
      visited.add(parent.KZH)
      parent = byId.get(parent.FKZH)
    }
    return false
  }
  return {
    fixedCourseNodes: nodes.filter((node) => node.KZLXDM === '01' && !summaries.get(node.KZH)?.isElectivePool),
    electivePoolNodes: nodes.filter((node) =>
      summaries.get(node.KZH)?.isElectivePool
      && !hasElectiveAncestor(node)
      && collectCourseLeafIds(nodes, node.KZH).length > 0
    ),
  }
}

function summarize(
  node: ProgramNode,
  nodes: ProgramNode[],
  coursesByNode: Record<string, ProgramCourse[] | undefined>,
  requirements: ProgramRequirements,
  visited: Set<string>,
  inheritedElective: boolean,
): ProgramNodeSummary {
  if (visited.has(node.KZH)) return emptySummary()
  const nextVisited = new Set(visited).add(node.KZH)
  const children = nodes.filter((item) => item.FKZH === node.KZH).sort(compareNodes)
  const { hasUsableCourseList, listedCourses, listedCredits } = resolveNodePool(node, nodes, coursesByNode)
  const requiredCoursesField = positiveNumber(node.ZSXDMS)
  const requiredCreditsField = positiveNumber(node.ZSXDXF)
  const textRequirement = node.FKZH === '-1' ? requirements.categories[node.KZM] : null
  const textRequirementOptions = node.FKZH === '-1' ? requirements.categoryOptions[node.KZM] || [] : []
  const constrainedByText = listedCredits != null
    && textRequirementOptions.some((requirement) => requirement < listedCredits)
  const elective = inheritedElective
    || constrainedByText
    || isElectiveCoursePool(node, listedCourses, listedCredits)

  if (textRequirement != null) {
    const fixedLeafCourses = node.KZLXDM === '01' && !elective
      ? requiredCoursesField ?? listedCourses
      : null
    return {
      requiredCourses: fixedLeafCourses,
      requiredCredits: textRequirement,
      poolCourses: listedCourses,
      poolCredits: listedCredits,
      moduleCount: children.length,
      isElectivePool: elective,
      requiredCreditOptions: requirements.categoryOptions[node.KZM],
      source: 'program-text',
    }
  }

  if (requiredCoursesField != null || requiredCreditsField != null) {
    return {
      requiredCourses: requiredCoursesField,
      requiredCredits: requiredCreditsField,
      poolCourses: listedCourses,
      poolCredits: listedCredits,
      moduleCount: children.length,
      isElectivePool: elective,
      source: 'required-fields',
    }
  }

  if (node.KZLXDM === '01') {
    return {
      ...emptySummary(),
      poolCourses: listedCourses,
      poolCredits: listedCredits,
      isElectivePool: elective,
      source: hasUsableCourseList
        ? 'course-list'
        : listedCourses != null || listedCredits != null ? 'node-fields' : 'unknown',
    }
  }

  const childSummaries = children.map((child) => summarize(child, nodes, coursesByNode, requirements, nextVisited, elective))
  const requiredCourses = sumComplete(childSummaries.map((child) => child.requiredCourses))
  const requiredCredits = sumComplete(childSummaries.map((child) => child.requiredCredits))
  return {
    requiredCourses,
    requiredCredits,
    poolCourses: listedCourses,
    poolCredits: listedCredits,
    moduleCount: children.length,
    isElectivePool: elective,
    source: requiredCourses != null || requiredCredits != null ? 'children' : 'unknown',
  }
}

function hasElectiveAncestor(
  node: ProgramNode,
  nodes: ProgramNode[],
  coursesByNode: Record<string, ProgramCourse[] | undefined>,
  requirements: ProgramRequirements,
) {
  const byId = new Map(nodes.map((item) => [item.KZH, item]))
  const visited = new Set<string>()
  let parent = byId.get(node.FKZH)
  while (parent && !visited.has(parent.KZH)) {
    const { listedCourses, listedCredits } = resolveNodePool(parent, nodes, coursesByNode)
    if (isElectiveCoursePool(parent, listedCourses, listedCredits)) return true
    const textRequirements = parent.FKZH === '-1' ? requirements.categoryOptions[parent.KZM] || [] : []
    if (listedCredits != null && textRequirements.some((requirement) => requirement < listedCredits)) return true
    visited.add(parent.KZH)
    parent = byId.get(parent.FKZH)
  }
  return false
}

function resolveNodePool(
  node: ProgramNode,
  nodes: ProgramNode[],
  coursesByNode: Record<string, ProgramCourse[] | undefined>,
) {
  const aggregate = aggregateNodeCourses(nodes, coursesByNode, node.KZH)
  const hasUsableCourseList = aggregate.leafIds.length > 0
    && aggregate.missingLeafIds.length === 0
    && aggregate.courses.length > 0
  const courseListCredits = hasUsableCourseList ? positiveNumber(sumCredits(aggregate.courses)) : null
  return {
    hasUsableCourseList,
    listedCourses: maximumPositive(
      hasUsableCourseList ? aggregate.courses.length : null,
      node.KCZMS,
    ),
    listedCredits: maximumPositive(courseListCredits, node.KCZXF),
  }
}

function isElectiveCoursePool(node: ProgramNode, poolCourses: number | null, poolCredits: number | null) {
  const requiredCourses = positiveNumber(node.ZSXDMS)
  const requiredCredits = positiveNumber(node.ZSXDXF)
  if (requiredCourses != null && poolCourses != null && requiredCourses < poolCourses) return true
  if (requiredCredits != null && poolCredits != null && requiredCredits < poolCredits) return true
  return /选修|任选|限选|选读/.test(`${node.KZM} ${node.KCLBDM_DISPLAY || ''}`)
}

function sumCredits(courses: ProgramCourse[]) {
  return normalizeNumber(courses.reduce((sum, course) => sum + (numberValue(course.XF) || 0), 0))
}

function sumComplete(values: Array<number | null>) {
  if (!values.length || values.some((value) => value == null)) return null
  return normalizeNumber(values.reduce<number>((sum, value) => sum + (value || 0), 0))
}

function positiveNumber(value: unknown) {
  const number = numberValue(value)
  return number != null && number > 0 ? number : null
}

function maximumPositive(...values: unknown[]) {
  const numbers = values
    .map(positiveNumber)
    .filter((value): value is number => value != null)
  return numbers.length ? Math.max(...numbers) : null
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function normalizeNumber(value: number) {
  return Number(value.toFixed(4))
}

function compareNodes(left: ProgramNode, right: ProgramNode) {
  return (numberValue(left.PX) || 0) - (numberValue(right.PX) || 0) || left.KZH.localeCompare(right.KZH)
}

function emptySummary(): ProgramNodeSummary {
  return {
    requiredCourses: null,
    requiredCredits: null,
    poolCourses: null,
    poolCredits: null,
    moduleCount: 0,
    isElectivePool: false,
    source: 'unknown',
  }
}
