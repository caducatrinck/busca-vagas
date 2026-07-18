import {
  type Dispatch,
  type SetStateAction,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  cancelMonitorRun,
  fetchRateLimit,
  runMonitorWithProgress,
  updateMonitor,
  type RateLimitInfo,
} from '../lib/api'
import { LONG_SEARCH_CHIME_MS, mergeJobs } from '../lib/monitorHelpers'
import { formatRateLimitSummary } from '../lib/rateLimit'
import { playSearchCompleteChime } from '../lib/sound'
import type { Job, Monitor, SearchForm, SearchProgress } from '../lib/types'

export function useSearchRun(params: {
  activeMonitorId: string | null
  monitorDraft: SearchForm
  activeMonitor: Monitor | null
  setMonitorJobs: Dispatch<SetStateAction<Job[]>>
  loadMonitorJobs: (monitorId: string) => Promise<void>
  loadMonitors: (preferredId?: string | null) => Promise<Monitor[]>
  loadSaved: () => Promise<void>
  setRateLimit: Dispatch<SetStateAction<RateLimitInfo | null>>
  setError: Dispatch<SetStateAction<string | null>>
  clearPendingDraftSave: () => void
  /** ao ligar o pooling (ex. pedir notificação) */
  onPoolingWillEnable?: () => void | Promise<void>
}) {
  const {
    activeMonitorId,
    monitorDraft,
    activeMonitor,
    setMonitorJobs,
    loadMonitorJobs,
    loadMonitors,
    loadSaved,
    setRateLimit,
    setError,
    clearPendingDraftSave,
    onPoolingWillEnable,
  } = params

  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(
    null,
  )
  const searchAbortRef = useRef<AbortController | null>(null)
  const poolingStartedAtRef = useRef<number | null>(null)

  const displaySearchProgress = useMemo((): SearchProgress | null => {
    if (searchProgress) return searchProgress
    if (!activeMonitor?.ticking) {
      poolingStartedAtRef.current = null
      return null
    }
    if (poolingStartedAtRef.current == null) {
      poolingStartedAtRef.current = Date.now()
    }
    const startedAt = poolingStartedAtRef.current
    return {
      phase: 'listing',
      label: 'Busca automática em andamento…',
      message: 'Pooling automático no servidor — aguarde o fim da rodada.',
      overallPercent: 18,
      listing: { current: 0, total: null },
      descriptions: { current: 0, total: 0 },
      startedAt,
      elapsedMs: Date.now() - startedAt,
      etaSeconds: null,
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchProgress, activeMonitor?.ticking, activeMonitor?.id])

  async function handleRunMonitorNow() {
    if (!activeMonitorId) return
    const limit = await fetchRateLimit()
    setRateLimit(limit)
    if (limit && !limit.allowed) {
      // cooldown: só o contador embaixo do botão; não joga erro na lista
      if (limit.source !== 'cooldown') {
        setError(formatRateLimitSummary(limit) || 'Limite de buscas atingido')
      } else {
        setError(null)
      }
      return
    }
    clearPendingDraftSave()
    searchAbortRef.current?.abort()
    const ac = new AbortController()
    searchAbortRef.current = ac

    setError(null)
    const searchStartedAt = Date.now()
    setSearchProgress({
      phase: 'listing',
      label: 'Iniciando busca…',
      overallPercent: 0,
      listing: { current: 0, total: null },
      descriptions: { current: 0, total: 0 },
      startedAt: searchStartedAt,
      elapsedMs: 0,
      etaSeconds: null,
    })
    try {
      const intervalMinutes = Math.min(
        Math.max(activeMonitor?.intervalMinutes ?? 20, 1),
        120,
      )
      if (!activeMonitor?.pollingEnabled) {
        await onPoolingWillEnable?.()
      }
      await updateMonitor(activeMonitorId, {
        search: monitorDraft,
        name: monitorDraft.query.trim().slice(0, 28) || 'Monitor',
        pollingEnabled: true,
        intervalMinutes,
      })
      const result = await runMonitorWithProgress(activeMonitorId, {
        signal: ac.signal,
        onProgress: setSearchProgress,
        onJobs: (jobs) => {
          setMonitorJobs((prev) => mergeJobs(prev, jobs))
        },
      })
      const duration = result.stats?.durationMs ?? Date.now() - searchStartedAt
      if (!result.cancelled && duration >= LONG_SEARCH_CHIME_MS) {
        playSearchCompleteChime()
      }
      await loadMonitorJobs(activeMonitorId)
      await loadMonitors(activeMonitorId)
      await loadSaved()
      setRateLimit(await fetchRateLimit())
    } catch (err) {
      if (ac.signal.aborted) {
        await loadMonitorJobs(activeMonitorId)
        await loadMonitors(activeMonitorId)
        await loadSaved()
      } else {
        setError(err instanceof Error ? err.message : 'Erro ao buscar agora')
      }
      setRateLimit(await fetchRateLimit())
    } finally {
      if (searchAbortRef.current === ac) searchAbortRef.current = null
      setSearchProgress(null)
    }
  }

  function handleCancelSearch() {
    const id = activeMonitorId
    searchAbortRef.current?.abort()
    if (id) void cancelMonitorRun(id)
  }

  return {
    searchProgress,
    displaySearchProgress,
    handleRunMonitorNow,
    handleCancelSearch,
  }
}
