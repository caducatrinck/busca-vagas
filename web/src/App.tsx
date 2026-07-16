import { useEffect, useMemo, useRef, useState } from 'react'
import { DataWarningBanner } from './components/DataWarningBanner'
import { jobStatus } from './components/JobCard'
import { JobList } from './components/JobList'
import { JobsPanel } from './components/JobsPanel'
import { PollingPanel } from './components/PollingPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Tabs } from './components/Tabs'
import { usePersistedFilters } from './hooks/usePersistedFilters'
import { useTheme } from './hooks/useTheme'
import {
  createMonitor,
  cancelMonitorRun,
  clearJobsByStatus,
  exportAppData,
  fetchMonitors,
  fetchRateLimit,
  fetchSavedJobs,
  fetchSettings,
  importAppData,
  removeMonitor,
  runMonitorWithProgress,
  setJobStatus,
  updateMonitor,
  type DataBackup,
  type PublicAppSettings,
  type RateLimitInfo,
} from './lib/api'
import { filterJobs } from './lib/filterJobs'
import {
  ensureNotificationPermission,
  notifyNewJobs,
} from './lib/notifications'
import {
  unreadByMonitor,
  unreadJobCount,
  type AppNotification,
} from './lib/notificationsModel'
import { playNewJobsAlert, playSearchCompleteChime } from './lib/sound'
import {
  EMPTY_FILTERS,
  EMPTY_SEARCH,
  monitorToSearch,
  type AppTab,
  type Job,
  type JobStatus,
  type Monitor,
  type SearchForm,
  type SearchProgress,
} from './lib/types'
import './App.css'

const LONG_SEARCH_CHIME_MS = 15_000
const BASE_TITLE = 'Busca Vagas'
const MAX_NOTIFICATIONS = 40

const POOL_CHECK_AFTER_MS = 8_000

const POOL_CHECK_MAX_MS = 5 * 60_000

const POOL_CHECK_OVERDUE_MS = 3_000

const POOL_CHECK_TICKING_MS = 2_000

const POOL_CHECK_SOON_MS = 5_000

const POOL_CHECK_MIN_MS = 15_000

function mergeJobs(prev: Job[], incoming: Job[]): Job[] {
  const map = new Map(prev.map((j) => [j.id, j]))
  for (const job of incoming) {
    const existing = map.get(job.id)
    map.set(job.id, existing ? { ...existing, ...job } : job)
  }
  return [...map.values()].sort((a, b) =>
    (b.lastSeenAt ?? '').localeCompare(a.lastSeenAt ?? ''),
  )
}

function runKey(monitor: Monitor): string | null {
  if (!monitor.lastRunAt) return null
  return `${monitor.id}:${monitor.lastRunAt}:${monitor.newCountLastRun}`
}

