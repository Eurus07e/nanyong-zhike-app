import type { PlanDocument, PlannerCourse, PlanResource } from './types'

export type CreatePlanInput = {
  templateId: PlanDocument['templateId']
  title: string
  goal: string
  startDate: string
  endDate: string
  courses: PlannerCourse[]
  resources: PlanResource[]
}

export function createPlan(input: CreatePlanInput): PlanDocument {
  const now = new Date().toISOString()
  const tasks = input.courses.slice(0, 8).map((course) => ({
    id: crypto.randomUUID(),
    text: input.templateId === 'cross-major' ? `整理 ${course.name} 的准入要求与本周交付物` : `完成 ${course.name} 的本周学习任务`,
    done: false,
  }))
  if (tasks.length === 0) tasks.push({ id: crypto.randomUUID(), text: '添加本周第一项学习任务', done: false })
  return {
    schemaVersion: 1,
    id: crypto.randomUUID(),
    templateId: input.templateId,
    title: input.title.trim(),
    goal: input.goal.trim(),
    startDate: input.startDate,
    endDate: input.endDate,
    courses: input.courses,
    tasks,
    resources: input.resources,
    weeklyReview: '',
    createdAt: now,
    updatedAt: now,
  }
}
