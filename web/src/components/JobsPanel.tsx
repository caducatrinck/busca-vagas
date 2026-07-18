import { useState } from 'react'
import { useI18n } from '../i18n'
import { formatBadgeCount } from '../lib/notificationsModel'
import type { JobStatus } from '../lib/types'
import { Button } from '../ui'
import './SearchPanel.css'
import './JobsPanel.css'

type Props = {
  subTab: JobStatus
  counts: Record<JobStatus, number>
  unreadTotal?: number
  onSubTabChange: (value: JobStatus) => void
  onRefresh: () => void
  onClearStatus: (status: 'applied' | 'discarded') => Promise<void>
}

const SUB_TAB_IDS: JobStatus[] = ['viewed', 'applied', 'discarded']

export function JobsPanel({
  subTab,
  counts,
  unreadTotal = 0,
  onSubTabChange,
  onRefresh,
  onClearStatus,
}: Props) {
  const { t } = useI18n()
  const [clearing, setClearing] = useState<'applied' | 'discarded' | null>(null)
  const notifBadge = formatBadgeCount(unreadTotal)

  const subTabLabel = (id: JobStatus) =>
    id === 'viewed'
      ? t('jobs.pending')
      : id === 'applied'
        ? t('jobs.applied')
        : t('jobs.discarded')

  async function handleClear(status: 'applied' | 'discarded') {
    const count = counts[status]
    if (count <= 0) return

    const label =
      status === 'applied' ? t('jobs.labelApplied') : t('jobs.labelDiscarded')
    const ok = window.confirm(
      t('jobs.clearConfirm', { n: count, label }),
    )
    if (!ok) return

    setClearing(status)
    try {
      await onClearStatus(status)
    } finally {
      setClearing(null)
    }
  }

  return (
    <aside className="search-panel search-panel--compact">
      <p className="search-panel__lead">{t('jobs.lead')}</p>

      <div className="jobs-tabs" role="tablist" aria-label={t('jobs.tabs')}>
        {SUB_TAB_IDS.map((id) => {
          const isPending = id === 'viewed'
          const showNotif = isPending && notifBadge
          const showCount = !showNotif && counts[id] > 0
          return (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={subTab === id}
              className={`jobs-tabs__btn${subTab === id ? ' jobs-tabs__btn--active' : ''}`}
              onClick={() => onSubTabChange(id)}
            >
              {subTabLabel(id)}
              {showNotif ? (
                <span
                  className="jobs-tabs__alert"
                  title={t('nav.newJobsPooling')}
                  aria-label={`${unreadTotal} notificações não lidas`}
                >
                  {notifBadge}
                </span>
              ) : showCount ? (
                <span className="jobs-tabs__count">{counts[id]}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="jobs-clear">
        <Button
          variant="ghost"
          size="sm"
          className="jobs-clear__btn"
          disabled={counts.applied <= 0 || clearing !== null}
          onClick={() => void handleClear('applied')}
        >
          {clearing === 'applied'
            ? t('jobs.clearing')
            : `${t('jobs.clearApplied')} (${counts.applied})`}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="jobs-clear__btn"
          disabled={counts.discarded <= 0 || clearing !== null}
          onClick={() => void handleClear('discarded')}
        >
          {clearing === 'discarded'
            ? t('jobs.clearing')
            : `${t('jobs.clearDiscarded')} (${counts.discarded})`}
        </Button>
      </div>

      <Button fullWidth variant="soft" onClick={onRefresh}>
        {t('jobs.refresh')}
      </Button>
    </aside>
  )
}
