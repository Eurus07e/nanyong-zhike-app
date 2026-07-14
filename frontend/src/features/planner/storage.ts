import type { PlanDocument, PlannerEnvelope } from './types'

const EMPTY: PlannerEnvelope = { schemaVersion: 1, plans: [], activePlanId: null }

function accountHash(username: string) {
  let hash = 5381
  for (const character of username) hash = ((hash << 5) + hash) ^ character.charCodeAt(0)
  return (hash >>> 0).toString(36)
}

function storageKey(username: string) {
  return `nanyong-planner-v1:${accountHash(username)}`
}

function isString(value: unknown, maxLength: number) {
  return typeof value === 'string' && value.length <= maxLength
}

function isPlan(value: unknown): value is PlanDocument {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<PlanDocument>
  if (plan.schemaVersion !== 1 || !isString(plan.id, 100) || !isString(plan.title, 120) || !isString(plan.goal, 1000)) return false
  if (plan.templateId !== 'semester' && plan.templateId !== 'cross-major') return false
  if (!isString(plan.startDate, 10) || !isString(plan.endDate, 10) || !isString(plan.weeklyReview, 4000)) return false
  if (!isString(plan.createdAt, 40) || !isString(plan.updatedAt, 40)) return false
  if (!Array.isArray(plan.courses) || plan.courses.length > 60 || !plan.courses.every((course) => (
    course && typeof course === 'object' && isString(course.id, 100) && isString(course.name, 120) && (course.credits === undefined || isString(course.credits, 20))
  ))) return false
  if (!Array.isArray(plan.tasks) || plan.tasks.length > 200 || !plan.tasks.every((task) => (
    task && typeof task === 'object' && isString(task.id, 100) && isString(task.text, 300) && typeof task.done === 'boolean'
  ))) return false
  return Array.isArray(plan.resources) && plan.resources.length <= 100 && plan.resources.every((resource) => (
    resource && typeof resource === 'object' && isString(resource.id, 100) && isString(resource.label, 300)
    && (resource.url === undefined || (isString(resource.url, 2000) && /^https?:\/\//.test(resource.url)))
  ))
}

export function parsePlanFile(text: string): PlanDocument {
  if (new Blob([text]).size > 1024 * 1024) throw new Error('计划文件不能超过 1 MB')
  let value: unknown
  try { value = JSON.parse(text) } catch { throw new Error('计划文件不是有效的 JSON') }
  if (!isPlan(value)) throw new Error('计划文件格式或字段不符合要求')
  return value
}

export function loadPlanner(username: string): PlannerEnvelope {
  const raw = localStorage.getItem(storageKey(username))
  if (!raw) return EMPTY
  try {
    const value = JSON.parse(raw) as Partial<PlannerEnvelope>
    if (value.schemaVersion !== 1 || !Array.isArray(value.plans) || value.plans.length > 30 || !value.plans.every(isPlan)) return EMPTY
    const activePlanId = typeof value.activePlanId === 'string' && value.plans.some((plan) => plan.id === value.activePlanId)
      ? value.activePlanId
      : value.plans[0]?.id ?? null
    return { schemaVersion: 1, plans: value.plans, activePlanId }
  } catch {
    return EMPTY
  }
}

export function savePlanner(username: string, envelope: PlannerEnvelope) {
  localStorage.setItem(storageKey(username), JSON.stringify(envelope))
}

export function clearPlanner(username: string) {
  localStorage.removeItem(storageKey(username))
}
