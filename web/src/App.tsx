import { useRef } from 'react'
import { DataWarningBanner } from './components/DataWarningBanner'
import { JobList } from './components/JobList'
import { JobsPanel } from './components/JobsPanel'
import { PollingPanel } from './components/PollingPanel'
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
import { EMPTY_SEARCH, monitorToSearch, type Monitor } from './lib/types'
import './App.css'

function App() {
  const { filters, setFilters, setLanguage, addWord, removeWord } =
    usePersistedFilters()
  const { theme, toggleTheme } = useTheme()

  const monitors = useMonitors({ filters })
  const notifications = useNotifications()

  const appSettings = useAppSettings({
    loadMonitors: monitors.loadMonitors,
    loadSaved: monitors.loadSaved,
    setLoading: monitors.setLoading,
    setError: monitors.setError,
    activeMonitorId: monitors.activeMonitorId,
    filters,
    setFilters,
    clearNotifications: notifications.clearNotifications,
    setNotificationsOpen: notifications.setNotificationsOpen,
  })

  const activeMonitorIdRef = useRef<string | null>(null)
  activeMonitorIdRef.current = monitors.activeMonitorId

  function navigateToMonitor(monitor: Monitor | null, item: AppNotification) {
    appSettings.setTab('monitor')
    monitors.setActiveMonitorId(item.monitorId)
    monitors.setMonitorDraft(
      monitor
        ? monitorToSearch(monitor)
        : { ...EMPTY_SEARCH, query: item.monitorName },
    )
    void monitors.loadMonitorJobs(item.monitorId).catch(() => undefined)
  }

  function openMonitorFromNotification(item: AppNotification) {
    notifications.openMonitorFromNotification(
      item,
      monitors.monitors,
      navigateToMonitor,
    )
  }

  function handleAnnounceNewJobs(monitor: Monitor) {
    notifications.announceNewJobs(monitor, openMonitorFromNotification)
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
  })

  function handleSelectMonitor(id: string) {
    notifications.markMonitorRead(id)
    void monitors.handleSelectMonitor(id)
  }

  async function handleTogglePolling(enabled: boolean, intervalMinutes: number) {
    await monitors.handleTogglePolling(enabled, intervalMinutes, async () => {
      for (const m of monitors.monitors) {
        const key = runKey(m)
        if (key) notifications.notifiedRunsRef.current.add(key)
      }
      notifications.seededNotifyRef.current = true
      await ensureNotificationPermission()
    })
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
          notifications={notifications.notifications}
          notificationsOpen={notifications.notificationsOpen}
          unreadTotal={notifications.unreadTotal}
          setupRequired={appSettings.setupRequired}
          theme={theme}
          onToggleTheme={toggleTheme}
          onChange={appSettings.handleTabChange}
          onToggleNotifications={() =>
            notifications.setNotificationsOpen((v) => !v)
          }
          onCloseNotifications={() => notifications.setNotificationsOpen(false)}
          onOpenNotification={openMonitorFromNotification}
          onMarkAllNotificationsRead={notifications.handleMarkAllNotificationsRead}
        />

        {!appSettings.setupRequired && appSettings.tab === 'jobs' ? (
          <JobsPanel
            subTab={monitors.jobsSubTab}
            counts={monitors.statusCounts}
            onSubTabChange={monitors.setJobsSubTab}
            onRefresh={monitors.handleRefreshJobs}
            onClearStatus={monitors.handleClearJobsStatus}
          />
        ) : null}

        {!appSettings.setupRequired && appSettings.tab === 'monitor' ? (
          <PollingPanel
            monitors={monitors.monitors}
            activeId={monitors.activeMonitorId}
            draft={monitors.monitorDraft}
            filters={filters}
            loading={monitors.loading}
            searching={Boolean(searchRun.displaySearchProgress)}
            unreadByMonitor={notifications.unreadMap}
            onSelect={handleSelectMonitor}
            onAdd={monitors.handleAddMonitor}
            onClose={monitors.handleCloseMonitor}
            onDraftChange={monitors.handleMonitorDraftChange}
            onLanguageChange={setLanguage}
            onTogglePolling={handleTogglePolling}
            onIntervalChange={monitors.handleIntervalChange}
            onRunNow={searchRun.handleRunMonitorNow}
            onAddWord={addWord}
            onRemoveWord={removeWord}
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
            onStatusChange={monitors.handleStatusChange}
            onDiscardAll={monitors.handleDiscardAll}
            onLanguageChange={setLanguage}
          />
        ) : null}

        {!appSettings.setupRequired && appSettings.tab === 'monitor' ? (
          <JobList
            jobs={monitors.monitorFiltered}
            totalCount={monitors.monitorJobs.length}
            filters={filters}
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
            emptyHint="Crie uma aba com +, configure a busca e marque pooling ou clique em Buscar agora."
            onCancelSearch={searchRun.handleCancelSearch}
            onStatusChange={monitors.handleStatusChange}
          />
        ) : null}
      </div>
      </div>
    </div>
  )
}

export default App
