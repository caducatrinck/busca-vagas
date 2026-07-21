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
import { useI18n } from '../i18n'
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

  const { t, locale } = useI18n()
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(
    null,
  )
  /** Monitor que iniciou a busca manual em andamento. */
  const [searchingMonitorId, setSearchingMonitorId] = useState<string | null>(
    null,
  )
  const searchAbortRef = useRef<AbortController | null>(null)
  const poolingStartedAtRef = useRef<number | null>(null)
  const activeMonitorIdRef = useRef(activeMonitorId)
  activeMonitorIdRef.current = activeMonitorId
  const searchingMonitorIdRef = useRef(searchingMonitorId)
  searchingMonitorIdRef.current = searchingMonitorId

  const displaySearchProgress = useMemo((): SearchProgress | null => {
    if (searchProgress) {
      // Só mostra progresso na aba do monitor que está buscando.
      if (searchingMonitorId !== activeMonitorId) return null
      return searchProgress
    }
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
      label: t('search.autoLabel'),
      message: t('search.autoMessage'),
      overallPercent: 18,
      listing: { current: 0, total: null },
      descriptions: { current: 0, total: 0 },
      startedAt,
      elapsedMs: Date.now() - startedAt,
      etaSeconds: null,
    }
  }, [
    searchProgress,
    searchingMonitorId,
    activeMonitorId,
    activeMonitor?.ticking,
    activeMonitor?.id,
    t,
  ])

  async function handleRunMonitorNow() {
    if (!activeMonitorId) return
    const runMonitorId = activeMonitorId
    const limit = await fetchRateLimit()
    setRateLimit(limit)
    if (limit && !limit.allowed) {
      // cooldown: só o contador embaixo do botão; não joga erro na lista
      if (limit.source !== 'cooldown') {
        setError(
          formatRateLimitSummary(limit, Date.now(), locale) ||
            t('search.rateLimitHit'),
        )
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
    setSearchingMonitorId(runMonitorId)
    setSearchProgress({
      phase: 'listing',
      label: t('search.starting'),
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
      await updateMonitor(runMonitorId, {
        search: monitorDraft,
        name: monitorDraft.query.trim().slice(0, 28) || t('monitor.defaultName'),
        pollingEnabled: true,
        intervalMinutes,
      })
      const result = await runMonitorWithProgress(runMonitorId, {
        signal: ac.signal,
        onProgress: (progress) => {
          if (searchingMonitorIdRef.current === runMonitorId) {
            setSearchProgress(progress)
          }
        },
        onJobs: (jobs) => {
          // Não mistura jobs na lista se o usuário já trocou de aba.
          if (activeMonitorIdRef.current !== runMonitorId) return
          setMonitorJobs((prev) => mergeJobs(prev, jobs))
        },
      })
      const duration = result.stats?.durationMs ?? Date.now() - searchStartedAt
      if (!result.cancelled && duration >= LONG_SEARCH_CHIME_MS) {
        playSearchCompleteChime()
      }
      if (activeMonitorIdRef.current === runMonitorId) {
        await loadMonitorJobs(runMonitorId)
      }
      await loadMonitors(activeMonitorIdRef.current ?? runMonitorId)
      await loadSaved()
      setRateLimit(await fetchRateLimit())
    } catch (err) {
      if (!ac.signal.aborted && activeMonitorIdRef.current === runMonitorId) {
        setError(err instanceof Error ? err.message : t('search.runError'))
      }
      if (activeMonitorIdRef.current === runMonitorId) {
        await loadMonitorJobs(runMonitorId)
      }
      await loadMonitors(activeMonitorIdRef.current ?? runMonitorId)
      await loadSaved()
      setRateLimit(await fetchRateLimit())
    } finally {
      if (searchAbortRef.current === ac) searchAbortRef.current = null
      if (searchingMonitorIdRef.current === runMonitorId) {
        setSearchingMonitorId(null)
        setSearchProgress(null)
      }
    }
  }

  function handleCancelSearch() {
    const id = searchingMonitorIdRef.current ?? activeMonitorId
    searchAbortRef.current?.abort()
    if (id) void cancelMonitorRun(id)
  }

  return {
    searchProgress,
    displaySearchProgress,
    searchingMonitorId,
    handleRunMonitorNow,
    handleCancelSearch,
  }
}
