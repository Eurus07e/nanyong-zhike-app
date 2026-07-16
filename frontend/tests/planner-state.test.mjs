import assert from 'node:assert/strict'
import test from 'node:test'

import {
  addPlannerList,
  addCourseTask,
  createDefaultPlanner,
  movePlannerTaskDate,
  movePlannerTask,
  parsePlannerState,
  weekDates,
} from '../src/planner-state.ts'

test('calculates Monday through Sunday for a given date', () => {
  assert.deepEqual(weekDates('2026-07-16'), [
    '2026-07-13', '2026-07-14', '2026-07-15', '2026-07-16', '2026-07-17', '2026-07-18', '2026-07-19',
  ])
})

test('starts with five user-editable custom lists', () => {
  const state = createDefaultPlanner('2026-07-16')
  const next = addPlannerList(state, '阅读清单')

  assert.equal(state.plans[0].lists.length, 5)
  assert.equal(state.plans[0].lists[0].name, '自定义列表1')
  assert.equal(next.plans[0].lists.length, 5)
})

test('never creates more than five custom lists', () => {
  let state = createDefaultPlanner('2026-07-16')
  for (let index = 1; index <= 6; index += 1) state = addPlannerList(state, `列表 ${index}`)

  assert.equal(state.plans[0].lists.length, 5)
})

test('adds a course task once and keeps the task tied to its course', () => {
  const state = createDefaultPlanner('2026-07-16')
  const course = { KCH: 'CS101', KCM: '数据结构', XF: '3' }
  const once = addCourseTask(state, course, '2026-07-16')
  const twice = addCourseTask(once, course, '2026-07-16')
  const plan = twice.plans[0]

  assert.equal(once.plans[0].tasks.length, 2)
  assert.equal(plan.tasks.length, 2)
  assert.equal(plan.tasks[1].courseCode, 'CS101')
})

test('moves a task between board columns without changing other tasks', () => {
  const state = createDefaultPlanner('2026-07-16')
  const task = { ...state.plans[0].tasks[0], status: 'in_progress' }
  const next = movePlannerTask({ ...state, plans: [{ ...state.plans[0], tasks: [task, ...state.plans[0].tasks] }] }, task.id, 'done')

  assert.equal(next.plans[0].tasks.find((item) => item.id === task.id)?.status, 'done')
  assert.equal(next.plans[0].tasks.length, state.plans[0].tasks.length + 1)
})

test('moves a task to another day while keeping its status and course metadata', () => {
  const base = addCourseTask(createDefaultPlanner('2026-07-16'), { KCH: 'CS101', KCM: '数据结构', XF: '3' }, '2026-07-16')
  const task = { ...base.plans[0].tasks[1], listId: base.plans[0].lists[0].id }
  const state = { ...base, plans: [{ ...base.plans[0], tasks: [base.plans[0].tasks[0], task] }] }
  const next = movePlannerTaskDate(state, task.id, '2026-07-18')
  const moved = next.plans[0].tasks.find((item) => item.id === task.id)

  assert.equal(moved?.date, '2026-07-18')
  assert.equal(moved?.status, 'backlog')
  assert.equal(moved?.courseCode, 'CS101')
  assert.equal(moved?.listId, undefined)
})

test('migrates a shared legacy task into independent day and list tasks once', () => {
  const legacy = createDefaultPlanner('2026-07-16')
  const listId = legacy.plans[0].lists[0].id
  legacy.plans[0].tasks[0].listId = listId
  const migrated = parsePlannerState(JSON.stringify({ ...legacy, version: 1 }))
  const [dayTask, listTask] = migrated.plans[0].tasks

  assert.equal(migrated.version, 2)
  assert.equal(migrated.plans[0].tasks.length, 2)
  assert.notEqual(dayTask.id, listTask.id)
  assert.equal(dayTask.listId, undefined)
  assert.equal(listTask.listId, listId)

  const toggled = movePlannerTask(migrated, dayTask.id, 'done')
  assert.equal(toggled.plans[0].tasks.find((task) => task.id === dayTask.id)?.status, 'done')
  assert.equal(toggled.plans[0].tasks.find((task) => task.id === listTask.id)?.status, 'backlog')
})

test('keeps a large migrated plan valid after it is saved again', () => {
  const legacy = createDefaultPlanner('2026-07-16')
  const template = { ...legacy.plans[0].tasks[0], listId: legacy.plans[0].lists[0].id }
  legacy.plans[0].tasks = Array.from({ length: 160 }, (_, index) => ({ ...template, id: `legacy-${index}` }))

  const migrated = parsePlannerState(JSON.stringify({ ...legacy, version: 1 }))
  const reloaded = parsePlannerState(JSON.stringify(migrated))

  assert.equal(migrated.plans[0].tasks.length, 320)
  assert.equal(reloaded.plans[0].tasks.length, 320)
})

test('deletes a task when its edited title is cleared', async () => {
  const plannerState = await import('../src/planner-state.ts')
  assert.equal(typeof plannerState.updatePlannerTaskTitle, 'function')

  const state = createDefaultPlanner('2026-07-16')
  const taskId = state.plans[0].tasks[0].id
  const next = plannerState.updatePlannerTaskTitle(state, taskId, '   ')

  assert.equal(next.plans[0].tasks.some((task) => task.id === taskId), false)
})

test('rejects malformed or oversized local state and returns a fresh default', () => {
  const parsed = parsePlannerState('{"version":999}')
  assert.equal(parsed.version, 2)
  assert.ok(parsed.plans.length >= 1)
})
