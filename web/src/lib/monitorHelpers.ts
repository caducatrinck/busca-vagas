import type { Job, Monitor } from './types'

export const LONG_SEARCH_CHIME_MS = 15_000
export const BASE_TITLE = 'Busca Vagas'
export const MAX_NOTIFICATIONS = 40

export const POOL_CHECK_AFTER_MS = 8_000

export const POOL_CHECK_MAX_MS = 5 * 60_000

export const POOL_CHECK_OVERDUE_MS = 3_000

export const POOL_CHECK_TICKING_MS = 2_000

export const POOL_CHECK_SOON_MS = 5_000

export const POOL_CHECK_MIN_MS = 15_000

export function mergeJobs(prev: Job[], incoming: Job[]): Job[] {
  const map = new Map((Array.isArray(prev) ? prev : []).map((j) => [j.id, j]))
  for (const job of Array.isArray(incoming) ? incoming : []) {
    const existing = map.get(job.id)
    map.set(job.id, existing ? { ...existing, ...job } : job)
  }
  return [...map.values()].sort((a, b) =>
    (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''),
  )
}

export function runKey(monitor: Monitor): string | null {
  if (!monitor.lastRunAt) return null
  // Só lastRunAt: newCount muda no meio do run e não deve gerar chave nova.
  return `${monitor.id}:${monitor.lastRunAt}`
}

export function msUntilNextPoolCheck(monitors: Monitor[], now = Date.now()): number {
  if (monitors.some((m) => m.ticking)) return POOL_CHECK_TICKING_MS

  const nextTimes = monitors
    .filter((m) => m.pollingEnabled && m.nextRunAt)
    .map((m) => new Date(m.nextRunAt!).getTime())
  if (nextTimes.length === 0) return POOL_CHECK_MAX_MS
  const soonest = Math.min(...nextTimes)
  const until = soonest - now
  const delay = until + POOL_CHECK_AFTER_MS

  if (delay <= 0) {
    return POOL_CHECK_OVERDUE_MS
  }
  if (until <= 30_000) {
    return Math.min(Math.max(until, 2_000), POOL_CHECK_SOON_MS)
  }
  return Math.min(Math.max(delay, POOL_CHECK_MIN_MS), POOL_CHECK_MAX_MS)
}