function msUntilNextPoolCheck(monitors: Monitor[], now = Date.now()): number {
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

function App() {
  const { filters, setFilters, setLanguage, addWord, removeWord } =
    usePersistedFilters()
  const { theme, toggleTheme } = useTheme()
  const [tab, setTab] = useState<AppTab>('monitor')
  const [savedJobs, setSavedJobs] = useState<Job[]>([])
  const [monitorJobs, setMonitorJobs] = useState<Job[]>([])
  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [activeMonitorId, setActiveMonitorId] = useState<string | null>(null)
  const [monitorDraft, setMonitorDraft] = useState<SearchForm>({ ...EMPTY_SEARCH })
  const [jobsSubTab, setJobsSubTab] = useState<JobStatus>('viewed')
  const [loading, setLoading] = useState(false)
  const [searchProgress, setSearchProgress] = useState<SearchProgress | null>(
    null,
  )
  const [error, setError] = useState<string | null>(null)
  const [rateLimit, setRateLimit] = useState<RateLimitInfo | null>(null)
  const [appSettings, setAppSettings] = useState<PublicAppSettings | null>(null)
  const [notifications, setNotifications] = useState<AppNotification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)

  const saveTimer = useRef<number | null>(null)
  const searchAbortRef = useRef<AbortController | null>(null)
  const notifiedRunsRef = useRef<Set<string>>(new Set())
  const seededNotifyRef = useRef(false)
  const activeMonitorIdRef = useRef<string | null>(null)
  const poolingStartedAtRef = useRef<number | null>(null)

  activeMonitorIdRef.current = activeMonitorId

  const unreadTotal = useMemo(
    () => unreadJobCount(notifications),
    [notifications],
  )
  const unreadMap = useMemo(
    () => unreadByMonitor(notifications),
    [notifications],
  )

  const activeMonitor = useMemo(
    () => monitors.find((m) => m.id === activeMonitorId) ?? null,
    [monitors, activeMonitorId],
  )

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
  }, [searchProgress, activeMonitor?.ticking, activeMonitor?.id])

  const statusCounts = useMemo(() => {
    const counts: Record<JobStatus, number> = {
      viewed: 0,
      applied: 0,
      discarded: 0,
    }
    for (const job of savedJobs) {
      counts[jobStatus(job)] += 1
    }
    return counts
  }, [savedJobs])

  const jobsBucket = useMemo(
    () => savedJobs.filter((job) => jobStatus(job) === jobsSubTab),
    [savedJobs, jobsSubTab],
  )

  const jobsFiltered = useMemo(
    () => filterJobs(jobsBucket, filters, { useDescriptionFilters: false }),
    [jobsBucket, filters],
  )

  const monitorFiltered = useMemo(() => {
    const known = new Set(activeMonitor?.knownIdsAtStart ?? [])
    const marked = monitorJobs
      .filter((job) => jobStatus(job) === 'viewed')
      .map((job) => ({
        ...job,

        isNew: known.size > 0 ? !known.has(job.id) : true,
      }))
    return filterJobs(marked, filters, {
      useDescriptionFilters: monitorDraft.fetchDescriptions,
      requireQueryInTitle: monitorDraft.query,
    })
  }, [
    monitorJobs,
    filters,
    activeMonitor,
    monitorDraft.fetchDescriptions,
    monitorDraft.query,
  ])

  async function loadSaved() {
    const jobs = await fetchSavedJobs()
    setSavedJobs(jobs)
  }

  async function loadMonitorJobs(monitorId: string) {
    const jobs = await fetchSavedJobs({
      monitorId,
      excludeDiscarded: true,
    })
    setMonitorJobs(jobs)
  }

  async function loadMonitors(preferredId?: string | null) {
    const list = await fetchMonitors()
    setMonitors(list)
    const nextId =
      preferredId && list.some((m) => m.id === preferredId)
        ? preferredId
        : activeMonitorId && list.some((m) => m.id === activeMonitorId)
          ? activeMonitorId
          : list[0]?.id ?? null
    setActiveMonitorId(nextId)
    const selected = list.find((m) => m.id === nextId) ?? null
    setMonitorDraft(monitorToSearch(selected))
    if (nextId) await loadMonitorJobs(nextId)
    else setMonitorJobs([])
    return list
  }

  const setupRequired = appSettings != null && !appSettings.ready

  useEffect(() => {
    void fetchSettings()
      .then((s) => {
        setAppSettings(s)
        if (!s.ready) setTab('settings')
      })
      .catch(() => {
        setAppSettings({
          ready: false,
          linkedinLiAtSet: false,
          linkedinLiAtHint: '',
          linkedinJsessionIdSet: false,
          linkedinMaxPages: 1000,
          searchCooldownMs: 5_000,
          maxSearchesPerHour: 60,
          maxSearchesPerDay: 300,
          jobDetailConcurrency: 5,
        })
        setTab('settings')
      })
    void loadMonitors().catch(() => undefined)
    void loadSaved().catch(() => undefined)
    void fetchRateLimit().then(setRateLimit)
  }, [])

  useEffect(() => {
    if (tab !== 'monitor' || setupRequired) return
    if (rateLimit?.allowed === false) {
      const id = window.setInterval(() => {
        void fetchRateLimit().then(setRateLimit)
      }, 15_000)
      return () => window.clearInterval(id)
    }
    void fetchRateLimit().then(setRateLimit)
  }, [tab, setupRequired, rateLimit?.allowed])

  useEffect(() => {
    if (setupRequired && tab !== 'settings') setTab('settings')
  }, [setupRequired, tab])

  useEffect(() => {
    if (unreadTotal <= 0) {
      document.title = BASE_TITLE
      return
    }
    document.title = `(${unreadTotal > 99 ? '99+' : unreadTotal}) ${BASE_TITLE}`
    return () => {
      document.title = BASE_TITLE
    }
  }, [unreadTotal])

  function announceNewJobs(monitor: Monitor) {
    if (monitor.newCountLastRun <= 0) return
    const name = monitor.search.query?.trim() || monitor.name
    const count = monitor.newCountLastRun
    const item: AppNotification = {
      id: `${monitor.id}-${monitor.lastRunAt ?? Date.now()}`,
      monitorId: monitor.id,
      monitorName: name,
      count,
      createdAt: Date.now(),
      read: false,
    }
    setNotifications((prev) => [item, ...prev].slice(0, MAX_NOTIFICATIONS))
    setNotificationsOpen(true)
    playNewJobsAlert()
    notifyNewJobs({
      title:
        count === 1
          ? '1 vaga nova no pooling'
          : `${count} vagas novas no pooling`,
      body: `${name} — clique para abrir a busca`,
      tag: `busca-vagas-${monitor.id}`,
      onClick: () => {
        openMonitorFromNotification(item)
      },
    })
  }

  function openMonitorFromNotification(item: AppNotification) {
    const monitor = monitors.find((m) => m.id === item.monitorId) ?? null
    setTab('monitor')
    setActiveMonitorId(item.monitorId)
    setMonitorDraft(
      monitor
        ? monitorToSearch(monitor)
        : {
            ...EMPTY_SEARCH,
            query: item.monitorName,
          },
    )
    setNotifications((prev) =>
      prev.map((n) =>
        n.monitorId === item.monitorId ? { ...n, read: true } : n,
      ),
    )
    setNotificationsOpen(false)
    void loadMonitorJobs(item.monitorId).catch(() => undefined)
  }

  function handleMarkAllNotificationsRead() {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  useEffect(() => {
    if (setupRequired) return
    const anyActive = monitors.some((m) => m.pollingEnabled)
    if (!anyActive) return

    let cancelled = false
    let timeoutId = 0
    const monitorsRef = { current: monitors }

    function scheduleNext(list: Monitor[]) {
      if (cancelled) return
      monitorsRef.current = list
      const delay = msUntilNextPoolCheck(list)
      timeoutId = window.setTimeout(() => {
        void tick()
      }, delay)
    }

    async function tick() {
      try {
        const list = await fetchMonitors()
        if (cancelled) return

        let completedRun = false

        if (!seededNotifyRef.current) {
          for (const m of list) {
            const key = runKey(m)
            if (key) notifiedRunsRef.current.add(key)
          }
          seededNotifyRef.current = true
        } else {
          for (const m of list) {
            if (!m.pollingEnabled) continue
            const key = runKey(m)
            if (!key || notifiedRunsRef.current.has(key)) continue
            notifiedRunsRef.current.add(key)
            completedRun = true
            if (m.newCountLastRun > 0) announceNewJobs(m)
          }
        }

        setMonitors((prev) => {
          if (
            prev.length === list.length &&
            prev.every((m, i) => {
              const n = list[i]
              return (
                m.id === n.id &&
                m.lastRunAt === n.lastRunAt &&
                m.nextRunAt === n.nextRunAt &&
                m.pollingEnabled === n.pollingEnabled &&
                m.newCountLastRun === n.newCountLastRun &&
                m.lastError === n.lastError &&
                m.ticking === n.ticking
              )
            })
          ) {
            return prev
          }
          return list
        })
        const preferred = activeMonitorIdRef.current
        const nextId =
          preferred && list.some((m) => m.id === preferred)
            ? preferred
            : list[0]?.id ?? null
        if (nextId !== preferred) {
          setActiveMonitorId(nextId)
          setMonitorDraft(monitorToSearch(list.find((m) => m.id === nextId)))
        }

        if (completedRun) {
          if (nextId) await loadMonitorJobs(nextId)
          await loadSaved()
          setRateLimit(await fetchRateLimit())
        }

        scheduleNext(list)
      } catch {
        if (!cancelled) {
          scheduleNext(monitorsRef.current)
        }
      }
    }

    void tick()

    function onVisible() {
      if (document.visibilityState === 'visible') {
        window.clearTimeout(timeoutId)
        void tick()
      }
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      cancelled = true
      window.clearTimeout(timeoutId)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [setupRequired, monitors.some((m) => m.pollingEnabled)])

  async function handleStatusChange(job: Job, status: JobStatus) {
    try {
      const updated = await setJobStatus(job.id, status)
      const patch = (list: Job[]) =>
        list.map((item) =>
          item.id === updated.id ? { ...item, ...updated } : item,
        )
      setSavedJobs(patch)
      setMonitorJobs((prev) => {
        const next = patch(prev)
        return status !== 'viewed'
          ? next.filter((item) => item.id !== updated.id)
          : next
      })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar vaga')
    }
  }

  async function handleDiscardAll(jobs: Job[]) {
    if (jobs.length === 0) return
    setError(null)
    for (const job of jobs) {
      await handleStatusChange(job, 'discarded')
    }
  }

  async function handleAddMonitor() {
    setLoading(true)
    setError(null)
    try {
      const created = await createMonitor({
        name: `Monitor ${monitors.length + 1}`,
        search: { ...EMPTY_SEARCH, query: '' },
      })
      await loadMonitors(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar monitor')
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectMonitor(id: string) {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    setActiveMonitorId(id)
    const selected = monitors.find((m) => m.id === id) ?? null
    setMonitorDraft(monitorToSearch(selected))
    setError(null)
    setNotifications((prev) =>
      prev.map((n) => (n.monitorId === id ? { ...n, read: true } : n)),
    )
    setLoading(true)
    try {
      await loadMonitorJobs(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar vagas')
    } finally {
      setLoading(false)
    }
  }

  function handleMonitorDraftChange(next: SearchForm) {
    setMonitorDraft(next)
    if (!activeMonitorId) return

    if (saveTimer.current) window.clearTimeout(saveTimer.current)
    saveTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const updated = await updateMonitor(activeMonitorId, {
            name: next.query.trim().slice(0, 28) || 'Monitor',
            search: next,
          })
          setMonitors((prev) =>
            prev.map((m) => (m.id === updated.id ? { ...m, ...updated } : m)),
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Erro ao salvar monitor')
        }
      })()
    }, 450)
  }

  async function handleTogglePolling(enabled: boolean, intervalMinutes: number) {
    if (!activeMonitorId) return
    setLoading(true)
    setError(null)
    const safeInterval = Math.min(Math.max(intervalMinutes, 1), 120)
    try {
      if (enabled) {

        for (const m of monitors) {
          const key = runKey(m)
          if (key) notifiedRunsRef.current.add(key)
        }
        seededNotifyRef.current = true
        await ensureNotificationPermission()
      }
      await updateMonitor(activeMonitorId, {
        search: monitorDraft,
        name: monitorDraft.query.trim().slice(0, 28) || 'Monitor',
        pollingEnabled: enabled,
        intervalMinutes: safeInterval,
      })
      await loadMonitors(activeMonitorId)
      await loadSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao atualizar pooling')
    } finally {
      setLoading(false)
    }
  }

  async function handleIntervalChange(minutes: number) {
    if (!activeMonitorId) return
    const safe = Math.min(Math.max(minutes, 1), 120)
    try {
      await updateMonitor(activeMonitorId, {
        intervalMinutes: safe,
        pollingEnabled: activeMonitor?.pollingEnabled,
      })
      await loadMonitors(activeMonitorId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao alterar intervalo')
    }
  }

  async function handleRunMonitorNow() {
    if (!activeMonitorId) return
    const limit = await fetchRateLimit()
    setRateLimit(limit)
    if (limit && !limit.allowed) {
      setError(limit.reason || 'Limite de buscas atingido')
      return
    }
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
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
      await updateMonitor(activeMonitorId, {
        search: monitorDraft,
        name: monitorDraft.query.trim().slice(0, 28) || 'Monitor',
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

  async function handleCloseMonitor(id: string) {
    setLoading(true)
    setError(null)
    try {
      await removeMonitor(id)
      await loadMonitors(id === activeMonitorId ? null : activeMonitorId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao remover monitor')
    } finally {
      setLoading(false)
    }
  }

  async function handleRefreshJobs() {
    setLoading(true)
    setError(null)
    try {
      await loadSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao carregar vagas')
    } finally {
      setLoading(false)
    }
  }

  async function handleClearJobsStatus(status: 'applied' | 'discarded') {
    setError(null)
    try {
      await clearJobsByStatus(status)
      await loadSaved()
      if (activeMonitorId) await loadMonitorJobs(activeMonitorId)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao limpar vagas')
      throw err
    }
  }

  async function handleTabChange(next: AppTab) {
    if (setupRequired && next !== 'settings') {
      setTab('settings')
      return
    }
    setTab(next)
    setError(null)
    if (next === 'jobs') {
      setLoading(true)
      try {
        await loadSaved()
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar')
      } finally {
        setLoading(false)
      }
    }
    if (next === 'monitor') {
      setLoading(true)
      try {
        await loadMonitors(activeMonitorId)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Erro ao carregar monitores')
      } finally {
        setLoading(false)
      }
    }
  }

  const jobsTitles: Record<JobStatus, { title: string; empty: string; hint: string }> = {
    viewed: {
      title: 'Vagas pendentes',
      empty: 'Nenhuma vaga pendente',
      hint: 'Busque no Monitor. Use Descartar ou Já apliquei nos cards.',
    },
    applied: {
      title: 'Vagas aplicadas',
      empty: 'Nenhuma vaga aplicada',
      hint: 'Marque “Já apliquei” em um card para movê-la para cá.',
    },
    discarded: {
      title: 'Vagas descartadas',
      empty: 'Nenhuma vaga descartada',
      hint: 'Descartadas somem do Monitor. Você pode restaurá-las aqui.',
    },
  }

  async function handleExportData() {
    const backup = await exportAppData()
    const payload: DataBackup = {
      ...backup,
      filters,
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
    const a = document.createElement('a')
    a.href = url
    a.download = `busca-vagas-backup-${stamp}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  async function handleImportData(file: File) {
    const text = await file.text()
    const parsed = JSON.parse(text) as DataBackup & {
      jobs?: DataBackup['store']['jobs']
      monitors?: DataBackup['store']['monitors']
    }
    const backup: DataBackup = {
      version: parsed.version ?? 1,
      exportedAt: parsed.exportedAt ?? new Date().toISOString(),
      store: parsed.store ?? {
        jobs: parsed.jobs ?? {},
        monitors: parsed.monitors ?? [],
      },
      filters: parsed.filters,
    }
    await importAppData(backup)
    if (parsed.filters) {
      setFilters({ ...EMPTY_FILTERS, ...parsed.filters })
    }
    setNotifications([])
    setNotificationsOpen(false)
    const nextSettings = await fetchSettings()
    setAppSettings(nextSettings)
    if (!nextSettings.ready) setTab('settings')
    await loadMonitors(null)
    await loadSaved()
  }

  return (
    <div className="app-shell">
      <DataWarningBanner
        onExport={handleExportData}
        onImportFile={handleImportData}
      />
      <div className="app">
      <div className="app__sidebar">
        <Tabs
          tab={tab}
          jobsCount={savedJobs.length}
          statusCounts={statusCounts}
          monitors={monitors}
          notifications={notifications}
          notificationsOpen={notificationsOpen}
          unreadTotal={unreadTotal}
          setupRequired={setupRequired}
          theme={theme}
          onToggleTheme={toggleTheme}
          onChange={handleTabChange}
          onToggleNotifications={() => setNotificationsOpen((v) => !v)}
          onCloseNotifications={() => setNotificationsOpen(false)}
          onOpenNotification={openMonitorFromNotification}
          onMarkAllNotificationsRead={handleMarkAllNotificationsRead}
        />

        {!setupRequired && tab === 'jobs' ? (
          <JobsPanel
            subTab={jobsSubTab}
            counts={statusCounts}
            onSubTabChange={setJobsSubTab}
            onRefresh={handleRefreshJobs}
            onClearStatus={handleClearJobsStatus}
          />
        ) : null}

        {!setupRequired && tab === 'monitor' ? (
          <PollingPanel
            monitors={monitors}
            activeId={activeMonitorId}
            draft={monitorDraft}
            filters={filters}
            loading={loading}
            searching={Boolean(displaySearchProgress)}
            unreadByMonitor={unreadMap}
            onSelect={handleSelectMonitor}
            onAdd={handleAddMonitor}
            onClose={handleCloseMonitor}
            onDraftChange={handleMonitorDraftChange}
            onLanguageChange={setLanguage}
            onTogglePolling={handleTogglePolling}
            onIntervalChange={handleIntervalChange}
            onRunNow={handleRunMonitorNow}
            onAddWord={addWord}
            onRemoveWord={removeWord}
            rateLimit={rateLimit}
          />
        ) : null}
      </div>

      <div className="app__main">
        {tab === 'settings' || setupRequired ? (
          <SettingsPanel
            setupRequired={setupRequired}
            onSaved={(next) => {
              setAppSettings(next)
              if (next.ready) void loadMonitors(activeMonitorId)
            }}
          />
        ) : null}

        {!setupRequired && tab === 'jobs' ? (
          <JobList
            jobs={jobsFiltered}
            totalCount={jobsBucket.length}
            filters={filters}
            loading={loading}
            error={error}
            showDescriptionFilters={false}
            showTopFilters
            showLanguageFilter
            title={jobsTitles[jobsSubTab].title}
            emptyTitle={jobsTitles[jobsSubTab].empty}
            emptyHint={jobsTitles[jobsSubTab].hint}
            onStatusChange={handleStatusChange}
            onDiscardAll={handleDiscardAll}
            onLanguageChange={setLanguage}
          />
        ) : null}

        {!setupRequired && tab === 'monitor' ? (
          <JobList
            jobs={monitorFiltered}
            totalCount={monitorJobs.length}
            filters={filters}
            loading={loading}
            error={error}
            searchProgress={displaySearchProgress}
            fetchDescriptions={monitorDraft.fetchDescriptions}
            showDescriptionFilters={monitorDraft.fetchDescriptions}
            title={
              activeMonitor
                ? `Monitor: ${activeMonitor.search.query || activeMonitor.name}`
                : 'Monitor'
            }
            emptyTitle="Sem vagas neste monitor"
            emptyHint="Crie uma aba com +, configure a busca e marque pooling ou clique em Buscar agora."
            onCancelSearch={handleCancelSearch}
            onStatusChange={handleStatusChange}
          />
        ) : null}
      </div>
      </div>
    </div>
  )
}

export default App
