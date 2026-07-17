import { searchLinkedInJobs } from './linkedin.js'
import { searchRateLimiter } from './rateLimit.js'
import {
  getAppSettings,
  getJobSearchHints,
  getMonitor,
  getStore,
  isAppConfigured,
  listMonitors,
  updateMonitor,
  upsertSearchResults,
  withNewFlag,
  type Monitor,
  type StoredJob,
} from './store.js'
import type { SearchProgressCallback, SearchRunStats } from './types.js'
import { SearchCancelledError } from './types.js'
import { resolvePoolingPostedSeconds as resolvePoolingWindow } from './domain/poolingWindow.js'

const timers = new Map<string, NodeJS.Timeout>()
const running = new Map<string, Promise<{ newCount: number; error?: string; cancelled?: boolean }>>()
const aborts = new Map<string, AbortController>()

const scheduledRunAt = new Map<string, number>()

const STAGGER_MS = 5 * 60 * 1000

function sameMinute(a: number, b: number): boolean {
  return Math.floor(a / 60_000) === Math.floor(b / 60_000)
}

function resolveStaggeredSlot(id: string, desired: number): number {
  let slot = desired
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

export type MonitorStatus = Monitor & {
  ticking: boolean
  nextRunAt: string | null
}

export type MonitorRunCallbacks = {
  onProgress?: SearchProgressCallback
  onJobs?: (jobs: Array<StoredJob & { isNew?: boolean }>) => void
}

export type MonitorRunMode = 'manual' | 'pooling'

export function resolvePoolingPostedSeconds(
  intervalMinutes: number,
  lastRunAt: string | null,
  now = Date.now(),
): number {
  return resolvePoolingWindow(intervalMinutes, lastRunAt, now)
}

function clearMonitorTimer(id: string) {
  const timer = timers.get(id)
  if (timer) {
    clearTimeout(timer)
    timers.delete(id)
  }
  scheduledRunAt.delete(id)
}

function persistNextRunAt(id: string, at: number | null) {
  void updateMonitor(id, {
    nextRunAt: at === null ? null : new Date(at).toISOString(),
  })
}

function clearAllTimers() {
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

async function runMonitor(
  id: string,
  callbacks: MonitorRunCallbacks = {},
  mode: MonitorRunMode = 'pooling',
): Promise<{
  newCount: number
  error?: string
  cancelled?: boolean

  retryAfterMs?: number
}> {
  const existing = running.get(id)
  if (existing) {
    return existing
  }

  const ac = new AbortController()
  aborts.set(id, ac)
  const startedAt = Date.now()
  let baselineKnown = new Set<string>()
  let searchTelemetry: Pick<
    SearchRunStats,
    | 'linkedinResponded'
    | 'listingRequests'
    | 'listingPagesWithJobs'
    | 'emptyReason'
  > = {}

  const promise = (async () => {
    const monitor = await getMonitor(id)
    if (!monitor?.search?.query?.trim()) {
      return { newCount: 0 }
    }

    const appSettings = await getAppSettings()
    if (!isAppConfigured(appSettings)) {
      const message =
        'Configure o cookie li_at em Configurações antes de buscar vagas.'
      callbacks.onProgress?.({
        phase: 'error',
        label: 'Configuração necessária',
        message,
        overallPercent: 0,
        listing: { current: 0, total: null },
        descriptions: { current: 0, total: 0 },
        startedAt,
        elapsedMs: Date.now() - startedAt,
        etaSeconds: null,
      })
      await updateMonitor(id, { lastError: message })
      return { newCount: 0, error: message }
    }

    const store = await getStore()
    baselineKnown = new Set(Object.keys(store.jobs))

    try {
      searchRateLimiter.assertAllowed()
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Rate limit'
      const rawRetry =
        (err as Error & { retryAfterMs?: number }).retryAfterMs ?? 30_000

      const retryAfterMs = Math.max(1_000, rawRetry + 500)

      if (mode === 'manual') {
        callbacks.onProgress?.({
          phase: 'error',
          label: 'Limite de buscas',
          message,
          overallPercent: 0,
          listing: { current: 0, total: null },
          descriptions: { current: 0, total: 0 },
          startedAt,
          elapsedMs: Date.now() - startedAt,
          etaSeconds: null,
        })
        await updateMonitor(id, { lastError: message })
      } else {
        await updateMonitor(id, { lastError: message })
      }
      return { newCount: 0, error: message, retryAfterMs }
    }

    const countNewAgainstBaseline = (jobs: { id: string }[]) =>
      jobs.reduce((n, j) => n + (baselineKnown.has(j.id) ? 0 : 1), 0)

    const emitJobs = async (batch: Parameters<typeof upsertSearchResults>[0]) => {
      if (batch.length === 0) return
      const { jobs, newJobs } = await upsertSearchResults(batch, id)
      const flagged = withNewFlag(
        jobs,
        newJobs.map((j) => j.id),
      )
      callbacks.onJobs?.(flagged)
    }

    const onListingComplete = async (listed: Parameters<typeof upsertSearchResults>[0]) => {
      const { jobs } = await upsertSearchResults(listed, id)
      const newCount = countNewAgainstBaseline(listed)

      await updateMonitor(id, {
        newCountLastRun: newCount,
        lastError: null,
      })
      const flagged = withNewFlag(
        jobs,
        listed.filter((j) => !baselineKnown.has(j.id)).map((j) => j.id),
      )
      callbacks.onJobs?.(flagged)
      callbacks.onProgress?.({
        phase: 'listing',
        label: `Listagem pronta · ${listed.length} vaga(s)`,
        overallPercent: Boolean(monitor.search.fetchDescriptions) ? 48 : 92,
        listing: { current: listed.length, total: listed.length },
        descriptions: { current: 0, total: 0 },
        startedAt,
        elapsedMs: Date.now() - startedAt,
        etaSeconds: Boolean(monitor.search.fetchDescriptions) ? null : 0,
        message:
          newCount > 0
            ? `${newCount} nova(s) — buscando descrições…`
            : 'Nenhuma nova nesta listagem',
      })
    }

    try {
      const hints = await getJobSearchHints()
      const postedWithinSeconds =
        mode === 'pooling' || monitor.pollingEnabled
          ? resolvePoolingPostedSeconds(
              monitor.intervalMinutes,
              monitor.lastRunAt,
              startedAt,
            )
          : undefined

      const found = await searchLinkedInJobs(
        {
          ...monitor.search,
          fetchDescriptions: Boolean(monitor.search.fetchDescriptions),
          ...(postedWithinSeconds != null ? { postedWithinSeconds } : {}),
        },
        {
          discardedIds: hints.discardedIds,
          knownDescriptions: hints.knownDescriptions,
          knownWorkplaceTypes: hints.knownWorkplaceTypes,
          onProgress: callbacks.onProgress,
          onJobsBatch: emitJobs,
          onListingComplete,
          onTelemetry: (telemetry) => {
            searchTelemetry = telemetry
          },
          signal: ac.signal,
        },
      )
      searchRateLimiter.recordSearch()

      callbacks.onProgress?.({
        phase: 'saving',
        label: 'Salvando resultados…',
        overallPercent: 98,
        listing: { current: found.length, total: found.length },
        descriptions: {
          current: found.filter((j) => j.description?.trim()).length,
          total: found.length,
        },
        startedAt,
        elapsedMs: Date.now() - startedAt,
        etaSeconds: 1,
      })

      await upsertSearchResults(found, id)
      const newCount = countNewAgainstBaseline(found)
      const stats: SearchRunStats = {
        jobCount: found.length,
        newCount,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        cancelled: false,
        ...searchTelemetry,
      }
      await updateMonitor(id, {
        lastRunAt: stats.finishedAt,
        lastError: null,
        newCountLastRun: newCount,
        lastRunMode: mode,
        lastRunStats: stats,
      })

      callbacks.onProgress?.({
        phase: 'done',
        label: 'Busca concluída',
        message:
          newCount > 0
            ? `${newCount} nova(s) vaga(s)`
            : (searchTelemetry.emptyReason ?? 'Nenhuma vaga nova nesta rodada'),
        overallPercent: 100,
        listing: { current: found.length, total: found.length },
        descriptions: {
          current: found.filter((j) => j.description?.trim()).length,
          total: found.length,
        },
        startedAt,
        elapsedMs: stats.durationMs,
        etaSeconds: 0,
      })

      return { newCount }
    } catch (err) {
      if (err instanceof SearchCancelledError) {
        if (err.jobs.length > 0) {
          try {
            searchRateLimiter.recordSearch()
          } catch {

          }
          await upsertSearchResults(err.jobs, id)
        }
        const stats: SearchRunStats = {
          jobCount: err.jobs.length,
          newCount: err.jobs.filter((j) => !baselineKnown.has(j.id)).length,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date().toISOString(),
          cancelled: true,
        }
        await updateMonitor(id, {
          lastRunAt: stats.finishedAt,
          lastError: null,
          newCountLastRun: stats.newCount,
          lastRunMode: mode,
          lastRunStats: stats,
        })
        callbacks.onProgress?.({
          phase: 'done',
          label: 'Busca cancelada',
          message: err.jobs.length
            ? `Parcial salvo · ${err.jobs.length} vaga(s)`
            : 'Cancelada sem resultados',
          overallPercent: 100,
          listing: { current: err.jobs.length, total: err.jobs.length },
          descriptions: {
            current: err.jobs.filter((j) => j.description?.trim()).length,
            total: err.jobs.length,
          },
          startedAt,
          elapsedMs: stats.durationMs,
          etaSeconds: 0,
          cancelled: true,
        })
        return { newCount: stats.newCount, cancelled: true }
      }

      const message = err instanceof Error ? err.message : 'Erro na busca'
      const retryAfterMs =
        err instanceof Error
          ? (err as Error & { retryAfterMs?: number }).retryAfterMs
          : undefined
      if (searchRateLimiter.noteLinkedInError(err)) {
        const snap = searchRateLimiter.snapshot()
        callbacks.onProgress?.({
          phase: 'error',
          label: 'LinkedIn pediu pausa',
          message: snap.reason || message,
          overallPercent: 0,
          listing: { current: 0, total: null },
          descriptions: { current: 0, total: 0 },
          startedAt,
          elapsedMs: Date.now() - startedAt,
          etaSeconds: null,
        })
        await updateMonitor(id, {
          lastError: snap.reason || message,
        })
        return {
          newCount: 0,
          error: snap.reason || message,
          retryAfterMs: snap.retryAfterMs ?? retryAfterMs,
        }
      }
      callbacks.onProgress?.({
        phase: 'error',
        label: 'Erro na busca',
        message,
        overallPercent: 0,
        listing: { current: 0, total: null },
        descriptions: { current: 0, total: 0 },
        startedAt,
        elapsedMs: Date.now() - startedAt,
        etaSeconds: null,
      })

      await updateMonitor(id, {
        lastError: message,
      })
      return { newCount: 0, error: message, retryAfterMs }
    }
  })().finally(() => {
    running.delete(id)
    aborts.delete(id)
  })

  running.set(id, promise)
  return promise
}

function scheduleMonitor(monitor: Monitor) {
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

function armTimer(id: string, desired: number) {
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
      /aguarde|pausa|limite|rate|intervalo|hora|dia|proteção local|nenhuma vaga encontrada/i.test(
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
