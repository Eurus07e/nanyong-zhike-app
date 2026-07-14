import { describe, expect, it } from 'vitest'
import { createPlan } from './templates'
import { parsePlanFile } from './storage'

describe('planner templates', () => {
  it('creates course-specific tasks without personal hard-coded content', () => {
    const plan = createPlan({
      templateId: 'semester',
      title: '春季计划',
      goal: '完成核心课',
      startDate: '2026-02-20',
      endDate: '2026-06-30',
      courses: [{ id: 'CS001', name: '数据结构' }],
      resources: [],
    })

    expect(plan.tasks).toHaveLength(1)
    expect(plan.tasks[0].text).toContain('数据结构')
    expect(JSON.stringify(plan)).not.toContain('数字经济')
  })
})

describe('planner import validation', () => {
  it('round-trips a generated plan', () => {
    const plan = createPlan({
      templateId: 'cross-major',
      title: '准入课计划',
      goal: '完成准入要求',
      startDate: '2026-02-20',
      endDate: '2026-12-31',
      courses: [],
      resources: [{ id: crypto.randomUUID(), label: '院系通知', url: 'https://example.com/notice' }],
    })

    expect(parsePlanFile(JSON.stringify(plan))).toEqual(plan)
  })

  it('rejects executable resource protocols', () => {
    const plan = createPlan({
      templateId: 'semester',
      title: '计划',
      goal: '目标',
      startDate: '2026-02-20',
      endDate: '2026-06-30',
      courses: [],
      resources: [],
    })
    const unsafe = { ...plan, resources: [{ id: 'resource-1', label: '危险链接', url: 'javascript:alert(1)' }] }

    expect(() => parsePlanFile(JSON.stringify(unsafe))).toThrow('计划文件格式或字段不符合要求')
  })
})
