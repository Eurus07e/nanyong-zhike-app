import type { FiveEducationGrowthModule } from './types'


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
