import { type Dispatch, type SetStateAction, useEffect, useState } from 'react'
import {
  exportAppData,
  fetchSettings,
  importAppData,
  type DataBackup,
  type PublicAppSettings,
} from '../lib/api'
import {
  EMPTY_FILTERS,
  type AppTab,
  type JobFilters,
  type Monitor,
} from '../lib/types'

export function useAppSettings(params: {
  loadMonitors: (preferredId?: string | null) => Promise<Monitor[]>
  loadSaved: () => Promise<void>
  setLoading: Dispatch<SetStateAction<boolean>>
  setError: Dispatch<SetStateAction<string | null>>
  activeMonitorId: string | null
  filters: JobFilters
  setFilters: Dispatch<SetStateAction<JobFilters>>
  clearNotifications: () => void
}) {
  const {
    loadMonitors,
    loadSaved,
    setLoading,
    setError,
    activeMonitorId,
    filters,
    setFilters,
    clearNotifications,
  } = params

  const [tab, setTab] = useState<AppTab>('monitor')
  const [appSettings, setAppSettings] = useState<PublicAppSettings | null>(
    null,
  )

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (setupRequired && tab !== 'settings') setTab('settings')
  }, [setupRequired, tab])

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
    clearNotifications()
    const nextSettings = await fetchSettings()
    setAppSettings(nextSettings)
    if (!nextSettings.ready) setTab('settings')
    await loadMonitors(null)
    await loadSaved()
  }

  return {
    tab,
    setTab,
    appSettings,
    setAppSettings,
    setupRequired,
    handleTabChange,
    handleExportData,
    handleImportData,
  }
}
