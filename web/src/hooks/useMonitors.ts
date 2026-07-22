import { useEffect, useMemo, useRef, useState } from 'react'
import { jobStatus } from '../lib/jobStatus'
import {
  clearJobsByStatus,
  createMonitor,
  deleteAllJobs,
  fetchMonitors,
  fetchSavedJobs,
  removeMonitor,
  setJobStatus,
  updateMonitor,
} from '../lib/api'
import { filterJobs } from '../lib/filterJobs'
import {
  EMPTY_SEARCH,
  monitorToSearch,
  type AppTag,
  type DescriptionLanguage,
  type Job,
  type JobFilters,
  type JobStatus,
  type Monitor,
  type SearchForm,
} from '../lib/types'
import { useI18n } from '../i18n'

const EMPTY_MONITORS: Monitor[] = []
const EMPTY_JOBS: Job[] = []

function normalizeMonitor(raw: Monitor): Monitor {
  const language =
    raw.language === 'pt' || raw.language === 'en'
      ? raw.language
      : raw.descriptionFilters?.language === 'pt' ||
          raw.descriptionFilters?.language === 'en'
        ? raw.descriptionFilters.language
        : ''
  const selectedTagIds = Array.isArray(raw.selectedTagIds)
    ? raw.selectedTagIds
    : []
  const excludedTagIds = Array.isArray(raw.excludedTagIds)
    ? raw.excludedTagIds
    : []
  return {
    ...raw,
    language,
    selectedTagIds,
    excludedTagIds,
  }
}

function monitorListFilters(
  globalFilters: JobFilters,
  monitor: Monitor | null,
): JobFilters {
  return {
    ...globalFilters,
    excludeDescription: [],
    includeDescription: [],
    language: monitor?.language ?? '',
    selectedTagIds: monitor?.selectedTagIds ?? [],
    excludedTagIds: monitor?.excludedTagIds ?? [],
  }
}

