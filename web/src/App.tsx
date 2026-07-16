import { useState } from 'react'
import { DataWarningBanner } from './components/DataWarningBanner'
import { JobList } from './components/JobList'
import { JobsPanel } from './components/JobsPanel'
import { PollingPanel } from './components/PollingPanel'
import { SettingsPanel } from './components/SettingsPanel'
import { Tabs } from './components/Tabs'
import { useAppSettings } from './hooks/useAppSettings'
import { useMonitorPolling } from './hooks/useMonitorPolling'
import { useMonitors } from './hooks/useMonitors'
import { useNotifications } from './hooks/useNotifications'
import { usePersistedFilters } from './hooks/usePersistedFilters'
import { useSearchRun } from './hooks/useSearchRun'
import { useTheme } from './hooks/useTheme'
import { ensureNotificationPermission } from './lib/notifications'
import type { AppNotification } from './lib/notificationsModel'
import {
  EMPTY_SEARCH,
  monitorToSearch,
  type AppTab,
  type JobStatus,
  type Monitor,
} from './lib/types'
import './App.css'

const JOBS_TITLES: Record<
  JobStatus,
  { title: string; empty: string; hint: string }
> = {
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

function App() {
  const { filters, setFilters, setLanguage, addWord, removeWord } =
    usePersistedFilters()
  const { theme, toggleTheme } = useTheme()
  const [tab, setTab] = useState<AppTab>('monitor')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const notifications = useNotifications()

  const monitors = useMonitors({
    filters,
    setTab,
    setError,
  })

  const settings = useAppSettings({
    tab,
    setTab,
    loadMonitors: monitors.loadMonitors,
    loadSaved: monitors.loadSaved,
    setLoading,
    setError,
    activeMonitorId: monitors.activeMonitorId,
    filters,
    setFilters,
    clearNotifications: notifications.clearNotifications,
  })

  function navigateToMonitor(monitor: Monitor | null, item: AppNotification) {
    setTab('monitor')
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

  const polling = useMonitorPolling({
    monitors: monitors.monitors,
    setupRequired: settings.setupRequired,
    tab,
    activeMonitorId: monitors.activeMonitorId,
    setMonitors: monitors.setMonitors,
    setActiveMonitorId: monitors.setActiveMonitorId,
    setMonitorDraft: monitors.setMonitorDraft,
    loadMonitorJobs: monitors.loadMonitorJobs,
    loadSaved: monitors.loadSaved,
    announceNewJobs: notifications.announceNewJobs,
    onOpenMonitor: openMonitorFromNotification,
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
    setError,
    clearPendingDraftSave: monitors.clearPendingDraftSave,
  })

  function handleSelectMonitor(id: string) {
    notifications.markMonitorRead(id)
    void monitors.handleSelectMonitor(id)
  }

  async function handleTogglePolling(enabled: boolean, intervalMinutes: number) {
    await monitors.handleTogglePolling(enabled, intervalMinutes, async () => {
      polling.seedNotified(monitors.monitors)
      await ensureNotificationPermission()
    })
  }

  const busy = loading || monitors.loading

  return (
    <div className="app-shell">
      <DataWarningBanner
        onExport={settings.handleExportData}
        onImportFile={settings.handleImportData}
      />
      <div className="app">
        <div className="app__sidebar">
          <Tabs
            tab={tab}
            jobsCount={monitors.savedJobs.length}
            statusCounts={monitors.statusCounts}
            monitors={monitors.monitors}
            notifications={notifications.notifications}
            notificationsOpen={notifications.notificationsOpen}
            unreadTotal={notifications.unreadTotal}
            setupRequired={settings.setupRequired}
            theme={theme}
            onToggleTheme={toggleTheme}
            onChange={settings.handleTabChange}
            onToggleNotifications={() =>
              notifications.setNotificationsOpen((v) => !v)
            }
            onCloseNotifications={() =>
              notifications.setNotificationsOpen(false)
            }
            onOpenNotification={openMonitorFromNotification}
            onMarkAllNotificationsRead={
              notifications.handleMarkAllNotificationsRead
            }
          />

          {!settings.setupRequired && tab === 'jobs' ? (
            <JobsPanel
              subTab={monitors.jobsSubTab}
              counts={monitors.statusCounts}
              onSubTabChange={monitors.setJobsSubTab}
              onRefresh={monitors.handleRefreshJobs}
              onClearStatus={monitors.handleClearJobsStatus}
            />
          ) : null}

          {!settings.setupRequired && tab === 'monitor' ? (
            <PollingPanel
              monitors={monitors.monitors}
              activeId={monitors.activeMonitorId}
              draft={monitors.monitorDraft}
              filters={filters}
              loading={busy}
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
          {tab === 'settings' || settings.setupRequired ? (
            <SettingsPanel
              setupRequired={settings.setupRequired}
              onSaved={(next) => {
                settings.setAppSettings(next)
                if (next.ready)
                  void monitors.loadMonitors(monitors.activeMonitorId)
              }}
            />
          ) : null}

          {!settings.setupRequired && tab === 'jobs' ? (
            <JobList
              jobs={monitors.jobsFiltered}
              totalCount={monitors.jobsBucket.length}
              filters={filters}
              loading={busy}
              error={error}
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

          {!settings.setupRequired && tab === 'monitor' ? (
            <JobList
              jobs={monitors.monitorFiltered}
              totalCount={monitors.monitorJobs.length}
              filters={filters}
              loading={busy}
              error={error}
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
