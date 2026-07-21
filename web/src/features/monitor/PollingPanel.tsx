import { useEffect, useState } from 'react'
import type { RateLimitInfo } from '../../lib/api'
import { useI18n } from '../../i18n'
import { formatRateLimitSummary } from '../../lib/rateLimit'
import type {
  AppTag,
  DescriptionLanguage,
  JobFilters,
  Monitor,
  SearchForm,
} from '../../lib/types'
import '../../components/SearchPanel.css'
import '../../components/PollingPanel.css'
import { clampIntervalMinutes, isCooldownErrorMessage } from './constants'
import { MonitorDescriptionSection } from './MonitorDescriptionSection'
import { MonitorPollInterval } from './MonitorPollInterval'
import { MonitorSearchForm } from './MonitorSearchForm'
import { MonitorTabs } from './MonitorTabs'

type Props = {
  monitors: Monitor[]
  activeId: string | null
  draft: SearchForm
  filters: JobFilters
  catalogTags: AppTag[]
  loading: boolean
  searching?: boolean
  searchingMonitorId?: string | null
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onDraftChange: (next: SearchForm) => void
  onLanguageChange: (value: DescriptionLanguage) => void
  onTagsChange: (ids: string[]) => void
  onExcludedTagsChange: (ids: string[]) => void
  onCreateTag: (label: string) => Promise<AppTag>
  onDeleteTag?: (id: string) => Promise<void>
  onPausePooling: () => void
  onIntervalChange: (minutes: number) => void
  onRunNow: () => void
  rateLimit?: RateLimitInfo | null
}

export function PollingPanel({
  monitors,
  activeId,
  draft,
  filters,
  catalogTags,
  loading,
  searching = false,
  searchingMonitorId = null,
  onSelect,
  onAdd,
  onClose,
  onDraftChange,
  onLanguageChange,
  onTagsChange,
  onExcludedTagsChange,
  onCreateTag,
  onDeleteTag,
  onPausePooling,
  onIntervalChange,
  onRunNow,
  rateLimit = null,
}: Props) {
  const { t, locale } = useI18n()
  const busy = loading || searching
  const searchBlocked = rateLimit != null && !rateLimit.allowed
  const active = monitors.find((m) => m.id === activeId) ?? null
  const activeIntervalMinutes = active?.intervalMinutes
  const [intervalDraft, setIntervalDraft] = useState(
    () => activeIntervalMinutes ?? 20,
  )
  const [now, setNow] = useState(() => Date.now())
  const anyPolling = monitors.some((m) => m.pollingEnabled)
  const rateLimitMsg =
    rateLimit && searchBlocked
      ? formatRateLimitSummary(rateLimit, now, locale)
      : null

  useEffect(() => {
    if (activeIntervalMinutes != null) setIntervalDraft(activeIntervalMinutes)
  }, [activeId, activeIntervalMinutes])

  useEffect(() => {
    if (!anyPolling && !searchBlocked) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [anyPolling, searchBlocked])

  function commitInterval(raw: number) {
    const safe = clampIntervalMinutes(raw)
    setIntervalDraft(safe)
    if (active && safe !== active.intervalMinutes) {
      onIntervalChange(safe)
    }
  }

  return (
    <aside className="search-panel search-panel--compact">
      <MonitorTabs
        monitors={monitors}
        activeId={activeId}
        searchingMonitorId={searchingMonitorId}
        busy={busy}
        now={now}
        onSelect={onSelect}
        onAdd={onAdd}
        onClose={onClose}
      />

      {!active ? (
        <p className="search-panel__lead">{t('monitor.emptyHint')}</p>
      ) : (
        <>
          <MonitorPollInterval
            value={intervalDraft}
            busy={busy}
            lastError={active.lastError}
            hideError={
              !!active.lastError && isCooldownErrorMessage(active.lastError)
            }
            onCommit={commitInterval}
          />

          <MonitorSearchForm
            draft={draft}
            active={active}
            now={now}
            searching={searching}
            searchBlocked={searchBlocked}
            rateLimitMsg={rateLimitMsg}
            onDraftChange={onDraftChange}
            onPausePooling={onPausePooling}
            onRunNow={onRunNow}
          />

          <MonitorDescriptionSection
            filters={filters}
            catalog={catalogTags}
            onLanguageChange={onLanguageChange}
            onTagsChange={onTagsChange}
            onExcludedTagsChange={onExcludedTagsChange}
            onCreateTag={onCreateTag}
            onDeleteTag={onDeleteTag}
          />
        </>
      )}
    </aside>
  )
}
