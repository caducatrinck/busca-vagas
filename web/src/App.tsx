import { useRef } from 'react'
import { DataWarningBanner } from './components/DataWarningBanner'
import { JobList } from './components/JobList'
import { JobsPanel } from './components/JobsPanel'
import { PollingPanel } from './features/monitor'
import { SettingsPanel } from './components/SettingsPanel'
import { Tabs } from './components/Tabs'
import { useAppSettings } from './hooks/useAppSettings'
import { useMonitorPolling } from './hooks/useMonitorPolling'
import { JOBS_TITLES, useMonitors } from './hooks/useMonitors'
import { useNotifications } from './hooks/useNotifications'
import { usePersistedFilters } from './hooks/usePersistedFilters'
import { useSearchRun } from './hooks/useSearchRun'
import { useTheme } from './hooks/useTheme'
import { runKey } from './lib/monitorHelpers'
import { ensureNotificationPermission } from './lib/notifications'
import type { AppNotification } from './lib/notificationsModel'
import type { Monitor } from './lib/types'
import './App.css'

function App() {
  const { filters, replaceFilters, setLanguage } = usePersistedFilters()
  const { theme, toggleTheme, setTheme } = useTheme()

  const monitors = useMonitors({ filters })
  const notifications = useNotifications()

  const appSettings = useAppSettings({
    loadMonitors: monitors.loadMonitors,
    loadSaved: monitors.loadSaved,
    setLoading: monitors.setLoading,
    setError: monitors.setError,
    activeMonitorId: monitors.activeMonitorId,
    replaceFilters,
    setTheme,
    clearNotifications: notifications.clearNotifications,
  })

  const activeMonitorIdRef = useRef<string | null>(null)
  activeMonitorIdRef.current = monitors.activeMonitorId

  function openPendingFromNotification(_item: AppNotification) {
    appSettings.setTab('jobs')
    monitors.setJobsSubTab('viewed')
    notifications.handleMarkAllNotificationsRead()
  }

  function handleAnnounceNewJobs(monitor: Monitor) {
    notifications.announceNewJobs(monitor, (item) => {
      notifications.openFromNotification(item, openPendingFromNotification)
    })
  }

  const polling = useMonitorPolling({
    monitors: monitors.monitors,
    setupRequired: appSettings.setupRequired,
    tab: appSettings.tab,
    activeMonitorIdRef,
    setMonitors: monitors.setMonitors,
    setActiveMonitorId: monitors.setActiveMonitorId,
    setMonitorDraft: monitors.setMonitorDraft,
    loadMonitorJobs: monitors.loadMonitorJobs,
    loadSaved: monitors.loadSaved,
    notifiedRunsRef: notifications.notifiedRunsRef,
    seededNotifyRef: notifications.seededNotifyRef,
    onAnnounceNewJobs: handleAnnounceNewJobs,
  })

  const searchRun = useSearchRun({
    activeMonitorId: monitors.activeMonitorId,
    monitorDraft: monitors.monitorDraft,
    activeMonitor: monitors.activeMonitor,
    setMonitorJobs: monitors.setMonitorJobs,
    loadMonitorJobs: monitors.loadMonitorJobs,
    loadMonitors: monitors.loadMonitors,
    loadSaved: monitors.loadSaved,
    setRateLimit: polling.setRateLimit,
    setError: monitors.setError,
    clearPendingDraftSave: monitors.clearPendingDraftSave,
    onPoolingWillEnable: async () => {
      for (const m of monitors.monitors) {
        const key = runKey(m)
        if (key) notifications.notifiedRunsRef.current.add(key)
      }
      notifications.seededNotifyRef.current = true
      await ensureNotificationPermission()
    },
  })

  function handleSelectMonitor(id: string) {
    notifications.markMonitorRead(id)
    void monitors.handleSelectMonitor(id)
  }

  function handleTabChange(next: typeof appSettings.tab) {
    if (next === 'jobs') {
      monitors.setJobsSubTab('viewed')
    }
    appSettings.handleTabChange(next)
  }

  function handleJobsSubTabChange(value: typeof monitors.jobsSubTab) {
    if (value === 'viewed' && notifications.unreadTotal > 0) {
      notifications.handleMarkAllNotificationsRead()
    }
    monitors.setJobsSubTab(value)
  }

  async function handlePausePooling() {
    const minutes = monitors.activeMonitor?.intervalMinutes ?? 20
    await monitors.handleTogglePolling(false, minutes)
  }

  function clearNotifIfAction(status: 'applied' | 'discarded' | 'viewed') {
    if (
      (status === 'applied' || status === 'discarded') &&
      notifications.unreadTotal > 0
    ) {
      notifications.handleMarkAllNotificationsRead()
    }
  }

  async function handleStatusChange(
    job: Parameters<typeof monitors.handleStatusChange>[0],
    status: Parameters<typeof monitors.handleStatusChange>[1],
  ) {
    clearNotifIfAction(status)
    await monitors.handleStatusChange(job, status)
  }

  async function handleDiscardAll(
    jobs: Parameters<typeof monitors.handleDiscardAll>[0],
  ) {
    if (notifications.unreadTotal > 0) {
      notifications.handleMarkAllNotificationsRead()
    }
    await monitors.handleDiscardAll(jobs)
  }

  return (
    <div className="app-shell">
      <DataWarningBanner
        onExport={appSettings.handleExportData}
        onImportFile={appSettings.handleImportData}
      />
      <div className="app">
      <div className="app__sidebar">
        <Tabs
          tab={appSettings.tab}
          jobsCount={monitors.savedJobs.length}
          statusCounts={monitors.statusCounts}
          monitors={monitors.monitors}
          unreadTotal={notifications.unreadTotal}
          setupRequired={appSettings.setupRequired}
          theme={theme}
          onToggleTheme={toggleTheme}
          onChange={handleTabChange}
        />

        {!appSettings.setupRequired && appSettings.tab === 'jobs' ? (
          <JobsPanel
            subTab={monitors.jobsSubTab}
            counts={monitors.statusCounts}
            unreadTotal={notifications.unreadTotal}
            onSubTabChange={handleJobsSubTabChange}
            onRefresh={monitors.handleRefreshJobs}
            onClearStatus={monitors.handleClearJobsStatus}
          />
        ) : null}

        {!appSettings.setupRequired && appSettings.tab === 'monitor' ? (
          <PollingPanel
            monitors={monitors.monitors}
            activeId={monitors.activeMonitorId}
            draft={monitors.monitorDraft}
            filters={monitors.activeMonitorFilters}
            loading={monitors.loading}
            searching={Boolean(searchRun.displaySearchProgress)}
            onSelect={handleSelectMonitor}
            onAdd={monitors.handleAddMonitor}
            onClose={monitors.handleCloseMonitor}
            onDraftChange={monitors.handleMonitorDraftChange}
            onLanguageChange={monitors.handleMonitorDescriptionLanguage}
            onPausePooling={handlePausePooling}
            onIntervalChange={monitors.handleIntervalChange}
            onRunNow={searchRun.handleRunMonitorNow}
            onAddWord={monitors.handleMonitorDescriptionAddWord}
            onRemoveWord={monitors.handleMonitorDescriptionRemoveWord}
            rateLimit={polling.rateLimit}
          />
        ) : null}
      </div>

      <div className="app__main">
        {appSettings.tab === 'settings' || appSettings.setupRequired ? (
          <SettingsPanel
            setupRequired={appSettings.setupRequired}
            onSaved={(next) => {
              appSettings.setAppSettings(next)
              if (next.ready) void monitors.loadMonitors(monitors.activeMonitorId)
            }}
          />
        ) : null}

        {!appSettings.setupRequired && appSettings.tab === 'jobs' ? (
          <JobList
            jobs={monitors.jobsFiltered}
            totalCount={monitors.jobsBucket.length}
            filters={filters}
            loading={monitors.loading}
            error={monitors.error}
            showDescriptionFilters={false}
            showTopFilters
            showLanguageFilter
            title={JOBS_TITLES[monitors.jobsSubTab].title}
            emptyTitle={JOBS_TITLES[monitors.jobsSubTab].empty}
            emptyHint={JOBS_TITLES[monitors.jobsSubTab].hint}
            onStatusChange={handleStatusChange}
            onDiscardAll={handleDiscardAll}
            onLanguageChange={setLanguage}
          />
        ) : null}

        {!appSettings.setupRequired && appSettings.tab === 'monitor' ? (
          <JobList
            jobs={monitors.monitorFiltered}
            totalCount={monitors.monitorJobs.length}
            filters={monitors.activeMonitorFilters}
            loading={monitors.loading}
            error={monitors.error}
            searchProgress={searchRun.displaySearchProgress}
            fetchDescriptions={monitors.monitorDraft.fetchDescriptions}
            showDescriptionFilters={monitors.monitorDraft.fetchDescriptions}
            title={
              monitors.activeMonitor
                ? `Monitor: ${monitors.activeMonitor.search.query || monitors.activeMonitor.name}`
                : 'Monitor'
            }
            emptyTitle="Sem vagas neste monitor"
            emptyHint="Crie uma aba com +, configure a busca e clique em Buscar agora (o pooling liga sozinho)."
            onCancelSearch={searchRun.handleCancelSearch}
            onStatusChange={handleStatusChange}
          />
        ) : null}
      </div>
      </div>
    </div>
  )
}

export default App
