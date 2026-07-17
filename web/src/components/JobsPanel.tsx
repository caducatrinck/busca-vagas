import { useState } from 'react'
import { formatBadgeCount } from '../lib/notificationsModel'
import type { JobStatus } from '../lib/types'
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

const SUB_TABS: { id: JobStatus; label: string }[] = [
  { id: 'viewed', label: 'Pendentes' },
  { id: 'applied', label: 'Aplicadas' },
  { id: 'discarded', label: 'Descartadas' },
]

export function JobsPanel({
  subTab,
  counts,
  unreadTotal = 0,
  onSubTabChange,
  onRefresh,
  onClearStatus,
}: Props) {
  const [clearing, setClearing] = useState<'applied' | 'discarded' | null>(null)
  const notifBadge = formatBadgeCount(unreadTotal)

  async function handleClear(status: 'applied' | 'discarded') {
    const count = counts[status]
    if (count <= 0) return

    const label = status === 'applied' ? 'aplicadas' : 'descartadas'
    const ok = window.confirm(
      `Remover permanentemente ${count} vaga${count === 1 ? '' : 's'} ${label} do JSON local? Essa ação não pode ser desfeita.`,
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
      <p className="search-panel__lead">
        Histórico local: pendentes, aplicadas e descartadas.
      </p>

      <div className="jobs-tabs" role="tablist" aria-label="Status das vagas">
        {SUB_TABS.map((item) => {
          const isPending = item.id === 'viewed'
          const showNotif = isPending && notifBadge
          const showCount = !showNotif && counts[item.id] > 0
          return (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={subTab === item.id}
              className={`jobs-tabs__btn${subTab === item.id ? ' jobs-tabs__btn--active' : ''}`}
              onClick={() => onSubTabChange(item.id)}
            >
              {item.label}
              {showNotif ? (
                <span
                  className="jobs-tabs__alert"
                  title="Vagas novas no pooling"
                  aria-label={`${unreadTotal} notificações não lidas`}
                >
                  {notifBadge}
                </span>
              ) : showCount ? (
                <span className="jobs-tabs__count">{counts[item.id]}</span>
              ) : null}
            </button>
          )
        })}
      </div>

      <div className="jobs-clear">
        <button
          type="button"
          className="jobs-clear__btn"
          disabled={counts.applied <= 0 || clearing !== null}
          onClick={() => void handleClear('applied')}
        >
          {clearing === 'applied'
            ? 'Limpando…'
            : `Limpar aplicadas (${counts.applied})`}
        </button>
        <button
          type="button"
          className="jobs-clear__btn"
          disabled={counts.discarded <= 0 || clearing !== null}
          onClick={() => void handleClear('discarded')}
        >
          {clearing === 'discarded'
            ? 'Limpando…'
            : `Limpar descartadas (${counts.discarded})`}
        </button>
      </div>

      <button type="button" className="search-panel__refresh" onClick={onRefresh}>
        Recarregar vagas
      </button>
    </aside>
  )
}
