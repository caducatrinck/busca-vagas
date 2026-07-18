import { getMonitor, getStore, listMonitors, updateMonitor, type Monitor } from '../store.js'
import {
  clearAllTimers,
  clearMonitorTimer,
  isMonitorRunning,
  persistNextRunAt,
  resolveStaggeredSlot,
  scheduledRunAt,
  timers,
} from './runtime.js'
import { runMonitor } from './runMonitor.js'
import type { MonitorRunCallbacks, MonitorStatus } from './types.js'

export function scheduleMonitor(monitor: Monitor) {
  clearMonitorTimer(monitor.id)
  if (!monitor.pollingEnabled || !monitor.search.query?.trim()) return

  const intervalMs = monitor.intervalMinutes * 60 * 1000

  const desired = monitor.nextRunAt
    ? new Date(monitor.nextRunAt).getTime()
    : monitor.lastRunAt
      ? new Date(monitor.lastRunAt).getTime() + intervalMs
      : Date.now() + intervalMs

  armTimer(monitor.id, desired)
}

export function armTimer(id: string, desired: number) {
  clearTimeout(timers.get(id))
  timers.delete(id)

  const slot = resolveStaggeredSlot(id, desired)
  scheduledRunAt.set(id, slot)
  persistNextRunAt(id, slot)
  const delay = Math.max(1_000, slot - Date.now())

  timers.set(
    id,
    setTimeout(() => {

      timers.delete(id)

      void (async () => {
        const label =
          (await getMonitor(id))?.search.query?.trim() || id.slice(0, 8)
        console.log(`[poller] iniciando busca automática · ${label}`)
        let result: {
          newCount: number
          error?: string
          cancelled?: boolean
          retryAfterMs?: number
        } = { newCount: 0 }
        try {
          result = await runMonitor(id, {}, 'pooling')
        } catch {
          result = { newCount: 0, error: 'Falha inesperada no pooling' }
        }
        console.log(
          `[poller] fim · ${label} · novas=${result.newCount}` +
            (result.error ? ` · erro=${result.error}` : '') +
            (result.cancelled ? ' · cancelada' : ''),
        )

        const current = await getMonitor(id)
        if (!current?.pollingEnabled || !current.search.query?.trim()) {
          scheduledRunAt.delete(id)
          persistNextRunAt(id, null)
          return
        }
        if (result.retryAfterMs) {
          armTimer(id, Date.now() + result.retryAfterMs)
          return
        }
        const ms = current.intervalMinutes * 60 * 1000
        const last = current.lastRunAt
          ? new Date(current.lastRunAt).getTime()
          : Date.now()

        const next = Math.max(last + ms, Date.now() + Math.min(ms, 60_000))
        armTimer(id, next)
      })()
    }, delay),
  )
}

export async function syncSchedulers(): Promise<void> {
  const monitors = await listMonitors()
  clearAllTimers()

  for (const monitor of monitors) {
    if (monitor.pollingEnabled && monitor.nextRunAt) {
      scheduledRunAt.set(monitor.id, new Date(monitor.nextRunAt).getTime())
    }
  }

  for (const monitor of monitors) {

    if (
      monitor.lastError &&
      /aguarde|pausa|limite|rate|intervalo|hora|dia|proteção local|anti-spam|entre buscas|nenhuma vaga encontrada/i.test(
        monitor.lastError,
      )
    ) {
      await updateMonitor(monitor.id, { lastError: null })
    }
    if (monitor.pollingEnabled && monitor.search.query?.trim()) {
      scheduleMonitor(monitor)
    } else if (monitor.nextRunAt) {
      persistNextRunAt(monitor.id, null)
    }
  }
}

export async function getMonitorStatus(id: string): Promise<MonitorStatus | null> {
  const monitor = await getMonitor(id)
  if (!monitor) return null

  let nextRunAt: string | null = null
  if (monitor.pollingEnabled) {
    const planned = scheduledRunAt.get(monitor.id)
    if (planned) {

      nextRunAt = new Date(planned).toISOString()
    } else if (monitor.nextRunAt) {
      nextRunAt = monitor.nextRunAt
    } else {
      const intervalMs = monitor.intervalMinutes * 60 * 1000
      const base = monitor.lastRunAt
        ? new Date(monitor.lastRunAt).getTime()
        : Date.now()
      nextRunAt = new Date(base + intervalMs).toISOString()
    }
  }

  return {
    ...monitor,

    ticking: isMonitorRunning(id),
    nextRunAt,
  }
}

export async function listMonitorStatuses(): Promise<MonitorStatus[]> {
  const monitors = await listMonitors()
  for (const monitor of monitors) {
    if (
      monitor.pollingEnabled &&
      monitor.search.query?.trim() &&
      !isMonitorRunning(monitor.id) &&
      !timers.has(monitor.id)
    ) {
      console.log(
        `[poller] revivendo timer órfão · ${monitor.search.query} (${monitor.id.slice(0, 8)})`,
      )
      scheduleMonitor(monitor)
    }
  }
  const statuses: MonitorStatus[] = []
  for (const monitor of monitors) {
    const status = await getMonitorStatus(monitor.id)
    if (status) statuses.push(status)
  }
  return statuses
}

export async function runMonitorNow(
  id: string,
  callbacks: MonitorRunCallbacks = {},
): Promise<MonitorStatus | null> {
  const monitor = await getMonitor(id)
  if (!monitor) return null

  const store = await getStore()
  await updateMonitor(id, {
    knownIdsAtStart: Object.keys(store.jobs),
  })

  const result = await runMonitor(id, callbacks, 'manual')
  await syncSchedulers()
  const status = await getMonitorStatus(id)
  if (!status) return null
  if (result.error && !status.lastError) {
    return { ...status, lastError: result.error }
  }
  return status
}

export async function setMonitorPolling(
  id: string,
  pollingEnabled: boolean,
  intervalMinutes?: number,
): Promise<MonitorStatus | null> {
  const monitor = await getMonitor(id)
  if (!monitor) return null

  const minutes = Math.min(
    Math.max(intervalMinutes ?? monitor.intervalMinutes, 1),
    120,
  )

  const store = await getStore()
  await updateMonitor(id, {
    pollingEnabled,
    intervalMinutes: minutes,
    knownIdsAtStart: pollingEnabled
      ? Object.keys(store.jobs)
      : monitor.knownIdsAtStart,
    lastError: null,
    nextRunAt: null,
  })

  if (pollingEnabled) {

    clearMonitorTimer(id)
    await syncSchedulers()
  } else {
    clearMonitorTimer(id)
  }

  return getMonitorStatus(id)
}

export async function restoreSchedulersFromDisk(): Promise<void> {
  clearAllTimers()
  await syncSchedulers()
}
