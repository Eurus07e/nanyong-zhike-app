import type { ScheduleCourse } from './types'

export type PlannerStatus = 'backlog' | 'in_progress' | 'done'
export type PlannerTaskSource = 'manual' | 'course'

export type PlannerTask = {
  id: string
  title: string
  date: string
  status: PlannerStatus
  source: PlannerTaskSource
  courseCode?: string
  courseName?: string
  credits?: string
  tags: string[]
  listId?: string
  createdAt: number
  updatedAt: number
}

export type PlannerList = {
  id: string
  name: string
  createdAt: number
  updatedAt: number
}

export type PlannerPlan = {
  id: string
  title: string
  startDate: string
  endDate: string
  tasks: PlannerTask[]
  lists: PlannerList[]
  createdAt: number
  updatedAt: number
}

export type PlannerState = {
  version: 2
  activePlanId: string
  plans: PlannerPlan[]
}

const STORAGE_PREFIX = 'nanyong-planner-alpha-v1:'
const MAX_RAW_SIZE = 1024 * 1024

export const PLANNER_COLUMNS: { id: PlannerStatus; label: string }[] = [
  { id: 'backlog', label: '待安排' },
  { id: 'in_progress', label: '进行中' },
  { id: 'done', label: '已完成' },
]

function uuid() {
  return globalThis.crypto?.randomUUID?.() || `task-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function createPlannerId() {
  return uuid()
}

function localDate(date: Date) {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function todayDate() {
  return localDate(new Date())
}

function parseDate(value: string) {
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(year, (month || 1) - 1, day || 1, 12)
  return Number.isFinite(date.getTime()) ? date : new Date()
}

export function weekDates(value = localDate(new Date())) {
  const date = parseDate(value)
  const day = date.getDay()
  const offset = day === 0 ? -6 : 1 - day
  date.setDate(date.getDate() + offset)
  return Array.from({ length: 7 }, (_, index) => {
    const current = new Date(date)
    current.setDate(date.getDate() + index)
    return localDate(current)
  })
}

function createDefaultLists(now: number, existing: PlannerList[] = []) {
  const lists = existing.slice(0, 5)
  while (lists.length < 5) {
    const index = lists.length + 1
    lists.push({ id: uuid(), name: `自定义列表${index}`, createdAt: now, updatedAt: now })
  }
  return lists
}

function createPlan(referenceDate: string): PlannerPlan {
  const dates = weekDates(referenceDate)
  const now = Date.now()
  const lists = createDefaultLists(now)
  const firstTask: PlannerTask = {
    id: uuid(),
    title: '列出本周最重要的三件事',
    date: dates[0],
    status: 'backlog',
    source: 'manual',
    tags: [],
    createdAt: now,
    updatedAt: now,
  }
  return {
    id: uuid(),
    title: '本周学习计划',
    startDate: dates[0],
    endDate: dates[6],
    tasks: [firstTask],
    lists,
    createdAt: now,
    updatedAt: now,
  }
}

export function createDefaultPlanner(referenceDate = localDate(new Date())): PlannerState {
  const plan = createPlan(referenceDate)
  return { version: 2, activePlanId: plan.id, plans: [plan] }
}

function touch(state: PlannerState, plans: PlannerPlan[]) {
  return { ...state, plans } satisfies PlannerState
}

export function movePlannerTask(state: PlannerState, taskId: string, status: PlannerStatus): PlannerState {
  const now = Date.now()
  return touch(state, state.plans.map((plan) => ({
    ...plan,
    tasks: plan.tasks.map((task) => task.id === taskId ? { ...task, status, updatedAt: now } : task),
    updatedAt: plan.tasks.some((task) => task.id === taskId) ? now : plan.updatedAt,
  })))
}

export function movePlannerTaskDate(state: PlannerState, taskId: string, date: string): PlannerState {
  const now = Date.now()
  return touch(state, state.plans.map((plan) => ({
    ...plan,
    tasks: plan.tasks.map((task) => task.id === taskId ? { ...task, date, listId: undefined, updatedAt: now } : task),
    updatedAt: plan.tasks.some((task) => task.id === taskId) ? now : plan.updatedAt,
  })))
}

export function updatePlannerTaskTitle(state: PlannerState, taskId: string, rawTitle: string): PlannerState {
  const title = rawTitle.trim().slice(0, 300)
  const now = Date.now()
  return touch(state, state.plans.map((plan) => {
    if (!plan.tasks.some((task) => task.id === taskId)) return plan
    return {
      ...plan,
      tasks: title
        ? plan.tasks.map((task) => task.id === taskId ? { ...task, title, updatedAt: now } : task)
        : plan.tasks.filter((task) => task.id !== taskId),
      updatedAt: now,
    }
  }))
}

export function addCourseTask(state: PlannerState, course: Pick<ScheduleCourse, 'KCH' | 'KCM' | 'XF'>, date: string): PlannerState {
  const plan = state.plans.find((item) => item.id === state.activePlanId)
  if (!plan) return state
  const courseCode = String(course.KCH || '').trim()
  if (!courseCode || plan.tasks.some((task) => task.source === 'course' && task.courseCode === courseCode)) return state
  const now = Date.now()
  const task: PlannerTask = {
    id: uuid(),
    title: `完成 ${course.KCM || courseCode}`,
    date,
    status: 'backlog',
    source: 'course',
    courseCode,
    courseName: course.KCM || courseCode,
    credits: course.XF || undefined,
    tags: ['课程'],
    createdAt: now,
    updatedAt: now,
  }
  return touch(state, state.plans.map((item) => item.id === plan.id ? { ...item, tasks: [...item.tasks, task], updatedAt: now } : item))
}

export function addPlannerList(state: PlannerState, name: string): PlannerState {
  const plan = state.plans.find((item) => item.id === state.activePlanId)
  const normalized = name.trim().slice(0, 80)
  if (!plan || !normalized || plan.lists.length >= 5) return state
  const now = Date.now()
  const list: PlannerList = { id: uuid(), name: normalized, createdAt: now, updatedAt: now }
  return touch(state, state.plans.map((item) => item.id === plan.id ? { ...item, lists: [...item.lists, list], updatedAt: now } : item))
}

export function renamePlannerList(state: PlannerState, listId: string, name: string): PlannerState {
  const plan = state.plans.find((item) => item.id === state.activePlanId)
  const normalized = name.trim().slice(0, 80)
  if (!plan || !normalized) return state
  const now = Date.now()
  return touch(state, state.plans.map((item) => item.id === plan.id ? {
    ...item,
    lists: item.lists.map((list) => list.id === listId ? { ...list, name: normalized, updatedAt: now } : list),
    updatedAt: now,
  } : item))
}

export function removePlannerList(state: PlannerState, listId: string): PlannerState {
  const plan = state.plans.find((item) => item.id === state.activePlanId)
  if (!plan || plan.lists.length <= 1) return state
  const replacement = plan.lists.find((list) => list.id !== listId)?.id
  const now = Date.now()
  return touch(state, state.plans.map((item) => item.id === plan.id ? {
    ...item,
    lists: item.lists.filter((list) => list.id !== listId),
    tasks: item.tasks.map((task) => task.listId === listId ? { ...task, listId: replacement, updatedAt: now } : task),
    updatedAt: now,
  } : item))
}

export function movePlannerTaskToList(state: PlannerState, taskId: string, listId: string): PlannerState {
  const plan = state.plans.find((item) => item.id === state.activePlanId)
  if (!plan || !plan.lists.some((list) => list.id === listId)) return state
  const now = Date.now()
  return touch(state, state.plans.map((item) => item.id === plan.id ? {
    ...item,
    tasks: item.tasks.map((task) => task.id === taskId ? { ...task, listId, updatedAt: now } : task),
    updatedAt: now,
  } : item))
}

function isString(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.length <= max
}

function isTask(value: unknown): value is PlannerTask {
  if (!value || typeof value !== 'object') return false
  const task = value as Partial<PlannerTask>
  return isString(task.id, 120) && isString(task.title, 300) && isString(task.date, 10)
    && (task.status === 'backlog' || task.status === 'in_progress' || task.status === 'done')
    && (task.source === 'manual' || task.source === 'course')
    && Array.isArray(task.tags) && task.tags.length <= 20 && task.tags.every((tag) => isString(tag, 40))
    && typeof task.createdAt === 'number' && typeof task.updatedAt === 'number'
}

function isPlan(value: unknown): value is PlannerPlan {
  if (!value || typeof value !== 'object') return false
  const plan = value as Partial<PlannerPlan>
  const lists = plan.lists === undefined ? [] : plan.lists
  return isString(plan.id, 120) && isString(plan.title, 120) && isString(plan.startDate, 10) && isString(plan.endDate, 10)
    && Array.isArray(plan.tasks) && plan.tasks.length <= 600 && plan.tasks.every(isTask)
    && Array.isArray(lists) && lists.length <= 50 && lists.every((list) => list && typeof list === 'object' && isString(list.id, 120) && isString(list.name, 80) && typeof list.createdAt === 'number' && typeof list.updatedAt === 'number')
    && typeof plan.createdAt === 'number' && typeof plan.updatedAt === 'number'
}

function normalizePlan(plan: PlannerPlan): PlannerPlan {
  const now = Date.now()
  const lists = createDefaultLists(now, plan.lists)
  const listIds = new Set(lists.map((list) => list.id))
  return { ...plan, lists, tasks: plan.tasks.map((task) => ({ ...task, listId: task.listId && listIds.has(task.listId) ? task.listId : undefined })) }
}

function migrateLegacyPlan(plan: PlannerPlan): PlannerPlan {
  return {
    ...plan,
    tasks: plan.tasks.flatMap((task) => task.listId ? [
      { ...task, listId: undefined },
      { ...task, id: uuid() },
    ] : [task]),
  }
}

export function parsePlannerState(raw: string | null | undefined): PlannerState {
  if (!raw || raw.length > MAX_RAW_SIZE) return createDefaultPlanner()
  try {
    const value: unknown = JSON.parse(raw)
    if (!value || typeof value !== 'object') return createDefaultPlanner()
    const state = value as Partial<Omit<PlannerState, 'version'>> & { version?: number }
    if ((state.version !== 1 && state.version !== 2) || !Array.isArray(state.plans) || state.plans.length === 0 || state.plans.length > 20 || !state.plans.every(isPlan)) return createDefaultPlanner()
    const activePlanId = typeof state.activePlanId === 'string' && state.plans.some((plan) => plan.id === state.activePlanId)
      ? state.activePlanId : state.plans[0].id
    const plans = state.plans.map((plan) => {
      const normalized = normalizePlan(plan)
      return state.version === 1 ? migrateLegacyPlan(normalized) : normalized
    })
    return { version: 2, activePlanId: plans.some((plan) => plan.id === activePlanId) ? activePlanId : plans[0].id, plans }
  } catch {
    return createDefaultPlanner()
  }
}

function accountKey(username: string) {
  let hash = 5381
  for (const character of username) hash = ((hash << 5) + hash) ^ character.charCodeAt(0)
  return `${STORAGE_PREFIX}${(hash >>> 0).toString(36)}`
}

export function loadPlanner(username: string): PlannerState {
  if (typeof localStorage === 'undefined') return createDefaultPlanner()
  return parsePlannerState(localStorage.getItem(accountKey(username)))
}

export function savePlanner(username: string, state: PlannerState) {
  if (typeof localStorage !== 'undefined') localStorage.setItem(accountKey(username), JSON.stringify(state))
}

export function createCustomPlan(title: string, referenceDate = localDate(new Date())): PlannerPlan {
  const dates = weekDates(referenceDate)
  const now = Date.now()
  return { id: uuid(), title: title.trim() || '我的新计划', startDate: dates[0], endDate: dates[6], tasks: [], lists: createDefaultLists(now), createdAt: now, updatedAt: now }
}

export function dateLabel(value: string) {
  const date = parseDate(value)
  return `${date.getMonth() + 1}/${date.getDate()}`
}

export function weekdayLabel(value: string) {
  return ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][parseDate(value).getDay()]
}