export function useMonitors(params: {
  filters: JobFilters
  catalogTags?: AppTag[]
}) {
  const { filters, catalogTags = [] } = params
  const { t } = useI18n()

  const [monitors, setMonitors] = useState<Monitor[]>([])
  const [activeMonitorId, setActiveMonitorId] = useState<string | null>(null)
  const [monitorDraft, setMonitorDraft] = useState<SearchForm>({
    ...EMPTY_SEARCH,
  })
  const [monitorJobs, setMonitorJobs] = useState<Job[]>([])
  const [savedJobs, setSavedJobs] = useState<Job[]>([])
  const [jobsSubTab, setJobsSubTab] = useState<JobStatus>('viewed')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const saveTimer = useRef<number | null>(null)
  const tagFilterTimer = useRef<number | null>(null)

  const safeMonitors = Array.isArray(monitors) ? monitors : EMPTY_MONITORS
  const safeSavedJobs = Array.isArray(savedJobs) ? savedJobs : EMPTY_JOBS
  const safeMonitorJobs = Array.isArray(monitorJobs) ? monitorJobs : EMPTY_JOBS

  useEffect(() => {
    if (!Array.isArray(monitors)) setMonitors([])
    if (!Array.isArray(savedJobs)) setSavedJobs([])
    if (!Array.isArray(monitorJobs)) setMonitorJobs([])
  }, [monitors, savedJobs, monitorJobs])

  const activeMonitor = useMemo(
    () => safeMonitors.find((m) => m.id === activeMonitorId) ?? null,
    [safeMonitors, activeMonitorId],
  )

  const statusCounts = useMemo(() => {
    const counts: Record<JobStatus, number> = {
      viewed: 0,
      applied: 0,
      discarded: 0,
    }
    for (const job of safeSavedJobs) {
      counts[jobStatus(job)] += 1
    }
    return counts
  }, [safeSavedJobs])

  const jobsBucket = useMemo(
    () => safeSavedJobs.filter((job) => jobStatus(job) === jobsSubTab),
    [safeSavedJobs, jobsSubTab],
  )

  const jobsFiltered = useMemo(
    () =>
      filterJobs(jobsBucket, filters, {
        useDescriptionFilters: false,
        catalogTags,
      }),
    [jobsBucket, filters, catalogTags],
  )

  const monitorFiltered = useMemo(() => {
    const known = new Set(activeMonitor?.knownIdsAtStart ?? [])
    const marked = safeMonitorJobs
      .filter((job) => jobStatus(job) === 'viewed')
      .map((job) => ({
        ...job,
        isNew: known.size > 0 ? !known.has(job.id) : true,
      }))
    const merged = monitorListFilters(filters, activeMonitor)
    return filterJobs(marked, merged, {
      useDescriptionFilters: false,
      requireQueryInTitle: monitorDraft.query,
      catalogTags,
    })
  }, [
    safeMonitorJobs,
    filters,
    activeMonitor,
    monitorDraft.query,
    catalogTags,
  ])

  const activeMonitorFilters = useMemo(
    () => monitorListFilters(filters, activeMonitor),
    [filters, activeMonitor],
  )

  function clearPendingDraftSave() {
    if (saveTimer.current) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (tagFilterTimer.current) {
      window.clearTimeout(tagFilterTimer.current)
      tagFilterTimer.current = null
    }
  }

  async function loadSaved() {
    const jobs = await fetchSavedJobs()
    setSavedJobs(Array.isArray(jobs) ? jobs : [])
  }

  async function loadMonitorJobs(monitorId: string) {
    const jobs = await fetchSavedJobs({
      monitorId,
      excludeDiscarded: true,
    })
    setMonitorJobs(Array.isArray(jobs) ? jobs : [])
  }

  async function loadMonitors(preferredId?: string | null) {
    const list = await fetchMonitors()
    const nextList = (Array.isArray(list) ? list : []).map(normalizeMonitor)
    setMonitors(nextList)
    const nextId =
      preferredId && nextList.some((m) => m.id === preferredId)
        ? preferredId
        : activeMonitorId && nextList.some((m) => m.id === activeMonitorId)
          ? activeMonitorId
          : nextList[0]?.id ?? null
    setActiveMonitorId(nextId)
    const selected = nextList.find((m) => m.id === nextId) ?? null
    setMonitorDraft(monitorToSearch(selected))
    if (nextId) await loadMonitorJobs(nextId)
    else setMonitorJobs([])
    return nextList
  }

  async function handleStatusChange(job: Job, status: JobStatus) {
    try {
      const updated = await setJobStatus(job.id, status)
      const patch = (list: Job[]) =>
        (Array.isArray(list) ? list : []).map((item) =>
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
      setError(err instanceof Error ? err.message : t('err.updateJob'))
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
        name: t('monitor.defaultNameN', { n: monitors.length + 1 }),
        search: { ...EMPTY_SEARCH, query: '' },
      })
      await loadMonitors(created.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.createMonitor'))
    } finally {
      setLoading(false)
    }
  }

  async function handleSelectMonitor(
    id: string,
    onSelect?: (id: string) => void,
  ) {
    clearPendingDraftSave()
    setActiveMonitorId(id)
    const selected = monitors.find((m) => m.id === id) ?? null
    setMonitorDraft(monitorToSearch(selected))
    setError(null)
    onSelect?.(id)
    setLoading(true)
    try {
      await loadMonitorJobs(id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.loadJobs'))
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
            name: next.query.trim().slice(0, 28) || t('monitor.defaultName'),
            search: next,
          })
          setMonitors((prev) =>
            prev.map((m) =>
              m.id === updated.id ? normalizeMonitor({ ...m, ...updated }) : m,
            ),
          )
        } catch (err) {
          setError(err instanceof Error ? err.message : t('err.saveMonitor'))
        }
      })()
    }, 450)
  }

  function patchActiveMonitorTags(
    patch: Partial<Pick<Monitor, 'selectedTagIds' | 'excludedTagIds' | 'language'>>,
  ) {
    if (!activeMonitorId) return
    setMonitors((prev) =>
      prev.map((m) => (m.id === activeMonitorId ? { ...m, ...patch } : m)),
    )
    if (tagFilterTimer.current) window.clearTimeout(tagFilterTimer.current)
    tagFilterTimer.current = window.setTimeout(() => {
      void (async () => {
        try {
          const updated = await updateMonitor(activeMonitorId, patch)
          setMonitors((prev) =>
            prev.map((m) =>
              m.id === updated.id ? normalizeMonitor({ ...m, ...updated }) : m,
            ),
          )
        } catch (err) {
          setError(
            err instanceof Error ? err.message : t('err.saveTabFilters'),
          )
        }
      })()
    }, 350)
  }

  function handleMonitorLanguage(language: DescriptionLanguage) {
    patchActiveMonitorTags({ language })
  }

  function handleMonitorTagsChange(selectedTagIds: string[]) {
    const excluded = (activeMonitor?.excludedTagIds ?? []).filter(
      (id) => !selectedTagIds.includes(id),
    )
    patchActiveMonitorTags({ selectedTagIds, excludedTagIds: excluded })
  }

  function handleMonitorExcludedTagsChange(excludedTagIds: string[]) {
    const selected = (activeMonitor?.selectedTagIds ?? []).filter(
      (id) => !excludedTagIds.includes(id),
    )
    patchActiveMonitorTags({ excludedTagIds, selectedTagIds: selected })
  }

  async function handleTogglePolling(
    enabled: boolean,
    intervalMinutes: number,
    onBeforeEnable?: () => void | Promise<void>,
  ) {
    if (!activeMonitorId) return
    setLoading(true)
    setError(null)
    const safeInterval = Math.min(Math.max(intervalMinutes, 1), 120)
    try {
      if (enabled) {
        await onBeforeEnable?.()
      }
      await updateMonitor(activeMonitorId, {
        search: monitorDraft,
        name: monitorDraft.query.trim().slice(0, 28) || t('monitor.defaultName'),
        pollingEnabled: enabled,
        intervalMinutes: safeInterval,
      })
      await loadMonitors(activeMonitorId)
      await loadSaved()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.updatePooling'))
    } finally {
      setLoading(false)
    }
  }

  async function handleIntervalChange(intervalMinutes: number) {
    if (!activeMonitorId) return
    const safeInterval = Math.min(Math.max(intervalMinutes, 1), 120)
    try {
      const updated = await updateMonitor(activeMonitorId, {
        intervalMinutes: safeInterval,
      })
      setMonitors((prev) =>
        prev.map((m) =>
          m.id === updated.id ? normalizeMonitor({ ...m, ...updated }) : m,
        ),
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.changeInterval'))
    }
  }

  async function handleCloseMonitor(id: string) {
    clearPendingDraftSave()
    setLoading(true)
    setError(null)
    try {
      await removeMonitor(id)
      const next = await loadMonitors(null)
      if (next[0]) await loadMonitorJobs(next[0].id)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.removeMonitor'))
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
      setError(err instanceof Error ? err.message : t('err.loadJobs'))
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
      setError(err instanceof Error ? err.message : t('err.clearJobs'))
      throw err
    }
  }

  async function handleDeleteAllJobs() {
    setError(null)
    try {
      await deleteAllJobs()
      await loadSaved()
      if (activeMonitorId) await loadMonitorJobs(activeMonitorId)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('err.clearJobs'))
      throw err
    }
  }

  return {
    monitors: safeMonitors,
    setMonitors,
    activeMonitorId,
    setActiveMonitorId,
    monitorDraft,
    setMonitorDraft,
    monitorJobs: safeMonitorJobs,
    setMonitorJobs,
    savedJobs: safeSavedJobs,
    setSavedJobs,
    jobsSubTab,
    setJobsSubTab,
    loading,
    setLoading,
    error,
    setError,
    activeMonitor,
    statusCounts,
    jobsBucket,
    jobsFiltered,
    monitorFiltered,
    activeMonitorFilters,
    clearPendingDraftSave,
    loadSaved,
    loadMonitorJobs,
    loadMonitors,
    handleStatusChange,
    handleDiscardAll,
    handleAddMonitor,
    handleSelectMonitor,
    handleMonitorDraftChange,
    handleMonitorLanguage,
    handleMonitorTagsChange,
    handleMonitorExcludedTagsChange,
    handleTogglePolling,
    handleIntervalChange,
    handleCloseMonitor,
    handleRefreshJobs,
    handleClearJobsStatus,
    handleDeleteAllJobs,
  }
}
