import { useEffect, useState } from 'react'
import type { RateLimitInfo } from '../../lib/api'
import { formatRateLimitSummary } from '../../lib/rateLimit'
import type {
  DescriptionLanguage,
  JobFilters,
  Monitor,
  SearchForm,
  WordFilterKey,
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
  loading: boolean
  searching?: boolean
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
  onDraftChange: (next: SearchForm) => void
  onLanguageChange: (value: DescriptionLanguage) => void
  onPausePooling: () => void
  onIntervalChange: (minutes: number) => void
  onRunNow: () => void
  onAddWord: (key: WordFilterKey, word: string) => void
  onRemoveWord: (key: WordFilterKey, word: string) => void
  rateLimit?: RateLimitInfo | null
}

export function PollingPanel({
  monitors,
  activeId,
  draft,
  filters,
  loading,
  searching = false,
  onSelect,
  onAdd,
  onClose,
  onDraftChange,
  onLanguageChange,
  onPausePooling,
  onIntervalChange,
  onRunNow,
  onAddWord,
  onRemoveWord,
  rateLimit = null,
}: Props) {
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
    rateLimit && searchBlocked ? formatRateLimitSummary(rateLimit, now) : null

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
        searching={searching}
        busy={busy}
        now={now}
        onSelect={onSelect}
        onAdd={onAdd}
        onClose={onClose}
      />

      {!active ? (
        <p className="search-panel__lead">
          Clique em <strong>+</strong> para criar a primeira busca.
        </p>
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
            draft={draft}
            filters={filters}
            onDraftChange={onDraftChange}
            onLanguageChange={onLanguageChange}
            onAddWord={onAddWord}
            onRemoveWord={onRemoveWord}
          />
        </>
      )}
    </aside>
  )
}
