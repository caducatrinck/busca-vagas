import { searchLinkedInJobs } from '../linkedin.js'
import { log } from '../logger.js'
import { searchRateLimiter } from '../rateLimit.js'
import {
  getAppSettings,
  getJobSearchHints,
  getMonitor,
  getStore,
  isAppConfigured,
  resolveTagsByIds,
  updateMonitor,
  upsertSearchResults,
  withNewFlag,
} from '../store.js'
import type { Job, SearchRunStats } from '../types.js'
import { SearchCancelledError } from '../types.js'
import { resolvePoolingPostedSeconds as resolvePoolingWindow } from '../domain/poolingWindow.js'
import {
  jobMatchesExcludedTags,
  jobMatchesSelectedTags,
  jobTitleHaystack,
  textMatchesQueryTokens,
  type AppTag,
} from '../shared/tags.js'
import { aborts, running } from './runtime.js'
import type { MonitorRunCallbacks, MonitorRunMode, MonitorRunResult } from './types.js'

function buildShouldDiscard(
  query: string,
  selectedTags: AppTag[],
  excludedTags: AppTag[],
) {
  return (job: Job): boolean => {
    if (!textMatchesQueryTokens(jobTitleHaystack(job), query)) return true
    const hasDetail =
      Boolean(job.description?.trim()) ||
      job.workplaceType != null ||
      Boolean(job.contractTags?.length)
    if (!hasDetail) {
      // Sem detalhe ainda: só descarta por título; exclusão/include esperam descrição.
      return false
    }
    if (jobMatchesExcludedTags(job, excludedTags)) return true
    if (selectedTags.length === 0) return false
    return !jobMatchesSelectedTags(job, selectedTags)
  }
}

export async function runMonitor(
  id: string,
  callbacks: MonitorRunCallbacks = {},
  mode: MonitorRunMode = 'pooling',
): Promise<MonitorRunResult> {
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
      const message = 'err:missing_li_at'
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
      const source =
        (err as Error & { rateLimitSource?: string | null }).rateLimitSource ??
        null

      const retryAfterMs = Math.max(1_000, rawRetry + 500)

      // cooldown local: não grava lastError (já tem mensagem com contador na UI)
      if (source !== 'cooldown') {
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
        }
        await updateMonitor(id, { lastError: message })
      } else {
        await updateMonitor(id, { lastError: null })
      }
      return { newCount: 0, error: message, retryAfterMs }
    }

    const selectedTags = await resolveTagsByIds(monitor.selectedTagIds ?? [])
    const excludedTags = await resolveTagsByIds(monitor.excludedTagIds ?? [])
    const shouldDiscard = buildShouldDiscard(
      monitor.search.query ?? '',
      selectedTags,
      excludedTags,
    )
    const upsertOpts = { shouldDiscard }

    const countNewAgainstBaseline = (jobs: { id: string }[]) =>
      jobs.reduce((n, j) => n + (baselineKnown.has(j.id) ? 0 : 1), 0)

    const emitJobs = async (batch: Parameters<typeof upsertSearchResults>[0]) => {
      if (batch.length === 0) return
      const { jobs, newJobs } = await upsertSearchResults(batch, id, upsertOpts)
      const flagged = withNewFlag(
        jobs.filter((j) => j.status !== 'discarded'),
        newJobs.filter((j) => j.status !== 'discarded').map((j) => j.id),
      )
      callbacks.onJobs?.(flagged)
    }

    const onListingComplete = async (listed: Parameters<typeof upsertSearchResults>[0]) => {
      const { jobs } = await upsertSearchResults(listed, id, upsertOpts)
      const kept = jobs.filter((j) => j.status !== 'discarded')
      const newCount = countNewAgainstBaseline(
        listed.filter((j) => {
          const saved = jobs.find((s) => s.id === j.id)
          return saved && saved.status !== 'discarded'
        }),
      )

      await updateMonitor(id, {
        newCountLastRun: newCount,
        lastError: null,
      })
      const flagged = withNewFlag(
        kept,
        listed
          .filter((j) => !baselineKnown.has(j.id))
          .filter((j) => jobs.find((s) => s.id === j.id)?.status !== 'discarded')
          .map((j) => j.id),
      )
      callbacks.onJobs?.(flagged)
      callbacks.onProgress?.({
        phase: 'listing',
        label: `Listagem pronta · ${listed.length} vaga(s)`,
        overallPercent: 48,
        listing: { current: listed.length, total: listed.length },
        descriptions: { current: 0, total: 0 },
        startedAt,
        elapsedMs: Date.now() - startedAt,
        etaSeconds: null,
        message:
          newCount > 0
            ? `${newCount} nova(s) — buscando descrições…`
            : 'Nenhuma nova nesta listagem',
      })
    }

    try {
      const hints = await getJobSearchHints()
      // Janela estreita do pooling só no tick automático.
      // Busca manual (Buscar agora) usa o "Publicadas em" do formulário.
      const postedWithinSeconds =
        mode === 'pooling'
          ? resolvePoolingWindow(
              monitor.intervalMinutes,
              monitor.lastRunAt,
              startedAt,
            )
          : undefined

      log.info('monitor.run.start', {
        monitorId: id,
        mode,
        query: monitor.search.query,
        location: monitor.search.location,
        postedWithin: monitor.search.postedWithin,
        postedWithinSeconds: postedWithinSeconds ?? null,
        fetchDescriptions: true,
        discardedKnown: hints.discardedIds.size,
        selectedTags: selectedTags.map((t) => t.label),
        excludedTags: excludedTags.map((t) => t.label),
      })

      const found = await searchLinkedInJobs(
        {
          ...monitor.search,
          fetchDescriptions: true,
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

      const { jobs: saved } = await upsertSearchResults(found, id, upsertOpts)
      const accepted = saved.filter((j) => j.status !== 'discarded')
      const newCount = accepted.filter((j) => !baselineKnown.has(j.id)).length
      const stats: SearchRunStats = {
        jobCount: accepted.length,
        newCount,
        durationMs: Date.now() - startedAt,
        finishedAt: new Date().toISOString(),
        cancelled: false,
        ...searchTelemetry,
      }
      log.info('monitor.run.done', {
        monitorId: id,
        mode,
        query: monitor.search.query,
        jobCount: accepted.length,
        discardedByFilter: saved.length - accepted.length,
        newCount,
        durationMs: stats.durationMs,
        ...searchTelemetry,
      })
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
            : (searchTelemetry.emptyReason ?? 'no_new_jobs'),
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
        let acceptedCount = 0
        let newCount = 0
        if (err.jobs.length > 0) {
          try {
            searchRateLimiter.recordSearch()
          } catch {

          }
          const { jobs: saved } = await upsertSearchResults(
            err.jobs,
            id,
            upsertOpts,
          )
          const accepted = saved.filter((j) => j.status !== 'discarded')
          acceptedCount = accepted.length
          newCount = accepted.filter((j) => !baselineKnown.has(j.id)).length
        }
        const stats: SearchRunStats = {
          jobCount: acceptedCount,
          newCount,
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
            ? 'err:cancelled_partial'
            : 'err:cancelled_empty',
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
        return { newCount, cancelled: true }
      }

      const message =
        err instanceof Error ? err.message : 'err:generic'
      log.error('monitor.run.error', {
        monitorId: id,
        mode,
        query: monitor.search.query,
        error: message,
      })
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
