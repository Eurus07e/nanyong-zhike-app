import type { FiveEducationActivity, FiveEducationGrowthModule } from './types'


export type RadarPoint = { x: number; y: number }


export function radarPoints(
  values: number[],
  maxima: number[],
  centerX: number,
  centerY: number,
  radius: number,
): RadarPoint[] {
  const count = Math.min(values.length, maxima.length)
  if (!count) return []
  return Array.from({ length: count }, (_, index) => {
    const maximum = Number.isFinite(maxima[index]) ? Math.max(0, maxima[index]) : 0
    const value = Number.isFinite(values[index]) ? Math.max(0, values[index]) : 0
    const ratio = maximum > 0 ? Math.min(value / maximum, 1) : 0
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / count)
    return {
      x: Number((centerX + Math.cos(angle) * radius * ratio).toFixed(2)),
      y: Number((centerY + Math.sin(angle) * radius * ratio).toFixed(2)),
    }
  })
}


export function radarPolygon(points: RadarPoint[]) {
  return points.map(({ x, y }) => `${x},${y}`).join(' ')
}


export function moduleProgress(
  module: Pick<FiveEducationGrowthModule, 'actualDuration' | 'requiredDuration'>,
) {
  if (module.requiredDuration <= 0) return null
  return Math.min(Math.max(module.actualDuration / module.requiredDuration, 0), 1)
}


export function formatDuration(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0'
  return Number(value.toFixed(2)).toString()
}

export type FiveEducationActivityStatus = 'all' | 'recognized' | 'pending-review'
export type FiveEducationActivitySort = 'time-desc' | 'time-asc' | 'title'

export function filterFiveEducationActivities<T extends Partial<FiveEducationActivity>>(
  items: T[], keyword: string, status: FiveEducationActivityStatus,
) {
  const query = keyword.trim().toLocaleLowerCase('zh-CN')
  return items.filter((item) => {
    const text = [item.title, item.organizer, item.location, item.category, item.module]
      .filter(Boolean).join(' ').toLocaleLowerCase('zh-CN')
    const matchesQuery = !query || text.includes(query)
    const matchesStatus = status === 'all'
      || (status === 'recognized' && Number(item.recognizedDuration || 0) > 0)
      || (status === 'pending-review' && item.reviewStatus === '未评价')
    return matchesQuery && matchesStatus
  })
}

export function sortFiveEducationActivities<T extends Partial<FiveEducationActivity>>(
  items: T[], sort: FiveEducationActivitySort,
) {
  return [...items].sort((left, right) => {
    if (sort === 'title') return String(left.title || '').localeCompare(String(right.title || ''), 'zh-CN')
    const leftTime = Date.parse(left.activityStart || '') || 0
    const rightTime = Date.parse(right.activityStart || '') || 0
    return sort === 'time-asc' ? leftTime - rightTime : rightTime - leftTime
  })
}

export function formatActivityDate(value: string | null | undefined) {
  if (!value) return '时间待上游确认'
  const date = new Date(value)
  if (!Number.isFinite(date.getTime())) return '时间待上游确认'
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date)
}
