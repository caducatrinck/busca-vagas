import { updateMonitor } from '../store.js'
import type { MonitorRunResult } from './types.js'

export const timers = new Map<string, NodeJS.Timeout>()
export const running = new Map<string, Promise<MonitorRunResult>>()
export const aborts = new Map<string, AbortController>()
export const scheduledRunAt = new Map<string, number>()

export const STAGGER_MS = 5 * 60 * 1000

function sameMinute(a: number, b: number): boolean {
  return Math.floor(a / 60_000) === Math.floor(b / 60_000)
}

export function resolveStaggeredSlot(id: string, desired: number): number {

  let slot = Math.max(desired, Date.now() + 1_000)
  let guard = 0
  while (guard < 240) {
    const clash = [...scheduledRunAt.entries()].some(
      ([otherId, at]) => otherId !== id && sameMinute(at, slot),
    )
    if (!clash) break
    slot += STAGGER_MS
    guard += 1
  }
  return slot
}

export function persistNextRunAt(id: string, at: number | null) {
  void updateMonitor(id, {
    nextRunAt: at === null ? null : new Date(at).toISOString(),
  })
}

export function clearMonitorTimer(id: string) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  scheduledRunAt.delete(id)
}

export function clearAllTimers() {
  for (const id of timers.keys()) clearMonitorTimer(id)
}

export function cancelMonitorRun(id: string): boolean {
  const ac = aborts.get(id)
  if (!ac) return false
  ac.abort()
  return true
}

export function isMonitorRunning(id: string): boolean {
  return running.has(id)
}
