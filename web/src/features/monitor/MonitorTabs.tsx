import type { Monitor } from '../../lib/types'
import { useI18n } from '../../i18n'
import { tabCountdownLabel } from './formatCountdown'

type Props = {
  monitors: Monitor[]
  activeId: string | null

  searchingMonitorId?: string | null
  busy: boolean
  now: number
  onSelect: (id: string) => void
  onAdd: () => void
  onClose: (id: string) => void
}

export function MonitorTabs({
  monitors,
  activeId,
  searchingMonitorId = null,
  busy,
  now,
  onSelect,
  onAdd,
  onClose,
}: Props) {
  const { t, locale } = useI18n()

  return (
    <div className="monitor-tabs">
      {monitors.map((monitor) => {
        const running =
          monitor.ticking || monitor.id === searchingMonitorId
        const eta =
          monitor.pollingEnabled || running
            ? tabCountdownLabel(monitor.nextRunAt, now, running, locale)
            : null
        const titleBase = monitor.search.query || monitor.name
        const nowLabel = t('tab.now')
        return (
          <div
            key={monitor.id}
            className={`monitor-tabs__item${monitor.id === activeId ? ' monitor-tabs__item--active' : ''}${monitor.pollingEnabled ? ' monitor-tabs__item--pooling' : ''}${running ? ' monitor-tabs__item--running' : ''}`}
          >
            <button
              type="button"
              className="monitor-tabs__btn"
              onClick={() => onSelect(monitor.id)}
              title={
                running
                  ? t('tab.titleSearching', { name: titleBase })
                  : eta === nowLabel
                    ? t('tab.titleImminent', { name: titleBase })
                    : eta
                      ? t('tab.titleNext', { name: titleBase, eta })
                      : titleBase
              }
            >
              <span className="monitor-tabs__text">
                <span className="monitor-tabs__label">
                  {monitor.search.query?.trim() || monitor.name}
                </span>
                {running ? (
                  <span className="monitor-tabs__eta monitor-tabs__eta--spin">
                    <span className="monitor-tabs__spinner" aria-hidden="true" />
                    {t('tab.searching')}
                  </span>
                ) : eta ? (
                  <span className="monitor-tabs__eta" aria-hidden="true">
                    {eta}
                  </span>
                ) : null}
              </span>
            </button>
            <button
              type="button"
              className="monitor-tabs__close"
              title={t('tab.close')}
              aria-label={t('tab.closeAria', { name: titleBase })}
              disabled={busy}
              onClick={(e) => {
                e.stopPropagation()
                onClose(monitor.id)
              }}
            >
              ×
            </button>
          </div>
        )
      })}
      <button
        type="button"
        className="monitor-tabs__add"
        onClick={onAdd}
        disabled={busy}
        title={t('monitor.add')}
        aria-label={t('monitor.add')}
      >
        <svg
          className="monitor-tabs__add-icon"
          viewBox="0 0 12 12"
          width="12"
          height="12"
          aria-hidden
        >
          <path
            fill="currentColor"
            d="M5.25 1.5h1.5v3.75H10.5v1.5H6.75V10.5h-1.5V6.75H1.5v-1.5h3.75V1.5z"
          />
        </svg>
      </button>
    </div>
  )
}
