import { useRef } from 'react'
import { DataWarningBanner } from './components/DataWarningBanner'
import { LinkedInSessionBanner } from './components/LinkedInSessionBanner'
import { UpdateBanner } from './components/UpdateBanner'
import { JobList } from './components/JobList'
import { JobsPanel } from './components/JobsPanel'
import { PollingPanel } from './features/monitor'
import { SettingsPanel } from './components/SettingsPanel'
import { Tabs } from './components/Tabs'
import { useAppSettings } from './hooks/useAppSettings'
import { useDesktopUpdater } from './hooks/useDesktopUpdater'
import { useLinkedInSession } from './hooks/useLinkedInSession'
import { useMonitorPolling } from './hooks/useMonitorPolling'
import { useMonitors } from './hooks/useMonitors'
import { useNotifications } from './hooks/useNotifications'
import { usePersistedFilters } from './hooks/usePersistedFilters'
import { useSearchRun } from './hooks/useSearchRun'
import { useTheme } from './hooks/useTheme'
import { useI18n } from './i18n'
import type { MessageKey } from './i18n'
import { runKey } from './lib/monitorHelpers'
import { ensureNotificationPermission } from './lib/notifications'
import type { AppNotification } from './lib/notificationsModel'
import type { JobStatus, Monitor } from './lib/types'
import './App.css'

const JOBS_COPY_KEYS: Record<
  JobStatus,
  { title: MessageKey; empty: MessageKey; hint: MessageKey }
> = {
  viewed: {
    title: 'jobsTitle.viewed',
    empty: 'jobsEmpty.viewed',
    hint: 'jobsHint.viewed',
  },
  applied: {
    title: 'jobsTitle.applied',
    empty: 'jobsEmpty.applied',
    hint: 'jobsHint.applied',
  },
  discarded: {
    title: 'jobsTitle.discarded',
    empty: 'jobsEmpty.discarded',
    hint: 'jobsHint.discarded',
  },
}

function monitorListEmptyHint(
  t: (key: MessageKey, vars?: Record<string, string | number>) => string,
  monitor: Monitor | null,
  query: string,
  rawCount: number,
  filteredCount: number,
): string {
  if (rawCount > 0 && filteredCount === 0) {
    const q = query.trim()
    return q
      ? t('monitor.emptyFilteredHint', { n: rawCount, q })
      : t('monitor.emptyFilteredHintNoQuery', { n: rawCount })
  }
  const reason = monitor?.lastRunStats?.emptyReason?.trim()
  if (reason) return reason
  return t('monitor.emptyHint')
}

function App() {
  const { t } = useI18n()
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

  const linkedInSession = useLinkedInSession(!appSettings.setupRequired)
  const desktopUpdater = useDesktopUpdater()

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

  const jobsCopy = JOBS_COPY_KEYS[monitors.jobsSubTab]

  return (
    <div className="app-shell">
      <DataWarningBanner
        onExport={appSettings.handleExportData}
        onImportFile={appSettings.handleImportData}
      />
      {linkedInSession.needsAttention && linkedInSession.session ? (
        <LinkedInSessionBanner
          session={linkedInSession.session}
          checking={linkedInSession.checking}
          onGoSettings={() => appSettings.setTab('settings')}
          onRecheck={() => {
            void linkedInSession.refresh(true)
          }}
        />
      ) : null}
      {desktopUpdater.enabled ? (
        <UpdateBanner
          state={desktopUpdater.state}
          onAccept={() => {
            void desktopUpdater.download()
          }}
          onDismiss={() => {
            void desktopUpdater.dismiss()
          }}
          onOpen={() => {
            void desktopUpdater.openDownloaded()
          }}
          onRelaunch={() => {
            void desktopUpdater.relaunch()
          }}
          onRetry={() => {
            if (desktopUpdater.state.downloadUrl) {
              void desktopUpdater.download()
            } else {
              void desktopUpdater.retryCheck()
            }
          }}
        />
      ) : null}
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
              if (next.ready) {
                void monitors.loadMonitors(monitors.activeMonitorId)
                void linkedInSession.refresh(true)
              }
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
            title={t(jobsCopy.title)}
            emptyTitle={t(jobsCopy.empty)}
            emptyHint={t(jobsCopy.hint)}
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
                ? t('monitor.title', {
                    name:
                      monitors.activeMonitor.search.query ||
                      monitors.activeMonitor.name,
                  })
                : t('nav.monitor')
            }
            emptyTitle={
              monitors.monitorJobs.length > 0 &&
              monitors.monitorFiltered.length === 0
                ? t('monitor.emptyFilteredTitle')
                : monitors.activeMonitor?.lastRunStats?.emptyReason
                  ? t('monitor.emptySearchTitle')
                  : t('monitor.emptyTitle')
            }
            emptyHint={monitorListEmptyHint(
              t,
              monitors.activeMonitor,
              monitors.monitorDraft.query,
              monitors.monitorJobs.length,
              monitors.monitorFiltered.length,
            )}
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
