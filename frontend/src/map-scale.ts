const MIN_MAP_SCALE = 0.7
const MAX_MAP_SCALE = 1
const MAP_SCALE_STEP = 0.1


export function adjustMapScale(current: number, direction: -1 | 1) {
  const next = current + direction * MAP_SCALE_STEP
  return Number(Math.min(MAX_MAP_SCALE, Math.max(MIN_MAP_SCALE, next)).toFixed(1))
}


export function formatMapScale(scale: number) {
  return `${Math.round(scale * 100)}%`
}
